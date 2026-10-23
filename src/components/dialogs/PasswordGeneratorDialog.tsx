import React, { useState } from 'react';
import {
  DEFAULT_PASSWORD_OPTIONS,
  generatePassword,
  PasswordGeneratorOptions,
} from '../../utils/passwordGenerator';

interface PasswordGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (password: string) => void;
}

const PasswordGeneratorDialog: React.FC<PasswordGeneratorDialogProps> = ({ open, onClose, onApply }) => {
  const [options, setOptions] = useState<PasswordGeneratorOptions>(DEFAULT_PASSWORD_OPTIONS);
  const [generated, setGenerated] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const toggle = (key: keyof PasswordGeneratorOptions) => {
    if (key === 'length' || key === 'omit') return;
    setOptions((o) => ({ ...o, [key]: !o[key] }));
  };

  const handleGenerate = () => {
    setError(null);
    try {
      setGenerated(generatePassword(options));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleApply = () => {
    if (!generated) {
      handleGenerate();
      return;
    }
    onApply(generated);
    setGenerated('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-ok-gray w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-xl font-bold">Password Generator</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/5 text-gray-400">✕</button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-400 shrink-0">Length (6–56)</label>
            <input
              type="number"
              min={6}
              max={56}
              value={options.length}
              onChange={(e) => setOptions((o) => ({ ...o, length: parseInt(e.target.value, 10) || 6 }))}
              className="w-20 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-center"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            {([
              ['upper', 'Uppercase'],
              ['lower', 'Lowercase'],
              ['digits', 'Digits'],
              ['special', 'Special'],
              ['punct', 'Punctuation'],
              ['braces', 'Braces'],
              ['space', 'Space'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer text-gray-300">
                <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} className="accent-ok-blue" />
                {label}
              </label>
            ))}
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Omit characters</label>
            <input
              value={options.omit}
              onChange={(e) => setOptions((o) => ({ ...o, omit: e.target.value }))}
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm"
              placeholder="e.g. 0O1lI"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Generated password</label>
            <input
              readOnly
              value={generated}
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm"
              placeholder="Click Generate"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="p-6 border-t border-white/5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10">Cancel</button>
          <button onClick={handleGenerate} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 font-semibold">Generate</button>
          <button onClick={handleApply} className="px-4 py-2 rounded-lg bg-ok-blue hover:bg-blue-600 font-bold">Use Password</button>
        </div>
      </div>
    </div>
  );
};

export default PasswordGeneratorDialog;