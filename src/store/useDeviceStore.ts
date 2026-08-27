import { create } from 'zustand';
import { OnlyKeyDevice } from '../api/device/OnlyKeyDevice';
import type { DeviceClient } from '../api/device/DeviceClient';
import { ChromeHidTransport } from '../api/transport/ChromeHidTransport';
import { MockTransport } from '../api/transport/MockTransport';
import { DeviceType } from '../api/device/types';
import type { DuoProfileId } from '../api/device/firmwareConstants';
import { isConnectErrorLikelyUdev, isLinux } from '../utils/platform';
import {
  checkForNewFirmware,
  getPendingFirmware,
  clearPendingFirmware,
  supportsAppFirmwareUpdate,
  FirmwareCheckResult
} from '../desktop/firmwareCheck';
import { disconnectedDeviceSnapshot, lockedSessionWipeSnapshot } from './deviceStateReset';

interface DeviceState {
  isConnected: boolean;
  isConnecting: boolean;
  isLocked: boolean;
  isConfigMode: boolean;
  isBootloader: boolean;
  isRefreshingLabels: boolean;
  isPolling: boolean;
  deviceType: DeviceType;
  deviceTypeSource: string;
  usbProductId: number | null;
  maxLabelSlot: number;
  lastStatusText: string;
  version: string;
  devicePinSet: boolean;
  duoProfile: DuoProfileId;
  isWorking: boolean;
  workingMessage: string;
  /** 0–100 while a long job runs; null when indeterminate / inactive. */
  workingProgress: number | null;
  fwUpdateSupport: boolean;
  firmwareCheck: FirmwareCheckResult | null;
  labels: Record<number, string>;
  error: string | null;
  pinError: string | null;
  recentMessages: string[];
  showUdevDialog: boolean;
  activeTab: 'setup' | 'slots' | 'keys' | 'backup' | 'firmware' | 'preferences' | 'advanced' | 'tools';
  selectedSlotId: number | null;
  /**
   * Bumped on disconnect and on unlocked→locked. App.tsx keys sensitive UI on
   * this value so React remounts and drops page-local secrets (backup textarea,
   * setup PINs, slot drafts, etc.).
   */
  sessionEpoch: number;
}

/** Options for store.connect(). */
export type ConnectOptions = {
  /**
   * When true, flip `isConnecting` so the UI shows a connecting badge.
   * Startup, 2s poll, and onDeviceAdded probes pass false — the Searching
   * overlay already covers "no device", and a badge on every HID probe flickers.
   */
  announce?: boolean;
};

export type PermittedHidDevice = { vendorId: number; productId: number; productName?: string };

/** Options for store.initialize(). A boolean is still accepted as `useMock`. */
export type InitializeOptions = {
  useMock?: boolean;
  device?: DeviceClient;
  listPermittedDevices?: () => Promise<PermittedHidDevice[]>;
};

export interface DeviceStore extends DeviceState {
  device: DeviceClient | null;
  initialize: (useMockOrOptions?: boolean | InitializeOptions) => Promise<void>;
  connect: (options?: ConnectOptions) => Promise<void>;
  disconnect: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  setActiveTab: (tab: DeviceState['activeTab']) => void;
  setSelectedSlot: (slotId: number | null) => void;
  setDuoProfile: (profile: DuoProfileId) => void;
  setWorking: (active: boolean, message?: string, progress?: number | null) => void;
  clearError: () => void;
  clearPinError: () => void;
  dismissUdevDialog: () => void;
  refreshLabels: () => Promise<void>;
  resumePendingFirmware: () => Promise<void>;
}

// Match v5.5: filter by vendorId/productId only; transport picks the right HID interface.
const SUPPORTED_DEVICES = [
  { vendorId: 0x1D50, productId: 0x614C }, // DUO (prefer explicit PIDs before shared 0x60FC)
  { vendorId: 0x1D50, productId: 0x614E }, // DUO
  { vendorId: 0x20A0, productId: 0x4211 }, // DUO
  { vendorId: 0x16C0, productId: 0x0486 }, // Classic (pre-Beta 8)
  { vendorId: 0x1D50, productId: 0x60FC }, // Beta 7+ / DUO (ambiguous — type from firmware)
  { vendorId: 0x0000, productId: 0xB001 }, // Bootloader
];

let pollInterval: NodeJS.Timeout | null = null;
let firmwareCheckInFlight: Promise<void> | null = null;
let firmwareResumeInFlight: Promise<void> | null = null;
/** In-flight connect mutex — separate from UI `isConnecting` so silent polls can run. */
let connectInFlight = false;
/** Coalesced: a plug arrived while connect() was still running. */
let pendingReconnect = false;
/** Identifies the current store connect so a superseded attempt cannot wipe a live session. */
let connectAttempt = 0;
let connectWatchdog: ReturnType<typeof setTimeout> | null = null;
/** Last-resort: if device.connect() never settles, release the mutex. */
export const CONNECT_WATCHDOG_MS = 20_000;
let listPermittedDevicesFn: () => Promise<PermittedHidDevice[]> = async () => [];

/** Test-only: drop module-level connect mutex/watchdog so suites cannot leak hangs. */
export function resetDeviceStoreRuntimeForTests(): void {
  connectInFlight = false;
  pendingReconnect = false;
  connectAttempt += 1;
  listPermittedDevicesFn = async () => [];
  if (connectWatchdog) {
    clearTimeout(connectWatchdog);
    connectWatchdog = null;
  }
}

function parseInitializeOptions(
  useMockOrOptions?: boolean | InitializeOptions,
): InitializeOptions {
  if (typeof useMockOrOptions === 'boolean') return { useMock: useMockOrOptions };
  return useMockOrOptions ?? {};
}

/** Default landing tab once a device is usable. */
function defaultTabForDevice(state: {
  isLocked: boolean;
  isBootloader: boolean;
  deviceType: DeviceType;
}): DeviceState['activeTab'] {
  if (state.deviceType === DeviceType.UNINITIALIZED) return 'setup';
  if (state.isLocked || state.isBootloader) return 'setup';
  // Initialized + unlocked (Classic/DUO, or type still refining) → Slots.
  return 'slots';
}

/** Wait for label-driven device type identification before any blocking firmware UI. */
async function waitForLabelIdentification(
  get: () => DeviceStore,
  maxMs = 6000,
): Promise<void> {
  const started = Date.now();
  while (get().isRefreshingLabels && Date.now() - started < maxMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function promptFirmwareUpdateIfNeeded(
  get: () => DeviceStore,
  set: (partial: Partial<DeviceStore>) => void,
  version: string,
): Promise<void> {
  if (firmwareCheckInFlight) return firmwareCheckInFlight;

  firmwareCheckInFlight = (async () => {
    try {
      await waitForLabelIdentification(get);
      const check = await checkForNewFirmware(version, get().deviceType);
      set({ firmwareCheck: check });

      if (check.updateAvailable && check.latestVersion) {
        const shouldPrompt = userPreferencesAutoUpdateFW();
        if (
          shouldPrompt &&
          confirm(
            `Firmware ${check.latestVersion} is available. Your version is ${version}. Open the Firmware tab to update?`,
          )
        ) {
          set({ activeTab: 'firmware' });
        }
      }
    } finally {
      firmwareCheckInFlight = null;
    }
  })();

  return firmwareCheckInFlight;
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  isConnected: false,
  isConnecting: false,
  isLocked: true,
  isConfigMode: false,
  isBootloader: false,
  isRefreshingLabels: false,
  isPolling: false,
  deviceType: DeviceType.UNKNOWN,
  deviceTypeSource: '',
  usbProductId: null,
  maxLabelSlot: 0,
  lastStatusText: '',
  version: '',
  devicePinSet: true,
  duoProfile: 'green',
  isWorking: false,
  workingMessage: 'Please wait…',
  workingProgress: null,
  fwUpdateSupport: false,
  firmwareCheck: null,
  labels: {},
  error: null,
  pinError: null,
  recentMessages: [],
  showUdevDialog: false,
  device: null,
  activeTab: 'setup',
  selectedSlotId: null,
  sessionEpoch: 0,

  initialize: async (useMockOrOptions: boolean | InitializeOptions = false) => {
    if (get().device) return;

    const options = parseInitializeOptions(useMockOrOptions);
    const useMock = options.useMock === true;
    listPermittedDevicesFn =
      options.listPermittedDevices ??
      (useMock || options.device
        ? async () => []
        : () => ChromeHidTransport.listPermittedDevices());

    let device = options.device;
    if (!device) {
      const transport = useMock ? new MockTransport() : new ChromeHidTransport();
      if (!useMock && transport instanceof ChromeHidTransport) {
        transport.onDeviceAdded(() => {
          if (get().isConnected) return;
          if (connectInFlight) {
            pendingReconnect = true;
            return;
          }
          void get().connect({ announce: false });
        });
      }
      device = new OnlyKeyDevice(transport);
    }

    device.on('statusChange', async (state) => {
      if (!state.isConnected) {
        // INITIALIZED during transport.connect has lastStatusText but isConnected
        // is still false. A real unplug/resetDeviceState has an empty snapshot.
        if (connectInFlight && state.lastStatusText) return;
        // CRITICAL: unplug / disconnect wipes all device session UI state.
        set({
          ...disconnectedDeviceSnapshot,
          isConnecting: get().isConnecting,
          activeTab: 'setup',
          sessionEpoch: get().sessionEpoch + 1,
        });
        return;
      }

      const wasConnected = get().isConnected;
      const wasLocked = get().isLocked;
      const isNowLocked = state.isLocked;
      const fwSupport = supportsAppFirmwareUpdate(state.version);

      // CRITICAL: unlocked → locked ends the UI session. Wipe secrets even though
      // the USB connection may still be open (idle lock, user re-locked, etc.).
      if (wasConnected && !wasLocked && isNowLocked) {
        set({
          ...lockedSessionWipeSnapshot,
          isConnected: true,
          isLocked: true,
          isConfigMode: state.isConfigMode,
          isBootloader: state.isBootloader,
          deviceType: state.deviceType,
          deviceTypeSource: state.deviceTypeSource,
          usbProductId: state.usbProductId,
          maxLabelSlot: 0,
          lastStatusText: state.lastStatusText,
          version: state.version,
          devicePinSet: state.devicePinSet,
          fwUpdateSupport: fwSupport,
          // Never keep labels while locked — firmware may still return them.
          labels: {},
          sessionEpoch: get().sessionEpoch + 1,
        });
        return;
      }

      set({
        isConnected: true,
        isLocked: state.isLocked,
        isConfigMode: state.isConfigMode,
        isBootloader: state.isBootloader,
        deviceType: state.deviceType,
        deviceTypeSource: state.deviceTypeSource,
        usbProductId: state.usbProductId,
        maxLabelSlot: state.maxLabelSlot,
        lastStatusText: state.lastStatusText,
        version: state.version,
        devicePinSet: state.devicePinSet,
        fwUpdateSupport: fwSupport,
        // While locked, never surface label cache in the store.
        labels: isNowLocked ? {} : Object.fromEntries(state.labels),
        error: null,
        pinError: null,
        // First unlock of an initialized device → Slots. Config-mode PIN
        // also reports UNLOCKED (set_time); stay on the current tab so Setup
        // Change PIN / passphrase is not yanked away to Slots.
        ...(wasLocked && !isNowLocked && !state.isConfigMode
          ? {
              activeTab: defaultTabForDevice({
                isLocked: false,
                isBootloader: state.isBootloader,
                deviceType: state.deviceType,
              }),
            }
          : {}),
      });

      // Identify device type via labels before the firmware prompt can block the event loop.
      const shouldRefreshLabels =
        state.isConnected &&
        !isNowLocked &&
        !state.isBootloader &&
        !get().isRefreshingLabels &&
        ((wasLocked && !isNowLocked) || Object.keys(get().labels).length === 0);

      if (shouldRefreshLabels) {
        void get().refreshLabels();
      }

      if (state.version) {
        void promptFirmwareUpdateIfNeeded(get, set, state.version);
      }
    });

    device.on('error', (error) => {
      if (!get().isConnected) return;
      if (error.includes('password attempts') || error.includes('Incorrect PIN')) {
        set({ pinError: error });
      } else {
        set({ error });
      }
    });

    device.on('labelUpdate', (slotId, label) => {
      if (!get().isConnected || get().isLocked || get().isRefreshingLabels) return;
      set((s) => ({ labels: { ...s.labels, [slotId]: label } }));
    });

    device.on('labelsRefreshed', (labels) => {
      if (!get().isConnected || get().isLocked) return;
      set({ labels: Object.fromEntries(labels) });
    });

    device.on('messageReceived', (message) => {
      if (!get().isConnected) return;
      const isStatus =
        message.includes('UNLOCKED') ||
        message.includes('INITIALIZED') ||
        message.includes('BOOTLOADER');
      if (get().isLocked && !isStatus) return;
      set((s) => ({
        recentMessages: [message, ...s.recentMessages].slice(0, 50),
      }));
    });

    set({ device });
    get().startPolling();
    // Startup probe: silent. Do not flash Connecting... while nothing is plugged in.
    await get().connect({ announce: false });
  },

  resumePendingFirmware: async () => {
    if (firmwareResumeInFlight) return firmwareResumeInFlight;

    firmwareResumeInFlight = (async () => {
      const { device, isBootloader } = get();
      const pending = getPendingFirmware();
      if (!device || !isBootloader || !pending?.length) return;

      // Snapshot and clear before send so a second BOOTLOADER status cannot
      // start another loadFirmwareBlocks on the same HID queue.
      clearPendingFirmware();
      try {
        get().setWorking(true, 'Loading firmware…');
        await device.loadFirmwareBlocks(pending);
      } catch (e: any) {
        set({ error: e.message });
      } finally {
        get().setWorking(false);
      }
    })();

    try {
      await firmwareResumeInFlight;
    } finally {
      firmwareResumeInFlight = null;
    }
  },

  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedSlot: (selectedSlotId) => set({ selectedSlotId }),
  setDuoProfile: (duoProfile) => set({ duoProfile }),
  setWorking: (isWorking, message, progress) =>
    set({
      isWorking,
      workingMessage: message ?? 'Please wait…',
      workingProgress: isWorking && typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : null,
    }),

  refreshLabels: async () => {
    const { device, isConnected, isLocked, isRefreshingLabels } = get();
    if (device && isConnected && !isLocked && !isRefreshingLabels) {
      try {
        set({ isRefreshingLabels: true });
        await device.getLabels();
      } catch {
        // Unplug / timeout — overlay already follows isConnected.
      } finally {
        set({ isRefreshingLabels: false });
      }
    }
  },

  startPolling: () => {
    if (pollInterval) return;
    set({ isPolling: true });

    // 2s probe interval matches Tailwind animate-pulse (2s). Must stay silent
    // (announce: false) or the hourglass / "Connecting..." UI flickers every beat.
    pollInterval = setInterval(async () => {
      const { isConnected, isPolling, connect } = get();
      if (!isConnected && isPolling && !connectInFlight) {
        await connect({ announce: false });
      }
    }, 2000);
  },

  stopPolling: () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    set({ isPolling: false });
  },

  connect: async (options = {}) => {
    const { device } = get();
    if (!device) return;
    if (connectInFlight) {
      if (!get().isConnected) pendingReconnect = true;
      return;
    }

    const announce = options.announce === true;
    const attempt = ++connectAttempt;
    connectInFlight = true;
    pendingReconnect = false;
    if (announce) set({ isConnecting: true });

    if (connectWatchdog) clearTimeout(connectWatchdog);
    connectWatchdog = setTimeout(() => {
      if (attempt !== connectAttempt || !connectInFlight) return;
      console.error('Connect watchdog: aborting hung HID connect');
      connectAttempt += 1;
      connectInFlight = false;
      pendingReconnect = false;
      if (connectWatchdog) {
        clearTimeout(connectWatchdog);
        connectWatchdog = null;
      }
      const hung = get().device;
      void (async () => {
        try {
          await hung?.disconnect();
        } catch {
          // Hung connect may already be torn down.
        }
        if (!get().isConnected) {
          void get().connect({ announce: false });
        }
      })();
    }, CONNECT_WATCHDOG_MS);

    try {
      await device.connect(SUPPORTED_DEVICES);
      if (attempt !== connectAttempt) return;
      set({ error: null, pinError: null });
      // Resume only after connect() finishes so OKSETTIME is not interleaved
      // with OKFWUPDATE on the same HID queue.
      if (get().isBootloader) {
        void get().resumePendingFirmware();
      }
    } catch (e: any) {
      if (attempt !== connectAttempt) return;
      const msg = e.message ?? '';
      if (
        msg === 'Device not found' ||
        /not connected/i.test(msg) ||
        /disconnected/i.test(msg) ||
        /timed out/i.test(msg)
      ) {
        // Silent probe failure — wipe device fields but do not bump sessionEpoch
        // on every 2s empty poll (would thrash React remounts while disconnected).
        const hadSession = get().isConnected;
        set({
          ...disconnectedDeviceSnapshot,
          isConnecting: false,
          sessionEpoch: hadSession ? get().sessionEpoch + 1 : get().sessionEpoch,
        });
        const permitted = await listPermittedDevicesFn();
        if (attempt !== connectAttempt) return;
        const onlyKeyDevs = permitted.filter((d) =>
          SUPPORTED_DEVICES.some((f) => f.vendorId === d.vendorId && f.productId === d.productId)
        );
        console.log('Permitted OnlyKey HID devices:', onlyKeyDevs.length, onlyKeyDevs);
        if (onlyKeyDevs.length === 0 && permitted.length > 0) {
          console.log('Other permitted HID devices:', permitted.map((d) => ({
            vid: d.vendorId, pid: d.productId, name: d.productName,
          })));
        }
      } else {
        console.error('Connect failed:', e.message);
        const showUdev = isLinux() && isConnectErrorLikelyUdev(e.message);
        set({ error: e.message, showUdevDialog: showUdev });
      }
    } finally {
      if (connectWatchdog) {
        clearTimeout(connectWatchdog);
        connectWatchdog = null;
      }
      if (attempt === connectAttempt) {
        connectInFlight = false;
        if (get().isConnecting) set({ isConnecting: false });
        if (pendingReconnect && !get().isConnected) {
          pendingReconnect = false;
          void get().connect({ announce: false });
        } else {
          pendingReconnect = false;
        }
      }
    }
  },

  disconnect: async () => {
    const { device } = get();
    if (device) await device.disconnect();
  },

  clearError: () => set({ error: null }),
  clearPinError: () => set({ pinError: null }),
  dismissUdevDialog: () => set({ showUdevDialog: false }),
}));

function userPreferencesAutoUpdateFW(): boolean {
  try {
    return localStorage.getItem('autoUpdateFW') !== 'false';
  } catch {
    return true;
  }
}