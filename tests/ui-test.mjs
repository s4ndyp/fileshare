/**
 * Headless interactietest van de lijst-/kalenderweergave (jsdom).
 * Draait zonder browser en zonder server:  node tests/ui-test.mjs
 *
 * Getest gedrag dat een syntaxcheck niet vangt: modus-toggle, highlighting van
 * dagen met uploads, dagselectie en thumbnails in beide weergaven.
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

w.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith('/api/storage')) {
    return { ok: true, status: 200, json: async () => ({ freeBytes: 1000, usedPercent: 50 }) };
  }
  if (u.startsWith('/api/files')) {
    return { ok: true, status: 200, json: async () => FILES };
  }
  if (u.startsWith('/api/texts')) {
    return { ok: true, status: 200, json: async () => [] };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

w.confirm = () => false;
w.alert = () => {};

w.eval(fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8'));
await tick();

const q = (sel) => doc.querySelector(sel);
const qa = (sel) => [...doc.querySelectorAll(sel)];
const click = async (el) => {
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await tick();
};

/* ---------- lijstweergave ---------- */

check('lijst toont alle bestanden', qa('#filesList .item').length === 4, `${qa('#filesList .item').length} items`);
check('badge toont aantal', q('#filesCount').textContent === '4', q('#filesCount').textContent);
check('lijstweergave staat aan bij het laden', q('#listView').hidden === false && q('#calendarView').hidden === true);
check(
  'afbeelding en pdf krijgen een thumbnail-img',
  qa('#filesList .thumb-img').length === 2,
  `${qa('#filesList .thumb-img').length} thumbs`,
);
check(
  'thumbnail-url wijst naar het bestand',
  qa('#filesList .thumb-img').map((i) => i.getAttribute('src')).includes('/api/files/f1/thumbnail'),
);
check(
  'zip en tekst tonen een extensie-label zonder img',
  qa('#filesList .thumb-label').some((s) => s.textContent === 'ZIP') &&
    qa('#filesList .item')[3].querySelector('.thumb-img') === null,
);

/* ---------- kalenderweergave ---------- */

await click(q('#viewCalBtn'));
check('kalender verbergt de lijst', q('#listView').hidden === true && q('#calendarView').hidden === false);
check('maandtitel volgt de nieuwste upload', q('#calTitle').textContent === 'november 2026', q('#calTitle').textContent);

const uploadCells = qa('#calGrid .cal-cell.has-uploads');
check('twee dagen zijn gemarkeerd in november', uploadCells.length === 2, `${uploadCells.length} cellen`);
check(
  'de dag met twee uploads toont een telling',
  q('[data-day="2026-11-18"] .cal-count')?.textContent === '2',
  q('[data-day="2026-11-18"] .cal-count')?.textContent,
);
check('nieuwste uploaddag is standaard geselecteerd', q('[data-day="2026-11-18"]').classList.contains('is-selected'));

check('daglijst toont de bestanden van de geselecteerde dag', qa('#dayFilesList .item').length === 2, `${qa('#dayFilesList .item').length} items`);
check('daglijst heeft thumbnails', qa('#dayFilesList .thumb-img').length === 2);
check('dagtitel noemt de dag en het aantal', q('#calDayTitle').textContent.includes('18 november 2026'), q('#calDayTitle').textContent);

/* ---------- andere dag kiezen ---------- */

await click(q('[data-day="2026-11-02"]'));
check('andere dag wijzigt de daglijst', qa('#dayFilesList .item').length === 1, `${qa('#dayFilesList .item').length} items`);
check('daglijst toont het bestand van die dag', qa('#dayFilesList .item-name')[0].textContent === 'notities.txt');
check('selectie is verplaatst', q('[data-day="2026-11-02"]').classList.contains('is-selected'));
check('oude selectie is losgelaten', !q('[data-day="2026-11-18"]').classList.contains('is-selected'));

await click(q('[data-day="2026-11-05"]'));
check('dag zonder uploads geeft lege lijst', qa('#dayFilesList .item').length === 0);
check('lege-dagmelding is zichtbaar', q('#dayFilesEmpty').classList.contains('hidden') === false);

/* ---------- maandnavigatie ---------- */

await click(q('#calPrev'));
check('vorige maand in de titel', q('#calTitle').textContent === 'oktober 2026', q('#calTitle').textContent);
check('oktober toont de uploaddag van 15-10', qa('#calGrid .cal-cell.has-uploads').length === 1);
check('dagkeuze buiten de maand blijft bestaan in de daglijst', qa('#dayFilesList .item').length === 0);

await click(q('#calNext'));
check('volgende maand terug naar november', q('#calTitle').textContent === 'november 2026');

/* ---------- terug naar lijst ---------- */

await click(q('#viewListBtn'));
check('lijstweergave herstelt alle bestanden', q('#listView').hidden === false && qa('#filesList .item').length === 4);
check('kalender is weer verborgen', q('#calendarView').hidden === true);
check('toggle-status klopt', q('#viewListBtn').classList.contains('is-active') && !q('#viewCalBtn').classList.contains('is-active'));

/* ---------- rapportage ---------- */

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.extra ? `  [${c.extra}]` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks geslaagd`);
process.exit(failed ? 1 : 0);
