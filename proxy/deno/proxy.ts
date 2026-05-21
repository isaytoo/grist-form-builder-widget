/**
 * Grist Form Proxy - Deno Deploy
 * Reçoit les soumissions de formulaires publics et les écrit dans Grist via API REST.
 *
 * Deploy: push to GitHub + connect on dash.deno.com
 * Local:  deno run --allow-net --allow-env proxy.ts
 *
 * Env vars (Deno Deploy dashboard):
 *   GRIST_URL       - URL de l'instance Grist
 *   GRIST_API_KEY   - Clé API Grist
 *   ALLOWED_ORIGINS - Origins autorisées (séparées par virgule)
 */

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
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  return new Response(JSON.stringify(data), { status, headers });
}

Deno.serve({ port: parseInt(Deno.env.get('PORT') || '8080') }, async (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  const patterns = (Deno.env.get('ALLOWED_ORIGINS') || '*').split(',').map(o => o.trim()).filter(Boolean);
  const allowed = originAllowed(origin, patterns);

  if (req.method === 'OPTIONS') {
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

  if (!allowed) return json({ error: 'Origin non autorisée.' }, 403, '');

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
