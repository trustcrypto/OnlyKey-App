import React from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { configModeHowToText } from '../data/configMode';

type ConfigModeInstructionsProps = {
  /** Optional lead-in rendered above the how-to paragraph. */
  leadIn?: React.ReactNode;
  /** Render only the capitalized how-to sentence, for embedding in an existing paragraph. */
  inline?: boolean;
};

const ConfigModeInstructions: React.FC<ConfigModeInstructionsProps> = ({ leadIn, inline = false }) => {
  const { deviceType } = useDeviceStore();

  if (inline) {
    return <>{configModeHowToText(deviceType)}</>;
  }

  return (
    <>
      {leadIn}
      <p>To do this {configModeHowToText(deviceType, { capitalize: false })}</p>
    </>
  );
};

export default ConfigModeInstructions;
