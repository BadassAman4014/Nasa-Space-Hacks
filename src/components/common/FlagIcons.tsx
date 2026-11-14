import React from 'react';

/**
 * Open-source SVG Flag Icons (MIT License / Public Domain)
 * Provides crisp, pixel-perfect, cross-platform flag rendering without OS emoji font limitations.
 */

interface FlagProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const UKFlag: React.FC<FlagProps> = ({ className = '', size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-4 h-3',
    md: 'w-5 h-3.5',
    lg: 'w-6 h-4.5',
  }[size];

  return (
    <svg
      className={`${sizeClasses} ${className} rounded-[3px] shadow-[0_1px_2px_rgba(0,0,0,0.15)] shrink-0`}
      viewBox="0 0 640 480"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="United Kingdom Flag"
    >
      <path fill="#012169" d="M0 0h640v480H0z" />
      <path
        fill="#FFF"
        d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0h75z"
      />
      <path
        fill="#C8102E"
        d="m424 281 216 159v40h-40L384 311l40-30zm63-184L640 18v-18h-25L425 147l62-50zM0 480l161-120h42L0 480zm0-462 201 149h-41L0 18z"
      />
      <path fill="#FFF" d="M241 0v480h160V0H241zM0 160v160h640V160H0z" />
      <path fill="#C8102E" d="M267 0v480h106V0H267zM0 187v106h640V187H0z" />
    </svg>
  );
};

export const GermanFlag: React.FC<FlagProps> = ({ className = '', size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-4 h-3',
    md: 'w-5 h-3.5',
    lg: 'w-6 h-4.5',
  }[size];

  return (
    <svg
      className={`${sizeClasses} ${className} rounded-[3px] shadow-[0_1px_2px_rgba(0,0,0,0.15)] shrink-0`}
      viewBox="0 0 640 480"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="German Flag"
    >
      <path fill="#ffce00" d="M0 320h640v160H0z" />
      <path fill="#000" d="M0 0h640v160H0z" />
      <path fill="#d00" d="M0 160h640v160H0z" />
    </svg>
  );
};
