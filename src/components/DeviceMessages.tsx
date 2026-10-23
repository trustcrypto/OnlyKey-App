import React, { useEffect, useRef, useState } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';

const MESSAGE_SLOTS = 5;

const DeviceMessages: React.FC = () => {
  const { recentMessages } = useDeviceStore();
  const [scrollOffset, setScrollOffset] = useState(0);
  const [hoveredMessage, setHoveredMessage] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(recentMessages.length);

  useEffect(() => {
    if (recentMessages.length > prevCountRef.current) {
      setScrollOffset(0);
    }
    prevCountRef.current = recentMessages.length;
  }, [recentMessages.length]);

  const visibleStart = scrollOffset;
  const visibleEnd = Math.min(scrollOffset + MESSAGE_SLOTS, recentMessages.length);
  const visibleMessages: (string | null)[] = [];
  for (let i = visibleStart; i < visibleEnd; i++) {
    visibleMessages.push(recentMessages[i] ?? null);
  }
  while (visibleMessages.length < MESSAGE_SLOTS) {
    visibleMessages.push(null);
  }

  const totalMessages = recentMessages.length;
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + MESSAGE_SLOTS < totalMessages;

  const scrollDown = () => {
    if (hasMoreAbove) {
      setScrollOffset((prev) => Math.max(prev - 1, 0));
    }
  };

  const scrollUp = () => {
    if (hasMoreBelow) {
      setScrollOffset((prev) => Math.min(prev + 1, Math.max(0, totalMessages - MESSAGE_SLOTS)));
    }
  };

  const handleWheel = (event: React.WheelEvent) => {
    if (event.deltaY < 0 && hasMoreBelow) {
      scrollUp();
    } else if (event.deltaY > 0 && hasMoreAbove) {
      scrollDown();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      scrollUp();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      scrollDown();
    }
  };

  const handleLineMouseEnter = (msg: string, event: React.MouseEvent) => {
    setHoveredMessage(msg);
    setHoverPos({ x: event.clientX, y: event.clientY });
  };

  const handleLineMouseMove = (event: React.MouseEvent) => {
    if (hoveredMessage) {
      setHoverPos({ x: event.clientX, y: event.clientY });
    }
  };

  const handleLineMouseLeave = () => {
    setHoveredMessage(null);
    setHoverPos(null);
  };

  return (
    <div className="device-messages">
      <div className="device-messages-label">Last messages</div>
      <div
        ref={terminalRef}
        className="device-messages-terminal"
        tabIndex={0}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onMouseLeave={handleLineMouseLeave}
      >
        {hasMoreAbove && (
          <button
            type="button"
            className="device-messages-nav device-messages-nav--top"
            onClick={scrollDown}
            aria-label="Show newer messages"
          >
            ▲
          </button>
        )}
        <div
          className="device-messages-content"
          style={{
            '--slot-count': MESSAGE_SLOTS,
          } as React.CSSProperties}
        >
          {visibleMessages.map((msg, i) => {
            const globalIndex = visibleStart + i;
            const isLatest = globalIndex === 0;
            const isEmpty = !msg;
            return (
              <div
                key={`msg-${globalIndex}`}
                className={`device-messages-line ${isLatest && msg ? 'device-messages-line--latest' : ''} ${isEmpty ? 'device-messages-line--empty' : ''}`}
                onMouseEnter={msg ? (e) => handleLineMouseEnter(msg, e) : undefined}
                onMouseMove={msg ? handleLineMouseMove : undefined}
                onMouseLeave={handleLineMouseLeave}
              >
                <span className="device-messages-prompt" aria-hidden>
                  ›
                </span>
                <span className="device-messages-text">{msg ?? '—'}</span>
              </div>
            );
          })}
        </div>
        {hasMoreBelow && (
          <button
            type="button"
            className="device-messages-nav device-messages-nav--bottom"
            onClick={scrollUp}
            aria-label="Show older messages"
          >
            ▼
          </button>
        )}
      </div>
      {hoveredMessage && hoverPos && (
        <div
          className="device-messages-hover-popup"
          style={{
            left: hoverPos.x + 12,
            top: hoverPos.y - 8,
          }}
        >
          {hoveredMessage}
        </div>
      )}
    </div>
  );
};

export default DeviceMessages;
