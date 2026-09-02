import React from 'react';
import { useDeviceStore } from '../../store/useDeviceStore';
import { connectedDeviceLabel } from '../../data/deviceProduct';

const APP_VERSION = '5.7.0';

const AppFooter: React.FC = () => {
  const {
    recentMessages,
    isConnected,
    deviceType,
    deviceTypeSource,
    usbProductId,
    maxLabelSlot,
    lastStatusText,
    version,
  } = useDeviceStore();
  const latest = recentMessages[0] ?? '';
  const older = recentMessages.slice(1, 3);
  const pidHex =
    usbProductId != null ? `0x${usbProductId.toString(16).toUpperCase()}` : '—';

  const deviceLabel = !isConnected ? '' : connectedDeviceLabel(deviceType, version);

  return (
    <footer className="app-footer shrink-0">
      <div className="app-footer-messages">
        <div>
          Last message received: <span>{latest || '—'}</span>
        </div>
        <ul>
          {older.map((msg, i) => (
            <li key={`${i}-${msg.slice(0, 20)}`}>{msg}</li>
          ))}
          {older.length < 2 && <li>&nbsp;</li>}
          {older.length < 1 && <li>&nbsp;</li>}
        </ul>
      </div>
      <div className="app-footer-versions">
        <div>App v{APP_VERSION}</div>
        {deviceLabel && <div>{deviceLabel}</div>}
        {isConnected && (
          <div className="app-footer-diagnostics" title="Device type detection details">
            PID {pidHex}
            {deviceTypeSource ? ` · type via ${deviceTypeSource}` : ''}
            {maxLabelSlot > 0 ? ` · max slot ${maxLabelSlot}` : ''}
            {lastStatusText ? ` · status ${lastStatusText}` : ''}
          </div>
        )}
      </div>
    </footer>
  );
};

export default AppFooter;