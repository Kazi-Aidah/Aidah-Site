// functions/api/export-requests.js
// Admin-only backup endpoint. Dumps every request from KV as JSON so you can
// save a copy. Combine with /api/import-requests to restore later.
//
// Usage:  curl -H "x-admin-password: <pw>" https://<site>/api/export-requests > backup.json

const KV_KEY = 'requests';

async function readAll(kv) {
  const raw = await kv.get(KV_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet(context) {
  const { ADMIN_PASSWORD, TUTORIAL_KV } = context.env;

  const provided = context.request.headers.get('x-admin-password');
  if (!provided || provided !== ADMIN_PASSWORD) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!TUTORIAL_KV) {
    return json({ error: 'KV binding TUTORIAL_KV is not configured.' }, 500);
  }

  const items = await readAll(TUTORIAL_KV);
  // Pretty-printed so the backup file is human-readable and diff-friendly.
  return new Response(JSON.stringify(items, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="tutorial-requests-backup.json"',
    },
  });
}
