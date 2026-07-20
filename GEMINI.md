# GEMINI.md - OnlyKey App

## Project Overview
The **OnlyKey App** is the official desktop application for managing **OnlyKey** hardware devices. It provides a user interface for initial setup, account configuration (slots), key management (PGP, SSH), backup/restore operations, and preference settings.

### Core Technologies
- **Runtime:** NW.js (Primary desktop runtime) with Vite-based development server.
- **Frontend:** React 19 (TypeScript), Zustand for state management.
- **Build System:** Vite 7.
- **Styling:** Tailwind CSS 4.
- **Hardware Communication:** Communicates with OnlyKey devices via HID (Human Interface Device) protocol using `chrome.hid` APIs via a custom transport abstraction.

## Related Projects
- **OnlyKey-Firmware:** The source code for the firmware that runs on the OnlyKey device is located in `../OnlyKey-Firmware`. Coordination between app and firmware changes may be required for new features or protocol updates. IT IS READ ONLY; DO NOT TOUCH THE FIRMWARE CODE.

---

## Building and Running

### Prerequisites
- **Node.js:** Ensure a modern version of Node.js is installed.

### Development Commands
- **Install Dependencies:**
  ```bash
  npm install
  ```
- **Start Application (Development Mode):**
  This starts the Vite dev server and launches NW.js pointing to the dev server.
  ```bash
  npm start
  ```
- **Build Project:**
  Compiles and bundles the application into the `dist/` directory.
  ```bash
  npm run build
  ```
- **Run Tests:**
  ```bash
  npm run test:unit
  ```

---

## Project Structure
- `src/`: Main source code.
  - `api/`: Device communication and protocol logic.
    - `device/`: OnlyKey-specific message building and response parsing.
    - `transport/`: HID transport implementations (Chrome HID, Mock).
  - `components/`: React UI components.
  - `store/`: Zustand stores for application state (e.g., `useDeviceStore`).
  - `types/`: TypeScript definitions and enums.
- `app/`: Legacy assets and vendor scripts (e.g., `openpgp.min.js`).
- `resources/`: OS-specific resources (icons, installer scripts, udev rules).
- `test/`: Integration and unit tests.

---

## Communication Protocol (App <-> Firmware)

The App communicates with OnlyKey devices using **Raw HID** 64-byte packets.

### Packet Format (App to Device)
| Offset | Size | Description |
| :--- | :--- | :--- |
| 0 - 3 | 4 bytes | **Header:** Always `0xFF 0xFF 0xFF 0xFF` for OnlyKey commands. |
| 4 | 1 byte | **MessageID:** Command type (e.g., `0xE6` for `OKSETSLOT`). |
| 5 | 1 byte | **SlotID:** Target slot (0-24) or system-wide identifier (`XX`). |
| 6 | 1 byte | **FieldID:** Specific field (e.g., `1` for Label, `5` for Password). |
| 7 - 63| 57 bytes| **Data Payload:** Command-specific data (padded with zeros). |

### Key Message IDs (MessageID)
- `225 (0xE1)`: `OKSETPIN` - Set device PIN.
- `228 (0xE4)`: `OKSETTIME` - Sync device clock (required for TOTP).
- `229 (0xE5)`: `OKGETLABELS` - Request slot labels from device.
- `230 (0xE6)`: `OKSETSLOT` - Write configuration to a slot.
- `231 (0xE7)`: `OKWIPESLOT` - Erase a slot.
- `244 (0xF4)`: `OKFWUPDATE` - Trigger/send firmware update blocks.

### Response Format (Device to App)
The device sends 64-byte reports, typically containing ASCII strings:
- **Status Messages:** `UNLOCKEDv3.0.1`, `INITIALIZED`, `UNINITIALIZED`, `LOCKED`.
- **Labels:** Streamed in format `slotId|label` (e.g., `01|Google`).
- **Confirmation:** Messages like `set AES Key` or `wiped AES Key`.
- **Errors:** Messages starting with `Error` or `ERROR`.

---

## Node.js & NW.js Version Management

The **OnlyKey App** runs in **NW.js**, which has its own internal Node.js version. It is important to distinguish between your **Host Node.js** (used for building) and the **Internal Node.js** (used at runtime).

### Version Compatibility
- **NW.js v0.109.0** uses **Node.js v25.3.0** internally.
- **Host Node.js:** Your host version (e.g., v24.x, v26.x) only needs to be compatible with the build tools (**Vite 7**, **Tailwind 4**, etc.).
- **Pure JS Dependencies:** If the project only uses pure JavaScript dependencies, the host and internal Node.js versions do **not** need to match.

### Native Modules (.node files)
If the project ever adds **native modules** (compiled C++ addons), they must match the **ABI (Application Binary Interface)** of the internal Node.js in NW.js.
- **Problem:** Running `npm install` on a host with a different Node version will compile native modules for the host ABI, which may cause them to fail to load in NW.js.
- **Solution:** Use **`nw-gyp`** to rebuild native modules specifically for the NW.js version:
  ```bash
  npm install -g nw-gyp
  nw-gyp rebuild --target=0.109.0
  ```
- **Avoid:** Do not attempt to match your host Node.js version exactly to the internal NW.js version for every project; use target-specific rebuilding instead.

### Recommended Environment Setup
To manage multiple Node.js versions on your host machine for different projects:
- **Windows:** Use [nvm-windows](https://github.com/coreybutler/nvm-windows).
- **macOS/Linux:** Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm).

This allows you to keep your host on a modern Node.js version (e.g., v26+) while the app remains pegged to the specific version required by the NW.js runtime.

---

## Development Conventions
- **Device Interaction:** Always use the `OnlyKeyDevice` class (in `src/api/device/OnlyKeyDevice.ts`) rather than direct HID calls.
- **State Management:** Device state (connectivity, locked status, labels) is synchronized via `useDeviceStore`.
- **Dual Runtime:** While primarily NW.js, the `ChromeHidTransport` allows for potential Chrome App/Extension compatibility.
- **Type Safety:** Use the enums in `src/api/device/types.ts` for all Message and Field IDs.
