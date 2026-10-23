import React from 'react';
import { useDeviceStore } from '../../store/useDeviceStore';
import { WorkingSpinner } from '../ui/WorkingSpinner';

/**
 * Full-screen busy overlay for long device ops (restore, slot save, wipe, …).
 * Uses a crisp animated SVG (OnlyKey-styled) instead of the old Pacman GIF.
 */
const WorkingDialog: React.FC = () => {
  const { isWorking, workingMessage, workingProgress } = useDeviceStore();

  if (!isWorking) return null;

  const pct = typeof workingProgress === 'number' ? workingProgress : null;

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      data-testid="working-dialog"
      role="alertdialog"
      aria-busy="true"
      aria-live="polite"
      aria-label={workingMessage}
    >
      <div className="bg-ok-gray rounded-2xl border border-white/10 shadow-2xl p-8 max-w-sm w-full text-center space-y-4">
        <WorkingSpinner size={128} className="mx-auto select-none" />
        <h3 className="text-lg font-bold">Working…</h3>
        <p className="text-gray-300 text-sm" data-testid="working-message">
          {workingMessage}
        </p>
        {pct !== null && (
          <div className="space-y-1.5">
            <div
              className="h-2.5 w-full rounded-full bg-black/40 overflow-hidden border border-white/10"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
              data-testid="working-progress"
            >
              <div
                className="h-full bg-ok-blue transition-[width] duration-150 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted tabular-nums">{Math.round(pct)}%</p>
          </div>
        )}
        <p className="text-amber-300/90 text-xs font-semibold">Do not remove your OnlyKey.</p>
      </div>
    </div>
  );
};

export default WorkingDialog;
