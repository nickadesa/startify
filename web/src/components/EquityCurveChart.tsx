import React, { useMemo, useState } from 'react';
import { DailyStat, LeaderboardEntry } from '../types/arena';
import { Card } from './ui/card';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';

interface Props {
  dailyStats: DailyStat[];
  leaderboard: LeaderboardEntry[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
}

export const EquityCurveChart: React.FC<Props> = ({
  dailyStats,
  leaderboard,
  selectedAgentId,
  onSelectAgent,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [rangeWindow, setRangeWindow] = useState<string>('all');

  const allDates = useMemo(() => {
    const set = new Set<string>();
    dailyStats.forEach((d) => set.add(d.date));
    return Array.from(set).sort();
  }, [dailyStats]);

  const dates = useMemo(() => {
    if (rangeWindow === '7d') return allDates.slice(-7);
    if (rangeWindow === '14d') return allDates.slice(-14);
    if (rangeWindow === '30d') return allDates.slice(-30);
    return allDates;
  }, [allDates, rangeWindow]);

  const seriesByAgent = useMemo(() => {
    const map: Record<string, { date: string; eq: number; dd: number; blowup: boolean }[]> = {};
    leaderboard.forEach((ag) => {
      map[ag.agent_id] = [];
    });
    dailyStats.forEach((ds) => {
      if (!dates.includes(ds.date)) return;
      if (!map[ds.agent_id]) map[ds.agent_id] = [];
      map[ds.agent_id].push({
        date: ds.date,
        eq: ds.equity_close,
        dd: ds.drawdown_pct,
        blowup: ds.blowup_occurred === 1,
      });
    });
    return map;
  }, [dailyStats, leaderboard, dates]);

  const activeAgent = useMemo(() => {
    if (selectedAgentId) {
      return leaderboard.find((a) => a.agent_id === selectedAgentId) || leaderboard[0];
    }
    return leaderboard[0];
  }, [leaderboard, selectedAgentId]);

  const width = 880;
  const height = 300;
  const padL = 52;
  const padR = 20;
  const padT = 20;
  const padB = 32;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const { minEq, maxEq } = useMemo(() => {
    let min = 920;
    let max = 1480;
    dailyStats.forEach((d) => {
      if (!dates.includes(d.date)) return;
      if (d.equity_close < min) min = d.equity_close;
      if (d.equity_close > max) max = d.equity_close;
    });
    return {
      minEq: Math.floor((min - 30) / 50) * 50,
      maxEq: Math.ceil((max + 40) / 50) * 50,
    };
  }, [dailyStats, dates]);

  const xForIdx = (idx: number) => {
    if (dates.length <= 1) return padL;
    return padL + (idx / (dates.length - 1)) * plotW;
  };

  const yForEq = (eq: number) => {
    const ratio = (eq - minEq) / Math.max(maxEq - minEq, 1);
    return padT + plotH - ratio * plotH;
  };

  const yTicks = useMemo(() => {
    const step = Math.max(100, Math.round((maxEq - minEq) / 4 / 50) * 50);
    const list: number[] = [];
    for (let v = minEq; v <= maxEq; v += step) {
      list.push(v);
    }
    if (!list.includes(1000) && 1000 >= minEq && 1000 <= maxEq) {
      list.push(1000);
      list.sort((a, b) => a - b);
    }
    return list;
  }, [minEq, maxEq]);

  const activeIdx = hoverIdx !== null && hoverIdx < dates.length ? hoverIdx : dates.length - 1;
  const activeDate = dates[activeIdx] || '';

  return (
    <Card className="p-5 sm:p-6 space-y-5">
      {/* Top Header Inspired by Reference Images 1 & 13 */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-3">
          <div>
            <h2 className="apple-title text-[#F5F5F7]">Equity performance</h2>
            <p className="text-[13px] text-[#8E8E93] mt-0.5">
              Starting capital $1,000.00 per autonomous model across 45 trading days
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <div>
              <div className="text-[12px] text-[#8E8E93]">{activeAgent?.display_name} equity</div>
              <div className="text-[24px] font-semibold tracking-[-0.025em] font-mono-tabular text-[#F5F5F7] mt-0.5">
                ${activeAgent?.current_equity.toFixed(2)}
              </div>
            </div>

            <div className="h-8 w-px bg-white/[0.07]" />

            <div>
              <div className="text-[12px] text-[#8E8E93]">Compared to $1,000 baseline</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`text-[20px] font-semibold tracking-[-0.02em] font-mono-tabular ${
                    (activeAgent?.net_pnl_usd ?? 0) >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                  }`}
                >
                  {(activeAgent?.net_pnl_usd ?? 0) >= 0 ? '+' : ''}$
                  {activeAgent?.net_pnl_usd.toFixed(2)}
                </span>
                <Badge
                  variant={(activeAgent?.net_pnl_pct ?? 0) >= 0 ? 'positive' : 'negative'}
                  className="font-mono-tabular"
                >
                  {(activeAgent?.net_pnl_pct ?? 0) >= 0 ? '+' : ''}
                  {activeAgent?.net_pnl_pct.toFixed(2)}%
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={rangeWindow} onValueChange={setRangeWindow}>
            <TabsList>
              <TabsTrigger value="7d">7D</TabsTrigger>
              <TabsTrigger value="14d">14D</TabsTrigger>
              <TabsTrigger value="30d">30D</TabsTrigger>
              <TabsTrigger value="all">All time</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Model Filter Strip (Clean Pills, No Emojis) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => onSelectAgent(null)}
          className={`px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors cursor-pointer active:scale-[0.97] shrink-0 ${
            selectedAgentId === null
              ? 'bg-[#1C1C1E] text-[#F5F5F7] border border-white/[0.1]'
              : 'text-[#8E8E93] hover:text-[#F5F5F7] border border-transparent'
          }`}
        >
          All models
        </button>
        {leaderboard.slice(0, 9).map((ag) => {
          const isSelected = selectedAgentId === ag.agent_id;
          return (
            <button
              key={ag.agent_id}
              type="button"
              onClick={() => onSelectAgent(isSelected ? null : ag.agent_id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors cursor-pointer active:scale-[0.97] shrink-0 ${
                isSelected
                  ? 'bg-[#1C1C1E] text-[#F5F5F7] border border-white/[0.12]'
                  : 'text-[#8E8E93] hover:text-[#F5F5F7] border border-transparent'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    ag.agent_id === activeAgent?.agent_id ? '#00adff' : ag.color,
                }}
              />
              <span>{ag.display_name}</span>
            </button>
          );
        })}
      </div>

      {/* SVG Equity Curve with Floating Tooltip Card (Reference Image 1 Style) */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[260px] sm:h-[300px] select-none overflow-visible"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="startifyPrimaryArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00adff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#00adff" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid Hairlines */}
          {yTicks.map((val) => {
            const y = yForEq(val);
            const isBase = val === 1000;
            return (
              <g key={val}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke={isBase ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)'}
                  strokeDasharray={isBase ? '3 3' : undefined}
                  strokeWidth={1}
                />
                <text
                  x={padL - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[#636366] text-[11px] font-mono-tabular"
                >
                  ${val}
                </text>
              </g>
            );
          })}

          {/* Comparison Agent Lines (Quiet Muted Neutral Steps) */}
          {leaderboard.map((ag) => {
            const pts = seriesByAgent[ag.agent_id] || [];
            if (pts.length === 0) return null;
            const isHighlighted = ag.agent_id === activeAgent?.agent_id;
            if (isHighlighted) return null;

            const pathD = pts
              .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${xForIdx(idx).toFixed(1)} ${yForEq(p.eq).toFixed(1)}`)
              .join(' ');

            return (
              <path
                key={ag.agent_id}
                d={pathD}
                fill="none"
                stroke={selectedAgentId ? 'rgba(255,255,255,0.08)' : ag.color}
                strokeWidth={selectedAgentId ? 1.1 : 1.35}
                strokeOpacity={selectedAgentId ? 0.3 : 0.42}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {/* Highlighted / Leading Agent Area + Crisp #00adff Line */}
          {activeAgent && (seriesByAgent[activeAgent.agent_id]?.length ?? 0) > 1 && (() => {
            const pts = seriesByAgent[activeAgent.agent_id];
            const lineD = pts
              .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${xForIdx(idx).toFixed(1)} ${yForEq(p.eq).toFixed(1)}`)
              .join(' ');
            const areaD = `${lineD} L ${xForIdx(pts.length - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${xForIdx(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;
            const activePt = pts[Math.min(activeIdx, pts.length - 1)];

            return (
              <g>
                <path d={areaD} fill="url(#startifyPrimaryArea)" />
                <path
                  d={lineD}
                  fill="none"
                  stroke="#00adff"
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {activePt && (
                  <circle
                    cx={xForIdx(Math.min(activeIdx, pts.length - 1))}
                    cy={yForEq(activePt.eq)}
                    r={4}
                    fill="#00adff"
                    stroke="#000000"
                    strokeWidth={2}
                  />
                )}
              </g>
            );
          })()}

          {/* Vertical Crosshair */}
          {dates.length > 0 && (
            <line
              x1={xForIdx(activeIdx)}
              y1={padT}
              x2={xForIdx(activeIdx)}
              y2={padT + plotH}
              stroke="rgba(255,255,255,0.16)"
              strokeDasharray="2 3"
              strokeWidth={1}
            />
          )}

          {/* X-Axis Dates */}
          {dates.map((d, idx) => {
            const step = Math.max(1, Math.floor(dates.length / 6));
            if (idx % step !== 0 && idx !== dates.length - 1) return null;
            return (
              <text
                key={d}
                x={xForIdx(idx)}
                y={height - 8}
                textAnchor="middle"
                className="fill-[#636366] text-[11px] font-mono-tabular"
              >
                {d.slice(5)}
              </text>
            );
          })}

          {/* Pointer Hit Columns */}
          {dates.map((d, idx) => {
            const colW = plotW / Math.max(dates.length, 1);
            return (
              <rect
                key={d}
                x={xForIdx(idx) - colW / 2}
                y={padT}
                width={colW}
                height={plotH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            );
          })}
        </svg>

        {/* Floating Tooltip Card (Reference Image 1 Style) */}
        {hoverIdx !== null && activeDate && (
          <div className="pointer-events-none absolute top-3 right-3 rounded-xl border border-white/[0.09] apple-glass px-3.5 py-2.5 space-y-1.5">
            <div className="text-[11px] text-[#8E8E93] font-mono-tabular">{activeDate}</div>
            {leaderboard.slice(0, 4).map((ag) => {
              const pt = seriesByAgent[ag.agent_id]?.[activeIdx];
              if (!pt) return null;
              const isPrimary = ag.agent_id === activeAgent?.agent_id;
              return (
                <div key={ag.agent_id} className="flex items-center justify-between gap-5 text-[12px]">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-0.5 h-3 rounded-full"
                      style={{ backgroundColor: isPrimary ? '#00adff' : ag.color }}
                    />
                    <span className={isPrimary ? 'text-[#F5F5F7] font-medium' : 'text-[#A1A1AA]'}>
                      {ag.display_name}
                    </span>
                  </div>
                  <span className="font-mono-tabular text-[#F5F5F7] font-medium">
                    ${pt.eq.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};
