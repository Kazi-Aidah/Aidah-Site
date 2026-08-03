// functions/api/tally-webhook.js
// Receives POST requests from Tally webhooks and inserts into Supabase.
//
// Cloudflare Pages environment variables to set in your Pages dashboard:
//   SUPABASE_URL      — https://wbvauewrkouaexcaqbyu.supabase.co
//   SUPABASE_KEY      — your anon public key
//   TALLY_SECRET      — any string you choose; paste the same one into Tally's webhook secret field

export async function onRequestPost(context) {
  try {
    const { SUPABASE_URL, SUPABASE_KEY, TALLY_SECRET } = context.env;

    // -----------------------------------------------------------------------
    // 1. Verify Tally webhook signature (optional but recommended)
    //    Tally sends X-Tally-Signature: sha256=<hmac> when you set a secret.
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
    //    Tally sends: { eventType, createdAt, data: { fields: [...] } }
    // -----------------------------------------------------------------------
    const payload = await context.request.json();

    // Only handle new submissions
    if (payload.eventType !== 'FORM_RESPONSE') {
      return json({ ok: true, skipped: true }, 200);
    }

    const fields = payload.data?.fields ?? [];

    // -----------------------------------------------------------------------
    // 3. Map Tally fields → your table columns
    //    Tally field labels (case-insensitive) drive the mapping.
    //    Adjust the label strings below to match exactly what you named
    //    your fields inside the Tally form builder.
    // -----------------------------------------------------------------------
    const title       = getFieldValue(fields, 'title')       ?? getFieldValue(fields, 'tutorial title') ?? '(no title)';
    const description = getFieldValue(fields, 'description') ?? getFieldValue(fields, 'details')        ?? null;

    // Attachments: Tally returns file fields as arrays of { url, name, mimeType, size }
    const attachmentField = fields.find(f =>
      f.type === 'FILE_UPLOAD' ||
      f.label?.toLowerCase().includes('attachment') ||
      f.label?.toLowerCase().includes('file')
    );
    const attachments = attachmentField?.value
      ? attachmentField.value.map(f => ({ name: f.name, url: f.url }))
      : null;

    // -----------------------------------------------------------------------
    // 4. Insert into Supabase
    // -----------------------------------------------------------------------
    const row = {
      title,
      description,
      ...(attachments ? { attachments } : {}),
      // status/color/notes will use their column defaults (pending / slate / null)
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/tutorial_requests`, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(row),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Supabase insert error:', err);
      return json({ error: 'Supabase insert failed', details: err }, 500);
    }

    return json({ ok: true }, 200);

  } catch (err) {
    console.error('Webhook error:', err);
    return json({ error: 'Internal server error', message: err.message }, 500);
  }
}

// Handle OPTIONS preflight (shouldn't be needed for webhooks but just in case)
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Find a field by label (case-insensitive) and return its value as a string.
 * Handles Tally's INPUT_TEXT, TEXTAREA, and similar single-value field types.
 */
function getFieldValue(fields, labelSubstring) {
  const field = fields.find(f =>
    f.label?.toLowerCase().includes(labelSubstring.toLowerCase())
  );
  if (!field) return undefined;
  // Arrays (multi-select, checkboxes) → join; primitives → stringify
  if (Array.isArray(field.value)) return field.value.join(', ') || null;
  return field.value != null ? String(field.value) : null;
}

/**
 * Verify Tally's HMAC-SHA256 webhook signature.
 * signature header format: "sha256=<hex>"
 */
async function verifySignature(body, signatureHeader, secret) {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = signatureHeader.slice(7); // strip "sha256="

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
