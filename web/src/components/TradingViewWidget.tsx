import React, { useEffect, useId, useRef } from 'react';

interface TradingViewWidgetProps {
  symbol: string;
  timeframe: string;
  theme: 'light' | 'dark';
}

const TV_SYMBOL_MAP: Record<string, string> = {
  XAUUSD: 'OANDA:XAUUSD',
  PAXGUSDT: 'BINANCE:PAXGUSDT.P',
  NAS100: 'PEPPERSTONE:NAS100',
  SPX500: 'PEPPERSTONE:US500',
  BTCUSDT: 'BYBIT:BTCUSDT.P',
  ETHUSDT: 'BYBIT:ETHUSDT.P',
  SOLUSDT: 'BYBIT:SOLUSDT.P',
  XAGUSD: 'OANDA:XAGUSD',
  EURUSD: 'OANDA:EURUSD',
  DXY: 'TVC:DXY',
};

const TV_INTERVAL_MAP: Record<string, string> = {
  M1: '1',
  M5: '5',
  M15: '15',
  M45: '45',
  '1H': '60',
  '4H': '240',
  '1D': 'D',
  '1W': 'W',
  '1M': 'M',
};

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => void;
    };
  }
}

export const TradingViewWidget: React.FC<TradingViewWidgetProps> = ({ symbol, timeframe, theme }) => {
  const rawId = useId().replace(/:/g, '');
  const containerId = `tv_chart_${rawId}`;
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const mountWidget = () => {
      if (cancelled || !window.TradingView || !containerRef.current) return;
      containerRef.current.innerHTML = '';
      new window.TradingView.widget({
        autosize: true,
        symbol: TV_SYMBOL_MAP[symbol.toUpperCase()] || 'OANDA:XAUUSD',
        interval: TV_INTERVAL_MAP[timeframe] || '15',
        timezone: 'Etc/UTC',
        theme: theme === 'dark' ? 'dark' : 'light',
        style: '1',
        locale: 'en',
        backgroundColor: theme === 'dark' ? '#000000' : '#FFFFFF',
        gridColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(17,24,39,0.05)',
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        save_image: true,
        container_id: containerId,
      });
    };

    if (window.TradingView) {
      mountWidget();
    } else {
      const existing = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]');
      if (existing) {
        existing.addEventListener('load', mountWidget);
      } else {
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.onload = mountWidget;
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, theme, containerId]);

  return <div id={containerId} ref={containerRef} className="w-full h-full min-h-[22rem]" />;
};
