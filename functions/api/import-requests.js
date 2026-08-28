// functions/api/import-requests.js
// Admin-only restore/merge endpoint. Accepts a JSON array of requests and
// writes them into KV. Used by:
//   • migrate-from-supabase.mjs (one-time move of existing Supabase data)
//   • import-requests.mjs (Tally CSV → KV)
//   • manual backups: POST a backup.json produced by /api/export-requests
//
// Body: { "mode": "replace" | "merge", "items": [ {id,title,...}, ... ] }
//   replace — overwrite the whole store with `items`
//   merge   — upsert by id (existing ids are updated, new ids appended)

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

const REQUIRED_FIELDS = ['id', 'title'];

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

  const { mode = 'merge', items } = body;
  if (!Array.isArray(items)) {
    return json({ error: 'Body must include "items" as an array.' }, 400);
  }
  if (mode !== 'replace' && mode !== 'merge') {
    return json({ error: 'mode must be "replace" or "merge".' }, 400);
  }

  for (const [i, it] of items.entries()) {
    if (!it || typeof it !== 'object') {
      return json({ error: `items[${i}] is not an object.` }, 400);
    }
    for (const f of REQUIRED_FIELDS) {
      if (it[f] === undefined || it[f] === null) {
        return json({ error: `items[${i}] missing required field "${f}".` }, 400);
      }
    }
  }

  let current = await readAll(TUTORIAL_KV);

  if (mode === 'replace') {
    current = items;
  } else {
    const map = new Map(current.map(r => [r.id, r]));
    for (const it of items) map.set(it.id, it);
    current = [...map.values()];
  }

  await writeAll(TUTORIAL_KV, current);

  return json({ ok: true, count: current.length }, 200);
}
