import React from 'react';
import { Info } from 'lucide-react';

interface DisclaimerBannerProps {
  compact?: boolean;
  className?: string;
}

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({
  compact = false,
  className = '',
}) => {
  return (
    <div
      role="note"
      className={`rounded-xl border border-[#E6E3FA] bg-white ${
        compact ? 'px-4 py-3 text-xs' : 'px-5 py-4 text-sm'
      } text-[#5C597E] flex items-start gap-3 ${className}`}
    >
      <Info className="w-4 h-4 text-[#6554E8] shrink-0 mt-0.5" aria-hidden="true" />
      <p className="leading-relaxed">
        <strong className="font-semibold text-[#25234A]">Educational & Visual-Training Support Notice:</strong>{' '}
        AmblyoCare is an educational and visual-training support platform. Standard webcam landmark
        estimation is not clinical-grade eye tracking and does not replace professional diagnosis,
        medical advice, or prescribed amblyopia treatment from an ophthalmologist or optometrist.
      </p>
    </div>
  );
};
