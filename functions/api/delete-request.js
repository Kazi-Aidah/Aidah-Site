// functions/api/delete-request.js
// Admin-only: removes a single request from KV by id.
//
// Cloudflare Pages settings required:
//   • KV binding named TUTORIAL_KV
//   • Env var ADMIN_PASSWORD

const KV_KEY = 'requests';

async function readAll(kv) {
  const raw = await kv.get(KV_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function writeAll(kv, arr) {
  await kv.put(KV_KEY, JSON.stringify(arr));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestPost(context) {
  const { ADMIN_PASSWORD, TUTORIAL_KV } = context.env;

  const provided = context.request.headers.get('x-admin-password');
  if (!provided || provided !== ADMIN_PASSWORD) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!TUTORIAL_KV) {
    return json({ error: 'KV binding TUTORIAL_KV is not configured.' }, 500);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { id } = body;
  if (!id) {
    return json({ error: 'Missing required field: id' }, 400);
  }

  const items = await readAll(TUTORIAL_KV);
  const next = items.filter(r => r.id !== id);

  if (next.length === items.length) {
    return json({ error: 'Request not found' }, 404);
  }

  await writeAll(TUTORIAL_KV, next);

  return json({ ok: true, count: next.length }, 200);
}
