import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  GripVertical,
  History,
  LayoutGrid,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Play,
  RotateCcw,
  Send,
  Swords,
  Volume2,
  X,
} from 'lucide-react';
import { AssetIcon } from './AssetIcon';
import { ChartCandle, KLineChartWidget } from './KLineChartWidget';
import { MarketOverviewItem } from './MarketsWatchlistView';
import {
  RoomDetailPayload,
  TraderAccount,
  TraderPosition,
  UserProfile,
} from '../types/toptier';

interface TradingTerminalProps {
  activeSymbol: string;
  onSymbolChange: (sym: string) => void;
  markets: MarketOverviewItem[];
  theme: 'light' | 'dark';
  streamerMode: boolean;
  candleTypePref?: 'candle_solid' | 'candle_stroke' | 'ohlc' | 'area';
  showPositionLines?: boolean;
  user: UserProfile | null;
  token: string | null;
  accounts: TraderAccount[];
  positions: TraderPosition[];
  activeAccountMode: 'demo' | 'weekly_ranked' | 'room';
  onAccountModeChange: (m: 'demo' | 'weekly_ranked' | 'room') => void;
  activeRoomCode: string | null;
  onExitRoom: () => void;
  onRefreshUser: () => void;
  onRequireAuth: () => void;
}

const BYBIT_MAP: Record<string, string> = {
  XAUUSD: 'PAXGUSDT',
  PAXGUSDT: 'PAXGUSDT',
  BTCUSDT: 'BTCUSDT',
  ETHUSDT: 'ETHUSDT',
  SOLUSDT: 'SOLUSDT',
};

type PanelKey = 'chart' | 'book' | 'ticket' | 'health' | 'dock';

export const TradingTerminal: React.FC<TradingTerminalProps> = ({
  activeSymbol,
  onSymbolChange,
  markets,
  theme,
  streamerMode,
  candleTypePref = 'candle_solid',
  showPositionLines = true,
  user,
  token,
  accounts,
  positions,
  activeAccountMode,
  onAccountModeChange,
  activeRoomCode,
  onExitRoom,
  onRefreshUser,
  onRequireAuth,
}) => {
  const [timeframe, setTimeframe] = useState('M15');
  const [candles, setCandles] = useState<ChartCandle[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [liveTickPrice, setLiveTickPrice] = useState<number | null>(null);
  const [showSymMenu, setShowSymMenu] = useState(false);

  // 10-Minute Historical Replay State
  const [replayActive, setReplayActive] = useState(false);
  const [replayDate, setReplayDate] = useState<string>('');
  const [replayQueue, setReplayQueue] = useState<ChartCandle[]>([]);
  const [replayIdx, setReplayIdx] = useState(0);
  const [replaySecondsLeft, setReplaySecondsLeft] = useState(600);

  // Desktop Windows-Style Resizable & Hover-Closable Panels
  const [hiddenPanels, setHiddenPanels] = useState<Record<PanelKey, boolean>>({
    chart: false,
    book: false,
    ticket: false,
    health: false,
    dock: false,
  });
  const [chartWidthPct, setChartWidthPct] = useState(59);
  const [bookWidthPct, setBookWidthPct] = useState(18);
  const [topHeightPx, setTopHeightPx] = useState(540);
  const desktopRowRef = useRef<HTMLDivElement | null>(null);

  // Mobile Vest-Style Tabs & Pull-Up Drawer
  const [mobileTab, setMobileTab] = useState<'chart' | 'book' | 'trades'>('chart');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileDrawerTab, setMobileDrawerTab] = useState<'trade' | 'positions' | 'team'>('trade');

  // Orderbook & Trades
  const [bookTab, setBookTab] = useState<'book' | 'trades'>('book');
  const [bids, setBids] = useState<{ price: number; qty: number }[]>([]);
  const [asks, setAsks] = useState<{ price: number; qty: number }[]>([]);
  const [tape, setTape] = useState<{ price: number; qty: number; side: 'buy' | 'sell'; time: string }[]>([]);

  // Order Ticket State
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [leverage, setLeverage] = useState(25);
  const [marginPct, setMarginPct] = useState(25);
  const [limitPrice, setLimitPrice] = useState('');
  const [slInput, setSlInput] = useState('');
  const [tpInput, setTpInput] = useState('');
  const [orderMsg, setOrderMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dockTab, setDockTab] = useState<'positions' | 'orders' | 'history'>('positions');

  // Team Room State
  const [roomDetail, setRoomDetail] = useState<RoomDetailPayload | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);

  const activeMarket = useMemo(
    () => markets.find((m) => m.symbol === activeSymbol) || markets[0],
    [markets, activeSymbol]
  );

  const activeAccount = useMemo(() => {
    if (activeAccountMode === 'room' && roomDetail) {
      const myMember = roomDetail.members.find((m) => m.user_id === user?.id);
      if (myMember?.team === 'B' && roomDetail.account_b) return roomDetail.account_b;
      if (roomDetail.account_a) return roomDetail.account_a;
    }
    return accounts.find((a) => a.mode === activeAccountMode) || accounts[0] || null;
  }, [accounts, activeAccountMode, roomDetail, user]);

  // Start / Stop 10-Min Historical Replay (30x Speed = 300 bars in 10 mins)
  const startReplaySession = async () => {
    const res = await fetch(`/api/replay/session?symbol=${activeSymbol}`);
    if (!res.ok) return;
    const data = await res.json();
    setCandles(data.warmup_candles || []);
    setReplayQueue(data.stream_candles || []);
    setReplayIdx(0);
    setReplayDate(data.replay_date || '2024-05-15');
    setReplaySecondsLeft(600);
    setReplayActive(true);
  };

  useEffect(() => {
    if (!replayActive || replayQueue.length === 0) return;
    const barTimer = setInterval(() => {
      setReplayIdx((idx) => {
        if (idx >= replayQueue.length) {
          setReplayActive(false);
          return idx;
        }
        const nextBar = replayQueue[idx];
        setCandles((prev) => [...prev.slice(-240), nextBar]);
        setLiveTickPrice(nextBar.close);
        return idx + 1;
      });
    }, 2000); // 1 bar every 2 seconds = 300 bars in 10 minutes!

    const clockTimer = setInterval(() => {
      setReplaySecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(barTimer);
      clearInterval(clockTimer);
    };
  }, [replayActive, replayQueue]);

  // Live Feed + Bybit v5 Free Perpetual WebSocket (Non-geo-blocked!)
  useEffect(() => {
    if (replayActive) return;
    setLiveTickPrice(null);

    const bybitIntervalMap: Record<string, string> = {
      M1: '1', M5: '5', M15: '15', M45: '30', '1H': '60', '4H': '240', '1D': 'D', '1W': 'W',
    };

    const generateFallbackCandles = (basePrice: number): ChartCandle[] => {
      const now = Math.floor(Date.now() / 1000);
      const step = timeframe === 'M1' ? 60 : timeframe === 'M5' ? 300 : timeframe === '1H' ? 3600 : timeframe === '4H' ? 14400 : timeframe === '1D' ? 86400 : 900;
      const out: ChartCandle[] = [];
      let px = basePrice * 0.992;
      for (let i = 100; i >= 0; i--) {
        const wave = Math.sin(i * 0.35) * 0.0018 + Math.cos(i * 0.17) * 0.0012;
        const open = px;
        const close = i === 0 ? basePrice : +(open * (1 + wave)).toFixed(4);
        const high = +(Math.max(open, close) * 1.0011).toFixed(4);
        const low = +(Math.min(open, close) * 0.9989).toFixed(4);
        out.push({ time: now - i * step, open, high, low, close, volume: Math.round(120 + Math.abs(Math.sin(i)) * 420) });
        px = close;
      }
      return out;
    };

    const fetchKlines = async () => {
      try {
        const r = await fetch(`/api/klines?interval=${timeframe}&limit=120&symbol=${activeSymbol}`);
        if (r.ok) {
          const d = await r.json();
          if (d?.candles?.length > 0) {
            setCandles(d.candles);
            return;
          }
        }
      } catch {}

      const bybitSymFallback = BYBIT_MAP[activeSymbol];
      if (bybitSymFallback) {
        try {
          const iv = bybitIntervalMap[timeframe] || '15';
          const br = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${bybitSymFallback}&interval=${iv}&limit=120`);
          if (br.ok) {
            const bd = await br.json();
            const list = bd?.result?.list;
            if (Array.isArray(list) && list.length > 0) {
              const parsed: ChartCandle[] = list
                .slice()
                .reverse()
                .map((row: string[]) => ({
                  time: Math.floor(Number(row[0]) / 1000),
                  open: parseFloat(row[1]),
                  high: parseFloat(row[2]),
                  low: parseFloat(row[3]),
                  close: parseFloat(row[4]),
                  volume: parseFloat(row[5]),
                }));
              setCandles(parsed);
              return;
            }
          }
        } catch {}
      }

      setCandles((prev) => (prev.length > 0 ? prev : generateFallbackCandles(activeMarket?.price || 3874.5)));
    };
    fetchKlines();
    const poll = setInterval(fetchKlines, BYBIT_MAP[activeSymbol] ? 15000 : 4000);

    const bybitSym = BYBIT_MAP[activeSymbol];
    if (!bybitSym) {
      setWsConnected(false);
      return () => clearInterval(poll);
    }

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
      ws.onopen = () => {
        setWsConnected(true);
        ws?.send(
          JSON.stringify({
            op: 'subscribe',
            args: [`tickers.${bybitSym}`, `publicTrade.${bybitSym}`, `orderbook.25.${bybitSym}`],
          })
        );
      };
      ws.onclose = () => setWsConnected(false);
      ws.onerror = () => setWsConnected(false);
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.topic?.startsWith('tickers.') && msg.data?.lastPrice) {
            const px = parseFloat(msg.data.lastPrice);
            setLiveTickPrice(px);
            setCandles((prev) => {
              if (prev.length === 0) return prev;
              const next = [...prev];
              const last = { ...next[next.length - 1] };
              last.close = px;
              if (px > last.high) last.high = px;
              if (px < last.low) last.low = px;
              next[next.length - 1] = last;
              return next;
            });
          } else if (msg.topic?.startsWith('publicTrade.') && Array.isArray(msg.data)) {
            const items = msg.data.slice(0, 4).map((t: { p: string; v: string; S: string }) => ({
              price: parseFloat(t.p),
              qty: parseFloat(t.v),
              side: (t.S === 'Buy' ? 'buy' : 'sell') as 'buy' | 'sell',
              time: new Date().toISOString().slice(11, 19),
            }));
            setTape((prev) => [...items, ...prev].slice(0, 18));
          } else if (msg.topic?.startsWith('orderbook.') && msg.data) {
            if (Array.isArray(msg.data.b) && msg.data.b.length > 0) {
              setBids(msg.data.b.slice(0, 8).map((x: string[]) => ({ price: parseFloat(x[0]), qty: parseFloat(x[1]) })));
            }
            if (Array.isArray(msg.data.a) && msg.data.a.length > 0) {
              setAsks(msg.data.a.slice(0, 8).map((x: string[]) => ({ price: parseFloat(x[0]), qty: parseFloat(x[1]) })));
            }
          }
        } catch {}
      };
    } catch {
      setWsConnected(false);
    }

    return () => {
      clearInterval(poll);
      ws?.close();
    };
  }, [activeSymbol, timeframe, replayActive]);

  // Room sync polling
  const loadRoomDetail = async () => {
    if (!activeRoomCode) {
      setRoomDetail(null);
      return;
    }
    const res = await fetch(`/api/rooms/${encodeURIComponent(activeRoomCode)}`);
    if (res.ok) setRoomDetail(await res.json());
  };

  useEffect(() => {
    loadRoomDetail();
    if (!activeRoomCode) return;
    const t = setInterval(loadRoomDetail, 3000);
    return () => clearInterval(t);
  }, [activeRoomCode]);

  // Resizer Drag Handlers (Windows-style!)
  const startHorizontalResize = (which: 'chart' | 'book', e: React.MouseEvent) => {
    e.preventDefault();
    const container = desktopRowRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startChart = chartWidthPct;
    const startBook = bookWidthPct;

    const onMove = (mv: MouseEvent) => {
      const dxPct = ((mv.clientX - startX) / rect.width) * 100;
      if (which === 'chart') {
        setChartWidthPct(Math.min(72, Math.max(35, startChart + dxPct)));
      } else {
        setBookWidthPct(Math.min(30, Math.max(14, startBook + dxPct)));
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startVerticalResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = topHeightPx;
    const onMove = (mv: MouseEvent) => {
      setTopHeightPx(Math.min(760, Math.max(340, startH + (mv.clientY - startY))));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const toggleVoiceChat = async () => {
    if (voiceActive) {
      localStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      localStreamRef.current = null;
      setVoiceActive(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setVoiceActive(true);
      setMicMuted(false);
    } catch {
      setOrderMsg('Microphone permission denied.');
    }
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const next = !micMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMicMuted(next);
  };

  const currentPrice =
    liveTickPrice ?? (candles.length > 0 ? candles[candles.length - 1].close : activeMarket?.price || 3874.5);
  const availBalance = activeAccount?.balance ?? 10000;
  const notionalUsd = Math.round(((availBalance * marginPct) / 100) * leverage);

  const handleSubmitOrder = async (side: 'LONG' | 'SHORT') => {
    if (!token || !user) {
      onRequireAuth();
      return;
    }
    setSubmitting(true);
    setOrderMsg(null);
    const px = orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : currentPrice;
    const sl = slInput ? parseFloat(slInput) : null;
    const tp = tpInput ? parseFloat(tpInput) : null;

    try {
      if (activeAccountMode === 'room' && activeRoomCode) {
        const res = await fetch(`/api/rooms/${activeRoomCode}/propose`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            symbol: activeSymbol,
            side,
            order_type: orderType,
            entry_price: px,
            notional_usd: notionalUsd,
            leverage,
            stop_loss: sl,
            take_profit: tp,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Order failed');
        setOrderMsg(data.executed ? `${side} ${activeSymbol} executed!` : 'Trade proposal sent to team for vote!');
        loadRoomDetail();
      } else {
        if (!activeAccount) throw new Error('No active account');
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            account_id: activeAccount.id,
            symbol: activeSymbol,
            side,
            order_type: orderType,
            entry_price: px,
            notional_usd: notionalUsd,
            leverage,
            stop_loss: sl,
            take_profit: tp,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Order failed');
        setOrderMsg(`${side} ${activeSymbol} @ $${px.toLocaleString()} filled!`);
      }
      onRefreshUser();
    } catch (err: unknown) {
      setOrderMsg(err instanceof Error ? err.message : 'Order error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClosePos = async (pid: string) => {
    if (!token) return;
    await fetch(`/api/positions/${pid}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ exit_price: currentPrice }),
    });
    onRefreshUser();
  };

  const handleAddDrawing = async (tool: string, data: Record<string, unknown>) => {
    if (!activeRoomCode || !token) return;
    await fetch(`/api/rooms/${activeRoomCode}/drawings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ symbol: activeSymbol, tool, data }),
    });
    loadRoomDetail();
  };

  const handleDeleteDrawing = async (id: string) => {
    if (!activeRoomCode || !token) return;
    await fetch(`/api/rooms/${activeRoomCode}/drawings/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    loadRoomDetail();
  };

  const handleVote = async (proposalId: string, vote: 'approve' | 'reject') => {
    if (!activeRoomCode || !token) return;
    await fetch(`/api/rooms/${activeRoomCode}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ proposal_id: proposalId, vote }),
    });
    loadRoomDetail();
    onRefreshUser();
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeRoomCode || !token) return;
    await fetch(`/api/rooms/${activeRoomCode}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: chatInput.trim(), msg_type: 'chat' }),
    });
    setChatInput('');
    loadRoomDetail();
  };

  const openPositions = positions.filter((p) => p.status === 'OPEN');
  const pendingOrders = positions.filter((p) => p.status === 'PENDING');
  const closedHistory = positions.filter((p) => p.status === 'CLOSED');
  const anyPanelHidden = Object.values(hiddenPanels).some(Boolean);
  const pendingProposals = (roomDetail?.proposals || []).filter((p) => p.status === 'pending');

  const calcLivePnl = (p: TraderPosition) => {
    const px = p.symbol === activeSymbol ? currentPrice : p.entry_price;
    return p.side === 'LONG' ? (px - p.entry_price) * p.qty : (p.entry_price - px) * p.qty;
  };

  const displayAsks =
    asks.length > 0
      ? asks
      : [5, 4, 3, 2, 1].map((i) => ({ price: +(currentPrice + i * 0.5).toFixed(2), qty: +(12 + i * 3.1).toFixed(2) }));
  const displayBids =
    bids.length > 0
      ? bids
      : [1, 2, 3, 4, 5].map((i) => ({ price: +(currentPrice - i * 0.5).toFixed(2), qty: +(14 + i * 2.8).toFixed(2) }));

  const fmtTimer = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const renderHoverClose = (key: PanelKey) => (
    <button
      onClick={() => setHiddenPanels((prev) => ({ ...prev, [key]: true }))}
      title="Close Window"
      className="hidden lg:flex opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] items-center justify-center text-[var(--text-secondary)] hover:text-rose-500 cursor-pointer shadow-xs"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  );

  const renderOrderTicket = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[var(--bg-subtle)]">
        {(['market', 'limit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className={`py-1.5 rounded-md text-[0.75rem] font-semibold capitalize cursor-pointer ${
              orderType === t ? 'bg-[var(--bg-card)] shadow-xs text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-[0.75rem]">
        <span className="text-[var(--text-secondary)]">Leverage</span>
        <select
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] font-semibold"
        >
          {[10, 25, 50, 100].map((lv) => (
            <option key={lv} value={lv}>
              {lv}x
            </option>
          ))}
        </select>
      </div>

      {orderType === 'limit' && (
        <div>
          <label className="text-[0.6875rem] text-[var(--text-secondary)]">Limit Price</label>
          <input
            type="number"
            step="any"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder={String(currentPrice)}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[0.8125rem] tabular-nums outline-none"
          />
        </div>
      )}

      <div>
        <div className="flex justify-between text-[0.75rem] mb-1.5">
          <span className="text-[var(--text-secondary)]">Margin</span>
          <span className="font-semibold tabular-nums">
            {marginPct}% (${notionalUsd.toLocaleString()})
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => setMarginPct(pct)}
              className={`py-1.5 rounded-lg text-[0.75rem] font-semibold cursor-pointer ${
                marginPct === pct
                  ? 'bg-[var(--text-primary)] text-[var(--bg-card)]'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[0.6875rem] text-[var(--text-secondary)]">Stop Loss</label>
          <input
            type="number"
            step="any"
            value={slInput}
            onChange={(e) => setSlInput(e.target.value)}
            placeholder="Optional"
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[0.75rem] tabular-nums outline-none"
          />
        </div>
        <div>
          <label className="text-[0.6875rem] text-[var(--text-secondary)]">Take Profit</label>
          <input
            type="number"
            step="any"
            value={tpInput}
            onChange={(e) => setTpInput(e.target.value)}
            placeholder="Optional"
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[0.75rem] tabular-nums outline-none"
          />
        </div>
      </div>

      {orderMsg && <div className="text-[0.75rem] font-medium text-emerald-500">{orderMsg}</div>}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          disabled={submitting}
          onClick={() => handleSubmitOrder('LONG')}
          className="py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-[0.8125rem] font-semibold cursor-pointer disabled:opacity-50"
        >
          {activeAccountMode === 'room' && (roomDetail?.members.length ?? 0) > 2 ? 'Propose Long' : 'Buy / Long'}
        </button>
        <button
          disabled={submitting}
          onClick={() => handleSubmitOrder('SHORT')}
          className="py-2.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-[0.8125rem] font-semibold cursor-pointer disabled:opacity-50"
        >
          {activeAccountMode === 'room' && (roomDetail?.members.length ?? 0) > 2 ? 'Propose Short' : 'Sell / Short'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-3">
      {/* Active Team Room Scoreboard */}
      {roomDetail && (
        <div className="tt-card px-4 py-2.5 flex items-center justify-between gap-3 overflow-x-auto no-scrollbar whitespace-nowrap">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-500 px-2.5 py-0.5 text-[0.75rem] font-bold">
              <Swords className="w-3.5 h-3.5" /> {roomDetail.room.mode} · {roomDetail.room.code}
            </span>
            <span className="text-[0.8125rem] font-semibold">
              Team A: <span className="text-emerald-500 tabular-nums">${roomDetail.account_a?.equity.toLocaleString()}</span>
            </span>
            <span className="text-[0.75rem] text-[var(--text-secondary)]">vs</span>
            <span className="text-[0.8125rem] font-semibold">
              Team B:{' '}
              <span className="text-sky-500 tabular-nums">
                ${(roomDetail.account_b?.equity ?? roomDetail.room.starting_balance).toLocaleString()}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleVoiceChat}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[0.75rem] font-semibold cursor-pointer ${
                voiceActive ? 'bg-emerald-500 text-white' : 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
              }`}
            >
              {voiceActive ? <PhoneOff className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              {voiceActive ? 'Leave Voice' : 'Join Voice'}
            </button>
            {voiceActive && (
              <button
                onClick={toggleMute}
                className={`p-1.5 rounded-full cursor-pointer ${micMuted ? 'bg-rose-500/20 text-rose-500' : 'bg-emerald-500/20 text-emerald-500'}`}
              >
                {micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>
            )}
            <button onClick={onExitRoom} className="px-2.5 py-1 rounded-full border border-[var(--border-subtle)] text-[0.75rem] cursor-pointer">
              Exit Room
            </button>
          </div>
        </div>
      )}

      {/* Pending Team Vote */}
      {pendingProposals.length > 0 && (
        <div className="tt-card p-3 border-amber-500/50 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-[0.8125rem]">
            <strong className="text-amber-500">TEAM VOTE REQUIRED:</strong> @{pendingProposals[0].proposer_name} proposed{' '}
            <strong>
              {pendingProposals[0].side} {pendingProposals[0].symbol}
            </strong>{' '}
            @ ${pendingProposals[0].entry_price}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleVote(pendingProposals[0].id, 'approve')}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500 text-white text-[0.75rem] font-semibold cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
            <button
              onClick={() => handleVote(pendingProposals[0].id, 'reject')}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500 text-white text-[0.75rem] font-semibold cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        </div>
      )}

      {/* Market Context Strip + Mode Controls */}
      <div className="tt-card px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3 relative">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setShowSymMenu((v) => !v)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-subtle)] hover:opacity-90 cursor-pointer shrink-0"
          >
            <AssetIcon symbol={activeSymbol} size={22} />
            <span className="font-bold text-[0.875rem]">{activeSymbol}</span>
            <span className="rounded-full bg-[var(--bg-card)] px-1.5 py-0.5 text-[0.625rem] text-[var(--text-secondary)]">
              {activeMarket?.leverage || '25x'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
          </button>

          <div className="flex items-center gap-4 overflow-x-auto no-scrollbar whitespace-nowrap text-[0.75rem]">
            <div>
              <div className="text-[0.625rem] text-[var(--text-secondary)] hidden sm:block">Mid Price</div>
              <div className="font-bold text-[0.875rem] tabular-nums">
                ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: activeSymbol === 'EURUSD' ? 4 : 2 })}
              </div>
            </div>
            <div>
              <div className="text-[0.625rem] text-[var(--text-secondary)] hidden sm:block">24h Change</div>
              <div className={`font-semibold tabular-nums ${(activeMarket?.change_24h_pct ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {(activeMarket?.change_24h_pct ?? 0) >= 0 ? '+' : ''}
                {(activeMarket?.change_24h_pct ?? 0).toFixed(2)}%
              </div>
            </div>
            <div className="hidden md:block">
              <div className="text-[0.625rem] text-[var(--text-secondary)]">1h Funding</div>
              <div className="font-medium tabular-nums">{((activeMarket?.funding_rate ?? 0) * 100).toFixed(4)}%</div>
            </div>
            <div className="hidden lg:block">
              <div className="text-[0.625rem] text-[var(--text-secondary)]">Open Interest</div>
              <div className="font-medium tabular-nums">{activeMarket?.open_interest || '$12.3M'}</div>
            </div>
          </div>
        </div>

        {/* Right Controls: 10m Replay + Chart Mode + Restore Layout */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {replayActive ? (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 text-amber-500 text-[0.75rem] font-semibold tabular-nums">
              <History className="w-3.5 h-3.5" />
              <span>
                Replay {replayDate} · 30x · Bar {replayIdx}/{replayQueue.length} · {fmtTimer(replaySecondsLeft)}
              </span>
              <button onClick={() => setReplayActive(false)} className="underline ml-1 cursor-pointer">
                Stop
              </button>
            </div>
          ) : (
            <button
              onClick={startReplaySession}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:opacity-90 text-[0.75rem] font-semibold cursor-pointer"
            >
              <Play className="w-3 h-3 text-emerald-500" /> 10m Replay (30x)
            </button>
          )}

          {anyPanelHidden && (
            <button
              onClick={() => setHiddenPanels({ chart: false, book: false, ticket: false, health: false, dock: false })}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500 text-white text-[0.75rem] font-semibold cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> Restore Layout
            </button>
          )}
        </div>

        {showSymMenu && (
          <div className="absolute left-3 top-14 z-40 w-64 tt-card p-2 shadow-2xl space-y-1 max-h-80 overflow-y-auto">
            {markets.map((m) => (
              <button
                key={m.symbol}
                onClick={() => {
                  onSymbolChange(m.symbol);
                  setShowSymMenu(false);
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[0.8125rem] cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <AssetIcon symbol={m.symbol} size={20} />
                  <span className="font-semibold">{m.symbol}</span>
                </div>
                <span className="tabular-nums text-[0.75rem]">${m.price.toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* MOBILE VIEW (< lg): Vest Markets Tabs + Pull-Up Drawer */}
      <div className="lg:hidden space-y-2 pb-16">
        <div className="grid grid-cols-3 border-b border-[var(--border-subtle)] text-[0.8125rem] font-semibold">
          {(['chart', 'book', 'trades'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setMobileTab(t)}
              className={`py-2 capitalize cursor-pointer ${
                mobileTab === t ? 'border-b-2 border-[var(--text-primary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {mobileTab === 'chart' && (
          <div className="min-h-[60dvh] tt-card overflow-hidden">
            <KLineChartWidget
              symbol={activeSymbol}
              candles={candles}
              livePrice={liveTickPrice}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              theme={theme}
              openPositions={openPositions.filter((p) => p.symbol === activeSymbol)}
              candleTypePref={candleTypePref}
              showPositionLines={showPositionLines}
              replayActive={replayActive}
              replayBadge={`Replay ${replayDate} · ${fmtTimer(replaySecondsLeft)}`}
              wsConnected={wsConnected || replayActive}
            />
          </div>
        )}

        {mobileTab === 'book' && (
          <div className="tt-card p-3 space-y-2 text-[0.8125rem] tabular-nums">
            {displayAsks.slice().reverse().map((a, i) => (
              <div key={i} className="flex justify-between text-rose-500">
                <span>{a.price.toFixed(2)}</span>
                <span className="text-[var(--text-secondary)]">{a.qty.toFixed(2)}</span>
              </div>
            ))}
            <div className="py-2 border-y border-[var(--border-subtle)] text-center font-bold">${currentPrice.toFixed(2)}</div>
            {displayBids.map((b, i) => (
              <div key={i} className="flex justify-between text-emerald-500">
                <span>{b.price.toFixed(2)}</span>
                <span className="text-[var(--text-secondary)]">{b.qty.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {mobileTab === 'trades' && (
          <div className="tt-card p-3 space-y-1.5 text-[0.8125rem] tabular-nums max-h-96 overflow-y-auto">
            {tape.length === 0 ? (
              <p className="text-center py-6 text-[var(--text-secondary)]">Connecting to Bybit Perpetual Tape...</p>
            ) : (
              tape.map((t, i) => (
                <div key={i} className="flex justify-between">
                  <span className={t.side === 'buy' ? 'text-emerald-500' : 'text-rose-500'}>{t.price.toFixed(2)}</span>
                  <span className="text-[var(--text-secondary)]">{t.qty.toFixed(3)}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Vest-Style Mobile Pull-Up Bottom Drawer */}
        <div
          className={`fixed left-0 right-0 bottom-9 z-30 bg-[var(--bg-card)] border-t border-[var(--border-subtle)] rounded-t-2xl shadow-2xl transition-all duration-200 ${
            mobileDrawerOpen ? 'max-h-[75vh]' : 'max-h-14'
          } overflow-hidden`}
        >
          <button
            onClick={() => setMobileDrawerOpen((v) => !v)}
            className="w-full h-14 px-4 flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2 text-[0.8125rem] font-bold">
              <LayoutGrid className="w-4 h-4 text-emerald-500" />
              <span>Trade Ticket & Positions ({openPositions.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[0.75rem] text-[var(--text-secondary)] tabular-nums">
                {streamerMode ? '$****' : `$${availBalance.toLocaleString()}`}
              </span>
              {mobileDrawerOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </div>
          </button>

          {mobileDrawerOpen && (
            <div className="p-4 pt-0 space-y-3 overflow-y-auto max-h-[calc(75vh-3.5rem)]">
              <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-subtle)] text-[0.75rem] font-semibold">
                {(['trade', 'positions', ...(roomDetail ? ['team'] : [])] as const).map((dt) => (
                  <button
                    key={dt}
                    onClick={() => setMobileDrawerTab(dt as typeof mobileDrawerTab)}
                    className={`flex-1 py-1.5 rounded-md capitalize cursor-pointer ${
                      mobileDrawerTab === dt ? 'bg-[var(--bg-card)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {dt}
                  </button>
                ))}
              </div>

              {mobileDrawerTab === 'trade' && renderOrderTicket()}

              {mobileDrawerTab === 'positions' &&
                (openPositions.length === 0 ? (
                  <p className="text-center py-4 text-[0.8125rem] text-[var(--text-secondary)]">No open positions.</p>
                ) : (
                  <div className="space-y-2">
                    {openPositions.map((p) => {
                      const pnl = calcLivePnl(p);
                      return (
                        <div key={p.id} className="tt-subcard px-3 py-2 flex items-center justify-between text-[0.8125rem]">
                          <span>
                            {p.symbol} {p.side}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={pnl >= 0 ? 'text-emerald-500 font-semibold' : 'text-rose-500 font-semibold'}>
                              ${pnl.toFixed(2)}
                            </span>
                            <button onClick={() => handleClosePos(p.id)} className="text-rose-500 text-[0.75rem] font-semibold">
                              Close
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

              {mobileDrawerTab === 'team' && roomDetail && (
                <div className="space-y-2">
                  <div className="h-32 overflow-y-auto tt-subcard p-2 space-y-1 text-[0.75rem]">
                    {roomDetail.messages.map((m) => (
                      <div key={m.id}>
                        <strong>@{m.username}:</strong> {m.content}
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendChat} className="flex gap-2">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Chat..."
                      className="flex-1 px-3 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[0.8125rem]"
                    />
                    <button type="submit" className="px-3 py-1.5 rounded-full bg-[var(--text-primary)] text-[var(--bg-card)]">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* DESKTOP VIEW (>= lg): Resizable + Hover-Closable Windows */}
      <div className="hidden lg:block space-y-1">
        <div ref={desktopRowRef} style={{ height: `${topHeightPx}px` }} className="flex items-stretch w-full gap-1">
          {/* Chart Window */}
          {!hiddenPanels.chart && (
            <div
              style={{ width: `${hiddenPanels.book && hiddenPanels.ticket ? 100 : chartWidthPct}%` }}
              className="group relative h-full tt-card overflow-hidden"
            >
              {renderHoverClose('chart')}
              <KLineChartWidget
                symbol={activeSymbol}
                candles={candles}
                livePrice={liveTickPrice}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                theme={theme}
                openPositions={openPositions.filter((p) => p.symbol === activeSymbol)}
                candleTypePref={candleTypePref}
                showPositionLines={showPositionLines}
                replayActive={replayActive}
                replayBadge={`Replay ${replayDate} · ${fmtTimer(replaySecondsLeft)}`}
                wsConnected={wsConnected || replayActive}
              />
            </div>
          )}

          {!hiddenPanels.chart && !hiddenPanels.book && (
            <div
              onMouseDown={(e) => startHorizontalResize('chart', e)}
              title="Drag to resize"
              className="w-2 flex items-center justify-center cursor-col-resize hover:bg-[var(--bg-subtle)] rounded-md transition-colors"
            >
              <GripVertical className="w-3 h-3 text-[var(--text-secondary)]" />
            </div>
          )}

          {/* Book & Trades Window */}
          {!hiddenPanels.book && (
            <div
              style={{ width: `${bookWidthPct}%` }}
              className="group relative h-full tt-card p-3 flex flex-col justify-between overflow-hidden"
            >
              {renderHoverClose('book')}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-subtle)] mb-2">
                <button
                  onClick={() => setBookTab('book')}
                  className={`flex-1 py-1 rounded-md text-[0.75rem] font-semibold cursor-pointer ${
                    bookTab === 'book' ? 'bg-[var(--bg-card)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  Book
                </button>
                <button
                  onClick={() => setBookTab('trades')}
                  className={`flex-1 py-1 rounded-md text-[0.75rem] font-semibold cursor-pointer ${
                    bookTab === 'trades' ? 'bg-[var(--bg-card)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  Trades
                </button>
              </div>

              {bookTab === 'book' ? (
                <div className="flex-1 flex flex-col justify-between text-[0.75rem] tabular-nums overflow-hidden">
                  <div className="space-y-1">
                    {displayAsks.slice().reverse().map((a, i) => (
                      <div key={i} className="flex justify-between text-rose-500">
                        <span>{a.price.toFixed(activeSymbol === 'EURUSD' ? 4 : 2)}</span>
                        <span className="text-[var(--text-secondary)]">{a.qty.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="py-2 my-1 border-y border-[var(--border-subtle)] text-center font-bold text-[0.875rem]">
                    ${currentPrice.toFixed(activeSymbol === 'EURUSD' ? 4 : 2)}
                  </div>
                  <div className="space-y-1">
                    {displayBids.map((b, i) => (
                      <div key={i} className="flex justify-between text-emerald-500">
                        <span>{b.price.toFixed(activeSymbol === 'EURUSD' ? 4 : 2)}</span>
                        <span className="text-[var(--text-secondary)]">{b.qty.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-1 text-[0.75rem] tabular-nums">
                  {tape.length === 0 ? (
                    <p className="text-[var(--text-secondary)] text-center py-6">Waiting for Bybit Perpetual ticks...</p>
                  ) : (
                    tape.map((t, i) => (
                      <div key={i} className="flex justify-between">
                        <span className={t.side === 'buy' ? 'text-emerald-500' : 'text-rose-500'}>{t.price.toFixed(2)}</span>
                        <span className="text-[var(--text-secondary)]">{t.qty.toFixed(3)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {!hiddenPanels.book && (!hiddenPanels.ticket || !hiddenPanels.health) && (
            <div
              onMouseDown={(e) => startHorizontalResize('book', e)}
              title="Drag to resize"
              className="w-2 flex items-center justify-center cursor-col-resize hover:bg-[var(--bg-subtle)] rounded-md transition-colors"
            >
              <GripVertical className="w-3 h-3 text-[var(--text-secondary)]" />
            </div>
          )}

          {/* Right Column: Order Ticket + Account Health */}
          {(!hiddenPanels.ticket || !hiddenPanels.health) && (
            <div className="flex-1 flex flex-col gap-3 h-full overflow-y-auto">
              {!hiddenPanels.ticket && (
                <div className="group relative tt-card p-4">
                  {renderHoverClose('ticket')}
                  {renderOrderTicket()}
                </div>
              )}

              {!hiddenPanels.health && (
                <div className="group relative tt-card p-4 space-y-2.5">
                  {renderHoverClose('health')}
                  <div className="flex items-center justify-between text-[0.8125rem] font-semibold">
                    <span>Account Health</span>
                    <span className="text-emerald-500 tabular-nums">
                      {Math.max(0, 100 - (activeAccount?.max_drawdown_pct ?? 0)).toFixed(1)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((bar) => (
                      <div key={bar} className="h-1.5 rounded-full bg-emerald-500" />
                    ))}
                  </div>
                  <div className="space-y-1 text-[0.75rem] tabular-nums pt-1">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Account Equity</span>
                      <span className="font-semibold">
                        {streamerMode ? '$****' : `$${availBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Max Drawdown</span>
                      <span className="text-rose-500">-{activeAccount?.max_drawdown_pct ?? 0}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Vertical Splitter */}
        {!hiddenPanels.dock && (
          <div
            onMouseDown={startVerticalResize}
            title="Drag to resize height"
            className="h-2.5 flex items-center justify-center cursor-row-resize hover:bg-[var(--bg-subtle)] rounded-md transition-colors"
          >
            <GripHorizontal className="w-4 h-3 text-[var(--text-secondary)]" />
          </div>
        )}

        {/* Team Chat Panel */}
        {roomDetail && (
          <div className="tt-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[0.875rem] font-bold flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-500" /> Team Chat ({roomDetail.room.code})
              </h3>
              <span className="text-[0.75rem] text-[var(--text-secondary)]">
                {roomDetail.members.map((m) => `@${m.username} (${m.team})`).join(' · ')}
              </span>
            </div>
            <div className="h-32 overflow-y-auto tt-subcard p-3 space-y-1.5 text-[0.75rem]">
              {roomDetail.messages.map((m) => (
                <div key={m.id} className={m.msg_type !== 'chat' ? 'text-amber-500 font-medium' : ''}>
                  <span className="font-semibold">@{m.username}: </span>
                  <span>{m.content}</span>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendChat} className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Message teammates..."
                className="flex-1 px-3 py-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[0.8125rem] outline-none"
              />
              <button type="submit" className="px-4 py-2 rounded-full bg-[var(--text-primary)] text-[var(--bg-card)] text-[0.8125rem] font-semibold cursor-pointer">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* Bottom Positions Dock */}
        {!hiddenPanels.dock && (
          <div className="group relative tt-card p-4 space-y-3">
            {renderHoverClose('dock')}
            <div className="flex items-center gap-4 border-b border-[var(--border-subtle)] pb-2 text-[0.8125rem]">
              {[
                { id: 'positions', label: `Positions (${openPositions.length})` },
                { id: 'orders', label: `Open Orders (${pendingOrders.length})` },
                { id: 'history', label: `Trade History (${closedHistory.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDockTab(t.id as typeof dockTab)}
                  className={`font-semibold pb-1 cursor-pointer ${
                    dockTab === t.id ? 'text-[var(--text-primary)] border-b-2 border-emerald-500' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {dockTab === 'positions' &&
              (openPositions.length === 0 ? (
                <p className="text-[0.8125rem] text-[var(--text-secondary)] py-4 text-center">No open positions yet.</p>
              ) : (
                <div className="space-y-2">
                  {openPositions.map((p) => {
                    const pnl = calcLivePnl(p);
                    return (
                      <div key={p.id} className="tt-subcard px-3 py-2.5 flex items-center justify-between text-[0.8125rem]">
                        <div className="flex items-center gap-2.5">
                          <AssetIcon symbol={p.symbol} size={22} />
                          <div>
                            <div className="font-semibold">
                              {p.symbol}{' '}
                              <span className={p.side === 'LONG' ? 'text-emerald-500' : 'text-rose-500'}>
                                {p.side} {p.leverage}x
                              </span>
                            </div>
                            <div className="text-[0.6875rem] text-[var(--text-secondary)] tabular-nums">
                              Entry {p.entry_price} · Size ${p.notional_usd.toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-semibold tabular-nums ${pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {streamerMode ? '$****' : `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`}
                          </span>
                          <button
                            onClick={() => handleClosePos(p.id)}
                            className="px-3 py-1 rounded-full bg-rose-500/15 text-rose-500 text-[0.75rem] font-semibold cursor-pointer hover:bg-rose-500 hover:text-white"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

            {dockTab === 'orders' &&
              (pendingOrders.length === 0 ? (
                <p className="text-[0.8125rem] text-[var(--text-secondary)] py-4 text-center">No pending limit orders.</p>
              ) : (
                <div className="space-y-2">
                  {pendingOrders.map((p) => (
                    <div key={p.id} className="tt-subcard px-3 py-2 flex items-center justify-between text-[0.8125rem]">
                      <span>
                        {p.symbol} {p.side} @ {p.entry_price}
                      </span>
                      <button onClick={() => handleClosePos(p.id)} className="text-rose-500 text-[0.75rem] font-semibold cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              ))}

            {dockTab === 'history' &&
              (closedHistory.length === 0 ? (
                <p className="text-[0.8125rem] text-[var(--text-secondary)] py-4 text-center">No closed trades yet.</p>
              ) : (
                <div className="space-y-2">
                  {closedHistory.slice(0, 10).map((p) => (
                    <div key={p.id} className="tt-subcard px-3 py-2 flex items-center justify-between text-[0.8125rem]">
                      <span>
                        {p.symbol} {p.side} · Entry {p.entry_price} → {p.exit_price}
                      </span>
                      <span className={`font-semibold tabular-nums ${p.pnl_usd >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {p.pnl_usd >= 0 ? '+' : ''}${p.pnl_usd.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};
