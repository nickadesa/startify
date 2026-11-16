import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'outline';
}

export const Badge: React.FC<BadgeProps> = ({ className = '', variant = 'default', ...props }) => {
  const variants: Record<string, string> = {
    default: 'bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)]',
    success: 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30',
    danger: 'bg-rose-500/15 text-rose-500 border border-rose-500/30',
    warning: 'bg-amber-500/15 text-amber-500 border border-amber-500/30',
    outline: 'border border-[var(--border-subtle)] text-[var(--text-secondary)]',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap ${variants[variant]} ${className}`}
      {...props}
    />
  );
};
