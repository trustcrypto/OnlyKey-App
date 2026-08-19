// Appended to dist/index.html during automated tray verification (npm run verify:tray).
(function () {
  if (typeof nw === 'undefined') return;

  var fs = require('fs');
  var path = require('path');

  var resultArg = (nw.App.argv || []).find(function (arg) {
    return arg.indexOf('--onlykey-test-result=') === 0;
  });
  if (!resultArg) return;

  var resultPath = resultArg.slice('--onlykey-test-result='.length);

  function trayReadyPath() {
    return path.join(nw.App.startPath, 'tmp', 'tray-ready.json');
  }

  function isTrayHostReady() {
    try {
      if (!fs.existsSync(trayReadyPath())) return false;
      var meta = JSON.parse(fs.readFileSync(trayReadyPath(), 'utf8'));
      return meta.ready === true && meta.hasQuitMenuItem === true;
    } catch {
      return false;
    }
  }

  function waitForTrayReady(timeoutMs, onReady, onTimeout) {
    var started = Date.now();
    function tick() {
      try {
        if (isTrayHostReady()) {
          onReady();
          return;
        }
      } catch (error) {
        onTimeout(String(error));
        return;
      }

      if (Date.now() - started >= timeoutMs) {
        onTimeout('Background tray never became ready');
        return;
      }

      setTimeout(tick, 100);
    }
    tick();
  }

  waitForTrayReady(
    8000,
    function () {
      setTimeout(function () {
        var result = {
          ok: false,
          scenario: 'dist.index.tray',
          state: null,
          error: null,
        };

        try {
          var desktop = require(path.join(nw.App.startPath, 'desktopBg.cjs'));
          desktop.start();
          var state = desktop.getTestState();
          result.state = state;
          result.ok =
            state.trayInMainContext &&
            state.hasQuitMenuItem &&
            state.iconExists &&
            state.closeHandlerBound;
        } catch (error) {
          result.error = String(error);
        }

        fs.mkdirSync(path.dirname(resultPath), { recursive: true });
        fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

        if (result.ok) {
          try {
            desktop.dispatchTrayCommand('quit');
          } catch {
            nw.App.quit();
          }
        } else {
          nw.App.quit();
          setTimeout(function () {
            process.exit(1);
          }, 200);
        }
      }, 500);
    },
    function (error) {
      var result = {
        ok: false,
        scenario: 'dist.index.tray',
        state: null,
        error: error,
      };
      fs.mkdirSync(path.dirname(resultPath), { recursive: true });
      fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
      nw.App.quit();
      setTimeout(function () {
        process.exit(1);
      }, 200);
    }
  );
})();