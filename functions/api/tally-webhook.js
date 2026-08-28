// functions/api/tally-webhook.js
// Receives POST requests from Tally webhooks and inserts into Cloudflare KV.
//
// Cloudflare Pages settings required:
//   • KV binding named TUTORIAL_KV (Settings ▸ Functions ▸ KV namespace bindings)
//   • Env var TALLY_SECRET (any string; paste the same value into Tally's
//     webhook secret field). Leave it unset to skip signature verification.
//
// Unlike the old Supabase version, KV never pauses for inactivity, so the
// endpoint responds quickly and Tally won't report "didn't respond".

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
  try {
    const { TUTORIAL_KV, TALLY_SECRET } = context.env;

    if (!TUTORIAL_KV) {
      return json({ error: 'KV binding TUTORIAL_KV is not configured.' }, 500);
    }

    // -----------------------------------------------------------------------
    // 1. Verify Tally webhook signature (optional but recommended)
    // -----------------------------------------------------------------------
    if (TALLY_SECRET) {
      const signature = context.request.headers.get('x-tally-signature');
      const body      = await context.request.clone().text();
      const valid     = await verifySignature(body, signature, TALLY_SECRET);
      if (!valid) {
        return json({ error: 'Invalid signature' }, 401);
      }
    }

    // -----------------------------------------------------------------------
    // 2. Parse Tally payload
    // -----------------------------------------------------------------------
    const payload = await context.request.json();

    if (payload.eventType !== 'FORM_RESPONSE') {
      return json({ ok: true, skipped: true }, 200);
    }

    const fields = payload.data?.fields ?? [];

    const title       = getFieldValue(fields, 'title') ?? getFieldValue(fields, 'tutorial title') ?? '(no title)';
    const description = getFieldValue(fields, 'description') ?? getFieldValue(fields, 'details') ?? null;

    const attachmentField = fields.find(f =>
      f.type === 'FILE_UPLOAD' ||
      f.label?.toLowerCase().includes('attachment') ||
      f.label?.toLowerCase().includes('file')
    );
    const attachments = attachmentField?.value
      ? attachmentField.value.map(f => ({ name: f.name, url: f.url }))
      : null;

    const items = await readAll(TUTORIAL_KV);
    const record = {
      id:         crypto.randomUUID(),
      created_at: new Date().toISOString(),
      title,
      description,
      ...(attachments ? { attachments } : {}),
      status:     'pending',
      color:      'slate',
      notes:      null,
    };
    items.push(record);
    await writeAll(TUTORIAL_KV, items);

    return json({ ok: true, id: record.id }, 200);
  } catch (err) {
    console.error('Webhook error:', err);
    return json({ error: 'Internal server error', message: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-tally-signature',
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getFieldValue(fields, labelSubstring) {
  const field = fields.find(f =>
    f.label?.toLowerCase().includes(labelSubstring.toLowerCase())
  );
  if (!field) return undefined;
  if (Array.isArray(field.value)) return field.value.join(', ') || null;
  return field.value != null ? String(field.value) : null;
}

async function verifySignature(body, signatureHeader, secret) {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = signatureHeader.slice(7);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return hex === expected;
}
