import React from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { DeviceType } from '../api/device/types';

const ConfigModeNotice: React.FC = () => {
  const { deviceType } = useDeviceStore();
  const isDuo = deviceType === DeviceType.DUO;

  return (
    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-200/90">
      <p className="font-semibold text-amber-300 mb-2">Config mode required</p>
      <p className="text-gray-300 leading-relaxed">
        {isDuo ? (
          <>
            Hold button #1 on your OnlyKey DUO for 10+ seconds and release. The light will turn off.
            If a PIN was previously set, re-enter the PIN to enter config mode. The device flashes red in config mode.
          </>
        ) : (
          <>
            Hold button #6 on your OnlyKey for 5+ seconds and release. The light will turn off.
            The device flashes red in config mode.
          </>
        )}
      </p>
    </div>
  );
};

export default ConfigModeNotice;