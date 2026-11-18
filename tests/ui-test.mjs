/**
 * Headless interactietest van de fileshare-UI (jsdom).
 * Draait zonder browser en zonder server:  node tests/ui-test.mjs
 *
 * Getest gedrag dat een syntaxcheck niet vangt: de 3-koloms layout, de
 * kalenderdag-selectie, thumbnails (en het openen van een afbeelding) en de
 * snippet-popup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

// Lokale tijdstippen: de dagsleutel is dan tijdzone-onafhankelijk.
const d = (y, m, day, hour = 12) => new Date(y, m - 1, day, hour, 0, 0).getTime();

const FILES = [
  { id: 'f2', name: 'rapport.pdf', size: 400000, mimeType: 'application/pdf', deleteAfterDownload: false, createdAt: d(2026, 11, 18, 11) },
  { id: 'f1', name: 'DJI_0574.JPG', size: 3200000, mimeType: 'image/jpeg', deleteAfterDownload: false, createdAt: d(2026, 11, 18, 10) },
  { id: 'f3', name: 'notities.txt', size: 1200, mimeType: 'text/plain', deleteAfterDownload: true, createdAt: d(2026, 11, 2) },
  { id: 'f4', name: 'backup.zip', size: 9000000, mimeType: 'application/zip', deleteAfterDownload: false, createdAt: d(2026, 10, 15) },
];

const SNIPPETS = [
  { id: 't1', content: 'eerste regel van de snippet\ntweede regel met meer tekst', createdAt: d(2026, 11, 17, 9) },
  { id: 't2', content: 'losse regel', createdAt: d(2026, 11, 16, 9) },
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
check(
  'kalender en bestandenlijst zijn tegelijk zichtbaar (geen toggle)',
  q('#calGrid') !== null && q('#filesList') !== null && q('#viewListBtn') === null,
);

/* ---------- bestandenlijst + thumbnails ---------- */

check('lijst toont alle bestanden', qa('#filesList .item').length === 4, `${qa('#filesList .item').length} items`);
check('badge toont aantal bestanden', q('#filesCount').textContent === '4', q('#filesCount').textContent);
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

/* ---------- kalender ---------- */

check('maandtitel volgt de nieuwste upload', q('#calTitle').textContent === 'november 2026', q('#calTitle').textContent);
check('kalenderbadge telt de uploads van de maand', q('#calBadge').textContent === '3', q('#calBadge').textContent);

const uploadCells = qa('#calGrid .cal-cell.has-uploads');
check('twee dagen zijn gemarkeerd in november', uploadCells.length === 2, `${uploadCells.length} cellen`);
check('de dag met twee uploads toont een telling', q('[data-day="2026-11-18"] .cal-count')?.textContent === '2');
check('nieuwste uploaddag is standaard geselecteerd', q('[data-day="2026-11-18"]').classList.contains('is-selected'));
check('daglijst toont de bestanden van de geselecteerde dag', qa('#dayFilesList .item').length === 2, `${qa('#dayFilesList .item').length} items`);
check('daglijst heeft thumbnails', qa('#dayFilesList .thumb-img').length === 2);
check('dagtitel noemt de dag en het aantal', q('#calDayTitle').textContent.includes('18 november 2026'), q('#calDayTitle').textContent);

await click(q('[data-day="2026-11-02"]'));
check('andere dag wijzigt de daglijst', qa('#dayFilesList .item').length === 1, `${qa('#dayFilesList .item').length} items`);
check('daglijst toont het bestand van die dag', qa('#dayFilesList .item-name')[0].textContent === 'notities.txt');
check('selectie is verplaatst', q('[data-day="2026-11-02"]').classList.contains('is-selected'));
check('de bestandenlijst blijft intussen volledig', qa('#filesList .item').length === 4);

await click(q('[data-day="2026-11-05"]'));
check('dag zonder uploads geeft lege daglijst', qa('#dayFilesList .item').length === 0);
check('lege-dagmelding is zichtbaar', q('#dayFilesEmpty').classList.contains('hidden') === false);

await click(q('#calPrev'));
check('vorige maand in de titel', q('#calTitle').textContent === 'oktober 2026', q('#calTitle').textContent);
check('oktober toont de uploaddag van 15-10', qa('#calGrid .cal-cell.has-uploads').length === 1);
check('kalenderbadge volgt de maand', q('#calBadge').textContent === '1', q('#calBadge').textContent);
await click(q('#calNext'));
check('volgende maand terug naar november', q('#calTitle').textContent === 'november 2026');

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

/* ---------- rapportage ---------- */

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.extra ? `  [${c.extra}]` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks geslaagd`);
process.exit(failed ? 1 : 0);
