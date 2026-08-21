# OnlyKey App 5.7 — Feature parity vs 5.6

**Baseline tree:** `onlykey-app-v6` (promoted branch `release/5.7.0-modern-rewrite`)  
**Version:** **5.7.0** (renumbered from internal 6.0.0 label; not a protocol 6.x)  
**Assessed:** 2026-07-19 (source inventory) · **Status review:** 2026-08-17  
**Method:** Source inventory of `src/`, desktop scripts, packaging, and automated tests. **Done is not a hardware sign-off.** Firmware load and app auto-update have mocked/unit coverage only; they have not been run on a real key or a published 5.7 update channel.

Legend: **Done** = present with real UI + device API (unverified on hardware unless noted) · **Partial** = present but gaps vs 5.6 or untrusted for ship · **Unverified** = implemented in code, not exercised on device/channel · **Missing** = not found · **N/A** = intentional change / not product-critical

---

## Executive summary

| Area | Status vs 5.6 |
|------|----------------|
| Navigation / all tabs | **Done** (Setup, Slots, Keys, Backup, Firmware, Preferences, Advanced, Tools) |
| Device connect / lock / time | **Done** (HID transport, mock, lock screen Classic+DUO, config mode state) |
| Setup wizard Classic + DUO | **Done** (guided steps, PINs, backup key, restore; firmware handoff unverified) |
| Slots (basic / MFA / advanced) | **Done** (full field set + password generator + wipe confirm) |
| Keys (PGP / SSH PEM) | **Done** (import service, multi-key select, wipe) |
| Backup / Restore | **Done** (capture textarea, verify hash, save file, restore service) |
| Firmware | **Unverified** (UI + HID path exist; not loaded onto Classic/DUO) |
| Preferences (standard + advanced) | **Done** (layouts, wipe/challenge/backup-lock modes) |
| Advanced (Yubi AES + ECC/HMAC) | **Done** |
| Tools (WebCrypt / Agent links) | **Done** |
| Password generator | **Done** (clipboard-free dialog) |
| Tray / auto-launch / updater | **Done / Partial** (tray + prefs exist; app updater is download-to-folder only) |
| Packaging (NSIS etc.) | **Done** (`scripts/release.mjs`; artifacts named `OnlyKey_5.7.0.*`) |
| Automated tests | **Strong** (193 UI/unit tests in 44 files as of 2026-08-17; desktop NW tests separate) |
| Hardware matrix | **Not signed off** — firmware update and app update not run |

**Bottom line:** Product surface area is **near full 5.6 parity in code**. Firmware load and app auto-update must not be treated as working until someone runs them on hardware / a real 5.7 channel. Remaining work is that quality/security gate, not a feature rebuild.

---

## Tab / feature checklist

### Setup
| Item | Status | Evidence |
|------|--------|----------|
| Guided Classic PIN / PIN2 / SD PIN | Done | `src/components/Setup.tsx` steps + `setPin` / `setPin2` / `setSDPin` / `beginClassicPinEntry` |
| Guided DUO PIN entry | Done | `sendPinDUO`, duo steps |
| Disclaimers / re-entry | Done | disclaimer state in Setup |
| Backup passphrase → SHA-256 key | Done | `setBackupPassphrase` |
| PGP/ECC backup key in setup | Done | PEM import path + private key select dialog |
| Backup key lock mode | Done | `setBackupKeyMode` |
| Sec profile mode | Done | `setSecProfileMode` |
| Restore during setup | Done | restore file + `parseBackupData` |
| Firmware during setup | Unverified | firmware file + pending store — same untested path as Firmware tab |
| Config-mode instructions | Done | `ConfigModeInstructions` / `src/data/configMode.ts` |

### Slots
| Item | Status | Evidence |
|------|--------|----------|
| Classic 12 / DUO 24 layout | Done | `SlotGrid.tsx` |
| Basic / MFA / Advanced modes | Done | `SlotEditor` + `slotEditorPrefs` |
| Label, URL, user, password + confirm | Done | `slotConfigService` |
| Delays + next-key tab/return | Done | `NEXTKEY_*` / delay fields |
| TOTP Base32 + TFATYPE | Done | MFA path in slot service / base32 util |
| Per-slot Yubi OTP | Done | form fields in SlotEditor |
| Per-slot type speed | Done | `slotTypeSpeed` |
| Wipe + confirm | Done | `ConfirmDialog` |
| Password generator | Done | `PasswordGeneratorDialog` |

### Keys
| Item | Status | Evidence |
|------|--------|----------|
| PEM OpenPGP / SSH import | Done | `keyImportService`, openpgp/sshpk path |
| Multi-key select | Done | `PrivateKeySelectDialog` |
| RSA / ECC / Auto Load slots | Done | `KEY_SLOTS`, slot picker |
| Backup / signature flags | Done | import options |
| Wipe key | Done | `keyService.wipeKeyInSlot` |

### Backup / Restore
| Item | Status | Evidence |
|------|--------|----------|
| Device-typed backup capture | Done | Backup tab textarea (device types into focused field) |
| SHA-256 verify | Done | `backupVerify` |
| Save file | Done | Blob download |
| Restore file → chunked OKRESTORE | Done | `backupService.restoreBackupFromFile` |

### Firmware
| Item | Status | Evidence |
|------|--------|----------|
| File pick + parse signed FW | Unverified | `parseFirmwareData` + Firmware tab — mocked UI tests only |
| Bootloader kick + stream | Unverified | `triggerBootloader` / `loadFirmwareBlocks` — not run on a key |
| Download latest | Unverified | `firmwareDownload.ts` fetches GitHub `Signed_OnlyKey_*_STD.txt`; no SHA-256 check |
| Resume after reboot | Unverified | `sessionStorage` pending store — lost if the app window is closed |

### Preferences
| Item | Status | Evidence |
|------|--------|----------|
| Type speed, layout (full list), LED, lockout, lock button | Done | `Preferences.tsx` + `KEYBOARD_LAYOUTS` |
| Sysadmin / HMAC / challenge modes | Done | advanced pref panel |
| Full wipe mode (correct wording) | Done | `WIPE_MODE_FULL` + caution button |
| Backup key lock | Done | caution button |

### Advanced
| Item | Status | Evidence |
|------|--------|----------|
| Global Yubi AES set/wipe | Done | `Advanced.tsx` + device API |
| ECC/HMAC form + modifiers | Done | same |

### Tools
| Item | Status | Evidence |
|------|--------|----------|
| WebCrypt + Agent external links | Done | `Tools.tsx` (open in external browser — verify NW external policy) |

### Desktop shell
| Item | Status | Evidence |
|------|--------|----------|
| NW entry / prod package | Done | `main.cjs`, `scripts/start-desktop.mjs`, `release.mjs` |
| Tray | Done / verify | `desktopBg.cjs`, `desktopInject.js`, `docs/desktop-tray.md`, verify scripts |
| Auto-launch / user prefs | Done / verify | `userPreferences.cjs`, desktop modules |
| App auto-updater | Partial | `updater.ts`: HTTPS manifest + download to temp + open folder. No hash/signature. Defaults **on**. Points at live 5.6 S3 `manifestUrl`. Never exercised for 5.7. |
| Theme toggle | Done (new vs 5.6) | `ThemeToggle` |

---

## Known residual risks (not full feature absence)

1. **Firmware load untested on hardware** — Classic and DUO file-load, bootloader kick, block stream, and resume have not been signed off. `autoUpdateFW` defaults on and will prompt from GitHub.
2. **App updater untested and unsigned** — no installer integrity check; S3 channel is still the 5.6 `manifestUrl`. `autoUpdate` defaults on.
3. **Searching spinner UX** — disconnected overlay still uses spinning emoji badge in `App.tsx`.
4. **Preferences error UX** — some `run()` handlers only `console.error` (may need user-visible errors for security ops).
5. **Hardware gate** — Classic + DUO matrix not recorded as passed in this repo.
6. **Chrome App path** — desktop NW is primary; Chrome packaging is secondary/legacy.

---

## Test snapshot

`npx vitest run --project ui` on 2026-08-17: **193 tests / 44 files passed**. Desktop NW tests (`npm run test:desktop`) are separate and do not cover firmware load or app update.

```bash
npm run test:unit
```

---

## Release gate (carry-forward)

- [ ] `npm run test:unit` green on `release/5.7.0-modern-rewrite`
- [ ] Version **5.7.0** consistent in package/manifest/release URLs
- [ ] Firmware file-load + download-latest on lab Classic and DUO
- [ ] App update against a real 5.7 HTTPS manifest (with integrity) before leaving `autoUpdate` on
- [ ] Production package: no dev-only node-remote, no secret logging
- [ ] Installer smoke on clean machine

---

## Maintenance

Update this file when parity status changes. Prefer checkboxes and file pointers over narrative-only status.
