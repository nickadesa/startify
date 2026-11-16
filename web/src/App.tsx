import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Calendar,
  Cpu,
  LayoutGrid,
  Layers,
  Search,
  ArrowUpRight,
} from 'lucide-react';
import arenaSnapshotRaw from './data/arenaSnapshot.json';
import { ArenaPayload, LeaderboardEntry } from './types/arena';
import { EquityCurveChart } from './components/EquityCurveChart';
import { OteCandlestickChart } from './components/OteCandlestickChart';
import { AgentDetailModal } from './components/AgentDetailModal';
import { PlaybooksAndSystemView } from './components/PlaybooksAndSystemView';
import { BacktestAndSkillsView } from './components/BacktestAndSkillsView';
import { UsdCalendarView } from './components/UsdCalendarView';
import { Card } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './components/ui/table';

const initialArenaData = arenaSnapshotRaw as unknown as ArenaPayload;

type NavSection = 'overview' | 'calendar' | 'terminal' | 'backtest' | 'models' | 'journal';

export function App() {
  const [arenaData, setArenaData] = useState<ArenaPayload>(initialArenaData);
  const [activeNav, setActiveNav] = useState<NavSection>('overview');
  const [selectedChartAgentId, setSelectedChartAgentId] = useState<string | null>(null);
  const [modalAgent, setModalAgent] = useState<LeaderboardEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [accountFilter, setAccountFilter] = useState<'all' | 'ai_only' | 'benchmarks'>('all');

  useEffect(() => {
    fetch('/api/arena')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json && json.leaderboard && json.leaderboard.length > 0) {
          setArenaData(json);
        }
      })
      .catch(() => {
        // Offline / static snapshot fallback already loaded
      });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const el = document.getElementById('startify-search-input');
        el?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filteredLeaderboard = useMemo(() => {
    return arenaData.leaderboard.filter((item) => {
      const isCtrl = item.agent_id.startsWith('ctrl-') || item.agent_id === 'consensus';
      if (accountFilter === 'ai_only' && isCtrl) return false;
      if (accountFilter === 'benchmarks' && !isCtrl) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.display_name.toLowerCase().includes(q) ||
          item.model_name.toLowerCase().includes(q) ||
          item.provider.toLowerCase().includes(q) ||
          item.style_archetype.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [arenaData.leaderboard, accountFilter, searchQuery]);

  const topChampion = arenaData.leaderboard[0];
  const consensusAccount =
    arenaData.leaderboard.find((a) => a.agent_id === 'consensus') || arenaData.leaderboard[1];
  const totalTradesCount = arenaData.trades.length;
  const backtestCandlesCount =
    arenaData.backtest_summary?.dataset?.total_candles || 2700;

  const navItems: { id: NavSection; label: string; icon: React.FC<any>; count?: string }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'calendar', label: 'USD calendar', icon: Calendar, count: `${arenaData.news_events.length}` },
    { id: 'terminal', label: 'Market terminal', icon: BarChart3, count: '4 TF' },
    { id: 'backtest', label: 'Backtest & skills', icon: Layers, count: '11' },
    { id: 'models', label: 'AI models', icon: Cpu, count: '8' },
    { id: 'journal', label: 'Journal & playbooks', icon: BookOpen },
  ];

  return (
    <div className="min-h-screen bg-[#000000] text-[#F5F5F7] flex flex-col lg:flex-row">
      {/* Left Sidebar (Desktop) */}
      <aside className="hidden lg:flex lg:w-[248px] lg:flex-col lg:fixed lg:inset-y-0 bg-[#000000] border-r border-white/[0.08] px-4 py-5 select-none z-30">
        <div className="flex items-center justify-between px-2 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#121215] border border-white/[0.1] flex items-center justify-center">
              <span className="text-[15px] font-bold tracking-tight text-[#00adff]">S</span>
            </div>
            <div>
              <div className="text-[15px] font-semibold tracking-[-0.015em] text-[#F5F5F7] leading-none">
                Startify
              </div>
              <div className="text-[11px] text-[#71717A] mt-1 font-mono-tabular">
                XAUUSD Arena v2.5
              </div>
            </div>
          </div>
          <span className="w-2 h-2 rounded-full bg-[#30D158]" title="Engine online" />
        </div>

        {/* Search Input with Command+K Keycaps */}
        <div className="relative mb-5">
          <Search
            className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            strokeWidth={1.5}
          />
          <input
            id="startify-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search models"
            className="w-full h-9 pl-8 pr-14 rounded-xl bg-[#111114] border border-white/[0.08] text-[13px] text-[#F5F5F7] placeholder:text-[#71717A] focus:outline-none focus:border-white/[0.2] transition-colors"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono-tabular text-[#A1A1AA] bg-[#1C1C1E] rounded border border-white/[0.08]">
              ⌘
            </kbd>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono-tabular text-[#A1A1AA] bg-[#1C1C1E] rounded border border-white/[0.08]">
              K
            </kbd>
          </div>
        </div>

        <nav className="space-y-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`w-full h-9 px-3 rounded-xl flex items-center justify-between text-[13px] font-medium tracking-[-0.005em] cursor-pointer active:scale-[0.98] transition-[transform,background-color,color,border-color] duration-150 ${
                  active
                    ? 'bg-[#18181B] text-[#F5F5F7] border border-white/[0.1]'
                    : 'text-[#A1A1AA] hover:text-[#F5F5F7] hover:bg-[#111114] border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-[#00adff]' : 'text-[#8E8E93]'
                    }`}
                    strokeWidth={1.6}
                  />
                  <span>{item.label}</span>
                </div>
                {item.count && (
                  <span className="text-[11px] font-mono-tabular text-[#71717A]">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* MyFundedFutures-Inspired Published Rules Card */}
        <div className="rounded-xl bg-[#09090B] border border-white/[0.08] p-3.5 space-y-2 mt-4">
          <div className="text-[11px] font-medium text-[#71717A]">Published arena rules</div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#A1A1AA]">Starting equity</span>
            <span className="font-mono-tabular text-[#F5F5F7] font-medium">$1,000.00</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#A1A1AA]">Max risk / trade</span>
            <span className="font-mono-tabular text-[#00adff]">2.0%</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#A1A1AA]">Scan budget</span>
            <span className="font-mono-tabular text-[#F5F5F7]">100–500 / day</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#A1A1AA]">Macro filter</span>
            <span className="font-mono-tabular text-[#30D158]">USD only</span>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-[248px] flex flex-col min-h-screen pb-20 lg:pb-10">
        {/* Translucent Sticky Top Bar */}
        <header className="sticky top-0 z-20 apple-glass border-b border-white/[0.08] px-4 sm:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#141417] border border-white/[0.1] flex items-center justify-center text-[13px] font-bold text-[#00adff]">
                S
              </div>
              <span className="text-[15px] font-semibold tracking-[-0.015em]">Startify</span>
            </div>
            <div className="hidden lg:flex items-center gap-2 text-[13px]">
              <span className="text-[#8E8E93]">Startify</span>
              <span className="text-[#636366]">/</span>
              <span className="text-[#F5F5F7] font-medium">
                {navItems.find((n) => n.id === activeNav)?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Badge variant="secondary" className="font-mono-tabular hidden sm:inline-flex">
              XAUUSD $4,028.90
            </Badge>
            <button
              type="button"
              onClick={() => setActiveNav('calendar')}
              className="cursor-pointer active:scale-[0.97] transition-transform"
            >
              <Badge variant="positive" className="font-mono-tabular">
                USD Calendar ({arenaData.news_events.length})
              </Badge>
            </button>
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                setActiveNav(activeNav === 'backtest' ? 'overview' : 'backtest')
              }
            >
              <span>
                {activeNav === 'backtest' ? 'Live arena' : 'Backtest & skills'}
              </span>
            </Button>
          </div>
        </header>

        {/* Page Container */}
        <main className="w-full max-w-[1440px] mx-auto px-4 sm:px-8 pt-6 space-y-6">
          {/* ==================== VIEW 1: OVERVIEW ==================== */}
          {activeNav === 'overview' && (
            <div className="space-y-6">
              {/* MyFundedFutures-Style Clear Hero Header */}
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                  <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-[-0.03em] text-[#F5F5F7] leading-tight">
                    Trade well. Proven in simulation.
                  </h1>
                  <p className="text-[14px] text-[#8E8E93] mt-1">
                    8 autonomous AI models competing from $1,000.00 starting equity with Fib OTE (0.705), Break-Even at +1.0R, and -0.27 / -0.618 partial close
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="font-mono-tabular">
                    {totalTradesCount} trades logged
                  </Badge>
                  <Badge variant="accent" className="font-mono-tabular">
                    {backtestCandlesCount.toLocaleString()} historical bars
                  </Badge>
                </div>
              </div>

              {/* MyFundedFutures 3-Step Standard Bar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-[#00adff]">01 • Pre-flight backtest</div>
                    <div className="text-[14px] font-medium text-[#F5F5F7] mt-0.5">
                      Per-model historical validation
                    </div>
                    <div className="text-[12px] text-[#8E8E93] mt-0.5">
                      Each model tests on its own 4H/1H/M15/M5 slice
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setActiveNav('backtest')}>
                    Inspect
                  </Button>
                </Card>

                <Card className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-[#30D158]">02 • Live simulation</div>
                    <div className="text-[14px] font-medium text-[#F5F5F7] mt-0.5">
                      Market, Limit & Zone Confirm
                    </div>
                    <div className="text-[12px] text-[#8E8E93] mt-0.5">
                      Automatic Break-Even lock & 50/50 partial exits
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setActiveNav('terminal')}>
                    Chart
                  </Button>
                </Card>

                <Card className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-[#FFD60A]">03 • USD macro guard</div>
                    <div className="text-[14px] font-medium text-[#F5F5F7] mt-0.5">
                      USD-only economic calendar
                    </div>
                    <div className="text-[12px] text-[#8E8E93] mt-0.5">
                      ±30m blackout around FOMC, NFP, CPI, PCE
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setActiveNav('calendar')}>
                    Calendar
                  </Button>
                </Card>
              </div>

              {/* Split Hero: Left Equity Chart (8 cols) + Right Summary Stack (4 cols) */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
                <div className="xl:col-span-8">
                  <EquityCurveChart
                    dailyStats={arenaData.daily_stats}
                    leaderboard={arenaData.leaderboard}
                    selectedAgentId={selectedChartAgentId}
                    onSelectAgent={setSelectedChartAgentId}
                  />
                </div>

                <div className="xl:col-span-4 flex flex-col justify-between gap-4">
                  {/* Card 1: Current Leader */}
                  <Card
                    className="p-5 flex-1 flex flex-col justify-between cursor-pointer hover:bg-[#121215] transition-colors"
                    onClick={() => setModalAgent(topChampion)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[#8E8E93]">Arena leader</span>
                      <Badge variant="positive" className="font-mono-tabular">
                        +{topChampion.net_pnl_pct.toFixed(2)}%
                      </Badge>
                    </div>
                    <div className="my-2">
                      <div className="apple-display text-[#F5F5F7]">
                        ${topChampion.current_equity.toFixed(2)}
                      </div>
                      <div className="text-[13px] text-[#A1A1AA] mt-1 flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: topChampion.color }}
                        />
                        <span className="font-medium text-[#F5F5F7]">{topChampion.display_name}</span>
                        <span className="text-[#71717A] text-[12px]">
                          {topChampion.model_name}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[12px] text-[#71717A] pt-2 border-t border-white/[0.06] font-mono-tabular">
                      <span>Win rate {topChampion.win_rate.toFixed(1)}%</span>
                      <span>PF {topChampion.profit_factor.toFixed(2)}</span>
                    </div>
                  </Card>

                  {/* Card 2: Multi-AI Consensus */}
                  <Card
                    className="p-5 flex-1 flex flex-col justify-between cursor-pointer hover:bg-[#121215] transition-colors"
                    onClick={() => setModalAgent(consensusAccount)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[#8E8E93]">
                        Multi-AI consensus (3+ align)
                      </span>
                      <Badge variant="accent" className="font-mono-tabular">
                        {consensusAccount.win_rate.toFixed(1)}% WR
                      </Badge>
                    </div>
                    <div className="my-2">
                      <div className="apple-display text-[#F5F5F7]">
                        ${consensusAccount.current_equity.toFixed(2)}
                      </div>
                      <div className="text-[13px] text-[#30D158] font-mono-tabular mt-1">
                        +${consensusAccount.net_pnl_usd.toFixed(2)} vs $1,000.00 baseline
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[12px] text-[#71717A] pt-2 border-t border-white/[0.06] font-mono-tabular">
                      <span>{arenaData.consensus_events.length} cluster signals</span>
                      <span>PF {consensusAccount.profit_factor.toFixed(2)}</span>
                    </div>
                  </Card>

                  {/* Card 3: USD Macro Calendar Quick Preview */}
                  <Card
                    className="p-5 flex-1 flex flex-col justify-between cursor-pointer hover:bg-[#121215] transition-colors"
                    onClick={() => setActiveNav('calendar')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[#8E8E93]">
                        USD economic calendar
                      </span>
                      <ArrowUpRight className="w-4 h-4 text-[#8E8E93]" strokeWidth={1.5} />
                    </div>
                    <div className="my-2 space-y-1.5">
                      {arenaData.news_events.slice(-2).map((ev) => (
                        <div key={ev.event_id} className="flex items-center justify-between text-[12px]">
                          <span className="text-[#F5F5F7] truncate pr-2">{ev.name}</span>
                          <span className="font-mono-tabular text-[#00adff] shrink-0">
                            {ev.date.slice(5)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[12px] text-[#00adff] pt-2 border-t border-white/[0.06]">
                      <span>Open full USD calendar</span>
                      <span className="font-mono-tabular">{arenaData.news_events.length} events</span>
                    </div>
                  </Card>
                </div>
              </div>

              {/* Ranked Leaderboard Table */}
              <Card className="overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="apple-title text-[#F5F5F7]">Leaderboard standings</h2>
                    <p className="text-[13px] text-[#8E8E93] mt-0.5">
                      Click any model to inspect its executed trades, Break-Even saves, and self-authored playbook
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 bg-[#141417] p-1 rounded-xl border border-white/[0.06] self-start sm:self-auto">
                    {(
                      [
                        { id: 'all', label: 'All (11)' },
                        { id: 'ai_only', label: '8 AI models' },
                        { id: 'benchmarks', label: 'Benchmarks' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setAccountFilter(tab.id)}
                        className={`px-3 py-1 rounded-lg text-[12px] font-medium cursor-pointer active:scale-[0.97] transition-colors ${
                          accountFilter === tab.id
                            ? 'bg-[#242429] text-[#F5F5F7]'
                            : 'text-[#8E8E93] hover:text-[#F5F5F7]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Rank</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Strategy archetype</TableHead>
                      <TableHead className="text-right">Current equity</TableHead>
                      <TableHead className="text-right">Net P&L</TableHead>
                      <TableHead className="text-right">Win rate</TableHead>
                      <TableHead className="text-right">Profit factor</TableHead>
                      <TableHead className="text-right">Expectancy</TableHead>
                      <TableHead className="text-right">Max DD</TableHead>
                      <TableHead className="text-right">Stage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeaderboard.map((item) => {
                      const isPos = item.net_pnl_usd >= 0;
                      return (
                        <TableRow
                          key={item.agent_id}
                          className="cursor-pointer"
                          onClick={() => setModalAgent(item)}
                        >
                          <TableCell className="font-mono-tabular text-[#8E8E93]">
                            #{item.rank}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              <div>
                                <div className="font-medium text-[#F5F5F7]">
                                  {item.display_name}
                                </div>
                                <div className="text-[11px] font-mono-tabular text-[#8E8E93]">
                                  {item.model_name}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-[#A1A1AA]">
                            {item.style_archetype}
                          </TableCell>
                          <TableCell className="text-right font-mono-tabular font-semibold text-[#F5F5F7]">
                            ${item.current_equity.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono-tabular">
                            <span className={isPos ? 'text-[#30D158]' : 'text-[#FF453A]'}>
                              {isPos ? '+' : ''}${item.net_pnl_usd.toFixed(2)} (
                              {isPos ? '+' : ''}
                              {item.net_pnl_pct.toFixed(1)}%)
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono-tabular">
                            {item.win_rate.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right font-mono-tabular text-[#00adff]">
                            {item.profit_factor.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono-tabular text-[#A1A1AA]">
                            {item.expectancy_r >= 0 ? '+' : ''}
                            {item.expectancy_r.toFixed(2)}R
                          </TableCell>
                          <TableCell className="text-right font-mono-tabular text-[#8E8E93]">
                            {item.max_drawdown_pct.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right">
                            {item.blowup_count > 0 ? (
                              <Badge variant="negative">Run #{item.current_run_number}</Badge>
                            ) : item.net_pnl_pct >= 20 ? (
                              <Badge variant="positive">Funded</Badge>
                            ) : (
                              <Badge variant="default">Eval</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {/* ==================== VIEW 2: USD CALENDAR ==================== */}
          {activeNav === 'calendar' && <UsdCalendarView events={arenaData.news_events} />}

          {/* ==================== VIEW 3: MARKET TERMINAL ==================== */}
          {activeNav === 'terminal' && (
            <div className="space-y-6">
              <OteCandlestickChart
                trades={arenaData.trades}
                selectedAgentId={selectedChartAgentId}
              />

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <Card className="xl:col-span-7 overflow-hidden">
                  <div className="p-5 sm:p-6 border-b border-white/[0.07] flex items-center justify-between">
                    <div>
                      <h2 className="apple-title text-[#F5F5F7]">
                        USD high-impact macroeconomic calendar
                      </h2>
                      <p className="text-[13px] text-[#8E8E93] mt-0.5">
                        Strictly filtered to USD releases with ±30m blackout protection
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setActiveNav('calendar')}>
                      Full calendar
                    </Button>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date & time (UTC)</TableHead>
                        <TableHead>USD release</TableHead>
                        <TableHead className="text-right">Actual / Forecast</TableHead>
                        <TableHead className="text-right">60m XAUUSD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {arenaData.news_events.map((ev) => (
                        <TableRow key={ev.event_id}>
                          <TableCell className="font-mono-tabular text-[#8E8E93] whitespace-nowrap">
                            {ev.time.slice(0, 16).replace('T', ' ')}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-[#F5F5F7]">{ev.name}</div>
                            <div className="text-[11px] text-[#8E8E93]">{ev.neutral_summary}</div>
                          </TableCell>
                          <TableCell className="text-right font-mono-tabular whitespace-nowrap">
                            <span className="text-[#F5F5F7]">{ev.actual}</span>{' '}
                            <span className="text-[#71717A]">/ {ev.forecast}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono-tabular whitespace-nowrap">
                            <Badge
                              variant={ev.gold_60m_move_usd >= 0 ? 'positive' : 'negative'}
                            >
                              {ev.gold_60m_move_usd >= 0 ? '+' : ''}$
                              {ev.gold_60m_move_usd.toFixed(2)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>

                <Card className="xl:col-span-5 p-5 sm:p-6 space-y-4">
                  <div className="border-b border-white/[0.07] pb-3 flex items-center justify-between">
                    <div>
                      <h2 className="apple-title text-[#F5F5F7]">
                        Multi-AI consensus signals
                      </h2>
                      <p className="text-[13px] text-[#8E8E93] mt-0.5">
                        Triggered when 3 or more models align within the same hour
                      </p>
                    </div>
                    <Badge variant="accent">{arenaData.consensus_events.length} events</Badge>
                  </div>

                  <div className="space-y-3">
                    {arenaData.consensus_events.map((ce) => (
                      <div
                        key={ce.event_id}
                        className="rounded-xl bg-[#121215] border border-white/[0.06] p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={ce.direction === 'long' ? 'positive' : 'negative'}
                            >
                              {ce.direction === 'long' ? 'Long' : 'Short'} ({ce.agreeing_count}/
                              {ce.total_active_agents} models)
                            </Badge>
                            <span className="text-[12px] font-mono-tabular text-[#8E8E93]">
                              {ce.time.slice(0, 16).replace('T', ' ')}
                            </span>
                          </div>
                          <span
                            className={`text-[13px] font-mono-tabular font-medium ${
                              ce.result_pnl_usd >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                            }`}
                          >
                            {ce.result_pnl_usd >= 0 ? '+' : ''}${ce.result_pnl_usd.toFixed(2)} (
                            {ce.result_r >= 0 ? '+' : ''}
                            {ce.result_r.toFixed(2)}R)
                          </span>
                        </div>
                        <div className="text-[12px] font-mono-tabular text-[#A1A1AA]">
                          Entry {ce.entry_range} • SL {ce.sl_range} • TP {ce.tp_range}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* ==================== VIEW 4: BACKTEST & SKILLS ==================== */}
          {activeNav === 'backtest' && <BacktestAndSkillsView data={arenaData} />}

          {/* ==================== VIEW 5: AI MODELS ==================== */}
          {activeNav === 'models' && (
            <div className="space-y-6">
              <div>
                <h1 className="apple-title text-[#F5F5F7]">
                  Autonomous AI models (November 2026 lineup)
                </h1>
                <p className="text-[13px] text-[#8E8E93] mt-0.5">
                  Each model runs on its own provider with automatic multi-model fallback chains, $1,000.00 equity, and independent playbooks
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {arenaData.leaderboard.slice(0, 9).map((ag) => {
                  const r = 28;
                  const c = 2 * Math.PI * r;
                  const winLen = (ag.win_rate / 100) * c;

                  return (
                    <Card
                      key={ag.agent_id}
                      className="p-5 space-y-4 cursor-pointer hover:bg-[#121215] transition-colors"
                      onClick={() => setModalAgent(ag)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: ag.color }}
                          />
                          <div>
                            <div className="text-[15px] font-medium text-[#F5F5F7]">
                              {ag.display_name}
                            </div>
                            <div className="text-[11px] font-mono-tabular text-[#8E8E93]">
                              {ag.model_name}
                            </div>
                          </div>
                        </div>
                        <Badge variant="default" className="font-mono-tabular">
                          Rank #{ag.rank}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div>
                          <div className="text-[12px] text-[#8E8E93]">Current equity</div>
                          <div className="text-[24px] font-semibold tracking-[-0.025em] font-mono-tabular text-[#F5F5F7] mt-0.5">
                            ${ag.current_equity.toFixed(2)}
                          </div>
                          <div
                            className={`text-[12px] font-mono-tabular mt-0.5 ${
                              ag.net_pnl_usd >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                            }`}
                          >
                            {ag.net_pnl_usd >= 0 ? '+' : ''}${ag.net_pnl_usd.toFixed(2)} (
                            {ag.net_pnl_pct >= 0 ? '+' : ''}
                            {ag.net_pnl_pct.toFixed(1)}%)
                          </div>
                        </div>

                        <div className="relative w-18 h-18 flex items-center justify-center">
                          <svg className="w-18 h-18 -rotate-90" viewBox="0 0 72 72">
                            <circle
                              cx="36"
                              cy="36"
                              r={r}
                              fill="none"
                              stroke="#FF453A"
                              strokeOpacity={0.3}
                              strokeWidth="6"
                            />
                            <circle
                              cx="36"
                              cy="36"
                              r={r}
                              fill="none"
                              stroke="#30D158"
                              strokeWidth="6"
                              strokeDasharray={`${winLen} ${c}`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="absolute text-[11px] font-mono-tabular font-medium text-[#F5F5F7]">
                            {ag.win_rate.toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/[0.06] text-[12px] font-mono-tabular">
                        <div>
                          <div className="text-[#71717A]">PF</div>
                          <div className="text-[#F5F5F7]">{ag.profit_factor.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-[#71717A]">Trades</div>
                          <div className="text-[#F5F5F7]">{ag.total_trades}</div>
                        </div>
                        <div>
                          <div className="text-[#71717A]">Max DD</div>
                          <div className="text-[#F5F5F7]">{ag.max_drawdown_pct.toFixed(1)}%</div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================== VIEW 6: JOURNAL & PLAYBOOKS ==================== */}
          {activeNav === 'journal' && <PlaybooksAndSystemView data={arenaData} />}
        </main>
      </div>

      {/* Mobile Bottom Translucent Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 apple-glass border-t border-white/[0.08] px-1 py-1.5 flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              className={`flex flex-col items-center gap-1 px-2 py-1 rounded-xl text-[10.5px] font-medium cursor-pointer active:scale-[0.95] transition-colors ${
                active ? 'text-[#00adff]' : 'text-[#8E8E93]'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              <span>{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>

      {/* Agent Detail Modal */}
      {modalAgent && (
        <AgentDetailModal
          agent={modalAgent}
          runs={arenaData.account_runs.filter((r) => r.agent_id === modalAgent.agent_id)}
          trades={arenaData.trades.filter((t) => t.agent_id === modalAgent.agent_id)}
          shadowTrades={arenaData.shadow_trades.filter(
            (s) => s.agent_id === modalAgent.agent_id
          )}
          playbooks={arenaData.playbooks.filter((p) => p.agent_id === modalAgent.agent_id)}
          onClose={() => setModalAgent(null)}
        />
      )}
    </div>
  );
}

export default App;
