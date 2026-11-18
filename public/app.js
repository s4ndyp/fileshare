function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / k ** i;
  const decimals = i >= 2 ? 1 : 0;
  return `${parseFloat(value.toFixed(decimals))} ${sizes[i]}`;
}

function storageLevel(usedPercent) {
  if (usedPercent >= 90) return 'level-danger';
  if (usedPercent >= 75) return 'level-warn';
  return 'level-ok';
}

async function loadStorage() {
  try {
    const res = await fetch('/api/storage');
    if (!res.ok) return;
    const data = await res.json();
    const pct = data.usedPercent ?? 0;

    storageFill.style.width = `${pct}%`;
    storageFill.className = `storage-fill ${storageLevel(pct)}`;
    storageFree.textContent = `${formatBytes(data.freeBytes)} vrij`;
    storagePct.textContent = `${pct}% gebruikt`;
    storageTrack.setAttribute('aria-valuenow', String(Math.round(pct)));
  } catch {
    storageFree.textContent = 'Onbekend';
  }
}

function formatDate(ts) {
  return new Date(ts).toLocaleString('nl-NL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const selectedHint = document.getElementById('selectedHint');
const uploadForm = document.getElementById('uploadForm');
const uploadBtn = document.getElementById('uploadBtn');
const deleteAfterDownload = document.getElementById('deleteAfterDownload');
const saveAsZip = document.getElementById('saveAsZip');
const pendingWrap = document.getElementById('pendingWrap');
const pendingList = document.getElementById('pendingList');
const uploadToast = document.getElementById('uploadToast');
const filesList = document.getElementById('filesList');
const filesEmpty = document.getElementById('filesEmpty');
const filesCount = document.getElementById('filesCount');
const listView = document.getElementById('listView');
const calendarView = document.getElementById('calendarView');
const viewListBtn = document.getElementById('viewListBtn');
const viewCalBtn = document.getElementById('viewCalBtn');
const calTitle = document.getElementById('calTitle');
const calGrid = document.getElementById('calGrid');
const calPrev = document.getElementById('calPrev');
const calNext = document.getElementById('calNext');
const calDayTitle = document.getElementById('calDayTitle');
const dayFilesList = document.getElementById('dayFilesList');
const dayFilesEmpty = document.getElementById('dayFilesEmpty');
const textForm = document.getElementById('textForm');
const textInput = document.getElementById('textInput');
const textsList = document.getElementById('textsList');
const textsEmpty = document.getElementById('textsEmpty');
const refreshBtn = document.getElementById('refreshBtn');
const storageFill = document.getElementById('storageFill');
const storageFree = document.getElementById('storageFree');
const storagePct = document.getElementById('storagePct');
const storageTrack = document.getElementById('storageTrack');

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

/** Werkt ook op http:// (zonder Clipboard API / secure context). */
async function copyToClipboard(text) {
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : null;
  if (clip && typeof clip.writeText === 'function') {
    try {
      await clip.writeText(text);
      return true;
    } catch {
      /* fallback */
    }
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.width = '1px';
  ta.style.height = '1px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

function showToast(el, message, ok = true) {
  el.textContent = message;
  el.hidden = false;
  el.className = `toast ${ok ? 'ok' : 'err'}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.hidden = true;
  }, 4000);
}

function updateFileSelection() {
  const files = fileInput.files;
  const n = files?.length ?? 0;

  selectedHint.textContent =
    n === 0
      ? 'Geen bestanden geselecteerd'
      : n === 1
        ? '1 bestand geselecteerd'
        : `${n} bestanden geselecteerd`;

  pendingList.innerHTML = '';
  pendingWrap.hidden = n === 0;

  for (let i = 0; i < n; i++) {
    const file = files[i];
    const li = document.createElement('li');
    li.className = 'item pending-item';
    li.innerHTML = `
      <div class="item-main">
        <div class="item-name" title="${escapeAttr(file.name)}">${escapeHtml(file.name)}</div>
        <div class="item-meta">${formatBytes(file.size)}</div>
      </div>
    `;
    pendingList.appendChild(li);
  }

  uploadBtn.disabled = n === 0;
}

fileInput.addEventListener('change', updateFileSelection);

['dragenter', 'dragover'].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (e) => {
  fileInput.files = e.dataTransfer.files;
  updateFileSelection();
});

/* ---------- gedeelde bestanden: lijst- en kalenderweergave ---------- */

const NL_MONTHS = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
];

const PREVIEW_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.avif',
  '.bmp',
  '.tif',
  '.tiff',
  '.svg',
  '.pdf',
]);

let allFiles = [];
let viewMode = 'list';
let selectedDay = null;
let calCursor = null;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Lokale kalenderdag (YYYY-MM-DD) van een timestamp. */
function localDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayKey() {
  return localDayKey(Date.now());
}

function dayTitle(key) {
  const s = new Date(`${key}T12:00:00`).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fileExtLabel(file) {
  const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
  return m ? m[1].toUpperCase().slice(0, 4) : 'FILE';
}

function hasPreview(file) {
  const mime = file.mimeType || '';
  if (mime.startsWith('image/') || mime === 'application/pdf') return true;
  const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
  return m ? PREVIEW_EXTENSIONS.has(`.${m[1].toLowerCase()}`) : false;
}

/** Thumbnail met de bestandsextensie als terugvaloptie (als er geen preview is). */
function thumbHtml(file) {
  const label = escapeHtml(fileExtLabel(file));
  if (!hasPreview(file)) {
    return `<div class="item-thumb" aria-hidden="true"><span class="thumb-label">${label}</span></div>`;
  }
  return `
    <div class="item-thumb">
      <span class="thumb-label">${label}</span>
      <img class="thumb-img" src="/api/files/${file.id}/thumbnail" alt="" loading="lazy" decoding="async" onerror="this.remove()" />
    </div>`;
}

function fileItemHtml(file) {
  return `
    <li class="item">
      ${thumbHtml(file)}
      <div class="item-main">
        <div class="item-name" title="${escapeAttr(file.name)}">${escapeHtml(file.name)}</div>
        <div class="item-meta">
          ${formatBytes(file.size)} · ${formatDate(file.createdAt)}
          ${file.deleteAfterDownload ? '<span class="flag">· verwijder na download</span>' : ''}
        </div>
      </div>
      <div class="item-actions">
        <a class="btn btn-sm btn-outline" href="/api/files/${file.id}/download" download>Download</a>
        <button type="button" class="btn btn-sm btn-danger" data-delete-file="${file.id}">Verwijder</button>
      </div>
    </li>`;
}

function renderFileList(listEl, emptyEl, files) {
  listEl.innerHTML = files.map(fileItemHtml).join('');
  if (emptyEl) emptyEl.classList.toggle('hidden', files.length > 0);
}

function filesByDay() {
  const map = new Map();
  for (const file of allFiles) {
    const key = localDayKey(file.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(file);
  }
  return map;
}

async function loadFiles() {
  const res = await fetch('/api/files');
  allFiles = await res.json();
  filesCount.textContent = String(allFiles.length);

  if (selectedDay === null) {
    selectedDay = allFiles.length ? localDayKey(allFiles[0].createdAt) : todayKey();
  }

  renderFiles();
}

function renderFiles() {
  if (viewMode === 'list') {
    renderFileList(filesList, filesEmpty, allFiles);
    return;
  }
  renderCalendar();
}

function renderCalendar() {
  const byDay = filesByDay();

  if (!calCursor) {
    const newest = allFiles[0];
    const ref = newest ? new Date(newest.createdAt) : new Date();
    calCursor = { year: ref.getFullYear(), month: ref.getMonth() };
  }

  const { year, month } = calCursor;
  calTitle.textContent = `${NL_MONTHS[month]} ${year}`;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // week begint op maandag
  const tKey = todayKey();

  let html = '';
  for (let i = 0; i < offset; i++) html += '<span class="cal-cell is-blank"></span>';

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    const count = byDay.get(key)?.length ?? 0;
    const classes = ['cal-cell'];
    if (count) classes.push('has-uploads');
    if (key === selectedDay) classes.push('is-selected');
    if (key === tKey) classes.push('is-today');

    html += `
      <button
        type="button"
        class="${classes.join(' ')}"
        data-day="${key}"
        role="gridcell"
        aria-selected="${key === selectedDay}"
        aria-label="${escapeAttr(dayTitle(key))}${count ? `, ${count} upload${count === 1 ? '' : 's'}` : ', geen uploads'}"
      >
        <span class="cal-daynum">${day}</span>
        ${count ? `<span class="cal-count">${count}</span>` : ''}
      </button>`;
  }

  calGrid.innerHTML = html;

  const files = byDay.get(selectedDay) ?? [];
  calDayTitle.textContent = `${dayTitle(selectedDay)} · ${files.length} bestand${files.length === 1 ? '' : 'en'}`;
  renderFileList(dayFilesList, dayFilesEmpty, files);
}

function setView(mode) {
  viewMode = mode === 'calendar' ? 'calendar' : 'list';
  const isList = viewMode === 'list';

  listView.hidden = !isList;
  calendarView.hidden = isList;
  viewListBtn.classList.toggle('is-active', isList);
  viewCalBtn.classList.toggle('is-active', !isList);
  viewListBtn.setAttribute('aria-selected', String(isList));
  viewCalBtn.setAttribute('aria-selected', String(!isList));

  renderFiles();
}

function shiftMonth(delta) {
  const base = calCursor || {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  };
  const d = new Date(base.year, base.month + delta, 1);
  calCursor = { year: d.getFullYear(), month: d.getMonth() };
  renderCalendar();
}

viewListBtn.addEventListener('click', () => setView('list'));
viewCalBtn.addEventListener('click', () => setView('calendar'));

calPrev.addEventListener('click', () => shiftMonth(-1));
calNext.addEventListener('click', () => shiftMonth(1));

calGrid.addEventListener('click', (e) => {
  const cell = e.target.closest('[data-day]');
  if (!cell) return;
  selectedDay = cell.dataset.day;
  renderCalendar();
});


const textById = new Map();

async function loadTexts() {
  const res = await fetch('/api/texts');
  const texts = await res.json();
  textsList.innerHTML = '';
  textById.clear();
  textsEmpty.classList.toggle('hidden', texts.length > 0);

  for (const t of texts) {
    textById.set(t.id, t.content);
    const li = document.createElement('li');
    li.className = 'item text-item';
    li.innerHTML = `
      <div class="item-main">
        <div class="item-name">${escapeHtml(t.content)}</div>
        <div class="item-meta">${formatDate(t.createdAt)}</div>
      </div>
      <div class="item-actions">
        <button type="button" class="btn btn-sm btn-outline" data-copy-text="${t.id}">Kopieer</button>
        <button type="button" class="btn btn-sm btn-danger" data-delete-text="${t.id}">Verwijder</button>
      </div>
    `;
    textsList.appendChild(li);
  }
}

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!fileInput.files?.length) return;

  const fd = new FormData();
  for (const f of fileInput.files) fd.append('files', f);
  fd.append('deleteAfterDownload', deleteAfterDownload.checked ? 'true' : 'false');
  fd.append('saveAsZip', saveAsZip.checked ? 'true' : 'false');

  uploadBtn.disabled = true;
  try {
    const res = await fetch('/api/files', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Upload mislukt');
    }
    const created = await res.json();
    const zipped =
      saveAsZip.checked && fileInput.files.length > 1 && created.length === 1;
    showToast(
      uploadToast,
      zipped ? 'Bestanden geüpload als zip' : 'Bestanden geüpload',
      true,
    );
    fileInput.value = '';
    updateFileSelection();
    await Promise.all([loadFiles(), loadStorage()]);
  } catch (err) {
    showToast(uploadToast, err.message, false);
  } finally {
    updateFileSelection();
  }
});

textForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = textInput.value.trim();
  if (!content) return;

  const res = await fetch('/api/texts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (res.ok) {
    textInput.value = '';
    await loadTexts();
  }
});

async function onFileListClick(e) {
  const btn = e.target.closest('[data-delete-file]');
  if (!btn) return;
  if (!confirm('Dit bestand permanent verwijderen?')) return;
  await fetch(`/api/files/${btn.dataset.deleteFile}`, { method: 'DELETE' });
  await loadFiles();
}

filesList.addEventListener('click', onFileListClick);
dayFilesList.addEventListener('click', onFileListClick);

textsList.addEventListener('click', (e) => {
  void (async () => {
    const copyBtn = e.target.closest('[data-copy-text]');
    if (copyBtn) {
      const copyId = copyBtn.dataset.copyText;
      const text = textById.get(copyId) ?? '';
      let ok = false;
      try {
        ok = await copyToClipboard(text);
      } catch {
        ok = false;
      }
      copyBtn.textContent = ok ? 'Gekopieerd!' : 'Mislukt';
      setTimeout(() => {
        copyBtn.textContent = 'Kopieer';
      }, 1500);
      return;
    }

    const deleteBtn = e.target.closest('[data-delete-text]');
    if (!deleteBtn) return;
    const id = deleteBtn.dataset.deleteText;
    if (!confirm('Deze tekst verwijderen?')) return;
    await fetch(`/api/texts/${id}`, { method: 'DELETE' });
    await loadTexts();
  })();
});

refreshBtn.addEventListener('click', async () => {
  await Promise.all([loadFiles(), loadTexts(), loadStorage()]);
});

loadFiles();
loadTexts();
loadStorage();
setInterval(() => {
  loadFiles();
  loadTexts();
  loadStorage();
}, 15000);
