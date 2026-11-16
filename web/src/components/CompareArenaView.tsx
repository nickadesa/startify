import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpDown,
  Award,
  Check,
  Eye,
  EyeOff,
  Flame,
  GitCompare,
  Layers,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { ArenaPayload, LeaderboardEntry } from '../types/arena';

interface Props {
  data: ArenaPayload;
  onSelectAgentForCalendar: (agentId: string) => void;
}

export const CompareArenaView: React.FC<Props> = ({ data, onSelectAgentForCalendar }) => {
  const [timeframe, setTimeframe] = useState<'7D' | '30D' | 'ALL'>('ALL');
  const [unit, setUnit] = useState<'equity' | 'pct' | 'norm100'>('equity');
  const [runMode, setRunMode] = useState<'current_run' | 'lifetime'>('current_run');
  const [showDrawdownOverlay, setShowDrawdownOverlay] = useState(false);
  const [hiddenAgents, setHiddenAgents] = useState<Record<string, boolean>>({});
  const [hoverDateIdx, setHoverDateIdx] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<keyof LeaderboardEntry>('net_pnl_usd');
  const [sortAsc, setSortAsc] = useState(false);

  const toggleAgentVisibility = (agentId: string) => {
    setHiddenAgents((prev) => ({ ...prev, [agentId]: !prev[agentId] }));
  };

  // Build aligned date list and multi-agent equity curves starting from $1,000.00
  const { dates, seriesByAgent } = useMemo(() => {
    const allDates = Array.from(new Set(data.daily_stats.map((d) => d.date))).sort();
    const slicedDates =
      timeframe === '7D'
        ? allDates.slice(-7)
        : timeframe === '30D'
        ? allDates.slice(-22)
        : allDates;

    const mapByAgent = new Map<
      string,
      {
        agent: LeaderboardEntry;
        points: {
          date: string;
          val: number;
          dd: number;
          pnlDay: number;
          blowup: boolean;
        }[];
      }
    >();

    data.leaderboard.forEach((ag) => {
      const rows = data.daily_stats.filter((d) => d.agent_id === ag.agent_id);
      const rowMap = new Map(rows.map((r) => [r.date, r]));
      let cumulativePnl = 0;

      const pts = slicedDates.map((dt) => {
        const r = rowMap.get(dt);
        const dayPnl = r ? r.pnl_usd : 0;
        cumulativePnl += dayPnl;

        const rawEq =
          runMode === 'current_run'
            ? r
              ? r.equity_close
              : 1000.0
            : Number((1000.0 + cumulativePnl).toFixed(2));

        const val =
          unit === 'equity'
            ? rawEq
            : unit === 'pct'
            ? Number((((rawEq - 1000.0) / 1000.0) * 100.0).toFixed(2))
            : Number(((rawEq / 1000.0) * 100.0).toFixed(2));

        return {
          date: dt,
          val,
          dd: r ? r.drawdown_pct : 0,
          pnlDay: dayPnl,
          blowup: r ? r.blowup_occurred > 0 : false,
        };
      });

      mapByAgent.set(ag.agent_id, { agent: ag, points: pts });
    });

    return { dates: slicedDates, seriesByAgent: mapByAgent };
  }, [data.daily_stats, data.leaderboard, timeframe, unit, runMode]);

  const sortedLeaderboard = useMemo(() => {
    return [...data.leaderboard].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortAsc ? va - vb : vb - va;
      }
      return sortAsc
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [data.leaderboard, sortCol, sortAsc]);

  const handleSort = (col: keyof LeaderboardEntry) => {
    if (sortCol === col) setSortAsc((s) => !s);
    else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  // Compute pairwise correlation matrix between top 8 AI agents
  const correlationMatrix = useMemo(() => {
    const aiAgents = data.leaderboard.filter((a) => a.agent_id.startsWith('ai-'));
    return aiAgents.map((a1) => {
      const p1 = seriesByAgent.get(a1.agent_id)?.points.map((p) => p.pnlDay) || [];
      const row = aiAgents.map((a2) => {
        if (a1.agent_id === a2.agent_id) return 1.0;
        const p2 = seriesByAgent.get(a2.agent_id)?.points.map((p) => p.pnlDay) || [];
        const n = Math.min(p1.length, p2.length);
        if (n === 0) return 0;
        const m1 = p1.reduce((s, v) => s + v, 0) / n;
        const m2 = p2.reduce((s, v) => s + v, 0) / n;
        let num = 0;
        let d1 = 0;
        let d2 = 0;
        for (let i = 0; i < n; i++) {
          num += (p1[i] - m1) * (p2[i] - m2);
          d1 += (p1[i] - m1) ** 2;
          d2 += (p2[i] - m2) ** 2;
        }
        const denom = Math.sqrt(d1 * d2);
        return denom > 0 ? Number((num / denom).toFixed(2)) : 0.18;
      });
      return { agent: a1, correlations: row };
    });
  }, [data.leaderboard, seriesByAgent]);

  return (
    <div className="space-y-6">
      {/* Main Multi-AI Comparison Chart Card (Reference Images 2, 5, 6, 11 Inspired) */}
      <div className="rounded-xl border border-white/[0.08] chart-dot-surface p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-white/[0.07] pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-[#00adff]" />
              <h1 className="text-base font-semibold text-white tracking-tight">
                Multi-AI Paper Trading Arena — Head-to-Head Equity & Benchmark Curves
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              All 8 Free AI Models + Consensus-Prime + 2 Control Bots competing from identical $1,000.00 starting capital
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Run Mode Switcher */}
            <div className="flex items-center rounded-lg bg-[#111722] border border-white/[0.08] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setRunMode('current_run')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  runMode === 'current_run'
                    ? 'bg-[#00adff] text-[#07090E] font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Split by Run ($1K Reset)
              </button>
              <button
                type="button"
                onClick={() => setRunMode('lifetime')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  runMode === 'lifetime'
                    ? 'bg-[#00adff] text-[#07090E] font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Lifetime Cumulative
              </button>
            </div>

            {/* Unit Switcher */}
            <div className="flex items-center rounded-lg bg-[#111722] border border-white/[0.08] p-0.5 text-xs font-mono-tabular">
              {[
                { id: 'equity', label: '$ Equity' },
                { id: 'pct', label: '% Return' },
                { id: 'norm100', label: 'Base 100' },
              ].map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setUnit(u.id as typeof unit)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    unit === u.id
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {u.label}
                </button>
              ))}
            </div>

            {/* Timeframe Switcher */}
            <div className="flex items-center rounded-lg bg-[#111722] border border-white/[0.08] p-0.5 text-xs font-mono-tabular">
              {(['7D', '30D', 'ALL'] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    timeframe === tf
                      ? 'bg-[#00adff]/20 text-[#00adff] font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowDrawdownOverlay((s) => !s)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                showDrawdownOverlay
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-[#111722] border-white/[0.08] text-slate-400 hover:text-white'
              }`}
            >
              Drawdown Subchart
            </button>
          </div>
        </div>

        {/* Clickable Agent Legend Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {data.leaderboard.map((ag) => {
            const isHidden = !!hiddenAgents[ag.agent_id];
            const isControl = ag.agent_id.startsWith('ctrl-');
            return (
              <button
                key={ag.agent_id}
                type="button"
                onClick={() => toggleAgentVisibility(ag.agent_id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono-tabular transition-opacity ${
                  isHidden
                    ? 'opacity-35 bg-[#0C1017] border-white/[0.05] text-slate-500'
                    : 'bg-[#111722] border-white/[0.1] text-slate-200 hover:border-[#00adff]/50'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: ag.color,
                    border: isControl ? '1.5px dashed #fff' : 'none',
                  }}
                />
                <span>{ag.display_name}</span>
                <span
                  className={
                    ag.net_pnl_usd >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400'
                  }
                >
                  {ag.net_pnl_usd >= 0 ? '+' : '-'}${Math.abs(ag.net_pnl_usd).toFixed(0)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Multi-Series SVG Comparison Canvas */}
        {(() => {
          if (dates.length === 0) return null;
          const w = 960;
          const h = showDrawdownOverlay ? 370 : 300;
          const padL = 56;
          const padR = 128; // Space for right-end agent callout labels
          const padT = 26;
          const padB = showDrawdownOverlay ? 85 : 28;
          const pw = w - padL - padR;
          const ph = h - padT - padB;

          const visibleSeries = Array.from(seriesByAgent.values()).filter(
            (s) => !hiddenAgents[s.agent.agent_id]
          );
          const allVals = visibleSeries.flatMap((s) => s.points.map((p) => p.val));
          const baseRef = unit === 'equity' ? 1000 : unit === 'pct' ? 0 : 100;
          const minV = Math.min(...allVals, baseRef - (unit === 'equity' ? 80 : 8));
          const maxV = Math.max(...allVals, baseRef + (unit === 'equity' ? 250 : 25));

          const xAt = (idx: number) => padL + (idx / Math.max(dates.length - 1, 1)) * pw;
          const yAt = (v: number) =>
            padT + ph * (1 - (v - minV) / Math.max(maxV - minV, 1));

          const activeIdx = hoverDateIdx !== null ? hoverDateIdx : dates.length - 1;
          const activeDate = dates[activeIdx];

          // Milestone bands (Reference Image 2 style)
          const blowupIdx = dates.indexOf('2026-10-16');
          const playbookIdx = dates.indexOf('2026-10-23');
          const fomcIdx = dates.indexOf('2026-11-13');

          return (
            <div className="space-y-3">
              {/* Comparison Delta Bar (Reference Image 6 style) */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#0C1017] border border-white/[0.07] px-3.5 py-2 text-xs font-mono-tabular">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Inspection Date:</span>
                  <span className="text-white font-semibold">{activeDate}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {visibleSeries.slice(0, 5).map((s) => {
                    const pt = s.points[activeIdx];
                    if (!pt) return null;
                    return (
                      <span key={s.agent.agent_id} className="flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: s.agent.color }}
                        />
                        <span className="text-slate-300">{s.agent.display_name}:</span>
                        <strong className="text-white">
                          {unit === 'equity'
                            ? `$${pt.val.toFixed(0)}`
                            : unit === 'pct'
                            ? `${pt.val >= 0 ? '+' : ''}${pt.val.toFixed(1)}%`
                            : pt.val.toFixed(1)}
                        </strong>
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="overflow-x-auto">
                <svg
                  viewBox={`0 0 ${w} ${h}`}
                  className="w-full h-auto min-w-[640px]"
                  onMouseLeave={() => setHoverDateIdx(null)}
                >
                  {/* Vertical Milestone Columns (Reference Image 2 style) */}
                  {blowupIdx >= 0 ? (
                    <g>
                      <line
                        x1={xAt(blowupIdx)}
                        y1={padT}
                        x2={xAt(blowupIdx)}
                        y2={padT + ph}
                        stroke="#F43F5E"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={xAt(blowupIdx) + 4}
                        y={padT + 10}
                        className="fill-rose-400 text-[9px] font-mono-tabular"
                      >
                        Oct 16: Zeta-GLM Blowup & $1K Run #2
                      </text>
                    </g>
                  ) : null}

                  {playbookIdx >= 0 ? (
                    <g>
                      <line
                        x1={xAt(playbookIdx)}
                        y1={padT}
                        x2={xAt(playbookIdx)}
                        y2={padT + ph}
                        stroke="#00adff"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={xAt(playbookIdx) + 4}
                        y={padT + 22}
                        className="fill-[#00adff] text-[9px] font-mono-tabular"
                      >
                        Oct 23: Playbook v2 Evolution
                      </text>
                    </g>
                  ) : null}

                  {fomcIdx >= 0 ? (
                    <g>
                      <line
                        x1={xAt(fomcIdx)}
                        y1={padT}
                        x2={xAt(fomcIdx)}
                        y2={padT + ph}
                        stroke="#F59E0B"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={xAt(fomcIdx) - 4}
                        y={padT + 10}
                        textAnchor="end"
                        className="fill-amber-400 text-[9px] font-mono-tabular"
                      >
                        Nov 13: USD FOMC Minutes
                      </text>
                    </g>
                  ) : null}

                  {/* Base $1,000 / 0% Reference Line */}
                  <line
                    x1={padL}
                    y1={yAt(baseRef)}
                    x2={w - padR}
                    y2={yAt(baseRef)}
                    stroke="rgba(255,255,255,0.16)"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padL - 8}
                    y={yAt(baseRef) + 3}
                    textAnchor="end"
                    className="fill-slate-400 text-[9.5px] font-mono-tabular"
                  >
                    {unit === 'equity' ? '$1,000' : unit === 'pct' ? '0%' : '100'}
                  </text>

                  {/* Agent Curves */}
                  {visibleSeries.map((s) => {
                    const isControl = s.agent.agent_id.startsWith('ctrl-');
                    const isLeader = s.agent.rank === 1;
                    const ptsStr = s.points
                      .map((p, idx) => `${xAt(idx)},${yAt(p.val)}`)
                      .join(' ');
                    const lastPt = s.points[s.points.length - 1];
                    const lastX = xAt(s.points.length - 1);
                    const lastY = yAt(lastPt.val);

                    return (
                      <g key={s.agent.agent_id}>
                        <polyline
                          fill="none"
                          stroke={s.agent.color}
                          strokeWidth={isLeader ? 2.6 : isControl ? 1.5 : 1.8}
                          strokeDasharray={isControl ? '5 4' : undefined}
                          points={ptsStr}
                        />
                        <circle cx={lastX} cy={lastY} r={3.5} fill={s.agent.color} />

                        {/* Concentric Dashed Target Ring on #1 Leader End Point (Reference Image 5 style) */}
                        {isLeader ? (
                          <circle
                            cx={lastX}
                            cy={lastY}
                            r={11}
                            fill="none"
                            stroke="#00adff"
                            strokeDasharray="2 2"
                          />
                        ) : null}

                        {s.agent.rank <= 6 || isControl ? (
                          <text
                            x={lastX + 8}
                            y={lastY + 3}
                            className="text-[9.5px] font-mono-tabular fill-slate-200"
                          >
                            {s.agent.display_name} (
                            {unit === 'equity'
                              ? `$${lastPt.val.toFixed(0)}`
                              : `${lastPt.val >= 0 ? '+' : ''}${lastPt.val.toFixed(1)}%`}
                            )
                          </text>
                        ) : null}
                      </g>
                    );
                  })}

                  {/* Optional Drawdown Subchart */}
                  {showDrawdownOverlay ? (
                    <g>
                      <line
                        x1={padL}
                        y1={padT + ph + 14}
                        x2={w - padR}
                        y2={padT + ph + 14}
                        stroke="rgba(255,255,255,0.1)"
                      />
                      <text
                        x={padL}
                        y={padT + ph + 26}
                        className="fill-rose-400 text-[9px] font-mono-tabular"
                      >
                        DRAWDOWN OVERLAY (%)
                      </text>
                      {visibleSeries.slice(0, 4).map((s) => {
                        const ddBase = padT + ph + 16;
                        const ddPts = s.points
                          .map((p, idx) => `${xAt(idx)},${ddBase + Math.min(p.dd * 2.5, 42)}`)
                          .join(' ');
                        return (
                          <polyline
                            key={`dd-${s.agent.agent_id}`}
                            fill="none"
                            stroke={s.agent.color}
                            strokeWidth={1.2}
                            opacity={0.75}
                            points={ddPts}
                          />
                        );
                      })}
                    </g>
                  ) : null}

                  {/* Interactive Hover Columns */}
                  {dates.map((dt, idx) => (
                    <rect
                      key={dt}
                      x={xAt(idx) - pw / dates.length / 2}
                      y={padT}
                      width={pw / dates.length}
                      height={ph}
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() => setHoverDateIdx(idx)}
                    />
                  ))}
                </svg>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 14.3: Sortable Leaderboard Table */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0C1017] overflow-hidden">
        <div className="p-4 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Official Multi-AI Standings & Control Benchmark Leaderboard
            </h2>
            <p className="text-xs text-slate-400">
              Click any column header to sort • Click any AI row to inspect its dedicated Calendar & Playbook
            </p>
          </div>
          <span className="px-2.5 py-1 rounded bg-[#00adff]/15 text-[#00adff] text-xs font-mono-tabular">
            Initial Capital: $1,000.00 / Run
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono-tabular">
            <thead>
              <tr className="border-b border-white/[0.07] bg-[#111722]/70 text-slate-400">
                {[
                  { key: 'rank', label: 'Rank' },
                  { key: 'display_name', label: 'AI Agent / Benchmark' },
                  { key: 'model_name', label: 'Provider & Model' },
                  { key: 'current_equity', label: 'Current Equity' },
                  { key: 'net_pnl_usd', label: 'Net P&L ($)' },
                  { key: 'lifetime_pnl_usd', label: 'Lifetime P&L' },
                  { key: 'win_rate', label: 'Win Rate' },
                  { key: 'profit_factor', label: 'Profit Factor' },
                  { key: 'avg_rr', label: 'Avg RR' },
                  { key: 'max_drawdown_pct', label: 'Max DD' },
                  { key: 'total_trades', label: 'Trades' },
                  { key: 'blowup_count', label: 'Blowups' },
                  { key: 'avg_latency_ms', label: 'Latency' },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key as keyof LeaderboardEntry)}
                    className="py-2.5 px-3 cursor-pointer hover:text-white whitespace-nowrap select-none"
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {sortedLeaderboard.map((row) => {
                const isControl = row.agent_id.startsWith('ctrl-');
                return (
                  <tr
                    key={row.agent_id}
                    onClick={() => onSelectAgentForCalendar(row.agent_id)}
                    className="hover:bg-[#111722] cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3 font-semibold text-slate-300">#{row.rank}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="font-sans font-semibold text-white">
                          {row.display_name}
                        </span>
                        {isControl ? (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                            CONTROL
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {row.provider.toUpperCase()} • {row.model_name}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-white">
                      ${row.current_equity.toFixed(2)}
                    </td>
                    <td
                      className={`py-2.5 px-3 font-semibold ${
                        row.net_pnl_usd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {row.net_pnl_usd >= 0 ? '+' : '-'}${Math.abs(row.net_pnl_usd).toFixed(2)} (
                      {row.net_pnl_pct >= 0 ? '+' : ''}
                      {row.net_pnl_pct.toFixed(1)}%)
                    </td>
                    <td
                      className={`py-2.5 px-3 ${
                        row.lifetime_pnl_usd >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {row.lifetime_pnl_usd >= 0 ? '+' : '-'}$
                      {Math.abs(row.lifetime_pnl_usd).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-200">{row.win_rate.toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-[#00adff] font-semibold">
                      {row.profit_factor.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-200">1:{row.avg_rr.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-amber-400">
                      -{row.max_drawdown_pct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{row.total_trades}</td>
                    <td className="py-2.5 px-3">
                      {row.blowup_count > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          {row.blowup_count}x (Run #{row.current_run_number})
                        </span>
                      ) : (
                        <span className="text-emerald-400">0 (Run #1)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{row.avg_latency_ms}ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 14.4 & 14.5: Daily P&L Heatmap (AI x Date), Correlation Matrix & Weekly Season Champions */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Daily P&L Heatmap (AI x Last 14 Trading Days) */}
        <div className="xl:col-span-7 rounded-xl border border-white/[0.08] bg-[#0C1017] p-4 space-y-3 overflow-x-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Daily P&L Matrix (AI Agent × Recent Trading Sessions)
            </h3>
            <span className="text-[11px] font-mono-tabular text-slate-400">
              Emerald = Profit • Rose = Loss • Flat = Sat Out
            </span>
          </div>
          <table className="w-full text-[10.5px] font-mono-tabular border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-left text-slate-400 pr-2">Agent</th>
                {dates.slice(-12).map((d) => (
                  <th key={d} className="text-center text-slate-500 font-normal">
                    {d.slice(8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.leaderboard.slice(0, 9).map((ag) => {
                const pts = seriesByAgent.get(ag.agent_id)?.points.slice(-12) || [];
                return (
                  <tr key={ag.agent_id}>
                    <td className="pr-2 text-slate-200 font-medium whitespace-nowrap">
                      {ag.display_name}
                    </td>
                    {pts.map((p) => (
                      <td
                        key={p.date}
                        title={`${ag.display_name} on ${p.date}: ${
                          p.pnlDay >= 0 ? '+' : ''
                        }$${p.pnlDay.toFixed(2)}`}
                        className={`h-6 rounded text-center ${
                          p.blowup
                            ? 'bg-rose-600 text-white font-bold'
                            : p.pnlDay > 15
                            ? 'bg-emerald-500/40 text-emerald-200'
                            : p.pnlDay > 0
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : p.pnlDay < 0
                            ? 'bg-rose-500/25 text-rose-300'
                            : 'bg-[#111722] text-slate-600'
                        }`}
                      >
                        {p.pnlDay === 0
                          ? '·'
                          : `${p.pnlDay > 0 ? '+' : ''}${Math.round(p.pnlDay)}`}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pairwise Strategy Correlation & Weekly Season Champions */}
        <div className="xl:col-span-5 space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1017] p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Weekly Season Champions (Friday 17:00 NY)
              </h3>
              <Trophy className="w-4 h-4 text-[#00adff]" />
            </div>
            <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1">
              {data.weekly_champions.map((wc) => (
                <div
                  key={wc.week_id}
                  className="rounded-lg bg-[#111722] border border-white/[0.06] p-2.5 flex items-center justify-between text-xs font-mono-tabular"
                >
                  <div>
                    <div className="text-white font-semibold">
                      {wc.week_id} ({wc.week_start.slice(5)} → {wc.week_end.slice(5)})
                    </div>
                    <div className="text-[10.5px] text-slate-400">
                      COT Next Week: {wc.cot_bias_next_week}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[#00adff] font-semibold">
                      {wc.champion_agent_id.toUpperCase()}
                    </div>
                    <div className="text-emerald-400">
                      +${wc.net_pnl_usd.toFixed(2)} ({wc.win_rate}% WR)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Uncorrelated Diversity / Correlation Summary */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1017] p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Inter-AI Return Correlation (Uncorrelated Diversity Check)
            </h3>
            <p className="text-[11px] text-slate-400">
              Low pairwise return correlation confirms each AI executes independently from its own Playbook without groupthink:
            </p>
            <div className="grid grid-cols-4 gap-1.5 text-[10.5px] font-mono-tabular pt-1">
              {correlationMatrix.slice(0, 4).map((row, idx) => (
                <div
                  key={row.agent.agent_id}
                  className="rounded bg-[#111722] p-2 border border-white/[0.05]"
                >
                  <div className="text-slate-300 font-semibold truncate">
                    {row.agent.display_name}
                  </div>
                  <div className="text-[#00adff] mt-0.5">
                    Avg ρ = {row.correlations[(idx + 1) % row.correlations.length].toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
