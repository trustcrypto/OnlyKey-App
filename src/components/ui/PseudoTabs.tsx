import React from 'react';

export interface PseudoTab {
  id: string;
  label: React.ReactNode;
}

interface PseudoTabBarProps {
  tabs: PseudoTab[];
  active: string;
  onChange: (id: string) => void;
}

export const PseudoTabBar: React.FC<PseudoTabBarProps> = ({ tabs, active, onChange }) => (
  <div className="pseudo-tabs" role="tablist">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={active === tab.id}
        className={`pseudo-tab ${active === tab.id ? 'pseudo-tab--active' : ''}`}
        onClick={() => onChange(tab.id)}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

interface PseudoTabPanelProps {
  id: string;
  active: string;
  children: React.ReactNode;
}

export const PseudoTabPanel: React.FC<PseudoTabPanelProps> = ({ id, active, children }) => {
  if (active !== id) return null;
  return (
    <div role="tabpanel" className="pseudo-tab-panel">
      {children}
    </div>
  );
};