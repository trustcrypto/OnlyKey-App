import React from 'react';
import { useDeviceStore } from '../store/useDeviceStore';

const MESSAGE_SLOTS = 5;

const DeviceMessages: React.FC = () => {
  const { recentMessages } = useDeviceStore();
  const slots = Array.from({ length: MESSAGE_SLOTS }, (_, i) => recentMessages[i] ?? null);

  return (
    <div className="device-messages">
      <div className="device-messages-label">Last 5 messages</div>
      <div className="device-messages-terminal" title={recentMessages.join('\n')}>
        {slots.map((msg, i) => (
          <div
            key={`msg-${i}`}
            className={`device-messages-line ${i === 0 && msg ? 'device-messages-line--latest' : ''} ${!msg ? 'device-messages-line--empty' : ''}`}
          >
            <span className="device-messages-prompt" aria-hidden>
              ›
            </span>
            <span className="device-messages-text">{msg ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DeviceMessages;