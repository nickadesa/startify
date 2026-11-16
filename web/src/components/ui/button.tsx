import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'md', ...props }, ref) => {
    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
      default:
        'bg-[#F5F5F7] text-[#000000] hover:bg-white border border-transparent',
      primary:
        'bg-[#00adff] text-[#000000] hover:bg-[#33beff] border border-transparent',
      secondary:
        'bg-[#1C1C1E] text-[#F5F5F7] hover:bg-[#262629] border border-white/[0.08]',
      ghost:
        'bg-transparent text-[#A1A1AA] hover:text-[#F5F5F7] hover:bg-white/[0.05] border border-transparent',
      outline:
        'bg-transparent text-[#F5F5F7] hover:bg-white/[0.05] border border-white/[0.1]',
    };

    const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
      sm: 'h-8 px-3 text-[12px] rounded-lg gap-1.5',
      md: 'h-9 px-3.5 text-[13px] rounded-xl gap-2',
      lg: 'h-10 px-4 text-[14px] rounded-xl gap-2',
    };

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center font-medium tracking-[-0.005em] select-none cursor-pointer active:scale-[0.97] transition-[transform,background-color,border-color,color,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00adff]/50 disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
