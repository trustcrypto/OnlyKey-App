import React, { useEffect, useState } from 'react';
import { KeyCandidate } from '../../services/keyImport/types';
import { KEY_SLOTS } from '../../api/device/keyParser';

interface PrivateKeySelectDialogProps {
  open: boolean;
  candidates: KeyCandidate[];
  onClose: () => void;
  onConfirm: (candidateId: string, slot: number) => void;
}

const SLOT_OPTIONS = [
  ...KEY_SLOTS.rsa.map((s) => ({ value: s, label: `RSA ${s}` })),
  ...KEY_SLOTS.ecc.map((s) => ({ value: s, label: `ECC ${s}` })),
];

const PrivateKeySelectDialog: React.FC<PrivateKeySelectDialogProps> = ({
  open,
  candidates,
  onClose,
  onConfirm,
}) => {
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? '');
  const [slot, setSlot] = useState(SLOT_OPTIONS[0]?.value ?? 1);

  useEffect(() => {
    if (!open || !candidates.length) return;
    const first = candidates[0];
    setSelectedId(first.id);
    setSlot(first.kind === 'ecc' ? KEY_SLOTS.ecc[0] : KEY_SLOTS.rsa[0]);
  }, [open, candidates]);

  const selected = candidates.find((c) => c.id === selectedId);

  if (!open || !candidates.length) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-ok-gray w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5">
          <h3 className="text-xl font-bold">Select Private Key</h3>
          <p className="text-gray-400 text-sm mt-1">Multiple keys were found. Choose which key to load and the target slot.</p>
        </div>

        <div className="p-6 space-y-4 max-h-[50vh] overflow-y-auto">
          {candidates.map((candidate) => (
            <label key={candidate.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/10 hover:bg-white/5 cursor-pointer">
              <input
                type="radio"
                name="keyCandidate"
                checked={selectedId === candidate.id}
                onChange={() => {
                  setSelectedId(candidate.id);
                  setSlot(candidate.kind === 'ecc' ? KEY_SLOTS.ecc[0] : KEY_SLOTS.rsa[0]);
                }}
                className="accent-ok-blue"
              />
              <div>
                <p className="font-semibold">{candidate.name}</p>
                <p className="text-xs text-gray-500 font-mono">type {candidate.type} · {candidate.keyData.length} bytes</p>
              </div>
            </label>
          ))}

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Target slot</label>
            <select
              value={slot}
              onChange={(e) => setSlot(parseInt(e.target.value, 10))}
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2"
            >
              {SLOT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-6 border-t border-white/5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10">Cancel</button>
          <button
            onClick={() => selected && onConfirm(selected.id, slot)}
            disabled={!selected}
            className="px-4 py-2 rounded-lg bg-ok-blue hover:bg-blue-600 font-bold disabled:opacity-50"
          >
            Load Key
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivateKeySelectDialog;