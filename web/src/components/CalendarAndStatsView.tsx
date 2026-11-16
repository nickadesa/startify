import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Flame,
  Info,
  Layers,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { ArenaPayload, DailyStat, TradeRecord, WeeklyChampion } from '../types/arena';
import { OteCandlestickChart } from './OteCandlestickChart';

interface Props {
  data: ArenaPayload;
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
}

export const CalendarAndStatsView: React.FC<Props> = ({
  data,
  selectedAgentId,
  onSelectAgent,
}) => {
  const [monthKey, setMonthKey] = useState<'2026-11' | '2026-10'>('2026-11');
  const [unit, setUnit] = useState<'usd' | 'pct' | 'r'>('usd');
  const [showSettings, setShowSettings] = useState(false);
  const [showUsdNews, setShowUsdNews] = useState(true);
  const [showBlowups, setShowBlowups] = useState(true);
  const [showStyleTags, setShowStyleTags] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [startMonday, setStartMonday] = useState(true);
  const [hideWeekends, setHideWeekends] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>('2026-11-12');
  const [selectedWeekReport, setSelectedWeekReport] = useState<WeeklyChampion | null>(null);
  const [equityTimeframe, setEquityTimeframe] = useState<'7D' | '30D' | 'ALL'>('ALL');
  const [equityChartType, setEquityChartType] = useState<'area' | 'line' | 'bar'>('area');
  const [hoverEqIdx, setHoverEqIdx] = useState<number | null>(null);

  const activeAgent = useMemo(() => {
    if (selectedAgentId === 'all') return data.leaderboard[0];
    return data.leaderboard.find((a) => a.agent_id === selectedAgentId) || data.leaderboard[0];
  }, [data.leaderboard, selectedAgentId]);

  const agentMap = useMemo(() => {
    const m = new Map<string, (typeof data.leaderboard)[0]>();
    data.leaderboard.forEach((a) => m.set(a.agent_id, a));
    return m;
  }, [data.leaderboard]);

  const usdNewsByDate = useMemo(() => {
    const m = new Map<string, (typeof data.news_events)[0][]>();
    data.news_events.forEach((ev) => {
      if (ev.currency === 'USD') {
        const list = m.get(ev.date) || [];
        list.push(ev);
        m.set(ev.date, list);
      }
    });
    return m;
  }, [data.news_events]);

  // Aggregate daily stats for selectedAgentId (or average/sum when 'all')
  const dailyMap = useMemo(() => {
    const m = new Map<string, DailyStat>();
    const filtered =
      selectedAgentId === 'all'
        ? data.daily_stats.filter((d) => d.agent_id.startsWith('ai-'))
        : data.daily_stats.filter((d) => d.agent_id === selectedAgentId);

    const byDate = new Map<string, DailyStat[]>();
    filtered.forEach((d) => {
      const arr = byDate.get(d.date) || [];
      arr.push(d);
      byDate.set(d.date, arr);
    });

    byDate.forEach((rows, dt) => {
      const pnl_usd = Number(rows.reduce((s, r) => s + r.pnl_usd, 0).toFixed(2));
      const r_total = Number(rows.reduce((s, r) => s + r.r_total, 0).toFixed(2));
      const trades = rows.reduce((s, r) => s + r.trades, 0);
      const wins = rows.reduce((s, r) => s + r.wins, 0);
      const losses = rows.reduce((s, r) => s + r.losses, 0);
      const equity_close = Number(
        (rows.reduce((s, r) => s + r.equity_close, 0) / Math.max(rows.length, 1)).toFixed(2)
      );
      const drawdown_pct = Number(
        Math.max(...rows.map((r) => r.drawdown_pct), 0).toFixed(2)
      );
      const tags = Array.from(new Set(rows.flatMap((r) => r.style_tags || []))).slice(0, 2);
      const blowup = rows.some((r) => r.blowup_occurred > 0) ? 1 : 0;

      m.set(dt, {
        agent_id: selectedAgentId,
        date: dt,
        pnl_usd,
        pnl_pct: Number(((pnl_usd / (1000 * rows.length)) * 100).toFixed(2)),
        r_total,
        equity_close,
        drawdown_pct,
        trades,
        wins,
        losses,
        style_tags: tags,
        blowup_occurred: blowup,
      });
    });
    return m;
  }, [data.daily_stats, selectedAgentId]);

  // Build calendar weeks for monthKey ('2026-10' or '2026-11')
  const { calendarWeeks, monthTotals } = useMemo(() => {
    const [yr, mo] = monthKey.split('-').map(Number);
    const firstDay = new Date(Date.UTC(yr, mo - 1, 1));
    const daysInMonth = new Date(Date.UTC(yr, mo, 0)).getUTCDate();

    const startOffset = startMonday
      ? (firstDay.getUTCDay() + 6) % 7
      : firstDay.getUTCDay();

    const cells: { dateStr: string | null; dayNum: number | null; weekday: number }[] = [];
    for (let i = 0; i < startOffset; i++) {
      const wd = startMonday ? (i + 1) % 7 : i;
      cells.push({ dateStr: null, dayNum: null, weekday: wd });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(Date.UTC(yr, mo - 1, d));
      const ds = `${yr}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateStr: ds, dayNum: d, weekday: dt.getUTCDay() });
    }
    while (cells.length % 7 !== 0) {
      const idx = cells.length % 7;
      const wd = startMonday ? (idx + 1) % 7 : idx;
      cells.push({ dateStr: null, dayNum: null, weekday: wd });
    }

    const weeks: {
      weekIndex: number;
      days: typeof cells;
      weekPnlUsd: number;
      weekR: number;
      weekTrades: number;
      winDays: number;
      lossDays: number;
    }[] = [];

    let mPnl = 0;
    let mR = 0;
    let mTrades = 0;
    let mWins = 0;

    for (let w = 0; w < cells.length / 7; w++) {
      const slice = cells.slice(w * 7, w * 7 + 7);
      const visibleDays = hideWeekends
        ? slice.filter((c) => c.weekday !== 0 && c.weekday !== 6)
        : slice;

      let wPnl = 0;
      let wR = 0;
      let wTrades = 0;
      let winDays = 0;
      let lossDays = 0;

      slice.forEach((c) => {
        if (!c.dateStr) return;
        const st = dailyMap.get(c.dateStr);
        if (st && st.trades > 0) {
          wPnl += st.pnl_usd;
          wR += st.r_total;
          wTrades += st.trades;
          mPnl += st.pnl_usd;
          mR += st.r_total;
          mTrades += st.trades;
          mWins += st.wins;
          if (st.pnl_usd > 0) winDays++;
          else if (st.pnl_usd < 0) lossDays++;
        }
      });

      weeks.push({
        weekIndex: w + 1,
        days: visibleDays,
        weekPnlUsd: Number(wPnl.toFixed(2)),
        weekR: Number(wR.toFixed(2)),
        weekTrades: wTrades,
        winDays,
        lossDays,
      });
    }

    return {
      calendarWeeks: weeks,
      monthTotals: {
        pnlUsd: Number(mPnl.toFixed(2)),
        pnlPct: Number((mPnl / 10).toFixed(2)),
        rTotal: Number(mR.toFixed(2)),
        trades: mTrades,
        winRate: mTrades > 0 ? Number(((mWins / mTrades) * 100).toFixed(1)) : 0,
      },
    };
  }, [monthKey, startMonday, hideWeekends, dailyMap]);

  const formatMetric = (stat: DailyStat) => {
    if (unit === 'usd') {
      return `${stat.pnl_usd >= 0 ? '+' : '-'}$${Math.abs(stat.pnl_usd).toFixed(2)}`;
    }
    if (unit === 'pct') {
      return `${stat.pnl_pct >= 0 ? '+' : ''}${stat.pnl_pct.toFixed(2)}%`;
    }
    return `${stat.r_total >= 0 ? '+' : ''}${stat.r_total.toFixed(2)}R`;
  };

  // Filtered trades & shadow trades for the selected agent
  const agentTrades = useMemo(() => {
    if (selectedAgentId === 'all') return data.trades;
    return data.trades.filter((t) => t.agent_id === selectedAgentId);
  }, [data.trades, selectedAgentId]);

  const dayTrades = useMemo(() => {
    if (!selectedDate) return [];
    return agentTrades.filter((t) => t.opened_at.startsWith(selectedDate));
  }, [agentTrades, selectedDate]);

  const agentShadowTrades = useMemo(() => {
    if (selectedAgentId === 'all') return data.shadow_trades;
    return data.shadow_trades.filter((s) => s.agent_id === selectedAgentId);
  }, [data.shadow_trades, selectedAgentId]);

  const agentRuns = useMemo(() => {
    if (selectedAgentId === 'all') return data.account_runs;
    return data.account_runs.filter((r) => r.agent_id === selectedAgentId);
  }, [data.account_runs, selectedAgentId]);

  const agentPlaybooks = useMemo(() => {
    if (selectedAgentId === 'all') return data.playbooks.slice(0, 8);
    return data.playbooks.filter((p) => p.agent_id === selectedAgentId);
  }, [data.playbooks, selectedAgentId]);

  // Equity curve series
  const equitySeries = useMemo(() => {
    const sortedDates = Array.from(dailyMap.keys()).sort();
    const full = sortedDates.map((dt) => {
      const st = dailyMap.get(dt)!;
      return {
        date: dt,
        label: dt.slice(5),
        equity: st.equity_close,
        pnl: st.pnl_usd,
        dd: st.drawdown_pct,
        blowup: st.blowup_occurred > 0,
        hasNews: usdNewsByDate.has(dt),
      };
    });
    if (equityTimeframe === '7D') return full.slice(-7);
    if (equityTimeframe === '30D') return full.slice(-22);
    return full;
  }, [dailyMap, equityTimeframe, usdNewsByDate]);

  // Deep breakdown aggregations (Session, Day of Week, Hour, Long vs Short, Style Tags, Mistake Tags, Confidence Calibration)
  const breakdowns = useMemo(() => {
    const bySession: Record<string, { trades: number; wins: number; pnl: number; r: number }> = {
      london: { trades: 0, wins: 0, pnl: 0, r: 0 },
      london_ny_overlap: { trades: 0, wins: 0, pnl: 0, r: 0 },
      new_york: { trades: 0, wins: 0, pnl: 0, r: 0 },
    };
    const byDirection = {
      long: { trades: 0, wins: 0, pnl: 0 },
      short: { trades: 0, wins: 0, pnl: 0 },
    };
    const byWeekday: Record<string, { label: string; pnl: number; trades: number }> = {
      '1': { label: 'Mon', pnl: 0, trades: 0 },
      '2': { label: 'Tue', pnl: 0, trades: 0 },
      '3': { label: 'Wed', pnl: 0, trades: 0 },
      '4': { label: 'Thu', pnl: 0, trades: 0 },
      '5': { label: 'Fri', pnl: 0, trades: 0 },
    };
    const byStyle = new Map<string, { tag: string; trades: number; wins: number; pnl: number; avgR: number }>();
    const mistakeCounts = new Map<string, number>();
    const rBuckets = [
      { label: '<-1.0R', min: -99, max: -1.01, count: 0 },
      { label: '-1.0R', min: -1.01, max: -0.2, count: 0 },
      { label: '0R..+1.5R', min: -0.2, max: 1.5, count: 0 },
      { label: '+1.5R..+2.5R', min: 1.5, max: 2.5, count: 0 },
      { label: '>+2.5R', min: 2.5, max: 99, count: 0 },
    ];
    const confCalibration = [
      { bucket: '65%–74%', stated: 70, trades: 0, wins: 0 },
      { bucket: '75%–82%', stated: 78, trades: 0, wins: 0 },
      { bucket: '83%–95%', stated: 88, trades: 0, wins: 0 },
    ];

    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let curWin = 0;
    let curLoss = 0;

    [...agentTrades].reverse().forEach((t) => {
      const isW = t.pnl_usd > 0;
      if (isW) {
        curWin++;
        curLoss = 0;
        if (curWin > maxWinStreak) maxWinStreak = curWin;
      } else {
        curLoss++;
        curWin = 0;
        if (curLoss > maxLossStreak) maxLossStreak = curLoss;
      }

      const sKey = bySession[t.session] ? t.session : 'london_ny_overlap';
      bySession[sKey].trades++;
      if (isW) bySession[sKey].wins++;
      bySession[sKey].pnl += t.pnl_usd;
      bySession[sKey].r += t.r_multiple;

      const dKey = t.action === 'short' ? 'short' : 'long';
      byDirection[dKey].trades++;
      if (isW) byDirection[dKey].wins++;
      byDirection[dKey].pnl += t.pnl_usd;

      const wd = String(new Date(t.opened_at).getUTCDay());
      if (byWeekday[wd]) {
        byWeekday[wd].pnl += t.pnl_usd;
        byWeekday[wd].trades++;
      }

      const stObj = byStyle.get(t.style_tag) || { tag: t.style_tag, trades: 0, wins: 0, pnl: 0, avgR: 0 };
      stObj.trades++;
      if (isW) stObj.wins++;
      stObj.pnl += t.pnl_usd;
      stObj.avgR += t.r_multiple;
      byStyle.set(t.style_tag, stObj);

      rBuckets.forEach((b) => {
        if (t.r_multiple >= b.min && t.r_multiple < b.max) b.count++;
      });

      const cPct = t.confidence * 100;
      const cIdx = cPct < 75 ? 0 : cPct < 83 ? 1 : 2;
      confCalibration[cIdx].trades++;
      if (isW) confCalibration[cIdx].wins++;

      t.postmortem?.mistake_tags?.forEach((mTag) => {
        mistakeCounts.set(mTag, (mistakeCounts.get(mTag) || 0) + 1);
      });
    });

    const sortedByPnl = [...agentTrades].sort((a, b) => b.pnl_usd - a.pnl_usd);
    const bestTrade = sortedByPnl[0] || null;
    const worstTrade = sortedByPnl[sortedByPnl.length - 1] || null;

    // Shadow trade stats
    const rejectedShadows = agentShadowTrades.filter((s) => s.shadow_type === 'validator_rejected');
    const noTradeShadows = agentShadowTrades.filter((s) => s.shadow_type === 'ai_no_trade');
    const savedByValidatorUsd = rejectedShadows
      .filter((s) => s.simulated_pnl_usd < 0)
      .reduce((acc, s) => acc + Math.abs(s.simulated_pnl_usd), 0);

    return {
      bySession,
      byDirection,
      weekdayList: Object.values(byWeekday),
      styleList: Array.from(byStyle.values())
        .map((s) => ({
          ...s,
          pnl: Number(s.pnl.toFixed(2)),
          winRate: Number(((s.wins / Math.max(s.trades, 1)) * 100).toFixed(1)),
          avgR: Number((s.avgR / Math.max(s.trades, 1)).toFixed(2)),
        }))
        .sort((a, b) => b.pnl - a.pnl),
      rBuckets,
      confCalibration: confCalibration.map((c) => ({
        ...c,
        actualWinRate: c.trades > 0 ? Number(((c.wins / c.trades) * 100).toFixed(1)) : c.stated,
      })),
      mistakes: Array.from(mistakeCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count),
      maxWinStreak,
      maxLossStreak,
      bestTrade,
      worstTrade,
      rejectedCount: rejectedShadows.length,
      noTradeCount: noTradeShadows.length,
      savedByValidatorUsd: Number(savedByValidatorUsd.toFixed(2)),
    };
  }, [agentTrades, agentShadowTrades]);

  const dayHeaders = useMemo(() => {
    const base = startMonday
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return hideWeekends ? base.filter((d) => d !== 'Sat' && d !== 'Sun') : base;
  }, [startMonday, hideWeekends]);

  return (
    <div className="space-y-6">
      {/* Top Calendar Header & Controls Bar */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0C1017] p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[#00adff]" />
              <h1 className="text-base font-semibold text-white tracking-tight">
                Execution Calendar & Deep Telemetry
              </h1>
            </div>

            <div className="h-4 w-[1px] bg-white/10 hidden sm:block" />

            {/* Agent Dropdown */}
            <select
              aria-label="Select AI Trader Agent"
              value={selectedAgentId}
              onChange={(e) => onSelectAgent(e.target.value)}
              className="rounded-lg bg-[#111722] border border-white/[0.1] px-3 py-1.5 text-xs font-medium text-slate-100 focus:outline-none focus:border-[#00adff]"
            >
              <option value="all">All Competing AIs (Aggregated)</option>
              {data.leaderboard.map((ag) => (
                <option key={ag.agent_id} value={ag.agent_id}>
                  #{ag.rank} {ag.display_name} ({ag.model_name}) — ${ag.current_equity.toFixed(0)}
                </option>
              ))}
            </select>

            {/* Month Selector & Today Button */}
            <div className="flex items-center rounded-lg bg-[#111722] border border-white/[0.08] p-0.5">
              <button
                type="button"
                onClick={() => setMonthKey('2026-10')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  monthKey === '2026-10'
                    ? 'bg-[#00adff] text-[#07090E] font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Oct 2026
              </button>
              <button
                type="button"
                onClick={() => setMonthKey('2026-11')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  monthKey === '2026-11'
                    ? 'bg-[#00adff] text-[#07090E] font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Nov 2026
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setMonthKey('2026-11');
                setSelectedDate('2026-11-12');
              }}
              className="px-2.5 py-1.5 rounded-lg bg-[#111722] hover:bg-[#161E2E] border border-white/[0.08] text-xs font-medium text-slate-300 transition-colors"
            >
              Today
            </button>
          </div>

          {/* Right Side: Monthly P&L Badge, Unit Switcher & Display Settings Popover */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111722] border border-white/[0.08]">
              <span className="text-xs text-slate-400">Month Net:</span>
              <span
                className={`text-sm font-mono-tabular font-semibold ${
                  monthTotals.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {monthTotals.pnlUsd >= 0 ? '+' : '-'}${Math.abs(monthTotals.pnlUsd).toFixed(2)} (
                {monthTotals.rTotal >= 0 ? '+' : ''}
                {monthTotals.rTotal.toFixed(1)}R)
              </span>
              <span className="text-[11px] font-mono-tabular text-slate-400">
                • {monthTotals.trades} trades ({monthTotals.winRate}% WR)
              </span>
            </div>

            {/* Unit Selector ($ / % / R) */}
            <div className="flex items-center rounded-lg bg-[#111722] border border-white/[0.08] p-0.5 text-xs font-mono-tabular">
              {(['usd', 'pct', 'r'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    unit === u
                      ? 'bg-[#00adff]/20 text-[#00adff] border border-[#00adff]/40 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {u === 'usd' ? '$ USD' : u === 'pct' ? '% Eq' : 'R-Mult'}
                </button>
              ))}
            </div>

            {/* Display Settings Popover Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  showSettings
                    ? 'bg-[#00adff]/15 border-[#00adff] text-[#00adff]'
                    : 'bg-[#111722] border-white/[0.08] text-slate-300 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>View Options</span>
              </button>

              {showSettings ? (
                <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#0F141F] border border-white/[0.12] shadow-2xl p-3.5 z-30 space-y-2.5 text-xs">
                  <div className="font-semibold text-slate-200 pb-1 border-b border-white/[0.07]">
                    Calendar Display Settings
                  </div>
                  <label className="flex items-center justify-between cursor-pointer text-slate-300">
                    <span>USD High-Impact News Badges</span>
                    <input
                      type="checkbox"
                      checked={showUsdNews}
                      onChange={(e) => setShowUsdNews(e.target.checked)}
                      className="accent-[#00adff]"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer text-slate-300">
                    <span>Blowup & $1,000 Restart Markers</span>
                    <input
                      type="checkbox"
                      checked={showBlowups}
                      onChange={(e) => setShowBlowups(e.target.checked)}
                      className="accent-[#00adff]"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer text-slate-300">
                    <span>Playbook Style Tags</span>
                    <input
                      type="checkbox"
                      checked={showStyleTags}
                      onChange={(e) => setShowStyleTags(e.target.checked)}
                      className="accent-[#00adff]"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer text-slate-300">
                    <span>Compact Calendar Rows</span>
                    <input
                      type="checkbox"
                      checked={compactMode}
                      onChange={(e) => setCompactMode(e.target.checked)}
                      className="accent-[#00adff]"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer text-slate-300">
                    <span>Start Week on Monday</span>
                    <input
                      type="checkbox"
                      checked={startMonday}
                      onChange={(e) => setStartMonday(e.target.checked)}
                      className="accent-[#00adff]"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer text-slate-300">
                    <span>Hide Saturday & Sunday</span>
                    <input
                      type="checkbox"
                      checked={hideWeekends}
                      onChange={(e) => setHideWeekends(e.target.checked)}
                      className="accent-[#00adff]"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Calendar Grid + Rightmost Weekly Summary Column */}
        <div className="mt-4 overflow-x-auto">
          <div
            className="grid gap-1.5 min-w-[780px]"
            style={{
              gridTemplateColumns: `repeat(${dayHeaders.length}, minmax(0, 1fr)) 138px`,
            }}
          >
            {dayHeaders.map((dh) => (
              <div
                key={dh}
                className="px-2.5 py-1.5 text-center text-[11px] font-medium text-slate-400 bg-[#111722]/70 rounded-md"
              >
                {dh}
              </div>
            ))}
            <div className="px-2.5 py-1.5 text-center text-[11px] font-semibold text-[#00adff] bg-[#00adff]/10 border border-[#00adff]/25 rounded-md">
              Weekly Summary
            </div>

            {calendarWeeks.map((wk) => (
              <React.Fragment key={wk.weekIndex}>
                {wk.days.map((cell, cIdx) => {
                  if (!cell.dateStr) {
                    return (
                      <div
                        key={`empty-${wk.weekIndex}-${cIdx}`}
                        className="rounded-lg bg-[#090C12]/50 border border-white/[0.03] min-h-[76px]"
                      />
                    );
                  }
                  const stat = dailyMap.get(cell.dateStr);
                  const newsEvents = usdNewsByDate.get(cell.dateStr) || [];
                  const isSelected = selectedDate === cell.dateStr;
                  const hasTrades = stat && stat.trades > 0;
                  const isWinDay = hasTrades && stat.pnl_usd > 0;
                  const isLossDay = hasTrades && stat.pnl_usd < 0;
                  const wr =
                    hasTrades && stat.trades > 0
                      ? Math.round((stat.wins / stat.trades) * 100)
                      : 0;

                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      onClick={() => setSelectedDate(cell.dateStr)}
                      className={`text-left rounded-lg border transition-colors flex flex-col justify-between ${
                        compactMode ? 'p-2 min-h-[76px]' : 'p-2.5 min-h-[106px]'
                      } ${
                        isSelected
                          ? 'ring-1.5 ring-[#00adff] border-[#00adff]'
                          : 'border-white/[0.06] hover:border-white/[0.18]'
                      } ${
                        isWinDay
                          ? 'bg-emerald-500/[0.11]'
                          : isLossDay
                          ? 'bg-rose-500/[0.11]'
                          : 'bg-[#10141E]/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 w-full">
                        <span
                          className={`text-xs font-mono-tabular ${
                            isSelected ? 'text-[#00adff] font-semibold' : 'text-slate-400'
                          }`}
                        >
                          {cell.dayNum}
                        </span>
                        <div className="flex items-center gap-1">
                          {showUsdNews && newsEvents.length > 0 ? (
                            <span
                              title={`USD High-Impact: ${newsEvents[0].name}`}
                              className="px-1.5 py-0.2 rounded text-[9px] font-mono-tabular font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            >
                              USD
                            </span>
                          ) : null}
                          {showBlowups && stat?.blowup_occurred ? (
                            <span
                              title="Account Blowup & $1,000 New Run Restart"
                              className="px-1.5 py-0.2 rounded text-[9px] font-mono-tabular font-semibold bg-rose-500/30 text-rose-200 border border-rose-500/50"
                            >
                              RESET $1K
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {hasTrades ? (
                        <div className="mt-1 space-y-1 w-full">
                          <div
                            className={`text-sm sm:text-base font-mono-tabular font-semibold tracking-tight ${
                              stat.pnl_usd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {formatMetric(stat)}
                          </div>
                          <div className="text-[10.5px] font-mono-tabular text-slate-300 flex items-center justify-between">
                            <span>Trades: {stat.trades}</span>
                            <span>
                              {stat.wins}W/{stat.losses}L ({wr}%)
                            </span>
                          </div>
                          {!compactMode && showStyleTags && stat.style_tags?.length > 0 ? (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {stat.style_tags.slice(0, 1).map((tg) => (
                                <span
                                  key={tg}
                                  className="truncate max-w-full px-1.5 py-0.5 rounded text-[9.5px] font-mono-tabular bg-[#07090E]/70 text-[#00adff] border border-[#00adff]/25"
                                >
                                  {tg}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="text-[10.5px] text-slate-600 font-mono-tabular mt-auto">
                          {cell.weekday === 0 || cell.weekday === 6 ? 'Market Closed' : 'No Trigger'}
                        </div>
                      )}
                    </button>
                  );
                })}

                {/* Rightmost Column: Weekly Summary Cell */}
                <button
                  type="button"
                  onClick={() => {
                    const champ =
                      data.weekly_champions[wk.weekIndex % data.weekly_champions.length] ||
                      data.weekly_champions[0];
                    setSelectedWeekReport(champ);
                  }}
                  className="rounded-lg border border-white/[0.08] bg-[#111722]/90 hover:border-[#00adff]/50 p-2.5 flex flex-col justify-between text-left transition-colors"
                >
                  <div className="flex items-center justify-between text-[10.5px] text-slate-400">
                    <span>Week #{wk.weekIndex}</span>
                    <span className="text-[#00adff] font-mono-tabular">Report ›</span>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">TOTAL</div>
                    <div
                      className={`text-sm font-mono-tabular font-semibold ${
                        wk.weekPnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {wk.weekPnlUsd >= 0 ? '+' : '-'}${Math.abs(wk.weekPnlUsd).toFixed(2)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10.5px] font-mono-tabular text-slate-300 pt-1 border-t border-white/[0.06]">
                    <span>
                      <strong className="text-emerald-400">{wk.winDays}W</strong>{' '}
                      <strong className="text-rose-400">{wk.lossDays}L</strong>
                    </span>
                    <span>{wk.weekR >= 0 ? `+${wk.weekR.toFixed(1)}R` : `${wk.weekR.toFixed(1)}R`}</span>
                  </div>
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Selected Day Execution & OTE Chart Panel */}
      {selectedDate ? (
        <div className="rounded-xl border border-[#00adff]/30 bg-[#0C1017] p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] pb-3">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-md bg-[#00adff]/15 text-[#00adff] font-mono-tabular text-xs font-semibold">
                {selectedDate}
              </span>
              <h2 className="text-sm sm:text-base font-semibold text-white">
                Daily Execution Tape, Fibonacci OTE Zone & Post-Mortem Review
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {usdNewsByDate.get(selectedDate)?.map((ev) => (
                <span
                  key={ev.event_id}
                  className="px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono-tabular"
                >
                  USD Event: {ev.name} ({ev.actual} vs {ev.forecast})
                </span>
              ))}
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="p-1.5 rounded-lg bg-[#111722] text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {dayTrades.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              <div className="xl:col-span-7">
                <OteCandlestickChart
                  trade={dayTrades[0]}
                  agentName={
                    agentMap.get(dayTrades[0].agent_id)?.display_name || dayTrades[0].agent_id
                  }
                  agentColor={agentMap.get(dayTrades[0].agent_id)?.color || '#00adff'}
                />
              </div>

              <div className="xl:col-span-5 space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {dayTrades.map((tr) => {
                  const agInfo = agentMap.get(tr.agent_id);
                  return (
                    <div
                      key={tr.trade_id}
                      className="rounded-xl border border-white/[0.08] bg-[#111722]/90 p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: agInfo?.color || '#00adff' }}
                          />
                          <span className="text-xs font-semibold text-white">
                            {agInfo?.display_name || tr.agent_id}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono-tabular font-semibold uppercase ${
                              tr.action === 'long'
                                ? 'bg-[#00adff]/20 text-[#00adff]'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {tr.action} ({tr.order_type})
                          </span>
                          <span className="text-[11px] font-mono-tabular text-slate-400">
                            {tr.style_tag}
                          </span>
                        </div>
                        <span
                          className={`text-sm font-mono-tabular font-semibold ${
                            tr.pnl_usd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {tr.pnl_usd >= 0 ? '+' : '-'}${Math.abs(tr.pnl_usd).toFixed(2)} (
                          {tr.r_multiple >= 0 ? '+' : ''}
                          {tr.r_multiple.toFixed(2)}R)
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-[11px] font-mono-tabular bg-[#090C13] rounded-lg p-2 border border-white/[0.05]">
                        <div>
                          <div className="text-slate-500">Entry</div>
                          <div className="text-slate-200">${tr.entry.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Stop Loss</div>
                          <div className="text-rose-400">${tr.stop_loss.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Exit</div>
                          <div className="text-emerald-400">${tr.exit_price.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Lot / Risk</div>
                          <div className="text-slate-200">
                            {tr.lot} / {tr.risk_pct}%
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-slate-300 leading-relaxed">
                        <strong className="text-slate-100">AI Reasoning:</strong> {tr.reasoning}
                      </div>

                      {tr.postmortem ? (
                        <div className="rounded-lg bg-[#07090E] border border-white/[0.06] p-2.5 space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[#00adff] font-medium">
                              Post-Mortem Lesson ({tr.postmortem.outcome.toUpperCase()})
                            </span>
                            <div className="flex gap-1">
                              {tr.postmortem.mistake_tags.map((mt) => (
                                <span
                                  key={mt}
                                  className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono-tabular text-slate-300"
                                >
                                  {mt}
                                </span>
                              ))}
                            </div>
                          </div>
                          <p className="text-slate-300">{tr.postmortem.lesson}</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 py-6 text-center">
              No executed trades on {selectedDate} for this filter. Click any highlighted green or red calendar cell to inspect its H1 Fibonacci OTE chart and AI Post-Mortem.
            </div>
          )}
        </div>
      ) : null}

      {/* Weekly Friday Report Modal */}
      {selectedWeekReport ? (
        <div className="rounded-xl border border-[#00adff]/40 bg-[#0C1017] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-[#00adff] font-mono-tabular">
              <Award className="w-4 h-4" />
              <span>
                FRIDAY 17:00 AMERICA/NEW_YORK WEEKLY REPORT • {selectedWeekReport.week_id} (
                {selectedWeekReport.week_start} → {selectedWeekReport.week_end})
              </span>
            </div>
            <div className="text-sm text-slate-200">{selectedWeekReport.summary_markdown}</div>
            <div className="text-xs text-slate-400 font-mono-tabular">
              Next Week CFTC COT Institutional Filter: {selectedWeekReport.cot_bias_next_week}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedWeekReport(null)}
            className="self-start sm:self-center px-3 py-1.5 rounded-lg bg-[#111722] text-xs text-slate-300 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* =====================================================================
          SECTION 13: DEEP STATISTICS SUITE (Directly below Calendar)
      ===================================================================== */}
      <div className="pt-2 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-white tracking-tight">
              Quantitative Performance & Risk Telemetry —{' '}
              <span className="text-[#00adff]">
                {selectedAgentId === 'all' ? 'All AI Agents' : activeAgent.display_name}
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Starting Capital: $1,000.00 per Account Run • Code-Enforced 0.5%–2.0% Risk Guardrails • USD-Only Macro Filter
            </p>
          </div>
          <span className="px-3 py-1 rounded-lg bg-[#111722] border border-white/[0.08] text-xs font-mono-tabular text-slate-300">
            Model: {activeAgent.model_name} • Playbook {activeAgent.playbook_version}
          </span>
        </div>

        {/* 13.1: 8-Card KPI Strip with Corner Frame Accents */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            {
              label: 'Net P&L (Current Run)',
              val: `${activeAgent.net_pnl_usd >= 0 ? '+' : '-'}$${Math.abs(
                activeAgent.net_pnl_usd
              ).toFixed(2)}`,
              sub: `Lifetime: ${activeAgent.lifetime_pnl_usd >= 0 ? '+' : '-'}$${Math.abs(
                activeAgent.lifetime_pnl_usd
              ).toFixed(2)}`,
              tone: activeAgent.net_pnl_usd >= 0 ? 'text-emerald-400' : 'text-rose-400',
            },
            {
              label: 'Account Equity',
              val: `$${activeAgent.current_equity.toFixed(2)}`,
              sub: `Base $1,000.00 (${activeAgent.net_pnl_pct >= 0 ? '+' : ''}${
                activeAgent.net_pnl_pct
              }%)`,
              tone: 'text-[#00adff]',
            },
            {
              label: 'Win Rate',
              val: `${activeAgent.win_rate.toFixed(1)}%`,
              sub: `${activeAgent.wins_count}W / ${activeAgent.losses_count}L`,
              tone: 'text-white',
            },
            {
              label: 'Profit Factor',
              val: activeAgent.profit_factor.toFixed(2),
              sub: 'Gross Win / Gross Loss',
              tone: 'text-emerald-400',
            },
            {
              label: 'Average Realized RR',
              val: `1 : ${activeAgent.avg_rr.toFixed(2)}`,
              sub: 'Min Required 1:2.0',
              tone: 'text-[#00adff]',
            },
            {
              label: 'Expectancy / Trade',
              val: `${activeAgent.expectancy_r >= 0 ? '+' : ''}${activeAgent.expectancy_r.toFixed(
                2
              )}R`,
              sub: `$${activeAgent.expectancy_usd.toFixed(2)} per trade`,
              tone: activeAgent.expectancy_r >= 0 ? 'text-emerald-400' : 'text-rose-400',
            },
            {
              label: 'Max Drawdown',
              val: `${activeAgent.max_drawdown_pct.toFixed(2)}%`,
              sub: 'Daily cap 3% / Wk 8%',
              tone: 'text-amber-400',
            },
            {
              label: 'Blowups / Survival',
              val: `${activeAgent.blowup_count} Blowups`,
              sub: `Run #${activeAgent.current_run_number} • ${activeAgent.survival_days}d alive`,
              tone: activeAgent.blowup_count === 0 ? 'text-emerald-400' : 'text-rose-400',
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="corner-frame rounded-xl border border-white/[0.08] bg-[#0C1017] p-3.5 flex flex-col justify-between"
            >
              <div className="text-[11px] text-slate-400">{kpi.label}</div>
              <div className={`text-lg font-mono-tabular font-semibold mt-1.5 ${kpi.tone}`}>
                {kpi.val}
              </div>
              <div className="text-[10.5px] font-mono-tabular text-slate-500 mt-1">{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* 3-Column Intelligence Row (Reference Image 19 Inspired: AI Commentary + Survival Progression + Winrate Donut Ring) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Card 1: AI Synthesis & Edge Commentary */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1017] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-white/[0.06] pb-2.5">
              <span className="flex items-center gap-1.5 font-medium text-slate-200">
                <Sparkles className="w-3.5 h-3.5 text-[#00adff]" />
                AI Playbook Edge Synthesis
              </span>
              <span className="font-mono-tabular text-[#00adff]">
                {activeAgent.style_archetype}
              </span>
            </div>
            <div className="my-4 text-sm sm:text-base text-slate-200 leading-relaxed">
              Execution consistency is expanding on{' '}
              <span className="text-[#00adff] font-medium">
                0.705 Fibonacci OTE pullbacks
              </span>
              .{' '}
              <span className="text-emerald-400 font-medium">
                London–NY overlap setups generated +{activeAgent.expectancy_r.toFixed(2)}R expectancy
              </span>{' '}
              while the USD macro blackout filter prevented{' '}
              <span className="text-[#00adff] font-mono-tabular">
                ${breakdowns.savedByValidatorUsd.toFixed(0)}
              </span>{' '}
              in news-spike slippage.
            </div>
            <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-400 pt-2 border-t border-white/[0.06]">
              <span>Max Win Streak: {breakdowns.maxWinStreak} trades</span>
              <span>Max Loss Streak: {breakdowns.maxLossStreak} trades</span>
            </div>
          </div>

          {/* Card 2: Account Run & Survival Progression */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1017] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-white/[0.06] pb-2.5">
              <span className="font-medium text-slate-200">
                Account Runs & $1,000 Survival Progression
              </span>
              <span className="font-mono-tabular text-emerald-400">
                Run #{activeAgent.current_run_number} Active
              </span>
            </div>
            <div className="my-3 space-y-2.5">
              {agentRuns.slice(0, 3).map((r) => (
                <div
                  key={r.run_id}
                  className="rounded-lg bg-[#111722] border border-white/[0.06] p-2.5 flex items-center justify-between text-xs font-mono-tabular"
                >
                  <div>
                    <div className="text-slate-200 font-semibold">
                      {r.agent_id.toUpperCase()} • Run #{r.run_number} (Playbook{' '}
                      {r.playbook_version_end})
                    </div>
                    <div className="text-[10.5px] text-slate-400">
                      Start $1,000.00 → End ${r.end_equity.toFixed(2)} • {r.survival_days}d survival
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10.5px] font-semibold uppercase ${
                      r.end_reason === 'blowup'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {r.end_reason}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-white/[0.06]">
              <span>
                Best Trade:{' '}
                <strong className="text-emerald-400 font-mono-tabular">
                  +${breakdowns.bestTrade?.pnl_usd.toFixed(2) || '0.00'}
                </strong>
              </span>
              <span>
                Worst Trade:{' '}
                <strong className="text-rose-400 font-mono-tabular">
                  ${breakdowns.worstTrade?.pnl_usd.toFixed(2) || '0.00'}
                </strong>
              </span>
            </div>
          </div>

          {/* Card 3: Win / Loss / Shadow Ring Chart */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1017] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-white/[0.06] pb-2.5">
              <span className="font-medium text-slate-200">Win / Loss Execution Ratio</span>
              <span className="font-mono-tabular text-slate-300">
                {agentTrades.length} Executed
              </span>
            </div>
            <div className="flex items-center justify-around my-2">
              {(() => {
                const total = Math.max(agentTrades.length, 1);
                const wins = agentTrades.filter((t) => t.pnl_usd > 0).length;
                const wrPct = Math.round((wins / total) * 100);
                const r = 46;
                const circ = 2 * Math.PI * r;
                const winDash = (wrPct / 100) * circ;
                return (
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    <svg viewBox="0 0 120 120" className="w-28 h-28 -rotate-90">
                      <circle
                        cx="60"
                        cy="60"
                        r={r}
                        fill="none"
                        stroke="#F43F5E"
                        strokeWidth="12"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r={r}
                        fill="none"
                        stroke="#00adff"
                        strokeWidth="12"
                        strokeDasharray={`${winDash} ${circ}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] text-slate-400">Trades</span>
                      <span className="text-lg font-mono-tabular font-semibold text-white">
                        {agentTrades.length}
                      </span>
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-2 text-xs font-mono-tabular">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#00adff]" />
                  <span className="text-slate-400">Wins:</span>
                  <span className="text-white font-semibold">
                    {agentTrades.filter((t) => t.pnl_usd > 0).length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
                  <span className="text-slate-400">Losses:</span>
                  <span className="text-white font-semibold">
                    {agentTrades.filter((t) => t.pnl_usd <= 0).length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-500" />
                  <span className="text-slate-400">Shadow Skips:</span>
                  <span className="text-slate-300 font-semibold">{agentShadowTrades.length}</span>
                </div>
              </div>
            </div>
            <div className="text-[11px] font-mono-tabular text-slate-400 pt-2 border-t border-white/[0.06] flex justify-between">
              <span>Validator Saved: +${breakdowns.savedByValidatorUsd.toFixed(2)}</span>
              <span>Win Rate: {activeAgent.win_rate.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* 13.2A: Equity Curve & Drawdown Chart (Reference Images 4 & 7 style) */}
        <div className="rounded-xl border border-white/[0.08] chart-dot-surface p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Equity Growth Curve ($1,000.00 Base) & Drawdown Telemetry
              </h3>
              <p className="text-xs text-slate-400">
                Includes horizontal $1,000 initial capital baseline, Peak/Trough markers, and USD News / Blowup vertical milestones
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-lg bg-[#111722] border border-white/[0.08] p-0.5 text-xs">
                {(['area', 'line', 'bar'] as const).map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => setEquityChartType(ct)}
                    className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                      equityChartType === ct
                        ? 'bg-[#00adff] text-[#07090E] font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {ct}
                  </button>
                ))}
              </div>
              <div className="flex items-center rounded-lg bg-[#111722] border border-white/[0.08] p-0.5 text-xs font-mono-tabular">
                {(['7D', '30D', 'ALL'] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setEquityTimeframe(tf)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      equityTimeframe === tf
                        ? 'bg-white/15 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {(() => {
            const pts = equitySeries;
            if (pts.length === 0) return null;
            const w = 920;
            const h = 250;
            const padL = 52;
            const padR = 24;
            const padT = 20;
            const padB = 28;
            const pw = w - padL - padR;
            const ph = h - padT - padB;

            const eqVals = pts.map((p) => p.equity);
            const minEq = Math.min(...eqVals, 960);
            const maxEq = Math.max(...eqVals, 1080);
            const avgEq = eqVals.reduce((a, b) => a + b, 0) / eqVals.length;

            const xAt = (i: number) => padL + (i / Math.max(pts.length - 1, 1)) * pw;
            const yAt = (v: number) =>
              padT + ph * (1 - (v - minEq) / Math.max(maxEq - minEq, 1));

            const polyPoints = pts.map((p, i) => `${xAt(i)},${yAt(p.equity)}`).join(' ');
            const areaPoints = `${xAt(0)},${padT + ph} ${polyPoints} ${xAt(pts.length - 1)},${
              padT + ph
            }`;

            let peakIdx = 0;
            let troughIdx = 0;
            pts.forEach((p, i) => {
              if (p.equity > pts[peakIdx].equity) peakIdx = i;
              if (p.equity < pts[troughIdx].equity) troughIdx = i;
            });

            const activePt = hoverEqIdx !== null && pts[hoverEqIdx] ? pts[hoverEqIdx] : pts[pts.length - 1];

            return (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between text-xs font-mono-tabular bg-[#0C1017] px-3 py-2 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-300">
                    Date: <strong className="text-white">{activePt.date}</strong>
                  </span>
                  <span className="text-[#00adff]">
                    Equity: <strong>${activePt.equity.toFixed(2)}</strong>
                  </span>
                  <span className={activePt.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    Day P&L: {activePt.pnl >= 0 ? '+' : '-'}${Math.abs(activePt.pnl).toFixed(2)}
                  </span>
                  <span className="text-amber-400">Drawdown: -{activePt.dd.toFixed(2)}%</span>
                </div>

                <div className="overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${w} ${h}`}
                    className="w-full h-auto min-w-[560px]"
                    onMouseLeave={() => setHoverEqIdx(null)}
                  >
                    <defs>
                      <linearGradient id="startifyBlueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00adff" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#00adff" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Initial $1,000.00 Baseline & Average Reference Line */}
                    <line
                      x1={padL}
                      y1={yAt(1000)}
                      x2={w - padR}
                      y2={yAt(1000)}
                      stroke="rgba(148,163,184,0.35)"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padL - 6}
                      y={yAt(1000) + 3}
                      textAnchor="end"
                      className="fill-slate-400 text-[9.5px] font-mono-tabular"
                    >
                      $1,000
                    </text>

                    <line
                      x1={padL}
                      y1={yAt(avgEq)}
                      x2={w - padR}
                      y2={yAt(avgEq)}
                      stroke="rgba(0,173,255,0.28)"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={w - padR - 4}
                      y={yAt(avgEq) - 5}
                      textAnchor="end"
                      className="fill-[#00adff] text-[9px] font-mono-tabular"
                    >
                      Average ${avgEq.toFixed(0)}
                    </text>

                    {/* Vertical Blowup / Restart lines */}
                    {pts.map((p, i) =>
                      p.blowup ? (
                        <g key={`bl-${p.date}`}>
                          <line
                            x1={xAt(i)}
                            y1={padT}
                            x2={xAt(i)}
                            y2={padT + ph}
                            stroke="#F43F5E"
                            strokeWidth={1.5}
                            strokeDasharray="3 3"
                          />
                          <text
                            x={xAt(i) + 4}
                            y={padT + 12}
                            className="fill-rose-400 text-[9px] font-mono-tabular font-semibold"
                          >
                            Blowup → Reset $1,000
                          </text>
                        </g>
                      ) : null
                    )}

                    {equityChartType === 'bar' ? (
                      pts.map((p, i) => {
                        const bx = xAt(i) - 6;
                        const base1000Y = yAt(1000);
                        const py = yAt(p.equity);
                        return (
                          <rect
                            key={p.date}
                            x={bx}
                            y={Math.min(base1000Y, py)}
                            width={12}
                            height={Math.max(Math.abs(base1000Y - py), 3)}
                            rx={2}
                            fill={p.equity >= 1000 ? '#00adff' : '#F43F5E'}
                            onMouseEnter={() => setHoverEqIdx(i)}
                          />
                        );
                      })
                    ) : (
                      <>
                        {equityChartType === 'area' ? (
                          <polygon points={areaPoints} fill="url(#startifyBlueFill)" />
                        ) : null}
                        <polyline
                          fill="none"
                          stroke="#00adff"
                          strokeWidth="2.2"
                          points={polyPoints}
                        />
                      </>
                    )}

                    {/* Peak & Trough Markers (Reference Image 7 style) */}
                    <circle
                      cx={xAt(peakIdx)}
                      cy={yAt(pts[peakIdx].equity)}
                      r={4.5}
                      fill="#10B981"
                      stroke="#07090E"
                      strokeWidth={1.5}
                    />
                    <circle
                      cx={xAt(troughIdx)}
                      cy={yAt(pts[troughIdx].equity)}
                      r={4.5}
                      fill="#F43F5E"
                      stroke="#07090E"
                      strokeWidth={1.5}
                    />

                    {/* Invisible hover columns */}
                    {pts.map((p, i) => (
                      <rect
                        key={p.date}
                        x={xAt(i) - pw / pts.length / 2}
                        y={padT}
                        width={pw / pts.length}
                        height={ph}
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoverEqIdx(i)}
                      />
                    ))}

                    {/* X-axis dates */}
                    {pts
                      .filter((_, i) => i % Math.max(Math.floor(pts.length / 7), 1) === 0)
                      .map((p) => {
                        const idx = pts.indexOf(p);
                        return (
                          <text
                            key={p.date}
                            x={xAt(idx)}
                            y={h - 6}
                            textAnchor="middle"
                            className="fill-slate-500 text-[9.5px] font-mono-tabular"
                          >
                            {p.label}
                          </text>
                        );
                      })}
                  </svg>
                </div>
              </div>
            );
          })()}
        </div>

        {/* 13.2B: Session, Direction, Day-of-Week, and Setup Style Tag Breakdowns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Session & Long vs Short Breakdown */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1017] p-4 space-y-4">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Session & Directional Breakdown
            </h3>
            <div className="space-y-2.5">
              {[
                { key: 'london', label: 'London Session (07–12 UTC)' },
                { key: 'london_ny_overlap', label: 'London–NY Overlap (12–16 UTC)' },
                { key: 'new_york', label: 'New York Session (16–21 UTC)' },
              ].map((s) => {
                const st = breakdowns.bySession[s.key];
                const wr = st.trades > 0 ? Math.round((st.wins / st.trades) * 100) : 0;
                return (
                  <div
                    key={s.key}
                    className="rounded-lg bg-[#111722] p-2.5 border border-white/[0.05] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-200 font-medium">{s.label}</span>
                      <span
                        className={`font-mono-tabular font-semibold ${
                          st.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {st.pnl >= 0 ? '+' : '-'}${Math.abs(st.pnl).toFixed(2)} ({wr}% WR)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full bg-[#00adff]"
                        style={{ width: `${Math.min(Math.max(wr, 8), 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Long vs Short Segmented Bar (Reference Image 9 style) */}
            <div className="pt-2 border-t border-white/[0.06] space-y-2">
              <div className="flex justify-between text-xs text-slate-300 font-mono-tabular">
                <span>
                  LONG: {breakdowns.byDirection.long.trades} (
                  {breakdowns.byDirection.long.pnl >= 0 ? '+' : ''}$
                  {breakdowns.byDirection.long.pnl.toFixed(0)})
                </span>
                <span>
                  SHORT: {breakdowns.byDirection.short.trades} (
                  {breakdowns.byDirection.short.pnl >= 0 ? '+' : ''}$
                  {breakdowns.byDirection.short.pnl.toFixed(0)})
                </span>
              </div>
              <div className="flex h-3 rounded-md overflow-hidden gap-1">
                <div
                  className="bg-[#00adff]"
                  style={{
                    width: `${
                      (breakdowns.byDirection.long.trades /
                        Math.max(agentTrades.length, 1)) *
                      100
                    }%`,
                  }}
                />
                <div className="bg-emerald-500 flex-1" />
              </div>
            </div>
          </div>

          {/* Day of Week & R-Multiple Distribution Histogram */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1017] p-4 space-y-4">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Day-of-Week P&L & R-Multiple Histogram
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {breakdowns.weekdayList.map((wd) => (
                <div
                  key={wd.label}
                  className="rounded-lg bg-[#111722] border border-white/[0.05] p-2 text-center"
                >
                  <div className="text-[11px] text-slate-400">{wd.label}</div>
                  <div
                    className={`text-xs font-mono-tabular font-semibold mt-1 ${
                      wd.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {wd.pnl >= 0 ? '+' : '-'}${Math.abs(wd.pnl).toFixed(0)}
                  </div>
                  <div className="text-[10px] font-mono-tabular text-slate-500">
                    {wd.trades}t
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
              <div className="text-[11px] text-slate-400">R-Multiple Distribution</div>
              {breakdowns.rBuckets.map((b) => {
                const pct = Math.round((b.count / Math.max(agentTrades.length, 1)) * 100);
                return (
                  <div key={b.label} className="flex items-center gap-2 text-xs font-mono-tabular">
                    <span className="w-24 text-slate-400 text-[11px]">{b.label}</span>
                    <div className="flex-1 h-2 rounded bg-white/[0.06] overflow-hidden">
                      <div
                        className={`h-full ${
                          b.min >= 0 ? 'bg-[#00adff]' : 'bg-rose-500/80'
                        }`}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-slate-300">{b.count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Setup Style Tag Performance & Post-Mortem Mistake Tags */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1017] p-4 space-y-4">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Playbook Setup Style Tags & Mistake Telemetry
            </h3>
            <div className="space-y-2">
              {breakdowns.styleList.slice(0, 4).map((st) => (
                <div
                  key={st.tag}
                  className="rounded-lg bg-[#111722] border border-white/[0.05] px-3 py-2 flex items-center justify-between text-xs font-mono-tabular"
                >
                  <div>
                    <div className="text-slate-200 font-medium">{st.tag}</div>
                    <div className="text-[10.5px] text-slate-400">
                      {st.trades} trades • {st.winRate}% WR • Avg {st.avgR}R
                    </div>
                  </div>
                  <span
                    className={`font-semibold ${
                      st.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {st.pnl >= 0 ? '+' : '-'}${Math.abs(st.pnl).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
              <div className="text-[11px] text-slate-400">
                Post-Mortem Mistake Tags & Confidence Calibration
              </div>
              <div className="flex flex-wrap gap-1.5">
                {breakdowns.mistakes.map((m) => (
                  <span
                    key={m.tag}
                    className="px-2 py-0.5 rounded bg-[#111722] border border-white/[0.08] text-[10.5px] font-mono-tabular text-slate-300"
                  >
                    {m.tag}: <strong className="text-[#00adff]">{m.count}</strong>
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10.5px] font-mono-tabular">
                {breakdowns.confCalibration.map((c) => (
                  <div
                    key={c.bucket}
                    className="rounded bg-[#111722] p-1.5 text-center border border-white/[0.04]"
                  >
                    <div className="text-slate-400">Conf {c.bucket}</div>
                    <div className="text-[#00adff] font-semibold">
                      Actual {c.actualWinRate}% WR
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
