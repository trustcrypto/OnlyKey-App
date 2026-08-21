/// <reference types="chrome" />

import { TransportInterface, DeviceFilter } from './Transport.interface';

const BETA8_USAGE_PAGE = 0xFFAB; // 65451
const BETA8_SERIAL = '1000000000';
/** chrome.hid can report a false "disconnected" on receive/send right after open. */
export const HID_RECONNECT_GRACE_MS = 400;
/** chrome.hid.connect / getDevices can hang if the device is yanked mid-callback. */
export const HID_CONNECT_TIMEOUT_MS = 4000;
/** chrome.hid.send can hang with no callback after an unplug. */
export const HID_SEND_TIMEOUT_MS = 3000;

export class ChromeHidTransport implements TransportInterface {
  static isAvailable(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.hid?.getDevices;
  }
  private connectionId: number | null = null;
  private deviceId: number | null = null;
  private connectedDevice: DeviceFilter | null = null;
  private receiveCallback: ((data: Uint8Array) => void) | null = null;
  private disconnectCallback: (() => void) | null = null;
  private deviceAddedCallback: (() => void) | null = null;
  private isListening = false;
  /** Bumped on each listen/disconnect so stale chrome.hid.receive callbacks are ignored. */
  private listenEpoch = 0;
  private listeningSince = 0;
  /**
   * Settles the in-flight chrome.hid.connect promise. Must always run on unplug
   * so `connect()` cannot hang forever and pin the store mutex.
   */
  private pendingConnectFinish: ((err?: Error) => void) | null = null;

  private onDeviceRemovedListener = (deviceId: number) => {
    if (this.deviceId === deviceId) {
      console.log('ChromeHidTransport: Device removed:', deviceId);
      this.handleDisconnection();
    }
  };

  constructor() {
    if (typeof chrome === 'undefined' || !chrome.hid) return;

    if ((chrome.hid as any).onDeviceRemoved) {
      (chrome.hid as any).onDeviceRemoved.addListener(this.onDeviceRemovedListener);
    }

    if ((chrome.hid as any).onDeviceAdded) {
      (chrome.hid as any).onDeviceAdded.addListener((device: chrome.hid.Device) => {
        console.log('ChromeHidTransport: Device added:', device.vendorId, device.productId, device.productName);
        // Always notify. A stale connectionId after a missed onDeviceRemoved
        // must not swallow the next plug — the store reconnects if needed.
        this.deviceAddedCallback?.();
      });
    }
  }

  onDeviceAdded(callback: () => void): void {
    this.deviceAddedCallback = callback;
  }

  static async listPermittedDevices(): Promise<chrome.hid.Device[]> {
    if (!ChromeHidTransport.isAvailable()) return [];
    return new Promise((resolve) => {
      chrome.hid.getDevices({}, (devices) => resolve(devices || []));
    });
  }

  async connect(filter: DeviceFilter | DeviceFilter[]): Promise<void> {
    if (!ChromeHidTransport.isAvailable()) {
      throw new Error(
        'HID API unavailable. Use "npm start" (loads dist/) for real hardware — "npm run dev:server" is UI-only.'
      );
    }

    const filters = Array.isArray(filter) ? filter : [filter];
    console.log('Attempting to connect with filters:', filters);

    for (const deviceFilter of filters) {
      const device = await this.findDevice(deviceFilter);
      if (device) {
        await this.openConnection(device);
        return;
      }
    }

    throw new Error('Device not found');
  }

  private getDevices(filters?: DeviceFilter[]): Promise<chrome.hid.Device[]> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Device disconnected'));
      }, HID_CONNECT_TIMEOUT_MS);

      const finish = (err?: Error, devices?: chrome.hid.Device[]) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(devices || []);
      };

      const options = filters?.length ? { filters } : {};
      chrome.hid.getDevices(options, (devices) => {
        if (chrome.runtime.lastError) {
          return finish(new Error(chrome.runtime.lastError.message || 'Unknown getDevices error'));
        }
        finish(undefined, devices || []);
      });
    });
  }

  /**
   * Mirrors v5.5 device selection: Beta 8+ uses FFAB + serial 1000000000;
   * older Classic devices use any matching VID/PID with a different serial.
   */
  private selectDevice(devices: chrome.hid.Device[], filter: DeviceFilter): chrome.hid.Device | null {
    const matches = devices.filter(
      (d) => d.vendorId === filter.vendorId && d.productId === filter.productId
    );

    if (!matches.length) return null;

    for (const device of matches) {
      const serial = device.serialNumber ?? '';
      const usagePages = (device.collections ?? []).map((c) => c.usagePage);

      if (filter.productId === 0xB001) return device;

      if (usagePages.includes(BETA8_USAGE_PAGE) && serial === BETA8_SERIAL) {
        return device;
      }

      if (serial !== BETA8_SERIAL) {
        return device;
      }
    }

    console.warn('ChromeHidTransport: fallback HID interface for', filter);
    return matches[0];
  }

  private async findDevice(filter: DeviceFilter): Promise<chrome.hid.Device | null> {
    try {
      const filtered = await this.getDevices([filter]);
      console.log(`HID devices for ${filter.vendorId.toString(16)}/${filter.productId.toString(16)}:`, filtered);
      const selected = this.selectDevice(filtered, filter);
      if (selected) return selected;
    } catch (err) {
      console.warn('Filtered getDevices failed:', err);
    }

    try {
      const all = await this.getDevices();
      console.log('All HID devices (fallback):', all);
      return this.selectDevice(all, filter);
    } catch (err) {
      console.warn('Unfiltered getDevices failed:', err);
      return null;
    }
  }

  private openConnection(device: chrome.hid.Device): Promise<void> {
    return new Promise((resolve, reject) => {
      // Drop any previous HID connection/listen loop before opening another.
      // Must run before we install pendingConnectFinish so we reject the
      // previous attempt, not this one.
      this.abandonConnection();
      const attemptEpoch = this.listenEpoch;
      this.deviceId = device.deviceId;
      console.log('Connecting to device:', device.deviceId, 'Product:', device.productName);

      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.pendingConnectFinish === finish) this.pendingConnectFinish = null;
        if (err) reject(err);
        else resolve();
      };
      this.pendingConnectFinish = finish;

      const timer = setTimeout(() => {
        // Always settle — a listenEpoch bump from unplug used to return
        // here without finish(), leaving connect() hung forever.
        if (attemptEpoch === this.listenEpoch) {
          this.abandonConnection();
        }
        finish(new Error('Device disconnected'));
      }, HID_CONNECT_TIMEOUT_MS);

      chrome.hid.connect(device.deviceId, (connectInfo) => {
        if (attemptEpoch !== this.listenEpoch) {
          if (connectInfo?.connectionId != null) {
            chrome.hid.disconnect(connectInfo.connectionId, () => {});
          }
          return finish(new Error('Device disconnected'));
        }
        if (chrome.runtime.lastError) {
          const message = chrome.runtime.lastError.message || 'Unknown connect error';
          console.error('chrome.hid.connect error:', message);
          this.deviceId = null;
          return finish(new Error(message));
        }
        if (!connectInfo) {
          console.error('Connection failed: No connectInfo returned');
          this.deviceId = null;
          return finish(new Error('Connection failed'));
        }

        console.log('Connected successfully. ConnectionId:', connectInfo.connectionId);
        this.connectionId = connectInfo.connectionId;
        this.connectedDevice = { vendorId: device.vendorId, productId: device.productId };
        this.startListening();
        finish();
      });
    });
  }

  async disconnect(): Promise<void> {
    // Intentional close — do not fire onDisconnect (mirrors surprise-removal vs close).
    this.abandonConnection();
  }

  /** Close HID and stop listen without notifying the device layer. */
  private abandonConnection() {
    this.listenEpoch += 1;
    this.isListening = false;
    this.listeningSince = 0;
    const conn = this.connectionId;
    this.connectionId = null;
    this.deviceId = null;
    this.connectedDevice = null;
    const finishPending = this.pendingConnectFinish;
    this.pendingConnectFinish = null;
    if (conn !== null && typeof chrome !== 'undefined' && chrome.hid?.disconnect) {
      chrome.hid.disconnect(conn, () => {});
    }
    finishPending?.(new Error('Device disconnected'));
  }

  private handleDisconnection() {
    this.abandonConnection();
    if (this.disconnectCallback) {
      this.disconnectCallback();
    }
  }

  private inReconnectGrace(): boolean {
    return this.listeningSince > 0 && Date.now() - this.listeningSince < HID_RECONNECT_GRACE_MS;
  }

  private isGoneError(errMsg: string): boolean {
    return (
      errMsg.includes('disconnected') ||
      errMsg.includes('not found') ||
      errMsg.includes('invalid connection')
    );
  }

  async send(reportId: number, data: Uint8Array): Promise<void> {
    if (this.connectionId === null) {
      throw new Error('Not connected');
    }

    const connectionId = this.connectionId;
    const epoch = this.listenEpoch;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };
      const timer = setTimeout(() => finish(new Error('Device disconnected')), HID_SEND_TIMEOUT_MS);
      const payload = Uint8Array.from(data).buffer;
      chrome.hid.send(connectionId, reportId, payload, () => {
        if (epoch !== this.listenEpoch || this.connectionId !== connectionId) {
          return finish(new Error('Device disconnected'));
        }
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || '';
          if (this.isGoneError(errMsg) && !this.inReconnectGrace() && this.connectionId === connectionId) {
            this.handleDisconnection();
          }
          return finish(new Error(errMsg || 'Unknown send error'));
        }
        finish();
      });
    });
  }

  onReceive(callback: (data: Uint8Array) => void): void {
    this.receiveCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  getConnectedDevice(): DeviceFilter | null {
    return this.connectedDevice;
  }

  private startListening() {
    if (this.connectionId === null) return;
    const epoch = ++this.listenEpoch;
    const connectionId = this.connectionId;
    this.isListening = true;
    this.listeningSince = Date.now();

    const poll = () => {
      if (epoch !== this.listenEpoch || this.connectionId !== connectionId) return;

      chrome.hid.receive(connectionId, (_reportId, data) => {
        if (epoch !== this.listenEpoch) return;
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || '';
          console.warn('Receive error:', errMsg);
          if (this.isGoneError(errMsg)) {
            if (this.inReconnectGrace()) {
              setTimeout(poll, 100);
              return;
            }
            if (this.connectionId === connectionId) this.handleDisconnection();
            return;
          }
          setTimeout(poll, 100);
          return;
        }

        if (data && this.receiveCallback) {
          this.receiveCallback(new Uint8Array(data));
        }

        poll();
      });
    };

    poll();
  }
}