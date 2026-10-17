/**
 * Grist Form Proxy - Node.js (self-hosted)
 * Reçoit les soumissions de formulaires publics et les écrit dans Grist via API REST.
 *
 * Usage:
 *   GRIST_URL=https://docs.getgrist.com GRIST_API_KEY=xxx \
 *   ALLOWED_ORIGINS=https://mon-site.fr node server.js
 *   PORT=8080 node server.js
 *
 * Production:
 *   pm2 start server.js --name grist-form-proxy
 */

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

const http = require('http');

const PORT = parseInt(process.env.PORT || '8080');
const GRIST_URL = (process.env.GRIST_URL || '').replace(/\/$/, '');
const GRIST_API_KEY = process.env.GRIST_API_KEY || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '30');
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');

const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_LIMIT_WINDOW_MS) { entry.count = 1; entry.start = now; }
  else entry.count++;
  rateLimitMap.set(ip, entry);
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap) { if (now - v.start > RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(k); }
  }
  return entry.count <= RATE_LIMIT_MAX;
}

function originAllowed(origin) {
  return ALLOWED_ORIGINS.some(p => {
    if (p === '*') return true;
    if (p.startsWith('*.')) return origin.endsWith(p.slice(1));
    return origin === p;
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e6) reject(new Error('Too large')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';

  const setCors = () => {
    // L'origine est renvoyée même sur un refus : le corps ne dit alors que
    // « origine refusée », ce qui ne divulgue rien et rend la panne lisible.
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  };

  const json = (status, data) => {
    setCors();
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  setCors();

  // Préflight : toujours accepté, il n'accorde aucun accès par lui-même.
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Max-Age', '86400');
    res.writeHead(204);
    return res.end();
  }

  if (ALLOWED_ORIGINS.length === 0) {
    return json(500, { error: 'Proxy non configuré (ALLOWED_ORIGINS manquant).' });
  }

  if (!originAllowed(origin)) return json(403, { error: 'Origin non autorisée.' });

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!checkRateLimit(ip)) return json(429, { error: 'Trop de soumissions. Réessayez dans une minute.' });

  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' });

  let body;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Corps de requête invalide (JSON attendu).' });
  }

  const { docId, tableId, record } = body;
  if (!docId || !tableId || !record || typeof record !== 'object') {
    return json(400, { error: 'Paramètres manquants : docId, tableId, record requis.' });
  }

  if (!GRIST_URL || !GRIST_API_KEY) {
    return json(500, { error: 'Proxy non configuré (GRIST_URL ou GRIST_API_KEY manquant).' });
  }

  try {
    const url = `${GRIST_URL}/api/docs/${docId}/tables/${tableId}/records`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GRIST_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields: record }] }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return json(response.status, { error: errData.error || `Grist API erreur ${response.status}` });
    }

    const data = await response.json();
    return json(200, { success: true, id: data.records?.[0]?.id || null });
  } catch (err) {
    return json(500, { error: 'Erreur de connexion à Grist : ' + err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Grist Form Proxy démarré sur http://localhost:${PORT}`);
  if (!GRIST_URL) console.warn('⚠️  GRIST_URL non défini');
  if (!GRIST_API_KEY) console.warn('⚠️  GRIST_API_KEY non défini');
  if (ALLOWED_ORIGINS.length === 0) console.warn('⚠️  ALLOWED_ORIGINS non défini — toutes les requêtes seront refusées');
});
