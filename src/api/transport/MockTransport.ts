import { TransportInterface, DeviceFilter } from './Transport.interface';
import { MessageID, FieldID, MESSAGE_HEADER, PACKET_SIZE, GLOBAL_SLOT } from '../device/types';
import { hidLabelSlotByte } from '../device/ResponseParser';

export type MockDeviceKind = 'classic' | 'duo' | 'uninitialized' | 'bootloader';

export interface MockTransportOptions {
  /** Device profile at connect. Default classic. */
  deviceType?: MockDeviceKind;
  /** Firmware version suffix shown in status (e.g. v3.0.0-prod). */
  version?: string;
  /** Start locked after connect. Default true (false for uninitialized). */
  startLocked?: boolean;
  /** Require config mode for slot/key/pref writes. Default false for easy UI tests. */
  requireConfigMode?: boolean;
  /** When requireConfigMode, enter config mode on unlock if true. Default true. */
  unlockEntersConfigMode?: boolean;
  /** DUO unlock PIN (digits only). Empty = accept any non-empty PIN. */
  correctPin?: string;
  /** Fail PIN after this many wrong attempts (0 = unlimited). */
  maxPinAttempts?: number;
  /** Delay (ms) before each HID response. Default 0 for fast tests. */
  responseDelayMs?: number;
  /** Initial slot labels (slot number → text). */
  initialLabels?: Record<number, string>;
  /** Emit labels as binary [slot, 0x7C, ...ascii] (realistic). Default true. */
  binaryLabels?: boolean;
  /** Log packets to console. Default false (less noise in CI). */
  verbose?: boolean;
}

/** Confirmation substrings matched by OnlyKeyDevice preference helpers. */
const FIELD_CONFIRMATIONS: Partial<Record<number, string>> = {
  [FieldID.LOCKOUT]: 'Successfully set idle timeout',
  [FieldID.WIPEMODE]: 'Successfully set Wipe Mode',
  [FieldID.LED_BRIGHTNESS]: 'Successfully set LED brightness',
  [FieldID.KBD_LAYOUT]: 'Successfully set keyboard layout',
  [FieldID.TYPE_SPEED]: 'Successfully set typespeed',
  [FieldID.LOCK_BUTTON]: 'Successfully set lock button',
  [FieldID.DERIVED_CHALLENGE_MODE]: 'Successfully set derived key challenge mode',
  [FieldID.STORED_CHALLENGE_MODE]: 'Successfully set stored key challenge mode',
  [FieldID.HMAC_CHALLENGE_MODE]: 'Successfully set HMAC Challenge Mode',
  [FieldID.MODKEY_MODE]: 'Successfully set Sysadmin Mode',
  [FieldID.BACKUPKEYMODE]: 'Successfully set Backup Key Mode',
  [FieldID.YUBIAUTH]: 'Successfully set AES Key',
  [FieldID.SEC_PROFILE_MODE]: 'Successfully set 2nd profile mode',
  [FieldID.LABEL]: 'Successfully set Label',
  [FieldID.URL]: 'Successfully set URL',
  [FieldID.USERNAME]: 'Successfully set Username',
  [FieldID.PASSWORD]: 'Successfully set Password',
  [FieldID.TFATYPE]: 'Success',
  [FieldID.TFAUSERNAME]: 'Success',
};

/**
 * Standard Preferences (v5 / users guide): unlocked is enough — config mode not required.
 * Firmware set_slot() does not gate these fields on configmode.
 * (Note: firmware also has a blanket OKSETSLOT gate when Sysadmin/mod_keys is enabled.)
 */
const STANDARD_PREF_FIELDS = new Set<number>([
  FieldID.LOCKOUT,
  FieldID.TYPE_SPEED,
  FieldID.KBD_LAYOUT,
  FieldID.LED_BRIGHTNESS,
  FieldID.LOCK_BUTTON,
]);

/** Advanced prefs / keys that firmware requires config mode (or first-use) for. */
const CONFIG_MODE_FIELDS = new Set<number>([
  FieldID.WIPEMODE,
  FieldID.BACKUPKEYMODE,
  FieldID.DERIVED_CHALLENGE_MODE,
  FieldID.STORED_CHALLENGE_MODE,
  FieldID.HMAC_CHALLENGE_MODE,
  FieldID.MODKEY_MODE,
  FieldID.YUBIAUTH,
]);

const DEFAULT_CLASSIC_LABELS: Record<number, string> = {
  1: 'Gmail',
  2: 'GitHub',
  7: 'Work VPN',
  8: 'Bank',
};

const DEFAULT_DUO_LABELS: Record<number, string> = {
  1: 'Gmail',
  2: 'GitHub',
  4: 'Work VPN',
  5: 'Bank',
  13: 'Yellow 1',
  19: 'Purple 1',
};

/**
 * Stateful HID mock that speaks the OnlyKey response language used by OnlyKeyDevice.
 * Use for unit tests, UI tests (VITE_MOCK_DEVICE), and manual `?mock=1` sessions.
 */
export class MockTransport implements TransportInterface {
  private connected = false;
  private receiveCallback: ((data: Uint8Array) => void) | null = null;
  private disconnectCallback: (() => void) | null = null;

  private deviceType: MockDeviceKind;
  private version: string;
  private isLocked: boolean;
  private isConfigMode: boolean;
  private isBootloader: boolean;
  private requireConfigMode: boolean;
  private unlockEntersConfigMode: boolean;
  private correctPin: string;
  private maxPinAttempts: number;
  private pinAttempts = 0;
  private responseDelayMs: number;
  private binaryLabels: boolean;
  private verbose: boolean;
  /** Bumped on disconnect to cancel in-flight delayed responses. */
  private epoch = 0;

  /** In-memory slot labels (numeric wire IDs). */
  readonly labels = new Map<number, string>();

  /** Last command packets (msgId + raw) for assertions. */
  readonly sentPackets: Uint8Array[] = [];

  constructor(options: MockTransportOptions = {}) {
    this.deviceType = options.deviceType ?? 'classic';
    this.version = options.version ?? (this.deviceType === 'duo' ? 'v3.0.0-prod' : 'v2.1.0-prod');
    this.requireConfigMode = options.requireConfigMode ?? false;
    this.unlockEntersConfigMode = options.unlockEntersConfigMode ?? true;
    this.correctPin = options.correctPin ?? '';
    this.maxPinAttempts = options.maxPinAttempts ?? 0;
    this.responseDelayMs = options.responseDelayMs ?? 0;
    this.binaryLabels = options.binaryLabels ?? true;
    this.verbose = options.verbose ?? false;

    const boot = this.deviceType === 'bootloader';
    const uninit = this.deviceType === 'uninitialized';
    this.isBootloader = boot;
    this.isLocked = options.startLocked ?? (!uninit && !boot);
    this.isConfigMode = false;

    const seed =
      options.initialLabels ??
      (this.deviceType === 'duo' ? DEFAULT_DUO_LABELS : DEFAULT_CLASSIC_LABELS);
    if (!uninit && !boot) {
      for (const [slot, label] of Object.entries(seed)) {
        this.labels.set(Number(slot), label);
      }
    }
  }

  // --- Test / harness controls ------------------------------------------------

  /** Inject a raw ASCII device message (tests use this; works even if not "connected"). */
  simulateResponse(text: string): void {
    this.emitText(text, true);
  }

  /** Inject binary label report: [slotId, '|', ...label]. */
  simulateBinaryLabel(slotId: number, label: string): void {
    this.emitBinaryLabel(slotId, label, true);
  }

  setDeviceType(kind: MockDeviceKind): void {
    this.deviceType = kind;
    this.isBootloader = kind === 'bootloader';
  }

  setLocked(locked: boolean): void {
    this.isLocked = locked;
  }

  setConfigMode(enabled: boolean): void {
    this.isConfigMode = enabled;
    if (enabled) this.isLocked = true;
  }

  /** Enter bootloader as if after OKFWUPDATE kick + reconnect. */
  enterBootloader(): void {
    this.isBootloader = true;
    this.deviceType = 'bootloader';
    this.isLocked = false;
    this.isConfigMode = false;
  }

  /** Exit bootloader back to classic unlocked (post-FW success path). */
  exitBootloader(deviceType: MockDeviceKind = 'classic'): void {
    this.isBootloader = false;
    this.deviceType = deviceType === 'bootloader' ? 'classic' : deviceType;
    this.isLocked = false;
    this.emitText(this.statusUnlocked());
  }

  getSnapshot() {
    return {
      connected: this.connected,
      deviceType: this.deviceType,
      version: this.version,
      isLocked: this.isLocked,
      isConfigMode: this.isConfigMode,
      isBootloader: this.isBootloader,
      pinAttempts: this.pinAttempts,
      labels: Object.fromEntries(this.labels),
    };
  }

  // --- TransportInterface -----------------------------------------------------

  async connect(filter: DeviceFilter | DeviceFilter[]): Promise<void> {
    this.connected = true;
    this.epoch += 1;
    const epoch = this.epoch;
    if (this.verbose) console.log('MockTransport: Connected', filter);

    // Initial status after plug-in (async like real HID).
    await this.delay();
    if (epoch !== this.epoch || !this.connected) return;

    if (this.isBootloader) {
      this.emitText('BOOTLOADER');
    } else if (this.deviceType === 'uninitialized') {
      this.emitText(`UNINITIALIZEDv${this.version.replace(/^v/, '')}`);
    } else if (this.isLocked) {
      this.emitText(this.statusInitialized());
    } else {
      this.emitText(this.statusUnlocked());
    }
  }

  async disconnect(): Promise<void> {
    // Intentional close — do not fire onDisconnect (mirrors ChromeHidTransport:
    // only surprise removal notifies the device layer).
    this.epoch += 1;
    this.connected = false;
    if (this.verbose) console.log('MockTransport: Disconnected');
  }

  /** Simulate unplug: disconnect and notify onDisconnect listeners. */
  unplug(): void {
    this.epoch += 1;
    const wasConnected = this.connected;
    this.connected = false;
    if (wasConnected) this.disconnectCallback?.();
  }

  async send(_reportId: number, data: Uint8Array): Promise<void> {
    if (!this.connected) throw new Error('Not connected');

    const packet = new Uint8Array(data);
    this.sentPackets.push(packet);

    const msgId = packet[MESSAGE_HEADER.length] as MessageID;
    if (this.verbose) {
      console.log('MockTransport: command', MessageID[msgId] ?? msgId, Array.from(packet.slice(0, 16)));
    }

    await this.delay();
    await this.handleCommand(msgId, packet);
  }

  onReceive(callback: (data: Uint8Array) => void): void {
    this.receiveCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  getConnectedDevice(): DeviceFilter {
    if (this.deviceType === 'duo') {
      return { vendorId: 0x1d50, productId: 0x614c };
    }
    if (this.deviceType === 'bootloader') {
      return { vendorId: 0x0000, productId: 0xb001 };
    }
    // Classic (newer firmware VID/PID)
    return { vendorId: 0x1d50, productId: 0x60fc };
  }

  // --- Command handlers -------------------------------------------------------

  private async handleCommand(msgId: MessageID, packet: Uint8Array): Promise<void> {
    switch (msgId) {
      case MessageID.OKSETTIME:
        // Real firmware (OKCONNECT/set_time) replies with INITIALIZED* / UNLOCKED*
        // / UNINITIALIZED* — not a bare "OK". Tests and lock-polling depend on this.
        if (this.isBootloader) {
          this.emitText('BOOTLOADER');
        } else if (this.deviceType === 'uninitialized') {
          this.emitText(`UNINITIALIZEDv${this.version.replace(/^v/, '')}`);
        } else if (this.isLocked) {
          this.emitText(this.statusInitialized());
        } else {
          this.emitText(this.statusUnlocked());
        }
        return;

      case MessageID.OKGETLABELS:
        await this.handleGetLabels();
        return;

      case MessageID.OKSETPIN:
        this.handleSetPin(packet);
        return;

      case MessageID.OKSETPIN2:
        this.emitText(this.requireConfigOrOk('PIN2 set'));
        return;

      case MessageID.OKSETSDPIN:
        this.emitText(this.requireConfigOrOk('SD PIN set'));
        return;

      case MessageID.OKSETSLOT:
        this.handleSetSlot(packet);
        return;

      case MessageID.OKWIPESLOT:
        this.handleWipeSlot(packet);
        return;

      case MessageID.OKSETPRIV:
        this.emitText(this.requireConfigOrOk('OK'));
        return;

      case MessageID.OKWIPEPRIV:
        this.emitText(this.requireConfigOrOk('OK'));
        return;

      case MessageID.OKRESTORE: {
        // Match firmware: intermediate flag 0xFF is silent; last packet replies.
        // Packet: [FF FF FF FF][msgId][flag][payload...]
        const flag = packet[MESSAGE_HEADER.length + 1];
        if (flag === 0xff) {
          if (this.requireConfigMode && !this.isConfigMode && !this.isBootloader) {
            this.emitText('Error not in config mode');
          }
          // else silent — real device returns nothing
          return;
        }
        if (this.requireConfigMode && !this.isConfigMode && !this.isBootloader) {
          this.emitText('Error not in config mode');
          return;
        }
        this.emitText('Successfully loaded backup');
        // Firmware also prints a second line then restarts; optional follow-up.
        setTimeout(() => {
          this.emitText('Remove and Reinsert OnlyKey to complete restore');
        }, 5);
        return;
      }

      case MessageID.OKFWUPDATE:
        this.handleFirmware(packet);
        return;

      case MessageID.OKGETPUBKEY:
      case MessageID.OKSIGN:
      case MessageID.OKDECRYPT:
        this.emitText('OK');
        return;

      default:
        this.emitText('OK');
    }
  }

  private handleSetPin(packet: Uint8Array): void {
    // Payload starts after header+msgId (no slot/field for OKSETPIN)
    const payload = packet.slice(MESSAGE_HEADER.length + 1);
    const digits = this.decodePinDigits(payload);

    // Empty packet / classic keypad entry: unlock after "hardware" success
    if (!digits) {
      this.isLocked = false;
      if (this.unlockEntersConfigMode) this.isConfigMode = true;
      this.pinAttempts = 0;
      this.emitText(this.statusUnlocked());
      return;
    }

    // DUO setup prefix 0xFF then digits
    const isSetup = payload[0] === 0xff;

    if (this.correctPin && digits !== this.correctPin) {
      this.pinAttempts += 1;
      if (this.maxPinAttempts > 0 && this.pinAttempts >= this.maxPinAttempts) {
        this.emitText('Error password attempts for this session exceeded');
        return;
      }
      if (this.deviceType === 'duo' && !isSetup) {
        this.emitText(this.statusInitialized());
        return;
      }
      this.emitText('Error incorrect PIN');
      return;
    }

    this.pinAttempts = 0;
    this.isLocked = false;
    if (isSetup || this.unlockEntersConfigMode) {
      this.isConfigMode = true;
    }
    this.emitText(this.statusUnlocked());
  }

  private handleSetSlot(packet: Uint8Array): void {
    // Real device: config mode still reports as "locked" but accepts writes.
    // Standard global prefs (type speed, layout, LED, lockout, lock button) do NOT
    // require config mode. Advanced security prefs and slot content do when
    // requireConfigMode is enabled.
    const slot = packet[MESSAGE_HEADER.length + 1] ?? GLOBAL_SLOT;
    const field = packet[MESSAGE_HEADER.length + 2] as FieldID;
    const valueBytes = packet.slice(MESSAGE_HEADER.length + 3);
    const valueText = this.bytesToAscii(valueBytes);

    const isStandardPref = slot === GLOBAL_SLOT && STANDARD_PREF_FIELDS.has(field);
    const needsConfig =
      this.requireConfigMode &&
      !this.isConfigMode &&
      !this.isBootloader &&
      !isStandardPref &&
      (CONFIG_MODE_FIELDS.has(field) || slot > 0);

    if (needsConfig) {
      this.emitText(this.isLocked ? 'Error device locked' : 'Error not in config mode');
      return;
    }

    if (this.isLocked && !this.isConfigMode && !this.isBootloader && !isStandardPref) {
      // Unlocked check for non-standard writes when mock is locked
      if (this.requireConfigMode || slot > 0) {
        this.emitText('Error device locked');
        return;
      }
    }

    // Standard prefs still need unlocked (or config mode) on a real key.
    if (isStandardPref && this.isLocked && !this.isConfigMode) {
      this.emitText('Error device locked');
      return;
    }

    if (field === FieldID.LABEL && slot > 0) {
      const label = valueText.trim() || 'empty';
      this.labels.set(slot, label);
    }

    if (field === FieldID.YUBIAUTH) {
      this.emitText('Successfully set AES Key, Private ID, and Public ID');
      return;
    }

    const confirm = FIELD_CONFIRMATIONS[field];
    this.emitText(confirm ?? 'Success');
  }

  private handleWipeSlot(packet: Uint8Array): void {
    if (this.requireConfigMode && !this.isConfigMode) {
      this.emitText('Error not in config mode');
      return;
    }

    const slot = packet[MESSAGE_HEADER.length + 1] ?? GLOBAL_SLOT;
    const field = packet[MESSAGE_HEADER.length + 2] as number | undefined;

    // Global Yubi wipe is silent on real firmware (app uses sendCommandWithoutConfirmation)
    if (slot === GLOBAL_SLOT && field === FieldID.YUBIAUTH) {
      this.emitText('OK');
      return;
    }

    if (slot > 0 && (field === undefined || field === 0 || field === FieldID.LABEL)) {
      this.labels.set(slot, 'empty');
    }

    this.emitText('Success');
  }

  private async handleGetLabels(): Promise<void> {
    const epoch = this.epoch;
    const entries = [...this.labels.entries()].sort((a, b) => a[0] - b[0]);
    if (entries.length === 0) {
      // Empty device still finishes getLabels wait loop with no label events
      this.emitText('OK');
      return;
    }

    for (let i = 0; i < entries.length; i++) {
      if (epoch !== this.epoch || !this.connected) return;
      const [slotId, label] = entries[i];
      if (this.responseDelayMs > 0) {
        await this.sleep(Math.min(this.responseDelayMs, 50));
      } else {
        // Tiny yield so async label handlers can run between packets
        await this.sleep(0);
      }
      if (epoch !== this.epoch || !this.connected) return;
      if (this.binaryLabels) {
        this.emitBinaryLabel(slotId, label);
      } else {
        const id = slotId < 10 ? `0${slotId}` : String(slotId);
        this.emitText(`${id}|${label}`);
      }
    }
  }

  private handleFirmware(packet: Uint8Array): void {
    const afterMsg = packet.slice(MESSAGE_HEADER.length + 1);
    // Kick packet: payload [1,2,3,4] with no slot header, or first bytes 1,2,3,4
    const isKick =
      !this.isBootloader &&
      afterMsg[0] === 1 &&
      afterMsg[1] === 2 &&
      afterMsg[2] === 3 &&
      afterMsg[3] === 4;

    if (isKick) {
      this.emitText('REBOOTING...');
      // Simulate disconnect into bootloader (caller reconnects)
      this.isBootloader = true;
      this.deviceType = 'bootloader';
      this.isLocked = false;
      this.isConfigMode = false;
      return;
    }

    if (!this.isBootloader) {
      this.emitText('Error not in bootloader');
      return;
    }

    // Packet: [FF×4][OKFWUPDATE][flag][payload]
    // flag 0xFF = intermediate chunk, silent (firmware does not reply).
    // Any other flag is the last chunk of a block. Emit both follow-ups
    // immediately: the app's single waiter matches NEXT BLOCK or SUCCESS.
    const flag = packet[MESSAGE_HEADER.length + 1];
    if (flag === 0xff) return;

    this.emitText('NEXT BLOCK');
    this.emitText('SUCCESSFULLY LOADED FW');
  }

  // --- Status helpers ---------------------------------------------------------

  private statusInitialized(): string {
    if (this.deviceType === 'duo') {
      return `INITIALIZED-D${this.version.startsWith('v') ? this.version : `v${this.version}`}`;
    }
    return `INITIALIZED${this.version.startsWith('v') ? this.version : `v${this.version}`}`;
  }

  private statusUnlocked(): string {
    // Classic unlock string (DUO type is sticky from INITIALIZED-D / USB PID in the app)
    return `UNLOCKED${this.version.startsWith('v') ? this.version : `v${this.version}`}`;
  }

  private requireConfigOrOk(okText: string): string {
    if (this.requireConfigMode && !this.isConfigMode) {
      return 'Error not in config mode';
    }
    return okText;
  }

  // --- Emit / encode ----------------------------------------------------------

  private emitText(text: string, force = false): void {
    if ((!this.connected && !force) || !this.receiveCallback) return;
    const data = new Uint8Array(PACKET_SIZE);
    for (let i = 0; i < text.length && i < PACKET_SIZE; i++) {
      data[i] = text.charCodeAt(i);
    }
    this.receiveCallback(data);
  }

  private emitBinaryLabel(slotId: number, label: string, force = false): void {
    if ((!this.connected && !force) || !this.receiveCallback) return;
    const data = new Uint8Array(PACKET_SIZE);
    data[0] = hidLabelSlotByte(slotId);
    data[1] = 124; // '|'
    for (let i = 0; i < label.length && i + 2 < PACKET_SIZE; i++) {
      data[i + 2] = label.charCodeAt(i);
    }
    this.receiveCallback(data);
  }

  private decodePinDigits(payload: Uint8Array): string {
    let start = 0;
    if (payload[0] === 0xff) start = 1;
    let s = '';
    for (let i = start; i < payload.length; i++) {
      const b = payload[i];
      if (b === 0) break;
      // Wire format: ASCII '0'+digit (48+)
      if (b >= 48 && b <= 57) s += String.fromCharCode(b);
      else if (b >= 0 && b <= 9) s += String(b);
    }
    return s;
  }

  private bytesToAscii(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0) break;
      if (b > 31 && b < 127) s += String.fromCharCode(b);
    }
    return s;
  }

  private async delay(): Promise<void> {
    if (this.responseDelayMs > 0) await this.sleep(this.responseDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
