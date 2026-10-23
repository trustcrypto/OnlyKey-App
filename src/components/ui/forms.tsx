import React from 'react';

/** Action buttons — fire device commands; result appears in device messages. */
export const SetButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <button
    type="button"
    className={`px-4 py-2 bg-ok-blue hover:bg-blue-600 text-on-blue rounded-lg text-sm font-semibold disabled:opacity-50 disabled:hover:bg-ok-blue disabled:cursor-not-allowed transition-colors ${className}`}
    {...props}
  >
    {children}
  </button>
);

export const CautionButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <button
    type="button"
    className={`px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors ${className}`}
    {...props}
  >
    {children}
  </button>
);

export const PrefBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-ok-gray/60 border border-white/5 rounded-xl p-3 mb-3 text-sm leading-relaxed space-y-2">
    {children}
  </div>
);

export const ConfigRequired: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="font-bold">
    {children}
    <span className="text-red-400"> *</span>
  </span>
);

export const PrefHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="block text-muted text-xs mt-1">{children}</span>
);

export const PrefWarning: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="block text-amber-300 font-semibold text-xs mt-1">{children}</span>
);

export const CriticalText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-red-400 font-semibold text-sm">{children}</p>
);

export const TwoColPanel: React.FC<{ left: React.ReactNode; right: React.ReactNode }> = ({ left, right }) => (
  <div className="content-two-col">
    <div>{left}</div>
    <div>{right}</div>
  </div>
);

export const StepFieldset: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <fieldset className="border border-white/10 rounded-xl p-6 text-[0.9375rem] leading-relaxed space-y-4 bg-black/20">
    {children}
  </fieldset>
);