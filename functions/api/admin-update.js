// functions/api/admin-update.js
// Handles authenticated admin updates to tutorial_requests.
// The browser sends the admin password in a header — this function
// validates it server-side before writing to Supabase with the service key.
//
// Cloudflare Pages environment variables required (set in Pages dashboard):
//   ADMIN_PASSWORD   — the password you choose (never exposed to the browser)
//   SUPABASE_URL     — https://wbvauewrkouaexcaqbyu.supabase.co
//   SUPABASE_SERVICE_KEY — your Supabase service role key (sb_secret_...)
//                          this has full DB access so keep it server-side only

export async function onRequestPost(context) {
  const { ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_KEY } = context.env;

  // ── 1. Validate admin password ───────────────────────────────────────────
  const providedPassword = context.request.headers.get('x-admin-password');
  if (!providedPassword || providedPassword !== ADMIN_PASSWORD) {
    return json({ error: 'Unauthorized' }, 401);
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

  // ── 3. Validate allowed fields (never let the browser overwrite anything else) ──
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

  // ── 4. Write to Supabase using service key (server-side only) ───────────
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tutorial_requests?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(patch),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('Supabase update error:', err);
    return json({ error: 'Database update failed' }, 500);
  }

  return json({ ok: true }, 200);
}

export async function onRequestGet(context) {
  // Verify endpoint: send password, get back whether it's valid.
  // Used by the browser to test the password before showing admin UI.
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
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  };
}
