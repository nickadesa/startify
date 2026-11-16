import React, { useMemo, useState } from 'react';
import { TradeRecord } from '../types/arena';
import { Card } from './ui/card';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';

interface Props {
  trades: TradeRecord[];
  selectedAgentId: string | null;
}

type TimeframeKey = 'M5' | 'M15' | '1H' | '4H';
type ExecFilterKey = 'all' | 'limit' | 'zone_confirm' | 'market';

export const OteCandlestickChart: React.FC<Props> = ({ trades, selectedAgentId }) => {
  const [timeframe, setTimeframe] = useState<TimeframeKey>('1H');
  const [execFilter, setExecFilter] = useState<ExecFilterKey>('all');

  const tfConfig = useMemo(() => {
    const configs: Record<
      TimeframeKey,
      {
        label: string;
        swingLow: number;
        swingHigh: number;
        sweet705: number;
        ote618: number;
        ote786: number;
        tp1Neg027: number;
        tp2Neg0618: number;
        beLock: number;
        stepMinutes: number;
      }
    > = {
      M5: {
        label: '5-minute micro structure',
        swingLow: 4023.4,
        swingHigh: 4039.8,
        ote618: 4029.66,
        sweet705: 4028.24,
        ote786: 4026.91,
        tp1Neg027: 4044.23,
        tp2Neg0618: 4049.94,
        beLock: 4028.74,
        stepMinutes: 5,
      },
      M15: {
        label: '15-minute OTE setup zone',
        swingLow: 4018.2,
        swingHigh: 4043.6,
        ote618: 4027.9,
        sweet705: 4025.69,
        ote786: 4023.64,
        tp1Neg027: 4050.46,
        tp2Neg0618: 4059.3,
        beLock: 4026.19,
        stepMinutes: 15,
      },
      '1H': {
        label: '1-hour institutional impulse',
        swingLow: 4012.0,
        swingHigh: 4046.5,
        ote618: 4025.18,
        sweet705: 4022.18,
        ote786: 4019.38,
        tp1Neg027: 4055.82,
        tp2Neg0618: 4067.82,
        beLock: 4022.68,
        stepMinutes: 60,
      },
      '4H': {
        label: '4-hour macro trend leg',
        swingLow: 3994.0,
        swingHigh: 4052.0,
        ote618: 4016.16,
        sweet705: 4011.11,
        ote786: 4006.41,
        tp1Neg027: 4067.66,
        tp2Neg0618: 4087.85,
        beLock: 4011.61,
        stepMinutes: 240,
      },
    };
    return configs[timeframe];
  }, [timeframe]);

  const candles = useMemo(() => {
    const count = 42;
    const list: {
      idx: number;
      open: number;
      high: number;
      low: number;
      close: number;
      label: string;
    }[] = [];

    const { swingLow, swingHigh, sweet705, tp1Neg027, tp2Neg0618 } = tfConfig;
    let prevClose = swingLow + (swingHigh - swingLow) * 0.25;

    for (let i = 0; i < count; i++) {
      let target: number;
      if (i < 12) {
        // Impulse up from swingLow to swingHigh
        const t = i / 11;
        target = swingLow + t * (swingHigh - swingLow) + Math.sin(i * 1.3) * 1.4;
      } else if (i < 24) {
        // Controlled pullback into OTE 0.618 - 0.786 (touching 0.705 sweet spot)
        const t = (i - 12) / 11;
        target = swingHigh - t * (swingHigh - sweet705) + Math.cos(i * 1.1) * 1.1;
      } else {
        // Expansion from 0.705 sweet spot through Fib 0.0 -> TP1 (-0.27) -> TP2 (-0.618)
        const t = (i - 24) / (count - 25);
        target = sweet705 + t * (tp2Neg0618 - sweet705) * 0.88 + Math.sin(i * 0.9) * 1.3;
      }

      const open = Number(prevClose.toFixed(2));
      const close = Number(target.toFixed(2));
      const high = Number((Math.max(open, close) + 1.2 + (i % 3) * 0.55).toFixed(2));
      const low = Number((Math.min(open, close) - 1.1 - ((i + 1) % 3) * 0.5).toFixed(2));
      prevClose = close;

      const hr = (8 + Math.floor((i * tfConfig.stepMinutes) / 60)) % 24;
      const mn = (i * tfConfig.stepMinutes) % 60;
      list.push({
        idx: i,
        open,
        high,
        low,
        close,
        label: `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}`,
      });
    }
    return list;
  }, [tfConfig]);

  const oiProfileLevels = useMemo(() => {
    const { swingLow, tp2Neg0618, sweet705, tp1Neg027 } = tfConfig;
    const rows = 18;
    const minP = swingLow - 2;
    const maxP = tp2Neg0618 + 2;
    return Array.from({ length: rows }, (_, i) => {
      const price = minP + ((i + 0.5) / rows) * (maxP - minP);
      const distSweet = Math.abs(price - sweet705);
      const distTp1 = Math.abs(price - tp1Neg027);
      const weight =
        Math.exp(-distSweet / 6.0) * 0.95 +
        Math.exp(-distTp1 / 7.5) * 0.65 +
        0.18;
      return {
        price: Number(price.toFixed(2)),
        pct: Math.min(100, Math.round(weight * 88)),
        isCluster: distSweet < 3.2 || distTp1 < 3.2,
      };
    });
  }, [tfConfig]);

  const filteredTradesCount = useMemo(() => {
    const base = selectedAgentId
      ? trades.filter((t) => t.agent_id === selectedAgentId)
      : trades;
    if (execFilter === 'all') return base.length;
    return base.filter((t, i) => {
      const mode =
        t.order_type === 'market'
          ? 'market'
          : i % 3 === 0
          ? 'zone_confirm'
          : 'limit';
      return mode === execFilter;
    }).length;
  }, [trades, selectedAgentId, execFilter]);

  const width = 880;
  const height = 340;
  const padL = 16;
  const padR = 112;
  const padT = 18;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const minPrice = tfConfig.swingLow - 4;
  const maxPrice = tfConfig.tp2Neg0618 + 4;

  const yForPrice = (p: number) => {
    const r = (p - minPrice) / Math.max(maxPrice - minPrice, 1);
    return padT + plotH - r * plotH;
  };

  const xForCandle = (idx: number) => {
    return padL + ((idx + 0.5) / candles.length) * (plotW - 56);
  };

  const keyLevels = [
    { price: tfConfig.tp2Neg0618, label: 'TP2 -0.618 (50% runner)', color: '#00adff', dash: '3 3' },
    { price: tfConfig.tp1Neg027, label: 'TP1 -0.27 (50% partial)', color: '#30D158', dash: '3 3' },
    { price: tfConfig.swingHigh, label: 'Fib 0.0 (Break-even trigger)', color: '#A1A1AA', dash: '2 4' },
    { price: tfConfig.ote618, label: 'OTE 0.618', color: '#FFD60A', dash: '2 3' },
    { price: tfConfig.sweet705, label: 'OTE 0.705 sweet spot', color: '#00adff', dash: undefined },
    { price: tfConfig.ote786, label: 'OTE 0.786', color: '#FFD60A', dash: '2 3' },
    { price: tfConfig.swingLow, label: 'Fib 1.0 invalidation SL', color: '#FF453A', dash: '3 3' },
  ];

  return (
    <Card className="p-5 sm:p-6 space-y-5">
      {/* Top Bar Inspired by Reference Image 15 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-white/[0.07] pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#1C1C1E] border border-white/[0.1] flex items-center justify-center text-[11px] font-semibold text-[#00adff] font-mono-tabular">
              Au
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold tracking-[-0.015em] text-[#F5F5F7]">
                  XAU / USD
                </span>
                <Badge variant="secondary" className="font-mono-tabular">
                  Spread $0.20
                </Badge>
                <Badge variant="accent" className="font-mono-tabular">
                  {tfConfig.label}
                </Badge>
              </div>
              <p className="text-[12px] text-[#8E8E93] mt-0.5">
                Fibonacci OTE retracement (0.618–0.786), Break-Even lock, and -0.27 / -0.618 extensions
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as TimeframeKey)}>
            <TabsList>
              <TabsTrigger value="M5">M5</TabsTrigger>
              <TabsTrigger value="M15">M15</TabsTrigger>
              <TabsTrigger value="1H">1H</TabsTrigger>
              <TabsTrigger value="4H">4H</TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={execFilter} onValueChange={(v) => setExecFilter(v as ExecFilterKey)}>
            <TabsList>
              <TabsTrigger value="all">All ({filteredTradesCount})</TabsTrigger>
              <TabsTrigger value="limit">Limit</TabsTrigger>
              <TabsTrigger value="zone_confirm">Zone confirm</TabsTrigger>
              <TabsTrigger value="market">Market</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Chart with Shaded OTE Band & Right-Edge Open Interest Profile (Reference Image 15) */}
      <div className="relative w-full overflow-hidden rounded-xl bg-[#050507] border border-white/[0.06] p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[290px] sm:h-[340px] select-none">
          {/* OTE 0.618 - 0.786 Shaded Band */}
          <rect
            x={padL}
            y={yForPrice(tfConfig.ote618)}
            width={plotW - 48}
            height={Math.max(4, yForPrice(tfConfig.ote786) - yForPrice(tfConfig.ote618))}
            fill="rgba(0, 173, 255, 0.08)"
          />

          {/* Partial Close Profit Band (Fib 0.0 to -0.618) */}
          <rect
            x={padL}
            y={yForPrice(tfConfig.tp2Neg0618)}
            width={plotW - 48}
            height={Math.max(4, yForPrice(tfConfig.swingHigh) - yForPrice(tfConfig.tp2Neg0618))}
            fill="rgba(48, 209, 88, 0.05)"
          />

          {/* Key Fib & Extension Lines */}
          {keyLevels.map((lvl) => {
            const y = yForPrice(lvl.price);
            return (
              <g key={lvl.label}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke={lvl.color}
                  strokeOpacity={lvl.dash ? 0.45 : 0.85}
                  strokeWidth={lvl.dash ? 1 : 1.5}
                  strokeDasharray={lvl.dash}
                />
                <text
                  x={width - padR + 8}
                  y={y + 3.5}
                  className="fill-[#A1A1AA] text-[10.5px] font-mono-tabular"
                >
                  ${lvl.price.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Candlesticks */}
          {candles.map((c) => {
            const x = xForCandle(c.idx);
            const isBull = c.close >= c.open;
            const color = isBull ? '#30D158' : '#FF453A';
            const bodyTop = yForPrice(Math.max(c.open, c.close));
            const bodyBot = yForPrice(Math.min(c.open, c.close));
            const bodyH = Math.max(2, bodyBot - bodyTop);

            return (
              <g key={c.idx}>
                <line
                  x1={x}
                  y1={yForPrice(c.high)}
                  x2={x}
                  y2={yForPrice(c.low)}
                  stroke={color}
                  strokeWidth={1.1}
                  strokeOpacity={0.85}
                />
                <rect
                  x={x - 3.5}
                  y={bodyTop}
                  width={7}
                  height={bodyH}
                  rx={1.5}
                  fill={color}
                />
              </g>
            );
          })}

          {/* Execution & Partial Close Markers on Chart */}
          <g>
            {/* Entry Marker at 0.705 Sweet Spot (Candle 23) */}
            <circle
              cx={xForCandle(23)}
              cy={yForPrice(tfConfig.sweet705)}
              r={5}
              fill="#00adff"
              stroke="#000000"
              strokeWidth={2}
            />
            {/* Break-Even Trigger at Fib 0.0 (Candle 30) */}
            <circle
              cx={xForCandle(30)}
              cy={yForPrice(tfConfig.swingHigh)}
              r={4.5}
              fill="#FFD60A"
              stroke="#000000"
              strokeWidth={2}
            />
            {/* TP1 -0.27 50% Partial Close (Candle 35) */}
            <circle
              cx={xForCandle(35)}
              cy={yForPrice(tfConfig.tp1Neg027)}
              r={5}
              fill="#30D158"
              stroke="#000000"
              strokeWidth={2}
            />
            {/* TP2 -0.618 50% Runner Target (Candle 40) */}
            <circle
              cx={xForCandle(40)}
              cy={yForPrice(tfConfig.tp2Neg0618) + 8}
              r={5}
              fill="#00adff"
              stroke="#000000"
              strokeWidth={2}
            />
          </g>

          {/* Right-Edge Open Interest Profile Bars (Reference Image 15 Style) */}
          {oiProfileLevels.map((row, idx) => {
            const y = yForPrice(row.price);
            const barW = (row.pct / 100) * 44;
            const rightEdgeX = width - padR - 2;
            return (
              <rect
                key={idx}
                x={rightEdgeX - barW}
                y={y - 4}
                width={barW}
                height={7}
                rx={1.5}
                fill={row.isCluster ? '#00adff' : 'rgba(255,255,255,0.16)'}
                fillOpacity={row.isCluster ? 0.65 : 0.4}
              />
            );
          })}

          {/* X-Axis Timestamps */}
          {candles.map((c) => {
            if (c.idx % 7 !== 0) return null;
            return (
              <text
                key={c.idx}
                x={xForCandle(c.idx)}
                y={height - 8}
                textAnchor="middle"
                className="fill-[#636366] text-[11px] font-mono-tabular"
              >
                {c.label}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Bottom Split Cards (Reference Image 15 Low/High Split Style) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="rounded-xl bg-[#121215] border border-white/[0.06] p-4 space-y-1">
          <div className="text-[12px] text-[#8E8E93]">OTE 0.705 sweet spot entry</div>
          <div className="text-[20px] font-semibold font-mono-tabular text-[#F5F5F7]">
            ${tfConfig.sweet705.toFixed(2)}
          </div>
          <div className="text-[12px] text-[#00adff] font-mono-tabular">
            Zone ${tfConfig.ote786.toFixed(2)} – ${tfConfig.ote618.toFixed(2)}
          </div>
        </div>

        <div className="rounded-xl bg-[#121215] border border-white/[0.06] p-4 space-y-1">
          <div className="text-[12px] text-[#8E8E93]">Break-even protection (SL lock)</div>
          <div className="text-[20px] font-semibold font-mono-tabular text-[#F5F5F7]">
            ${tfConfig.beLock.toFixed(2)}
          </div>
          <div className="text-[12px] text-[#A1A1AA]">
            Activated automatically at +1.0R / Fib 0.0 (${tfConfig.swingHigh.toFixed(2)})
          </div>
        </div>

        <div className="rounded-xl bg-[#121215] border border-white/[0.06] p-4 space-y-1">
          <div className="text-[12px] text-[#8E8E93]">Multi-lot partial close targets</div>
          <div className="text-[20px] font-semibold font-mono-tabular text-[#30D158]">
            ${tfConfig.tp1Neg027.toFixed(2)}{' '}
            <span className="text-[14px] text-[#00adff]">→ ${tfConfig.tp2Neg0618.toFixed(2)}</span>
          </div>
          <div className="text-[12px] text-[#A1A1AA]">
            50% closed at Fib -0.27 • 50% runner to Fib -0.618
          </div>
        </div>
      </div>
    </Card>
  );
};
