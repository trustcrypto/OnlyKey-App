// Shared helpers for NW desktop integration harness pages.
function createTrayTestHelpers(nw, fs, path) {
  function trayReadyPath() {
    return path.join(nw.App.startPath, 'tmp', 'tray-ready.json');
  }

  function isTrayHostReady() {
    try {
      if (!fs.existsSync(trayReadyPath())) return false;
      const meta = JSON.parse(fs.readFileSync(trayReadyPath(), 'utf8'));
      return meta.ready === true && meta.hasQuitMenuItem === true;
    } catch {
      return false;
    }
  }

  function waitForTrayReady(timeoutMs) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        try {
          if (isTrayHostReady()) {
            resolve(true);
            return;
          }
        } catch (error) {
          reject(error);
          return;
        }

        if (Date.now() - started >= timeoutMs) {
          reject(new Error('Background tray never became ready'));
          return;
        }

        setTimeout(tick, 100);
      };
      tick();
    });
  }

  function waitUntil(predicate, timeoutMs, label) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        try {
          if (predicate()) {
            resolve(true);
            return;
          }
        } catch (error) {
          reject(error);
          return;
        }

        if (Date.now() - started >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${label}`));
          return;
        }

        setTimeout(tick, 100);
      };
      tick();
    });
  }

  return { waitForTrayReady, waitUntil, trayReadyPath };
}

if (typeof module !== 'undefined') {
  module.exports = { createTrayTestHelpers };
}