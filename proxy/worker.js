// grist-form-proxy — Cloudflare Worker
// Reçoit les soumissions de formulaires publics et les écrit dans Grist via API REST.
// Secrets : GRIST_API_KEY (clé API Grist avec accès d'écriture au document)

const rateLimitMap = new Map();

function checkRateLimit(ip, maxRequests, windowMs) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };

  if (now - entry.start > windowMs) {
    entry.count = 1;
    entry.start = now;
  } else {
    entry.count++;
  }
  rateLimitMap.set(ip, entry);

  if (rateLimitMap.size > 1000) {
    for (const [key, val] of rateLimitMap) {
      if (now - val.start > windowMs) rateLimitMap.delete(key);
    }
  }

  return entry.count <= maxRequests;
}

function originAllowed(origin, patterns) {
  return patterns.some(p => {
    if (p === '*') return true;
    if (p.startsWith('*.')) return origin.endsWith(p.slice(1));
    return origin === p;
  });
}

function json(data, status, origin) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}

export default {
  async fetch(request, env) {
    const origin   = request.headers.get('Origin') || '';
    const patterns = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
    const allowed  = originAllowed(origin, patterns);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      if (!allowed) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (!allowed) {
      return json({ error: 'Origin non autorisée.' }, 403, '');
    }

    // Rate limiting par IP
    const ip       = request.headers.get('CF-Connecting-IP') || 'unknown';
    const maxReq   = parseInt(env.RATE_LIMIT_MAX || '30');
    const windowMs = parseInt(env.RATE_LIMIT_WINDOW_MS || '60000');
    if (!checkRateLimit(ip, maxReq, windowMs)) {
      return json({ error: 'Trop de soumissions. Réessayez dans une minute.' }, 429, origin);
    }

    if (request.method !== 'POST') {
      return json({ error: 'Méthode non autorisée.' }, 405, origin);
    }

    // Lire le body JSON
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Corps de requête invalide (JSON attendu).' }, 400, origin);
    }

    const { docId, tableId, record } = body;

    if (!docId || !tableId || !record || typeof record !== 'object') {
      return json({ error: 'Paramètres manquants : docId, tableId, record requis.' }, 400, origin);
    }

    // Vérifier que la clé API et l'URL Grist sont configurées
    const gristUrl = (env.GRIST_URL || '').replace(/\/$/, '');
    const apiKey   = env.GRIST_API_KEY;

    if (!gristUrl || !apiKey) {
      return json({ error: 'Proxy non configuré (GRIST_URL ou GRIST_API_KEY manquant).' }, 500, origin);
    }

    // Écrire dans Grist via API REST
    try {
      const url = `${gristUrl}/api/docs/${docId}/tables/${tableId}/records`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [{ fields: record }]
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error || `Grist API erreur ${res.status}`;
        return json({ error: msg }, res.status, origin);
      }

      const data = await res.json();
      return json({ success: true, id: data.records?.[0]?.id || null }, 200, origin);

    } catch (err) {
      return json({ error: 'Erreur de connexion à Grist : ' + err.message }, 500, origin);
    }
  },
};
