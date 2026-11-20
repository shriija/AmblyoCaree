import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: 'default' | 'success' | 'warning' | 'error';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  tone = 'default',
}) => {
  const valueToneClass =
    tone === 'success'
      ? 'text-[#238858]'
      : tone === 'warning'
        ? 'text-[#A87518]'
        : tone === 'error'
          ? 'text-[#C24550]'
          : 'text-[#25234A]';

  return (
    <div className="rounded-xl border border-[#E6E3FA] bg-white p-5">
      <p className="text-xs font-medium text-[#5C597E]">{label}</p>
      <p
        className={`mt-2 font-display text-2xl font-bold tracking-tight tabular-nums ${valueToneClass}`}
      >
        {value}
      </p>
      {subtext && <p className="mt-1.5 text-xs text-[#5C597E]">{subtext}</p>}
    </div>
  );
};
