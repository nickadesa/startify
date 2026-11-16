import React, { useMemo, useState } from "react";
import { AITrader, PnLCandle } from "../types/arena";
import { BrandIcon } from "./BrandIcon";

export type ChartMode = "equity" | "candles" | "drawdown" | "matrix";

export const MiniSparkline: React.FC<{ data: number[]; positive: boolean }> = ({ data, positive }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 36;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = positive ? "var(--accent-green)" : "var(--accent-red)";
  return (
    <svg width="100%" height="36" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
};

interface ArenaChartsProps {
  ais: AITrader[];
  mode: ChartMode;
}

export const ArenaCharts: React.FC<ArenaChartsProps> = ({ ais, mode }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const dates = useMemo(() => {
    const first = ais[0]?.equity_curve || [];
    return first.map((d) => d.date);
  }, [ais]);

  const portfolioCandles: PnLCandle[] = useMemo(() => {
    if (!ais.length || !ais[0].pnl_candles.length) return [];
    return ais[0].pnl_candles.map((c, idx) => {
      let o = 0;
      let hi = 0;
      let lo = 0;
      let cl = 0;
      let dp = 0;
      ais.forEach((a) => {
        const pt = a.pnl_candles[idx];
        if (pt) {
          o += pt.open;
          hi += pt.high;
          lo += pt.low;
          cl += pt.close;
          dp += pt.day_pnl;
        }
      });
      return {
        date: c.date,
        open: Math.round(o),
        high: Math.round(hi),
        low: Math.round(lo),
        close: Math.round(cl),
        day_pnl: Math.round(dp),
      };
    });
  }, [ais]);

  if (mode === "equity") {
    const allVals = ais.flatMap((a) => a.equity_curve.map((p) => p.equity));
    const min = Math.min(...allVals, 9000);
    const max = Math.max(...allVals, 12500);
    const range = max - min || 1;
    const W = 860;
    const H = 260;
    const padX = 48;
    const padY = 20;

    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[16rem] overflow-visible">
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const y = padY + t * (H - padY * 2);
            const val = Math.round(max - t * range);
            return (
              <g key={i}>
                <line x1={padX} y1={y} x2={W - 16} y2={y} stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="4 4" />
                <text x={0} y={y + 4} fill="var(--text-secondary)" fontSize="11" className="tabular-nums">
                  ${val.toLocaleString()}
                </text>
              </g>
            );
          })}
          {ais.map((ai) => {
            const pts = ai.equity_curve
              .map((p, idx) => {
                const x = padX + (idx / Math.max(1, dates.length - 1)) * (W - padX - 16);
                const y = padY + (1 - (p.equity - min) / range) * (H - padY * 2);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(" ");
            return (
              <polyline
                key={ai.agent_id}
                fill="none"
                stroke={ai.color}
                strokeWidth={ai.is_leader ? "3" : "1.8"}
                strokeOpacity={ai.is_leader ? "1" : "0.75"}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pts}
              />
            );
          })}
        </svg>
        <div className="flex flex-wrap gap-3 mt-3">
          {ais.map((ai) => (
            <div key={ai.agent_id} className="inline-flex items-center gap-1.5 text-[0.75rem]" style={{ color: "var(--text-secondary)" }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ai.color }} />
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>{ai.short_name}</span>
              <span className="tabular-nums">{ai.roi_pct >= 0 ? `+${ai.roi_pct}%` : `${ai.roi_pct}%`}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === "candles") {
    const vals = portfolioCandles.flatMap((c) => [c.high, c.low]);
    const min = Math.min(...vals, -500);
    const max = Math.max(...vals, 500);
    const range = max - min || 1;
    const W = 860;
    const H = 260;
    const padX = 52;
    const padY = 20;
    const colW = (W - padX - 20) / Math.max(1, portfolioCandles.length);

    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[16rem] overflow-visible">
          {[0, 0.5, 1].map((t, i) => {
            const y = padY + t * (H - padY * 2);
            const val = Math.round(max - t * range);
            return (
              <g key={i}>
                <line x1={padX} y1={y} x2={W - 12} y2={y} stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="4 4" />
                <text x={0} y={y + 4} fill="var(--text-secondary)" fontSize="11" className="tabular-nums">
                  {val >= 0 ? `+$${val}` : `-$${Math.abs(val)}`}
                </text>
              </g>
            );
          })}
          {portfolioCandles.map((c, idx) => {
            const x = padX + idx * colW + colW * 0.5;
            const yH = padY + (1 - (c.high - min) / range) * (H - padY * 2);
            const yL = padY + (1 - (c.low - min) / range) * (H - padY * 2);
            const yO = padY + (1 - (c.open - min) / range) * (H - padY * 2);
            const yC = padY + (1 - (c.close - min) / range) * (H - padY * 2);
            const up = c.close >= c.open;
            const col = up ? "var(--accent-green)" : "var(--accent-red)";
            const bodyTop = Math.min(yO, yC);
            const bodyH = Math.max(4, Math.abs(yC - yO));
            return (
              <g key={c.date} onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)} className="cursor-pointer">
                <line x1={x} y1={yH} x2={x} y2={yL} stroke={col} strokeWidth="2" />
                <rect x={x - colW * 0.28} y={bodyTop} width={Math.max(6, colW * 0.56)} height={bodyH} rx="3" fill={col} />
              </g>
            );
          })}
        </svg>
        <div className="mt-2 text-[0.75rem] flex items-center justify-between" style={{ color: "var(--text-secondary)" }}>
          <span>30-Day Aggregate Arena PnL Candles (OHLC)</span>
          {hoveredIdx !== null && portfolioCandles[hoveredIdx] && (
            <span className="tabular-nums font-medium" style={{ color: "var(--text-primary)" }}>
              {portfolioCandles[hoveredIdx].date} • Day PnL:{" "}
              {portfolioCandles[hoveredIdx].day_pnl >= 0
                ? `+$${portfolioCandles[hoveredIdx].day_pnl}`
                : `-$${Math.abs(portfolioCandles[hoveredIdx].day_pnl)}`}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (mode === "drawdown") {
    const maxDD = Math.max(...ais.map((a) => a.max_dd_pct), 8);
    return (
      <div className="space-y-3 py-1">
        {ais.map((ai) => {
          const pct = Math.min(100, (ai.max_dd_pct / maxDD) * 100);
          return (
            <div key={ai.agent_id} className="flex items-center gap-3">
              <div className="w-[24%] md:w-[16%] flex items-center gap-2 text-[0.8125rem] font-medium truncate">
                <BrandIcon brand={ai.brand_key} size={22} />
                <span className="truncate">{ai.short_name}</span>
              </div>
              <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-subtle)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: ai.max_dd_pct <= 5.0 ? "var(--accent-blue)" : "var(--accent-red)",
                  }}
                />
              </div>
              <div className="w-[16%] md:w-[10%] text-right text-[0.8125rem] font-semibold tabular-nums" style={{ color: ai.max_dd_pct <= 5 ? "var(--text-primary)" : "var(--accent-red)" }}>
                -{ai.max_dd_pct.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Quant Matrix
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="text-[0.75rem] uppercase tracking-wider" style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
            <th className="py-2.5 px-3">AI Model</th>
            <th className="py-2.5 px-3 text-right">ROI %</th>
            <th className="py-2.5 px-3 text-right">Sharpe</th>
            <th className="py-2.5 px-3 text-right">Sortino</th>
            <th className="py-2.5 px-3 text-right">Calmar</th>
            <th className="py-2.5 px-3 text-right">Profit Factor</th>
            <th className="py-2.5 px-3 text-right">Expectancy</th>
            <th className="py-2.5 px-3 text-right">Kelly %</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {ais.map((ai) => (
            <tr key={ai.agent_id} className="text-[0.8125rem] tabular-nums hover:opacity-90">
              <td className="py-2.5 px-3 font-medium flex items-center gap-2">
                <BrandIcon brand={ai.brand_key} size={22} />
                <span>{ai.display_name}</span>
              </td>
              <td className="py-2.5 px-3 text-right font-semibold" style={{ color: ai.roi_pct >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                {ai.roi_pct >= 0 ? `+${ai.roi_pct}%` : `${ai.roi_pct}%`}
              </td>
              <td className="py-2.5 px-3 text-right">{ai.sharpe_ratio.toFixed(2)}</td>
              <td className="py-2.5 px-3 text-right">{ai.sortino_ratio.toFixed(2)}</td>
              <td className="py-2.5 px-3 text-right">{ai.calmar_ratio.toFixed(2)}</td>
              <td className="py-2.5 px-3 text-right">{ai.profit_factor.toFixed(2)}</td>
              <td className="py-2.5 px-3 text-right">${ai.expectancy_usd.toFixed(0)}</td>
              <td className="py-2.5 px-3 text-right">{ai.kelly_pct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
