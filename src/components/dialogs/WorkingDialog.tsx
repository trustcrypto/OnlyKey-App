import React from 'react';
import { useDeviceStore } from '../../store/useDeviceStore';

const WorkingDialog: React.FC = () => {
  const { isWorking, workingMessage } = useDeviceStore();

  if (!isWorking) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-ok-gray rounded-2xl border border-white/10 shadow-2xl p-8 max-w-sm w-full text-center space-y-4">
        <div className="w-12 h-12 mx-auto border-4 border-ok-blue border-t-transparent rounded-full animate-spin" />
        <h3 className="text-lg font-bold">Working…</h3>
        <p className="text-gray-400 text-sm">{workingMessage}</p>
        <p className="text-amber-300/90 text-xs font-semibold">Do not remove your OnlyKey.</p>
      </div>
    </div>
  );
};

export default WorkingDialog;