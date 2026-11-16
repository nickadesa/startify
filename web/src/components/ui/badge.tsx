import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'positive' | 'negative' | 'accent';
}

export const Badge: React.FC<BadgeProps> = ({
  className = '',
  variant = 'default',
  ...props
}) => {
  const variants: Record<NonNullable<BadgeProps['variant']>, string> = {
    default: 'bg-[#141414] text-[#D4D4D8] border-white/[0.14]',
    secondary: 'bg-[#0A0A0A] text-[#A1A1AA] border-white/[0.12]',
    positive: 'bg-[#30D158]/10 text-[#30D158] border-[#30D158]/30',
    negative: 'bg-[#FF453A]/10 text-[#FF453A] border-[#FF453A]/30',
    accent: 'bg-[#141414] text-[#FFFFFF] border-white/[0.28]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-none border px-2 py-0.5 text-[11px] font-medium tracking-[0.02em] ${variants[variant]} ${className}`}
      {...props}
    />
  );
};
