import React from 'react';
import { Tooltip } from './Tooltip';

interface HelpTipProps {
  tooltip: string;
  href?: string;
}

/** Compact help trigger — portaled tooltip clamped to the main app panel. */
export const HelpTip: React.FC<HelpTipProps> = ({ tooltip, href }) => {
  const icon = (
    <span className="help-tip-icon" aria-hidden>
      ?
    </span>
  );

  if (href) {
    return (
      <Tooltip text={tooltip}>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="help-tip-link"
          aria-label="Help"
          onClick={(e) => e.stopPropagation()}
        >
          {icon}
        </a>
      </Tooltip>
    );
  }

  return (
    <Tooltip text={tooltip}>
      <span className="help-tip-link" role="img" aria-label="Help">
        {icon}
      </span>
    </Tooltip>
  );
};

export default HelpTip;