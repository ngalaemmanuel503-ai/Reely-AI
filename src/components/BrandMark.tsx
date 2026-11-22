import React from 'react';
import { t } from '../lib/i18n.ts';

export const BrandMark: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        width="30"
        height="30"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="36" height="36" rx="9" fill="#FF6A1A" />
        <rect
          x="8"
          y="6.5"
          width="20"
          height="23"
          rx="3.5"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          fill="#FFFFFF"
          fillOpacity="0.14"
        />
        <path
          d="M15.2 14.2C15.2 13.4 16.1 12.9 16.8 13.3L22.5 16.8C23.1 17.2 23.1 18.1 22.5 18.5L16.8 22C16.1 22.4 15.2 21.9 15.2 21.1V14.2Z"
          fill="#FFFFFF"
        />
      </svg>
      {!compact && (
        <span className="font-display text-lg font-bold tracking-tight text-[#1C1917]">
          {t('brand.name')}
        </span>
      )}
    </span>
  );
};
