import React from 'react';

interface BrandLogoProps {
  compact?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ compact = false, className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="28" height="28" rx="8" fill="#6554E8" />
        <path
          d="M5.5 14C7.7 10.3 10.7 8.5 14 8.5C17.3 8.5 20.3 10.3 22.5 14C20.3 17.7 17.3 19.5 14 19.5C10.7 19.5 7.7 17.7 5.5 14Z"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="14" cy="14" r="3.2" fill="#A99BF7" />
        <circle cx="14" cy="14" r="1.4" fill="#FFFFFF" />
      </svg>
      {!compact && (
        <span className="font-display text-lg font-bold tracking-tight text-[#25234A]">
          AmblyoCare
        </span>
      )}
    </span>
  );
};
