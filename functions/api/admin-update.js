// functions/api/admin-update.js
// Handles authenticated admin updates to tutorial requests stored in KV.
//
// Cloudflare Pages settings required:
//   • KV binding named TUTORIAL_KV
//   • Env var ADMIN_PASSWORD — never exposed to the browser

const KV_KEY = 'requests';

async function readAll(kv) {
  const raw = await kv.get(KV_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function writeAll(kv, arr) {
  await kv.put(KV_KEY, JSON.stringify(arr));
}

export async function onRequestPost(context) {
  const { ADMIN_PASSWORD, TUTORIAL_KV } = context.env;

  // ── 1. Validate admin password ───────────────────────────────────────────
  const providedPassword = context.request.headers.get('x-admin-password');
  if (!providedPassword || providedPassword !== ADMIN_PASSWORD) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!TUTORIAL_KV) {
    return json({ error: 'KV binding TUTORIAL_KV is not configured.' }, 500);
  }

  // ── 2. Parse request body ────────────────────────────────────────────────
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { id, status, color, notes } = body;

  if (!id) {
    return json({ error: 'Missing required field: id' }, 400);
  }

  // ── 3. Validate allowed fields ───────────────────────────────────────────
  const patch = {};
  if (status !== undefined) {
    const ALLOWED_STATUSES = ['pending', 'accepted', 'in progress', 'done', 'declined'];
    if (!ALLOWED_STATUSES.includes(status)) {
      return json({ error: `Invalid status: ${status}` }, 400);
    }
    patch.status = status;
  }
  if (color !== undefined) {
    const ALLOWED_COLORS = ['slate', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey'];
    if (!ALLOWED_COLORS.includes(color)) {
      return json({ error: `Invalid color: ${color}` }, 400);
    }
    patch.color = color;
  }
  if (notes !== undefined) {
    if (typeof notes !== 'string' || notes.length > 5000) {
      return json({ error: 'Notes must be a string under 5000 chars' }, 400);
    }
    patch.notes = notes;
  }

  if (Object.keys(patch).length === 0) {
    return json({ error: 'No valid fields to update' }, 400);
  }

  // ── 4. Read-modify-write in KV ────────────────────────────────────────────
  const items = await readAll(TUTORIAL_KV);
  const idx = items.findIndex(r => r.id === id);
  if (idx === -1) {
    return json({ error: 'Request not found' }, 404);
  }

  items[idx] = { ...items[idx], ...patch };
  await writeAll(TUTORIAL_KV, items);

  return json({ ok: true }, 200);
}

export async function onRequestGet(context) {
  const { ADMIN_PASSWORD } = context.env;
  const provided = context.request.headers.get('x-admin-password');
  if (!provided || provided !== ADMIN_PASSWORD) {
    return json({ ok: false }, 401);
  }
  return json({ ok: true }, 200);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  };
}
