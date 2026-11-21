import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prepareScript = path.join(rootDir, 'resources', 'windows', 'prepare-install.ps1');
const isWin = process.platform === 'win32';

function findPowershell() {
  const windir = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const candidate = path.join(windir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return fs.existsSync(candidate) ? candidate : 'powershell.exe';
}

function findCsc() {
  if (!isWin) return null;
  const windir = process.env.WINDIR || 'C:\\Windows';
  const candidates = [
    path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function findMakensis() {
  if (!isWin) return null;
  const candidates = [
    process.env.MAKENSIS,
    'C:\\Program Files (x86)\\NSIS\\makensis.exe',
    'C:\\Program Files\\NSIS\\makensis.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

const powershell = isWin ? findPowershell() : null;
const csc = findCsc();
const makensis = findMakensis();
const tmpUnsafe = /[ "]/.test(os.tmpdir());

function runPrepare(installDir, extraEnv = {}) {
  const env = {
    ...process.env,
    ONLYKEY_SKIP_REBOOT_DELETE: '1',
    ...extraEnv,
  };
  if (installDir === undefined) delete env.ONLYKEY_INSTALL_DIR;
  else env.ONLYKEY_INSTALL_DIR = installDir;
  return spawnSync(
    powershell,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', prepareScript],
    { env, encoding: 'utf8', windowsHide: true }
  );
}

function makeDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const names = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else names.push(entry.name);
    }
  };
  walk(dir);
  return names;
}

async function spawnExe(exe, args = [], options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return spawn(exe, args, options);
    } catch (error) {
      lastError = error;
      const code = error && typeof error === 'object' ? error.code : undefined;
      if (!['UNKNOWN', 'EPERM', 'EACCES', 'EBUSY'].includes(code) || attempt === 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw lastError;
}

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const HOLD_PS1 = `
$share = if ($env:ONLYKEY_HOLD_SHARE -eq 'rename') {
  [System.IO.FileShare]::Read -bor [System.IO.FileShare]::Delete
} else {
  [System.IO.FileShare]::None
}
$stream = [System.IO.File]::Open(
  $env:ONLYKEY_HOLD_PATH,
  [System.IO.FileMode]::Open,
  [System.IO.FileAccess]::Read,
  $share)
Set-Content -LiteralPath $env:ONLYKEY_HOLD_READY -Value ready -Encoding ASCII
while ($true) { Start-Sleep -Seconds 2 }
`;

function holdFile(filePath, share) {
  const holderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ok-hold-'));
  const ready = path.join(holderDir, 'ready.txt');
  const script = path.join(holderDir, 'hold.ps1');
  fs.writeFileSync(script, HOLD_PS1);
  const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-File', script], {
    env: {
      ...process.env,
      ONLYKEY_HOLD_PATH: filePath,
      ONLYKEY_HOLD_READY: ready,
      ONLYKEY_HOLD_SHARE: share,
    },
    windowsHide: true,
    stdio: 'ignore',
  });
  return {
    child,
    ready,
    async untilLocked() {
      await waitFor(() => child.exitCode !== null || fs.existsSync(ready), 10000, 'file lock');
      if (!fs.existsSync(ready)) {
        throw new Error(`holder exited ${child.exitCode} before locking ${filePath}`);
      }
    },
    async release() {
      if (child.exitCode === null) child.kill();
      await waitFor(() => child.exitCode !== null, 5000, 'holder exit').catch(() => {});
      fs.rmSync(holderDir, { recursive: true, force: true });
    },
  };
}

describe.skipIf(!isWin)('prepare-install.ps1', () => {
  it('exits 0 when the install directory does not exist yet', () => {
    const missing = path.join(os.tmpdir(), `ok-missing-${process.pid}-${Date.now()}`);
    const result = runPrepare(missing);
    expect(result.status).toBe(0);
  });

  it('exits 1 when ONLYKEY_INSTALL_DIR is not set', () => {
    const result = runPrepare(undefined);
    expect(result.status).toBe(1);
  });

  it('removes the previous install, including read-only files and empty folders', () => {
    const dir = makeDir('ok-ro-');
    try {
      const nested = path.join(dir, 'locales');
      fs.mkdirSync(nested);
      const readme = path.join(dir, 'readme.txt');
      const legacy = path.join(nested, 'en.pak');
      const pending = path.join(dir, `old.dll.pending-delete-${'ab'.repeat(16)}`);
      fs.writeFileSync(readme, 'readme');
      fs.writeFileSync(legacy, 'pak');
      fs.chmodSync(legacy, 0o444);
      fs.writeFileSync(pending, 'stale');

      const result = runPrepare(dir);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(fs.existsSync(readme)).toBe(false);
      expect(fs.existsSync(legacy)).toBe(false);
      expect(fs.existsSync(nested)).toBe(false);
      expect(fs.existsSync(pending)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deletes an unlocked pending-delete file and leaves the new payload', () => {
    const dir = makeDir('ok-pending-');
    const pending = path.join(dir, `d3dcompiler_47.dll.pending-delete-${'cd'.repeat(16)}`);
    const current = path.join(dir, 'nw.exe');
    fs.writeFileSync(pending, 'old');
    fs.writeFileSync(current, 'new');
    try {
      const result = runPrepare(dir, { ONLYKEY_REMOVE_PENDING: '1' });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(fs.existsSync(pending)).toBe(false);
      expect(fs.readFileSync(current, 'utf8')).toBe('new');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renames a file that can be moved but not overwritten', async () => {
    const dir = makeDir('ok-lock-');
    const dll = path.join(dir, 'd3dcompiler_47.dll');
    fs.writeFileSync(dll, 'old-bytes');
    const holder = holdFile(dll, 'rename');
    try {
      await holder.untilLocked();
      const result = runPrepare(dir);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(fs.existsSync(dll)).toBe(false);
      const pending = fs.readdirSync(dir).filter((name) => name.includes('.pending-delete-'));
      expect(pending).toHaveLength(1);
      expect(fs.readFileSync(path.join(dir, pending[0]), 'utf8')).toBe('old-bytes');
    } finally {
      await holder.release();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a file that cannot be moved', async () => {
    const dir = makeDir('ok-stuck-');
    const dll = path.join(dir, 'd3dcompiler_47.dll');
    fs.writeFileSync(dll, 'old-bytes');
    const holder = holdFile(dll, 'keep');
    try {
      await holder.untilLocked();
      const result = runPrepare(dir);
      expect(result.status).toBe(2);
      expect(fs.existsSync(dll)).toBe(true);
      expect(fs.readdirSync(dir).some((name) => name.includes('pending-delete'))).toBe(false);
    } finally {
      await holder.release();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not follow a junction out of the install directory', () => {
    const dir = makeDir('ok-link-');
    const outside = makeDir('ok-outside-');
    const secret = path.join(outside, 'secret.txt');
    try {
      fs.writeFileSync(secret, 'keep');
      fs.chmodSync(secret, 0o444);
      fs.symlinkSync(outside, path.join(dir, 'linked'), 'junction');
      fs.writeFileSync(path.join(dir, 'local.txt'), 'local');

      const result = runPrepare(dir);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(() => fs.accessSync(secret, fs.constants.W_OK)).toThrow();
      expect(fs.readFileSync(secret, 'utf8')).toBe('keep');
      expect(fs.existsSync(path.join(dir, 'local.txt'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'linked'))).toBe(false);
    } finally {
      try { fs.rmdirSync(path.join(dir, 'linked')); } catch { /* junction was not created */ }
      try { fs.chmodSync(secret, 0o666); } catch { /* secret was not created */ }
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('refuses a subst drive root without treating it as an install folder', () => {
    const letter = 'ZYXWVUTSRQPONMLKJIHGFED'.split('').find((entry) => !fs.existsSync(`${entry}:\\`));
    if (!letter) return;
    const target = makeDir('ok-subst-');
    const mapped = spawnSync('subst', [`${letter}:`, target], { windowsHide: true });
    if (mapped.status !== 0) {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    }
    try {
      fs.writeFileSync(path.join(target, 'marker.txt'), 'marker');
      const result = runPrepare(`${letter}:\\`);
      expect(result.status).toBe(3);
      expect(fs.readFileSync(path.join(target, 'marker.txt'), 'utf8')).toBe('marker');
    } finally {
      spawnSync('subst', [`${letter}:`, '/d'], { windowsHide: true });
      fs.rmSync(target, { recursive: true, force: true });
    }
  });
});

const SLEEPER_CS = `using System.Threading;
public class OnlyKeySetupSleeper {
  public static void Main() { Thread.Sleep(Timeout.Infinite); }
}
`;

describe.skipIf(!isWin || !csc)('prepare-install.ps1 process filter', () => {
  let buildDir;
  let sleeperExe;

  beforeAll(() => {
    buildDir = makeDir('ok-sleeper-src-');
    const source = path.join(buildDir, 'sleeper.cs');
    sleeperExe = path.join(buildDir, 'sleeper.exe');
    fs.writeFileSync(source, SLEEPER_CS);
    const compiled = spawnSync(csc, ['/nologo', '/target:exe', `/out:${sleeperExe}`, source], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (compiled.status !== 0) {
      throw new Error(`csc failed\n${compiled.stdout}\n${compiled.stderr}`);
    }
  });

  afterAll(() => {
    if (buildDir) fs.rmSync(buildDir, { recursive: true, force: true });
  });

  it('stops a process running from the install directory and leaves one outside it', async () => {
    const inside = makeDir('ok-in-');
    const outside = makeDir('ok-out-');
    const insideExe = path.join(inside, 'sleeper.exe');
    const outsideExe = path.join(outside, 'sleeper.exe');
    fs.copyFileSync(sleeperExe, insideExe);
    fs.copyFileSync(sleeperExe, outsideExe);
    const insideProc = await spawnExe(insideExe, [], { stdio: 'ignore', windowsHide: true });
    const outsideProc = await spawnExe(outsideExe, [], { stdio: 'ignore', windowsHide: true });
    try {
      await waitFor(() => insideProc.pid > 0 && outsideProc.pid > 0, 5000, 'sleeper start');
      await new Promise((resolve) => setTimeout(resolve, 300));
      const result = runPrepare(inside);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      await waitFor(() => insideProc.exitCode !== null, 5000, 'inside sleeper exit');
      expect(outsideProc.exitCode).toBe(null);
    } finally {
      if (insideProc.exitCode === null) insideProc.kill();
      if (outsideProc.exitCode === null) outsideProc.kill();
      await waitFor(
        () => insideProc.exitCode !== null && outsideProc.exitCode !== null,
        5000,
        'sleeper cleanup'
      ).catch(() => {});
      fs.rmSync(inside, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

function esc(p) {
  return p.replace(/\\/g, '\\\\');
}

function fillTemplate(template, vars) {
  return Object.entries(vars).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)), template);
}

function removeTestSetupLeftovers() {
  const keys = [
    'HKLM\\Software\\OnlyKeySetupTest',
    'HKLM\\Software\\WOW6432Node\\OnlyKeySetupTest',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OnlyKeySetupTest',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OnlyKeySetupTest',
  ];
  for (const key of keys) {
    spawnSync('reg', ['delete', key, '/f'], { windowsHide: true });
  }
  const menus = [
    process.env.PROGRAMDATA && path.join(process.env.PROGRAMDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ].filter(Boolean);
  for (const menu of menus) {
    const shortcut = path.join(menu, 'OnlyKeySetupTest.lnk');
    if (fs.existsSync(shortcut)) fs.rmSync(shortcut, { force: true });
  }
}

describe.skipIf(!isWin || !makensis || tmpUnsafe)('Windows installer file-in-use dialog', () => {
  it('replaces a locked DLL without stopping', async () => {
    const work = makeDir('ok-setup-');
    const src = path.join(work, 'payload');
    const instDir = path.join(work, 'inst');
    // Not Setup.exe: NSIS warns that name makes Windows load compatibility shims,
    // and spawning that image fails intermittently with UNKNOWN.
    const installer = path.join(work, 'OnlyKeySetupTestInstaller.exe');
    fs.mkdirSync(src);
    fs.mkdirSync(instDir);
    fs.writeFileSync(path.join(src, 'd3dcompiler_47.dll'), 'new-bytes');
    const instDll = path.join(instDir, 'd3dcompiler_47.dll');
    fs.writeFileSync(instDll, 'old-bytes');
    fs.writeFileSync(path.join(instDir, 'obsolete.txt'), 'old-install');
    const legacyDir = path.join(instDir, 'locales');
    fs.mkdirSync(legacyDir);
    const legacy = path.join(legacyDir, 'legacy.pak');
    fs.writeFileSync(legacy, 'legacy');
    fs.chmodSync(legacy, 0o444);

    const nsi = fillTemplate(
      fs.readFileSync(path.join(rootDir, 'resources', 'windows', 'installer.nsi'), 'utf8'),
      {
        name: 'OnlyKeySetupTest',
        productName: 'OnlyKey Setup Test',
        version: '6.0.0',
        versionQuad: '6.0.0.0',
        companyName: 'Test',
        src: esc(src),
        dest: esc(installer),
        icon: esc(path.join(rootDir, 'resources', 'windows', 'icon.ico')),
        setupIcon: esc(path.join(rootDir, 'resources', 'windows', 'setup-icon.ico')),
        banner: esc(path.join(rootDir, 'resources', 'windows', 'setup-banner.bmp')),
        prepareScript: esc(prepareScript),
      }
    ).replace('RequestExecutionLevel admin', 'RequestExecutionLevel user');
    const nsiPath = path.join(work, 'installer.nsi');
    fs.writeFileSync(nsiPath, nsi);
    const compiled = spawnSync(makensis, [nsiPath], { encoding: 'utf8', windowsHide: true });
    if (compiled.status !== 0) {
      throw new Error(`makensis exited ${compiled.status}\n${compiled.stdout}\n${compiled.stderr}`);
    }

    const holder = holdFile(instDll, 'rename');
    let proc;
    try {
      await holder.untilLocked();
      proc = await spawnExe(installer, ['/S', `/D=${instDir}`], {
        env: { ...process.env, ONLYKEY_SKIP_REBOOT_DELETE: '1' },
        windowsHide: true,
        stdio: 'ignore',
      });
      const code = await Promise.race([
        new Promise((resolve) => proc.once('exit', resolve)),
        new Promise((resolve) => proc.once('error', resolve)),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 45000)),
      ]);
      if (code instanceof Error) throw code;
      if (code === 'timeout') {
        throw new Error('installer timed out, likely stopped on a file-in-use dialog');
      }
      expect(code).toBe(0);
      expect(fs.readFileSync(instDll, 'utf8')).toBe('new-bytes');
      expect(fs.existsSync(path.join(instDir, 'obsolete.txt'))).toBe(false);
      expect(fs.existsSync(legacy)).toBe(false);
      expect(fs.existsSync(legacyDir)).toBe(false);
      const names = listFiles(instDir);
      for (const name of names) {
        const allowed =
          name === 'd3dcompiler_47.dll' ||
          name === 'uninstall.exe' ||
          /\.pending-delete-[0-9a-f]{32}$/i.test(name);
        expect(allowed, name).toBe(true);
      }
      await holder.release();
      const swept = runPrepare(instDir, { ONLYKEY_REMOVE_PENDING: '1' });
      expect(swept.status, swept.stdout + swept.stderr).toBe(0);
      expect(listFiles(instDir).some((name) => name.includes('pending-delete'))).toBe(false);
      expect(fs.readFileSync(instDll, 'utf8')).toBe('new-bytes');
    } finally {
      if (proc && proc.exitCode === null) proc.kill();
      await holder.release();
      removeTestSetupLeftovers();
      fs.rmSync(work, { recursive: true, force: true });
    }
  }, 90000);
});
