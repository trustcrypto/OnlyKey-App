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
import { disconnectedDeviceSnapshot } from './deviceStateReset';

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
  fwUpdateSupport: boolean;
  firmwareCheck: FirmwareCheckResult | null;
  labels: Record<number, string>;
  error: string | null;
  pinError: string | null;
  recentMessages: string[];
  showUdevDialog: boolean;
  activeTab: 'setup' | 'slots' | 'keys' | 'backup' | 'firmware' | 'preferences' | 'advanced' | 'tools';
  selectedSlotId: number | null;
}

export interface DeviceStore extends DeviceState {
  device: DeviceClient | null;
  initialize: (useMock?: boolean) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  setActiveTab: (tab: DeviceState['activeTab']) => void;
  setSelectedSlot: (slotId: number | null) => void;
  setDuoProfile: (profile: DuoProfileId) => void;
  setWorking: (active: boolean, message?: string) => void;
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

  initialize: async (useMock = false) => {
    if (get().device) return;

    const transport = useMock ? new MockTransport() : new ChromeHidTransport();
    if (transport instanceof ChromeHidTransport) {
      transport.onDeviceAdded(() => {
        if (!get().isConnected && !get().isConnecting) void get().connect();
      });
    }
    const device = new OnlyKeyDevice(transport);

    device.on('statusChange', async (state) => {
      if (!state.isConnected) {
        set({ ...disconnectedDeviceSnapshot, isConnecting: get().isConnecting });
        return;
      }

      const wasLocked = get().isLocked;
      const isNowLocked = state.isLocked;
      const fwSupport = supportsAppFirmwareUpdate(state.version);

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
        labels: Object.fromEntries(state.labels),
        error: null,
        pinError: null,
      });

      if (state.isBootloader && state.isConnected) {
        const pending = getPendingFirmware();
        if (pending?.length) {
          get().resumePendingFirmware();
        }
      }

      // Identify device type via labels before the firmware prompt can block the event loop.
      const shouldRefreshLabels =
        state.isConnected &&
        !isNowLocked &&
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
      if (!get().isConnected || get().isRefreshingLabels) return;
      set((s) => ({ labels: { ...s.labels, [slotId]: label } }));
    });

    device.on('labelsRefreshed', (labels) => {
      if (!get().isConnected) return;
      set({ labels: Object.fromEntries(labels) });
    });

    device.on('messageReceived', (message) => {
      if (!get().isConnected) return;
      set((s) => ({
        recentMessages: [message, ...s.recentMessages].slice(0, 5),
      }));
    });

    set({ device });
    get().startPolling();
    void get().connect();
  },

  resumePendingFirmware: async () => {
    const { device, isBootloader } = get();
    const pending = getPendingFirmware();
    if (!device || !isBootloader || !pending?.length) return;

    try {
      get().setWorking(true, 'Loading firmware…');
      await device.loadFirmwareBlocks(pending);
      clearPendingFirmware();
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      get().setWorking(false);
    }
  },

  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedSlot: (selectedSlotId) => set({ selectedSlotId }),
  setDuoProfile: (duoProfile) => set({ duoProfile }),
  setWorking: (isWorking, message) => set({
    isWorking,
    workingMessage: message ?? (isWorking ? 'Please wait…' : 'Please wait…'),
  }),

  refreshLabels: async () => {
    const { device, isConnected, isLocked, isRefreshingLabels } = get();
    if (device && isConnected && !isLocked && !isRefreshingLabels) {
      try {
        set({ isRefreshingLabels: true });
        await device.getLabels();
      } finally {
        set({ isRefreshingLabels: false });
      }
    }
  },

  startPolling: () => {
    if (pollInterval) return;
    set({ isPolling: true });

    pollInterval = setInterval(async () => {
      const { isConnected, isPolling, connect } = get();
      if (!isConnected && isPolling) await connect();
    }, 2000);
  },

  stopPolling: () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    set({ isPolling: false });
  },

  connect: async () => {
    const { device } = get();
    if (!device) return;

    set({ isConnecting: true });
    try {
      await device.connect(SUPPORTED_DEVICES);
      set({ error: null, pinError: null });
    } catch (e: any) {
      if (e.message === 'Device not found') {
        set({ ...disconnectedDeviceSnapshot, isConnecting: false });
        const permitted = await ChromeHidTransport.listPermittedDevices();
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
      if (get().isConnecting) set({ isConnecting: false });
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