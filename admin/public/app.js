const state = { galleries: [], id: null, gallery: null, selected: null, dirty: false };
const MAX_FEATURED = 3;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

init();

async function init() {
  const config = await fetchJson('/api/config');
  $('#photos-dir').textContent = config.photosDir;

  $$('#actions button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => runAction(btn.dataset.action));
  });

  await loadGalleryList();
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function loadGalleryList() {
  state.galleries = await fetchJson('/api/galleries');
  renderGalleryList();
}

function renderGalleryList() {
  const root = $('#gallery-list');
  root.innerHTML = '';
  let lastSection = Symbol();

  for (const g of state.galleries) {
    const section = g.section ?? '';
    if (section !== lastSection) {
      const label = document.createElement('div');
      label.className = 'section-label';
      label.textContent = section || 'No section';
      root.appendChild(label);
      lastSection = section;
    }

    const item = document.createElement('div');
    item.className = 'gallery-item' + (g.id === state.id ? ' active' : '');
    const thumb = g.coverKind === 'video'
      ? '<span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex:none">\u{1F3AC}</span>'
      : `<img loading="lazy" src="/media?id=${encodeURIComponent(g.id)}&file=${encodeURIComponent(g.cover)}&w=64">`;
    item.innerHTML = `
      ${thumb}
      <span class="name">${escapeHtml(g.title)}</span>
      ${g.protected ? '<span class="badge">password</span>' : ''}
    `;
    item.addEventListener('click', () => selectGallery(g.id));
    root.appendChild(item);
  }
}

async function selectGallery(id) {
  if (state.dirty && !confirm('Discard unsaved changes to this gallery?')) return;
  state.id = id;
  state.selected = null;
  renderGalleryList();
  state.gallery = await fetchJson(`/api/gallery?id=${encodeURIComponent(id)}`);
  state.gallery.initialOrder = state.gallery.photos.map((p) => p.file);
  state.dirty = false;
  renderEditor();
}

function renderEditor() {
  const g = state.gallery;
  const root = $('#editor');
  root.innerHTML = `
    <h2>${escapeHtml(g.id)}</h2>
    <div class="field-row">
      <div class="field grow">
        <label>Title</label>
        <input id="f-title" type="text" placeholder="${escapeHtml(g.defaultTitle)}" value="${escapeHtml(g.title)}">
      </div>
      <div class="field">
        <label>Type</label>
        <input id="f-type" type="text" placeholder="e.g. events" value="${escapeHtml(g.type)}">
      </div>
      <div class="field">
        <label>Order</label>
        <input id="f-order" type="number" value="${g.order}" style="width:5rem">
      </div>
    </div>
    <div class="field-row">
      <div class="field grow">
        <label>Description</label>
        <textarea id="f-description">${escapeHtml(g.description)}</textarea>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Available until</label>
        <input id="f-available" type="date" value="${escapeHtml(g.availableUntil)}">
      </div>
      <div class="field grow">
        <label>Password (blank = none)</label>
        <input id="f-password" type="text" value="${escapeHtml(g.password)}" placeholder="none">
      </div>
    </div>

    <h3>Photos &amp; videos (drag to reorder within a subsection, click the star to set the cover, the number to feature it on the home page, click a tile to edit it)
      <button id="reset-order" style="font-size:0.75rem">Reset to filename order</button>
    </h3>
    <div class="photo-grid" id="photo-grid"></div>
    <div id="photo-detail"></div>

    <div class="save-bar">
      <button class="primary" id="save-gallery">Save gallery.json</button>
      <span class="status" id="save-status"></span>
    </div>
  `;

  renderPhotoGrid();

  for (const id of ['f-title', 'f-type', 'f-order', 'f-description', 'f-available', 'f-password']) {
    $('#' + id).addEventListener('input', markDirty);
  }
  $('#save-gallery').addEventListener('click', saveGallery);
  $('#reset-order').addEventListener('click', () => {
    const byFile = new Map(g.photos.map((p) => [p.file, p]));
    g.photos = g.naturalOrder.map((f) => byFile.get(f));
    markDirty();
    renderPhotoGrid();
  });
}

function markDirty() {
  state.dirty = true;
  $('#save-status').textContent = 'unsaved changes';
}

function renderPhotoGrid() {
  const grid = $('#photo-grid');
  grid.innerHTML = '';
  const g = state.gallery;
  const canFeature = !g.id.includes('/');

  let lastSubsection;
  g.photos.forEach((p, i) => {
    if (p.subsection !== lastSubsection) {
      lastSubsection = p.subsection;
      if (p.subsection || i > 0) {
        const heading = document.createElement('div');
        heading.className = 'subsection-heading';
        heading.textContent = p.subsection || 'Ungrouped';
        grid.appendChild(heading);
      }
    }

    const featuredAt = g.featured.indexOf(p.file);
    const tile = document.createElement('div');
    tile.className = 'tile' + (p.file === g.cover ? ' is-cover' : '') + (p.file === state.selected ? ' selected' : '');
    tile.draggable = true;
    tile.dataset.index = i;

    const media = p.kind === 'video'
      ? '<div class="video-badge">\u{1F3AC}</div>'
      : `<img loading="lazy" src="/media?id=${encodeURIComponent(g.id)}&file=${encodeURIComponent(p.path)}&w=280">`;

    tile.innerHTML = `
      ${media}
      <button class="cover-star" title="Set as cover">${p.file === g.cover ? '★' : '☆'}</button>
      ${canFeature ? `<button class="feature-toggle${featuredAt >= 0 ? ' is-featured' : ''}" title="Feature on home page (up to ${MAX_FEATURED})">${featuredAt >= 0 ? featuredAt + 1 : '+'}</button>` : ''}
      <div class="filename">${escapeHtml(p.file)}</div>
    `;

    tile.addEventListener('click', (e) => {
      if (e.target.closest('.cover-star, .feature-toggle')) return;
      selectPhoto(p.file);
    });
    $('.cover-star', tile).addEventListener('click', () => {
      g.cover = p.file;
      markDirty();
      renderPhotoGrid();
    });
    $('.feature-toggle', tile)?.addEventListener('click', () => {
      if (featuredAt >= 0) g.featured.splice(featuredAt, 1);
      else if (g.featured.length < MAX_FEATURED) g.featured.push(p.file);
      else return;
      markDirty();
      renderPhotoGrid();
    });

    tile.addEventListener('dragstart', (e) => {
      tile.classList.add('dragging');
      e.dataTransfer.setData('text/plain', String(i));
    });
    tile.addEventListener('dragend', () => tile.classList.remove('dragging'));
    tile.addEventListener('dragover', (e) => {
      e.preventDefault();
      const from = $('.dragging', grid);
      if (!from || from === tile) return;
      const fromIndex = Number(from.dataset.index);
      const toIndex = Number(tile.dataset.index);
      if (fromIndex === toIndex || g.photos[fromIndex].subsection !== p.subsection) return;
      const [moved] = g.photos.splice(fromIndex, 1);
      g.photos.splice(toIndex, 0, moved);
      markDirty();
      renderPhotoGrid();
    });

    grid.appendChild(tile);
  });
}

function selectPhoto(file) {
  state.selected = file;
  renderPhotoGrid();
  renderPhotoDetail();
}

function renderPhotoDetail() {
  const box = $('#photo-detail');
  const p = state.gallery.photos.find((x) => x.file === state.selected);
  if (!p) { box.innerHTML = ''; return; }

  box.innerHTML = `
    <h3 style="margin-top:0">${escapeHtml(p.file)}</h3>
    <div class="field">
      <label>Alt text (accessibility, not shown)</label>
      <input id="d-alt" type="text" value="${escapeHtml(p.alt)}">
    </div>
    <div class="field">
      <label>Caption (shown under the photo in the lightbox)</label>
      <input id="d-caption" type="text" value="${escapeHtml(p.caption)}">
    </div>
    <div class="field">
      <label>Note (lightbox sidebar, below EXIF)</label>
      <textarea id="d-note">${escapeHtml(p.note)}</textarea>
    </div>
    <div class="field">
      <label>Subsection (from the folder name; move the file to change it)</label>
      <input type="text" value="${escapeHtml(p.subsection)}" disabled>
    </div>
  `;

  $('#d-alt').addEventListener('input', (e) => { p.alt = e.target.value; markDirty(); });
  $('#d-caption').addEventListener('input', (e) => { p.caption = e.target.value; markDirty(); });
  $('#d-note').addEventListener('input', (e) => { p.note = e.target.value; markDirty(); });
}

async function saveGallery() {
  const g = state.gallery;
  const payload = {};

  const title = $('#f-title').value.trim();
  if (title) payload.title = title;

  const description = $('#f-description').value.trim();
  if (description) payload.description = description;

  const type = $('#f-type').value.trim().toLowerCase();
  if (type) payload.type = type;

  const order = Number($('#f-order').value);
  if (Number.isFinite(order) && order !== 999) payload.order = order;

  const availableUntil = $('#f-available').value.trim();
  if (availableUntil) payload.availableUntil = availableUntil;

  const password = $('#f-password').value.trim();
  if (password) payload.password = password;

  // Only touch photoOrder if the display order actually differs from the
  // default filename sort. If it matches what was already on disk (no drag
  // happened), keep the original array as-is rather than rewriting it as a
  // full list — avoids inflating a deliberately partial photoOrder on every
  // unrelated save (see gallery-fs.mjs reorderFiles).
  const currentOrder = g.photos.map((p) => p.file);
  const naturalKey = g.naturalOrder.join('\0');
  const initialKey = g.initialOrder.join('\0');
  const currentKey = currentOrder.join('\0');
  if (currentKey !== naturalKey) {
    payload.photoOrder = currentKey === initialKey && g.savedPhotoOrder ? g.savedPhotoOrder : currentOrder;
  }

  if (g.cover && g.cover !== g.autoCover) payload.cover = g.cover;

  const featured = g.featured.filter((f) => g.photos.some((p) => p.file === f));
  if (featured.length) payload.featured = featured;

  const photos = {};
  for (const p of g.photos) {
    const entry = {};
    if (p.alt.trim()) entry.alt = p.alt.trim();
    if (p.caption.trim()) entry.caption = p.caption.trim();
    if (p.note.trim()) entry.note = p.note.trim();
    if (Object.keys(entry).length) photos[p.file] = entry;
  }
  if (Object.keys(photos).length) payload.photos = photos;

  $('#save-status').textContent = 'saving…';
  await fetchJson(`/api/gallery?id=${encodeURIComponent(g.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  state.dirty = false;
  $('#save-status').textContent = 'saved';
  await loadGalleryList();
}

async function runAction(action) {
  const message = $('#commit-message').value.trim();
  if (action === 'commit' && !message) {
    alert('Enter a commit message first.');
    return;
  }

  const log = $('#log');
  log.hidden = false;
  log.textContent += `\n$ ${action}\n`;
  log.scrollTop = log.scrollHeight;

  $$('#actions button').forEach((b) => (b.disabled = true));

  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, message }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      log.textContent += `error: ${err.error || res.status}\n`;
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      log.textContent += decoder.decode(value, { stream: true });
      log.scrollTop = log.scrollHeight;
    }
  } finally {
    $$('#actions button').forEach((b) => (b.disabled = false));
    if (action === 'sync' || action === 'prune') await loadGalleryList();
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
