import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import { LeaderboardEntry, TradeRecord, UsdNewsEvent } from '../types/arena';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

interface Props {
  events: UsdNewsEvent[];
  trades?: TradeRecord[];
  leaderboard?: LeaderboardEntry[];
}

interface DaySummary {
  dateStr: string;
  pnlUsd: number;
  rTotal: number;
  tradesCount: number;
  wins: number;
  losses: number;
  winRate: number;
  trades: TradeRecord[];
  events: UsdNewsEvent[];
  tags: string[];
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export const UsdCalendarView: React.FC<Props> = ({
  events,
  trades = [],
  leaderboard = [],
}) => {
  // Default to latest active month in trades or events (November 2026)
  const latestMonth = useMemo(() => {
    const allDates = [
      ...trades.map((t) => t.closed_at?.slice(0, 7)).filter(Boolean),
      ...events.map((e) => e.date?.slice(0, 7)).filter(Boolean),
    ].sort();
    const last = allDates[allDates.length - 1] || '2026-11';
    const [y, m] = last.split('-').map(Number);
    return { year: y || 2026, month: (m || 11) - 1 }; // 0-indexed month
  }, [trades, events]);

  const [currentYear, setCurrentYear] = useState<number>(latestMonth.year);
  const [currentMonth, setCurrentMonth] = useState<number>(latestMonth.month);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all_ai');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // TradesViz-style calendar display options
  const [showEconomicEvents, setShowEconomicEvents] = useState<boolean>(true);
  const [showHighImpact, setShowHighImpact] = useState<boolean>(true);
  const [showDayTags, setShowDayTags] = useState<boolean>(true);
  const [compactCalendar, setCompactCalendar] = useState<boolean>(false);
  const [hidePnl, setHidePnl] = useState<boolean>(false);
  const [showRValue, setShowRValue] = useState<boolean>(false);
  const [startFromMonday, setStartFromMonday] = useState<boolean>(false);
  const [hideWeekends, setHideWeekends] = useState<boolean>(false);

  const aiAgents = useMemo(
    () =>
      leaderboard.filter(
        (a) => !a.agent_id.startsWith('ctrl-') && a.agent_id !== 'consensus'
      ),
    [leaderboard]
  );

  const filteredTrades = useMemo(() => {
    if (selectedAgentId === 'all_ai') {
      return trades.filter(
        (t) => !t.agent_id.startsWith('ctrl-') && t.agent_id !== 'consensus'
      );
    }
    if (selectedAgentId === 'all_accounts') return trades;
    return trades.filter((t) => t.agent_id === selectedAgentId);
  }, [trades, selectedAgentId]);

  const dayMap = useMemo(() => {
    const map = new Map<string, DaySummary>();

    const ensureDay = (dateStr: string): DaySummary => {
      let existing = map.get(dateStr);
      if (!existing) {
        existing = {
          dateStr,
          pnlUsd: 0,
          rTotal: 0,
          tradesCount: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          trades: [],
          events: [],
          tags: [],
        };
        map.set(dateStr, existing);
      }
      return existing;
    };

    for (const t of filteredTrades) {
      const dateStr = (t.closed_at || t.opened_at || '').slice(0, 10);
      if (!dateStr) continue;
      const d = ensureDay(dateStr);
      d.pnlUsd += t.pnl_usd || 0;
      d.rTotal += t.r_multiple || 0;
      d.tradesCount += 1;
      if ((t.pnl_usd || 0) >= 0) d.wins += 1;
      else d.losses += 1;
      d.trades.push(t);
      if (t.style_tag && !d.tags.includes(t.style_tag)) {
        d.tags.push(t.style_tag);
      }
    }

    for (const ev of events) {
      const dateStr = (ev.date || ev.time || '').slice(0, 10);
      if (!dateStr) continue;
      const d = ensureDay(dateStr);
      d.events.push(ev);
    }

    map.forEach((d) => {
      d.winRate = d.tradesCount > 0 ? (d.wins / d.tradesCount) * 100 : 0;
    });

    return map;
  }, [filteredTrades, events]);

  // Build calendar weeks for currentYear / currentMonth
  const calendarWeeks = useMemo(() => {
    const firstDayOfMonth = new Date(Date.UTC(currentYear, currentMonth, 1));
    const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
    const firstWeekday = firstDayOfMonth.getUTCDay(); // 0=Sun..6=Sat

    const offset = startFromMonday
      ? firstWeekday === 0
        ? 6
        : firstWeekday - 1
      : firstWeekday;

    const cells: ({ day: number; dateStr: string } | null)[] = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        dateStr: `${currentYear}-${pad2(currentMonth + 1)}-${pad2(d)}`,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    const weeks: {
      days: ({ day: number; dateStr: string; weekday: number } | null)[];
      totalPnl: number;
      avgPnl: number;
      wins: number;
      losses: number;
      winRate: number;
      activeDays: number;
    }[] = [];

    for (let i = 0; i < cells.length; i += 7) {
      const slice = cells.slice(i, i + 7).map((c, idx) => {
        const weekday = startFromMonday ? (idx + 1) % 7 : idx; // 0=Sun, 6=Sat
        return c ? { ...c, weekday } : null;
      });

      let totalPnl = 0;
      let wins = 0;
      let losses = 0;
      let activeDays = 0;

      for (const cell of slice) {
        if (!cell) continue;
        const summary = dayMap.get(cell.dateStr);
        if (summary && summary.tradesCount > 0) {
          totalPnl += summary.pnlUsd;
          wins += summary.wins;
          losses += summary.losses;
          activeDays += 1;
        }
      }

      const totalTrades = wins + losses;
      weeks.push({
        days: slice,
        totalPnl,
        avgPnl: activeDays > 0 ? totalPnl / activeDays : 0,
        wins,
        losses,
        winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
        activeDays,
      });
    }

    return weeks;
  }, [currentYear, currentMonth, startFromMonday, dayMap]);

  const monthlyNetPnl = useMemo(
    () => calendarWeeks.reduce((acc, w) => acc + w.totalPnl, 0),
    [calendarWeeks]
  );

  const dayHeaders = useMemo(() => {
    const base = startFromMonday
      ? [
          { label: 'Mon', weekday: 1 },
          { label: 'Tue', weekday: 2 },
          { label: 'Wed', weekday: 3 },
          { label: 'Thu', weekday: 4 },
          { label: 'Fri', weekday: 5 },
          { label: 'Sat', weekday: 6 },
          { label: 'Sun', weekday: 0 },
        ]
      : [
          { label: 'Sun', weekday: 0 },
          { label: 'Mon', weekday: 1 },
          { label: 'Tue', weekday: 2 },
          { label: 'Wed', weekday: 3 },
          { label: 'Thu', weekday: 4 },
          { label: 'Fri', weekday: 5 },
          { label: 'Sat', weekday: 6 },
        ];
    return hideWeekends
      ? base.filter((d) => d.weekday !== 0 && d.weekday !== 6)
      : base;
  }, [startFromMonday, hideWeekends]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleToday = () => {
    setCurrentYear(latestMonth.year);
    setCurrentMonth(latestMonth.month);
  };

  const selectedDaySummary = selectedDate ? dayMap.get(selectedDate) : undefined;

  const categories = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.category));
    return ['all', ...Array.from(set)];
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (categoryFilter === 'all') return events;
    return events.filter((e) => e.category === categoryFilter);
  }, [events, categoryFilter]);

  return (
    <div className="space-y-6 min-w-0">
      {/* Header */}
      <Card className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <CalendarIcon className="w-4 h-4 text-[#00adff] shrink-0" strokeWidth={1.6} />
            <h1 className="apple-title text-[#F5F5F7]">
              Trading & USD macroeconomic calendar
            </h1>
            <Badge variant="positive">USD only</Badge>
          </div>
          <p className="text-[13px] text-[#8E8E93]">
            Monthly P&L calendar with weekly totals, win rates, and ±30m USD high-impact news blackout markers
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Badge variant="secondary" className="font-mono-tabular">
            {events.length} USD releases
          </Badge>
          <Badge variant="accent" className="font-mono-tabular">
            ±30m blackout guard
          </Badge>
        </div>
      </Card>

      {/* TradesViz-Style Monthly Trading Calendar */}
      <Card className="overflow-visible">
        {/* Top Control Toolbar */}
        <div className="p-4 sm:p-5 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleToday}>
              Today
            </Button>

            <select
              aria-label="Select month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(Number(e.target.value))}
              className="h-8 px-2.5 rounded-lg bg-[#141417] border border-white/[0.08] text-[12.5px] font-medium text-[#F5F5F7] focus:outline-none focus:border-[#00adff]"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx}>
                  {name}
                </option>
              ))}
            </select>

            <select
              aria-label="Select year"
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
              className="h-8 px-2.5 rounded-lg bg-[#141417] border border-white/[0.08] text-[12.5px] font-medium text-[#F5F5F7] font-mono-tabular focus:outline-none focus:border-[#00adff]"
            >
              {[2025, 2026, 2027].map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter account"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="h-8 px-2.5 rounded-lg bg-[#141417] border border-white/[0.08] text-[12.5px] font-medium text-[#F5F5F7] focus:outline-none focus:border-[#00adff] max-w-[180px]"
            >
              <option value="all_ai">All 8 AI models</option>
              <option value="all_accounts">All accounts (11)</option>
              {aiAgents.map((ag) => (
                <option key={ag.agent_id} value={ag.agent_id}>
                  {ag.display_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 relative">
            <div
              className={`h-8 px-3 rounded-lg border flex items-center text-[13px] font-semibold font-mono-tabular ${
                monthlyNetPnl >= 0
                  ? 'bg-[#30D158]/15 border-[#30D158]/30 text-[#30D158]'
                  : 'bg-[#FF453A]/15 border-[#FF453A]/30 text-[#FF453A]'
              }`}
            >
              {monthlyNetPnl >= 0 ? '+' : ''}${monthlyNetPnl.toFixed(2)}
            </div>

            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-8 h-8 rounded-lg bg-[#141417] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:text-white cursor-pointer"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleNextMonth}
              className="w-8 h-8 rounded-lg bg-[#141417] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] hover:text-white cursor-pointer"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
                filterOpen
                  ? 'bg-[#00adff]/20 border-[#00adff]/50 text-[#00adff]'
                  : 'bg-[#141417] border-white/[0.08] text-[#A1A1AA] hover:text-white'
              }`}
              aria-label="Calendar display options"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            {/* TradesViz-style Filter Popover */}
            {filterOpen && (
              <div className="absolute right-0 top-10 z-40 w-60 rounded-xl bg-[#121215] border border-white/[0.12] shadow-2xl p-3.5 space-y-3 text-[12.5px]">
                <div className="space-y-1.5">
                  <div className="text-[10.5px] font-semibold text-[#71717A] tracking-wider uppercase">
                    Events
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-[#F5F5F7]">
                    <input
                      type="checkbox"
                      checked={showEconomicEvents}
                      onChange={(e) => setShowEconomicEvents(e.target.checked)}
                      className="accent-[#00adff]"
                    />
                    <span>Economic Events (USD)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[#F5F5F7]">
                    <input
                      type="checkbox"
                      checked={showHighImpact}
                      onChange={(e) => setShowHighImpact(e.target.checked)}
                      className="accent-[#FF453A]"
                    />
                    <span>High Impact Events</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[#F5F5F7]">
                    <input
                      type="checkbox"
                      checked={showDayTags}
                      onChange={(e) => setShowDayTags(e.target.checked)}
                      className="accent-[#00adff]"
                    />
                    <span>Day Tags</span>
                  </label>
                </div>

                <div className="border-t border-white/[0.07] pt-2.5 space-y-1.5">
                  <div className="text-[10.5px] font-semibold text-[#71717A] tracking-wider uppercase">
                    Display
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-[#F5F5F7]">
                    <input
                      type="checkbox"
                      checked={compactCalendar}
                      onChange={(e) => setCompactCalendar(e.target.checked)}
                      className="accent-[#00adff]"
                    />
                    <span>Compact Calendar</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[#F5F5F7]">
                    <input
                      type="checkbox"
                      checked={hidePnl}
                      onChange={(e) => setHidePnl(e.target.checked)}
                      className="accent-[#00adff]"
                    />
                    <span>Hide PnL</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[#F5F5F7]">
                    <input
                      type="checkbox"
                      checked={showRValue}
                      onChange={(e) => setShowRValue(e.target.checked)}
                      className="accent-[#00adff]"
                    />
                    <span>Show R-value</span>
                  </label>
                </div>

                <div className="border-t border-white/[0.07] pt-2.5 space-y-1.5">
                  <div className="text-[10.5px] font-semibold text-[#71717A] tracking-wider uppercase">
                    Layout
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-[#F5F5F7]">
                    <input
                      type="checkbox"
                      checked={startFromMonday}
                      onChange={(e) => setStartFromMonday(e.target.checked)}
                      className="accent-[#00adff]"
                    />
                    <span>Start from Mondays</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[#F5F5F7]">
                    <input
                      type="checkbox"
                      checked={hideWeekends}
                      onChange={(e) => setHideWeekends(e.target.checked)}
                      className="accent-[#00adff]"
                    />
                    <span>Hide weekends</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Calendar Grid (Horizontal scroll safe on small mobile) */}
        <div className="w-full overflow-x-auto">
          <div className="min-w-[820px]">
            {/* Day Column Headers + Weekly */}
            <div
              className="grid border-b border-white/[0.07] bg-[#0B0B0E]"
              style={{
                gridTemplateColumns: `repeat(${dayHeaders.length}, minmax(0, 1fr)) 136px`,
              }}
            >
              {dayHeaders.map((h) => (
                <div
                  key={h.label}
                  className="py-2.5 px-3 text-center text-[12px] font-medium text-[#8E8E93] border-r border-white/[0.05]"
                >
                  {h.label}
                </div>
              ))}
              <div className="py-2.5 px-3 text-center text-[12px] font-semibold text-[#00adff]">
                Weekly
              </div>
            </div>

            {/* Weeks */}
            <div className="divide-y divide-white/[0.06]">
              {calendarWeeks.map((week, wIdx) => {
                const visibleDays = hideWeekends
                  ? week.days.filter((d) => !d || (d.weekday !== 0 && d.weekday !== 6))
                  : week.days;

                return (
                  <div
                    key={wIdx}
                    className="grid"
                    style={{
                      gridTemplateColumns: `repeat(${dayHeaders.length}, minmax(0, 1fr)) 136px`,
                    }}
                  >
                    {visibleDays.map((cell, cIdx) => {
                      if (!cell) {
                        return (
                          <div
                            key={`empty-${wIdx}-${cIdx}`}
                            className={`${
                              compactCalendar ? 'min-h-[82px]' : 'min-h-[116px]'
                            } bg-[#050507] border-r border-white/[0.05]`}
                          />
                        );
                      }

                      const summary = dayMap.get(cell.dateStr);
                      const hasTrades = Boolean(summary && summary.tradesCount > 0);
                      const isPos = (summary?.pnlUsd || 0) >= 0;
                      const isSelected = selectedDate === cell.dateStr;

                      const cellBg = hasTrades
                        ? isPos
                          ? 'bg-[#30D158]/[0.11] hover:bg-[#30D158]/[0.17]'
                          : 'bg-[#FF453A]/[0.11] hover:bg-[#FF453A]/[0.17]'
                        : 'bg-[#09090B] hover:bg-[#111114]';

                      const visibleEvents = (summary?.events || []).filter((ev) => {
                        if (!showEconomicEvents) return false;
                        if (!showHighImpact && ev.impact === 'High') return false;
                        return true;
                      });

                      return (
                        <button
                          key={cell.dateStr}
                          type="button"
                          onClick={() => setSelectedDate(cell.dateStr)}
                          className={`${
                            compactCalendar ? 'min-h-[82px]' : 'min-h-[116px]'
                          } p-2.5 border-r border-white/[0.05] text-left flex flex-col justify-between transition-colors cursor-pointer min-w-0 overflow-hidden ${cellBg} ${
                            isSelected ? 'ring-1 ring-inset ring-[#00adff]' : ''
                          }`}
                        >
                          {/* Top row: Day number + USD event badge */}
                          <div className="flex items-center justify-between gap-1 w-full min-w-0">
                            <span className="text-[12px] font-medium font-mono-tabular text-[#A1A1AA]">
                              {cell.day}
                            </span>
                            {visibleEvents.length > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-[#00adff]/15 text-[#00adff] text-[10px] font-semibold truncate max-w-[76px]">
                                USD ({visibleEvents.length})
                              </span>
                            )}
                          </div>

                          {/* Middle: PnL & Win/Loss stats */}
                          {hasTrades && summary ? (
                            <div className="my-1 space-y-0.5 min-w-0 w-full">
                              {!hidePnl && (
                                <div
                                  className={`text-[15px] font-semibold tracking-tight font-mono-tabular truncate ${
                                    isPos ? 'text-[#30D158]' : 'text-[#FF453A]'
                                  }`}
                                >
                                  {isPos ? '+' : ''}${summary.pnlUsd.toFixed(2)}
                                </div>
                              )}
                              {showRValue && (
                                <div className="text-[11px] font-mono-tabular text-[#00adff]">
                                  {summary.rTotal >= 0 ? '+' : ''}
                                  {summary.rTotal.toFixed(1)}R
                                </div>
                              )}
                              <div className="text-[11px] text-[#A1A1AA] font-mono-tabular truncate">
                                Trades: {summary.tradesCount}
                              </div>
                              {!compactCalendar && (
                                <div className="text-[10.5px] text-[#8E8E93] font-mono-tabular truncate">
                                  W: {summary.wins} L: {summary.losses} ({summary.winRate.toFixed(0)}%)
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="my-1 text-[11px] text-[#52525B]">—</div>
                          )}

                          {/* Bottom: Event / Day Tag Pills */}
                          <div className="flex flex-wrap items-center gap-1 w-full min-w-0">
                            {visibleEvents.slice(0, 1).map((ev) => (
                              <span
                                key={ev.event_id}
                                className="px-1.5 py-0.5 rounded bg-[#FF453A]/15 text-[#FF453A] text-[10px] font-medium truncate max-w-full"
                                title={ev.name}
                              >
                                {ev.name}
                              </span>
                            ))}
                            {showDayTags && summary?.tags.slice(0, 1).map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded bg-white/[0.07] text-[#A1A1AA] text-[10px] truncate max-w-full"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </button>
                      );
                    })}

                    {/* Weekly Summary Cell */}
                    <div
                      className={`${
                        compactCalendar ? 'min-h-[82px]' : 'min-h-[116px]'
                      } p-2.5 bg-[#070709] flex flex-col justify-center gap-1 min-w-0`}
                    >
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="text-[#71717A]">TOTAL</span>
                        <span
                          className={`font-mono-tabular font-semibold ${
                            week.totalPnl > 0
                              ? 'text-[#30D158]'
                              : week.totalPnl < 0
                              ? 'text-[#FF453A]'
                              : 'text-[#A1A1AA]'
                          }`}
                        >
                          {week.totalPnl >= 0 ? '+' : ''}${week.totalPnl.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="text-[#71717A]">AVG</span>
                        <span className="font-mono-tabular text-[#D4D4D8]">
                          {week.avgPnl >= 0 ? '+' : ''}${week.avgPnl.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10.5px] font-mono-tabular pt-0.5">
                        <span className="text-[#30D158]">{week.wins}W</span>
                        <span className="text-[#FF453A]">{week.losses}L</span>
                      </div>
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="text-[#71717A]">WR</span>
                        <span className="font-mono-tabular font-medium text-[#F5F5F7]">
                          {week.winRate.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Selected Day Inspector */}
      {selectedDate && (
        <Card className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
            <div>
              <h2 className="apple-title text-[#F5F5F7] font-mono-tabular">
                Session breakdown: {selectedDate}
              </h2>
              <p className="text-[12.5px] text-[#8E8E93] mt-0.5">
                {selectedDaySummary?.tradesCount || 0} executed trades •{' '}
                {selectedDaySummary?.events.length || 0} USD macroeconomic releases
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setSelectedDate(null)}>
              Close
            </Button>
          </div>

          {selectedDaySummary?.events && selectedDaySummary.events.length > 0 && (
            <div className="space-y-2">
              <div className="text-[12px] font-medium text-[#00adff]">
                USD macroeconomic releases on {selectedDate}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedDaySummary.events.map((ev) => (
                  <div
                    key={ev.event_id}
                    className="rounded-xl bg-[#121215] border border-white/[0.07] p-3.5 space-y-1.5 min-w-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[#F5F5F7] truncate">{ev.name}</span>
                      <Badge variant={ev.gold_60m_move_usd >= 0 ? 'positive' : 'negative'}>
                        60m: {ev.gold_60m_move_usd >= 0 ? '+' : ''}${ev.gold_60m_move_usd.toFixed(2)}
                      </Badge>
                    </div>
                    <div className="text-[12px] text-[#A1A1AA] font-mono-tabular">
                      Actual {ev.actual} • Forecast {ev.forecast} • Prior {ev.prior}
                    </div>
                    <div className="text-[12px] text-[#8E8E93]">{ev.neutral_summary}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedDaySummary?.trades && selectedDaySummary.trades.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Exit</TableHead>
                  <TableHead className="text-right">R-multiple</TableHead>
                  <TableHead className="text-right">Net P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedDaySummary.trades.slice(0, 15).map((t) => (
                  <TableRow key={t.trade_id}>
                    <TableCell className="font-medium text-[#F5F5F7]">{t.model_name}</TableCell>
                    <TableCell>
                      <Badge variant={t.action === 'long' ? 'positive' : 'negative'}>
                        {t.action.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono-tabular">
                      ${t.entry.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono-tabular">
                      ${t.exit_price.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono-tabular text-[#00adff]">
                      {t.r_multiple >= 0 ? '+' : ''}
                      {t.r_multiple.toFixed(2)}R
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono-tabular font-medium ${
                        t.pnl_usd >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                      }`}
                    >
                      {t.pnl_usd >= 0 ? '+' : ''}${t.pnl_usd.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-[13px] text-[#8E8E93]">
              No closed trades recorded on this date.
            </div>
          )}
        </Card>
      )}

      {/* 3 Rule Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 space-y-1.5 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#8E8E93]">Currency scope</span>
            <ShieldAlert className="w-4 h-4 text-[#00adff] shrink-0" strokeWidth={1.5} />
          </div>
          <div className="text-[18px] font-semibold tracking-[-0.02em] text-[#F5F5F7]">
            USD releases only
          </div>
          <p className="text-[12px] text-[#8E8E93]">
            EUR, GBP, JPY, and AUD events are ignored to prevent noisy false blackouts on XAUUSD
          </p>
        </Card>

        <Card className="p-5 space-y-1.5 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#8E8E93]">Blackout window</span>
            <Clock className="w-4 h-4 text-[#30D158] shrink-0" strokeWidth={1.5} />
          </div>
          <div className="text-[18px] font-semibold tracking-[-0.02em] text-[#F5F5F7]">
            30 min before & after
          </div>
          <p className="text-[12px] text-[#8E8E93]">
            All 8 AI models hold new entries during high-impact USD news spikes and log shadow counterfactuals
          </p>
        </Card>

        <Card className="p-5 space-y-1.5 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#8E8E93]">Feed source</span>
            <Badge variant="positive">Active</Badge>
          </div>
          <div className="text-[18px] font-semibold tracking-[-0.02em] text-[#F5F5F7]">
            Finnhub + DXY / US10Y
          </div>
          <p className="text-[12px] text-[#8E8E93]">
            Surprise delta and 15m / 60m Gold price reaction are recorded into each AI post-mortem
          </p>
        </Card>
      </div>

      {/* Category Filter + Full Calendar Table */}
      <Card className="overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="apple-title text-[#F5F5F7]">Economic release schedule</h2>
            <p className="text-[13px] text-[#8E8E93] mt-0.5">
              Actual vs consensus forecast and measured XAUUSD spot reaction
            </p>
          </div>

          <Tabs value={categoryFilter} onValueChange={setCategoryFilter}>
            <TabsList className="flex-wrap">
              {categories.slice(0, 5).map((cat) => (
                <TabsTrigger key={cat} value={cat}>
                  {cat === 'all' ? 'All events' : cat}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date & time (UTC)</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Impact</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">Forecast</TableHead>
              <TableHead className="text-right">Prior</TableHead>
              <TableHead className="text-right">15m Gold</TableHead>
              <TableHead className="text-right">60m Gold</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEvents.map((ev) => (
              <TableRow key={ev.event_id}>
                <TableCell className="font-mono-tabular whitespace-nowrap text-[#A1A1AA]">
                  {ev.time.slice(0, 16).replace('T', ' ')}
                </TableCell>
                <TableCell>
                  <Badge variant="accent">{ev.currency}</Badge>
                </TableCell>
                <TableCell className="max-w-[320px]">
                  <div className="font-medium text-[#F5F5F7] truncate">{ev.name}</div>
                  <div className="text-[12px] text-[#8E8E93] mt-0.5 line-clamp-2">
                    {ev.neutral_summary}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="negative">{ev.impact}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono-tabular font-medium text-[#F5F5F7] whitespace-nowrap">
                  {ev.actual}
                </TableCell>
                <TableCell className="text-right font-mono-tabular text-[#A1A1AA] whitespace-nowrap">
                  {ev.forecast}
                </TableCell>
                <TableCell className="text-right font-mono-tabular text-[#71717A] whitespace-nowrap">
                  {ev.prior}
                </TableCell>
                <TableCell
                  className={`text-right font-mono-tabular whitespace-nowrap ${
                    ev.gold_15m_move_usd >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                  }`}
                >
                  {ev.gold_15m_move_usd >= 0 ? '+' : ''}${ev.gold_15m_move_usd.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-mono-tabular whitespace-nowrap">
                  <Badge variant={ev.gold_60m_move_usd >= 0 ? 'positive' : 'negative'}>
                    {ev.gold_60m_move_usd >= 0 ? '+' : ''}${ev.gold_60m_move_usd.toFixed(2)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
