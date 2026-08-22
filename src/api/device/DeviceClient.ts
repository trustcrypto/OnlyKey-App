import type { DeviceStatus, FieldID } from './types';
import type { DeviceFilter } from '../transport/Transport.interface';

/** Application-facing device API — UI and services depend on this, not OnlyKeyDevice. */
export interface DeviceClient {
  on(event: 'statusChange', listener: (state: DeviceStatus) => void): this;
  on(event: 'error', listener: (error: string) => void): this;
  on(event: 'labelUpdate', listener: (slotId: number, label: string) => void): this;
  on(event: 'labelsRefreshed', listener: (labels: Map<number, string>) => void): this;
  on(event: 'messageReceived', listener: (message: string) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
  emit(event: string, ...args: unknown[]): boolean;
  connect(filters: DeviceFilter | DeviceFilter[]): Promise<void>;
  disconnect(): Promise<void>;
  getLabels(): Promise<Map<number, string>>;
  setSlot(slotId: number, fieldId: FieldID, value: string | number[]): Promise<void>;
  wipeSlot(slotId: number, fieldId?: FieldID): Promise<void>;
  setSlotTypeSpeed(slot: number, speed: number): Promise<void>;
  setSlotFields(
    slotId: number,
    fields: Array<{ fieldId: FieldID; value: string | number[] }>
  ): Promise<void>;
  setPin(pin?: string): Promise<void>;
  beginClassicPinEntry(which?: 'pin' | 'pin2' | 'sdpin', phase?: 'prompt' | 'commit'): Promise<void>;
  cancelClassicPinEntry(which?: 'pin' | 'pin2' | 'sdpin'): Promise<void>;
  /** Probe lock state via OKSETTIME (INITIALIZED* vs UNLOCKED*). */
  refreshStatus(): Promise<void>;
  setPin2(): Promise<void>;
  setSDPin(): Promise<void>;
  sendPinDUO(pins: string[], setPin?: boolean): Promise<void>;
  setBackupPassphrase(passphrase: string): Promise<void>;
  setBackupKeyMode(mode: number): Promise<void>;
  setYubiAuth(publicId: string, privateId: string, secretKey: string): Promise<void>;
  wipeYubiAuth(): Promise<void>;
  setPrivateKey(slot: number, type: number, key: Uint8Array | number[] | string): Promise<void>;
  wipePrivateKey(slot: number): Promise<void>;
  restore(restoreData: string, onProgress?: (pct: number) => void): Promise<void>;
  firmwareUpdate(firmwareBlocks: string[], onProgress?: (pct: number) => void): Promise<void>;
  triggerBootloader(): Promise<void>;
  loadFirmwareBlocks(blocks: string[], onProgress?: (pct: number) => void): Promise<void>;
  setLockout(minutes: number): Promise<void>;
  setWipeMode(mode: number): Promise<void>;
  setLedBrightness(brightness: number): Promise<void>;
  setKbdLayout(layout: number): Promise<void>;
  setTypeSpeed(speed: number): Promise<void>;
  setLockButton(button: number): Promise<void>;
  setDerivedChallengeMode(mode: number): Promise<void>;
  setStoredChallengeMode(mode: number): Promise<void>;
  setHmacChallengeMode(mode: number): Promise<void>;
  setModKeyMode(mode: number): Promise<void>;
  setSecProfileMode(mode: number): Promise<void>;
}