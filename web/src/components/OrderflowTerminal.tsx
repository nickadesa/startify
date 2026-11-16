import React, { useEffect, useRef, useState } from 'react';
import { Radio, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
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

export const OrderflowTerminal: React.FC = () => {
  const [ofState, setOfState] = useState<OrderflowState | null>(null);
  const [desk, setDesk] = useState<DeskEvaluation | null>(null);
  const [liveCandles, setLiveCandles] = useState<ChartCandle[]>([]);
  const [chartOte, setChartOte] = useState<ChartOteOverlay | null>(null);
  const [timeframe, setTimeframe] = useState<string>('M15');
  const [wsConnected, setWsConnected] = useState(false);
  const [sendingDiscord, setSendingDiscord] = useState(false);
  const [discordStatus, setDiscordStatus] = useState<string | null>(null);
  const cvdRef = useRef<number>(0);

  const fetchBackendOrderflowAndDesk = async (sendDiscord = false, tf = timeframe) => {
    try {
      const [ofRes, deskRes, snapRes, klinesRes] = await Promise.all([
        fetch('/api/orderflow/live').then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/desk/evaluate?send_discord=${sendDiscord}`).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch('/api/snapshot/live').then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/klines?interval=${tf}&limit=80`).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (ofRes) setOfState(ofRes);
      if (klinesRes?.candles && klinesRes.candles.length > 0) {
        setLiveCandles(klinesRes.candles);
      } else if (snapRes?.recent_candles_h1) {
        setLiveCandles(snapRes.recent_candles_h1);
      }
      if (snapRes?.snapshot?.ote) {
        setChartOte(snapRes.snapshot.ote);
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
    fetchBackendOrderflowAndDesk(false, timeframe);
  }, [timeframe]);

  useEffect(() => {
    fetchBackendOrderflowAndDesk(false);
    const poll = setInterval(() => fetchBackendOrderflowAndDesk(false), 15000);

    // Direct 60fps browser WebSocket to Binance PAXGUSDT for live TapeDelta-style Orderflow
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(
        'wss://fstream.binance.com/stream?streams=paxgusdt@aggTrade/paxgusdt@depth10@500ms'
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
            setOfState((prev) =>
              prev
                ? {
                    ...prev,
                    source: 'Binance PAXGUSDT WebSocket (Live)',
                    paxg_price: px,
                    buy_volume: prev.buy_volume + (isSell ? 0 : qty),
                    sell_volume: prev.sell_volume + (isSell ? qty : 0),
                    net_delta: +(prev.net_delta + delta).toFixed(3),
                    cvd_usd: +cvdRef.current.toFixed(2),
                    delta_bias: prev.net_delta + delta >= 0 ? 'bullish' : 'bearish',
                  }
                : prev
            );
          } else if (msg.stream?.includes('depth10') && msg.data) {
            const bids = (msg.data.b || []).slice(0, 8).map((x: string[]) => ({
              price: parseFloat(x[0]),
              qty: parseFloat(x[1]),
            }));
            const asks = (msg.data.a || []).slice(0, 8).map((x: string[]) => ({
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
  }, []);

  const handleSendSignalToDiscord = async () => {
    setSendingDiscord(true);
    setDiscordStatus(null);
    await fetchBackendOrderflowAndDesk(true);
    setSendingDiscord(false);
  };

  return (
    <div className="space-y-6 min-w-0">
      {/* Top Status & Action Bar */}
      <Card className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <Radio
              className={`w-4 h-4 shrink-0 ${wsConnected ? 'text-[#30D158]' : 'text-[#00adff]'}`}
              strokeWidth={1.75}
            />
            <h2 className="text-[16px] font-semibold tracking-tight text-white uppercase">
              Real-Time XAUUSD / PAXGUSDT Orderflow & 8-AI Desk
            </h2>
            <Badge variant={wsConnected ? 'positive' : 'secondary'}>
              {wsConnected ? 'WS LIVE' : '15S POLL'}
            </Badge>
          </div>
          <p className="text-[13px] text-[#A1A1AA]">
            Live Bid/Ask Footprint Delta, Resting Orderbook Depth Walls, Perp OI, and 8-Specialist Team Execution ($1,000.00 Portfolio)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSendSignalToDiscord}
            disabled={sendingDiscord}
          >
            <Send className="w-3.5 h-3.5" />
            <span>{sendingDiscord ? 'Sending...' : 'Evaluate & Send to Discord'}</span>
          </Button>
        </div>
      </Card>

      {discordStatus && (
        <div className="border border-[#00adff]/40 bg-[#0A0A0A] px-4 py-2.5 text-[13px] text-white flex items-center justify-between">
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

      {/* 4 Key Orderflow Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 space-y-1">
          <div className="text-[11px] uppercase tracking-[0.04em] text-[#71717A]">
            PAXGUSDT Live Tape
          </div>
          <div className="text-[26px] font-semibold tabular-nums text-white">
            ${(ofState?.paxg_price ?? 4028.9).toFixed(2)}
          </div>
          <div className="text-[12px] text-[#A1A1AA] truncate">
            {ofState?.source || 'Connecting...'}
          </div>
        </Card>

        <Card className="p-5 space-y-1">
          <div className="text-[11px] uppercase tracking-[0.04em] text-[#71717A]">
            Footprint Net Delta
          </div>
          <div
            className={`text-[26px] font-semibold tabular-nums ${
              (ofState?.net_delta ?? 0) >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
            }`}
          >
            {(ofState?.net_delta ?? 0) >= 0 ? '+' : ''}
            {(ofState?.net_delta ?? 0).toFixed(2)}
          </div>
          <div className="text-[12px] text-[#A1A1AA] tabular-nums">
            Buy {(ofState?.buy_volume ?? 0).toFixed(1)} / Sell {(ofState?.sell_volume ?? 0).toFixed(1)}
          </div>
        </Card>

        <Card className="p-5 space-y-1">
          <div className="text-[11px] uppercase tracking-[0.04em] text-[#71717A]">
            Perp Open Interest
          </div>
          <div className="text-[26px] font-semibold tabular-nums text-white">
            {(ofState?.open_interest_paxg ?? 0).toLocaleString()}
          </div>
          <div className="text-[12px] text-[#A1A1AA] tabular-nums">
            Funding {(ofState?.funding_rate_pct ?? 0).toFixed(4)}%
          </div>
        </Card>

        <Card className="p-5 space-y-1">
          <div className="text-[11px] uppercase tracking-[0.04em] text-[#71717A]">
            Team Desk Conviction
          </div>
          <div className="text-[26px] font-semibold tabular-nums text-[#00adff]">
            {desk?.conviction_score ?? '--'}/100
          </div>
          <div className="text-[12px] text-[#A1A1AA] uppercase">
            {desk ? `${desk.direction} • ${desk.execution_mode}` : 'Evaluating...'}
          </div>
        </Card>
      </div>

      {/* Orderbook Depth Heatmap + Active Team Signal Plan */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Resting Orderbook Depth */}
        <Card className="xl:col-span-5 p-5 space-y-4">
          <div className="border-b border-white/[0.1] pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-semibold uppercase tracking-[0.03em] text-white">
                Orderbook Depth Walls
              </h3>
              <p className="text-[12px] text-[#71717A]">
                Resting liquidity bids & asks (PAXGUSDT)
              </p>
            </div>
            <Badge variant="secondary">L2 DEPTH</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 text-[12px] tabular-nums">
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-[0.04em] text-[#30D158] pb-1 border-b border-white/[0.08]">
                Bids (Support)
              </div>
              {(ofState?.orderbook_bids || []).slice(0, 6).map((b, idx) => (
                <div key={idx} className="flex items-center justify-between py-0.5">
                  <span className="text-white">${b.price.toFixed(2)}</span>
                  <span className="text-[#30D158]">{b.qty.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-[0.04em] text-[#FF453A] pb-1 border-b border-white/[0.08]">
                Asks (Resistance)
              </div>
              {(ofState?.orderbook_asks || []).slice(0, 6).map((a, idx) => (
                <div key={idx} className="flex items-center justify-between py-0.5">
                  <span className="text-white">${a.price.toFixed(2)}</span>
                  <span className="text-[#FF453A]">{a.qty.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* 8-AI Team Portfolio Plan ($1,000) */}
        <Card className="xl:col-span-7 p-5 space-y-4">
          <div className="border-b border-white/[0.1] pb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[14px] font-semibold uppercase tracking-[0.03em] text-white">
                $1,000 Portfolio Desk Signal Plan
              </h3>
              <p className="text-[12px] text-[#71717A]">
                Coordinated execution with Break-Even lock & -0.27 / -0.618 partial targets
              </p>
            </div>
            {desk && (
              <Badge variant={desk.approved ? 'positive' : 'secondary'}>
                {desk.approved ? 'APPROVED' : 'HOLD'}
              </Badge>
            )}
          </div>

          {desk && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 tabular-nums">
                <div className="border border-white/[0.1] p-3 bg-[#000000]">
                  <div className="text-[10px] uppercase text-[#71717A]">Side</div>
                  <div
                    className={`text-[15px] font-semibold uppercase mt-0.5 ${
                      desk.direction === 'long' ? 'text-[#30D158]' : 'text-[#FF453A]'
                    }`}
                  >
                    {desk.direction}
                  </div>
                </div>
                <div className="border border-white/[0.1] p-3 bg-[#000000]">
                  <div className="text-[10px] uppercase text-[#71717A]">Entry</div>
                  <div className="text-[15px] font-semibold text-white mt-0.5">
                    ${desk.entry.toFixed(2)}
                  </div>
                </div>
                <div className="border border-white/[0.1] p-3 bg-[#000000]">
                  <div className="text-[10px] uppercase text-[#71717A]">Stop Loss</div>
                  <div className="text-[15px] font-semibold text-[#FF453A] mt-0.5">
                    ${desk.stop_loss.toFixed(2)}
                  </div>
                </div>
                <div className="border border-white/[0.1] p-3 bg-[#000000]">
                  <div className="text-[10px] uppercase text-[#71717A]">TP1 (BE)</div>
                  <div className="text-[15px] font-semibold text-[#30D158] mt-0.5">
                    ${desk.tp1.toFixed(2)}
                  </div>
                </div>
                <div className="border border-white/[0.1] p-3 bg-[#000000]">
                  <div className="text-[10px] uppercase text-[#71717A]">TP2 (-0.27)</div>
                  <div className="text-[15px] font-semibold text-[#00adff] mt-0.5">
                    ${desk.tp2.toFixed(2)}
                  </div>
                </div>
                <div className="border border-white/[0.1] p-3 bg-[#000000]">
                  <div className="text-[10px] uppercase text-[#71717A]">Lot / Risk</div>
                  <div className="text-[15px] font-semibold text-white mt-0.5">
                    {desk.lot} ({desk.risk_pct}%)
                  </div>
                </div>
              </div>

              <div className="text-[13px] text-[#A1A1AA] border-l-2 border-[#00adff] pl-3">
                {desk.rationale}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 8-AI Specialist Role Matrix */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b border-white/[0.1] flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold uppercase tracking-[0.03em] text-white">
              8-AI Specialist Team Responsibilities
            </h3>
            <p className="text-[12px] text-[#71717A] mt-0.5">
              Each AI model owns a distinct analytical domain before casting its vote
            </p>
          </div>
          <Badge variant="accent">8 SPECIALISTS</Badge>
        </div>

        <div className="overflow-x-auto w-full">
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
                <TableCell className="font-medium text-white whitespace-nowrap">
                  {v.display_name}
                </TableCell>
                <TableCell className="text-[#A1A1AA] whitespace-nowrap">
                  {v.role_title}
                </TableCell>
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
                <TableCell className="text-[#A1A1AA] max-w-[360px] truncate">
                  {v.note}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </Card>
    </div>
  );
};
