import React from 'react';

interface AssetIconProps {
  symbol: string;
  size?: number;
  className?: string;
}

export const AssetIcon: React.FC<AssetIconProps> = ({ symbol, size = 24, className = '' }) => {
  const s = symbol.toUpperCase();

  const wrapStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
  };

  if (s === 'XAUUSD' || s === 'PAXGUSDT') {
    return (
      <span
        style={wrapStyle}
        className={`inline-flex items-center justify-center rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-500 shrink-0 ${className}`}
      >
        <svg viewBox="0 0 24 24" className="w-[62%] h-[62%]" fill="none" stroke="currentColor" strokeWidth="1.9">
          <polygon points="7,7 17,7 20,17 4,17" fill="currentColor" fillOpacity="0.22" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      </span>
    );
  }

  if (s === 'NAS100' || s === 'NASDAQ') {
    return (
      <span
        style={wrapStyle}
        className={`inline-flex items-center justify-center rounded-full bg-sky-500/15 border border-sky-500/40 text-sky-500 font-bold shrink-0 ${className}`}
      >
        <svg viewBox="0 0 24 24" className="w-[62%] h-[62%]" fill="none" stroke="currentColor" strokeWidth="2.1">
          <path d="M4 18V6l8 12V6" />
          <path d="M16 18l4-12" />
        </svg>
      </span>
    );
  }

  if (s === 'SPX500') {
    return (
      <span
        style={wrapStyle}
        className={`inline-flex items-center justify-center rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-500 font-bold text-[0.5625rem] tracking-tighter shrink-0 ${className}`}
      >
        500
      </span>
    );
  }

  if (s === 'BTCUSDT') {
    return (
      <span
        style={wrapStyle}
        className={`inline-flex items-center justify-center rounded-full bg-orange-500/15 border border-orange-500/40 text-orange-500 font-bold text-[0.75rem] shrink-0 ${className}`}
      >
        ₿
      </span>
    );
  }

  if (s === 'ETHUSDT') {
    return (
      <span
        style={wrapStyle}
        className={`inline-flex items-center justify-center rounded-full bg-indigo-500/15 border border-indigo-500/40 text-indigo-500 shrink-0 ${className}`}
      >
        <svg viewBox="0 0 24 24" className="w-[58%] h-[58%]" fill="currentColor">
          <polygon points="12,3 6,12 12,15.5 18,12" fillOpacity="0.85" />
          <polygon points="12,17 6,13.5 12,21 18,13.5" fillOpacity="0.5" />
        </svg>
      </span>
    );
  }

  if (s === 'SOLUSDT') {
    return (
      <span
        style={wrapStyle}
        className={`inline-flex items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-500 shrink-0 ${className}`}
      >
        <svg viewBox="0 0 24 24" className="w-[62%] h-[62%]" fill="none" stroke="currentColor" strokeWidth="2.1">
          <line x1="5" y1="7" x2="19" y2="7" />
          <line x1="7" y1="12" x2="17" y2="12" />
          <line x1="5" y1="17" x2="19" y2="17" />
        </svg>
      </span>
    );
  }

  if (s === 'XAGUSD') {
    return (
      <span
        style={wrapStyle}
        className={`inline-flex items-center justify-center rounded-full bg-slate-400/15 border border-slate-400/40 text-slate-400 font-bold text-[0.625rem] shrink-0 ${className}`}
      >
        Ag
      </span>
    );
  }

  if (s === 'EURUSD') {
    return (
      <span
        style={wrapStyle}
        className={`inline-flex items-center justify-center rounded-full bg-blue-500/15 border border-blue-500/40 text-blue-500 font-bold text-[0.75rem] shrink-0 ${className}`}
      >
        €
      </span>
    );
  }

  if (s === 'DXY') {
    return (
      <span
        style={wrapStyle}
        className={`inline-flex items-center justify-center rounded-full bg-teal-500/15 border border-teal-500/40 text-teal-500 font-bold text-[0.75rem] shrink-0 ${className}`}
      >
        $
      </span>
    );
  }

  return (
    <span
      style={wrapStyle}
      className={`inline-flex items-center justify-center rounded-full bg-zinc-500/15 border border-zinc-500/40 text-zinc-400 font-bold text-[0.625rem] shrink-0 ${className}`}
    >
      {s.slice(0, 2)}
    </span>
  );
};
