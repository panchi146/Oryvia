import React from 'react';

interface AudioOutputIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Audio Output Route Selector Icon.
 * Distinct upward-pointing route indicator with radiating concentric audio arcs.
 * Clearly differentiates from the horizontal speaker/volume horn icon.
 */
export function AudioOutputIcon({ size = 24, className, style }: AudioOutputIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {/* Outer audio broadcast arc */}
      <path
        d="M 4 8.3 A 11.3 11.3 0 0 1 20 8.3"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      {/* Inner audio broadcast arc */}
      <path
        d="M 7.8 12.1 A 6 6 0 0 1 16.2 12.1"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      {/* Route destination triangle pointer */}
      <path
        d="M 12 13.8 L 7.4 19.8 C 6.9 20.5 7.4 21.5 8.2 21.5 H 15.8 C 16.6 21.5 17.1 20.5 16.6 19.8 Z"
        fill="currentColor"
      />
    </svg>
  );
}
