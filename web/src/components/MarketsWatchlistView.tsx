import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Search, Star } from 'lucide-react';
import { AssetIcon } from './AssetIcon';

export interface MarketOverviewItem {
  symbol: string;
  name: string;
  category: string;
  leverage: string;
  price: number;
  change_24h_pct: number;
  funding_rate: number;
  open_interest: string;
  volume_24h: string;
}

interface MarketsWatchlistViewProps {
  markets: MarketOverviewItem[];
  onSelectSymbol: (symbol: string) => void;
}

const DEFAULT_MARKETS: MarketOverviewItem[] = [
  { symbol: 'XAUUSD', name: 'Gold Spot', category: 'Commodities', leverage: '25x', price: 3874.5, change_24h_pct: -0.76, funding_rate: -0.0003, open_interest: '$12.36M', volume_24h: '$317.18M' },
  { symbol: 'NAS100', name: 'NASDAQ 100', category: 'Indices', leverage: '50x', price: 21704.25, change_24h_pct: -1.85, funding_rate: 0.0001, open_interest: '$84.45M', volume_24h: '$6.64B' },
  { symbol: 'SPX500', name: 'S&P 500', category: 'Indices', leverage: '75x', price: 6046.38, change_24h_pct: -0.85, funding_rate: -0.0001, open_interest: '$5.61M', volume_24h: '$282.44M' },
  { symbol: 'BTCUSDT', name: 'Bitcoin', category: 'Crypto', leverage: '50x', price: 91354.0, change_24h_pct: -1.45, funding_rate: 0.0006, open_interest: '$10.38M', volume_24h: '$1.64B' },
  { symbol: 'ETHUSDT', name: 'Ethereum', category: 'Crypto', leverage: '50x', price: 3104.16, change_24h_pct: -1.71, funding_rate: 0.0012, open_interest: '$4.22M', volume_24h: '$187.77M' },
  { symbol: 'SOLUSDT', name: 'Solana', category: 'Crypto', leverage: '20x', price: 211.24, change_24h_pct: -2.06, funding_rate: -0.0009, open_interest: '$5.53M', volume_24h: '$23.01M' },
  { symbol: 'PAXGUSDT', name: 'Gold Perp', category: 'Commodities', leverage: '25x', price: 3876.4, change_24h_pct: -0.72, funding_rate: 0.0012, open_interest: '$28.45M', volume_24h: '$142.80M' },
  { symbol: 'XAGUSD', name: 'Silver Spot', category: 'Commodities', leverage: '25x', price: 31.42, change_24h_pct: -2.77, funding_rate: 0.0, open_interest: '$165.49K', volume_24h: '$12.74M' },
  { symbol: 'EURUSD', name: 'Euro / USD', category: 'Forex', leverage: '100x', price: 1.0542, change_24h_pct: -0.16, funding_rate: -0.0001, open_interest: '$1.17M', volume_24h: '$8.37M' },
  { symbol: 'DXY', name: 'US Dollar Index', category: 'Forex', leverage: '50x', price: 106.68, change_24h_pct: 0.34, funding_rate: 0.0, open_interest: '$3.20M', volume_24h: '$44.10M' },
];

const CATEGORIES = ['All', 'Favorites', 'Indices', 'Commodities', 'Crypto', 'Forex'];

export const MarketsWatchlistView: React.FC<MarketsWatchlistViewProps> = ({ markets, onSelectSymbol }) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [favorites, setFavorites] = useState<string[]>(['XAUUSD', 'NAS100', 'BTCUSDT']);

  const effectiveMarkets = markets && markets.length > 0 ? markets : DEFAULT_MARKETS;

  const filtered = useMemo(() => {
    return effectiveMarkets.filter((m) => {
      if (category === 'Favorites' && !favorites.includes(m.symbol)) return false;
      if (category !== 'All' && category !== 'Favorites' && m.category !== category) return false;
      if (search && !m.symbol.toLowerCase().includes(search.toLowerCase()) && !m.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [effectiveMarkets, category, search, favorites]);

  const toggleFav = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => (prev.includes(sym) ? prev.filter((x) => x !== sym) : [...prev, sym]));
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4">
      <div className="tt-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.25rem] font-bold">Live Markets</h1>
          <p className="text-[0.75rem] text-[var(--text-secondary)]">
            10 real-time instruments across Commodities, Indices, Crypto & Forex
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-secondary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol..."
            className="w-full pl-9 pr-3 py-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[0.8125rem] outline-none"
          />
        </div>
      </div>

      {/* Single-line Horizontal Scroll Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-3.5 py-1.5 rounded-full text-[0.75rem] font-semibold border cursor-pointer shrink-0 ${
              category === c
                ? 'bg-[var(--text-primary)] text-[var(--bg-card)] border-transparent'
                : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="tt-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[0.75rem] text-[var(--text-secondary)]">
                <th className="py-3 px-4 font-medium">Market</th>
                <th className="py-3 px-4 font-medium text-right">Price</th>
                <th className="py-3 px-4 font-medium text-right">24h Change</th>
                <th className="py-3 px-4 font-medium text-right hidden md:table-cell">1h Funding</th>
                <th className="py-3 px-4 font-medium text-right hidden sm:table-cell">Open Interest</th>
                <th className="py-3 px-4 font-medium text-right hidden lg:table-cell">24h Volume</th>
                <th className="py-3 px-4 font-medium text-right">Trade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[0.8125rem]">
              {filtered.map((m) => (
                <tr
                  key={m.symbol}
                  onClick={() => onSelectSymbol(m.symbol)}
                  className="hover:bg-[var(--bg-subtle)]/60 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <button onClick={(e) => toggleFav(m.symbol, e)} className="cursor-pointer text-[var(--text-secondary)]">
                        <Star className={`w-3.5 h-3.5 ${favorites.includes(m.symbol) ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>
                      <AssetIcon symbol={m.symbol} size={26} />
                      <div>
                        <div className="font-semibold flex items-center gap-1.5">
                          <span>{m.symbol}</span>
                          <span className="rounded-full bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[0.625rem] text-[var(--text-secondary)]">
                            {m.leverage}
                          </span>
                        </div>
                        <div className="text-[0.6875rem] text-[var(--text-secondary)]">{m.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold tabular-nums">
                    ${m.price.toLocaleString(undefined, { minimumFractionDigits: m.symbol === 'EURUSD' ? 4 : 2 })}
                  </td>
                  <td className={`py-3 px-4 text-right font-semibold tabular-nums ${m.change_24h_pct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {m.change_24h_pct >= 0 ? '+' : ''}{m.change_24h_pct.toFixed(2)}%
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-[var(--text-secondary)] hidden md:table-cell">
                    {(m.funding_rate * 100).toFixed(4)}%
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums hidden sm:table-cell">{m.open_interest}</td>
                  <td className="py-3 px-4 text-right tabular-nums hidden lg:table-cell">{m.volume_24h}</td>
                  <td className="py-3 px-4 text-right">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--text-primary)] text-[var(--bg-card)] px-3 py-1 text-[0.6875rem] font-semibold">
                      Trade <ArrowUpRight className="w-3 h-3" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
