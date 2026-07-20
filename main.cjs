/**
 * NW.js entry point (CommonJS — NW does not reliably run ESM main scripts).
 * Opens the Vite dev server in development, otherwise the production build.
 */

const fs = require('node:fs');
const path = require('node:path');

const useDevServer =
  process.argv.includes('--dev-server') ||
  fs.existsSync(path.join(process.cwd(), '.dev-server'));

const devUrl = 'http://localhost:5173';

function resolveProductionIndex() {
  const candidates = ['dist/index.html', 'index.html'];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(process.cwd(), candidate))) return candidate;
  }
  return candidates[0];
}

function openAppWindow(urlOrPath) {
  const windowOptions = {
    width: 1024,
    height: 768,
    min_width: 800,
    min_height: 400,
    position: 'center',
    focus: true,
    icon: 'icon.png',
    show: true,
  };

  nw.Window.open(urlOrPath, windowOptions, (win) => {
    const showWindow = () => {
      if (!win.isVisible) win.show(true);
      win.focus();
    };

    showWindow();
    win.on('loaded', showWindow);

    if (process.argv.includes('--devtools')) {
      try {
        win.showDevTools();
      } catch (error) {
        console.warn('DevTools unavailable (SDK build required):', error);
      }
    }
  });
}

if (useDevServer) {
  openAppWindow(devUrl);
} else {
  const prodPath = resolveProductionIndex();
  const indexPath = path.join(process.cwd(), prodPath);
  if (!fs.existsSync(indexPath)) {
    console.error(`${prodPath} not found. Run "npm run build" first.`);
    nw.App.quit();
  } else {
    openAppWindow(prodPath);
  }
}