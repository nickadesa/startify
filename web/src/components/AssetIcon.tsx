import React, { useState } from 'react';

interface AssetIconProps {
  symbol: string;
  size?: number;
  className?: string;
}

const REAL_ICON_URLS: Record<string, string> = {
  XAUUSD: 'https://s3-symbol-logo.tradingview.com/metal/gold--big.svg',
  PAXGUSDT: 'https://s3-symbol-logo.tradingview.com/metal/gold--big.svg',
  XAGUSD: 'https://s3-symbol-logo.tradingview.com/metal/silver--big.svg',
  NAS100: 'https://s3-symbol-logo.tradingview.com/indices/nasdaq-100--big.svg',
  NASDAQ: 'https://s3-symbol-logo.tradingview.com/indices/nasdaq-100--big.svg',
  SPX500: 'https://s3-symbol-logo.tradingview.com/indices/s-and-p-500--big.svg',
  BTCUSDT: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC--big.svg',
  ETHUSDT: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCETH--big.svg',
  SOLUSDT: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCSOL--big.svg',
  EURUSD: 'https://s3-symbol-logo.tradingview.com/country/EU--big.svg',
  DXY: 'https://s3-symbol-logo.tradingview.com/country/US--big.svg',
};

export const AssetIcon: React.FC<AssetIconProps> = ({ symbol, size = 24, className = '' }) => {
  const s = symbol.toUpperCase();
  const [imgError, setImgError] = useState(false);
  const src = REAL_ICON_URLS[s];

  const wrapStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
  };

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={s}
        width={size}
        height={size}
        style={wrapStyle}
        onError={() => setImgError(true)}
        className={`rounded-full object-cover shrink-0 border border-[var(--border-subtle)] ${className}`}
      />
    );
  }

  return (
    <span
      style={wrapStyle}
      className={`inline-flex items-center justify-center rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold text-[0.625rem] shrink-0 ${className}`}
    >
      {s.slice(0, 2)}
    </span>
  );
};
