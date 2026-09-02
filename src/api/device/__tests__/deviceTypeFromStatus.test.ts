import { describe, it, expect } from 'vitest';
import { DeviceType } from '../types';
import {
  inferDeviceTypeFromStatusText,
  inferDeviceTypeFromVersion,
  inferDeviceTypeFromLabelSlotIds,
  classicConfirmedByLabels,
  maxLabelSlotId,
  isDuoNoPinFromStatusText,
} from '../deviceTypeFromStatus';
import { deviceTypeFromProductId } from '../firmwareConstants';

describe('device type detection', () => {
  it('recognizes UNLOCKED BOOTLOADERv1 as bootloader', () => {
    expect(inferDeviceTypeFromStatusText('UNLOCKED BOOTLOADERv1')).toBe(DeviceType.BOOTLOADER);
    expect(inferDeviceTypeFromStatusText('BOOTLOADER')).toBe(DeviceType.BOOTLOADER);
  });

  it('recognizes UNINITIALIZED before the INITIALIZED substring', () => {
    expect(inferDeviceTypeFromStatusText('UNINITIALIZEDv2.1.0-prod')).toBe(DeviceType.UNINITIALIZED);
    expect(inferDeviceTypeFromStatusText('UNINITIALIZED-Dv3.0.0-prod')).toBe(DeviceType.UNINITIALIZED);
  });

  it('recognizes DUO from INITIALIZED-D and UNLOCKED-D', () => {
    expect(inferDeviceTypeFromStatusText('INITIALIZED-Dv3.0.0-prod')).toBe(DeviceType.DUO);
    expect(inferDeviceTypeFromStatusText('UNLOCKED-Dv3.0.0-prod')).toBe(DeviceType.DUO);
  });

  it('classifies UNLOCKED by the version suffix letter, not the major version', () => {
    expect(inferDeviceTypeFromStatusText('UNLOCKEDv3.0.4-prodc')).toBe(DeviceType.CLASSIC);
    expect(inferDeviceTypeFromStatusText('UNLOCKEDv3.0.4-prodp')).toBe(DeviceType.DUO);
    expect(inferDeviceTypeFromStatusText('UNLOCKEDv2.1.0-prodc')).toBe(DeviceType.CLASSIC);
    expect(inferDeviceTypeFromVersion('v3.0.4-prodc')).toBe(DeviceType.CLASSIC);
    expect(inferDeviceTypeFromVersion('v3.0.4-prodp')).toBe(DeviceType.DUO);
    expect(inferDeviceTypeFromVersion('v2.1.0-proc')).toBe(DeviceType.CLASSIC);
  });

  it('falls back to major version only when the suffix letter is missing', () => {
    expect(inferDeviceTypeFromStatusText('UNLOCKEDv3.0.0-prod')).toBe(DeviceType.DUO);
    expect(inferDeviceTypeFromStatusText('UNLOCKEDv2.1.0-prod')).toBe(DeviceType.CLASSIC);
    expect(inferDeviceTypeFromVersion('v3.0.0-prod')).toBe(DeviceType.DUO);
  });

  it('infers DUO from label slot indices above 12', () => {
    expect(inferDeviceTypeFromLabelSlotIds([1, 6, 12])).toBeUndefined();
    expect(inferDeviceTypeFromLabelSlotIds([1, 13])).toBe(DeviceType.DUO);
  });

  it('confirms Classic when 12 labels arrive with no slot above 12', () => {
    const slots = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(maxLabelSlotId(slots)).toBe(12);
    expect(classicConfirmedByLabels(slots, 12, true)).toBe(true);
    expect(classicConfirmedByLabels(slots, 12, false)).toBe(false);
    expect(classicConfirmedByLabels([1, 13], 13, true)).toBe(false);
  });

  it('uses legacy version suffix letters', () => {
    expect(inferDeviceTypeFromStatusText('UNLOCKEDv2.1.0-proc')).toBe(DeviceType.CLASSIC);
    expect(inferDeviceTypeFromStatusText('UNLOCKEDv3.0.0-prodp')).toBe(DeviceType.DUO);
    expect(inferDeviceTypeFromStatusText('INITIALIZED-Dv3.0.0-prodn')).toBe(DeviceType.DUO);
    expect(isDuoNoPinFromStatusText('INITIALIZED-Dv3.0.0-prodn')).toBe(true);
  });

  it('treats a trailing p as DUO even on a v2 version string', () => {
    expect(inferDeviceTypeFromStatusText('UNLOCKEDv2.1.0-prodp')).toBe(DeviceType.DUO);
  });

  it('treats plain INITIALIZED as Classic and empty text as unknown', () => {
    expect(inferDeviceTypeFromStatusText('')).toBeUndefined();
    expect(inferDeviceTypeFromStatusText('   ')).toBeUndefined();
    expect(inferDeviceTypeFromStatusText('INITIALIZED')).toBe(DeviceType.CLASSIC);
    expect(inferDeviceTypeFromStatusText('UNLOCKED')).toBeUndefined();
  });

  it('uses trailing n/p/c when major version is missing', () => {
    expect(inferDeviceTypeFromStatusText('UNLOCKEDprodn')).toBe(DeviceType.DUO);
    expect(inferDeviceTypeFromStatusText('UNLOCKEDprodp')).toBe(DeviceType.DUO);
    expect(inferDeviceTypeFromStatusText('UNLOCKEDprodc')).toBe(DeviceType.CLASSIC);
    expect(inferDeviceTypeFromVersion('')).toBeUndefined();
    expect(inferDeviceTypeFromVersion('customn')).toBe(DeviceType.DUO);
    expect(inferDeviceTypeFromVersion('customc')).toBe(DeviceType.CLASSIC);
    expect(inferDeviceTypeFromVersion('mystery')).toBeUndefined();
  });

  it('maps DUO USB product IDs', () => {
    expect(deviceTypeFromProductId(0x614c)).toBe(DeviceType.DUO);
    expect(deviceTypeFromProductId(0x614e)).toBe(DeviceType.DUO);
    expect(deviceTypeFromProductId(0x4211)).toBe(DeviceType.DUO);
    expect(deviceTypeFromProductId(0x60fc)).toBeUndefined();
    expect(deviceTypeFromProductId(0x0486)).toBe(DeviceType.CLASSIC);
  });
});