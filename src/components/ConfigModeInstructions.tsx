import React from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { DeviceType } from '../api/device/types';
import { CriticalText } from './ui/forms';

const ConfigModeInstructions: React.FC = () => {
  const { deviceType } = useDeviceStore();
  const isDuo = deviceType === DeviceType.DUO;

  return (
    <>
      <CriticalText>Before loading a key, you must first put your OnlyKey into config mode.</CriticalText>
      <p>
        To do this{' '}
        {isDuo ? (
          <>hold down button #1 on your OnlyKey DUO for 10+ seconds and release.</>
        ) : (
          <>hold down button #6 on your OnlyKey for 5+ seconds and release.</>
        )}{' '}
        The light will turn off.
        {isDuo && <> If a PIN was previously set, re-enter the PIN to enter config mode.</>}
        {' '}You will notice the OnlyKey flashes red in config mode.
      </p>
    </>
  );
};

export default ConfigModeInstructions;