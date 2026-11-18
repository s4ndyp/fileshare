/**
 * Headless interactietest van de fileshare-UI (jsdom).
 * Draait zonder browser en zonder server:  node tests/ui-test.mjs
 *
 * Getest gedrag dat een syntaxcheck niet vangt: de 3-koloms layout, de kalender
 * als filter voor de bestandenlijst (met "Alles tonen"), thumbnails (en het
 * openen van een afbeelding) en de snippet-popup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

// Datums relatief aan vandaag (lokale tijd), zodat de test tijdzone- en
// maand-onafhankelijk blijft.
const NOW = new Date();
const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const TODAY = dayKey(NOW);
const firstOfMonth = (offset) => new Date(NOW.getFullYear(), NOW.getMonth() + offset, 1, 12, 0, 0).getTime();
const todayAt = (hour) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), hour, 0, 0).getTime();

const FILES = [
  { id: 'f2', name: 'rapport.pdf', size: 400000, mimeType: 'application/pdf', deleteAfterDownload: false, createdAt: todayAt(11) },
  { id: 'f1', name: 'DJI_0574.JPG', size: 3200000, mimeType: 'image/jpeg', deleteAfterDownload: false, createdAt: todayAt(10) },
  { id: 'f3', name: 'notities.txt', size: 1200, mimeType: 'text/plain', deleteAfterDownload: true, createdAt: firstOfMonth(0) },
  { id: 'f4', name: 'backup.zip', size: 9000000, mimeType: 'application/zip', deleteAfterDownload: false, createdAt: firstOfMonth(-1) },
];

const PREV_MONTH_KEY = dayKey(firstOfMonth(-1));
const todayCount = FILES.filter((f) => dayKey(f.createdAt) === TODAY).length;
const thisMonthPrefix = TODAY.slice(0, 7);
const thisMonthCount = FILES.filter((f) => dayKey(f.createdAt).startsWith(thisMonthPrefix)).length;
const uploadDaysThisMonth = new Set(
  FILES.filter((f) => dayKey(f.createdAt).startsWith(thisMonthPrefix)).map((f) => dayKey(f.createdAt)),
).size;
const monthName = new Date(NOW.getFullYear(), NOW.getMonth(), 1).toLocaleDateString('nl-NL', {
  month: 'long',
  year: 'numeric',
});
const todayLabel = new Date(`${TODAY}T12:00:00`)
  .toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  .toLowerCase();

const SNIPPETS = [
  { id: 't1', content: 'eerste regel van de snippet\ntweede regel met meer tekst', createdAt: todayAt(9) },
  { id: 't2', content: 'losse regel', createdAt: todayAt(8) },
];

const checks = [];
function check(name, ok, extra = '') {
  checks.push({ name, ok: Boolean(ok), extra });
}

const html = fs
  .readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
  .replace(/<script[^>]*><\/script>/g, '');

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://fileshare.test/' });
const w = dom.window;
const doc = w.document;

const tick = () => new Promise((r) => setTimeout(r, 30));
const calls = [];

w.fetch = async (url, opts = {}) => {
  const u = String(url);
  calls.push(`${opts.method || 'GET'} ${u}`);
  if (u.startsWith('/api/storage')) {
    return { ok: true, status: 200, json: async () => ({ freeBytes: 1000, usedPercent: 50 }) };
  }
  if (u.startsWith('/api/files')) {
    if (opts.method === 'DELETE' && u === '/api/files') {
      return { ok: true, status: 200, json: async () => ({ deleted: FILES.length }) };
    }
    return { ok: true, status: 200, json: async () => FILES };
  }
  if (u.startsWith('/api/texts')) {
    return { ok: true, status: 200, json: async () => SNIPPETS };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

w.confirm = () => true;
w.alert = () => {};

w.eval(fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8'));
await tick();

const q = (sel) => doc.querySelector(sel);
const qa = (sel) => [...doc.querySelectorAll(sel)];
const click = async (el) => {
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await tick();
};
const key = async (el, k) => {
  el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  await tick();
};

/* ---------- layout ---------- */

check('brede uploadkaart aanwezig', q('.card-upload') !== null);
check(
  'uploadopties staan in de brede kaart',
  q('.card-upload .upload-side #saveAsZip') !== null && q('.card-upload .upload-side #deleteAfterDownload') !== null,
);
check('opslaan-knop staat bij de opties', q('.card-upload .upload-side #uploadBtn') !== null);
check('dropzone staat in dezelfde kaart', q('.card-upload #dropzone') !== null);
check('snippet-invoer in de derde kolom', q('.card-snippet-new #textForm') !== null);
check('kalender-, bestanden- en snippetskaart bestaan', q('.card-calendar') !== null && q('.card-files') !== null && q('.card-snippets') !== null);
check('geen bestandenlijst meer onder de kalender', q('#dayFilesList') === null && q('#calDayTitle') === null);
check('knop "Alles tonen" staat boven de kalender', q('.card-calendar #showAllBtn') !== null);

/* ---------- kalender opent op vandaag en filtert de lijst ---------- */

check('kalender opent op de huidige maand', q('#calTitle').textContent === monthName, `${q('#calTitle').textContent} vs ${monthName}`);
check('vandaag is geselecteerd', q(`[data-day="${TODAY}"]`)?.classList.contains('is-selected') === true);
check('kalenderbadge telt de uploads van deze maand', q('#calBadge').textContent === String(thisMonthCount), `${q('#calBadge').textContent} vs ${thisMonthCount}`);
check('gemarkeerde dagen kloppen', qa('#calGrid .cal-cell.has-uploads').length === uploadDaysThisMonth, `${qa('#calGrid .cal-cell.has-uploads').length} vs ${uploadDaysThisMonth}`);
check('de lijst is gefilterd op vandaag', qa('#filesList .item').length === todayCount, `${qa('#filesList .item').length} vs ${todayCount}`);
check('filterlabel noemt de dag', q('#filesFilter').textContent.toLowerCase().includes(todayLabel), q('#filesFilter').textContent);

/* ---------- andere dag kiezen filtert de lijst ---------- */

await click(q('#calPrev'));
check('vorige maand in de titel', q('#calTitle').textContent !== monthName, q('#calTitle').textContent);
check('kalenderbadge volgt de maand', q('#calBadge').textContent === '1', q('#calBadge').textContent);
await click(q(`[data-day="${PREV_MONTH_KEY}"]`));
check('gekozen dag filtert de bestandenlijst', qa('#filesList .item').length === 1, `${qa('#filesList .item').length} items`);
check('de lijst toont het bestand van die dag', qa('#filesList .item-name')[0].textContent === 'backup.zip');
check('de badge telt de gefilterde bestanden', q('#filesCount').textContent === '1', q('#filesCount').textContent);
check('selectie staat op de gekozen dag', q(`[data-day="${PREV_MONTH_KEY}"]`).classList.contains('is-selected'));

/* ---------- "Alles tonen" wist het filter ---------- */

await click(q('#showAllBtn'));
check('alles tonen toont alle bestanden', qa('#filesList .item').length === 4, `${qa('#filesList .item').length} items`);
check('filterlabel zegt "Alle bestanden"', q('#filesFilter').textContent === 'Alle bestanden', q('#filesFilter').textContent);
check('geen dag meer geselecteerd', qa('#calGrid .cal-cell.is-selected').length === 0);
check('badge toont alle bestanden', q('#filesCount').textContent === '4');

/* ---------- opnieuw een dag kiezen (vandaag) ---------- */

await click(q('#calNext'));
await click(q(`[data-day="${TODAY}"]`));
check('opnieuw filteren op vandaag werkt', qa('#filesList .item').length === todayCount, `${qa('#filesList .item').length} vs ${todayCount}`);
check('filterlabel terug naar de dag', q('#filesFilter').textContent !== 'Alle bestanden', q('#filesFilter').textContent);

/* ---------- bestandenlijst + thumbnails ---------- */

await click(q('#showAllBtn'));
check('afbeelding en pdf krijgen een thumbnail-img', qa('#filesList .thumb-img').length === 2, `${qa('#filesList .thumb-img').length} thumbs`);
check(
  'thumbnail-url wijst naar het bestand',
  qa('#filesList .thumb-img').map((i) => i.getAttribute('src')).includes('/api/files/f1/thumbnail'),
);
check('thumbnail van een afbeelding is klikbaar', q('#filesList [data-preview-file="f1"]') !== null);
check('thumbnail van een pdf is niet klikbaar', q('#filesList [data-preview-file="f2"]') === null);
check(
  'zip toont een extensielabel zonder img',
  qa('#filesList .item')[3].querySelector('.thumb-label')?.textContent === 'ZIP' &&
    qa('#filesList .item')[3].querySelector('.thumb-img') === null,
);

/* ---------- voorvertoning van een afbeelding ---------- */

check('lightbox start verborgen', q('#lightbox').hidden === true);
await click(q('#filesList [data-preview-file="f1"]'));
check('klik op de thumbnail opent de voorvertoning', q('#lightbox').hidden === false);
check('voorvertoning toont de afbeelding inline', q('#lightboxImg').getAttribute('src') === '/api/files/f1/preview', q('#lightboxImg').getAttribute('src'));
check('voorvertoning toont de bestandsnaam', q('#lightboxName').textContent === 'DJI_0574.JPG');
check('voorvertoning heeft een downloadlink', q('#lightboxDownload').getAttribute('href') === '/api/files/f1/download');
await click(q('#lightbox [data-lightbox-close]'));
check('sluiten verbergt de voorvertoning', q('#lightbox').hidden === true);
await click(q('#filesList [data-preview-file="f1"]'));
await key(doc.body, 'Escape');
check('Escape sluit de voorvertoning', q('#lightbox').hidden === true);

/* ---------- snippets ---------- */

check('snippets tellen in de badge', q('#textsCount').textContent === '2', q('#textsCount').textContent);
check('snippet is één regel', qa('#textsList .snippet-item').length === 2 && qa('#textsList .snippet-line').length === 2);
check('snippet toont alleen de eerste regel', qa('#textsList .snippet-line')[0].textContent === 'eerste regel van de snippet', qa('#textsList .snippet-line')[0].textContent);
check('snippet-popup start verborgen', q('#snippetModal').hidden === true);

await click(q('#textsList [data-snippet="t1"]'));
check('klik op een snippet opent de popup', q('#snippetModal').hidden === false);
check('popup toont de volledige tekst', q('#snippetModalText').textContent === SNIPPETS[0].content);
check('popup toont de datum', q('#snippetModalDate').textContent.length > 0);
await click(q('#snippetModal [data-snippet-close]'));
check('sluiten verbergt de popup', q('#snippetModal').hidden === true);

await key(q('#textsList [data-snippet="t2"]'), 'Enter');
check('Enter opent de popup ook (toetsenbord)', q('#snippetModal').hidden === false);
check('popup toont de tweede snippet', q('#snippetModalText').textContent === 'losse regel');
await click(q('#snippetModal #snippetDeleteBtn'));
check('verwijderen stuurt een DELETE', calls.includes('DELETE /api/texts/t2'), calls.filter((c) => c.startsWith('DELETE')).join(', '));
check('verwijderen sluit de popup', q('#snippetModal').hidden === true);

/* ---------- alles wissen ---------- */

check('knop "Alles wissen" staat in de header', q('header #deleteAllBtn') !== null);
check(
  'de knop staat links naast de schijfruimte',
  q('header #deleteAllBtn').nextElementSibling?.id === 'storageWidget',
);
check('bevestigingsvenster start verborgen', q('#deleteAllModal').hidden === true);

await click(q('#deleteAllBtn'));
check('eerste bevestiging opent het venster', q('#deleteAllModal').hidden === false);
check('venster noemt het aantal bestanden', q('#deleteAllText').textContent.includes('4'), q('#deleteAllText').textContent);
check('venster waarschuwt voor alle datums', q('#deleteAllText').textContent.includes('alle datums'));
check('nog geen DELETE verstuurd', !calls.includes('DELETE /api/files'), calls.filter((c) => c.startsWith('DELETE')).join(', '));

await click(q('#deleteAllModal [data-deleteall-close]'));
check('annuleren sluit het venster zonder te wissen', q('#deleteAllModal').hidden === true && !calls.includes('DELETE /api/files'));

await click(q('#deleteAllBtn'));
await click(q('#deleteAllConfirm'));
check('tweede bevestiging wist alles', calls.includes('DELETE /api/files'), calls.filter((c) => c.startsWith('DELETE')).join(', '));
check('venster sluit na het wissen', q('#deleteAllModal').hidden === true);

/* ---------- rapportage ---------- */

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.extra ? `  [${c.extra}]` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks geslaagd`);
process.exit(failed ? 1 : 0);
