#!/usr/bin/env node
/**
 * Release build script for OnlyKey App 5.7
 */
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(rootDir, 'tmp', 'release');
const releasesDir = path.join(rootDir, 'releases');

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: rootDir, ...opts });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function replaceTemplate(str, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), str);
}

function toVersionQuad(version) {
  const parts = String(version).split('.').map((part) => Number.parseInt(part, 10) || 0);
  while (parts.length < 4) parts.push(0);
  return parts.slice(0, 4).join('.');
}

function resolveCompanyName(manifest) {
  const author = manifest.author;
  if (typeof author === 'string') return author.replace(/\s*<.*>$/, '').trim();
  if (author && typeof author === 'object' && author.name) return author.name;
  return 'CryptoTrust';
}

function resolveMakensis() {
  if (process.env.MAKENSIS) return process.env.MAKENSIS;

  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files (x86)\\NSIS\\makensis.exe',
          'C:\\Program Files\\NSIS\\makensis.exe',
          'makensis',
        ]
      : ['makensis'];

  for (const candidate of candidates) {
    if (candidate === 'makensis' || fs.existsSync(candidate)) return candidate;
  }

  return 'makensis';
}

function resolveNwjsDir() {
  const nwModuleDir = path.join(rootDir, 'node_modules', 'nw');
  const symlink = path.join(nwModuleDir, 'nwjs');
  if (fs.existsSync(symlink)) return symlink;

  const versioned = fs
    .readdirSync(nwModuleDir)
    .find((entry) => entry.startsWith('nwjs-v'));
  if (versioned) return path.join(nwModuleDir, versioned);

  throw new Error('NW.js runtime not found. Run "npm install" first.');
}

/** NW.js uses package.json as the app manifest — keep it minimal for production. */
function buildProductionPackageJson(source) {
  const updateManifest = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8')
  );

  return {
    name: source.name,
    productName: source.productName,
    version: source.version,
    version_name: source.version_name,
    description: source.description,
    main: 'dist/index.html',

    manifestUrl: updateManifest.manifestUrl,
    'chromium-args': source['chromium-args'],
    window: {
      ...source.window,
      toolbar: false,
      inject_js_start: source.window?.inject_js_start || 'desktopInject.js',
    },
  };
}

async function buildWindowsInstaller(appDir, manifest) {
  const iconDest = path.join(appDir, 'icon.ico');
  fs.copyFileSync(path.join(rootDir, 'resources', 'windows', 'icon.ico'), iconDest);

  const finalName = `${manifest.name}_${manifest.version}.exe`;
  const nsiTemplate = fs.readFileSync(path.join(rootDir, 'resources', 'windows', 'installer.nsi'), 'utf8');
  const nsi = replaceTemplate(nsiTemplate, {
    name: manifest.name,
    productName: manifest.productName,
    version: manifest.version,
    versionQuad: toVersionQuad(manifest.version),
    companyName: resolveCompanyName(manifest),
    src: appDir.replace(/\\/g, '\\\\'),
    dest: path.join(releasesDir, finalName).replace(/\\/g, '\\\\'),
    icon: iconDest.replace(/\\/g, '\\\\'),
    setupIcon: path.join(rootDir, 'resources', 'windows', 'setup-icon.ico').replace(/\\/g, '\\\\'),
    banner: path.join(rootDir, 'resources', 'windows', 'setup-banner.bmp').replace(/\\/g, '\\\\'),
  });
  const nsiPath = path.join(tmpDir, 'installer.nsi');
  fs.writeFileSync(nsiPath, nsi);

  const destPath = path.join(releasesDir, finalName);
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);

  const makensis = resolveMakensis();
  console.log(`Building Windows installer with NSIS (${makensis})...`);
  await new Promise((resolve, reject) => {
    const proc = spawn(makensis, [nsiPath], { stdio: 'inherit' });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`NSIS exited with code ${code}`))));
    proc.on('error', reject);
  });
  console.log(`Installer ready: ${destPath}`);
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const platform = process.platform === 'darwin' ? 'osx' : process.platform === 'linux' ? 'linux' : 'windows';

  run('npm audit');
  run('npm run build');

  const appDir = path.join(tmpDir, manifest.name);
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(releasesDir, { recursive: true });

  copyDir(resolveNwjsDir(), appDir);
  copyDir(path.join(rootDir, 'dist'), path.join(appDir, 'dist'));
  fs.copyFileSync(path.join(rootDir, 'icon.png'), path.join(appDir, 'icon.png'));
  copyDir(path.join(rootDir, 'resources'), path.join(appDir, 'resources'));
  for (const desktopFile of [
    'tray.cjs',
    'userPreferences.cjs',
    'desktopClose.cjs',
    'desktopRuntime.cjs',
    'desktopBg.cjs',
    'desktopBgScript.cjs',
    'desktopBg.html',
    'desktopInject.js',
  ]) {
    fs.copyFileSync(path.join(rootDir, desktopFile), path.join(appDir, desktopFile));
  }

  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(buildProductionPackageJson(manifest), null, 2)
  );

  const prodModules = path.join(appDir, 'node_modules');
  fs.mkdirSync(prodModules, { recursive: true });
  for (const dep of Object.keys(manifest.dependencies || {})) {
    const src = path.join(rootDir, 'node_modules', dep);
    if (fs.existsSync(src)) copyDir(src, path.join(prodModules, dep));
  }

  if (platform === 'windows') {
    await buildWindowsInstaller(appDir, manifest);
  } else if (platform === 'osx') {
    const finalName = `${manifest.name}_${manifest.version}.dmg`;
    try {
      run(`npx appdmg ${path.join(rootDir, 'resources', 'osx', 'Info.plist')} ${path.join(releasesDir, finalName)}`);
    } catch {
      console.warn('appdmg not available — staged app is at:', appDir);
    }
  } else {
    console.log(`Linux packaging: staged app at ${appDir}`);
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('Release build complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});