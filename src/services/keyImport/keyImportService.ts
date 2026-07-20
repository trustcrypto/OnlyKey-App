import type { DeviceClient } from '../../api/device/DeviceClient';
import { parseKeyBundle } from './keyBundleParser';
import { KeyCandidate, KeyLoadAssignment } from './types';

export interface ImportPemKeyOptions {
  pem: string;
  passcode: string;
  slotChoice: number;
  setAsBackup?: boolean;
  selectedCandidateId?: string;
  targetSlot?: number;
}

export interface ImportPemKeyOutcome {
  loadedCount: number;
  usedSelection: boolean;
}

export async function importPemKey(
  device: DeviceClient,
  options: ImportPemKeyOptions
): Promise<ImportPemKeyOutcome> {
  const bundle = await parseKeyBundle(options.pem, options.passcode, options.slotChoice);

  let assignments: KeyLoadAssignment[];

  if (bundle.requiresSelection) {
    if (!options.selectedCandidateId || options.targetSlot === undefined) {
      throw new Error('KEY_SELECTION_REQUIRED');
    }
    const candidate = bundle.candidates.find((c) => c.id === options.selectedCandidateId);
    if (!candidate) throw new Error('Selected key not found.');
    assignments = [{ candidate, slot: options.targetSlot }];
  } else {
    assignments = bundle.assignments;
  }

  for (const { candidate, slot } of assignments) {
    await device.setPrivateKey(slot, candidate.type, candidate.keyData);
  }

  if (options.setAsBackup) {
    await device.setBackupKeyMode(1);
  }

  return {
    loadedCount: assignments.length,
    usedSelection: bundle.requiresSelection,
  };
}

export function isSelectionRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message === 'KEY_SELECTION_REQUIRED';
}

export type { KeyCandidate };