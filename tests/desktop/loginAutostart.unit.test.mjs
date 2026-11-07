import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const autostart = require(path.join(rootDir, 'loginAutostart.cjs'));

const EXE = 'C:\\Program Files (x86)\\OnlyKey\\nw.exe';
const BUNDLE = '/Applications/OnlyKey App.app';
const HELPER = `${BUNDLE}/Contents/Frameworks/nwjs Framework.framework/Helpers/nwjs Helper (Renderer).app/Contents/MacOS/nwjs Helper (Renderer)`;

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ok-autostart-'));
}

describe('login autostart plans', () => {
  it('builds a Windows Run command that passes the app directory and stays hidden', () => {
    expect(autostart.windowsRunCommand(EXE)).toBe(
      '"C:\\Program Files (x86)\\OnlyKey\\nw.exe" "C:\\Program Files (x86)\\OnlyKey" --hidden --onlykey-autostart'
    );
    expect(autostart.registrationName(EXE)).toBe('OnlyKey');
    expect(autostart.registrationName('C:\\src\\OnlyKey-App\\node_modules\\nw\\nwjs\\nw.exe')).toBe('OnlyKey-dev');
  });

  it('treats StartupApproved 01 as off and 02/06 as on', () => {
    expect(autostart.approvalEnabled(null)).toBe(true);
    expect(autostart.approvalEnabled(autostart.parseApproved('02-00-00-00-00-00-00-00-00-00-00-00'))).toBe(true);
    expect(autostart.approvalEnabled(autostart.parseApproved('06-00-00-00-00-00-00-00-00-00-00-00'))).toBe(true);
    expect(autostart.approvalEnabled(autostart.parseApproved('01-00-00-00-C9-2C-7F-F8-B8-A3-DC-01'))).toBe(false);
    expect(autostart.approvalEnabled(autostart.parseApproved('03-00-00-00-00-00-00-00-00-00-00-00'))).toBe(false);
  });

  it('migrates a disabled nw Run value that points at this install', () => {
    const plan = autostart.planWindowsUpdate({
      name: 'OnlyKey',
      exePath: EXE,
      runValues: {
        OneDrive: '"C:\\Users\\me\\OneDrive.exe" /background',
        nw: '"C:\\Program Files (x86)\\OnlyKey\\nw.exe" --hidden',
      },
      approvals: { nw: '01-00-00-00-C9-2C-7F-F8-B8-A3-DC-01' },
    });
    expect(plan.enabled).toBe(true);
    expect(plan.write).toBe(autostart.windowsRunCommand(EXE));
    expect(plan.enableApproved).toBe(true);
    expect(plan.deleteRun).toEqual(['nw']);
  });

  it('does not turn a disabled OnlyKey entry back on', () => {
    const command = autostart.windowsRunCommand(EXE);
    const plan = autostart.planWindowsUpdate({
      name: 'OnlyKey',
      exePath: EXE,
      runValues: { OnlyKey: command, nw: `"${EXE}" --hidden` },
      approvals: { OnlyKey: '03-00-00-00-11-22-33-44-55-66-77-88' },
    });
    expect(plan.enabled).toBe(false);
    expect(plan.write).toBeNull();
    expect(plan.deleteRun).toEqual(['nw']);
  });

  it('leaves a correct enabled entry untouched', () => {
    const command = autostart.windowsRunCommand(EXE);
    const plan = autostart.planWindowsUpdate({
      name: 'OnlyKey',
      exePath: EXE,
      runValues: { OnlyKey: command },
      approvals: { OnlyKey: '02-00-00-00-00-00-00-00-00-00-00-00' },
    });
    expect(plan).toEqual({ enabled: true, write: null, enableApproved: false, deleteRun: [] });
  });

  it('checking the box re-enables an entry Task Manager turned off', () => {
    const plan = autostart.planWindowsUpdate({
      name: 'OnlyKey',
      exePath: EXE,
      runValues: { OnlyKey: autostart.windowsRunCommand(EXE) },
      approvals: { OnlyKey: '01-00-00-00-00-00-00-00-00-00-00-00' },
      force: true,
    });
    expect(plan.enabled).toBe(true);
    expect(plan.enableApproved).toBe(true);
  });

  it('does not treat another app\'s nw Run value as ours', () => {
    const plan = autostart.planWindowsUpdate({
      name: 'OnlyKey',
      exePath: EXE,
      runValues: { nw: '"C:\\Tools\\Other\\nw.exe" --hidden' },
      approvals: {},
    });
    expect(plan.enabled).toBe(false);
    expect(plan.deleteRun).toEqual([]);
  });

  it('launches the macOS bundle through open -gj, not the helper binary', () => {
    expect(autostart.macBundleRoot(HELPER)).toBe(BUNDLE);
    const plist = autostart.macLaunchAgentPlist(BUNDLE, 'to.crp.onlykey');
    expect(plist).toContain('<string>to.crp.onlykey</string>');
    expect(plist).toContain('<string>/usr/bin/open</string>');
    expect(plist).toContain('<string>-gj</string>');
    expect(plist).toContain(`<string>${BUNDLE}</string>`);
    expect(plist).toContain('<string>--hidden</string>');
    expect(plist).toContain('<string>--onlykey-autostart</string>');
    expect(plist).not.toContain('Helper');
    expect(autostart.macAgentIsCurrent(plist, BUNDLE)).toBe(true);
  });

  it('removes legacy Mac agents and login items that start OnlyKey, and keeps other apps', () => {
    const opts = { label: 'to.crp.onlykey', bundlePath: BUNDLE, devMode: false };
    expect(autostart.shouldRemoveMacAgent('to.crp.onlykey.plist', `<string>${BUNDLE}</string>`, opts)).toBe(false);
    expect(autostart.shouldRemoveMacAgent(
      'nwjs Helper (Renderer).plist',
      `<string>${HELPER}</string><string>--hidden</string>`,
      opts
    )).toBe(true);
    expect(autostart.shouldRemoveMacAgent(
      'OnlyKey App.plist',
      `<string>${BUNDLE}/Contents/MacOS/OnlyKey App</string>`,
      opts
    )).toBe(true);
    expect(autostart.shouldRemoveMacAgent('other.plist', '<string>/Applications/Other.app</string>', opts)).toBe(false);
    expect(autostart.shouldRemoveLoginItem({ name: 'OnlyKey App', itemPath: BUNDLE }, opts)).toBe(true);
    expect(autostart.shouldRemoveLoginItem({ name: 'Mail', itemPath: '/System/Applications/Mail.app' }, opts)).toBe(false);
    expect(autostart.shouldRemoveMacAgent(
      'OnlyKey App.plist',
      `<string>${BUNDLE}</string>`,
      { ...opts, devMode: true }
    )).toBe(true);
    expect(autostart.shouldRemoveMacAgent(
      'OnlyKey App.plist',
      '<string>/Applications/OnlyKey App.app</string>',
      { label: 'to.crp.onlykey.dev', bundlePath: '/tmp/dev/nwjs.app', devMode: true }
    )).toBe(false);
  });

  it('keeps one live Dock tile and drops stale OnlyKey icons', () => {
    const tiles = [
      { bundleId: 'to.crp.onlykey', label: 'OnlyKey App', url: 'file:///Applications/OnlyKey%20App.app/' },
      { bundleId: 'to.crp.onlykey', label: 'OnlyKey App', url: 'file:///Applications/OnlyKey%20App.app/' },
      { bundleId: 'com.apple.mail', label: 'Mail', url: 'file:///System/Applications/Mail.app/' },
      { bundleId: 'to.crp.onlykey', label: 'OnlyKey App', url: 'file:///Users/me/Downloads/OnlyKey%20App.app/' },
    ];
    const exists = (target) => target === BUNDLE || target === '/Users/me/Downloads/OnlyKey App.app';
    expect(autostart.dockTilesToDrop(tiles, BUNDLE, exists).sort()).toEqual([1, 3]);
    expect(autostart.dockTilesToDrop([tiles[0]], BUNDLE, exists)).toEqual([]);
    expect(autostart.dockTilesToDrop(
      [{ bundleId: 'to.crp.onlykey', label: 'OnlyKey App', url: 'file:///missing/OnlyKey%20App.app/' }],
      BUNDLE,
      () => false
    )).toEqual([0]);
  });

  it('parses login item listings', () => {
    const items = autostart.parseLoginItems('OnlyKey App\n/Applications/OnlyKey App.app\n---\nMail\n/System/Applications/Mail.app\n---\n');
    expect(items).toEqual([
      { name: 'OnlyKey App', itemPath: '/Applications/OnlyKey App.app' },
      { name: 'Mail', itemPath: '/System/Applications/Mail.app' },
    ]);
  });

  it('writes a Linux autostart file through onlykey-launch and honors a desktop disable', async () => {
    const home = tempHome();
    try {
      const wrapper = path.join(home, 'opt', 'onlykey-launch');
      fs.mkdirSync(path.dirname(wrapper), { recursive: true });
      fs.writeFileSync(wrapper, '#!/bin/sh\n');
      const execLine = autostart.linuxExecCommand(path.join(home, 'opt', 'nw'), (target) => target === wrapper);
      expect(execLine).toContain('--hidden --onlykey-autostart');
      expect(execLine).toContain('onlykey-launch');
      const desired = autostart.linuxDesktopContents(execLine);
      expect(autostart.linuxAutostartDisabled(desired)).toBe(false);
      expect(autostart.linuxAutostartDisabled('Hidden=true\n')).toBe(true);
      expect(autostart.linuxAutostartDisabled('X-GNOME-Autostart-enabled=false\n')).toBe(true);

      const legacy = path.join(home, '.config', 'autostart');
      fs.mkdirSync(legacy, { recursive: true });
      fs.writeFileSync(path.join(legacy, 'nw.desktop'), '[Desktop Entry]\nExec=/opt/OnlyKey/nw --hidden\n');
      fs.writeFileSync(path.join(legacy, 'keep.desktop'), '[Desktop Entry]\nExec=/usr/bin/keep\n');

      const auto = autostart.createLoginAutostart({
        platform: 'linux',
        execPath: path.join(home, 'opt', 'nw'),
        homedir: home,
        fs,
      });
      const result = await auto.repair();
      expect(result.enabled).toBe(true);
      const canonical = fs.readFileSync(path.join(legacy, 'OnlyKey.desktop'), 'utf8');
      expect(canonical).toContain(`Exec=${execLine}`);
      expect(fs.existsSync(path.join(legacy, 'nw.desktop'))).toBe(false);
      expect(fs.existsSync(path.join(legacy, 'keep.desktop'))).toBe(true);
      expect(await auto.isEnabled()).toBe(true);

      fs.writeFileSync(path.join(legacy, 'OnlyKey.desktop'), 'Hidden=true\nExec=/opt/OnlyKey/nw\n');
      const held = await auto.repair();
      expect(held.enabled).toBe(false);
      expect(fs.readFileSync(path.join(legacy, 'OnlyKey.desktop'), 'utf8')).toContain('Hidden=true');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('macOS autostart files', () => {
  const homes = [];
  afterEach(() => {
    for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
  });

  it('replaces helper agents and login items with one open -gj agent', async () => {
    const home = tempHome();
    homes.push(home);
    const agents = path.join(home, 'Library', 'LaunchAgents');
    fs.mkdirSync(agents, { recursive: true });
    fs.writeFileSync(
      path.join(agents, 'nwjs Helper (Renderer).plist'),
      `<?xml version="1.0"?><plist><string>${HELPER}</string><string>--hidden</string></plist>`
    );
    fs.writeFileSync(path.join(agents, 'other.plist'), '<string>/Applications/Other.app</string>');

    const calls = [];
    const auto = autostart.createLoginAutostart({
      platform: 'darwin',
      execPath: HELPER,
      homedir: home,
      fs,
      run(file, args, opts) {
        calls.push({ file, args, input: opts && opts.input });
        if (file === 'osascript' && opts && opts.input && opts.input.includes('count of login items')) {
          return { status: 0, stdout: `OnlyKey App\n${BUNDLE}\n---\n`, stderr: '' };
        }
        if (file === 'osascript') return { status: 0, stdout: '', stderr: '' };
        if (file === 'plutil' && args.includes('-o')) {
          return { status: 0, stdout: JSON.stringify({ 'persistent-apps': [] }), stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    const result = await auto.repair();
    expect(result.enabled).toBe(true);
    expect(fs.existsSync(path.join(agents, 'nwjs Helper (Renderer).plist'))).toBe(false);
    expect(fs.existsSync(path.join(agents, 'other.plist'))).toBe(true);
    const plist = fs.readFileSync(path.join(agents, 'to.crp.onlykey.plist'), 'utf8');
    expect(plist).toContain('/usr/bin/open');
    expect(plist).toContain(BUNDLE);
    expect(await auto.isEnabled()).toBe(true);
    expect(calls.some((call) => call.file === 'osascript' && call.input && call.input.includes('delete login item'))).toBe(true);
    expect(calls.some((call) => call.file === 'killall')).toBe(false);
  });

  it('skips System Events on a deferred repair and still replaces helper agents', async () => {
    const home = tempHome();
    homes.push(home);
    const agents = path.join(home, 'Library', 'LaunchAgents');
    fs.mkdirSync(agents, { recursive: true });
    fs.writeFileSync(
      path.join(agents, 'nwjs Helper (Renderer).plist'),
      `<?xml version="1.0"?><plist><string>${HELPER}</string><string>--hidden</string></plist>`
    );

    const calls = [];
    const auto = autostart.createLoginAutostart({
      platform: 'darwin',
      execPath: HELPER,
      homedir: home,
      fs,
      run(file, args, opts) {
        calls.push({ file, args, input: opts && opts.input });
        if (file === 'plutil' && args.includes('-o')) {
          return { status: 0, stdout: JSON.stringify({ 'persistent-apps': [] }), stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    const result = await auto.repair({ skipLoginItems: true });
    expect(result.enabled).toBe(true);
    expect(fs.existsSync(path.join(agents, 'nwjs Helper (Renderer).plist'))).toBe(false);
    expect(fs.readFileSync(path.join(agents, 'to.crp.onlykey.plist'), 'utf8')).toContain('/usr/bin/open');
    expect(calls.some((call) => call.file === 'osascript')).toBe(false);
    expect(await auto.isEnabled()).toBe(true);

    await auto.disable({ skipLoginItems: true });
    expect(fs.existsSync(path.join(agents, 'to.crp.onlykey.plist'))).toBe(false);
    expect(calls.some((call) => call.file === 'osascript')).toBe(false);
  });

  it('removes legacy login items without rewriting the LaunchAgent', async () => {
    const home = tempHome();
    homes.push(home);
    const agents = path.join(home, 'Library', 'LaunchAgents');
    fs.mkdirSync(agents, { recursive: true });
    const plist = autostart.macLaunchAgentPlist(BUNDLE, 'to.crp.onlykey');
    fs.writeFileSync(path.join(agents, 'to.crp.onlykey.plist'), plist);

    const calls = [];
    const auto = autostart.createLoginAutostart({
      platform: 'darwin',
      execPath: HELPER,
      homedir: home,
      fs,
      run(file, args, opts) {
        calls.push({ file, input: opts && opts.input });
        if (file === 'osascript' && opts && opts.input && opts.input.includes('count of login items')) {
          return { status: 0, stdout: `OnlyKey App\n${BUNDLE}\n---\n`, stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    const removed = await auto.removeLegacyLoginItems();
    expect(removed.removed).toBe(1);
    expect(fs.readFileSync(path.join(agents, 'to.crp.onlykey.plist'), 'utf8')).toBe(plist);
    expect(calls.some((call) => call.file === 'osascript' && call.input && call.input.includes('delete login item'))).toBe(true);
    expect(calls.some((call) => call.file === 'plutil')).toBe(false);
  });
});

describe('windows autostart registry', () => {
  const keyRoot = 'HKCU:\\Software\\OnlyKeyAutostartTest';
  const registry = {
    run: `${keyRoot}\\Run`,
    approved: `${keyRoot}\\Approved`,
  };

  afterEach(() => {
    if (process.platform !== 'win32') return;
    const { spawnSync } = require('child_process');
    const exe = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = `Remove-Item -LiteralPath '${keyRoot}' -Recurse -Force -ErrorAction SilentlyContinue`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    spawnSync(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true });
  });

  it.skipIf(process.platform !== 'win32')('migrates a disabled nw value into an enabled OnlyKey entry', async () => {
    const auto = autostart.createLoginAutostart({
      platform: 'win32',
      execPath: EXE,
      registry,
    });

    const { spawnSync } = require('child_process');
    const exe = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const plant = `
      $ErrorActionPreference = 'Stop'
      New-Item -Path '${registry.run}' -Force | Out-Null
      New-ItemProperty -LiteralPath '${registry.run}' -Name 'nw' -PropertyType String -Value '"${EXE}" --hidden' -Force | Out-Null
      New-Item -Path '${registry.approved}' -Force | Out-Null
      New-ItemProperty -LiteralPath '${registry.approved}' -Name 'nw' -PropertyType Binary -Value ([byte[]](1,0,0,0,1,2,3,4,5,6,7,8)) -Force | Out-Null
    `;
    const planted = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(plant, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8' });
    expect(planted.status, planted.stderr).toBe(0);

    const repaired = await auto.repair();
    expect(repaired.enabled).toBe(true);
    expect(await auto.isEnabled()).toBe(true);

    const read = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`
      $run = Get-Item -LiteralPath '${registry.run}'
      $approved = Get-Item -LiteralPath '${registry.approved}'
      @{
        command = [string]$run.GetValue('OnlyKey')
        nw = [string]$run.GetValue('nw')
        flag = [System.BitConverter]::ToString([byte[]]$approved.GetValue('OnlyKey'))
      } | ConvertTo-Json -Compress
    `, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8' });
    expect(read.status, read.stderr).toBe(0);
    const state = JSON.parse(read.stdout);
    expect(state.command).toBe(autostart.windowsRunCommand(EXE));
    expect(state.nw).toBe('');
    expect(state.flag.startsWith('02-00-00-00')).toBe(true);

    await auto.disable();
    expect(await auto.isEnabled()).toBe(false);
  }, 30000);
});
