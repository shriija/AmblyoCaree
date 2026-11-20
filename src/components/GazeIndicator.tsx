import React from 'react';

interface GazeIndicatorProps {
  x: number;
  y: number;
  visible: boolean;
  locked?: boolean;
  offScreen?: boolean;
  label?: string;
}

export const GazeIndicator: React.FC<GazeIndicatorProps> = ({
  x,
  y,
  visible,
  locked = false,
  offScreen = false,
  label,
}) => {
  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-30 will-change-transform"
      style={{
        transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`,
      }}
    >
      <div
        className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-colors duration-100 ${
          offScreen
            ? 'border-[#F2B84B] bg-[#F2B84B]/15 border-dashed opacity-75'
            : locked
              ? 'border-[#35B779] bg-[#35B779]/15'
              : 'border-[#6554E8] bg-[#6554E8]/12'
        }`}
      >
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            offScreen ? 'bg-[#F2B84B]' : locked ? 'bg-[#35B779]' : 'bg-[#6554E8]'
          }`}
        />
      </div>
      {label && (
        <span className="mt-1 block text-center font-mono text-[10px] font-medium text-[#25234A] bg-white/90 px-1.5 py-0.5 rounded border border-[#E6E3FA] whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  );
};
