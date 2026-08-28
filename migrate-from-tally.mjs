// migrate-from-tally.mjs
// One-time: pull EVERY submission for a Tally form via the Tally API and push
// them into Cloudflare KV (mode: merge, keyed by Tally submission id so reruns
// are idempotent). This is the automatic equivalent of Tally's
// "Export all submissions to Notion" button — but for KV.
//
// Prereqs:
//   1. KV binding TUTORIAL_KV + ADMIN_PASSWORD set on the Pages project.
//   2. A Tally API key: tally.so → Account → Developers → Create API key.
//   3. Your form id: it's in the form URL, e.g.
//      https://tally.so/form/<FORM_ID>  (also /form/<FORM_ID>/edit)
//
// Run:
//   TALLY_API_KEY=xxx TALLY_FORM_ID=xxx ADMIN_PASSWORD=yyy \
//     SITE=https://kazi-aidah.pages.dev node migrate-from-tally.mjs
//
// Requires Node 18+ (built-in fetch). No npm install.

import { randomUUID } from 'crypto';

const TALLY_API_KEY = process.env.TALLY_API_KEY;
const TALLY_FORM_ID = process.env.TALLY_FORM_ID;
const SITE          = process.env.SITE || 'https://kazi-aidah.pages.dev';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const API_URL       = `${SITE}/api/import-requests`;

if (!TALLY_API_KEY || !TALLY_FORM_ID || !ADMIN_PASSWORD) {
  console.error('Set TALLY_API_KEY, TALLY_FORM_ID and ADMIN_PASSWORD.');
  process.exit(1);
}

// ---- field mapping (mirrors functions/api/tally-webhook.js) ----------------
function getFieldValue(fields, labelSubstring) {
  const field = fields.find(f =>
    f.label?.toLowerCase().includes(labelSubstring.toLowerCase())
  );
  if (!field) return undefined;
  if (Array.isArray(field.value)) return field.value.join(', ') || null;
  return field.value != null ? String(field.value) : null;
}

function mapSubmission(sub) {
  const fields = sub.fields ?? [];
  const title = getFieldValue(fields, 'title') ?? getFieldValue(fields, 'tutorial title') ?? '(no title)';
  const description = getFieldValue(fields, 'description') ?? getFieldValue(fields, 'details') ?? null;

  const attachmentField = fields.find(f =>
    f.type === 'FILE_UPLOAD' ||
    f.label?.toLowerCase().includes('attachment') ||
    f.label?.toLowerCase().includes('file')
  );
  const attachments = attachmentField?.value
    ? attachmentField.value.map(f => ({ name: f.name, url: f.url }))
    : null;

  return {
    id:         sub.id || randomUUID(),
    created_at: sub.createdAt || new Date().toISOString(),
    title,
    description,
    ...(attachments ? { attachments } : {}),
    status:     'pending',
    color:      'slate',
    notes:      null,
  };
}

async function fetchAllSubmissions() {
  const out = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const url = `https://api.tally.so/v1/forms/${TALLY_FORM_ID}/submissions?limit=${limit}&page=${page}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${TALLY_API_KEY}`, 'Accept': 'application/json' },
    });
    if (!res.ok) {
      console.error(`Tally API error (${res.status}):`, await res.text());
      process.exit(1);
    }
    const data = await res.json();
    const items = data.items ?? data.submissions ?? [];
    out.push(...items);

    // Stop when we've fetched fewer than a full page.
    if (items.length < limit) break;
    if (!data.total) break; // some responses have no paging cursor
    page++;
  }

  return out;
}

async function main() {
  console.log('Fetching all submissions from Tally…');
  const submissions = await fetchAllSubmissions();
  console.log(`Fetched ${submissions.length} submissions.`);

  if (submissions.length === 0) {
    console.log('Nothing to import.');
    return;
  }

  const items = submissions.map(mapSubmission);
  const BATCH_SIZE = 100;
  let total = 0;

  // Merge (not replace) per batch: each batch upserts by Tally submission id,
  // so batches accumulate instead of overwriting each other, and re-runs are
  // idempotent.
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': ADMIN_PASSWORD },
      body: JSON.stringify({ mode: 'merge', items: batch }),
    });
    if (!res.ok) {
      console.error(`✗ Batch ${i + 1}–${i + batch.length} failed:`, await res.text());
    } else {
      total += batch.length;
      console.log(`✓ Imported ${i + 1}–${i + batch.length}`);
    }
  }

  console.log(`\nDone. ${total}/${items.length} submissions now in KV.`);
}

main().catch(e => { console.error(e); process.exit(1); });
