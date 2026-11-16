import React from 'react';

interface AssetIconProps {
  symbol: string;
  size?: number;
  className?: string;
}

export const AssetIcon: React.FC<AssetIconProps> = ({ symbol, size = 22, className = '' }) => {
  const sym = symbol.toUpperCase();

  if (sym === 'XAUUSD' || sym === 'PAXGUSDT') {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 border border-white/[0.18] bg-[#141416] text-[#F59E0B] ${className}`}
        style={{ width: size, height: size }}
        title={sym}
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <polygon points="6,17 9,9 15,9 18,17" fill="currentColor" fillOpacity="0.22" />
          <line x1="8" y1="13" x2="16" y2="13" />
        </svg>
      </span>
    );
  }

  if (sym === 'NAS100' || sym === 'NASDAQ') {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 border border-white/[0.18] bg-[#141416] text-[#38BDF8] font-bold ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)) }}
        title="NASDAQ 100"
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.1">
          <path d="M5 18V6l6 12V6" />
          <path d="M15 18l4-12" />
        </svg>
      </span>
    );
  }

  if (sym === 'SPX500') {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 border border-white/[0.18] bg-[#141416] text-[#EF4444] font-bold ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.36)) }}
        title="S&P 500"
      >
        500
      </span>
    );
  }

  if (sym === 'BTCUSDT') {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 border border-white/[0.18] bg-[#141416] text-[#F7931A] font-bold ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.48)) }}
        title="Bitcoin"
      >
        ₿
      </span>
    );
  }

  if (sym === 'ETHUSDT') {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 border border-white/[0.18] bg-[#141416] text-[#A78BFA] ${className}`}
        style={{ width: size, height: size }}
        title="Ethereum"
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
          <polygon points="12,3 6,12 12,15 18,12" opacity="0.85" />
          <polygon points="12,21 6,13.5 12,16.5 18,13.5" opacity="0.55" />
        </svg>
      </span>
    );
  }

  if (sym === 'SOLUSDT') {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 border border-white/[0.18] bg-[#141416] text-[#14F195] ${className}`}
        style={{ width: size, height: size }}
        title="Solana"
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="6" y1="7" x2="18" y2="7" />
          <line x1="6" y1="12" x2="18" y2="12" />
          <line x1="6" y1="17" x2="18" y2="17" />
        </svg>
      </span>
    );
  }

  if (sym === 'XAGUSD') {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 border border-white/[0.18] bg-[#141416] text-[#D4D4D8] font-semibold ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.36)) }}
        title="Silver"
      >
        Ag
      </span>
    );
  }

  if (sym === 'EURUSD') {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 border border-white/[0.18] bg-[#141416] text-[#60A5FA] font-bold ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.48)) }}
        title="EUR / USD"
      >
        €
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 border border-white/[0.18] bg-[#141416] text-[#30D158] font-bold ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)) }}
      title={sym}
    >
      $
    </span>
  );
};
