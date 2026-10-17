// grist-form-proxy — Cloudflare Worker
// Reçoit les soumissions de formulaires publics et les écrit dans Grist via API REST.
// Secrets : GRIST_API_KEY (clé API Grist avec accès d'écriture au document)

// ─── Politique d'origines commune aux six proxys ──────────────────────────
// 1. ALLOWED_ORIGINS est obligatoire. Absente ou vide, le proxy refuse tout
//    avec un 500 qui la nomme : aucun défaut implicite, ni « * » ni « rien ».
//    Un défaut « * » ferait de ce proxy un relais ouvert vers votre document
//    Grist avec votre clé API.
// 2. « * » reste possible, mais doit être écrit explicitement.
// 3. Le préflight OPTIONS répond toujours 204 avec les en-têtes CORS, même
//    pour une origine refusée : il n'accorde rien, et c'est lui qui permet au
//    navigateur de lire la vraie réponse au lieu d'une erreur réseau opaque.
// 4. Toute réponse, refus compris, porte Access-Control-Allow-Origin et
//    Vary: Origin. Un refus d'origine devient ainsi lisible et diagnosticable.
// 5. Les messages d'erreur sont identiques mot pour mot dans les six proxys,
//    pour que le bouton « Tester » du widget les classe de la même façon.
// ──────────────────────────────────────────────────────────────────────────

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
  const headers = { 'Content-Type': 'application/json', 'Vary': 'Origin' };
  // L'origine est renvoyée même sur un refus : le corps ne dit alors que
  // « origine refusée », ce qui ne divulgue rien et rend la panne lisible.
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}

export default {
  async fetch(request, env) {
    const origin   = request.headers.get('Origin') || '';
    const patterns = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);

    // Préflight : toujours accepté, il n'accorde aucun accès par lui-même.
    if (request.method === 'OPTIONS') {
      const headers = {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      };
      if (origin) headers['Access-Control-Allow-Origin'] = origin;
      return new Response(null, { status: 204, headers });
    }

    if (patterns.length === 0) {
      return json({ error: 'Proxy non configuré (ALLOWED_ORIGINS manquant).' }, 500, origin);
    }

    if (!originAllowed(origin, patterns)) {
      return json({ error: 'Origin non autorisée.' }, 403, origin);
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
