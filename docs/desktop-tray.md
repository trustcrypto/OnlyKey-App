# Desktop tray architecture

NW.js runs multiple JavaScript contexts for this app. **Do not move tray code without reading this.**

## NW.js version pin (required on Windows)

**Do not use NW 0.105+ for tray menus on Windows.** v0.105.0 broke `MenuItem` click handlers ([issue #8313](https://github.com/nwjs/nw.js/issues/8313), [#8317](https://github.com/nwjs/nw.js/issues/8317)): the icon and menu render, clicks do nothing. This matches “`initTray complete` but no `menu click` logs.”

`package.json` pins `"nw": "0.104.1"` (normal flavor, not `-sdk`) until NW.js ships a verified fix.

## The pattern that works on NW.js

The maintained reference is [nw-tray-example](https://github.com/nwutils/nw-tray-example): tray + menu are created in the **main window** from a script loaded at document start (`index.js` / our `desktopInject.js`). NW.js [documents](https://docs.nwjs.io/References/Tray/) that trays in navigable pages can break after reload; this app is a single-page React app on `dist/index.html`, so the tray outlives the session.

## What we tried and why it failed (NW 0.105 / Windows)

| Approach | Result |
|----------|--------|
| `bg-script: desktopBg.html` | **Never executed** in headless/integration runs — no `tray-ready.json`, empty debug log |
| `Window.open(desktopBg.html)` + inline `<script>` | Script ran in **main** renderer (`startBackground` logged `dist/index.html`) |
| Child window + `inject_js_start` | Tray init in `_generated_background_page.html`; **menu clicks never fired** |
| Off-screen 1×1 `show: true` host | **White blob** upper-left; menus still dead |
| `hostWin.eval()` bootstrap | `require is not defined` — eval VM has no Node |

Do **not** reintroduce a tray host window or `bg-script` without re-verifying on real Windows NW 0.105.

## Current rule

1. `package.json` → `window.inject_js_start: desktopInject.js` calls `desktopBg.cjs` → `start()`.
2. `start()` clears stale `tmp/tray-*`, binds close-to-tray, calls `initTray()` in the **main renderer**, polls `tmp/tray-command.json` (for tests / fallback).
3. Tray menu `click` handlers call `dispatchTrayCommand()` → `processTrayCommand()` in the same renderer.
4. `scripts/start-desktop.mjs` clears tray tmp files before launch and `taskkill`s stale `nw.exe` on exit.

## Hide-to-tray caveat

Chromium may throttle a **hidden** main renderer; tray menus can stop firing after hide-to-tray. Mitigations in place:

- `package.json` `chromium-args` disables background throttling
- Main polls `tmp/tray-command.json` if a cross-context path is needed later

If hide-to-tray regresses menu clicks, next step is **minimize-to-tray** (stay visible to OS, drop from taskbar) rather than another host window.

## File IPC

| File | Purpose |
|------|---------|
| `tmp/tray-ready.json` | Tray created (tests wait on this) |
| `tmp/tray-command.json` | Optional command path for harnesses |
| `tmp/suppress-show.json` | Hide-to-tray suppress flag |
| `tmp/tray-debug.log` | Debug when `--onlykey-tray-debug` / `--devtools` |

## Testing

```bash
npm run verify:tray
npm run test:desktop
```

Integration tests simulate the command file path when the main window is hidden; they do not click the real OS tray menu.