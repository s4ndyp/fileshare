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

async function loadFiles() {
  const res = await fetch('/api/files');
  const files = await res.json();
  filesList.innerHTML = '';
  filesCount.textContent = String(files.length);
  filesEmpty.classList.toggle('hidden', files.length > 0);

  for (const file of files) {
    const li = document.createElement('li');
    li.className = 'item';
    li.innerHTML = `
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
    `;
    filesList.appendChild(li);
  }
}

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

filesList.addEventListener('click', async (e) => {
  const id = e.target.dataset?.deleteFile;
  if (!id) return;
  if (!confirm('Dit bestand permanent verwijderen?')) return;
  await fetch(`/api/files/${id}`, { method: 'DELETE' });
  await loadFiles();
});

textsList.addEventListener('click', async (e) => {
  const copyId = e.target.dataset?.copyText;
  if (copyId) {
    const text = textById.get(copyId) ?? '';
    await navigator.clipboard.writeText(text);
    e.target.textContent = 'Gekopieerd!';
    setTimeout(() => {
      e.target.textContent = 'Kopieer';
    }, 1500);
    return;
  }
  const id = e.target.dataset?.deleteText;
  if (!id) return;
  if (!confirm('Deze tekst verwijderen?')) return;
  await fetch(`/api/texts/${id}`, { method: 'DELETE' });
  await loadTexts();
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
