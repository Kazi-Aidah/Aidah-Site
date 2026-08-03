// tutorial-requests.js
// Fetches tutorial requests from Supabase and renders them.
// Admin panel allows updating status, color, and notes.

// ---------------------------------------------------------------------------
// CONFIG — fill these in before deploying
// ---------------------------------------------------------------------------
const SUPABASE_URL      = 'https://wbvauewrkouaexcaqbyu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndidmF1ZXdya291YWV4Y2FxYnl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NjA1MDUsImV4cCI6MjEwMTMzNjUwNX0.POvFUVTFMo4BF73nZklnlT2yM51rtTOIlhJPybeSdTw';

// Admin password is checked client-side only — fine for a personal site.
// This is NOT a security boundary; it just hides the controls from casual visitors.
const ADMIN_PASSWORD = 'YOUR_ADMIN_PASSWORD'; // ← set this to whatever you want

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const PAGE_SIZE = 24;

const STATUS_ICONS = {
  pending:   'fa-solid fa-clock',
  reviewing: 'fa-solid fa-magnifying-glass',
  filming:   'fa-solid fa-video',
  published: 'fa-solid fa-circle-check',
  declined:  'fa-solid fa-circle-xmark',
};

const COLOR_OPTIONS = ['slate','red','orange','yellow','green','blue','purple'];
const STATUS_OPTIONS = ['pending','reviewing','filming','published','declined'];

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
let grid, pagination, countBadge, stateMsg;
let searchInput, filterBtns;
let adminToggleBtn, adminLoginWrap, adminPasswordInput, adminLoginBtn, adminLoginError;

// ---------------------------------------------------------------------------
// SUPABASE HELPERS
// ---------------------------------------------------------------------------
async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error ${res.status}: ${text}`);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return null;
  return res.json();
}

async function loadRequests() {
  // Fetch all rows, ordered newest first. Select only public-safe fields + internal ones.
  return supabaseFetch(
    'tutorial_requests?select=id,created_at,title,description,attachments,status,color,notes&order=created_at.desc'
  );
}

async function updateRequest(id, patch) {
  return supabaseFetch(
    `tutorial_requests?id=eq.${id}`,
    { method: 'PATCH', body: JSON.stringify(patch) }
  );
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
  const s = status || 'pending';
  const icon = STATUS_ICONS[s] || STATUS_ICONS.pending;
  return `<span class="status-badge status-${s}"><i class="${icon}"></i>${s}</span>`;
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
      <textarea class="admin-notes-area" placeholder="Private notes…">${escapeHTML(req.notes || '')}</textarea>
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
  div.dataset.color = req.color || 'slate';
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

  return div;
}

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
    prev.textContent = '← Prev';
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
    next.textContent = 'Next →';
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
    const matchesStatus = activeFilter === 'all' || r.status === activeFilter;
    const matchesSearch = !q
      || r.title.toLowerCase().includes(q)
      || (r.description && r.description.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });
  currentPage = 1;
  updateCountBadge();
  renderPage();
}

function updateCountBadge() {
  countBadge.textContent = `${filtered.length} of ${allRequests.length} requests`;
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
  countBadge     = document.getElementById('countBadge');
  stateMsg       = document.getElementById('stateMsg');
  searchInput    = document.getElementById('searchInput');
  filterBtns     = document.querySelectorAll('.filter-btn');
  adminToggleBtn = document.getElementById('adminToggleBtn');
  adminLoginWrap = document.getElementById('adminLoginWrap');
  adminPasswordInput = document.getElementById('adminPassword');
  adminLoginBtn  = document.getElementById('adminLoginBtn');
  adminLoginError= document.getElementById('adminLoginError');

  // Search
  searchInput.addEventListener('input', e => {
    searchQuery = e.target.value;
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

  // Admin toggle
  adminToggleBtn.addEventListener('click', () => {
    if (isAdmin) {
      // Log out
      isAdmin = false;
      adminToggleBtn.classList.remove('active');
      adminToggleBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Admin';
      adminLoginWrap.classList.remove('visible');
      renderPage(); // re-render without admin controls
      showToast('Logged out.');
    } else {
      adminLoginWrap.classList.toggle('visible');
    }
  });

  // Admin login
  adminLoginBtn.addEventListener('click', attemptLogin);
  adminPasswordInput.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });

  function attemptLogin() {
    if (adminPasswordInput.value === ADMIN_PASSWORD) {
      isAdmin = true;
      adminLoginWrap.classList.remove('visible');
      adminToggleBtn.classList.add('active');
      adminToggleBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Admin';
      adminLoginError.style.display = 'none';
      adminPasswordInput.value = '';
      renderPage(); // re-render with admin controls
      showToast('Admin mode on.');
    } else {
      adminLoginError.textContent = 'Wrong password.';
      adminLoginError.style.display = 'block';
      adminPasswordInput.value = '';
      adminPasswordInput.focus();
    }
  }

  // Load data
  try {
    allRequests = await loadRequests();
    if (!Array.isArray(allRequests)) allRequests = [];
    applyFilters();
  } catch (err) {
    grid.innerHTML = `
      <div class="state-msg">
        <i class="fa-solid fa-triangle-exclamation"></i>
        Could not load requests.<br>
        <span style="font-size:0.85em; opacity:0.7">${escapeHTML(err.message)}</span>
      </div>`;
    console.error(err);
  }
});
