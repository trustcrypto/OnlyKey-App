# AGENTS.md — OnlyKey App

Agent instructions for this repository. Firmware in `../OnlyKey-Firmware` is **read-only — do not modify it**.

## Overview

Official desktop app for OnlyKey hardware: setup, slots, PGP/SSH keys, backup/restore, and preferences.

- **Runtime:** NW.js **0.104.1** (pinned). Do not bump to 0.105+ — Windows tray menu clicks are broken there. See `docs/desktop-tray.md`.
- **Frontend:** React 19 + TypeScript, Zustand, Tailwind 4
- **Build:** Vite 7
- **Device I/O:** Raw HID via `chrome.hid`, wrapped by `ChromeHidTransport`

Host Node (Vite, tests, packaging) is independent of the Node version inside NW.js. There are no native `.node` addons today. If one is added, rebuild it with `nw-gyp` for **0.104.1**, not the host ABI.

## Commands

```bash
npm install          # allowScripts includes nw@0.104.1 so NW downloads
npm start            # vite build + launch NW on dist/index.html
npm run dev:server   # Vite HMR + NW pointed at localhost:5173
npm run build
npm test             # all vitest projects
npm run test:unit    # UI / unit (happy-dom)
npm run test:desktop # NW desktop tests
npm run verify:tray
npm run release      # OS-specific installer; run on the target OS
```

`npm start` is **not** the Vite-only dev server. That is `npm run dev` / `npm run dev:server`.

## Layout

- `src/api/device/` — OnlyKey protocol (`OnlyKeyDevice`, parsers, types)
- `src/api/transport/` — HID + mock transports
- `src/components/`, `src/store/`, `src/services/`
- `src/desktop/` — updater, firmware download, prefs (renderer)
- `src/test/` — vitest helpers (not the test suites)
- `tests/desktop/` — NW integration / static tests
- `desktopBg.cjs`, `desktopInject.js`, `userPreferences.cjs`, `main.cjs` — desktop shell
- `scripts/` — start, release, tray verify
- `resources/` — icons, NSIS, udev, macOS plist
- `docs/desktop-tray.md` — tray architecture; read before changing tray/window code
- `docs/FEATURE_PARITY_5.6.md` — 5.6 vs 5.7 product checklist

## Constraints

- Talk to the device only through `OnlyKeyDevice` — no raw HID from UI.
- Device state lives in `useDeviceStore`.
- Message and field IDs: enums in `src/api/device/types.ts`.
- Tray lives in the **main window** (`desktopInject.js` → `desktopBg.cjs` `start()`). Do not add `bg-script`, a host window, or compat shims (`desktopClose.cjs`, `desktopRuntime.cjs`, `tray.cjs`).
- Chrome App packaging is legacy. `ChromeHidTransport` is the NW/`chrome.hid` path, not a second product.

## HID protocol (app → firmware)

64-byte raw HID packets.

| Offset | Size | Description |
|--------|------|-------------|
| 0–3 | 4 | Header `0xFF 0xFF 0xFF 0xFF` |
| 4 | 1 | MessageID |
| 5 | 1 | SlotID (0–24 or system-wide) |
| 6 | 1 | FieldID |
| 7–63 | 57 | Payload, zero-padded |

Common MessageIDs: `0xE1` OKSETPIN, `0xE4` OKSETTIME, `0xE5` OKGETLABELS, `0xE6` OKSETSLOT, `0xE7` OKWIPESLOT, `0xF4` OKFWUPDATE.

Device replies are 64-byte reports, usually ASCII: `UNLOCKEDv…`, `INITIALIZED`, `UNINITIALIZED`, `LOCKED`, `slotId|label`, or `Error`/`ERROR`.
