import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'positive' | 'negative' | 'accent';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = '', variant = 'default', ...props }, ref) => {
    const variants: Record<NonNullable<BadgeProps['variant']>, string> = {
      default: 'bg-[#1C1C1E] text-[#F5F5F7] border border-white/[0.08]',
      secondary: 'bg-[#141417] text-[#A1A1AA] border border-white/[0.06]',
      outline: 'bg-transparent text-[#A1A1AA] border border-white/[0.1]',
      positive: 'bg-[#30D158]/12 text-[#30D158] border border-[#30D158]/20',
      negative: 'bg-[#FF453A]/12 text-[#FF453A] border border-[#FF453A]/20',
      accent: 'bg-[#00adff]/12 text-[#00adff] border border-[#00adff]/25',
    };

    return (
      <span
        ref={ref}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-[12px] font-medium tracking-[-0.005em] leading-[1.35] transition-colors ${variants[variant]} ${className}`}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';
