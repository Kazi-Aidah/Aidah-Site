// tutorial-requests.js
// Fetches tutorial requests from Supabase and renders them.
// Admin panel allows updating status, color, and notes.

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
// Data now lives in Cloudflare KV, served by /api/get-requests.
// No client-side keys are needed — all reads/writes go through functions.

const REFRESH_INTERVAL_MS = 60000; // auto-check for new requests every 60s

// Admin password is validated server-side via /api/admin-update.
// It is never stored here — the user types it and it is sent in a request header.
// Nothing sensitive lives in this file.
let adminSessionPassword = null; // holds password in memory for the session only

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const PAGE_SIZE = 24;

const STATUS_ICONS = {
  pending:       'fa-solid fa-clock',
  accepted:      'fa-solid fa-thumbs-up',
  'in progress': 'fa-solid fa-video',
  done:          'fa-solid fa-check',
  declined:      'fa-solid fa-xmark',
};

// Status drives the card's left-border color automatically
const STATUS_COLORS = {
  pending:       'slate',
  accepted:      'orange',
  'in progress': 'yellow',
  done:          'green',
  declined:      'red',
};

const COLOR_OPTIONS  = ['slate','red','orange','yellow','green','blue','grey','purple'];
const STATUS_OPTIONS = ['pending','accepted','in progress','done','declined'];

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------
let allRequests  = [];
let filtered     = [];
let currentPage  = 1;
let activeFilter = 'all';
let searchQuery  = '';
let isAdmin      = false;

// ---------------------------------------------------------------------------
// DOM REFS (set after DOMContentLoaded)
// ---------------------------------------------------------------------------
let grid, pagination, stateMsg;
let searchInput, filterBtns;
let adminLoginWrap, adminPasswordInput, adminLoginBtn, adminLoginError;

// ---------------------------------------------------------------------------
// DATA HELPERS
// ---------------------------------------------------------------------------
async function loadRequests() {
  // KV-backed endpoint returns the full array, newest first.
  const res = await fetch('/api/get-requests', { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Server error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function updateRequest(id, patch) {
  // All admin writes go through the server-side Cloudflare function.
  // The password is validated there — never in client-side code.
  const res = await fetch('/api/admin-update', {
    method: 'POST',
    headers: {
      'Content-Type':     'application/json',
      'x-admin-password': adminSessionPassword,
    },
    body: JSON.stringify({ id, ...patch }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Server error ${res.status}`);
  }
  return res.json();
}

async function verifyAdminPassword(password) {
  // Asks the server if the password is correct — no comparison in the browser.
  const res = await fetch('/api/admin-update', {
    method: 'GET',
    headers: { 'x-admin-password': password },
  });
  return res.ok;
}

// ---------------------------------------------------------------------------
// AUTO-REFRESH — silently check for new/updated requests every interval.
// New rows are prepended; changed rows (e.g. your notes) are updated live.
// ---------------------------------------------------------------------------
async function refreshRequests() {
  try {
    const latest = await loadRequests();
    const byId = new Map(latest.map(r => [r.id, r]));
    const known = new Set(allRequests.map(r => r.id));

    const added = latest.filter(r => !known.has(r.id));
    let changed = false;

    // Merge any changes to existing rows (without disturbing admin editing).
    allRequests = allRequests.map(old => {
      const nw = byId.get(old.id);
      if (nw && JSON.stringify(nw) !== JSON.stringify(old)) {
        changed = true;
        return nw;
      }
      return old;
    });

    if (added.length) {
      added.forEach(a => allRequests.push(a));
      allRequests.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      applyFilters();
      showToast(`✨ ${added.length} new request${added.length > 1 ? 's' : ''}!`);
    } else if (changed) {
      applyFilters();
    }
  } catch (err) {
    // Swallow refresh errors — the manual load error UI stays as-is.
    console.warn('Auto-refresh skipped:', err.message);
  }
}

// ---------------------------------------------------------------------------
// RENDERING
// ---------------------------------------------------------------------------
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusBadgeHTML(status) {
  const s    = (status || 'pending').toLowerCase();
  const icon = STATUS_ICONS[s] || STATUS_ICONS.pending;
  return `<span class="status-badge status-${s.replace(' ','-')}"><i class="${icon}"></i>${s}</span>`;
}

// Derive card color from status
function colorFromStatus(status) {
  const s = (status || 'pending').toLowerCase();
  return STATUS_COLORS[s] || 'slate';
}

function attachmentsHTML(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';
  const chips = attachments.map(a => {
    const name = a.name || 'file';
    const url  = a.url  || '#';
    return `<a class="attachment-chip" href="${url}" target="_blank" rel="noopener">
      <i class="fa-solid fa-paperclip"></i>${name}
    </a>`;
  }).join('');
  return `<div class="req-attachments">${chips}</div>`;
}

function adminControlsHTML(req) {
  if (!isAdmin) return '';

  const statusOpts = STATUS_OPTIONS.map(s =>
    `<option value="${s}" ${req.status === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  const colorOpts = COLOR_OPTIONS.map(c =>
    `<option value="${c}" ${req.color === c ? 'selected' : ''}>${c}</option>`
  ).join('');

  const notesDisplay = req.notes
    ? `<div class="admin-notes-display">${escapeHTML(req.notes)}</div>` : '';

  return `
    <div class="admin-controls" data-id="${req.id}">
      <select class="admin-select admin-status" title="Status">${statusOpts}</select>
      <select class="admin-select admin-color" title="Color">${colorOpts}</select>
      <textarea class="admin-notes-area" placeholder="Type your response…">${escapeHTML(req.notes || '')}</textarea>
      ${notesDisplay}
      <button class="admin-save-btn"><i class="fa-solid fa-floppy-disk"></i> Save</button>
    </div>
  `;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function buildCard(req) {
  const div = document.createElement('div');
  div.className = 'req-card';
  div.dataset.color = colorFromStatus(req.status);
  div.dataset.id = req.id;

  const desc = req.description
    ? `<p class="req-card-desc">${escapeHTML(req.description)}</p>` : '';

  div.innerHTML = `
    <h3 class="req-card-title">${escapeHTML(req.title)}</h3>
    ${desc}
    ${attachmentsHTML(req.attachments)}
    <div class="req-card-footer">
      ${statusBadgeHTML(req.status)}
      <span class="req-date">${formatDate(req.created_at)}</span>
    </div>
    ${adminControlsHTML(req)}
  `;

  if (isAdmin) {
    const controls = div.querySelector('.admin-controls');
    const saveBtn  = controls.querySelector('.admin-save-btn');
    saveBtn.addEventListener('click', () => handleSave(req, controls, div));
  }

  // Open modal on card click (but not when clicking admin controls)
  div.addEventListener('click', e => {
    if (e.target.closest('.admin-controls')) return;
    openModal(req);
  });

  return div;
}

// ---------------------------------------------------------------------------
// MODAL HELPERS
// ---------------------------------------------------------------------------

/** Turn plain URLs in text into clickable <a> tags. */
function linkify(text) {
  const escaped = escapeHTML(text);
  return escaped.replace(
    /(https?:\/\/[^\s<>"]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|avif|svg|bmp)(\?|#|$)/i;
const IMAGE_MIMES = /^image\//i;
const VIDEO_EXTS = /\.(mp4|webm|ogg|mov|m4v|avi)(\?|#|$)/i;
const VIDEO_MIMES = /^video\//i;

/** Normalise the raw attachments value into an array of {url, name, mime} objects. */
function normaliseAttachments(raw) {
  if (!raw) return [];

  // Already a proper array of objects
  if (Array.isArray(raw)) {
    return raw.filter(Boolean).map(a =>
      typeof a === 'string'
        ? { url: a, name: filenameFromUrl(a), mime: '' }
        : { url: a.url || a.link || a.fileUrl || '', name: a.name || a.fileName || filenameFromUrl(a.url || ''), mime: a.mimeType || a.mime_type || a.type || '' }
    ).filter(a => a.url);
  }

  // Plain string — could be:
  // 1. A single URL
  // 2. Multiple URLs separated by newlines
  // 3. A JSON string
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    // Try JSON first
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return normaliseAttachments(parsed);
      } catch { /* not JSON, fall through */ }
    }

    // Treat as URL(s) — split on newlines or spaces between URLs
    const urls = trimmed
      .split(/\s+/)
      .map(s => s.trim())
      .filter(s => s.startsWith('http'));

    if (urls.length > 0) {
      return urls.map(url => ({ url, name: filenameFromUrl(url), mime: '' }));
    }
  }

  return [];
}

function filenameFromUrl(url) {
  if (!url) return 'file';
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/');
    const name = decodeURIComponent(parts[parts.length - 1] || 'file');
    return name.length > 60 ? name.slice(0, 57) + '…' : name;
  } catch {
    return 'file';
  }
}

/** Render attachments for the modal — images/videos inline, others as download chips. */
function modalAttachmentsHTML(attachments) {
  const items = normaliseAttachments(attachments);
  if (items.length === 0) return '';

  return items.map(({ url, name, mime }) => {
    const isImage = IMAGE_EXTS.test(url) || IMAGE_MIMES.test(mime);
    const isVideo = VIDEO_EXTS.test(url) || VIDEO_MIMES.test(mime);

    if (isImage) {
      return `<a href="${url}" target="_blank" rel="noopener" style="display:block;width:100%;">
        <img class="req-modal-img" src="${url}" alt="${escapeHTML(name)}" loading="lazy"
             onerror="this.parentElement.style.display='none'">
      </a>`;
    }
    if (isVideo) {
      return `<video class="req-modal-video" controls preload="metadata">
        <source src="${url}">
        <a class="attachment-chip" href="${url}" target="_blank" rel="noopener">
          <i class="fa-solid fa-film"></i> ${escapeHTML(name)}
        </a>
      </video>`;
    }
    return `<a class="attachment-chip" href="${url}" target="_blank" rel="noopener">
      <i class="fa-solid fa-paperclip"></i>${escapeHTML(name)}
    </a>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// MODAL
// ---------------------------------------------------------------------------
function openModal(req) {
  const backdrop = document.getElementById('reqModalBackdrop');
  const body     = document.getElementById('reqModalBody');

  const richAttachments = modalAttachmentsHTML(req.attachments);

  const notesHTML = req.notes ? `
    <div class="req-modal-notes-wrap">
      <div class="req-modal-notes-label">
        <img src="images/pfp.png" alt="Aidah" onerror="this.src='images/favicon.png'">
        Aidah's Response
      </div>
      <p class="req-modal-notes-text">${linkify(req.notes)}</p>
    </div>` : '';

  const descHTML = req.description ? `
    <hr class="req-modal-divider">
    <div class="req-modal-label">Description</div>
    <p class="req-modal-desc">${linkify(req.description)}</p>` : '';

  const attHTML = richAttachments ? `
    <hr class="req-modal-divider">
    <div class="req-modal-label">Attachments</div>
    <div class="req-modal-attachments">${richAttachments}</div>` : '';

  // Admin controls inside modal — only rendered when logged in
  const adminHTML = isAdmin ? (() => {
    const statusOpts = STATUS_OPTIONS.map(s =>
      `<option value="${s}" ${(req.status || 'pending') === s ? 'selected' : ''}>${s}</option>`
    ).join('');
    const colorOpts = COLOR_OPTIONS.map(c =>
      `<option value="${c}" ${(req.color || 'slate') === c ? 'selected' : ''}>${c}</option>`
    ).join('');
    return `
      <hr class="req-modal-divider">
      <div class="req-modal-admin" data-id="${req.id}">
        <div class="req-modal-label">Admin</div>
        <div class="req-modal-admin-row">
          <select class="admin-select admin-status" title="Status">${statusOpts}</select>
          <select class="admin-select admin-color" title="Color">${colorOpts}</select>
        </div>
        <textarea class="admin-notes-area" placeholder="Type your response…">${escapeHTML(req.notes || '')}</textarea>
        <button class="admin-save-btn modal-save-btn"><i class="fa-solid fa-floppy-disk"></i> Save</button>
      </div>`;
  })() : '';

  body.innerHTML = `
    <h2 class="req-modal-title">${escapeHTML(req.title)}</h2>
    <div class="req-modal-meta">
      ${statusBadgeHTML(req.status)}
      <span class="req-modal-date"><i class="fa-regular fa-calendar"></i> ${formatDate(req.created_at)}</span>
    </div>
    ${descHTML}
    ${attHTML}
    ${notesHTML}
    ${adminHTML}
  `;

  // Wire up the modal save button
  if (isAdmin) {
    const adminSection = body.querySelector('.req-modal-admin');
    const saveBtn = adminSection.querySelector('.modal-save-btn');
    saveBtn.addEventListener('click', () => handleModalSave(req, adminSection, body));
  }

  backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
}

async function handleModalSave(req, adminSection, body) {
  const newStatus = adminSection.querySelector('.admin-status').value;
  const newColor  = adminSection.querySelector('.admin-color').value;
  const newNotes  = adminSection.querySelector('.admin-notes-area').value;

  const saveBtn = adminSection.querySelector('.modal-save-btn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

  try {
    await updateRequest(req.id, { status: newStatus, color: newColor, notes: newNotes });

    // Update local cache
    const cached = allRequests.find(r => r.id === req.id);
    if (cached) {
      cached.status = newStatus;
      cached.color  = newColor;
      cached.notes  = newNotes;
    }

    // Update the status badge in the modal header live
    const badge = body.querySelector('.status-badge');
    if (badge) badge.outerHTML = statusBadgeHTML(newStatus);

    // Refresh the notes display if notes exist
    const existingNotesWrap = body.querySelector('.req-modal-notes-wrap');
    if (newNotes.trim()) {
      const newNotesHTML = `
        <div class="req-modal-notes-wrap">
          <div class="req-modal-notes-label">
            <img src="images/pfp.png" alt="Aidah" onerror="this.src='images/favicon.png'">
            Aidah's Response
          </div>
          <p class="req-modal-notes-text">${linkify(newNotes)}</p>
        </div>`;
      if (existingNotesWrap) {
        existingNotesWrap.outerHTML = newNotesHTML;
      } else {
        // Insert before the admin section
        adminSection.parentElement.insertAdjacentHTML('beforeend', newNotesHTML);
        // Move it before the admin divider
        const divider = adminSection.previousElementSibling;
        if (divider?.classList.contains('req-modal-divider')) {
          divider.insertAdjacentHTML('beforebegin', newNotesHTML);
          body.querySelector('.req-modal-notes-wrap:last-of-type')?.remove();
        }
      }
    } else if (existingNotesWrap) {
      existingNotesWrap.remove();
    }

    // Re-render the card grid so the card reflects the new status too
    renderPage();
    showToast('✓ Saved!');
  } catch (err) {
    showToast('⚠ Save failed: ' + err.message, true);
    console.error(err);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save';
  }
}

function closeModal() {
  const backdrop = document.getElementById('reqModalBackdrop');
  backdrop.classList.remove('open');
  document.body.style.overflow = '';
}

// ---------------------------------------------------------------------------
// RENDER PAGE
// ---------------------------------------------------------------------------
function renderPage() {
  grid.innerHTML = '';

  if (filtered.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'state-msg';
    msg.innerHTML = '<i class="fa-solid fa-inbox"></i>No requests match that filter.';
    grid.appendChild(msg);
    pagination.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  currentPage = Math.min(currentPage, totalPages);
  const start  = (currentPage - 1) * PAGE_SIZE;
  const slice  = filtered.slice(start, start + PAGE_SIZE);

  slice.forEach(req => grid.appendChild(buildCard(req)));

  // pagination
  pagination.innerHTML = '';
  if (totalPages > 1) {
    const prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    prev.setAttribute('aria-label', 'Previous page');
    prev.disabled = currentPage === 1;
    prev.addEventListener('click', () => { currentPage--; renderPage(); scrollToGrid(); });
    pagination.appendChild(prev);

    for (let p = 1; p <= totalPages; p++) {
      const btn = document.createElement('button');
      btn.className = `page-btn${p === currentPage ? ' active' : ''}`;
      btn.textContent = p;
      btn.addEventListener('click', () => { currentPage = p; renderPage(); scrollToGrid(); });
      pagination.appendChild(btn);
    }

    const next = document.createElement('button');
    next.className = 'page-btn';
    next.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    next.setAttribute('aria-label', 'Next page');
    next.disabled = currentPage === totalPages;
    next.addEventListener('click', () => { currentPage++; renderPage(); scrollToGrid(); });
    pagination.appendChild(next);
  }
}

function scrollToGrid() {
  grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------------
// FILTERING
// ---------------------------------------------------------------------------
function applyFilters() {
  const q = searchQuery.trim().toLowerCase();
  filtered = allRequests.filter(r => {
    const s = (r.status || 'pending').toLowerCase();
    const matchesStatus = activeFilter === 'all' || s === activeFilter;
    const matchesSearch = !q
      || r.title.toLowerCase().includes(q)
      || (r.description && r.description.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });
  currentPage = 1;
  renderPage();
}

function updateCountBadge() {
  // count badge removed from public UI
}

// ---------------------------------------------------------------------------
// ADMIN SAVE
// ---------------------------------------------------------------------------
async function handleSave(req, controls, card) {
  const newStatus = controls.querySelector('.admin-status').value;
  const newColor  = controls.querySelector('.admin-color').value;
  const newNotes  = controls.querySelector('.admin-notes-area').value;

  const saveBtn = controls.querySelector('.admin-save-btn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

  try {
    await updateRequest(req.id, { status: newStatus, color: newColor, notes: newNotes });

    // Update local cache
    const cached = allRequests.find(r => r.id === req.id);
    if (cached) {
      cached.status = newStatus;
      cached.color  = newColor;
      cached.notes  = newNotes;
    }

    // Update the card in-place so the page doesn't flash
    card.dataset.color = newColor;
    const badge = card.querySelector('.status-badge');
    if (badge) badge.outerHTML = statusBadgeHTML(newStatus);

    // Refresh notes display
    const existingDisplay = controls.querySelector('.admin-notes-display');
    if (existingDisplay) existingDisplay.remove();
    if (newNotes.trim()) {
      const nd = document.createElement('div');
      nd.className = 'admin-notes-display';
      nd.textContent = newNotes;
      controls.insertBefore(nd, saveBtn);
    }

    showToast('✓ Saved!');
  } catch (err) {
    showToast('⚠ Save failed: ' + err.message, true);
    console.error(err);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save';
  }
}

// ---------------------------------------------------------------------------
// TOAST
// ---------------------------------------------------------------------------
function showToast(msg, isError = false) {
  const container = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast';
  if (isError) t.style.borderColor = 'var(--color-retro-red)';
  t.textContent = msg;
  container.appendChild(t);
  requestAnimationFrame(() => { t.classList.add('show'); });
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2800);
}

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  grid           = document.getElementById('requestsGrid');
  pagination     = document.getElementById('pagination');
  stateMsg       = document.getElementById('stateMsg');
  searchInput    = document.getElementById('searchInput');
  filterBtns     = document.querySelectorAll('.filter-btn');
  adminLoginWrap = document.getElementById('adminLoginWrap');
  adminPasswordInput = document.getElementById('adminPassword');
  adminLoginBtn  = document.getElementById('adminLoginBtn');
  adminLoginError= document.getElementById('adminLoginError');

  // Modal close
  document.getElementById('reqModalClose').addEventListener('click', closeModal);
  document.getElementById('reqModalBackdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('reqModalBackdrop').classList.contains('open')) {
        closeModal();
      } else {
        adminLoginWrap.classList.remove('visible');
      }
    }
  });

  // Search
  const clearBtn = document.getElementById('searchClearBtn');
  searchInput.addEventListener('input', e => {
    searchQuery = e.target.value;
    clearBtn.classList.toggle('visible', searchQuery.length > 0);
    applyFilters();
  });
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearBtn.classList.remove('visible');
    searchInput.focus();
    applyFilters();
  });

  // Status filters
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.status;
      applyFilters();
    });
  });

  // Secret triple-A keystroke opens admin login panel
  // (only when not typing in an input)
  let adminKeySeq = 0, adminKeyTimer = null;
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key.toLowerCase() === 'a') {
      adminKeySeq++;
      clearTimeout(adminKeyTimer);
      if (adminKeySeq >= 3) {
        adminKeySeq = 0;
        if (isAdmin) {
          isAdmin = false;
          adminSessionPassword = null;
          adminLoginWrap.classList.remove('visible');
          renderPage();
          showToast('Admin mode off.');
        } else {
          adminLoginWrap.classList.toggle('visible');
          if (adminLoginWrap.classList.contains('visible')) {
            adminPasswordInput.focus();
          }
        }
      } else {
        adminKeyTimer = setTimeout(() => { adminKeySeq = 0; }, 600);
      }
    } else {
      adminKeySeq = 0;
    }
  });

  // Admin login (panel stays hidden; triggered by triple-A)
  adminLoginBtn.addEventListener('click', attemptLogin);
  adminPasswordInput.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });

  function attemptLogin() {
    const typed = adminPasswordInput.value;
    adminPasswordInput.value = '';

    // Verify server-side — password is never compared in the browser
    adminLoginBtn.disabled = true;
    adminLoginBtn.textContent = 'Checking…';

    verifyAdminPassword(typed).then(valid => {
      adminLoginBtn.disabled = false;
      adminLoginBtn.textContent = 'Unlock';

      if (valid) {
        adminSessionPassword = typed; // keep in memory for this session only
        isAdmin = true;
        adminLoginWrap.classList.remove('visible');
        adminLoginError.style.display = 'none';
        renderPage();
        showToast('Admin mode on.');
      } else {
        adminLoginError.textContent = 'Wrong password.';
        adminLoginError.style.display = 'block';
        adminPasswordInput.focus();
      }
    }).catch(() => {
      adminLoginBtn.disabled = false;
      adminLoginBtn.textContent = 'Unlock';
      adminLoginError.textContent = 'Could not reach server. Try again.';
      adminLoginError.style.display = 'block';
    });
  }

  // Load data
  try {
    console.log('Fetching from Supabase...');
    allRequests = await loadRequests();
    console.log('Raw response:', allRequests);
    if (!Array.isArray(allRequests)) {
      console.warn('Response was not an array:', allRequests);
      allRequests = [];
    }
    console.log(`Loaded ${allRequests.length} requests`);
    applyFilters();

    // Begin auto-refresh so new Tally submissions show up without a reload.
    setInterval(refreshRequests, REFRESH_INTERVAL_MS);
  } catch (err) {
    console.error('Load error:', err);
    grid.innerHTML = `
      <div class="state-msg">
        <i class="fa-solid fa-triangle-exclamation"></i>
        Could not load requests.<br>
        <span style="font-size:0.85em; opacity:0.7">${escapeHTML(err.message)}</span>
      </div>`;
  }
});
