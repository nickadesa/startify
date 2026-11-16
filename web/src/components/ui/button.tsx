import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'buy' | 'sell';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'md', ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center font-medium transition-colors rounded-lg whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
    const variants: Record<string, string> = {
      default: 'bg-[var(--text-primary)] text-[var(--bg-card)] hover:opacity-90',
      outline: 'border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]',
      ghost: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]',
      buy: 'bg-emerald-500 text-white hover:bg-emerald-600',
      sell: 'bg-rose-500 text-white hover:bg-rose-600',
    };
    const sizes: Record<string, string> = {
      sm: 'px-2.5 py-1.5 text-[0.75rem]',
      md: 'px-3.5 py-2 text-[0.8125rem]',
      lg: 'px-4 py-2.5 text-[0.875rem]',
    };
    return <button ref={ref} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
  }
);
Button.displayName = 'Button';
