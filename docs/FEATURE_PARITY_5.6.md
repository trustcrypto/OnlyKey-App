# OnlyKey App 5.7 — Feature parity vs 5.6

**Baseline tree:** `onlykey-app-v6` (promoted branch `release/5.7.0-modern-rewrite`)  
**Version:** **5.7.0** (renumbered from internal 6.0.0 label; not a protocol 6.x)  
**Assessed:** 2026-07-19  
**Method:** Source inventory of `src/`, desktop scripts, packaging, tests — **no prior parity markdown was found in-repo** (only `docs/desktop-tray.md`, `GEMINI.md`, `README.md`). This document is the new living checklist.

Legend: **Done** = present with real UI + device API · **Partial** = present but gaps vs 5.6 · **Missing** = not found · **N/A** = intentional change / not product-critical

---

## Executive summary

| Area | Status vs 5.6 |
|------|----------------|
| Navigation / all tabs | **Done** (Setup, Slots, Keys, Backup, Firmware, Preferences, Advanced, Tools) |
| Device connect / lock / time | **Done** (HID transport, mock, lock screen Classic+DUO, config mode state) |
| Setup wizard Classic + DUO | **Done** (guided steps, PINs, backup key, restore, firmware handoff) |
| Slots (basic / MFA / advanced) | **Done** (full field set + password generator + wipe confirm) |
| Keys (PGP / SSH PEM) | **Done** (import service, multi-key select, wipe) |
| Backup / Restore | **Done** (capture textarea, verify hash, save file, restore service) |
| Firmware | **Done** (file + download latest, bootloader kick, block stream, resume) |
| Preferences (standard + advanced) | **Done** (layouts, wipe/challenge/backup-lock modes) |
| Advanced (Yubi AES + ECC/HMAC) | **Done** |
| Tools (WebCrypt / Agent links) | **Done** |
| Password generator | **Done** (clipboard-free dialog) |
| Tray / auto-launch / updater | **Done / Partial** (tray + prefs scripts present; treat auto-update as verify-on-hardware) |
| Packaging (NSIS etc.) | **Done** (`scripts/release.mjs`; prior test install used 6.0.0 artifact names) |
| Automated tests | **Strong** (dozens of unit + UI tests; re-run after renumber) |
| Hardware matrix | **Not signed off** in this doc |

**Bottom line:** Product surface area is **near full 5.6 parity in code**. Remaining work is quality/security gate (hardware, release renames, residual bugs, polish), not greenfield feature rebuild.

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
| Firmware during setup | Done | firmware file + pending firmware store |
| Config-mode instructions | Done | `ConfigModeInstructions` / notices |

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
| File pick + parse signed FW | Done | `parseFirmwareData` |
| Bootloader kick + stream | Done | `triggerBootloader` / `loadFirmwareBlocks` |
| Download latest | Done | `firmwareDownload.ts` |
| Resume after reboot | Done | `firmwareCheck` pending store |

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
| App auto-updater | Partial | `src/desktop/updater.ts` — confirm HTTPS + integrity before shipping |
| Theme toggle | Done (new vs 5.6) | `ThemeToggle` |

---

## Known residual risks (not full feature absence)

1. **Version / artifact renames** — code was labeled 6.0.0; branch + package now **5.7.0**. Ensure installer filenames, S3 manifest, and any leftover `OnlyKey_6.0.0.*` artifacts are updated before publish.
2. **Searching spinner UX** — disconnected overlay still uses spinning emoji badge in `App.tsx` (same class of UI bug as the thin rewrite).
3. **Preferences error UX** — some `run()` handlers only `console.error` (may need user-visible errors for security ops).
4. **Hardware gate** — Classic + DUO matrix not recorded as passed in this repo.
5. **Auto-update trust model** — re-audit before enabling for production.
6. **Chrome App path** — desktop NW is primary; Chrome packaging is secondary/legacy.

---

## Test snapshot (from prior v6 session logs)

Historical run in prior agent session reported **~96 tests / 25 files passing**. Re-run after renumber:

```bash
npm test
```

---

## Release gate (carry-forward)

- [ ] `npm test` green on `release/5.7.0-modern-rewrite`
- [ ] Version **5.7.0** consistent in package/manifest/release URLs
- [ ] Hardware H1–H14 Classic + DUO
- [ ] Production package: no dev-only node-remote, no secret logging
- [ ] Installer smoke on clean machine

---

## Maintenance

Update this file when parity status changes. Prefer checkboxes and file pointers over narrative-only status.
