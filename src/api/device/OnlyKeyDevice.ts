import type { DeviceClient } from './DeviceClient';
import { TypedEmitter } from '@/utils/typedEmitter';
import { TransportInterface } from '../transport/Transport.interface';
import { MessageID, FieldID, MESSAGE_HEADER, PACKET_SIZE, DeviceType, GLOBAL_SLOT } from './types';
import { deviceTypeFromProductId, isDuoNoPinVersion } from './firmwareConstants';
import {
  classicConfirmedByLabels,
  hardwareTypeFromSuffix,
  inferDeviceTypeFromLabelSlotIds,
  maxLabelSlotId,
} from './deviceTypeFromStatus';
import { ResponseParser, DeviceResponse } from './ResponseParser';
import { hexToModhex, hexStringToByteArray } from './utils';

export declare interface OnlyKeyDevice {
  on(event: 'statusChange', listener: (state: OnlyKeyDevice['state']) => void): this;
  on(event: 'error', listener: (error: string) => void): this;
  on(event: 'labelUpdate', listener: (slotId: number, label: string) => void): this;
  on(event: 'labelsRefreshed', listener: (labels: Map<number, string>) => void): this;
  on(event: 'messageReceived', listener: (message: string) => void): this;
}

const DUO_SETUP_PIN = /^[1-6]{7,10}$/;
const DUO_PIN_SLOT_BYTES = 16;
/** Connect-time OKSETTIME must fail fast — 10s×2 plus retry pinned Searching. */
const CONNECT_SETTIME_TIMEOUT_MS = 2500;
/** Lock-screen probes should not sit on INITIALIZED for the full 5s default. */
const LOCK_STATUS_TIMEOUT_MS = 2500;
export const PIN_ENTRY_CANCELLED = 'PIN entry cancelled';
/** 5.6 last-message text after flushing a cancelled PIN keypad session. */
export const PIN_ENTRY_CANCELED_MESSAGE = 'Canceled';
const PIN_FLUSH_NOISE =
  /error pin is not between|error pins don.?t match|enter your|re-enter your|successful pin|successfully set pin/i;

/** Four big-endian unix-seconds bytes for OKSETTIME (firmware set_time reads buffer[5..8]). */
export function encodeUnixTimeBytes(epochSec = Math.round(Date.now() / 1000)): Uint8Array {
  const hex = (epochSec >>> 0).toString(16).padStart(8, '0').slice(-8);
  const parts = hex.match(/.{2}/g);
  if (!parts || parts.length !== 4) throw new Error('Failed to generate time parts');
  return new Uint8Array(parts.map((p) => parseInt(p, 16)));
}

function padDuoPinSlot(pin: string): number[] {
  const slot = new Array(DUO_PIN_SLOT_BYTES).fill(0);
  for (let i = 0; i < pin.length && i < DUO_PIN_SLOT_BYTES; i++) {
    slot[i] = 48 + Number(pin[i]);
  }
  return slot;
}

export function assertDuoSetupPins(primary: string, sd = ''): void {
  if (!DUO_SETUP_PIN.test(primary)) {
    throw new Error('Device PIN must be 7–10 digits using only 1–6.');
  }
  if (!sd) return;
  if (!DUO_SETUP_PIN.test(sd)) {
    throw new Error('Self-destruct PIN must be 7–10 digits using only 1–6.');
  }
  if (sd === primary) {
    throw new Error('Self-destruct PIN must be different from the device PIN.');
  }
}

export class OnlyKeyDevice extends TypedEmitter implements DeviceClient {
  private transport: TransportInterface;
  private pendingSeq = 0;
  private pendingRequest: {
    id: number;
    resolve: (res: DeviceResponse) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
    matchPredicate?: (res: DeviceResponse) => boolean;
  } | null = null;

  private requestQueue: (() => Promise<void>)[] = [];
  private isProcessingQueue = false;
  private queueEpoch = 0;
  private fetchingLabels = false;
  private lastLabelReceivedAt = 0;
  private lastUnlockedAt = 0;
  private statusProbe: Promise<void> | null = null;
  /** Hide firmware PIN FSM chatter while cancelClassicPinEntry is flushing. */
  private suppressPinMessages = false;
  /** Bumped on each connect() and on unplug so in-flight connect/setTime cannot resume. */
  private connectSeq = 0;

  public state = {
    isConnected: false,
    isLocked: true,
    isConfigMode: false,
    isBootloader: false,
    deviceType: DeviceType.UNKNOWN,
    deviceTypeSource: '',
    usbProductId: null as number | null,
    maxLabelSlot: 0,
    lastStatusText: '',
    version: '',
    devicePinSet: true,
    labels: new Map<number, string>()
  };

  constructor(transport: TransportInterface) {
    super();
    this.transport = transport;
    this.transport.onReceive(this.handleReceive.bind(this));
    this.transport.onDisconnect(() => {
      this.resetDeviceState();
      this.emit('statusChange', { ...this.state });
    });
  }

  private abortPendingRequest(reason = 'Device disconnected'): void {
    if (!this.pendingRequest) return;
    clearTimeout(this.pendingRequest.timer);
    const { reject } = this.pendingRequest;
    this.pendingRequest = null;
    reject(new Error(reason));
  }

  private isCurrentConnect(seq: number): boolean {
    return seq === this.connectSeq && this.state.isConnected;
  }

  private resetDeviceState(): void {
    this.connectSeq += 1;
    this.queueEpoch += 1;
    this.abortPendingRequest('Device disconnected');
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.fetchingLabels = false;
    this.lastLabelReceivedAt = 0;
    this.lastUnlockedAt = 0;
    this.statusProbe = null;
    this.state = {
      isConnected: false,
      isLocked: true,
      isConfigMode: false,
      isBootloader: false,
      deviceType: DeviceType.UNKNOWN,
      deviceTypeSource: '',
      usbProductId: null,
      maxLabelSlot: 0,
      lastStatusText: '',
      version: '',
      devicePinSet: true,
      labels: new Map(),
    };
  }

  private deriveDevicePinSet(): boolean {
    if (this.state.deviceType !== DeviceType.DUO) return true;
    return !isDuoNoPinVersion(this.state.version);
  }

  /**
   * Identify from UNKNOWN. Status/USB may switch Classic ↔ DUO (hot-plug).
   * Labels must not: empty DUO profiles look like 12 Classic slots, and Classic
   * HID `1a`–`1e` decode as slots 20–24.
   */
  private applyDeviceTypeFromResponse(
    nextType: DeviceType | undefined,
    source = 'status',
  ): boolean {
    if (!nextType || nextType === DeviceType.UNKNOWN) return false;
    const current = this.state.deviceType;
    if (current === nextType) return false;

    const fromUsb = source.startsWith('usb:');
    const fromStatus = source === 'status';
    const suffixType = hardwareTypeFromSuffix(this.state.lastStatusText);
    const canSet =
      current === DeviceType.UNKNOWN ||
      nextType === DeviceType.UNINITIALIZED ||
      nextType === DeviceType.BOOTLOADER ||
      (current === DeviceType.UNINITIALIZED &&
        (nextType === DeviceType.CLASSIC || nextType === DeviceType.DUO)) ||
      (current === DeviceType.CLASSIC &&
        nextType === DeviceType.DUO &&
        (fromStatus || fromUsb)) ||
      (current === DeviceType.DUO &&
        nextType === DeviceType.CLASSIC &&
        (fromUsb || (fromStatus && suffixType === DeviceType.CLASSIC)));

    if (!canSet) return false;

    this.state.deviceType = nextType;
    this.state.deviceTypeSource = source;
    console.log('OnlyKey device type set:', nextType, 'via', source);
    return true;
  }

  /** Idle 12-slot stream identifies Classic only when type is still unknown. */
  private setClassicFromLabels(source: string): boolean {
    if (this.state.deviceType !== DeviceType.UNKNOWN) return false;

    this.state.deviceType = DeviceType.CLASSIC;
    this.state.deviceTypeSource = source;
    console.log('OnlyKey device type set: classic via', source);
    return true;
  }

  private inferDeviceTypeFromLabels(endedByIdle: boolean): boolean {
    const slotIds = [...this.state.labels.keys()];
    this.state.maxLabelSlot = maxLabelSlotId(slotIds);

    const duoFromSlots = inferDeviceTypeFromLabelSlotIds(slotIds);
    if (duoFromSlots === DeviceType.DUO) {
      return this.applyDeviceTypeFromResponse(DeviceType.DUO, 'labels:slot>12');
    }

    if (classicConfirmedByLabels(slotIds, this.state.labels.size, endedByIdle)) {
      return this.setClassicFromLabels('labels:classic-stream');
    }

    return false;
  }

  private seedDeviceTypeFromTransport(): void {
    const info = this.transport.getConnectedDevice?.();
    if (!info) return;
    this.state.usbProductId = info.productId;
    const fromPid = deviceTypeFromProductId(info.productId);
    if (fromPid) this.applyDeviceTypeFromResponse(fromPid, `usb:0x${info.productId.toString(16)}`);
    if (fromPid === DeviceType.BOOTLOADER) {
      this.state.isBootloader = true;
      this.state.isLocked = false;
    }
  }

  private static formatDeviceLockedError(message: string): string {
    if (/not in config mode/i.test(message)) {
      return (
        'OnlyKey must be in config mode (flashing red LED) for this operation. ' +
        'If this was a standard preference (type speed, layout, LED, lockout, lock button), ' +
        'disable Sysadmin Mode first — when Sysadmin Mode is on, firmware requires config mode for all OKSETSLOT writes.'
      );
    }
    if (/device locked/i.test(message)) {
      return 'OnlyKey is locked. Unlock your device and try again.';
    }
    return message;
  }

  private encodeSlotByte(slotId: number | string): number {
    if (slotId === 'XX') return GLOBAL_SLOT;
    return typeof slotId === 'string' ? parseInt(slotId, 16) : slotId;
  }

  private async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;
    this.isProcessingQueue = true;
    const epoch = this.queueEpoch;
    while (this.requestQueue.length > 0 && epoch === this.queueEpoch) {
      const task = this.requestQueue.shift();
      if (task) {
        try {
          await task();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg !== PIN_ENTRY_CANCELLED) {
            console.error('Queue task failed:', e);
          }
        }
      }
    }
    if (epoch === this.queueEpoch) this.isProcessingQueue = false;
  }

  private recordReceivedMessage(response: DeviceResponse): void {
    const msg = (response.error || response.text || '').trim();
    if (msg.length > 1 && msg !== 'OK') {
      if (this.suppressPinMessages && PIN_FLUSH_NOISE.test(msg)) return;
      this.emit('messageReceived', msg);
    }
  }

  private handleReceive(data: Uint8Array) {
    const response = ResponseParser.parse(data);
    this.recordReceivedMessage(response);

    let stateChanged = false;

    // Update internal state
    if (response.type === 'status') {
      const wasLocked = this.state.isLocked;
      const text = response.text ?? '';

      // Explicit unlock/lock from firmware status strings. Do not rely solely on
      // response.isLocked — defensive for any parser edge cases.
      if (text.includes('UNLOCKED')) {
        this.lastUnlockedAt = Date.now();
        const justUnlocked = this.state.isLocked;
        if (this.state.isLocked) {
          this.state.isLocked = false;
          stateChanged = true;
        }
        // Firmware ignores OKSETTIME while locked (no recvmsg). 5.6 called
        // setTime after UNLOCKED so TOTP has a clock. refreshStatus is only a
        // lock probe — it must not stand in for this post-unlock setTime.
        if (justUnlocked && !this.state.isBootloader) {
          void this.setTime().catch(() => {
            /* unplug during setTime */
          });
        }
        // 5.6 keeps isConfigMode through UNLOCKED — firmware set_time still
        // prints UNLOCKED while configmode is true (red LED).
      }

      if (text.includes('INITIALIZED-D')) {
        // DUO locked status. Keep locked; only enter config-mode flag when we
        // transition from unlocked (or already in config).
        if (!this.state.isLocked) {
          this.state.isLocked = true;
          stateChanged = true;
        }
        if (!wasLocked || this.state.isConfigMode) {
          if (!this.state.isConfigMode) {
            this.state.isConfigMode = true;
            stateChanged = true;
          }
        }
      } else if (
        text.includes('INITIALIZED') &&
        !text.includes('UNINITIALIZED') &&
        !text.includes('UNLOCKED')
      ) {
        // Classic locked (or unlocked→config). Never match inside UNLOCKED*.
        // Ignore INITIALIZED that arrives just after keypad unlock — leftover
        // OKSETTIME replies from probes sent while the device was still locked.
        const staleLockEcho = Date.now() - this.lastUnlockedAt < 2500;
        if (!staleLockEcho) {
          if (!this.state.isLocked) {
            this.state.isLocked = true;
            stateChanged = true;
          }
          if (!wasLocked && this.state.deviceType === DeviceType.CLASSIC) {
            this.state.isConfigMode = true;
            stateChanged = true;
          }
        }
      }

      if (response.isLocked !== undefined && this.state.isLocked !== response.isLocked) {
        const staleLockEcho =
          response.isLocked === true && Date.now() - this.lastUnlockedAt < 2500;
        if (!staleLockEcho) {
          this.state.isLocked = response.isLocked;
          stateChanged = true;
        }
      }
      this.state.lastStatusText = text;
      if (this.applyDeviceTypeFromResponse(response.deviceType, 'status')) {
        stateChanged = true;
      }
      if (response.version && this.state.version !== response.version) {
        this.state.version = response.version;
        stateChanged = true;
      }
      const pinSet =
        response.devicePinSet !== undefined ? response.devicePinSet : this.deriveDevicePinSet();
      if (this.state.devicePinSet !== pinSet) {
        this.state.devicePinSet = pinSet;
        stateChanged = true;
      }
      if (text.includes('BOOTLOADER') || response.deviceType === DeviceType.BOOTLOADER) {
        if (!this.state.isBootloader) {
          this.state.isBootloader = true;
          stateChanged = true;
        }
        if (this.state.isLocked) {
          this.state.isLocked = false;
          stateChanged = true;
        }
      }
    }

    // Capture pending request resolution
    let resolveFn = null;
    let rejectFn = null;
    if (this.pendingRequest) {
      if (response.type === 'error') {
        clearTimeout(this.pendingRequest.timer);
        rejectFn = this.pendingRequest.reject;
        this.pendingRequest = null;
      } else if (!this.pendingRequest.matchPredicate || this.pendingRequest.matchPredicate(response)) {
        clearTimeout(this.pendingRequest.timer);
        resolveFn = this.pendingRequest.resolve;
        this.pendingRequest = null;
      }
    }

    // Emit events AFTER clearing pendingRequest to avoid "Device busy" in listeners
    if (response.type === 'label' && response.slotId !== undefined && response.label !== undefined) {
      this.state.labels.set(response.slotId, response.label);
      this.lastLabelReceivedAt = Date.now();
      if (!this.fetchingLabels) {
        this.emit('labelUpdate', response.slotId, response.label);
      }
    }

    if (stateChanged) {
      this.emit('statusChange', { ...this.state });
    }

    if (response.type === 'error') {
      const errText = response.error || 'Unknown device error';
      if (!(this.suppressPinMessages && PIN_FLUSH_NOISE.test(errText))) {
        this.emit('error', errText);
      }
    }

    // Finally resolve or reject the promise
    if (rejectFn) {
      rejectFn(new Error(OnlyKeyDevice.formatDeviceLockedError(response.error || 'Unknown device error')));
    } else if (resolveFn) {
      resolveFn(response);
    }
  }

  private async sendRequest(
    msgId: MessageID, 
    slotId?: number | string, 
    fieldId?: number | string | FieldID, 
    data?: Uint8Array | string | number[],
    timeoutMs = 10000,
    matchPredicate?: (res: DeviceResponse) => boolean
  ): Promise<DeviceResponse> {
    
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        if (!this.state.isConnected) {
          reject(new Error('Device disconnected'));
          return;
        }
        const packet = this.buildMessage(msgId, slotId, fieldId, data);
        
        try {
          await new Promise<DeviceResponse>((res, rej) => {
            const id = ++this.pendingSeq;
            const timer = setTimeout(() => {
              if (this.pendingRequest?.id === id) {
                this.pendingRequest = null;
                rej(new Error(`Request ${MessageID[msgId]} timed out after ${timeoutMs}ms`));
              }
            }, timeoutMs);

            this.pendingRequest = { id, resolve: res, reject: rej, timer, matchPredicate };
            
            this.transport.send(0, packet).catch(err => {
              if (this.pendingRequest?.id !== id) return;
              clearTimeout(timer);
              this.pendingRequest = null;
              rej(err);
            });
          }).then(resolve).catch(reject);
        } catch (e) {
          reject(e);
        }
      });
      this.processQueue();
    });
  }

  private buildMessage(msgId: MessageID, slotId?: number | string, fieldId?: number | string | FieldID, data?: Uint8Array | string | number[]): Uint8Array {
    const packet = new Uint8Array(PACKET_SIZE);
    let cursor = 0;

    MESSAGE_HEADER.forEach(byte => packet[cursor++] = byte);
    packet[cursor++] = msgId;

    if (slotId !== undefined) {
      packet[cursor++] = this.encodeSlotByte(slotId);
    }

    if (fieldId !== undefined) {
      if (typeof fieldId === 'string') {
        packet[cursor++] = (FieldID as any)[fieldId] || parseInt(fieldId, 16);
      } else {
        packet[cursor++] = fieldId;
      }
    }

    if (data) {
      if (typeof data === 'string') {
        for (let i = 0; i < data.length && cursor < PACKET_SIZE; i++) {
          packet[cursor++] = data.charCodeAt(i);
        }
      } else {
        data.forEach(byte => {
          if (cursor < PACKET_SIZE) packet[cursor++] = byte;
        });
      }
    }

    return packet;
  }

  /**
   * Send a command and wait briefly only for an error reply.
   * Used when firmware completes silently (e.g. legacy Yubikey wipe only blinks the LED).
   */
  private async sendCommandWithoutConfirmation(
    msgId: MessageID,
    slotId?: number | string,
    fieldId?: number | string | FieldID,
    data?: Uint8Array | string | number[],
    errorWindowMs = 600,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          await new Promise<void>((res, rej) => {
            const id = ++this.pendingSeq;
            const timer = setTimeout(() => {
              if (this.pendingRequest?.id === id) {
                this.pendingRequest = null;
                res();
              }
            }, errorWindowMs);

            this.pendingRequest = {
              id,
              resolve: () => {
                if (this.pendingRequest?.id !== id) return;
                clearTimeout(timer);
                this.pendingRequest = null;
                res();
              },
              reject: rej,
              timer,
              matchPredicate: (r) => r.type === 'error',
            };

            const packet = this.buildMessage(msgId, slotId, fieldId, data);
            this.transport.send(0, packet).catch((err) => {
              if (this.pendingRequest?.id !== id) return;
              clearTimeout(timer);
              this.pendingRequest = null;
              rej(err);
            });
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      this.processQueue();
    });
  }

  /**
   * Register a listener, send, then wait for a firmware confirmation string.
   * The listener must be active before the HID packet is sent so fast replies are not dropped.
   */
  private async sendCommandAndWaitFor(
    msgId: MessageID,
    successText: string,
    slotId?: number | string,
    fieldId?: number | string | FieldID,
    data?: Uint8Array | string | number[],
    timeoutMs = 10000,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          await new Promise<DeviceResponse>((res, rej) => {
            const id = ++this.pendingSeq;
            const timer = setTimeout(() => {
              if (this.pendingRequest?.id === id) {
                this.pendingRequest = null;
                rej(new Error(`Timed out waiting for message containing "${successText}"`));
              }
            }, timeoutMs);

            this.pendingRequest = {
              id,
              resolve: res,
              reject: rej,
              timer,
              matchPredicate: (r) =>
                r.text?.toLowerCase().includes(successText.toLowerCase()) ?? false,
            };

            const packet = this.buildMessage(msgId, slotId, fieldId, data);
            this.transport.send(0, packet).catch((err) => {
              if (this.pendingRequest?.id !== id) return;
              clearTimeout(timer);
              this.pendingRequest = null;
              rej(err);
            });
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      this.processQueue();
    });
  }

  private async waitForMessage(str: string, timeoutMs = 20000): Promise<DeviceResponse> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          await new Promise<DeviceResponse>((res, rej) => {
            const id = ++this.pendingSeq;
            const timer = setTimeout(() => {
              if (this.pendingRequest?.id === id) {
                this.pendingRequest = null;
                rej(new Error(`Timed out waiting for message containing "${str}"`));
              }
            }, timeoutMs);

            this.pendingRequest = {
              id,
              resolve: res,
              reject: rej,
              timer,
              matchPredicate: (r) => (r.text?.toLowerCase().includes(str.toLowerCase()) || r.error?.toLowerCase().includes(str.toLowerCase())) ?? false
            };
          }).then(resolve).catch(reject);
        } catch (e) {
          reject(e);
        }
      });
      this.processQueue();
    });
  }

  // --- PUBLIC API ---

  public async connect(filters: any): Promise<void> {
    const seq = ++this.connectSeq;
    this.queueEpoch += 1;
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.abortPendingRequest('Device disconnected');

    // Each HID connection is a possibly different OnlyKey. Drop the previous
    // type so a DUO unplug + Classic plug cannot keep DUO after unlock.
    this.state.deviceType = DeviceType.UNKNOWN;
    this.state.deviceTypeSource = '';
    this.state.version = '';
    this.state.maxLabelSlot = 0;
    this.state.labels = new Map();
    this.state.lastStatusText = '';
    this.state.isLocked = true;
    this.state.isConfigMode = false;
    this.state.isBootloader = false;

    try {
      await this.transport.connect(filters);
    } catch (e) {
      if (seq !== this.connectSeq) throw new Error('Device disconnected');
      throw e;
    }
    if (seq !== this.connectSeq) {
      throw new Error('Device disconnected');
    }

    this.state.isConnected = true;
    this.seedDeviceTypeFromTransport();
    // Emit now only if firmware already replied during transport.connect so the
    // store is not left on Searching. Do not invent a locked snapshot when no
    // status has arrived — rapid replug delivers UNLOCKED a beat later.
    if (this.state.lastStatusText || this.state.isBootloader) {
      this.emit('statusChange', { ...this.state });
    }
    // Bootloader has no clock and OKSETTIME waiters steal OKFWUPDATE replies.
    if (!this.state.isBootloader) {
      await this.setTime(CONNECT_SETTIME_TIMEOUT_MS);
    }
    if (!this.isCurrentConnect(seq)) {
      throw new Error('Device disconnected');
    }
    this.emit('statusChange', { ...this.state });
  }

  public async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this.resetDeviceState();
    this.emit('statusChange', { ...this.state });
  }

  public async setTime(timeoutMs = 10000): Promise<void> {
     const bytes = encodeUnixTimeBytes();
     // Send twice — firmware historically needs two OKSETTIME packets.
     await this.sendRequest(MessageID.OKSETTIME, undefined, undefined, bytes, timeoutMs, OnlyKeyDevice.isFirmwareStatus);
     await new Promise(r => setTimeout(r, 100));
     if (!this.state.isConnected) throw new Error('Device disconnected');
     await this.sendRequest(MessageID.OKSETTIME, undefined, undefined, bytes, timeoutMs, OnlyKeyDevice.isFirmwareStatus);
  }

  /**
   * One OKSETTIME probe. Firmware replies INITIALIZED* when locked and UNLOCKED*
   * when unlocked. Used to detect keypad unlock — classic OnlyKey does not need
   * (and ignores) OKSETPIN once initialized; unlock is entirely on-device.
   */
  public async refreshStatus(): Promise<void> {
    if (this.statusProbe) return this.statusProbe;
    this.statusProbe = this.sendStatusProbe().finally(() => {
      this.statusProbe = null;
    });
    return this.statusProbe;
  }

  private async sendStatusProbe(): Promise<void> {
    const bytes = encodeUnixTimeBytes();
    // While locked, firmware may print INITIALIZED unsolicited (and set_time is
    // silent until the PIN is entered). Completing the waiter on INITIALIZED
    // makes the lock screen think the probe finished while the key is still
    // locked — including after a config-mode PIN, which never prints UNLOCKED.
    const match = this.state.isLocked
      ? OnlyKeyDevice.isUnlockStatus
      : OnlyKeyDevice.isFirmwareStatus;
    const timeoutMs = this.state.isLocked ? LOCK_STATUS_TIMEOUT_MS : 5000;
    await this.sendRequest(MessageID.OKSETTIME, undefined, undefined, bytes, timeoutMs, match);
  }

  private static isFirmwareStatus(res: DeviceResponse): boolean {
    const text = res.text ?? '';
    return (
      res.type === 'status' ||
      text.includes('UNLOCKED') ||
      text.includes('INITIALIZED') ||
      text.includes('BOOTLOADER')
    );
  }

  /** Lock-poll: ignore INITIALIZED* so leftover locked reports cannot complete the waiter. */
  private static isUnlockStatus(res: DeviceResponse): boolean {
    const text = res.text ?? '';
    return (
      text.includes('UNLOCKED') ||
      text.includes('UNINITIALIZED') ||
      text.includes('BOOTLOADER')
    );
  }

  public async getLabels(): Promise<Map<number, string>> {
    this.fetchingLabels = true;
    this.lastLabelReceivedAt = Date.now();
    this.state.labels.clear();

    try {
      await this.sendRequest(MessageID.OKGETLABELS, undefined, undefined, undefined, 5000);

      // Firmware streams one label per HID packet; finish after idle gap (v5 listens until stream ends).
      const maxWaitMs = 5000;
      const idleMs = 400;
      const started = Date.now();
      let endedByIdle = false;
      while (this.state.isConnected && Date.now() - started < maxWaitMs) {
        await new Promise((r) => setTimeout(r, 50));
        if (!this.state.isConnected) break;
        if (this.state.labels.size > 0 && Date.now() - this.lastLabelReceivedAt >= idleMs) {
          endedByIdle = true;
          break;
        }
      }

      if (this.state.isConnected && this.inferDeviceTypeFromLabels(endedByIdle)) {
        this.emit('statusChange', { ...this.state });
      }
      if (this.state.isConnected) {
        this.emit('labelsRefreshed', new Map(this.state.labels));
      }
      return this.state.labels;
    } finally {
      this.fetchingLabels = false;
    }
  }

  public async setSlot(slotId: number, fieldId: FieldID, value: string | number[]): Promise<void> {
     const res = await this.sendRequest(MessageID.OKSETSLOT, slotId, fieldId, value);
     if (res.type === 'error') throw new Error(res.error);
  }

  public async wipeSlot(slotId: number, fieldId?: FieldID): Promise<void> {
    const res = await this.sendRequest(MessageID.OKWIPESLOT, slotId, fieldId);
    if (res.type === 'error') throw new Error(res.error);
  }

  public async setPin(pin?: string): Promise<void> {
    const data = pin
      ? new Uint8Array(pin.split('').map(c => 48 + parseInt(c, 10)))
      : undefined;
    const res = await this.sendRequest(MessageID.OKSETPIN, undefined, undefined, data);
    if (res.type === 'error') throw new Error(res.error);
  }

  /**
   * Classic PIN setup: empty OKSETPIN/PIN2/SDPIN. `prompt` matches "enter your PIN";
   * `commit` matches "Successful PIN entry". Firmware is a four-message state machine.
   */
  public async beginClassicPinEntry(
    which: 'pin' | 'pin2' | 'sdpin' = 'pin',
    phase: 'prompt' | 'commit' = 'prompt',
  ): Promise<void> {
    const msgId = OnlyKeyDevice.classicPinMessageId(which);
    const res = await this.sendRequest(
      msgId,
      undefined,
      undefined,
      undefined,
      300000,
      (r) => {
        const text = (r.text ?? '').toLowerCase();
        if (r.type === 'error') return true;
        if (phase === 'prompt') {
          // Firmware: "enter your PIN" / "enter your self-destruct PIN" / "re-enter your PIN".
          return (text.includes('enter your') && text.includes('pin')) || text.includes('re-enter');
        }
        return text.includes('successful pin') || text.includes('successfully set pin');
      }
    );
    if (res.type === 'error') throw new Error(res.error);
  }

  /**
   * Abort an in-flight PIN waiter and send one empty OKSETPIN* so firmware
   * resets `pin_set` (5.6 `flushMessage`). Without this, Cancel leaves the
   * keypad FSM waiting and the next Change PIN can hang on "Please wait…".
   */
  public async cancelClassicPinEntry(
    which: 'pin' | 'pin2' | 'sdpin' = 'pin',
  ): Promise<void> {
    this.abortPendingRequest(PIN_ENTRY_CANCELLED);
    const msgId = OnlyKeyDevice.classicPinMessageId(which);
    this.suppressPinMessages = true;
    try {
      await this.sendRequest(
        msgId,
        undefined,
        undefined,
        undefined,
        1500,
        (r) => r.type === 'error' || !!(r.text && r.text.length > 1),
      );
    } catch {
      // Timeout or cancel is the flush succeeding — firmware may stay silent.
    } finally {
      this.suppressPinMessages = false;
    }
    if (this.state.isConnected) {
      this.emit('messageReceived', PIN_ENTRY_CANCELED_MESSAGE);
    }
  }

  private static classicPinMessageId(which: 'pin' | 'pin2' | 'sdpin'): MessageID {
    return which === 'pin2'
      ? MessageID.OKSETPIN2
      : which === 'sdpin'
        ? MessageID.OKSETSDPIN
        : MessageID.OKSETPIN;
  }

  public async setPin2(): Promise<void> {
    const res = await this.sendRequest(MessageID.OKSETPIN2);
    if (res.type === 'error') throw new Error(res.error);
  }

  public async setSDPin(): Promise<void> {
    const res = await this.sendRequest(MessageID.OKSETSDPIN);
    if (res.type === 'error') throw new Error(res.error);
  }

  public async sendPinDUO(pins: string[], setPin: boolean = true): Promise<void> {
    let pinBytes: number[];
    if (setPin) {
      const primary = pins[0] ?? '';
      const pin2 = pins.length >= 3 ? (pins[1] ?? '') : '';
      const sd = pins.length >= 3 ? (pins[2] ?? '') : (pins[1] ?? '');
      assertDuoSetupPins(primary, sd);
      // SETUP_MANUAL: 0xFF + primary@6 + PIN2@22 + SD@38 (okcore_quick_setup).
      pinBytes = [255, ...padDuoPinSlot(primary), ...padDuoPinSlot(pin2), ...padDuoPinSlot(sd)];
    } else {
      const pin = pins[0] ?? '';
      pinBytes = pin.split('').map((char) => 48 + Number(char));
    }

    const res = await this.sendRequest(
      MessageID.OKSETPIN,
      undefined,
      undefined,
      pinBytes,
      10000,
      setPin
        ? undefined
        : (r) => {
            const t = `${r.text ?? ''} ${r.error ?? ''}`.toLowerCase();
            return (
              r.type === 'error' ||
              t.includes('unlocked') ||
              t.includes('initialized-d') ||
              t.includes('incorrect') ||
              t.includes('password attempts')
            );
          },
    );
    if (res.type === 'error') throw new Error(res.error);
    if (!setPin) {
      const t = `${res.text ?? ''} ${res.error ?? ''}`;
      if (/initialized-d/i.test(t) || /incorrect/i.test(t) || /password attempts/i.test(t)) {
        const msg = /password attempts/i.test(t)
          ? 'Error password attempts for this session exceeded'
          : 'Incorrect PIN';
        this.emit('error', msg);
        throw new Error(msg);
      }
    }
  }

  public async setBackupPassphrase(passphrase: string): Promise<void> {
    const { hashBackupPassphrase } = await import('./keyParser');
    const key = hashBackupPassphrase(passphrase);
    await this.setPrivateKey(131, 161, key);
  }

  public async setBackupKeyMode(mode: number): Promise<void> {
    await this.sendRequest(
      MessageID.OKSETSLOT, 'XX', FieldID.BACKUPKEYMODE, [mode], 10000,
      (r) => r.text?.toLowerCase().includes('backup key mode') ?? false
    );
  }

  // --- YubiKey Auth ---
  public async setYubiAuth(publicId: string, privateId: string, secretKey: string): Promise<void> {
    const modhexPublicId = hexToModhex(publicId.slice(0, 12), true);
    const combinedHex = modhexPublicId + privateId.slice(0, 12) + secretKey.slice(0, 32);
    const bytes = hexStringToByteArray(combinedHex);

    await this.sendCommandAndWaitFor(MessageID.OKSETSLOT, 'set AES Key', 'XX', FieldID.YUBIAUTH, bytes);
  }

  public async wipeYubiAuth(): Promise<void> {
    // Firmware wipes slot 0 / field 10 silently (blink only); no "wiped AES Key" HID message.
    await this.sendCommandWithoutConfirmation(MessageID.OKWIPESLOT, 'XX', FieldID.YUBIAUTH);
  }

  // --- Key Management ---
  public async setPrivateKey(slot: number, type: number, key: Uint8Array | number[] | string): Promise<void> {
    let bytes: number[];
    if (typeof key === 'string') {
      bytes = hexStringToByteArray(key);
    } else {
      bytes = Array.from(key);
    }

    // Firmware replies on the final OKSETPRIV chunk only (same class of
    // behavior as OKRESTORE). Waiting on intermediates 10s-timeouts RSA-4096.
    const maxPacketSize = 57;
    for (let i = 0; i < bytes.length; i += maxPacketSize) {
      const chunk = bytes.slice(i, i + maxPacketSize);
      const isFinal = i + maxPacketSize >= bytes.length;
      if (!isFinal) {
        await this.sendCommandWithoutConfirmation(MessageID.OKSETPRIV, slot, type, chunk, 200);
        await new Promise((r) => setTimeout(r, 30));
        continue;
      }
      const res = await this.sendRequest(MessageID.OKSETPRIV, slot, type, chunk);
      if (res.type === 'error') throw new Error(res.error);
    }
  }

  public async wipePrivateKey(slot: number): Promise<void> {
    await this.sendRequest(MessageID.OKWIPEPRIV, slot);
  }

  // --- Backup & Restore ---
  /**
   * Stream encrypted backup bytes via OKRESTORE.
   *
   * Firmware RESTORE() behavior (okcore.cpp):
   * - Intermediate packets have slot/flag byte 0xFF and return with **no HID reply**.
   * - The final packet (flag = payload length ≤ 57) decrypts/applies the blob and
   *   prints success ("Successfully loaded backup" / "Remove and Reinsert…") or Error*.
   *
   * Waiting for a reply on intermediate packets caused
   * "Request OKRESTORE timed out after 10000ms" even in config mode.
   */
  public async restore(
    restoreData: string,
    onProgress?: (pct: number) => void,
  ): Promise<void> {
    const bytes = hexStringToByteArray(restoreData);
    if (bytes.length === 0) {
      throw new Error('Backup data is empty.');
    }

    const maxPacketSize = 57;
    const totalPackets = Math.max(1, Math.ceil(bytes.length / maxPacketSize));
    let packetIndex = 0;

    const reportProgress = (phase: 'send' | 'apply') => {
      if (!onProgress) return;
      if (phase === 'apply') {
        onProgress(100);
        return;
      }
      // Reserve the last ~8% for final decrypt/apply on device.
      const sendPct = Math.min(92, Math.round((packetIndex / totalPackets) * 92));
      onProgress(sendPct);
    };

    for (let i = 0; i < bytes.length; i += maxPacketSize) {
      const chunk = bytes.slice(i, i + maxPacketSize);
      const isFinal = i + maxPacketSize >= bytes.length;
      // Firmware: buffer[5] == 0xFF → more packets; else buffer[5] = last chunk length.
      const packetFlag = isFinal ? chunk.length : 0xff;
      packetIndex += 1;

      if (!isFinal) {
        // Silent buffer packet — only surface async errors (wrong mode, locked, etc.).
        await this.sendCommandWithoutConfirmation(
          MessageID.OKRESTORE,
          packetFlag,
          undefined,
          chunk,
          200,
        );
        // Firmware comment: MCU can't keep up with tight memcpy loops.
        await new Promise((r) => setTimeout(r, 30));
        reportProgress('send');
        continue;
      }

      reportProgress('send');
      onProgress?.(95);

      const res = await this.sendRequest(
        MessageID.OKRESTORE,
        packetFlag,
        undefined,
        chunk,
        120_000,
        (r) => {
          const t = `${r.text ?? ''} ${r.error ?? ''}`.toLowerCase();
          return (
            t.includes('successfully loaded backup') ||
            t.includes('remove and reinsert') ||
            t.includes('error') ||
            r.type === 'error'
          );
        },
      );

      const t = `${res.text ?? ''} ${res.error ?? ''}`.toLowerCase();
      if (res.type === 'error' || /error/i.test(t)) {
        throw new Error(OnlyKeyDevice.formatDeviceLockedError(res.error || res.text || 'Restore failed'));
      }
      if (!t.includes('successfully loaded backup') && !t.includes('remove and reinsert')) {
        throw new Error(res.text || 'Restore failed');
      }
      reportProgress('apply');
    }
  }

  public async firmwareUpdate(firmwareBlocks: string[], onProgress?: (pct: number) => void): Promise<void> {
    if (!this.state.isBootloader) {
      await this.triggerBootloader();
      return;
    }
    await this.loadFirmwareBlocks(firmwareBlocks, onProgress);
  }

  // --- Preferences ---
  /**
   * Standard prefs use global slot XX and do not require config mode on firmware
   * (unless Sysadmin/mod_keys mode is enabled — firmware then gates all OKSETSLOT).
   * Match both v5 listen strings and real firmware "Successfully set …" text.
   */
  private matchPrefText(...needles: string[]) {
    return (r: { text?: string; error?: string; type: string }) => {
      const t = `${r.text ?? ''} ${r.error ?? ''}`.toLowerCase();
      return needles.some((n) => t.includes(n.toLowerCase()));
    };
  }

  public async setLockout(minutes: number): Promise<void> {
    await this.sendRequest(
      MessageID.OKSETSLOT, 'XX', FieldID.LOCKOUT, [minutes], 10000,
      this.matchPrefText('idle timeout', 'lockout'),
    );
  }

  public async setWipeMode(mode: number): Promise<void> {
    await this.sendRequest(
      MessageID.OKSETSLOT, 'XX', FieldID.WIPEMODE, [mode], 10000,
      this.matchPrefText('wipe mode'),
    );
  }

  public async setLedBrightness(brightness: number): Promise<void> {
    await this.sendRequest(
      MessageID.OKSETSLOT, 'XX', FieldID.LED_BRIGHTNESS, [brightness], 10000,
      this.matchPrefText('led brightness', 'brightness'),
    );
  }

  public async setKbdLayout(layout: number): Promise<void> {
    await this.sendRequest(
      MessageID.OKSETSLOT, 'XX', FieldID.KBD_LAYOUT, [layout], 10000,
      this.matchPrefText('keyboard layout', 'layout'),
    );
  }

  public async setTypeSpeed(speed: number): Promise<void> {
    await this.sendRequest(
      MessageID.OKSETSLOT, 'XX', FieldID.TYPE_SPEED, [speed], 10000,
      this.matchPrefText('typespeed', 'type speed', 'keyboard typespeed'),
    );
  }

  public async setLockButton(button: number): Promise<void> {
    await this.sendRequest(
      MessageID.OKSETSLOT, 'XX', FieldID.LOCK_BUTTON, [button], 10000,
      this.matchPrefText('lock button'),
    );
  }

  public async setDerivedChallengeMode(mode: number): Promise<void> {
    await this.sendRequest(
      MessageID.OKSETSLOT, 'XX', FieldID.DERIVED_CHALLENGE_MODE, [mode], 10000,
      this.matchPrefText('challenge mode', 'derived key challenge'),
    );
  }

  public async setStoredChallengeMode(mode: number): Promise<void> {
    await this.sendRequest(
      MessageID.OKSETSLOT, 'XX', FieldID.STORED_CHALLENGE_MODE, [mode], 10000,
      this.matchPrefText('challenge mode', 'stored key challenge'),
    );
  }

  public async setHmacChallengeMode(mode: number): Promise<void> {
    await this.sendRequest(
      MessageID.OKSETSLOT, 'XX', FieldID.HMAC_CHALLENGE_MODE, [mode], 10000,
      this.matchPrefText('hmac challenge mode', 'hmac'),
    );
  }

  public async setModKeyMode(mode: number): Promise<void> {
    await this.sendRequest(
      MessageID.OKSETSLOT, 'XX', FieldID.MODKEY_MODE, [mode], 10000,
      this.matchPrefText('sysadmin mode', 'modkey'),
    );
  }

  public async setSecProfileMode(mode: number): Promise<void> {
    await this.sendRequest(MessageID.OKSETSLOT, 'XX', FieldID.SEC_PROFILE_MODE, [mode]);
  }

  public async setSlotTypeSpeed(slot: number, speed: number): Promise<void> {
    await this.sendRequest(MessageID.OKSETSLOT, slot, FieldID.TYPE_SPEED, [speed], 10000,
      this.matchPrefText('typespeed', 'type speed'));
  }

  public async setSlotFields(slotId: number, fields: Array<{ fieldId: FieldID; value: string | number[] }>): Promise<void> {
    for (const { fieldId, value } of fields) {
      await this.setSlot(slotId, fieldId, value);
    }
  }

  public async triggerBootloader(): Promise<void> {
    await this.sendRequest(MessageID.OKFWUPDATE, undefined, undefined, [1, 2, 3, 4], 10000,
      (r) => (r.text?.includes('REBOOTING') || r.text?.includes('SUCCESSFULL')) ?? false);
  }

  public async loadFirmwareBlocks(blocks: string[], onProgress?: (pct: number) => void): Promise<void> {
    if (!this.state.isBootloader) {
      throw new Error('Device is not in bootloader.');
    }
    const maxPacketSize = 57;
    for (let i = 0; i < blocks.length; i++) {
      const bytes = hexStringToByteArray(blocks[i]);
      const isLastBlock = i === blocks.length - 1;
      const successText = isLastBlock ? 'SUCCESSFULLY LOADED FW' : 'NEXT BLOCK';

      for (let j = 0; j < bytes.length; j += maxPacketSize) {
        const chunk = bytes.slice(j, j + maxPacketSize);
        const isFinalChunk = j + maxPacketSize >= bytes.length;
        if (!isFinalChunk) {
          // 5.6 submitFirmwareData waits for RECEIVED OKFWUPDATE on every 57-byte chunk.
          const res = await this.sendRequest(
            MessageID.OKFWUPDATE,
            0xff,
            undefined,
            chunk,
            10_000,
            (r) => {
              const t = `${r.text ?? ''} ${r.error ?? ''}`.toLowerCase();
              return r.type === 'error' || t.includes('received okfwupdate') || t.includes('error');
            },
          );
          const ack = `${res.text ?? ''} ${res.error ?? ''}`.toLowerCase();
          // Soft-complete on unplug resolves with "Device disconnected" — that is not an ACK.
          if (res.type === 'error' || ack.includes('error') || !ack.includes('received okfwupdate')) {
            throw new Error(res.error || res.text || 'Firmware load failed');
          }
          continue;
        }
        // Do not match RECEIVED here — that would consume the ACK and drop NEXT BLOCK.
        const res = await this.sendRequest(
          MessageID.OKFWUPDATE,
          chunk.length,
          undefined,
          chunk,
          20_000,
          (r) => {
            const t = `${r.text ?? ''} ${r.error ?? ''}`.toLowerCase();
            return t.includes(successText.toLowerCase()) || r.type === 'error' || t.includes('error');
          },
        );
        const t = `${res.text ?? ''} ${res.error ?? ''}`.toLowerCase();
        if (res.type === 'error' || t.includes('error') || !t.includes(successText.toLowerCase())) {
          throw new Error(res.error || res.text || 'Firmware load failed');
        }
      }

      onProgress?.(Math.round(((i + 1) / blocks.length) * 100));
    }
  }
}
