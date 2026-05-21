/**
 * Grist Form Proxy - Netlify Function
 * Reçoit les soumissions de formulaires publics et les écrit dans Grist via API REST.
 *
 * Deploy: netlify deploy --prod (depuis le dossier proxy/netlify)
 * Endpoint: /.netlify/functions/grist-form-proxy
 *
 * Env vars (Netlify dashboard → Site Settings → Environment Variables):
 *   GRIST_URL       - URL de l'instance Grist (ex: https://docs.getgrist.com)
 *   GRIST_API_KEY   - Clé API Grist avec droit d'écriture
 *   ALLOWED_ORIGINS - Origins autorisées, séparées par virgule (ex: *.github.io,*.gristup.fr)
 *   RATE_LIMIT_MAX  - Max soumissions par IP par fenêtre (défaut: 30)
 *   RATE_LIMIT_WINDOW_MS - Fenêtre en ms (défaut: 60000)
 */

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

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const patterns = (process.env.ALLOWED_ORIGINS || '*').split(',').map(o => o.trim()).filter(Boolean);
  const allowed = originAllowed(origin, patterns);

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    if (!allowed) return { statusCode: 403, headers: corsHeaders, body: '' };
    return { statusCode: 204, headers: { ...corsHeaders, 'Access-Control-Max-Age': '86400' }, body: '' };
  }

  if (!allowed) {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Origin non autorisée.' }) };
  }

  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
  const maxReq = parseInt(process.env.RATE_LIMIT_MAX || '30');
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');
  if (!checkRateLimit(ip, maxReq, windowMs)) {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: 'Trop de soumissions. Réessayez dans une minute.' }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Méthode non autorisée.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Corps de requête invalide (JSON attendu).' }) };
  }

  const { docId, tableId, record } = body;
  if (!docId || !tableId || !record || typeof record !== 'object') {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Paramètres manquants : docId, tableId, record requis.' }) };
  }

  const gristUrl = (process.env.GRIST_URL || '').replace(/\/$/, '');
  const apiKey = process.env.GRIST_API_KEY;
  if (!gristUrl || !apiKey) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Proxy non configuré (GRIST_URL ou GRIST_API_KEY manquant).' }) };
  }

  try {
    const url = `${gristUrl}/api/docs/${docId}/tables/${tableId}/records`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields: record }] }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { statusCode: res.status, headers: corsHeaders, body: JSON.stringify({ error: errData.error || `Grist API erreur ${res.status}` }) };
    }

    const data = await res.json();
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, id: data.records?.[0]?.id || null }) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Erreur de connexion à Grist : ' + err.message }) };
  }
};
