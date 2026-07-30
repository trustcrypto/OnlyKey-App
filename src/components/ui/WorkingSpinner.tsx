import React from 'react';

/**
 * Crisp vector busy indicator for long device ops (restore, slot save, etc.).
 * Replaces the low-res Pacman GIF with an OnlyKey-styled key + orbital arc.
 */
export const WorkingSpinner: React.FC<{ size?: number; className?: string }> = ({
  size = 120,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role="img"
    aria-hidden="true"
    data-testid="working-spinner"
  >
    <defs>
      <linearGradient id="ok-spin-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3d8fd1" />
        <stop offset="50%" stopColor="#0056b3" />
        <stop offset="100%" stopColor="#003d80" />
      </linearGradient>
      <linearGradient id="ok-key-grad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#6eb6f0" />
        <stop offset="100%" stopColor="#0056b3" />
      </linearGradient>
      <filter id="ok-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    {/* Soft track */}
    <circle cx="60" cy="60" r="46" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />

    {/* Rotating arc */}
    <g filter="url(#ok-glow)">
      <circle
        cx="60"
        cy="60"
        r="46"
        stroke="url(#ok-spin-grad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="72 220"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 60 60"
          to="360 60 60"
          dur="1.15s"
          repeatCount="indefinite"
        />
      </circle>
      {/* Secondary dashed orbit (counter-ish feel via longer period) */}
      <circle
        cx="60"
        cy="60"
        r="36"
        stroke="rgba(61, 143, 209, 0.45)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="18 28"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="360 60 60"
          to="0 60 60"
          dur="2.4s"
          repeatCount="indefinite"
        />
      </circle>
    </g>

    {/* Center “key head + shaft” mark */}
    <g transform="translate(60 60)">
      {/* subtle pulse */}
      <circle r="22" fill="rgba(0, 86, 179, 0.18)">
        <animate attributeName="r" values="20;23;20" dur="1.6s" repeatCount="indefinite" />
        <animate
          attributeName="opacity"
          values="0.55;0.9;0.55"
          dur="1.6s"
          repeatCount="indefinite"
        />
      </circle>

      {/* key head (circle) */}
      <circle cx="-8" cy="0" r="9" fill="url(#ok-key-grad)" />
      <circle cx="-8" cy="0" r="3.5" fill="#1a1a1a" />

      {/* key shaft */}
      <rect x="-1" y="-3" width="22" height="6" rx="2" fill="url(#ok-key-grad)" />
      {/* teeth */}
      <rect x="10" y="3" width="3.5" height="5" rx="1" fill="#3d8fd1" />
      <rect x="16" y="3" width="3.5" height="7" rx="1" fill="#3d8fd1" />
    </g>
  </svg>
);

export default WorkingSpinner;
