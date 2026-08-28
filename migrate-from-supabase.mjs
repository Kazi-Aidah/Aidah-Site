// migrate-from-supabase.mjs
// One-time: copy every existing row out of Supabase and into Cloudflare KV
// via the /api/import-requests endpoint (mode: replace).
//
// Prereqs:
//   1. Deploy the updated functions/api/* with the TUTORIAL_KV binding set.
//   2. Supabase project reactivated (unpause it in the dashboard) so we can read.
//   3. Set env vars below (or export them) and run:
//        node migrate-from-supabase.mjs
//
// Needs Node 18+ (built-in fetch). No npm install.

import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// CONFIG — fill in or export as env vars
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wbvauewrkouaexcaqbyu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndidmF1ZXdya291YWV4Y2FxYnl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NjA1MDUsImV4cCI6MjEwMTMzNjUwNX0.POvFUVTFMo4BF73nZklnlT2yM51rtTOIlhJPybeSdTw';
const SITE          = process.env.SITE || 'https://kazi-aidah.pages.dev';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Optional: read rows from a local JSON file instead of live Supabase
// (handy if Supabase is gone for good). Expects an array of request objects.
const LOCAL_JSON = process.env.LOCAL_JSON || '';

if (!ADMIN_PASSWORD) {
  console.error('Set ADMIN_PASSWORD (the same value as the Pages env var).');
  process.exit(1);
}

async function main() {
  let rows;

  if (LOCAL_JSON) {
    console.log(`Reading rows from local file: ${LOCAL_JSON}`);
    rows = JSON.parse(readFileSync(LOCAL_JSON, 'utf8'));
  } else {
    console.log('Fetching all rows from Supabase…');
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tutorial_requests?select=*&order=created_at.asc`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) {
      console.error(`Supabase read failed (${res.status}):`, await res.text());
      process.exit(1);
    }
    rows = await res.json();
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('No rows to migrate.');
    return;
  }

  // Keep only the fields the page/endpoint expect; fill defaults.
  const items = rows.map(r => ({
    id:          r.id ?? randomUUID(),
    created_at:  r.created_at ?? new Date().toISOString(),
    title:       r.title ?? '(no title)',
    description: r.description ?? null,
    attachments: r.attachments ?? null,
    status:      r.status ?? 'pending',
    color:       r.color ?? 'slate',
    notes:       r.notes ?? null,
  }));

  console.log(`Migrating ${items.length} rows to KV via ${SITE}/api/import-requests …`);

  const res = await fetch(`${SITE}/api/import-requests`, {
    method: 'POST',
    headers: {
      'Content-Type':     'application/json',
      'x-admin-password': ADMIN_PASSWORD,
    },
    body: JSON.stringify({ mode: 'replace', items }),
  });

  if (!res.ok) {
    console.error(`Import failed (${res.status}):`, await res.text());
    process.exit(1);
  }

  const data = await res.json();
  console.log(`✓ Done. ${data.count} requests now stored in KV.`);
  console.log('You can delete the old Supabase project whenever you like.');
}

main().catch(e => { console.error(e); process.exit(1); });
