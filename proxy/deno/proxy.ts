/**
 * Grist Form Proxy - Deno Deploy
 * Reçoit les soumissions de formulaires publics et les écrit dans Grist via API REST.
 *
 * Deploy: console.deno.com (nouvelle console) — « New app », dépôt GitHub, entrypoint
 *         proxy/deno/proxy.ts. dash.deno.com est l'ancienne console (Deploy Classic).
 * Local:  deno run --allow-net --allow-env proxy.ts
 *
 * Env vars (Deno Deploy dashboard):
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

const rateLimitMap = new Map<string, { count: number; start: number }>();

function checkRateLimit(ip: string, max: number, windowMs: number): boolean {
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

function originAllowed(origin: string, patterns: string[]): boolean {
  return patterns.some(p => {
    if (p === '*') return true;
    if (p.startsWith('*.')) return origin.endsWith(p.slice(1));
    return origin === p;
  });
}

function json(data: unknown, status: number, origin: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  // L'origine est renvoyée même sur un refus : le corps ne dit alors que
  // « origine refusée », ce qui ne divulgue rien et rend la panne lisible.
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}

// La plateforme impose le port par la variable PORT. Quand elle ne la fournit pas — un
// `deno run` local, ou Deploy Classic qui ignore l'option — on laisse Deno choisir son défaut
// plutôt que d'imposer 8080, qu'aucun hébergeur ne sonde.
const portEnv = Number(Deno.env.get('PORT'));
const serveOpts = Number.isFinite(portEnv) && portEnv > 0 ? { port: portEnv } : {};

Deno.serve(serveOpts, async (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  const patterns = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim()).filter(Boolean);

  // Préflight : toujours accepté, il n'accorde aucun accès par lui-même.
  if (req.method === 'OPTIONS') {
    const headers: Record<string, string> = {
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

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const maxReq = parseInt(Deno.env.get('RATE_LIMIT_MAX') || '30');
  const windowMs = parseInt(Deno.env.get('RATE_LIMIT_WINDOW_MS') || '60000');
  if (!checkRateLimit(ip, maxReq, windowMs)) {
    return json({ error: 'Trop de soumissions. Réessayez dans une minute.' }, 429, origin);
  }

  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405, origin);

  let body: { docId?: string; tableId?: string; record?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corps de requête invalide (JSON attendu).' }, 400, origin);
  }

  const { docId, tableId, record } = body;
  if (!docId || !tableId || !record || typeof record !== 'object') {
    return json({ error: 'Paramètres manquants : docId, tableId, record requis.' }, 400, origin);
  }

  const gristUrl = (Deno.env.get('GRIST_URL') || '').replace(/\/$/, '');
  const apiKey = Deno.env.get('GRIST_API_KEY') || '';
  if (!gristUrl || !apiKey) {
    return json({ error: 'Proxy non configuré (GRIST_URL ou GRIST_API_KEY manquant).' }, 500, origin);
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
      return json({ error: (errData as { error?: string }).error || `Grist API erreur ${res.status}` }, res.status, origin);
    }

    const data = await res.json() as { records?: { id?: number }[] };
    return json({ success: true, id: data.records?.[0]?.id || null }, 200, origin);
  } catch (err) {
    return json({ error: 'Erreur de connexion à Grist : ' + (err as Error).message }, 500, origin);
  }
});
