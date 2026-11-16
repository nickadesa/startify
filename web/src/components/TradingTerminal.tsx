import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Swords,
  Volume2,
  X,
} from 'lucide-react';
import { AssetIcon } from './AssetIcon';
import { MarketOverviewItem } from './MarketsWatchlistView';
import { ChartCandle, VestChart } from './VestChart';
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

const BINANCE_WS_MAP: Record<string, string> = {
  XAUUSD: 'paxgusdt',
  PAXGUSDT: 'paxgusdt',
  BTCUSDT: 'btcusdt',
  ETHUSDT: 'ethusdt',
  SOLUSDT: 'solusdt',
};

const TF_TO_BINANCE: Record<string, string> = {
  M1: '1m',
  M5: '5m',
  M15: '15m',
  M45: '15m',
  '1H': '1h',
  '4H': '4h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1M',
};

export const TradingTerminal: React.FC<TradingTerminalProps> = ({
  activeSymbol,
  onSymbolChange,
  markets,
  theme,
  streamerMode,
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
  const [showSymMenu, setShowSymMenu] = useState(false);

  // Mobile segmented view
  const [mobilePane, setMobilePane] = useState<'chart' | 'trade' | 'book' | 'positions' | 'team'>('chart');

  // Orderbook & Trades
  const [bookTab, setBookTab] = useState<'book' | 'trades'>('book');
  const [bids, setBids] = useState<{ price: number; qty: number }[]>([]);
  const [asks, setAsks] = useState<{ price: number; qty: number }[]>([]);
  const [tape, setTape] = useState<{ price: number; qty: number; side: 'buy' | 'sell'; time: string }[]>([]);

  // Order ticket state
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [leverage, setLeverage] = useState(25);
  const [marginPct, setMarginPct] = useState(25);
  const [limitPrice, setLimitPrice] = useState('');
  const [slInput, setSlInput] = useState('');
  const [tpInput, setTpInput] = useState('');
  const [orderMsg, setOrderMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Bottom dock tab
  const [dockTab, setDockTab] = useState<'positions' | 'orders' | 'history'>('positions');

  // Team Room state
  const [roomDetail, setRoomDetail] = useState<RoomDetailPayload | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});

  const activeMarket = useMemo(
    () => markets.find((m) => m.symbol === activeSymbol) || markets[0],
    [markets, activeSymbol]
  );

  // Active account
  const activeAccount = useMemo(() => {
    if (activeAccountMode === 'room' && roomDetail) {
      const myMember = roomDetail.members.find((m) => m.user_id === user?.id);
      if (myMember?.team === 'B' && roomDetail.account_b) return roomDetail.account_b;
      if (roomDetail.account_a) return roomDetail.account_a;
    }
    return accounts.find((a) => a.mode === activeAccountMode) || accounts[0] || null;
  }, [accounts, activeAccountMode, roomDetail, user]);

  // Fetch klines & orderbook
  const fetchMarketData = async () => {
    try {
      const [kRes, ofRes] = await Promise.all([
        fetch(`/api/klines?interval=${timeframe}&limit=120&symbol=${activeSymbol}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/orderflow/live?symbol=${activeSymbol}`).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (kRes?.candles?.length > 0) setCandles(kRes.candles);
      if (ofRes && BINANCE_WS_MAP[activeSymbol]) {
        if (ofRes.orderbook_bids) setBids(ofRes.orderbook_bids.slice(0, 8));
        if (ofRes.orderbook_asks) setAsks(ofRes.orderbook_asks.slice(0, 8));
      }
    } catch {}
  };

  useEffect(() => {
    fetchMarketData();
    const isBinance = Boolean(BINANCE_WS_MAP[activeSymbol]);
    const pollMs = isBinance ? 15000 : 5000;
    const timer = setInterval(fetchMarketData, pollMs);

    const bSym = BINANCE_WS_MAP[activeSymbol];
    if (!bSym) {
      setWsConnected(false);
      return () => clearInterval(timer);
    }

    const bTf = TF_TO_BINANCE[timeframe] || '15m';
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(
        `wss://fstream.binance.com/stream?streams=${bSym}@kline_${bTf}/${bSym}@aggTrade/${bSym}@depth20@250ms`
      );
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
      ws.onerror = () => setWsConnected(false);
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.stream?.includes('@kline_') && msg.data?.k && timeframe !== 'M45') {
            const k = msg.data.k;
            const c: ChartCandle = {
              time: new Date(k.t).toISOString(),
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v),
            };
            setCandles((prev) => {
              if (prev.length === 0) return [c];
              const last = prev[prev.length - 1];
              const lastSec = Math.floor(Date.parse(last.time) / 1000);
              const newSec = Math.floor(Date.parse(c.time) / 1000);
              if (newSec === lastSec) {
                const next = [...prev];
                next[next.length - 1] = c;
                return next;
              }
              if (newSec > lastSec) {
                return [...prev.slice(-149), c];
              }
              return prev;
            });
          } else if (msg.stream?.includes('@aggTrade') && msg.data) {
            const px = parseFloat(msg.data.p);
            const qty = parseFloat(msg.data.q);
            const isSell = Boolean(msg.data.m);
            setTape((prev) => [
              { price: px, qty, side: isSell ? 'sell' : 'buy', time: new Date().toISOString().slice(11, 19) },
              ...prev.slice(0, 15),
            ]);
          } else if (msg.stream?.includes('@depth20') && msg.data) {
            setBids((msg.data.b || []).slice(0, 8).map((x: string[]) => ({ price: parseFloat(x[0]), qty: parseFloat(x[1]) })));
            setAsks((msg.data.a || []).slice(0, 8).map((x: string[]) => ({ price: parseFloat(x[0]), qty: parseFloat(x[1]) })));
          }
        } catch {}
      };
    } catch {
      setWsConnected(false);
    }

    return () => {
      clearInterval(timer);
      ws?.close();
    };
  }, [activeSymbol, timeframe]);

  // Room sync polling (drawings, proposals, chat, scoreboard)
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

  // WebRTC Voice Chat setup
  const toggleVoiceChat = async () => {
    if (voiceActive) {
      localStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      localStreamRef.current = null;
      Object.values(peersRef.current).forEach((pc) => pc.close());
      peersRef.current = {};
      setVoiceActive(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !activeRoomCode || !token) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setVoiceActive(true);
      setMicMuted(false);

      // Signal peers on same team
      const myTeam = roomDetail?.members.find((m) => m.user_id === user?.id)?.team || 'A';
      const teammates = (roomDetail?.members || []).filter((m) => m.team === myTeam && m.user_id !== user?.id);
      for (const mate of teammates) {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        stream.getTracks().forEach((tr) => pc.addTrack(tr, stream));
        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            fetch(`/api/rooms/${activeRoomCode}/rtc`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ to_user_id: mate.user_id, signal_type: 'ice', payload: ev.candidate.toJSON() }),
            }).catch(() => {});
          }
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await fetch(`/api/rooms/${activeRoomCode}/rtc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to_user_id: mate.user_id, signal_type: 'offer', payload: offer }),
        });
        peersRef.current[mate.user_id] = pc;
      }
    } catch {
      setOrderMsg('Microphone permission denied or unavailable.');
    }
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const next = !micMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMicMuted(next);
  };

  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : activeMarket?.price || 3874.5;
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

  const calcLivePnl = (p: TraderPosition) => {
    const px = p.symbol === activeSymbol ? currentPrice : p.entry_price;
    return p.side === 'LONG' ? (px - p.entry_price) * p.qty : (p.entry_price - px) * p.qty;
  };

  // Fallback synthetic book for Yahoo Finance symbols so book never looks empty
  const displayAsks =
    asks.length > 0
      ? asks
      : [5, 4, 3, 2, 1].map((i) => ({ price: +(currentPrice + i * 0.5).toFixed(2), qty: +(12 + i * 3.1).toFixed(2) }));
  const displayBids =
    bids.length > 0
      ? bids
      : [1, 2, 3, 4, 5].map((i) => ({ price: +(currentPrice - i * 0.5).toFixed(2), qty: +(14 + i * 2.8).toFixed(2) }));

  const pendingProposals = (roomDetail?.proposals || []).filter((p) => p.status === 'pending');

  return (
    <div className="w-full space-y-3">
      {/* Active Team Room Scoreboard Banner */}
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
              Team B: <span className="text-sky-500 tabular-nums">${(roomDetail.account_b?.equity ?? roomDetail.room.starting_balance).toLocaleString()}</span>
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
            <button
              onClick={onExitRoom}
              className="px-2.5 py-1 rounded-full border border-[var(--border-subtle)] text-[0.75rem] cursor-pointer"
            >
              Exit Room
            </button>
          </div>
        </div>
      )}

      {/* Pending Team Trade Vote Banner */}
      {pendingProposals.length > 0 && (
        <div className="tt-card p-3 border-amber-500/50 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-[0.8125rem]">
            <strong className="text-amber-500">TEAM VOTE REQUIRED:</strong> @{pendingProposals[0].proposer_name} proposed{' '}
            <strong>
              {pendingProposals[0].side} {pendingProposals[0].symbol}
            </strong>{' '}
            @ ${pendingProposals[0].entry_price} (${pendingProposals[0].notional_usd.toLocaleString()})
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

      {/* Market Context Strip (Single-row on Mobile, Full Stats on Desktop) */}
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

        {/* Account Mode Switcher (Desktop) */}
        <div className="hidden sm:flex items-center gap-1 p-1 rounded-full bg-[var(--bg-subtle)] shrink-0">
          {(['demo', 'weekly_ranked'] as const).map((m) => (
            <button
              key={m}
              onClick={() => onAccountModeChange(m)}
              className={`px-3 py-1 rounded-full text-[0.75rem] font-semibold cursor-pointer ${
                activeAccountMode === m ? 'bg-[var(--text-primary)] text-[var(--bg-card)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              {m === 'demo' ? 'Demo $10K' : 'Weekly Ranked'}
            </button>
          ))}
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

      {/* Mobile-Only Segmented Tab Switcher (Single line, zero wrapping!) */}
      <div className="flex lg:hidden items-center gap-1 p-1 rounded-xl bg-[var(--bg-subtle)] overflow-x-auto no-scrollbar whitespace-nowrap">
        {(['chart', 'trade', 'book', 'positions', ...(roomDetail ? ['team'] : [])] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobilePane(tab as typeof mobilePane)}
            className={`flex-1 py-1.5 px-3 rounded-lg text-[0.75rem] font-semibold capitalize cursor-pointer ${
              mobilePane === tab ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs' : 'text-[var(--text-secondary)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main 3-Pane Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Pane 1: VestChart */}
        <div className={`lg:col-span-7 h-[28rem] lg:h-[34rem] ${mobilePane === 'chart' ? 'block' : 'hidden lg:block'}`}>
          <VestChart
            symbol={activeSymbol}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            candles={candles}
            positions={positions}
            roomDrawings={roomDetail?.drawings || []}
            onAddDrawing={handleAddDrawing}
            onDeleteDrawing={handleDeleteDrawing}
            theme={theme}
            wsConnected={wsConnected}
          />
        </div>

        {/* Pane 2: Orderbook & Trades */}
        <div className={`lg:col-span-2 tt-card p-3 flex flex-col justify-between h-[28rem] lg:h-[34rem] ${mobilePane === 'book' ? 'flex' : 'hidden lg:flex'}`}>
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
                <p className="text-[var(--text-secondary)] text-center py-6">Waiting for live trades...</p>
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

        {/* Pane 3: Order Ticket + Account Health */}
        <div className={`lg:col-span-3 space-y-3 ${mobilePane === 'trade' ? 'block' : 'hidden lg:block'}`}>
          <div className="tt-card p-4 space-y-3.5">
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
                <span className="text-[var(--text-secondary)]">Margin Allocation</span>
                <span className="font-semibold tabular-nums">{marginPct}% (${notionalUsd.toLocaleString()})</span>
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

          {/* Account Health Card */}
          <div className="tt-card p-4 space-y-2.5">
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
        </div>
      </div>

      {/* Sticky Quick Buy/Sell on Mobile Chart View */}
      {mobilePane === 'chart' && (
        <div className="grid grid-cols-2 gap-2 lg:hidden">
          <button
            onClick={() => setMobilePane('trade')}
            className="py-2.5 rounded-full bg-emerald-500 text-white text-[0.8125rem] font-semibold cursor-pointer"
          >
            Buy / Long
          </button>
          <button
            onClick={() => setMobilePane('trade')}
            className="py-2.5 rounded-full bg-rose-500 text-white text-[0.8125rem] font-semibold cursor-pointer"
          >
            Sell / Short
          </button>
        </div>
      )}

      {/* Team Chat Panel (shown on Team tab on mobile, or below 3-pane on desktop when in room) */}
      {roomDetail && (
        <div className={`tt-card p-4 space-y-3 ${mobilePane === 'team' ? 'block' : 'hidden lg:block'}`}>
          <div className="flex items-center justify-between">
            <h3 className="text-[0.875rem] font-bold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-sky-500" /> Team Chat & Activity ({roomDetail.room.code})
            </h3>
            <span className="text-[0.75rem] text-[var(--text-secondary)]">
              {roomDetail.members.map((m) => `@${m.username} (${m.team})`).join(' · ')}
            </span>
          </div>
          <div className="h-36 overflow-y-auto tt-subcard p-3 space-y-1.5 text-[0.75rem]">
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
            <button
              type="submit"
              className="px-4 py-2 rounded-full bg-[var(--text-primary)] text-[var(--bg-card)] text-[0.8125rem] font-semibold cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Bottom Positions / Orders / History Dock */}
      <div className={`tt-card p-4 space-y-3 ${mobilePane === 'positions' ? 'block' : 'hidden lg:block'}`}>
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

        {dockTab === 'positions' && (
          openPositions.length === 0 ? (
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
                          {p.symbol} <span className={p.side === 'LONG' ? 'text-emerald-500' : 'text-rose-500'}>{p.side} {p.leverage}x</span>
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
          )
        )}

        {dockTab === 'orders' && (
          pendingOrders.length === 0 ? (
            <p className="text-[0.8125rem] text-[var(--text-secondary)] py-4 text-center">No pending limit orders.</p>
          ) : (
            <div className="space-y-2">
              {pendingOrders.map((p) => (
                <div key={p.id} className="tt-subcard px-3 py-2 flex items-center justify-between text-[0.8125rem]">
                  <span>{p.symbol} {p.side} @ {p.entry_price}</span>
                  <button onClick={() => handleClosePos(p.id)} className="text-rose-500 text-[0.75rem] font-semibold cursor-pointer">
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {dockTab === 'history' && (
          closedHistory.length === 0 ? (
            <p className="text-[0.8125rem] text-[var(--text-secondary)] py-4 text-center">No closed trades yet.</p>
          ) : (
            <div className="space-y-2">
              {closedHistory.slice(0, 10).map((p) => (
                <div key={p.id} className="tt-subcard px-3 py-2 flex items-center justify-between text-[0.8125rem]">
                  <span>{p.symbol} {p.side} · Entry {p.entry_price} → {p.exit_price}</span>
                  <span className={`font-semibold tabular-nums ${p.pnl_usd >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {p.pnl_usd >= 0 ? '+' : ''}${p.pnl_usd.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};
