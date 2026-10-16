import { statfsSync } from 'fs';

/**
 * Schijfgebruik van het bestandssysteem waar DATA_DIR op staat.
 * @param {string} dirPath
 */
export function getDiskUsage(dirPath) {
  const stats = statfsSync(dirPath);
  const totalBytes = stats.bsize * stats.blocks;
  const freeBytes = stats.bsize * stats.bavail;
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const usedPercent =
    totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 1000) / 10) : 0;

  return {
    totalBytes,
    freeBytes,
    usedBytes,
    usedPercent,
  };
}
