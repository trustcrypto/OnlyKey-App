declare const nw: any;
declare const require: NodeRequire;

/**
 * Directory that contains `desktopBg.cjs` / packaged `package.json`.
 *
 * Finder-launched macOS sets `nw.App.startPath` to `/` (cwd), so callers must
 * not `require(startPath + '/package.json')` without this probe.
 * Candidate list matches the previous `initDesktop.ts` helper.
 */
export function resolveAppRoot(): string {
  const path = require('path') as typeof import('path');
  const fs = require('fs') as typeof import('fs');
  const candidates: string[] = [];
  try {
    if (nw.App?.startPath) candidates.push(nw.App.startPath);
  } catch {
    // ignore
  }
  try {
    if (process.platform === 'darwin' && process.execPath) {
      candidates.push(path.resolve(path.dirname(process.execPath), '..', 'Resources', 'app.nw'));
    }
  } catch {
    // ignore
  }
  try {
    if (process.execPath) candidates.push(path.dirname(process.execPath));
  } catch {
    // ignore
  }
  try {
    candidates.push(process.cwd());
  } catch {
    // ignore
  }
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'desktopBg.cjs'))) return dir;
  }
  return nw.App.startPath;
}
