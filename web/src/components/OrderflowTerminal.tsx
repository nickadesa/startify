import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Radio,
  Send,
} from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { ChartCandle, ChartOteOverlay, TradingChartPro } from './TradingChartPro';
import { AssetIcon } from './AssetIcon';
import { MarketOverviewItem } from './MarketsWatchlistView';

interface DepthLevel {
  price: number;
  qty: number;
}

interface FootprintBucket {
  bucket: string;
  price: number;
  buy_vol: number;
  sell_vol: number;
  delta: number;
  imbalance: string;
}

interface OrderflowState {
  timestamp: string;
  source: string;
  paxg_price: number;
  buy_volume: number;
  sell_volume: number;
  net_delta: number;
  cvd_usd: number;
  delta_bias: string;
  open_interest_paxg: number;
  funding_rate_pct: number;
  bid_wall?: DepthLevel;
  ask_wall?: DepthLevel;
  orderbook_bids: DepthLevel[];
  orderbook_asks: DepthLevel[];
  footprint_buckets: FootprintBucket[];
}

interface SpecialistVote {
  agent_id: string;
  display_name: string;
  role_code: string;
  role_title: string;
  responsibility: string;
  vote: string;
  confidence: number;
  note: string;
}

export interface DeskEvaluation {
  timestamp: string;
  portfolio_equity: number;
  approved: boolean;
  conviction_score: number;
  direction: string;
  execution_mode: string;
  setup_label: string;
  entry: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  lot: number;
  risk_pct: number;
  rationale: string;
  specialist_votes: SpecialistVote[];
  discord_delivery?: { sent: boolean; status?: number; reason?: string };
}

interface JournalRow {
  id: string;
  timestamp: string;
  direction: string;
  execution_mode: string;
  setup_label: string;
  entry: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  lot: number;
  status: string;
  pnl_usd: number;
}

interface OrderflowTerminalProps {
  chartOnly?: boolean;
  onExitChart?: () => void;
  activeSymbol?: string;
  onSymbolChange?: (sym: string) => void;
  markets?: MarketOverviewItem[];
  streamerMode?: boolean;
}

const DEFAULT_SYMBOLS: MarketOverviewItem[] = [
  { symbol: 'XAUUSD', name: 'Gold Spot', category: 'Commodities', leverage: '25x', price: 3874.5, change_24h_pct: -0.76, funding_rate: -0.0003, open_interest: '$12.36M', volume_24h: '$317.18M' },
  { symbol: 'NAS100', name: 'NASDAQ 100', category: 'Indices', leverage: '50x', price: 21704.25, change_24h_pct: -1.85, funding_rate: 0.0001, open_interest: '$84.45M', volume_24h: '$6.64B' },
  { symbol: 'SPX500', name: 'S&P 500', category: 'Indices', leverage: '75x', price: 6046.38, change_24h_pct: -0.85, funding_rate: -0.0001, open_interest: '$5.61M', volume_24h: '$282.44M' },
  { symbol: 'BTCUSDT', name: 'Bitcoin', category: 'Crypto', leverage: '50x', price: 91354.0, change_24h_pct: -1.45, funding_rate: 0.0006, open_interest: '$10.38M', volume_24h: '$1.64B' },
  { symbol: 'ETHUSDT', name: 'Ethereum', category: 'Crypto', leverage: '50x', price: 3104.16, change_24h_pct: -1.71, funding_rate: 0.0012, open_interest: '$4.22M', volume_24h: '$187.77M' },
  { symbol: 'SOLUSDT', name: 'Solana', category: 'Crypto', leverage: '20x', price: 211.24, change_24h_pct: -2.06, funding_rate: -0.0009, open_interest: '$5.53M', volume_24h: '$23.01M' },
  { symbol: 'XAGUSD', name: 'Silver Spot', category: 'Commodities', leverage: '25x', price: 31.42, change_24h_pct: -2.77, funding_rate: 0.0, open_interest: '$165.49K', volume_24h: '$12.74M' },
  { symbol: 'EURUSD', name: 'Euro / USD', category: 'Forex', leverage: '100x', price: 1.0542, change_24h_pct: -0.16, funding_rate: -0.0001, open_interest: '$1.17M', volume_24h: '$8.37M' },
  { symbol: 'DXY', name: 'US Dollar Index', category: 'Forex', leverage: '50x', price: 106.68, change_24h_pct: 0.34, funding_rate: 0.0, open_interest: '$3.20M', volume_24h: '$44.10M' },
];

export const OrderflowTerminal: React.FC<OrderflowTerminalProps> = ({
  chartOnly = false,
  onExitChart,
  activeSymbol = 'XAUUSD',
  onSymbolChange,
  markets,
  streamerMode = false,
}) => {
  const [symbol, setSymbol] = useState(activeSymbol);
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [ofState, setOfState] = useState<OrderflowState | null>(null);
  const [desk, setDesk] = useState<DeskEvaluation | null>(null);
  const [journalRows, setJournalRows] = useState<JournalRow[]>([]);
  const [liveCandles, setLiveCandles] = useState<ChartCandle[]>([]);
  const [chartOte, setChartOte] = useState<ChartOteOverlay | null>(null);
  const [timeframe, setTimeframe] = useState<string>('M15');
  const [wsConnected, setWsConnected] = useState(false);
  const [sendingDiscord, setSendingDiscord] = useState(false);
  const [discordStatus, setDiscordStatus] = useState<string | null>(null);

  // Vest-style sub-pane states
  const [bookTab, setBookTab] = useState<'book' | 'trades'>('book');
  const [orderTab, setOrderTab] = useState<'market' | 'limit' | 'scale'>('limit');
  const [riskAllocPct, setRiskAllocPct] = useState<number>(50);
  const [dockTab, setDockTab] = useState<'positions' | 'orders' | 'history' | 'consensus'>('consensus');
  const [recentTape, setRecentTape] = useState<{ price: number; qty: number; side: 'buy' | 'sell'; time: string }[]>([]);

  const cvdRef = useRef<number>(0);

  useEffect(() => {
    setSymbol(activeSymbol);
  }, [activeSymbol]);

  const symbolList = markets && markets.length > 0 ? markets : DEFAULT_SYMBOLS;
  const activeMarketMeta = symbolList.find((m) => m.symbol === symbol) || symbolList[0];

  const handleSelectSymbol = (nextSym: string) => {
    setSymbol(nextSym);
    onSymbolChange?.(nextSym);
    setShowSymbolDropdown(false);
  };

  const fetchBackendOrderflowAndDesk = async (sendDiscord = false, tf = timeframe, sym = symbol) => {
    try {
      const [ofRes, deskRes, snapRes, klinesRes, journalRes] = await Promise.all([
        fetch('/api/orderflow/live').then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/desk/evaluate?send_discord=${sendDiscord}`).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/snapshot/live').then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/klines?interval=${tf}&limit=120&symbol=${sym}`).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/desk/journal').then((r) => (r.ok ? r.json() : null)),
      ]);
      if (ofRes) setOfState(ofRes);
      if (klinesRes?.candles && klinesRes.candles.length > 0) {
        setLiveCandles(klinesRes.candles);
      } else if (snapRes?.recent_candles_h1 && (sym === 'XAUUSD' || sym === 'PAXGUSDT')) {
        setLiveCandles(snapRes.recent_candles_h1);
      }
      if (snapRes?.snapshot?.ote) {
        setChartOte(snapRes.snapshot.ote);
      }
      if (journalRes?.entries) {
        setJournalRows(journalRes.entries);
      }
      if (deskRes) {
        setDesk(deskRes);
        if (sendDiscord && deskRes.discord_delivery) {
          setDiscordStatus(
            deskRes.discord_delivery.sent
              ? 'Signal + Chart PNG sent to Discord webhook'
              : `Discord skipped: ${deskRes.discord_delivery.reason || 'not approved'}`
          );
        }
      }
    } catch {
      // Offline fallback handled gracefully
    }
  };

  useEffect(() => {
    fetchBackendOrderflowAndDesk(false, timeframe, symbol);
  }, [timeframe, symbol]);

  useEffect(() => {
    const poll = setInterval(() => fetchBackendOrderflowAndDesk(false, timeframe, symbol), 15000);

    const wsSymbolMap: Record<string, string> = {
      XAUUSD: 'paxgusdt',
      PAXGUSDT: 'paxgusdt',
      BTCUSDT: 'btcusdt',
      ETHUSDT: 'ethusdt',
      SOLUSDT: 'solusdt',
    };
    const streamSym = wsSymbolMap[symbol] || 'paxgusdt';
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(
        `wss://fstream.binance.com/stream?streams=${streamSym}@aggTrade/${streamSym}@depth20@250ms`
      );
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
      ws.onerror = () => setWsConnected(false);
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.stream?.includes('aggTrade') && msg.data) {
            const px = parseFloat(msg.data.p);
            const qty = parseFloat(msg.data.q);
            const isSell = Boolean(msg.data.m);
            const delta = isSell ? -qty : qty;
            cvdRef.current += delta * px;
            const nowStr = new Date().toISOString().slice(11, 19);
            setRecentTape((prev) => [{ price: px, qty, side: (isSell ? 'sell' : 'buy') as 'buy' | 'sell', time: nowStr }, ...prev.slice(0, 17)]);

            if (streamSym === 'paxgusdt' || wsSymbolMap[symbol]) {
              setOfState((prev) =>
                prev
                  ? {
                      ...prev,
                      source: `Binance ${streamSym.toUpperCase()} WebSocket (Live)`,
                      paxg_price: px,
                      buy_volume: prev.buy_volume + (isSell ? 0 : qty),
                      sell_volume: prev.sell_volume + (isSell ? qty : 0),
                      net_delta: +(prev.net_delta + delta).toFixed(3),
                      cvd_usd: +cvdRef.current.toFixed(2),
                      delta_bias: prev.net_delta + delta >= 0 ? 'bullish' : 'bearish',
                    }
                  : prev
              );
              setLiveCandles((prev) => {
                if (!prev || prev.length === 0) return prev;
                const next = [...prev];
                const last = { ...next[next.length - 1] };
                last.close = px;
                if (px > last.high) last.high = px;
                if (px < last.low) last.low = px;
                last.volume = (last.volume || 0) + qty;
                next[next.length - 1] = last;
                return next;
              });
            }
          } else if (msg.stream?.includes('depth20') && msg.data) {
            const bids = (msg.data.b || []).slice(0, 10).map((x: string[]) => ({
              price: parseFloat(x[0]),
              qty: parseFloat(x[1]),
            }));
            const asks = (msg.data.a || []).slice(0, 10).map((x: string[]) => ({
              price: parseFloat(x[0]),
              qty: parseFloat(x[1]),
            }));
            setOfState((prev) =>
              prev
                ? {
                    ...prev,
                    orderbook_bids: bids,
                    orderbook_asks: asks,
                  }
                : prev
            );
          }
        } catch {
          // ignore malformed tick
        }
      };
    } catch {
      setWsConnected(false);
    }

    return () => {
      clearInterval(poll);
      ws?.close();
    };
  }, [symbol]);

  const handleSendSignalToDiscord = async () => {
    setSendingDiscord(true);
    setDiscordStatus(null);
    await fetchBackendOrderflowAndDesk(true, timeframe, symbol);
    setSendingDiscord(false);
  };

  const displayPrice =
    liveCandles.length > 0
      ? liveCandles[liveCandles.length - 1].close
      : activeMarketMeta?.price ?? ofState?.paxg_price ?? 3874.5;

  const spreadVal = useMemo(() => {
    const bestAsk = ofState?.orderbook_asks?.[0]?.price;
    const bestBid = ofState?.orderbook_bids?.[0]?.price;
    if (bestAsk && bestBid) return Math.max(bestAsk - bestBid, 0).toFixed(2);
    return '0.20';
  }, [ofState]);

  const activePositions = journalRows.filter((r) => r.status === 'OPEN' || r.status === 'TP1_BE');
  const pendingOrders = journalRows.filter((r) => r.status === 'PENDING');
  const closedHistory = journalRows.filter((r) => r.status === 'WIN' || r.status === 'LOSS');

  if (chartOnly) {
    return (
      <div className="space-y-4">
        <TradingChartPro
          candles={liveCandles}
          symbol={symbol}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          ote={symbol === 'XAUUSD' || symbol === 'PAXGUSDT' ? chartOte : null}
          signal={symbol === 'XAUUSD' || symbol === 'PAXGUSDT' ? desk : null}
          oiWalls={
            ofState && (symbol === 'XAUUSD' || symbol === 'PAXGUSDT')
              ? { bid_wall: ofState.bid_wall, ask_wall: ofState.ask_wall }
              : null
          }
          livePrice={displayPrice}
          wsConnected={wsConnected}
          netDelta={ofState?.net_delta ?? 0}
          cvdUsd={ofState?.cvd_usd ?? 0}
          defaultFullscreen
          onExitFullscreen={onExitChart}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* Vest-Style Market Context Strip */}
      <Card className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5 relative">
          {/* Asset Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSymbolDropdown((v) => !v)}
              className="flex items-center gap-2.5 pr-3 border-r border-white/[0.12] cursor-pointer hover:opacity-90"
            >
              <AssetIcon symbol={symbol} size={26} />
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13.5px] font-semibold text-white">{symbol}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {activeMarketMeta?.leverage || '25x'}
                  </Badge>
                  <ChevronDown className="w-3.5 h-3.5 text-[#71717A]" />
                </div>
                <div className="text-[11px] text-[#71717A]">{activeMarketMeta?.name}</div>
              </div>
            </button>

            {showSymbolDropdown && (
              <div className="absolute left-0 top-11 z-40 w-72 bg-[#0B0B0D] border border-white/[0.2] p-1.5 shadow-2xl max-h-80 overflow-y-auto">
                {symbolList.map((m) => (
                  <button
                    key={m.symbol}
                    type="button"
                    onClick={() => handleSelectSymbol(m.symbol)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 text-[12px] cursor-pointer ${
                      m.symbol === symbol ? 'bg-white text-black font-semibold' : 'text-[#D4D4D8] hover:bg-[#141416]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AssetIcon symbol={m.symbol} size={20} />
                      <span>{m.symbol}</span>
                      <span className="text-[10.5px] opacity-70">{m.name}</span>
                    </div>
                    <span className="tabular-nums">${m.price.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Horizontal Stat Strip */}
          <div className="flex flex-wrap items-center gap-5 text-[12px] tabular-nums">
            <div>
              <div className="text-[10.5px] text-[#71717A]">Mid Price</div>
              <div className="font-semibold text-white">
                {streamerMode ? '$****.**' : `$${displayPrice.toFixed(symbol === 'EURUSD' ? 4 : 2)}`}
              </div>
            </div>
            <div>
              <div className="text-[10.5px] text-[#71717A]">24h Change</div>
              <div
                className={`font-medium ${
                  (activeMarketMeta?.change_24h_pct ?? 0) >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                }`}
              >
                {(activeMarketMeta?.change_24h_pct ?? 0) >= 0 ? '+' : ''}
                {(activeMarketMeta?.change_24h_pct ?? 0).toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-[10.5px] text-[#71717A]">1h Funding</div>
              <div className="font-medium text-white">
                {(ofState?.funding_rate_pct ?? activeMarketMeta?.funding_rate ?? 0).toFixed(4)}%
              </div>
            </div>
            <div>
              <div className="text-[10.5px] text-[#71717A]">Open Interest</div>
              <div className="font-medium text-white">{activeMarketMeta?.open_interest || '$28.45M'}</div>
            </div>
            <div>
              <div className="text-[10.5px] text-[#71717A]">Net Delta</div>
              <div
                className={`font-medium ${
                  (ofState?.net_delta ?? 0) >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                }`}
              >
                {(ofState?.net_delta ?? 0) >= 0 ? '+' : ''}
                {(ofState?.net_delta ?? 0).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={wsConnected ? 'positive' : 'secondary'}>
            <Radio className="w-3 h-3" />
            {wsConnected ? 'WS LIVE' : '15S POLL'}
          </Badge>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSendSignalToDiscord}
            disabled={sendingDiscord}
          >
            <Send className="w-3.5 h-3.5" />
            <span>{sendingDiscord ? 'Sending...' : 'Evaluate & Discord'}</span>
          </Button>
        </div>
      </Card>

      {discordStatus && (
        <div className="border border-white/25 bg-[#0A0A0A] px-4 py-2 text-[12.5px] text-white flex items-center justify-between">
          <span>{discordStatus}</span>
          <button
            type="button"
            onClick={() => setDiscordStatus(null)}
            className="text-[12px] text-[#A1A1AA] hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Vest 3-Pane Terminal: Chart (6) | Orderbook & Tape (3) | Execution & Account Health (3) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Pane 1: Interactive Chart */}
        <div className="xl:col-span-6 min-w-0">
          <TradingChartPro
            candles={liveCandles}
            symbol={symbol}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            ote={symbol === 'XAUUSD' || symbol === 'PAXGUSDT' ? chartOte : null}
            signal={symbol === 'XAUUSD' || symbol === 'PAXGUSDT' ? desk : null}
            oiWalls={
              ofState && (symbol === 'XAUUSD' || symbol === 'PAXGUSDT')
                ? { bid_wall: ofState.bid_wall, ask_wall: ofState.ask_wall }
                : null
            }
            livePrice={displayPrice}
            wsConnected={wsConnected}
            netDelta={ofState?.net_delta ?? 0}
            cvdUsd={ofState?.cvd_usd ?? 0}
          />
        </div>

        {/* Pane 2: Orderbook & Trades (Vest-style) */}
        <Card className="xl:col-span-3 p-3.5 flex flex-col justify-between min-w-0">
          <div className="space-y-3">
            <div className="grid grid-cols-2 border-b border-white/[0.1]">
              {(['book', 'trades'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBookTab(t)}
                  className={`py-2 text-[12px] font-medium capitalize border-b-2 cursor-pointer transition-colors ${
                    bookTab === t
                      ? 'border-white text-white'
                      : 'border-transparent text-[#71717A] hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {bookTab === 'book' ? (
              <div className="space-y-1.5 text-[11.5px] tabular-nums">
                <div className="grid grid-cols-3 text-[#71717A] text-[10.5px] pb-1">
                  <span>Price</span>
                  <span className="text-right">Size</span>
                  <span className="text-right">Total</span>
                </div>
                {(ofState?.orderbook_asks || []).slice(0, 7).reverse().map((a, idx) => (
                  <div key={`ask-${idx}`} className="grid grid-cols-3 py-0.5 relative">
                    <span className="text-[#FF453A]">${a.price.toFixed(2)}</span>
                    <span className="text-right text-[#D4D4D8]">{a.qty.toFixed(2)}</span>
                    <span className="text-right text-[#71717A]">{(a.price * a.qty).toFixed(0)}</span>
                  </div>
                ))}

                <div className="my-2 py-1.5 px-2 bg-[#141416] border border-white/[0.08] flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-white">
                    ${displayPrice.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-[#71717A]">Spread ${spreadVal}</span>
                </div>

                {(ofState?.orderbook_bids || []).slice(0, 7).map((b, idx) => (
                  <div key={`bid-${idx}`} className="grid grid-cols-3 py-0.5">
                    <span className="text-[#30D158]">${b.price.toFixed(2)}</span>
                    <span className="text-right text-[#D4D4D8]">{b.qty.toFixed(2)}</span>
                    <span className="text-right text-[#71717A]">{(b.price * b.qty).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1 text-[11.5px] tabular-nums max-h-[390px] overflow-y-auto">
                <div className="grid grid-cols-3 text-[#71717A] text-[10.5px] pb-1">
                  <span>Price</span>
                  <span className="text-right">Size</span>
                  <span className="text-right">Time</span>
                </div>
                {recentTape.length === 0 ? (
                  <div className="text-[12px] text-[#71717A] py-8 text-center">
                    Streaming live aggTrades...
                  </div>
                ) : (
                  recentTape.map((tr, i) => (
                    <div key={i} className="grid grid-cols-3 py-0.5">
                      <span className={tr.side === 'buy' ? 'text-[#30D158]' : 'text-[#FF453A]'}>
                        ${tr.price.toFixed(2)}
                      </span>
                      <span className="text-right text-white">{tr.qty.toFixed(3)}</span>
                      <span className="text-right text-[#71717A]">{tr.time}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Pane 3: Desk Execution & Account Health (Vest-style) */}
        <div className="xl:col-span-3 flex flex-col gap-4 min-w-0">
          <Card className="p-4 space-y-3.5">
            <div className="grid grid-cols-3 border-b border-white/[0.1]">
              {(['market', 'limit', 'scale'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderTab(t)}
                  className={`py-1.5 text-[12px] font-medium capitalize border-b-2 cursor-pointer ${
                    orderTab === t ? 'border-white text-white' : 'border-transparent text-[#71717A]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[#71717A]">Desk Leverage</span>
              <span className="font-semibold text-white">{activeMarketMeta?.leverage || '25x'}</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setRiskAllocPct(pct)}
                  className={`py-1 text-[11px] font-medium border cursor-pointer ${
                    riskAllocPct === pct
                      ? 'bg-white text-black border-white'
                      : 'border-white/[0.12] text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            {desk && (
              <div className="space-y-2 text-[12px] tabular-nums border-t border-white/[0.08] pt-3">
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Desk Conviction</span>
                  <span className="font-semibold text-white">{desk.conviction_score}/100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Entry ({desk.execution_mode})</span>
                  <span className="text-white">${desk.entry.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Stop Loss</span>
                  <span className="text-[#FF453A]">${desk.stop_loss.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717A]">TP1 (BE) / TP2</span>
                  <span className="text-[#30D158]">
                    ${desk.tp1.toFixed(2)} / ${desk.tp2.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#71717A]">Sized Lot</span>
                  <span className="text-white">
                    {((desk.lot * riskAllocPct) / 100).toFixed(2)} ({((desk.risk_pct * riskAllocPct) / 100).toFixed(2)}%)
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="py-2 text-center text-[12px] font-semibold bg-[#30D158]/15 border border-[#30D158]/40 text-[#30D158]">
                Buy / Long
              </div>
              <div className="py-2 text-center text-[12px] font-semibold bg-[#FF453A]/15 border border-[#FF453A]/40 text-[#FF453A]">
                Sell / Short
              </div>
            </div>
          </Card>

          {/* Vest-style Account Health Card */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-white">Account Health</span>
              <span className="text-[12px] font-semibold text-[#30D158] tabular-nums">99.5%</span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[0, 1, 2, 3, 4].map((seg) => (
                <div key={seg} className="h-1.5 bg-[#30D158]" />
              ))}
            </div>
            <div className="space-y-1.5 text-[12px] tabular-nums">
              <div className="flex justify-between">
                <span className="text-[#71717A]">Account Value</span>
                <span className="text-white font-medium">
                  {streamerMode ? '$****.**' : `$${(desk?.portfolio_equity ?? 1000).toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71717A]">Risk / Trade</span>
                <span className="text-white">0.50% ($5.00)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71717A]">Unrealized PnL</span>
                <span className="text-[#30D158]">
                  {streamerMode ? '$****.**' : '+$0.00'}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Vest-style Bottom Positions / Orders / History / 8-AI Consensus Dock */}
      <Card className="overflow-hidden">
        <div className="px-4 border-b border-white/[0.1] flex flex-wrap items-center gap-6">
          {(
            [
              ['positions', `Active Positions (${activePositions.length})`],
              ['orders', `Pending Orders (${pendingOrders.length})`],
              ['history', `Trade History (${closedHistory.length})`],
              ['consensus', '8-AI Consensus Matrix (8)'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDockTab(key)}
              className={`py-3 text-[12.5px] font-medium border-b-2 cursor-pointer transition-colors ${
                dockTab === key
                  ? 'border-white text-white'
                  : 'border-transparent text-[#71717A] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto w-full">
          {dockTab === 'consensus' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Assigned Role</TableHead>
                  <TableHead>Vote</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead>Live Assessment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(desk?.specialist_votes || []).map((v) => (
                  <TableRow key={v.agent_id}>
                    <TableCell className="font-medium text-white whitespace-nowrap">{v.display_name}</TableCell>
                    <TableCell className="text-[#A1A1AA] whitespace-nowrap">{v.role_title}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        variant={
                          v.vote === 'long' || v.vote === 'approved' || v.vote === 'clear'
                            ? 'positive'
                            : v.vote === 'short' || v.vote === 'block'
                            ? 'negative'
                            : 'secondary'
                        }
                      >
                        {v.vote === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                        {v.vote === 'block' && <AlertTriangle className="w-3 h-3" />}
                        <span className="uppercase">{v.vote}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-white whitespace-nowrap">
                      {v.confidence}%
                    </TableCell>
                    <TableCell className="text-[#A1A1AA] max-w-[360px] truncate">{v.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setup</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">SL</TableHead>
                  <TableHead className="text-right">TP2</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead className="text-right">PnL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(dockTab === 'positions'
                  ? activePositions
                  : dockTab === 'orders'
                  ? pendingOrders
                  : closedHistory
                ).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-[#71717A]">
                      No records in this tab yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (dockTab === 'positions'
                    ? activePositions
                    : dockTab === 'orders'
                    ? pendingOrders
                    : closedHistory
                  ).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-white font-medium">{row.setup_label}</TableCell>
                      <TableCell>
                        <Badge variant={row.direction === 'long' ? 'positive' : 'negative'}>
                          {row.direction.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[#A1A1AA] uppercase">{row.execution_mode}</TableCell>
                      <TableCell className="text-right tabular-nums">${row.entry.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums text-[#FF453A]">${row.stop_loss.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums text-[#30D158]">${row.tp2.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{row.status}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${
                          row.pnl_usd >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                        }`}
                      >
                        {streamerMode
                          ? '$****.**'
                          : `${row.pnl_usd >= 0 ? '+' : '-'}$${Math.abs(row.pnl_usd).toFixed(2)}`}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
};
