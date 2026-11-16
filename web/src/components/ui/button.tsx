import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'secondary', size = 'md', ...props }, ref) => {
    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
      primary:
        'bg-[#FFFFFF] text-[#000000] hover:bg-[#E4E4E7] border border-white font-semibold',
      secondary:
        'bg-[#0A0A0A] text-[#FFFFFF] hover:bg-[#18181B] border border-white/[0.18]',
      ghost:
        'bg-transparent text-[#A1A1AA] hover:text-[#FFFFFF] hover:bg-[#141414] border border-transparent',
    };

    const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
      sm: 'h-8 px-3 text-[12px] rounded-none',
      md: 'h-9 px-4 text-[13px] rounded-none',
    };

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 font-medium tracking-[0.01em] transition-colors duration-150 cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
