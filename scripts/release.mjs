/**
 * Release packaging for OnlyKey App 5.7
 *
 * Usage (on the target OS):
 *   npm run release
 *   npm run release -- --skip-audit
 *
 * Windows → releases/OnlyKey_<ver>.exe  (NSIS; requires makensis)
 * Linux   → releases/OnlyKey_<ver>_amd64.deb  (requires fakeroot + dpkg-deb)
 * macOS   → releases/OnlyKey_<ver>.dmg  (uses hdiutil)
 *
 * Always stages a runnable app bundle under tmp/release/<name>/ before packaging.
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveNwjsDir } from './nw-runtime.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(rootDir, 'tmp', 'release');
const releasesDir = path.join(rootDir, 'releases');

const args = new Set(process.argv.slice(2));
const skipAudit = args.has('--skip-audit');

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: rootDir, ...opts });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(srcPath), destPath);
    } else if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * NW.js tarballs ship lib/*.so and pak files as mode 600/700. When those land
 * in /opt/OnlyKey owned by root, normal users cannot load libnw.so and the
 * desktop launcher does nothing. Force world-readable (+ executable where
 * needed) on the staged tree before packaging.
 */
function ensureWorldReadableTree(dir) {
  const walk = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      fs.chmodSync(p, 0o755);
      for (const entry of fs.readdirSync(p)) walk(path.join(p, entry));
      return;
    }
    const base = path.basename(p);
    const ext = path.extname(p).toLowerCase();
    const needsExec =
      base === 'nw' ||
      base === 'nw.exe' ||
      base === 'chrome_crashpad_handler' ||
      ext === '.so' ||
      /^lib.+\.so(\.\d+)*$/.test(base) ||
      (st.mode & 0o111) !== 0;
    fs.chmodSync(p, needsExec ? 0o755 : 0o644);
  };
  walk(dir);
}

function replaceTemplate(str, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), str);
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

function dirSizeKiB(dir) {
  let total = 0;
  const walk = (p) => {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else total += fs.statSync(full).size;
    }
  };
  walk(dir);
  return Math.max(1, Math.round(total / 1024));
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

function buildProductionPackageJson(source) {
  let manifestUrl = 'https://s3.amazonaws.com/onlykey-app/releases/latest/manifest.json';
  try {
    const updateManifest = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8')
    );
    if (updateManifest.manifestUrl) manifestUrl = updateManifest.manifestUrl;
  } catch {
    /* optional */
  }

  return {
    name: source.name,
    productName: source.productName,
    version: source.version,
    version_name: source.version_name || source.version,
    description: source.description,
    main: 'dist/index.html',
    manifestUrl,
    'chromium-args': source['chromium-args'],
    window: {
      ...source.window,
      toolbar: false,
      inject_js_start: source.window?.inject_js_start || 'desktopInject.js',
    },
  };
}

/** Files that must ship next to package.json for desktop shell. */
const DESKTOP_SHELL_FILES = [
  'userPreferences.cjs',
  'desktopBg.cjs',
  'desktopInject.js',
];

/**
 * Vite bundles react, react-dom, zustand, openpgp, and js-sha256 into dist/.
 * Only these two are loaded via require() at runtime (sshpk is externalized
 * in vite.config.ts; auto-launch is required by desktopBg.cjs).
 */
const RUNTIME_DEPS = ['sshpk', 'auto-launch'];

// Keep only English locale files. Handles Windows/Linux locales/,
// macOS .app bundle Contents/Resources/locales/, macOS framework
// Contents/Frameworks/*.framework/Libraries/Languages/ (incl. Versions/A/),
// and a recursive scan fallback.
function stripLocaleDir(dirPath) {
  if (!fs.existsSync(dirPath)) return false;
  const keep = new Set(['en-US.pak', 'en-US.pak.info']);
  for (const entry of fs.readdirSync(dirPath)) {
    if (!keep.has(entry)) {
      fs.unlinkSync(path.join(dirPath, entry));
    }
  }
  return true;
}

function findLocaleDirs(root, dirs = []) {
  if (!fs.existsSync(root)) return dirs;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'locales' || entry.name === 'Languages') {
        dirs.push(full);
      }
      if (entry.name === 'Frameworks' || entry.name === 'Versions' || entry.name === 'Contents') {
        findLocaleDirs(full, dirs);
      }
    }
  }
  return dirs;
}

function stripLocales(targetDir) {
  const candidates = [path.join(targetDir, 'locales')];

  // macOS: if nwjs.app exists as a subdirectory, base paths on it;
  // otherwise treat targetDir itself as the .app bundle root (Contents/ at top).
  const nwjsAppRoot = path.join(targetDir, 'nwjs.app');
  const macBase = fs.existsSync(path.join(nwjsAppRoot, 'Contents'))
    ? nwjsAppRoot
    : (fs.existsSync(path.join(targetDir, 'Contents')) ? targetDir : nwjsAppRoot);

  const contentsDir = path.join(macBase, 'Contents');
  if (fs.existsSync(contentsDir)) {
    candidates.push(path.join(contentsDir, 'Resources', 'locales'));
    const fwDir = path.join(contentsDir, 'Frameworks');
    if (fs.existsSync(fwDir)) {
      for (const fw of fs.readdirSync(fwDir)) {
        if (fw.endsWith('.framework')) {
          const fwPath = path.join(fwDir, fw);
          candidates.push(path.join(fwPath, 'Libraries', 'Languages'));
          const versionsPath = path.join(fwPath, 'Versions');
          if (fs.existsSync(versionsPath)) {
            for (const v of fs.readdirSync(versionsPath)) {
              candidates.push(path.join(versionsPath, v, 'Libraries', 'Languages'));
            }
          }
        }
      }
    }
  }

  // Fallback: recursively find any "locales" or "Languages" directories
  const recursiveDirs = findLocaleDirs(targetDir);
  for (const dir of recursiveDirs) {
    if (!candidates.includes(dir)) {
      candidates.push(dir);
    }
  }

  let stripped = 0;
  for (const dir of candidates) {
    if (stripLocaleDir(dir)) stripped++;
  }
  if (stripped > 0) {
    console.log(`Stripped non-English locales from ${stripped} locale directory(ies) (en-US.pak retained).`);
  }
}

function stageApplication(manifest) {
  const appDir = path.join(tmpDir, manifest.name);
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(releasesDir, { recursive: true });

  console.log('Staging NW.js runtime + app…');
  copyDir(resolveNwjsDir(), appDir);
  stripLocales(appDir);
  copyDir(path.join(rootDir, 'dist'), path.join(appDir, 'dist'));
  fs.copyFileSync(path.join(rootDir, 'icon.png'), path.join(appDir, 'icon.png'));

  // Only copy runtime-needed resources (tray icon); platform-specific packaging
  // files (NSIS scripts, DMG backgrounds, deb control, etc.) are consumed
  // directly from rootDir/resources/ by the OS-specific build steps.
  const trayIconSrc = path.join(rootDir, 'resources', 'ok-tray-logo.png');
  if (fs.existsSync(trayIconSrc)) {
    const resourcesDest = path.join(appDir, 'resources');
    fs.mkdirSync(resourcesDest, { recursive: true });
    fs.copyFileSync(trayIconSrc, path.join(resourcesDest, 'ok-tray-logo.png'));
  }

  for (const desktopFile of DESKTOP_SHELL_FILES) {
    const src = path.join(rootDir, desktopFile);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(appDir, desktopFile));
    }
  }

  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    `${JSON.stringify(buildProductionPackageJson(manifest), null, 2)}\n`
  );

  const prodModules = path.join(appDir, 'node_modules');
  fs.mkdirSync(prodModules, { recursive: true });
  for (const dep of RUNTIME_DEPS) {
    const src = path.join(rootDir, 'node_modules', dep);
    if (fs.existsSync(src)) copyDir(src, path.join(prodModules, dep));
  }

  // Critical: NW runtime files often arrive mode 600/700; fix before package.
  ensureWorldReadableTree(appDir);

  return appDir;
}

async function buildWindowsInstaller(appDir, manifest) {
  const iconDest = path.join(appDir, 'icon.ico');
  fs.copyFileSync(path.join(rootDir, 'resources', 'windows', 'icon.ico'), iconDest);

  const finalName = `${manifest.name}_${manifest.version}.exe`;
  const nsiTemplate = fs.readFileSync(
    path.join(rootDir, 'resources', 'windows', 'installer.nsi'),
    'utf8'
  );
  const nsi = replaceTemplate(nsiTemplate, {
    name: manifest.name,
    productName: manifest.productName,
    version: manifest.version,
    versionQuad: toVersionQuad(manifest.version),
    companyName: resolveCompanyName(manifest),
    src: appDir.replace(/\\/g, '\\\\'),
    dest: path.join(releasesDir, finalName).replace(/\\/g, '\\\\'),
    icon: iconDest.replace(/\\/g, '\\\\'),
    setupIcon: path
      .join(rootDir, 'resources', 'windows', 'setup-icon.ico')
      .replace(/\\/g, '\\\\'),
    banner: path
      .join(rootDir, 'resources', 'windows', 'setup-banner.bmp')
      .replace(/\\/g, '\\\\'),
  });
  const nsiPath = path.join(tmpDir, 'installer.nsi');
  fs.writeFileSync(nsiPath, nsi);

  const destPath = path.join(releasesDir, finalName);
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);

  const makensis = resolveMakensis();
  console.log(`Building Windows installer with NSIS (${makensis})…`);
  await new Promise((resolve, reject) => {
    const proc = spawn(makensis, [nsiPath], { stdio: 'inherit' });
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`NSIS exited with code ${code}`))
    );
    proc.on('error', reject);
  });
  console.log(`Installer ready: ${destPath}`);
  return destPath;
}

async function buildLinuxDeb(appDir, manifest) {
  const packName = `${manifest.name}_${manifest.version}`;
  const packDir = path.join(tmpDir, `${packName}_deb`);
  const optApp = path.join(packDir, 'opt', manifest.name);

  fs.mkdirSync(optApp, { recursive: true });
  copyDir(appDir, optApp);

  // User-facing launcher wrapper (second-instance show + stale singleton cleanup)
  const launchSrc = path.join(rootDir, 'resources', 'linux', 'onlykey-launch');
  if (fs.existsSync(launchSrc)) {
    const launchDest = path.join(optApp, 'onlykey-launch');
    fs.copyFileSync(launchSrc, launchDest);
    fs.chmodSync(launchDest, 0o755);
  }

  // Desktop entry
  const desktopTpl = fs.readFileSync(path.join(rootDir, 'resources', 'linux', 'app.desktop'), 'utf8');
  const desktop = replaceTemplate(desktopTpl, {
    name: manifest.name,
    productName: manifest.productName,
    description: manifest.description,
    version: manifest.version,
    author: manifest.author,
  });
  const appsDir = path.join(packDir, 'usr', 'share', 'applications');
  fs.mkdirSync(appsDir, { recursive: true });
  fs.writeFileSync(path.join(appsDir, `${manifest.name}.desktop`), desktop);

  // udev rules
  const rulesSrc = path.join(rootDir, 'resources', 'linux', '49-onlykey.rules');
  if (fs.existsSync(rulesSrc)) {
    const rulesDir = path.join(packDir, 'etc', 'udev', 'rules.d');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.copyFileSync(rulesSrc, path.join(rulesDir, '49-onlykey.rules'));
  }

  // DEBIAN control + postinst
  const debianDir = path.join(packDir, 'DEBIAN');
  fs.mkdirSync(debianDir, { recursive: true });
  const controlTpl = fs.readFileSync(
    path.join(rootDir, 'resources', 'linux', 'DEBIAN', 'control'),
    'utf8'
  );
  const control = replaceTemplate(controlTpl, {
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    author: manifest.author,
    size: dirSizeKiB(optApp),
  });
  fs.writeFileSync(path.join(debianDir, 'control'), control);

  const postinstSrc = path.join(rootDir, 'resources', 'linux', 'postinst');
  if (fs.existsSync(postinstSrc)) {
    const postinstDest = path.join(debianDir, 'postinst');
    fs.copyFileSync(postinstSrc, postinstDest);
    fs.chmodSync(postinstDest, 0o755);
  }

  // Re-apply world-readable perms after deb tree copy (copyFileSync preserves modes).
  ensureWorldReadableTree(optApp);
  const nwBin = path.join(optApp, 'nw');
  if (fs.existsSync(nwBin)) fs.chmodSync(nwBin, 0o755);

  const debFileName = `${packName}_amd64.deb`;
  const debPath = path.join(releasesDir, debFileName);
  if (fs.existsSync(debPath)) fs.unlinkSync(debPath);

  console.log('Building Debian package…');
  try {
    run(`fakeroot dpkg-deb -Zxz --build "${packDir}" "${debPath}"`);
    console.log(`DEB package ready: ${debPath}`);
    return debPath;
  } catch (err) {
    console.warn('dpkg-deb failed — is fakeroot/dpkg-deb installed?');
    console.warn('Staged package tree kept at:', packDir);
    throw err;
  }
}

async function buildMacDmg(appDir, manifest) {
  const appBundleName = `${manifest.productName}.app`;
  const finalAppDir = path.join(tmpDir, appBundleName);
  const nwjsApp = path.join(resolveNwjsDir(), 'nwjs.app');

  if (!fs.existsSync(nwjsApp)) {
    throw new Error(`nwjs.app not found under NW runtime. Got: ${resolveNwjsDir()}`);
  }

  console.log('Assembling macOS .app bundle…');
  if (fs.existsSync(finalAppDir)) fs.rmSync(finalAppDir, { recursive: true, force: true });
  copyDir(nwjsApp, finalAppDir);
  stripLocales(finalAppDir);
  const appNw = path.join(finalAppDir, 'Contents', 'Resources', 'app.nw');
  if (fs.existsSync(appNw)) fs.rmSync(appNw, { recursive: true, force: true });
  fs.mkdirSync(appNw, { recursive: true });
  copyDir(appDir, appNw);

  // Info.plist + icon
  const infoTpl = fs.readFileSync(path.join(rootDir, 'resources', 'osx', 'Info.plist'), 'utf8');
  const info = replaceTemplate(infoTpl, {
    productName: manifest.productName,
    version: manifest.version,
  });
  fs.writeFileSync(path.join(finalAppDir, 'Contents', 'Info.plist'), info);
  fs.copyFileSync(
    path.join(rootDir, 'resources', 'osx', 'icon.icns'),
    path.join(finalAppDir, 'Contents', 'Resources', 'icon.icns')
  );

  const macOsDir = path.join(finalAppDir, 'Contents', 'MacOS');
  const nwjsBin = path.join(macOsDir, 'nwjs');
  const niceBin = path.join(macOsDir, manifest.productName);
  if (fs.existsSync(nwjsBin) && !fs.existsSync(niceBin)) {
    fs.renameSync(nwjsBin, niceBin);
  }

  const dmgName = `${manifest.name}_${manifest.version}.dmg`;
  const dmgPath = path.join(releasesDir, dmgName);
  if (fs.existsSync(dmgPath)) fs.unlinkSync(dmgPath);
  fs.mkdirSync(releasesDir, { recursive: true });

  const dmgStage = path.join(tmpDir, 'dmg-root');
  if (fs.existsSync(dmgStage)) fs.rmSync(dmgStage, { recursive: true, force: true });
  fs.mkdirSync(dmgStage, { recursive: true });
  copyDir(finalAppDir, path.join(dmgStage, appBundleName));
  fs.symlinkSync('/Applications', path.join(dmgStage, 'Applications'));

  console.log('Building DMG with hdiutil…');
  try {
    run(
      `hdiutil create -volname "${manifest.productName}" -srcfolder "${dmgStage}" -ov -format UDZO "${dmgPath}"`
    );
    console.log(`DMG ready: ${dmgPath}`);
    return dmgPath;
  } catch (err) {
    console.warn('hdiutil failed — staged .app kept at:', finalAppDir);
    throw err;
  }
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const platform =
    process.platform === 'darwin' ? 'osx' : process.platform === 'linux' ? 'linux' : 'windows';

  console.log(`OnlyKey App ${manifest.version} — release packaging (${platform})`);

  if (!skipAudit) {
    run('npm audit --omit=optional');
  } else {
    console.log('Skipping npm audit (--skip-audit)');
  }
  run('npm run build');

  const appDir = stageApplication(manifest);
  console.log('Staged app:', appDir);

  let artifact = null;
  if (platform === 'windows') {
    artifact = await buildWindowsInstaller(appDir, manifest);
  } else if (platform === 'osx') {
    artifact = await buildMacDmg(appDir, manifest);
  } else {
    artifact = await buildLinuxDeb(appDir, manifest);
  }

  // Keep releases/; drop staging clutter on success
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows file locks */
  }

  console.log('Release build complete.');
  if (artifact) console.log('Artifact:', artifact);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
