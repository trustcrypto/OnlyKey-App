/**
 * Login autostart for the packaged app.
 *
 * The `auto-launch` package is not used. It renamed the Windows Run value to
 * the executable (`nw`), ignored Task Manager's StartupApproved flag, and on
 * macOS it launched the binary inside the bundle (and, on older builds, added
 * another Login Item). That left Windows logged-in-but-not-started, and Mac
 * with a visible window plus a new Dock icon for every release candidate.
 *
 * One entry, named for the product:
 *   Windows  HKCU\...\Run\OnlyKey  →  nw.exe "<app dir>" --hidden --onlykey-autostart
 *            plus StartupApproved enabled (02 00 …). A disabled `nw` value that
 *            points at this install is migrated once; a disabled `OnlyKey`
 *            value is left off.
 *   macOS    ~/Library/LaunchAgents/to.crp.onlykey.plist
 *            runs `open -gj <bundle> --args --hidden --onlykey-autostart`
 *            so Launch Services owns a single Dock tile. Legacy agents and
 *            Login Items that start this app are removed.
 *   Linux    ~/.config/autostart/OnlyKey.desktop via onlykey-launch --hidden.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const WINDOWS_RUN = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const WINDOWS_APPROVED =
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
const ENABLED_APPROVAL = new Set([0x02, 0x06, 0x08]);
const MAC_LABEL = 'to.crp.onlykey';
const MAC_LABEL_DEV = 'to.crp.onlykey.dev';

const LINUX_LEGACY_DESKTOPS = new Set([
  'nw.desktop',
  'nwjs.desktop',
  'onlykey-launch.desktop',
  'OnlyKey App.desktop',
  'OnlyKey-dev.desktop',
]);

function registrationName(execPath) {
  const normalized = String(execPath || '').replace(/\\/g, '/').toLowerCase();
  return normalized.includes('/node_modules/') ? 'OnlyKey-dev' : 'OnlyKey';
}

function quoteWindowsArg(value) {
  return `"${String(value).replace(/"/g, '')}"`;
}

/** Command stored in the Run key. The directory argument is the app root. */
function windowsRunCommand(exePath) {
  const exe = path.win32.normalize(String(exePath || ''));
  const dir = path.win32.dirname(exe);
  return `${quoteWindowsArg(exe)} ${quoteWindowsArg(dir)} --hidden --onlykey-autostart`;
}

function normalizeWinPath(value) {
  return String(value || '').replace(/\//g, '\\').toLowerCase();
}

function commandTargetsExe(command, exePath) {
  if (!command || !exePath) return false;
  return normalizeWinPath(command).includes(normalizeWinPath(exePath));
}

function parseApproved(value) {
  if (value == null || value === '') return null;
  const parts = String(value).trim().split(/[-\s]+/).filter(Boolean);
  if (!parts.length || parts.some((part) => !/^[0-9a-fA-F]{2}$/.test(part))) return null;
  return Buffer.from(parts.map((part) => Number.parseInt(part, 16)));
}

/** Missing StartupApproved means Windows will run the Run value. */
function approvalEnabled(bytes) {
  if (bytes == null || !Buffer.isBuffer(bytes) || bytes.length === 0) return true;
  return ENABLED_APPROVAL.has(bytes[0]);
}

/**
 * @param {{ name: string, exePath: string, runValues: object, approvals: object, force?: boolean }} opts
 * force is the tray checkbox turning autostart on. Repair must not pass it:
 * a StartupApproved disable of the OnlyKey value is the user (or Task Manager)
 * turning that entry off, and the next launch has to leave it off.
 */
function planWindowsUpdate(opts) {
  const name = opts.name;
  const exePath = opts.exePath;
  const run = opts.runValues || {};
  const approved = opts.approvals || {};
  const desired = windowsRunCommand(exePath);
  const legacy = Object.keys(run).filter((key) => key !== name && commandTargetsExe(run[key], exePath));
  const hasCanonical = Object.prototype.hasOwnProperty.call(run, name);
  const canonical = hasCanonical ? run[name] : null;

  if (opts.force) {
    return { enabled: true, write: desired, enableApproved: true, deleteRun: legacy };
  }

  if (hasCanonical && !approvalEnabled(parseApproved(approved[name]))) {
    return { enabled: false, write: null, enableApproved: false, deleteRun: legacy };
  }

  if (!hasCanonical && legacy.length === 0) {
    return { enabled: false, write: null, enableApproved: false, deleteRun: [] };
  }

  const commandOk = canonical === desired;
  const approvalOk = hasCanonical && approvalEnabled(parseApproved(approved[name]));
  if (commandOk && approvalOk && legacy.length === 0) {
    return { enabled: true, write: null, enableApproved: false, deleteRun: [] };
  }

  return { enabled: true, write: desired, enableApproved: true, deleteRun: legacy };
}

function planWindowsDisable(name, exePath, runValues) {
  const run = runValues || {};
  const legacy = Object.keys(run).filter((key) => key !== name && commandTargetsExe(run[key], exePath));
  const deleteRun = Object.prototype.hasOwnProperty.call(run, name) ? [name, ...legacy] : legacy;
  return { enabled: false, write: null, enableApproved: false, deleteRun };
}

function macBundleRoot(execPath) {
  const match = /^(.+?\.app)(?:\/|$)/.exec(String(execPath || '').replace(/\\/g, '/'));
  return match ? match[1] : null;
}

function macLabelFor(execPath) {
  return registrationName(execPath) === 'OnlyKey-dev' ? MAC_LABEL_DEV : MAC_LABEL;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `open -gj` keeps Launch Services on the bundle, so Dock tiles do not multiply. */
function macLaunchAgentPlist(bundlePath, label) {
  const args = ['/usr/bin/open', '-gj', bundlePath, '--args', '--hidden', '--onlykey-autostart'];
  const body = args.map((arg) => `    <string>${xmlEscape(arg)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
${body}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
</dict>
</plist>
`;
}

function macAgentIsCurrent(text, bundlePath) {
  const body = String(text || '');
  if (!body.includes('--hidden') && !body.includes('--onlykey-autostart')) return false;
  if (bundlePath && !body.includes(bundlePath)) return false;
  return body.includes('/usr/bin/open');
}

function shouldRemoveMacAgent(filename, text, opts) {
  if (!filename || !String(filename).endsWith('.plist')) return false;
  if (filename === `${opts.label}.plist`) return false;
  const body = String(text || '');
  if (opts.devMode) return !!(opts.bundlePath && body.includes(opts.bundlePath));
  if (opts.bundlePath && body.includes(opts.bundlePath)) return true;
  if (body.includes('OnlyKey App.app')) return true;
  if (body.includes(MAC_LABEL)) return true;
  return false;
}

function shouldRemoveLoginItem(item, opts) {
  const itemPath = String((item && item.itemPath) || '');
  if (!itemPath) return false;
  if (opts.devMode) return !!(opts.bundlePath && itemPath.includes(opts.bundlePath));
  if (opts.bundlePath && itemPath.includes(opts.bundlePath)) return true;
  return itemPath.includes('OnlyKey App.app');
}

function planMac(opts) {
  const want = !!opts.canonicalText || opts.legacyNames.length > 0 || opts.loginItems.length > 0;
  if (!want) {
    return {
      enabled: false,
      write: false,
      deleteAgents: opts.legacyNames,
      deleteLoginItems: opts.loginItems,
    };
  }
  return {
    enabled: true,
    write: opts.canonicalText !== opts.desiredText,
    deleteAgents: opts.legacyNames,
    deleteLoginItems: opts.loginItems,
  };
}

function normalizeMacPath(value) {
  let text = String(value || '').trim();
  if (text.startsWith('file://')) {
    text = text.slice('file://'.length);
    try {
      text = decodeURI(text);
    } catch {
      // keep the raw path
    }
  }
  if (text.length > 1 && text.endsWith('/')) text = text.slice(0, -1);
  return text;
}

function isOnlyKeyDockTile(tile) {
  if (!tile) return false;
  if (tile.bundleId === MAC_LABEL || tile.bundleId === MAC_LABEL_DEV) return true;
  const url = normalizeMacPath(tile.url);
  if (url.includes('/OnlyKey App.app')) return true;
  const label = tile.label || '';
  return (label === 'OnlyKey App' || label === 'OnlyKey') && url.includes('OnlyKey');
}

/**
 * Collapse extra OnlyKey Dock tiles. A single live tile is left alone so a
 * normal launch does not restart the Dock.
 */
function dockTilesToDrop(tiles, bundlePath, exists) {
  const current = normalizeMacPath(bundlePath);
  const onlyKey = [];
  (tiles || []).forEach((tile, index) => {
    if (!isOnlyKeyDockTile(tile)) return;
    onlyKey.push({ index, path: normalizeMacPath(tile.url) });
  });
  const currentOnes = onlyKey.filter((entry) => entry.path === current);
  const drop = [];
  currentOnes.slice(1).forEach((entry) => drop.push(entry.index));
  for (const entry of onlyKey) {
    if (entry.path === current) continue;
    const missing = !entry.path || (typeof exists === 'function' && !exists(entry.path));
    if (missing || currentOnes.length > 0) drop.push(entry.index);
  }
  return drop;
}

function quoteDesktopExec(value) {
  const text = String(value);
  if (!/[\s"\\]/.test(text)) return text;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function linuxExecCommand(exePath, existsSync) {
  const dir = path.dirname(exePath);
  const wrapper = path.join(dir, 'onlykey-launch');
  if (existsSync(wrapper)) {
    return `${quoteDesktopExec(wrapper)} --hidden --onlykey-autostart`;
  }
  return `${quoteDesktopExec(exePath)} ${quoteDesktopExec(dir)} --hidden --onlykey-autostart`;
}

function linuxDesktopContents(execLine) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=OnlyKey',
    'Comment=OnlyKey startup script',
    `Exec=${execLine}`,
    'StartupNotify=false',
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

function linuxAutostartDisabled(text) {
  const body = String(text || '');
  return /^Hidden=true\s*$/m.test(body) || /^X-GNOME-Autostart-enabled=false\s*$/m.test(body);
}

function desktopExecLine(text) {
  const match = String(text || '').match(/^Exec=(.*)$/m);
  return match ? match[1].trim() : '';
}

function shouldRemoveLinuxAutostart(filename, text, opts) {
  if (filename === `${opts.name}.desktop`) return false;
  if (opts.devMode) return false;
  if (!LINUX_LEGACY_DESKTOPS.has(filename)) return false;
  const body = String(text || '');
  return body.includes('onlykey-launch') || body.includes('/opt/OnlyKey/') || body.includes('OnlyKey');
}

function planLinux(opts) {
  const disabled = !!(opts.canonicalText && linuxAutostartDisabled(opts.canonicalText));
  if (disabled || (!opts.canonicalText && opts.legacyNames.length === 0)) {
    return { enabled: false, write: false, deleteLegacy: opts.legacyNames };
  }
  const execOk = opts.canonicalText && desktopExecLine(opts.canonicalText) === desktopExecLine(opts.desiredText);
  return { enabled: true, write: !execOk, deleteLegacy: opts.legacyNames };
}

function parseLoginItems(output) {
  const items = [];
  const chunks = String(output || '').split(/\r?\n---\r?\n/);
  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length < 2) continue;
    items.push({ name: lines[0], itemPath: lines[1] });
  }
  return items;
}

function appleString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function defaultRun(file, args, options = {}) {
  // Resolved at call time so tests can spy on child_process.spawnSync.
  const runner = require('child_process').spawnSync;
  return runner(file, args, {
    encoding: 'utf8',
    timeout: options.timeout || 20000,
    windowsHide: true,
    input: options.input,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
}

function assertRan(result, label) {
  if (!result || result.error) {
    throw result?.error || new Error(`${label} failed`);
  }
  if (result.status !== 0) {
    const detail = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
    throw new Error(detail || `${label} exited ${result.status}`);
  }
  return result.stdout || '';
}

function powershellExe() {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

const READ_WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Read-Key([string]$path) {
  $map = @{}
  $item = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
  if (-not $item) { return $map }
  foreach ($n in $item.GetValueNames()) {
    if ([string]::IsNullOrEmpty($n)) { continue }
    $v = $item.GetValue($n)
    if ($v -is [byte[]]) { $map[$n] = [System.BitConverter]::ToString($v) }
    else { $map[$n] = [string]$v }
  }
  return $map
}
@{
  run = (Read-Key $env:ONLYKEY_RUN_KEY)
  approved = (Read-Key $env:ONLYKEY_APPROVED_KEY)
} | ConvertTo-Json -Compress -Depth 4
`;

const APPLY_WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$run = $env:ONLYKEY_RUN_KEY
$approved = $env:ONLYKEY_APPROVED_KEY
if ($env:ONLYKEY_WRITE_VALUE) {
  if (-not (Test-Path -LiteralPath $run)) { New-Item -Path $run -Force | Out-Null }
  New-ItemProperty -LiteralPath $run -Name $env:ONLYKEY_WRITE_NAME -PropertyType String -Value $env:ONLYKEY_WRITE_VALUE -Force | Out-Null
}
if ($env:ONLYKEY_ENABLE_APPROVED -eq '1') {
  if (-not (Test-Path -LiteralPath $approved)) { New-Item -Path $approved -Force | Out-Null }
  $bytes = [byte[]](2,0,0,0,0,0,0,0,0,0,0,0)
  New-ItemProperty -LiteralPath $approved -Name $env:ONLYKEY_WRITE_NAME -PropertyType Binary -Value $bytes -Force | Out-Null
}
if ($env:ONLYKEY_DELETE_RUN) {
  foreach ($n in $env:ONLYKEY_DELETE_RUN.Split('|')) {
    if (-not $n) { continue }
    Remove-ItemProperty -LiteralPath $run -Name $n -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $approved) {
      Remove-ItemProperty -LiteralPath $approved -Name $n -ErrorAction SilentlyContinue
    }
  }
}
`;

function parseJsonObject(text) {
  const cleaned = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!cleaned) return {};
  const parsed = JSON.parse(cleaned);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function createLoginAutostart(options = {}) {
  const execPath = options.execPath || process.execPath;
  const platform = options.platform || process.platform;
  const fileSystem = options.fs || fs;
  const home = options.homedir || os.homedir();
  const run = options.run || defaultRun;
  const allowWrites = options.allowWrites !== false;
  const name = registrationName(execPath);
  const devMode = name === 'OnlyKey-dev';
  const keys = {
    run: (options.registry && options.registry.run) || WINDOWS_RUN,
    approved: (options.registry && options.registry.approved) || WINDOWS_APPROVED,
  };

  function refuse() {
    return { changed: false, enabled: false, skipped: true };
  }

  function runPowershell(script, env) {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const stdout = assertRan(
      run(powershellExe(), ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { env }),
      'powershell'
    );
    return stdout;
  }

  function readWindows() {
    const stdout = runPowershell(READ_WINDOWS_SCRIPT, {
      ONLYKEY_RUN_KEY: keys.run,
      ONLYKEY_APPROVED_KEY: keys.approved,
    });
    const parsed = parseJsonObject(stdout);
    return {
      run: parsed.run && typeof parsed.run === 'object' ? parsed.run : {},
      approved: parsed.approved && typeof parsed.approved === 'object' ? parsed.approved : {},
    };
  }

  function applyWindows(plan) {
    const changed = !!(plan.write || plan.enableApproved || (plan.deleteRun && plan.deleteRun.length));
    if (!changed) return { changed: false, enabled: plan.enabled };
    runPowershell(APPLY_WINDOWS_SCRIPT, {
      ONLYKEY_RUN_KEY: keys.run,
      ONLYKEY_APPROVED_KEY: keys.approved,
      ONLYKEY_WRITE_NAME: name,
      ONLYKEY_WRITE_VALUE: plan.write || '',
      ONLYKEY_ENABLE_APPROVED: plan.enableApproved ? '1' : '0',
      ONLYKEY_DELETE_RUN: (plan.deleteRun || []).join('|'),
    });
    return { changed: true, enabled: plan.enabled, removed: plan.deleteRun || [] };
  }

  function windowsEnabled(state) {
    const command = state.run[name];
    if (!commandTargetsExe(command, execPath)) return false;
    return approvalEnabled(parseApproved(state.approved[name]));
  }

  function repairWindows() {
    const state = readWindows();
    const plan = planWindowsUpdate({
      name,
      exePath: execPath,
      runValues: state.run,
      approvals: state.approved,
    });
    return applyWindows(plan);
  }

  function enableWindows() {
    const state = readWindows();
    return applyWindows(planWindowsUpdate({
      name,
      exePath: execPath,
      runValues: state.run,
      approvals: state.approved,
      force: true,
    }));
  }

  function disableWindows() {
    const state = readWindows();
    return applyWindows(planWindowsDisable(name, execPath, state.run));
  }

  function readText(filePath) {
    try {
      if (!fileSystem.existsSync(filePath)) return '';
      return fileSystem.readFileSync(filePath, 'utf8');
    } catch {
      return '';
    }
  }

  function listFiles(dir) {
    try {
      return fileSystem.readdirSync(dir);
    } catch {
      return [];
    }
  }

  function macPaths() {
    const bundlePath = macBundleRoot(execPath);
    const label = macLabelFor(execPath);
    const dir = path.join(home, 'Library', 'LaunchAgents');
    return { bundlePath, label, dir, canonical: path.join(dir, `${label}.plist`) };
  }

  function macLegacy(paths) {
    return listFiles(paths.dir).filter((filename) => {
      const text = readText(path.join(paths.dir, filename));
      return shouldRemoveMacAgent(filename, text, {
        label: paths.label,
        bundlePath: paths.bundlePath,
        devMode,
      });
    });
  }

  function listLoginItems() {
    const script = [
      'tell application "System Events"',
      '  set output to ""',
      '  set totalCount to count of login items',
      '  repeat with i from 1 to totalCount',
      '    set itemName to name of login item i',
      '    set itemPath to path of login item i',
      '    set output to output & itemName & linefeed & itemPath & linefeed & "---" & linefeed',
      '  end repeat',
      '  return output',
      'end tell',
    ].join('\n');
    const stdout = assertRan(run('osascript', [], { input: script, timeout: 15000 }), 'osascript');
    const paths = macPaths();
    return parseLoginItems(stdout).filter((item) => shouldRemoveLoginItem(item, {
      bundlePath: paths.bundlePath,
      devMode,
    }));
  }

  function deleteLoginItems(items) {
    for (const item of items) {
      const script = `tell application "System Events" to delete login item ${appleString(item.name)}`;
      try {
        assertRan(run('osascript', [], { input: script, timeout: 15000 }), 'osascript');
      } catch (error) {
        console.error('Could not remove login item', item.name, error);
      }
    }
  }

  function writeCanonical(paths, text) {
    fileSystem.mkdirSync(paths.dir, { recursive: true });
    fileSystem.writeFileSync(paths.canonical, text, { mode: 0o644 });
  }

  function deleteAgents(paths, names) {
    for (const filename of names) {
      try {
        fileSystem.unlinkSync(path.join(paths.dir, filename));
      } catch (error) {
        if (error && error.code !== 'ENOENT') console.error('Could not remove LaunchAgent', filename, error);
      }
    }
  }

  function pruneDock(bundlePath) {
    if (devMode || !bundlePath) return false;
    const plistPath = path.join(home, 'Library', 'Preferences', 'com.apple.dock.plist');
    if (!fileSystem.existsSync(plistPath)) return false;
    let raw;
    try {
      raw = assertRan(run('plutil', ['-convert', 'json', '-o', '-', plistPath], { timeout: 10000 }), 'plutil');
    } catch (error) {
      console.error('Could not read the Dock layout:', error);
      return false;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return false;
    }
    const persistent = data['persistent-apps'];
    if (!Array.isArray(persistent)) return false;
    const tiles = persistent.map((entry) => {
      const tile = entry && entry['tile-data'] ? entry['tile-data'] : {};
      const fileData = tile['file-data'] || {};
      return {
        bundleId: tile['bundle-identifier'] || '',
        label: tile['file-label'] || '',
        url: fileData._CFURLString || '',
      };
    });
    const drop = new Set(dockTilesToDrop(tiles, bundlePath, (target) => {
      try {
        return fileSystem.existsSync(target);
      } catch {
        return false;
      }
    }));
    if (drop.size === 0) return false;
    data['persistent-apps'] = persistent.filter((_, index) => !drop.has(index));
    const tmp = path.join(os.tmpdir(), `onlykey-dock-${process.pid}.json`);
    fileSystem.writeFileSync(tmp, JSON.stringify(data));
    try {
      assertRan(run('plutil', ['-convert', 'binary1', tmp], { timeout: 10000 }), 'plutil');
      fileSystem.copyFileSync(tmp, plistPath);
    } catch (error) {
      console.error('Could not update the Dock layout:', error);
      return false;
    } finally {
      try {
        fileSystem.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
    try {
      run('killall', ['Dock'], { timeout: 5000 });
    } catch (error) {
      console.error('Could not restart the Dock:', error);
    }
    return true;
  }

  function repairMac() {
    const paths = macPaths();
    if (!paths.bundlePath) return { changed: false, enabled: false };
    const desired = macLaunchAgentPlist(paths.bundlePath, paths.label);
    const canonicalText = readText(paths.canonical);
    const legacyNames = macLegacy(paths);
    let loginItems = [];
    try {
      loginItems = listLoginItems();
    } catch (error) {
      console.error('Could not list login items:', error);
    }
    const plan = planMac({
      canonicalText,
      desiredText: desired,
      legacyNames,
      loginItems,
    });
    if (plan.write) writeCanonical(paths, desired);
    deleteAgents(paths, plan.deleteAgents);
    deleteLoginItems(plan.deleteLoginItems);
    const dockChanged = pruneDock(paths.bundlePath);
    const changed = !!(plan.write || plan.deleteAgents.length || plan.deleteLoginItems.length || dockChanged);
    return { changed, enabled: plan.enabled, removed: plan.deleteAgents };
  }

  function enableMac() {
    const paths = macPaths();
    if (!paths.bundlePath) throw new Error('macOS autostart needs the app bundle');
    const desired = macLaunchAgentPlist(paths.bundlePath, paths.label);
    writeCanonical(paths, desired);
    deleteAgents(paths, macLegacy(paths));
    try {
      deleteLoginItems(listLoginItems());
    } catch (error) {
      console.error('Could not remove login items:', error);
    }
    pruneDock(paths.bundlePath);
    return { changed: true, enabled: true };
  }

  function disableMac() {
    const paths = macPaths();
    deleteAgents(paths, [path.basename(paths.canonical), ...macLegacy(paths)]);
    try {
      deleteLoginItems(listLoginItems());
    } catch (error) {
      console.error('Could not remove login items:', error);
    }
    return { changed: true, enabled: false };
  }

  function macEnabled() {
    const paths = macPaths();
    if (!paths.bundlePath) return false;
    return macAgentIsCurrent(readText(paths.canonical), paths.bundlePath);
  }

  function linuxDir() {
    return path.join(home, '.config', 'autostart');
  }

  function linuxDesired() {
    const execLine = linuxExecCommand(execPath, (target) => fileSystem.existsSync(target));
    return linuxDesktopContents(execLine);
  }

  function linuxLegacy() {
    return listFiles(linuxDir()).filter((filename) => {
      const text = readText(path.join(linuxDir(), filename));
      return shouldRemoveLinuxAutostart(filename, text, { name, devMode });
    });
  }

  function repairLinux() {
    const dir = linuxDir();
    const canonical = path.join(dir, `${name}.desktop`);
    const desired = linuxDesired();
    const plan = planLinux({
      canonicalText: readText(canonical),
      desiredText: desired,
      legacyNames: linuxLegacy(),
    });
    if (plan.write) {
      fileSystem.mkdirSync(dir, { recursive: true });
      fileSystem.writeFileSync(canonical, desired, { mode: 0o644 });
    }
    for (const filename of plan.deleteLegacy) {
      try {
        fileSystem.unlinkSync(path.join(dir, filename));
      } catch (error) {
        if (error && error.code !== 'ENOENT') console.error('Could not remove autostart entry', filename, error);
      }
    }
    return { changed: !!(plan.write || plan.deleteLegacy.length), enabled: plan.enabled };
  }

  function linuxEnabled() {
    const text = readText(path.join(linuxDir(), `${name}.desktop`));
    if (!text || linuxAutostartDisabled(text)) return false;
    return desktopExecLine(text).includes('--hidden');
  }

  function repair() {
    if (!allowWrites) return Promise.resolve(refuse());
    return Promise.resolve().then(() => {
      if (platform === 'win32') return repairWindows();
      if (platform === 'darwin') return repairMac();
      if (platform === 'linux') return repairLinux();
      return refuse();
    });
  }

  function enableLinux() {
    const dir = linuxDir();
    fileSystem.mkdirSync(dir, { recursive: true });
    fileSystem.writeFileSync(path.join(dir, `${name}.desktop`), linuxDesired(), { mode: 0o644 });
    for (const filename of linuxLegacy()) {
      try {
        fileSystem.unlinkSync(path.join(dir, filename));
      } catch (error) {
        if (error && error.code !== 'ENOENT') console.error('Could not remove autostart entry', filename, error);
      }
    }
    return { changed: true, enabled: true };
  }

  function enable() {
    if (!allowWrites) return Promise.resolve(refuse());
    return Promise.resolve().then(() => {
      if (platform === 'win32') return enableWindows();
      if (platform === 'darwin') return enableMac();
      if (platform === 'linux') return enableLinux();
      return refuse();
    });
  }

  function disable() {
    if (!allowWrites) return Promise.resolve(refuse());
    return Promise.resolve().then(() => {
      if (platform === 'win32') return disableWindows();
      if (platform === 'darwin') return disableMac();
      if (platform === 'linux') {
        const dir = linuxDir();
        const names = new Set([`${name}.desktop`, ...linuxLegacy()]);
        for (const filename of names) {
          try {
            fileSystem.unlinkSync(path.join(dir, filename));
          } catch (error) {
            if (error && error.code !== 'ENOENT') console.error('Could not remove autostart entry', filename, error);
          }
        }
        return { changed: true, enabled: false };
      }
      return refuse();
    });
  }

  function isEnabled() {
    if (!allowWrites) return Promise.resolve(false);
    return Promise.resolve().then(() => {
      if (platform === 'win32') return windowsEnabled(readWindows());
      if (platform === 'darwin') return macEnabled();
      if (platform === 'linux') return linuxEnabled();
      return false;
    });
  }

  return { repair, enable, disable, isEnabled, name };
}

module.exports = {
  createLoginAutostart,
  registrationName,
  windowsRunCommand,
  commandTargetsExe,
  parseApproved,
  approvalEnabled,
  planWindowsUpdate,
  planWindowsDisable,
  macBundleRoot,
  macLabelFor,
  macLaunchAgentPlist,
  macAgentIsCurrent,
  shouldRemoveMacAgent,
  shouldRemoveLoginItem,
  planMac,
  parseLoginItems,
  normalizeMacPath,
  isOnlyKeyDockTile,
  dockTilesToDrop,
  linuxExecCommand,
  linuxDesktopContents,
  linuxAutostartDisabled,
  shouldRemoveLinuxAutostart,
  planLinux,
  desktopExecLine,
};
