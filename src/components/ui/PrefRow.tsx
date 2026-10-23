import React from 'react';
import { HelpTip } from './HelpTip';

interface PrefRowProps {
  title: React.ReactNode;
  tooltip?: { href?: string; text: string };
  description?: React.ReactNode;
  hint?: React.ReactNode;
  warning?: React.ReactNode;
  children: React.ReactNode;
}

/** One preferences setting — label, optional copy, controls, hint. */
export const PrefRow: React.FC<PrefRowProps> = ({
  title,
  tooltip,
  description,
  hint,
  warning,
  children,
}) => (
  <section className="pref-row">
    <h3 className="pref-row-title">
      <span className="pref-row-title-text">{title}</span>
      {tooltip && <HelpTip href={tooltip.href} tooltip={tooltip.text} />}
    </h3>
    {description && <p className="pref-row-desc">{description}</p>}
    <div className="pref-row-actions">{children}</div>
    {hint && <p className="pref-row-hint">{hint}</p>}
    {warning && <p className="pref-row-warning">{warning}</p>}
  </section>
);

export default PrefRow;