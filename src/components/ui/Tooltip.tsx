import React, { useCallback, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const APP_MAIN_SELECTOR = '#app-main';
const TOOLTIP_MAX_WIDTH = 288;
const GAP = 8;

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  className?: string;
}

function getBounds() {
  const main = document.querySelector(APP_MAIN_SELECTOR);
  if (main) return main.getBoundingClientRect();
  return { left: 8, top: 8, right: window.innerWidth - 8, bottom: window.innerHeight - 8, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children, className = '' }) => {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const bounds = getBounds();
    const centerX = rect.left + rect.width / 2;
    let left = centerX - TOOLTIP_MAX_WIDTH / 2;
    left = Math.max(bounds.left + 4, Math.min(left, bounds.right - TOOLTIP_MAX_WIDTH - 4));

    const estHeight = 80;
    let top = rect.bottom + GAP;
    if (top + estHeight > bounds.bottom) {
      top = rect.top - estHeight - GAP;
    }
    top = Math.max(bounds.top + 4, Math.min(top, bounds.bottom - estHeight - 4));

    setPos({ top, left });
  }, []);

  const show = () => {
    updatePosition();
    setVisible(true);
  };

  return (
    <span
      ref={triggerRef}
      className={`tooltip-trigger ${className}`.trim()}
      onMouseEnter={show}
      onMouseLeave={() => setVisible(false)}
      onFocus={show}
      onBlur={() => setVisible(false)}
      aria-describedby={visible ? id : undefined}
    >
      {children}
      {visible &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="ok-tooltip-popup"
            style={{ top: pos.top, left: pos.left, width: TOOLTIP_MAX_WIDTH }}
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
};

export default Tooltip;