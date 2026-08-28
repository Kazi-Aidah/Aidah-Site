// functions/api/get-requests.js
// Public endpoint: returns all tutorial requests from Cloudflare KV.
// Replaces the direct client-side Supabase read. KV never pauses for
// inactivity, so the page always loads and auto-refresh always works.

const KV_KEY = 'requests';

async function readAll(kv) {
  const raw = await kv.get(KV_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet(context) {
  const kv = context.env.TUTORIAL_KV;
  if (!kv) {
    return json({ error: 'KV binding TUTORIAL_KV is not configured.' }, 500);
  }

  let items = await readAll(kv);

  // Never expose requester emails publicly — strip them from the response.
  items = items.map(({ email, ...rest }) => rest);

  // Newest first — keeps the page's ordering stable.
  items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return json(items);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
