import archiver from 'archiver';
import fs from 'fs';

/** Bestandsnaam voor zip: datum en tijd van opslaan (nl-NL, bestandsveilig). */
export function zipNameFromDate(date) {
  const d = date
    .toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    .replace(/\//g, '-');
  const t = date
    .toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(/:/g, '-');
  return `${d} ${t}.zip`;
}

/**
 * @param {{ path: string, name: string }[]} entries
 * @param {string} zipPath
 */
export function createZip(entries, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    for (const entry of entries) {
      archive.file(entry.path, { name: entry.name });
    }
    archive.finalize();
  });
}
