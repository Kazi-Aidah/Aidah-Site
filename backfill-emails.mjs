// backfill-emails.mjs
// Safely adds requester emails to EXISTING KV records by matching each Tally
// CSV row (title + submitted date) to the stored request. It preserves the
// notes/status/color you've already set — it only fills in the `email` field.
//
// Why not just re-run import-requests.mjs? That would OVERWRITE the store and
// wipe your existing notes/status/color. This script merges instead.
//
// Prereqs: a fresh Tally CSV export saved as tally-export.csv (it must include
// an email column), and your admin password.
//
// Run:
//   ADMIN_PASSWORD=19418 SITE=https://kaziaidah.pages.dev CSV_PATH=tally-export.csv node backfill-emails.mjs

import { readFileSync } from 'fs';

const SITE           = process.env.SITE || 'https://kaziaidah.pages.dev';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const CSV_PATH       = process.env.CSV_PATH || './tally-export.csv';
const API_URL        = `${SITE}/api/import-requests`;
const EXPORT_URL     = `${SITE}/api/export-requests`;

// ---- minimal CSV parser (matches import-requests.mjs) ----------------------
function parseCSV(text) {
  const rows = [];
  let i = 0, n = text.length;
  const parseField = () => {
    if (i >= n) return '';
    if (text[i] === '"') {
      i++;
      let v = '';
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { v += '"'; i += 2; } else { i++; break; }
        } else v += text[i++];
      }
      return v;
    }
    let v = '';
    while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') v += text[i++];
    return v;
  };
  const parseRow = () => {
    const f = [];
    while (i < n && text[i] !== '\n' && text[i] !== '\r') {
      f.push(parseField());
      if (i < n && text[i] === ',') i++;
    }
    if (i < n && text[i] === '\r') i++;
    if (i < n && text[i] === '\n') i++;
    return f;
  };
  const headers = parseRow();
  while (i < n) {
    const f = parseRow();
    if (f.length === 0 || (f.length === 1 && f[0] === '')) continue;
    const o = {};
    headers.forEach((h, idx) => { o[h.trim()] = (f[idx] ?? '').trim(); });
    rows.push(o);
  }
  return rows;
}

function cell(row, ...names) {
  const lowMap = {};
  for (const k of Object.keys(row)) lowMap[k.toLowerCase().trim()] = k;
  for (const nm of names) {
    const key = lowMap[nm.toLowerCase().trim()];
    if (key != null) {
      const v = (row[key] ?? '').toString().trim();
      if (v) return v;
    }
  }
  return '';
}

function parseDate(raw) {
  if (!raw || !raw.trim()) return null;
  const d = new Date(raw.trim().replace(/\s*\(GMT[^)]*\)\s*$/, ''));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function dateKey(iso) {
  return iso ? iso.slice(0, 10) : '';
}
function matchKey(title, iso) {
  return `${(title || '').trim().toLowerCase()}||${dateKey(iso)}`;
}

async function main() {
  if (!ADMIN_PASSWORD) {
    console.error('Set ADMIN_PASSWORD (the same value as the Pages env var).');
    process.exit(1);
  }

  // 1. Current store (with notes/status/color preserved)
  const exp = await fetch(EXPORT_URL, { headers: { 'x-admin-password': ADMIN_PASSWORD } });
  if (!exp.ok) { console.error('Export failed:', await exp.text()); process.exit(1); }
  const existing = await exp.json();
  console.log(`Loaded ${existing.length} existing requests from KV.`);

  // 2. Tally CSV
  let csv;
  try { csv = readFileSync(CSV_PATH, 'utf8'); }
  catch { console.error(`Could not read ${CSV_PATH}`); process.exit(1); }
  const rows = parseCSV(csv);

  // index CSV by match key -> email
  const csvByKey = new Map();
  for (const row of rows) {
    const title  = cell(row, 'title', 'tutorial request', 'tutorial title');
    const email  = cell(row, 'email', 'e-mail', 'your email', 'contact email', 'their emails', 'their email');
    const iso    = parseDate(cell(row, 'created_at', 'submitted at', 'date'));
    if (!title) continue;
    csvByKey.set(matchKey(title, iso), email);
  }
  console.log(`Parsed ${rows.length} CSV rows; ${[...csvByKey.values()].filter(Boolean).length} have emails.`);

  // 3. Merge emails into existing records (no other fields touched)
  let matched = 0, added = 0;
  for (const rec of existing) {
    const key = matchKey(rec.title, rec.created_at);
    const email = csvByKey.get(key);
    if (email && !rec.email) {
      rec.email = email;
      matched++; added++;
    } else if (email && rec.email && rec.email !== email) {
      rec.email = email; added++; // update if changed
    }
  }
  console.log(`Matched ${matched} records; ${added} emails written.`);

  if (added === 0) {
    console.log('Nothing to backfill (no new emails matched).');
    return;
  }

  // 4. Write the full, enriched array back (replace — preserves everything)
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': ADMIN_PASSWORD },
    body: JSON.stringify({ mode: 'replace', items: existing }),
  });
  if (!res.ok) { console.error('Write failed:', await res.text()); process.exit(1); }
  console.log(`✓ Backfill complete. ${existing.length} records updated in KV.`);
}

main().catch(e => { console.error(e); process.exit(1); });
