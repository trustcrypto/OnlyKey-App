import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Builds a temporary NW entry from the built dist/index.html plus tray verification.
 * dist/index.html is the exact npm start entry; inject_js_start is unreliable on it.
 */
export function buildDistTrayVerifyEntry() {
  const distIndex = path.join(rootDir, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    throw new Error('dist/index.html missing — run npm run build first.');
  }

  const appendScript = fs.readFileSync(
    path.join(rootDir, 'tests', 'desktop', 'tray-verify-append.js'),
    'utf8'
  );
  const distHtml = fs.readFileSync(distIndex, 'utf8');
  const verifyHtml = distHtml.replace(
    '</body>',
    `<script>\n${appendScript}\n</script>\n</body>`
  );

  const outDir = path.join(rootDir, 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'tray-verify-entry.html');
  fs.writeFileSync(outPath, verifyHtml);
  return path.relative(rootDir, outPath).replace(/\\/g, '/');
}