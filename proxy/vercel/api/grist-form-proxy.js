/**
 * Grist Form Proxy - Vercel Serverless Function
 * Reçoit les soumissions de formulaires publics et les écrit dans Grist via API REST.
 *
 * Deploy: npx vercel --prod (depuis le dossier proxy/vercel)
 * Endpoint: /api/grist-form-proxy
 *
 * Env vars (Vercel dashboard → Settings → Environment Variables):
 *   GRIST_URL       - URL de l'instance Grist
 *   GRIST_API_KEY   - Clé API Grist
 *   ALLOWED_ORIGINS - Origins autorisées (séparées par virgule)
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

const rateLimitMap = new Map();

function checkRateLimit(ip, max, windowMs) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) { entry.count = 1; entry.start = now; }
  else entry.count++;
  rateLimitMap.set(ip, entry);
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap) { if (now - v.start > windowMs) rateLimitMap.delete(k); }
  }
  return entry.count <= max;
}

function originAllowed(origin, patterns) {
  return patterns.some(p => {
    if (p === '*') return true;
    if (p.startsWith('*.')) return origin.endsWith(p.slice(1));
    return origin === p;
  });
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const patterns = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);

  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  // Préflight : toujours accepté, il n'accorde aucun accès par lui-même.
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  if (patterns.length === 0) {
    return res.status(500).json({ error: 'Proxy non configuré (ALLOWED_ORIGINS manquant).' });
  }

  if (!originAllowed(origin, patterns)) {
    return res.status(403).json({ error: 'Origin non autorisée.' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const maxReq = parseInt(process.env.RATE_LIMIT_MAX || '30');
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');
  if (!checkRateLimit(ip, maxReq, windowMs)) {
    return res.status(429).json({ error: 'Trop de soumissions. Réessayez dans une minute.' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const { docId, tableId, record } = req.body || {};
  if (!docId || !tableId || !record || typeof record !== 'object') {
    return res.status(400).json({ error: 'Paramètres manquants : docId, tableId, record requis.' });
  }

  const gristUrl = (process.env.GRIST_URL || '').replace(/\/$/, '');
  const apiKey = process.env.GRIST_API_KEY;
  if (!gristUrl || !apiKey) {
    return res.status(500).json({ error: 'Proxy non configuré (GRIST_URL ou GRIST_API_KEY manquant).' });
  }

  try {
    const url = `${gristUrl}/api/docs/${docId}/tables/${tableId}/records`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields: record }] }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: errData.error || `Grist API erreur ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, id: data.records?.[0]?.id || null });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur de connexion à Grist : ' + err.message });
  }
}
