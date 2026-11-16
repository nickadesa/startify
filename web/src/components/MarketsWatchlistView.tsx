import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Search, Star, ArrowUpRight } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { AssetIcon } from './AssetIcon';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

export interface MarketOverviewItem {
  symbol: string;
  name: string;
  category: 'Commodities' | 'Indices' | 'Crypto' | 'Forex';
  leverage: string;
  price: number;
  change_24h_pct: number;
  funding_rate: number;
  open_interest: string;
  volume_24h: string;
}

interface MarketsWatchlistViewProps {
  markets: MarketOverviewItem[];
  onSelectMarket: (symbol: string) => void;
  streamerMode?: boolean;
}

export const MarketsWatchlistView: React.FC<MarketsWatchlistViewProps> = ({
  markets,
  onSelectMarket,
  streamerMode = false,
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'All' | 'Favorites' | 'Commodities' | 'Indices' | 'Crypto' | 'Forex'>('All');
  const [favorites, setFavorites] = useState<string[]>(['XAUUSD', 'NAS100', 'BTCUSDT']);
  const [sortKey, setSortKey] = useState<'symbol' | 'price' | 'change_24h_pct' | 'funding_rate'>('symbol');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const toggleFav = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => (prev.includes(sym) ? prev.filter((x) => x !== sym) : [...prev, sym]));
  };

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === 'symbol');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return effectiveMarkets
      .filter((m) => {
        if (category === 'Favorites' && !favorites.includes(m.symbol)) return false;
        if (category !== 'All' && category !== 'Favorites' && m.category !== category) return false;
        if (q && !m.symbol.toLowerCase().includes(q) && !m.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === 'string' && typeof bv === 'string') {
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
      });
  }, [effectiveMarkets, search, category, favorites, sortKey, sortAsc]);

  const categories = ['All', 'Favorites', 'Commodities', 'Indices', 'Crypto', 'Forex'] as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-white/[0.1] pb-4">
        <div>
          <div className="text-[12.5px] font-medium text-[#A1A1AA]">
            Multi-asset macro &amp; perp watchlist
          </div>
          <h2 className="text-[24px] font-semibold tracking-[-0.025em] text-white mt-0.5">
            Markets
          </h2>
        </div>
        <div className="text-[12px] text-[#71717A]">
          Click any asset (e.g. XAUUSD, NAS100, BTCUSDT) to open in Live Terminal
        </div>
      </div>

      {/* Vest-style Search + Category Filter Strip */}
      <Card className="p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative w-full lg:w-72">
          <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol or asset (NAS100, Gold...)"
            className="w-full h-8 pl-8 pr-3 bg-[#000000] border border-white/[0.12] text-[12.5px] text-white placeholder:text-[#71717A] focus:outline-none focus:border-white/[0.4]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3 py-1 text-[12px] font-medium border cursor-pointer transition-colors ${
                category === cat
                  ? 'bg-white text-black border-white'
                  : 'bg-transparent text-[#A1A1AA] border-white/[0.1] hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </Card>

      {/* Markets Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => handleSort('symbol')}>
                  <span className="inline-flex items-center gap-1">
                    Symbol <ArrowUpDown className="w-3 h-3" />
                  </span>
                </TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort('price')}>
                  <span className="inline-flex items-center gap-1 justify-end">
                    Mid Price <ArrowUpDown className="w-3 h-3" />
                  </span>
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort('change_24h_pct')}>
                  <span className="inline-flex items-center gap-1 justify-end">
                    24h Change <ArrowUpDown className="w-3 h-3" />
                  </span>
                </TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort('funding_rate')}>
                  <span className="inline-flex items-center gap-1 justify-end">
                    1h Funding <ArrowUpDown className="w-3 h-3" />
                  </span>
                </TableHead>
                <TableHead className="text-right">Open Interest</TableHead>
                <TableHead className="text-right">24h Volume</TableHead>
                <TableHead className="text-right">Terminal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => {
                const isFav = favorites.includes(m.symbol);
                const dec = m.symbol === 'EURUSD' ? 4 : 2;
                return (
                  <TableRow
                    key={m.symbol}
                    onClick={() => onSelectMarket(m.symbol)}
                    className="cursor-pointer hover:bg-[#141416] transition-colors"
                  >
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={(e) => toggleFav(m.symbol, e)}
                          className={`cursor-pointer ${isFav ? 'text-[#FFD60A]' : 'text-[#52525B] hover:text-white'}`}
                        >
                          <Star className="w-3.5 h-3.5" fill={isFav ? 'currentColor' : 'none'} />
                        </button>
                        <AssetIcon symbol={m.symbol} size={24} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white text-[13px]">{m.symbol}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {m.leverage}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-[#71717A]">{m.name}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-[#A1A1AA] text-[12px]">{m.category}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-white">
                      {streamerMode ? '$****.**' : `$${m.price.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}`}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${
                        m.change_24h_pct >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                      }`}
                    >
                      {m.change_24h_pct >= 0 ? '+' : ''}
                      {m.change_24h_pct.toFixed(2)}%
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums text-[12px] ${
                        m.funding_rate >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                      }`}
                    >
                      {m.funding_rate >= 0 ? '+' : ''}
                      {m.funding_rate.toFixed(4)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#D4D4D8]">{m.open_interest}</TableCell>
                    <TableCell className="text-right tabular-nums text-[#D4D4D8]">{m.volume_24h}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-white border border-white/[0.15] px-2 py-0.5 hover:bg-white hover:text-black">
                        Trade <ArrowUpRight className="w-3 h-3" />
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};
