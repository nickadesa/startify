import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Calendar,
  Globe,
  Layers,
  LayoutGrid,
  Moon,
  Search,
  Settings,
  Sun,
  X,
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
import { OrderflowTerminal } from './components/OrderflowTerminal';
import { MarketOverviewItem, MarketsWatchlistView } from './components/MarketsWatchlistView';
import { AssetIcon } from './components/AssetIcon';
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

type NavSection = 'overview' | 'markets' | 'chart' | 'orderflow' | 'calendar' | 'archive';

export function App() {
  const [arenaData, setArenaData] = useState<ArenaPayload>(initialArenaData);
  const [activeNav, setActiveNav] = useState<NavSection>('overview');
  const [overviewMode, setOverviewMode] = useState<'live' | 'historical'>('live');
  const [selectedChartAgentId, setSelectedChartAgentId] = useState<string | null>('consensus');
  const [modalAgent, setModalAgent] = useState<LeaderboardEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [accountFilter, setAccountFilter] = useState<'all' | 'ai_only' | 'benchmarks'>('all');

  // Vest-inspired Global Preferences
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('startify_theme') as 'dark' | 'light') || 'dark';
    } catch {
      return 'dark';
    }
  });
  const [streamerMode, setStreamerMode] = useState<boolean>(false);
  const [showTickerBar, setShowTickerBar] = useState<boolean>(true);
  const [showGlobalSettings, setShowGlobalSettings] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'trading' | 'chart' | 'notifications'>('general');
  const [activeSymbol, setActiveSymbol] = useState<string>('XAUUSD');
  const [marketsList, setMarketsList] = useState<MarketOverviewItem[]>([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('startify_theme', theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    // Console Self-XSS Security Warning
    console.log('%cWarning!', 'color:#FF453A; font-size:36px; font-weight:bold;');
    console.log(
      '%cDo not paste unknown code into the developer console. Startify Quant Desk runs locally in your browser.',
      'font-size:14px;'
    );
  }, []);

  useEffect(() => {
    const fetchArenaAndMarkets = () => {
      fetch('/api/arena')
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json && json.leaderboard && json.leaderboard.length > 0) {
            setArenaData(json);
          }
        })
        .catch(() => {});
      fetch('/api/markets/overview')
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.markets && Array.isArray(json.markets)) {
            setMarketsList(json.markets);
          }
        })
        .catch(() => {});
    };
    fetchArenaAndMarkets();
    const timer = setInterval(fetchArenaAndMarkets, 30000);
    return () => clearInterval(timer);
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
    arenaData.backtest_summary?.dataset?.total_candles || 326859;

  const navItems: { id: NavSection; label: string; icon: React.FC<any>; count?: string }[] = [
    { id: 'overview', label: 'Desk Overview', icon: LayoutGrid },
    { id: 'markets', label: 'Markets', icon: Globe, count: `${marketsList.length || 10}` },
    { id: 'chart', label: 'Chart Terminal', icon: BarChart3, count: 'PRO' },
    { id: 'orderflow', label: 'Live Orderflow', icon: Activity, count: 'LIVE' },
    { id: 'calendar', label: 'USD Calendar', icon: Calendar, count: `${arenaData.news_events.length}` },
    { id: 'archive', label: 'Research & Archive', icon: Layers, count: '8 AI' },
  ];

  return (
    <div className="min-h-screen bg-[#000000] text-[#FFFFFF] flex flex-col lg:flex-row">
      {/* Left Sidebar (Desktop) — Architectural Pure Black */}
      <aside className="hidden lg:flex lg:w-[244px] lg:flex-col lg:fixed lg:inset-y-0 bg-[#000000] border-r border-white/[0.12] px-4 py-5 select-none z-30">
        <div className="flex items-center justify-between px-2 pb-5 border-b border-white/[0.1]">
          <div>
            <div className="text-[15px] font-bold tracking-[0.06em] uppercase text-[#FFFFFF] leading-none">
              STARTIFY
            </div>
            <div className="text-[11px] text-[#71717A] mt-1.5 uppercase tracking-[0.04em]">
              XAUUSD Quant Desk
            </div>
          </div>
          <span className="w-2 h-2 bg-[#30D158]" title="Live Desk Online" />
        </div>

        {/* Search Input */}
        <div className="relative my-4">
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
            className="w-full h-9 pl-8 pr-12 rounded-none bg-[#0A0A0A] border border-white/[0.12] text-[12.5px] text-white placeholder:text-[#71717A] focus:outline-none focus:border-white/[0.4]"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#71717A] uppercase">
            ⌘K
          </span>
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
                className={`w-full h-9 px-3 rounded-none flex items-center justify-between text-[12.5px] font-medium tracking-[0.01em] cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#FFFFFF] text-[#000000]'
                    : 'text-[#A1A1AA] hover:text-[#FFFFFF] hover:bg-[#0A0A0A]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-[#000000]' : 'text-[#71717A]'
                    }`}
                    strokeWidth={1.6}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.count && (
                  <span
                    className={`text-[10.5px] tabular-nums ${
                      active ? 'text-[#000000]' : 'text-[#71717A]'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Desk Mandate Summary */}
        <div className="border border-white/[0.12] bg-[#0A0A0A] p-3.5 space-y-2 mt-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[#71717A]">
            Desk Mandate
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#A1A1AA]">Portfolio</span>
            <span className="tabular-nums text-white font-semibold">$1,000.00</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#A1A1AA]">Risk / Trade</span>
            <span className="tabular-nums text-white font-medium">0.50%</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#A1A1AA]">Discord Alerts</span>
            <span className="text-white font-medium">Active</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#A1A1AA]">Vercel Cron</span>
            <span className="tabular-nums text-white">15m</span>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 overflow-x-hidden lg:pl-[244px] flex flex-col min-h-screen pb-20 lg:pb-10">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 apple-glass border-b border-white/[0.12] px-4 sm:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="lg:hidden text-[14px] font-bold tracking-[0.06em] uppercase text-white">
              STARTIFY
            </span>
            <div className="hidden lg:flex items-center gap-2 text-[12.5px] min-w-0">
              <span className="text-[#71717A] uppercase tracking-[0.04em]">STARTIFY</span>
              <span className="text-[#52525B]">/</span>
              <span className="text-white font-medium uppercase tracking-[0.03em] truncate">
                {navItems.find((n) => n.id === activeNav)?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="hidden sm:inline-flex tabular-nums gap-1.5">
              <AssetIcon symbol={activeSymbol} size={15} />
              <span>{activeSymbol}</span>
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setActiveNav('orderflow')}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Live Orderflow</span>
            </Button>
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className="h-8 w-8 border border-white/[0.12] bg-[#0A0A0A] flex items-center justify-center text-[#A1A1AA] hover:text-white cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setShowGlobalSettings(true)}
              className="h-8 w-8 border border-white/[0.12] bg-[#0A0A0A] flex items-center justify-center text-[#A1A1AA] hover:text-white cursor-pointer"
              title="Settings & Streamer Mode"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Page Container */}
        <main className="w-full min-w-0 max-w-[1440px] mx-auto px-4 sm:px-8 pt-6 space-y-6">
          {/* ==================== VIEW 1: DESK OVERVIEW ==================== */}
          {activeNav === 'overview' && (
            <div className="space-y-6">
              {/* Architectural Header */}
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 border-b border-white/[0.1] pb-5">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#00adff]">
                    8-AI Specialized Desk • $1,000.00 Portfolio
                  </div>
                  <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-[-0.03em] text-white leading-tight mt-1">
                    XAUUSD Quantitative Execution
                  </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Badge variant="default" className="tabular-nums">
                    {totalTradesCount} ARCHIVED TRADES
                  </Badge>
                  <Badge variant="accent" className="tabular-nums">
                    {backtestCandlesCount.toLocaleString()} BARS (2010–2026)
                  </Badge>
                </div>
              </div>

              {/* Split Hero: Equity Chart (8 cols) + Key Metrics (4 cols) */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
                <div className="xl:col-span-8 min-w-0">
                  <EquityCurveChart
                    dailyStats={arenaData.daily_stats}
                    leaderboard={arenaData.leaderboard}
                    selectedAgentId={selectedChartAgentId}
                    onSelectAgent={setSelectedChartAgentId}
                  />
                </div>

                <div className="xl:col-span-4 flex flex-col justify-between gap-4 min-w-0">
                  {/* Team Consensus Card */}
                  <Card
                    className="p-5 flex-1 flex flex-col justify-between cursor-pointer hover:bg-[#121212] transition-colors"
                    onClick={() => setModalAgent(consensusAccount)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-[0.04em] text-[#71717A]">
                        8-AI Team Desk Equity
                      </span>
                      <Badge variant="positive" className="tabular-nums">
                        {consensusAccount.win_rate.toFixed(1)}% WR
                      </Badge>
                    </div>
                    <div className="my-2">
                      <div className="apple-display text-white">
                        ${consensusAccount.current_equity.toFixed(2)}
                      </div>
                      <div className="text-[13px] text-[#30D158] tabular-nums mt-1">
                        +${consensusAccount.net_pnl_usd.toFixed(2)} vs $1,000.00 baseline
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[12px] text-[#71717A] pt-2 border-t border-white/[0.08] tabular-nums">
                      <span>{arenaData.consensus_events.length} consensus signals</span>
                      <span>PF {consensusAccount.profit_factor.toFixed(2)}</span>
                    </div>
                  </Card>

                  {/* Top Specialist */}
                  <Card
                    className="p-5 flex-1 flex flex-col justify-between cursor-pointer hover:bg-[#121212] transition-colors"
                    onClick={() => setModalAgent(topChampion)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-[0.04em] text-[#71717A]">
                        Top Individual Specialist
                      </span>
                      <Badge variant="accent" className="tabular-nums">
                        +{topChampion.net_pnl_pct.toFixed(2)}%
                      </Badge>
                    </div>
                    <div className="my-2">
                      <div className="apple-display text-white">
                        ${topChampion.current_equity.toFixed(2)}
                      </div>
                      <div className="text-[13px] text-[#A1A1AA] mt-1">
                        <span className="font-medium text-white">{topChampion.display_name}</span>{' '}
                        <span className="text-[#71717A] text-[12px]">
                          • {topChampion.style_archetype}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[12px] text-[#71717A] pt-2 border-t border-white/[0.08] tabular-nums">
                      <span>Win rate {topChampion.win_rate.toFixed(1)}%</span>
                      <span>PF {topChampion.profit_factor.toFixed(2)}</span>
                    </div>
                  </Card>

                  {/* Quick Jump to Live Orderflow */}
                  <Card
                    className="p-5 flex flex-col justify-between cursor-pointer hover:bg-[#121212] transition-colors"
                    onClick={() => setActiveNav('orderflow')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-[0.04em] text-[#71717A]">
                        Live Desk & Discord
                      </span>
                      <ArrowUpRight className="w-4 h-4 text-white" strokeWidth={1.5} />
                    </div>
                    <div className="text-[14px] font-medium text-white mt-2">
                      Open Real-Time Orderflow & 8-Role Matrix
                    </div>
                    <div className="text-[12px] text-[#00adff] mt-1">
                      PAXGUSDT Footprint • Depth Walls • Discord Signals
                    </div>
                  </Card>
                </div>
              </div>

              {/* Live Desk Mode: Unified Portfolio Summary | Historical Mode: Full 8-Model Leaderboard */}
              {overviewMode === 'live' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="p-5 space-y-1.5">
                    <div className="text-[11px] uppercase tracking-[0.04em] text-[#71717A]">
                      Portfolio Architecture
                    </div>
                    <div className="text-[18px] font-semibold text-white">
                      Unified $1,000.00 Desk
                    </div>
                    <p className="text-[12.5px] text-[#A1A1AA]">
                      8 AI models act as specialized analysts feeding one shared risk-gated account (0.50% risk / trade).
                    </p>
                  </Card>
                  <Card
                    className="p-5 space-y-1.5 cursor-pointer hover:bg-[#121212] transition-colors"
                    onClick={() => setActiveNav('chart')}
                  >
                    <div className="text-[11px] uppercase tracking-[0.04em] text-[#00adff]">
                      Interactive Terminal
                    </div>
                    <div className="text-[18px] font-semibold text-white flex items-center justify-between">
                      <span>TradingView-Pro Chart</span>
                      <ArrowUpRight className="w-4 h-4" />
                    </div>
                    <p className="text-[12.5px] text-[#A1A1AA]">
                      Pan/zoom, Orderflow, VPVR, TPO, Drawing tools &amp; one-tap Discord chart snapshot.
                    </p>
                  </Card>
                  <Card
                    className="p-5 space-y-1.5 cursor-pointer hover:bg-[#121212] transition-colors"
                    onClick={() => setActiveNav('calendar')}
                  >
                    <div className="text-[11px] uppercase tracking-[0.04em] text-[#30D158]">
                      Auto-Updating Journal
                    </div>
                    <div className="text-[18px] font-semibold text-white flex items-center justify-between">
                      <span>Calendar &amp; 4K Share Cards</span>
                      <ArrowUpRight className="w-4 h-4" />
                    </div>
                    <p className="text-[12.5px] text-[#A1A1AA]">
                      Export any trade or full monthly P&amp;L calendar at 16:9, 1:1, 4:5, 9:16 (1080p/2K/4K).
                    </p>
                  </Card>
                </div>
              ) : (
              <Card className="overflow-hidden">
                <div className="p-5 border-b border-white/[0.1] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-[15px] font-semibold uppercase tracking-[0.02em] text-white">
                      Historical Backtest Standings (45-Day Individual Benchmark)
                    </h2>
                    <p className="text-[12.5px] text-[#71717A] mt-0.5">
                      Archived per-model backtest results ({totalTradesCount} trades) — click any row to inspect
                    </p>
                  </div>

                  <div className="flex items-center gap-1 bg-[#000000] p-1 border border-white/[0.12] self-start sm:self-auto">
                    {(
                      [
                        { id: 'all', label: 'All (11)' },
                        { id: 'ai_only', label: '8 Specialists' },
                        { id: 'benchmarks', label: 'Benchmarks' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setAccountFilter(tab.id)}
                        className={`px-3 py-1 text-[12px] font-medium cursor-pointer transition-colors ${
                          accountFilter === tab.id
                            ? 'bg-white text-black'
                            : 'text-[#A1A1AA] hover:text-white'
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
                      <TableHead>Specialty</TableHead>
                      <TableHead className="text-right">Equity</TableHead>
                      <TableHead className="text-right">Net P&L</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">PF</TableHead>
                      <TableHead className="text-right">Max DD</TableHead>
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
                          <TableCell className="tabular-nums text-[#71717A]">
                            #{item.rank}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-white">{item.display_name}</div>
                            <div className="text-[11px] text-[#71717A]">{item.model_name}</div>
                          </TableCell>
                          <TableCell className="text-[#A1A1AA] max-w-[260px] truncate">
                            {item.style_archetype}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-white">
                            ${item.current_equity.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={isPos ? 'text-[#30D158]' : 'text-[#FF453A]'}>
                              {isPos ? '+' : ''}${item.net_pnl_usd.toFixed(2)} (
                              {isPos ? '+' : ''}
                              {item.net_pnl_pct.toFixed(1)}%)
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.win_rate.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-white font-medium">
                            {item.profit_factor.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-[#71717A]">
                            {item.max_drawdown_pct.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
              )}
            </div>
          )}

          {/* ==================== VIEW 2: MARKETS WATCHLIST ==================== */}
          {activeNav === 'markets' && (
            <MarketsWatchlistView
              markets={marketsList}
              streamerMode={streamerMode}
              onSelectMarket={(sym) => {
                setActiveSymbol(sym);
                setActiveNav('orderflow');
              }}
            />
          )}

          {/* ==================== VIEW 3: PRO CHART TERMINAL ==================== */}
          {activeNav === 'chart' && (
            <div className="space-y-4">
              <OrderflowTerminal
                chartOnly
                activeSymbol={activeSymbol}
                onSymbolChange={setActiveSymbol}
                markets={marketsList}
                streamerMode={streamerMode}
                onExitChart={() => setActiveNav('overview')}
              />
            </div>
          )}

          {/* ==================== VIEW 4: LIVE ORDERFLOW ==================== */}
          {activeNav === 'orderflow' && (
            <div className="space-y-6">
              <OrderflowTerminal
                activeSymbol={activeSymbol}
                onSymbolChange={setActiveSymbol}
                markets={marketsList}
                streamerMode={streamerMode}
              />
            </div>
          )}

          {/* ==================== VIEW 5: USD CALENDAR ==================== */}
          {activeNav === 'calendar' && (
            <UsdCalendarView
              events={arenaData.news_events}
              trades={arenaData.trades}
              leaderboard={arenaData.leaderboard}
            />
          )}

          {/* ==================== VIEW 6: RESEARCH & ARCHIVE ==================== */}
          {activeNav === 'archive' && (
            <div className="space-y-8">
              <BacktestAndSkillsView data={arenaData} />
              <PlaybooksAndSystemView data={arenaData} />
            </div>
          )}
        </main>
      </div>

      {/* Vest-Style Bottom Live Ticker Bar (Desktop) */}
      {showTickerBar && (
        <div className="hidden lg:flex fixed bottom-0 left-[244px] right-0 z-20 h-8 bg-[#050505] border-t border-white/[0.12] px-4 items-center gap-5 overflow-x-auto text-[11.5px] tabular-nums">
          <div className="flex items-center gap-1.5 shrink-0 pr-3 border-r border-white/[0.12]">
            <span className="w-2 h-2 bg-[#30D158]" />
            <span className="text-[#A1A1AA] font-medium">Desk Online</span>
          </div>
          {(marketsList.length > 0
            ? marketsList
            : [
                { symbol: 'XAUUSD', price: 3874.5, change_24h_pct: -0.76 },
                { symbol: 'NAS100', price: 21704.25, change_24h_pct: -1.85 },
                { symbol: 'SPX500', price: 6046.38, change_24h_pct: -0.85 },
                { symbol: 'BTCUSDT', price: 91354.0, change_24h_pct: -1.45 },
                { symbol: 'ETHUSDT', price: 3104.16, change_24h_pct: -1.71 },
                { symbol: 'SOLUSDT', price: 211.24, change_24h_pct: -2.06 },
                { symbol: 'EURUSD', price: 1.0542, change_24h_pct: -0.16 },
                { symbol: 'DXY', price: 106.68, change_24h_pct: 0.34 },
              ]
          ).map((m) => (
            <button
              key={m.symbol}
              type="button"
              onClick={() => {
                setActiveSymbol(m.symbol);
                setActiveNav('orderflow');
              }}
              className="flex items-center gap-1.5 shrink-0 hover:opacity-80 cursor-pointer"
            >
              <AssetIcon symbol={m.symbol} size={15} />
              <span className="font-semibold text-white">{m.symbol}</span>
              <span className="text-[#A1A1AA]">
                {streamerMode ? '$****' : `$${m.price.toLocaleString()}`}
              </span>
              <span className={m.change_24h_pct >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'}>
                {m.change_24h_pct >= 0 ? '+' : ''}
                {m.change_24h_pct.toFixed(2)}%
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 apple-glass border-t border-white/[0.12] px-1 py-1.5 flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              className={`flex flex-col items-center gap-1 px-2 py-1 text-[10.5px] font-medium cursor-pointer ${
                active ? 'text-white' : 'text-[#71717A]'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              <span>{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>

      {/* Vest-Style Global Settings Modal */}
      {showGlobalSettings && (
        <div className="fixed inset-0 z-[9995] bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[#0B0B0D] border border-white/[0.2] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.12] pb-3">
              <div>
                <h3 className="text-[16px] font-semibold text-white">Settings</h3>
                <p className="text-[12px] text-[#71717A]">Manage your Startify desk preferences</p>
              </div>
              <button
                type="button"
                onClick={() => setShowGlobalSettings(false)}
                className="text-[#A1A1AA] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-4 space-y-1 border-r border-white/[0.1] pr-3">
                {(['general', 'trading', 'chart', 'notifications'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSettingsTab(t)}
                    className={`w-full text-left px-3 py-2 text-[12.5px] font-medium capitalize cursor-pointer ${
                      settingsTab === t
                        ? 'bg-[#141416] text-white border border-white/[0.15]'
                        : 'text-[#A1A1AA] hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="sm:col-span-8 space-y-4 text-[13px]">
                {settingsTab === 'general' && (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">Appearance Theme</div>
                        <div className="text-[11.5px] text-[#71717A]">
                          Switch between Pure Black &amp; Crisp White
                        </div>
                      </div>
                      <div className="flex border border-white/[0.15]">
                        {(['dark', 'light'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setTheme(m)}
                            className={`px-3 py-1 text-[11.5px] capitalize cursor-pointer ${
                              theme === m ? 'bg-white text-black font-semibold' : 'text-[#A1A1AA]'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className="font-medium text-white">Streamer Mode</div>
                        <div className="text-[11.5px] text-[#71717A]">
                          Hide portfolio equity &amp; PnL amounts behind $****
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={streamerMode}
                        onChange={(e) => setStreamerMode(e.target.checked)}
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className="font-medium text-white">Bottom Ticker Bar</div>
                        <div className="text-[11.5px] text-[#71717A]">
                          Show live multi-asset ticker strip at bottom
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={showTickerBar}
                        onChange={(e) => setShowTickerBar(e.target.checked)}
                      />
                    </label>
                  </>
                )}

                {settingsTab === 'trading' && (
                  <div className="space-y-3 text-[12.5px] text-[#A1A1AA]">
                    <div className="flex justify-between">
                      <span>Portfolio Baseline</span>
                      <span className="text-white font-semibold">$1,000.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Risk Per Trade</span>
                      <span className="text-white font-semibold">0.50% ($5.00)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Break-Even Lock</span>
                      <span className="text-[#30D158] font-medium">Auto at TP1</span>
                    </div>
                  </div>
                )}

                {settingsTab === 'chart' && (
                  <div className="text-[12.5px] text-[#A1A1AA] space-y-2">
                    <p>
                      Open <strong className="text-white">Chart Terminal</strong> or{' '}
                      <strong className="text-white">Live Orderflow</strong> and click the{' '}
                      <strong className="text-white">⚙ Settings</strong> icon inside the chart toolbar to customize Bull/Bear Body, Border, Wick colors, Grid, and Countdown timer.
                    </p>
                  </div>
                )}

                {settingsTab === 'notifications' && (
                  <div className="text-[12.5px] text-[#A1A1AA] space-y-2">
                    <div className="flex justify-between">
                      <span>Discord Webhook</span>
                      <span className="text-[#30D158] font-medium">Connected</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cron Schedule</span>
                      <span className="text-white">15m (GitHub Actions) + Daily (Vercel)</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
