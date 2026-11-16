import * as React from 'react';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`rounded-none bg-[#0A0A0A] border border-white/[0.12] ${className}`}
      {...props}
    />
  )
);
Card.displayName = 'Card';
