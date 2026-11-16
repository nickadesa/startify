import React, { useMemo, useState } from 'react';
import { TradeRecord } from '../types/arena';

interface Props {
  trade: TradeRecord;
  agentName: string;
  agentColor: string;
}

type ChartTimeframe = 'M5' | 'M15' | '1H' | '4H';

export const OteCandlestickChart: React.FC<Props> = ({ trade, agentName, agentColor }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tf, setTf] = useState<ChartTimeframe>('M15');

  const {
    bars,
    minPrice,
    maxPrice,
    ote,
    oiBins,
    tp1Neg027,
    tp2Neg0618,
    beLockPrice,
    fib0Price,
  } = useMemo(() => {
    const snap = trade.snapshot || ({} as TradeRecord['snapshot']);
    const isLong = trade.action === 'long';
    const swingLow = snap?.last_swing?.low ?? (isLong ? trade.entry - 14 : trade.entry - 22);
    const swingHigh = snap?.last_swing?.high ?? (isLong ? trade.entry + 10 : trade.entry + 14);
    const rng = Math.max(Math.abs(swingHigh - swingLow), 8);

    const oteZone = snap?.ote ?? {
      zone_low: Number((isLong ? swingHigh - 0.786 * rng : swingLow + 0.618 * rng).toFixed(2)),
      zone_high: Number((isLong ? swingHigh - 0.618 * rng : swingLow + 0.786 * rng).toFixed(2)),
      sweet_spot: trade.entry,
      invalidation: trade.stop_loss,
    };

    const fib0 = Number((isLong ? swingHigh : swingLow).toFixed(2));
    // Exact Fib -0.27 (Partial Close 50%) and Fib -0.618 (Runner 50%) extensions
    const calcTp1Neg027 = Number((isLong ? swingHigh + 0.27 * rng : swingLow - 0.27 * rng).toFixed(2));
    const calcTp2Neg0618 = Number((isLong ? swingHigh + 0.618 * rng : swingLow - 0.618 * rng).toFixed(2));

    const tp1Val = trade.tp_list?.[0]?.price ?? calcTp1Neg027;
    const tp2Val = trade.tp_list?.[1]?.price ?? calcTp2Neg0618;
    const beLock = Number((isLong ? trade.entry + 0.5 : trade.entry - 0.5).toFixed(2));

    const count = 28;
    const tfScale = tf === 'M5' ? 0.45 : tf === 'M15' ? 0.7 : tf === '1H' ? 1.0 : 1.45;
    const stepMinutes = tf === 'M5' ? 5 : tf === 'M15' ? 15 : tf === '1H' ? 60 : 240;

    const generated: {
      idx: number;
      timeLabel: string;
      open: number;
      high: number;
      low: number;
      close: number;
      phase: string;
    }[] = [];

    let prevClose = isLong ? swingLow + 1.5 : swingHigh - 1.5;
    for (let i = 0; i < count; i++) {
      let target: number;
      let phase = `${tf} Impulse Leg (Swing 1.0 -> 0.0)`;
      if (i < 9) {
        const p = (i + 1) / 9;
        target = isLong ? swingLow + (swingHigh - swingLow) * p : swingHigh - (swingHigh - swingLow) * p;
      } else if (i < 15) {
        phase = `${tf} Fib OTE Pullback (0.618 - 0.786 / 0.705 Sweet Spot)`;
        const p = (i - 8) / 6;
        const startP = isLong ? swingHigh : swingLow;
        target = startP + (trade.entry - startP) * Math.min(p * 1.05, 1);
      } else if (i < 21) {
        phase = `${tf} Break-Even Lock ('กันหน้าทุน') & Fib -0.27 Partial Close (50%)`;
        const p = (i - 14) / 6;
        target = trade.entry + (tp1Val - trade.entry) * p;
      } else {
        phase = `${tf} Runner Expansion to Fib -0.618 Extension (50% Lot)`;
        const p = (i - 20) / (count - 21);
        target = tp1Val + (trade.exit_price - tp1Val) * p;
      }

      const wave = Math.sin(i * 1.45 + stepMinutes * 0.1) * 1.35 * tfScale;
      const open = Number(prevClose.toFixed(2));
      const close = Number((target + wave * 0.4).toFixed(2));
      const wickUp = (Math.abs(Math.cos(i * 1.9)) * 1.9 + 0.5) * tfScale;
      const wickDn = (Math.abs(Math.sin(i * 1.3)) * 1.8 + 0.5) * tfScale;
      let high = Number((Math.max(open, close) + wickUp).toFixed(2));
      let low = Number((Math.min(open, close) - wickDn).toFixed(2));

      if (i === 14) {
        low = Math.min(low, trade.entry - 0.35);
        high = Math.max(high, trade.entry + 0.75);
      }

      const totalMins = 8 * 60 + i * stepMinutes;
      const hh = String(Math.floor(totalMins / 60) % 24).padStart(2, '0');
      const mm = String(totalMins % 60).padStart(2, '0');

      generated.push({
        idx: i,
        timeLabel: `${hh}:${mm}`,
        open,
        high,
        low,
        close,
        phase,
      });
      prevClose = close;
    }

    const allPrices = [
      ...generated.flatMap((b) => [b.high, b.low]),
      oteZone.zone_low,
      oteZone.zone_high,
      trade.entry,
      trade.stop_loss,
      trade.exit_price,
      tp1Val,
      tp2Val,
      fib0,
    ];
    const minP = Math.floor(Math.min(...allPrices) - 4);
    const maxP = Math.ceil(Math.max(...allPrices) + 4);

    const binCount = 14;
    const step = (maxP - minP) / binCount;
    const bins = Array.from({ length: binCount }, (_, idx) => {
      const priceMid = Number((minP + (idx + 0.5) * step).toFixed(2));
      const distOte = Math.abs(priceMid - oteZone.sweet_spot);
      const distTp = Math.abs(priceMid - tp1Val);
      const score = Math.max(
        18,
        Math.round(
          95 * Math.exp(-(distOte * distOte) / 28) +
            72 * Math.exp(-(distTp * distTp) / 35) +
            ((idx * 17) % 22)
        )
      );
      const isRankWall = distOte < step * 1.1 || distTp < step * 1.1;
      return { priceMid, score, isRankWall };
    });

    return {
      bars: generated,
      minPrice: minP,
      maxPrice: maxP,
      ote: oteZone,
      oiBins: bins,
      tp1Neg027: tp1Val,
      tp2Neg0618: tp2Val,
      beLockPrice: beLock,
      fib0Price: fib0,
    };
  }, [trade, tf]);

  const width = 820;
  const height = 340;
  const padLeft = 58;
  const padRight = 108;
  const padTop = 20;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const yForPrice = (p: number) => {
    const ratio = (p - minPrice) / Math.max(maxPrice - minPrice, 1);
    return padTop + plotH * (1 - Math.min(Math.max(ratio, 0), 1));
  };

  const xForIdx = (idx: number) => padLeft + ((idx + 0.5) / bars.length) * plotW;

  const oteTopY = yForPrice(ote.zone_high);
  const oteBotY = yForPrice(ote.zone_low);
  const sweetY = yForPrice(ote.sweet_spot);
  const entryY = yForPrice(trade.entry);
  const slY = yForPrice(trade.stop_loss);
  const beY = yForPrice(beLockPrice);
  const fib0Y = yForPrice(fib0Price);
  const tp1Y = yForPrice(tp1Neg027);
  const tp2Y = yForPrice(tp2Neg0618);

  const hoveredBar = hoverIdx !== null ? bars[hoverIdx] : bars[14];

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#07090E] p-3.5 space-y-3">
      {/* Top Bar with Multi-Timeframe Switcher (M5 / M15 / 1H / 4H) & Fib Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: agentColor }}
          />
          <span className="font-semibold text-white">
            XAUUSD • {agentName} ({trade.action.toUpperCase()} {trade.lot.toFixed(2)} Lot)
          </span>

          {/* Timeframe Selector (M5, M15, 1H, 4H) */}
          <div className="flex items-center gap-1 bg-[#0C1017] border border-[#1E2636] rounded-lg p-0.5 ml-1">
            {(['M5', 'M15', '1H', '4H'] as ChartTimeframe[]).map((itemTf) => (
              <button
                key={itemTf}
                onClick={() => setTf(itemTf)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-all cursor-pointer ${
                  tf === itemTf
                    ? 'bg-[#00adff] text-[#07090E]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {itemTf}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono-tabular">
          <span className="text-[#00adff]">
            OTE 0.705: ${ote.sweet_spot.toFixed(2)}
          </span>
          <span className="text-amber-300">
            BE Lock (กันหน้าทุน): ${beLockPrice.toFixed(2)}
          </span>
          <span className="text-emerald-400">
            TP1 (-0.27 • 50% Partial): ${tp1Neg027.toFixed(2)}
          </span>
          <span className="text-teal-300">
            TP2 (-0.618 • 50% Runner): ${tp2Neg0618.toFixed(2)}
          </span>
          <span className="text-rose-400">SL (1.0): ${trade.stop_loss.toFixed(2)}</span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[640px] select-none"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="oteZoneFill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#00adff" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#00adff" stopOpacity="0.06" />
            </linearGradient>
          </defs>

          {/* Horizontal Price Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
            const p = minPrice + t * (maxPrice - minPrice);
            const y = yForPrice(p);
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="rgba(255,255,255,0.05)"
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#64748B"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  ${p.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Shaded Fibonacci OTE Zone (0.618 - 0.786) */}
          <rect
            x={padLeft}
            y={Math.min(oteTopY, oteBotY)}
            width={plotW}
            height={Math.max(Math.abs(oteBotY - oteTopY), 10)}
            fill="url(#oteZoneFill)"
            stroke="#00adff"
            strokeOpacity="0.4"
            strokeWidth="1"
          />
          <text
            x={padLeft + 8}
            y={Math.min(oteTopY, oteBotY) + 12}
            fill="#38BDF8"
            fontSize="9.5"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
          >
            FIB OTE ZONE (0.618 – 0.786) • 0.705 SWEET SPOT (${ote.sweet_spot.toFixed(2)})
          </text>

          {/* OTE 0.705 Sweet Spot Line */}
          <line
            x1={padLeft}
            y1={sweetY}
            x2={width - padRight}
            y2={sweetY}
            stroke="#00adff"
            strokeWidth="1.2"
            strokeDasharray="5 3"
          />

          {/* Fib 0.0 (Swing High/Low Liquidity) */}
          <line
            x1={padLeft}
            y1={fib0Y}
            x2={width - padRight}
            y2={fib0Y}
            stroke="#94A3B8"
            strokeWidth="0.9"
            strokeDasharray="2 3"
          />
          <text
            x={padLeft + 8}
            y={fib0Y - 3}
            fill="#94A3B8"
            fontSize="8.5"
            fontFamily="JetBrains Mono, monospace"
          >
            FIB 0.0 SWING (${fib0Price.toFixed(2)}) → TRIGGER BREAK-EVEN
          </text>

          {/* Break-Even Lock Line ("กันหน้าทุน") */}
          <line
            x1={xForIdx(14)}
            y1={beY}
            x2={width - padRight}
            y2={beY}
            stroke="#FBBF24"
            strokeWidth="1.2"
            strokeDasharray="4 2"
          />
          <text
            x={xForIdx(15)}
            y={beY - 4}
            fill="#FBBF24"
            fontSize="8.5"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
          >
            SL MOVED TO BREAK-EVEN (กันหน้าทุน ${beLockPrice.toFixed(2)})
          </text>

          {/* TP1 Line: Fib -0.27 Extension (Partial Close 50%) */}
          <line
            x1={xForIdx(14)}
            y1={tp1Y}
            x2={width - padRight}
            y2={tp1Y}
            stroke="#10B981"
            strokeWidth="1.3"
            strokeDasharray="4 2"
          />
          <text
            x={width - padRight - 6}
            y={tp1Y - 4}
            textAnchor="end"
            fill="#10B981"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
          >
            FIB -0.27 TP1 (50% PARTIAL CLOSE) ${tp1Neg027.toFixed(2)}
          </text>

          {/* TP2 Line: Fib -0.618 Extension (Runner Close 50%) */}
          <line
            x1={xForIdx(18)}
            y1={tp2Y}
            x2={width - padRight}
            y2={tp2Y}
            stroke="#14B8A6"
            strokeWidth="1.1"
            strokeDasharray="2 2"
          />
          <text
            x={width - padRight - 6}
            y={tp2Y - 4}
            textAnchor="end"
            fill="#2DD4BF"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
          >
            FIB -0.618 TP2 (50% RUNNER) ${tp2Neg0618.toFixed(2)}
          </text>

          {/* Initial Stop Loss Line (Fib 1.0 Invalidation) */}
          <line
            x1={xForIdx(13)}
            y1={slY}
            x2={xForIdx(19)}
            y2={slY}
            stroke="#F43F5E"
            strokeWidth="1.2"
            strokeDasharray="4 2"
          />
          <text
            x={xForIdx(14)}
            y={slY + 11}
            fill="#F43F5E"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
          >
            INITIAL SL (1.0) ${trade.stop_loss.toFixed(2)}
          </text>

          {/* Candlesticks */}
          {bars.map((b, idx) => {
            const cx = xForIdx(idx);
            const isBull = b.close >= b.open;
            const color = isBull ? '#10B981' : '#F43F5E';
            const highY = yForPrice(b.high);
            const lowY = yForPrice(b.low);
            const openY = yForPrice(b.open);
            const closeY = yForPrice(b.close);
            const bodyTop = Math.min(openY, closeY);
            const bodyH = Math.max(Math.abs(closeY - openY), 2.5);
            const isEntryBar = idx === 14;
            const isPartialBar = idx === 20;

            return (
              <g
                key={b.idx}
                onMouseEnter={() => setHoverIdx(idx)}
                className="cursor-crosshair"
              >
                <line
                  x1={cx}
                  y1={highY}
                  x2={cx}
                  y2={lowY}
                  stroke={color}
                  strokeWidth="1.2"
                />
                <rect
                  x={cx - 5.5}
                  y={bodyTop}
                  width={11}
                  height={bodyH}
                  rx={1.5}
                  fill={color}
                  stroke={isEntryBar ? '#00adff' : isPartialBar ? '#FBBF24' : 'none'}
                  strokeWidth={isEntryBar || isPartialBar ? '1.8' : '0'}
                />

                {isEntryBar && (
                  <g>
                    <circle
                      cx={cx}
                      cy={entryY}
                      r={5}
                      fill="#00adff"
                      stroke="#07090E"
                      strokeWidth="1.5"
                    />
                    <text
                      x={cx}
                      y={entryY - 9}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="9.5"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      OTE ENTRY
                    </text>
                  </g>
                )}

                {isPartialBar && (
                  <g>
                    <circle
                      cx={cx}
                      cy={tp1Y}
                      r={4.5}
                      fill="#FBBF24"
                      stroke="#07090E"
                      strokeWidth="1.5"
                    />
                    <text
                      x={cx}
                      y={tp1Y - 8}
                      textAnchor="middle"
                      fill="#FBBF24"
                      fontSize="8.5"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      50% PARTIAL + BE
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Right-Axis Horizontal Open Interest Profile */}
          <g transform={`translate(${width - padRight + 8}, 0)`}>
            <text
              x={0}
              y={padTop - 5}
              fill="#94A3B8"
              fontSize="9"
              fontFamily="JetBrains Mono, monospace"
            >
              OI PROFILE
            </text>
            {oiBins.map((bin, i) => {
              const by = yForPrice(bin.priceMid);
              const bw = (bin.score / 100) * (padRight - 20);
              return (
                <g key={i}>
                  <rect
                    x={0}
                    y={by - 5}
                    width={Math.max(bw, 4)}
                    height={9}
                    rx={2}
                    fill={bin.isRankWall ? '#00adff' : '#334155'}
                    fillOpacity={bin.isRankWall ? 0.85 : 0.45}
                  />
                </g>
              );
            })}
          </g>

          {/* Bottom Time Labels */}
          {bars
            .filter((_, i) => i % 4 === 0)
            .map((b) => (
              <text
                key={b.idx}
                x={xForIdx(b.idx)}
                y={height - 8}
                textAnchor="middle"
                fill="#64748B"
                fontSize="9.5"
                fontFamily="JetBrains Mono, monospace"
              >
                {b.timeLabel}
              </text>
            ))}
        </svg>
      </div>

      {/* Bottom Hover Bar Details + Multi-Timeframe Confluence Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06] text-[11px] text-slate-400 font-mono-tabular">
        <div>
          Phase (<span className="text-[#00adff] font-bold">{tf}</span>):{' '}
          <span className="text-slate-200 font-medium">{hoveredBar.phase}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-1.5 py-0.5 rounded bg-[#00adff]/15 text-[#00adff] text-[10px]">
            4H/1H/M15/M5 Aligned
          </span>
          <span>O: ${hoveredBar.open.toFixed(2)}</span>
          <span>H: ${hoveredBar.high.toFixed(2)}</span>
          <span>L: ${hoveredBar.low.toFixed(2)}</span>
          <span className="text-white">C: ${hoveredBar.close.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};
