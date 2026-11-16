import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Trophy,
  Globe,
  Cpu,
  Search,
  Menu,
  X,
  RefreshCw,
  ShieldCheck,
  Zap,
  Activity,
  ChevronRight,
  Layers,
  DollarSign,
  Sparkles,
  Play,
} from 'lucide-react';
import rawSnapshot from './data/arenaSnapshot.json';
import { ArenaPayload } from './types/arena';
import { CalendarAndStatsView } from './components/CalendarAndStatsView';
import { CompareArenaView } from './components/CompareArenaView';
import { UsdMacroAndConsensusView } from './components/UsdMacroAndConsensusView';
import { PlaybooksAndSystemView } from './components/PlaybooksAndSystemView';

type TabId = 'calendar' | 'arena' | 'macro' | 'playbooks';

const initialSnapshot = rawSnapshot as unknown as ArenaPayload;

export function App() {
  const [data, setData] = useState<ArenaPayload>(initialSnapshot);
  const [activeTab, setActiveTab] = useState<TabId>('calendar');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [apiConnected, setApiConnected] = useState<boolean>(false);
  const [lastSyncNote, setLastSyncNote] = useState<string>('4H/1H/M15/M5 Warm-Up Active');

  const syncFromBackend = async (runCycle = false) => {
    setIsSyncing(true);
    try {
      const endpoint = runCycle ? '/api/run-once' : '/api/arena';
      const method = runCycle ? 'POST' : 'GET';
      const res = await fetch(endpoint, { method });
      if (res.ok) {
        if (runCycle) {
          const refreshed = await fetch('/api/arena');
          if (refreshed.ok) {
            const payload = await refreshed.json();
            if (payload && Array.isArray(payload.leaderboard)) {
              setData(payload);
            }
            setApiConnected(true);
            setLastSyncNote('Live Cycle Executed via FastAPI');
          }
        } else {
          const payload = await res.json();
          if (payload && Array.isArray(payload.leaderboard)) {
            setData(payload);
          }
          setApiConnected(true);
          setLastSyncNote('Connected to Live SQLite API');
        }
      }
    } catch {
      setApiConnected(false);
      setLastSyncNote('4H/1H/M15/M5 Snapshot Ready');
    } finally {
      setTimeout(() => setIsSyncing(false), 350);
    }
  };

  useEffect(() => {
    syncFromBackend(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItems: {
    id: TabId;
    label: string;
    shortLabel: string;
    sublabel: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[] = [
    {
      id: 'calendar',
      label: 'Calendar & Stats',
      shortLabel: 'Calendar',
      sublabel: 'M5/M15/1H/4H Chart & P&L Grid',
      icon: Calendar,
      badge: `${data.trades.length} Trades`,
    },
    {
      id: 'arena',
      label: 'AI Comparison Arena',
      shortLabel: 'AI Arena',
      sublabel: '8 Free AIs + Consensus + Controls',
      icon: Trophy,
      badge: '11 Active',
    },
    {
      id: 'macro',
      label: 'USD Macro & Consensus',
      shortLabel: 'USD Macro',
      sublabel: 'USD-Only News Gate & OI Proxies',
      icon: Globe,
      badge: 'USD Only',
    },
    {
      id: 'playbooks',
      label: 'AI Journal & System',
      shortLabel: 'AI Journal',
      sublabel: 'Warm-Up, -0.27/-0.618 & BE Stats',
      icon: Cpu,
      badge: 'v2.5',
    },
  ];

  const arenaHeadline = useMemo(() => {
    const aiAccounts = data.leaderboard.filter((a) => a.agent_id.startsWith('ai-'));
    const bestAccount = [...data.leaderboard].sort((a, b) => b.net_pnl_usd - a.net_pnl_usd)[0];
    const totalNetPnl = aiAccounts.reduce((acc, a) => acc + a.net_pnl_usd, 0);
    const activeSelected =
      selectedAgentId === 'all'
        ? null
        : data.leaderboard.find((a) => a.agent_id === selectedAgentId) || null;
    const latestTrade = data.trades[0];
    const spotPrice = latestTrade?.snapshot?.price ?? 4028.9;
    const sweetSpot = latestTrade?.snapshot?.ote?.sweet_spot ?? 4024.5;
    return { bestAccount, totalNetPnl, activeSelected, spotPrice, sweetSpot };
  }, [data.leaderboard, data.trades, selectedAgentId]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return {
        accounts: data.leaderboard.slice(0, 6),
        trades: data.trades.slice(0, 5),
      };
    }
    return {
      accounts: data.leaderboard.filter(
        (a) =>
          a.display_name.toLowerCase().includes(q) ||
          a.provider.toLowerCase().includes(q) ||
          a.model_name.toLowerCase().includes(q) ||
          a.style_archetype.toLowerCase().includes(q)
      ),
      trades: data.trades
        .filter(
          (t) =>
            t.trade_id.toLowerCase().includes(q) ||
            t.agent_id.toLowerCase().includes(q) ||
            t.action.toLowerCase().includes(q) ||
            t.reasoning.toLowerCase().includes(q)
        )
        .slice(0, 8),
    };
  }, [searchQuery, data.leaderboard, data.trades]);

  return (
    <div className="min-h-screen bg-[#07090E] text-[#F3F6FA] flex flex-col lg:flex-row selection:bg-[#00adff]/30 selection:text-white">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex lg:w-[272px] lg:flex-col lg:fixed lg:inset-y-0 bg-[#0A0E15] border-r border-[#1E2636] z-30 select-none">
        <div className="p-5 border-b border-[#1E2636] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00adff] to-[#006699] flex items-center justify-center shadow-[0_0_24px_rgba(0,173,255,0.4)] border border-[#38C4FF]/40">
              <Zap className="w-5 h-5 text-[#07090E] fill-[#07090E]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-white">Startify</span>
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#00adff]/15 text-[#00adff] border border-[#00adff]/30 font-semibold">
                  QUANT v2.5
                </span>
              </div>
              <p className="text-[11px] text-[#8E9BAE]">XAUUSD Multi-AI Paper Arena</p>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 pb-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#07090E] border border-[#1E2636] hover:border-[#00adff]/40 text-xs text-[#8E9BAE] transition-all cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-[#00adff]" />
              <span>Search agents, trades...</span>
            </span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[#111722] text-[#8E9BAE] rounded border border-[#1E2636]">
              ⌘K
            </kbd>
          </button>
        </div>

        <nav className="px-3 py-3 space-y-1.5 flex-1 overflow-y-auto">
          <div className="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-[#586579]">
            Terminal Views
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full group flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  active
                    ? 'bg-[#00adff]/14 text-white border border-[#00adff]/40 shadow-[0_0_25px_rgba(0,173,255,0.12)]'
                    : 'text-[#8E9BAE] hover:text-white hover:bg-[#111722]/70 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      active
                        ? 'bg-[#00adff] text-[#07090E]'
                        : 'bg-[#111722] text-[#8E9BAE] group-hover:text-[#00adff]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-semibold truncate">{item.label}</div>
                    <div className="text-[10px] text-[#586579] truncate">{item.sublabel}</div>
                  </div>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      active
                        ? 'bg-[#00adff]/20 text-[#38C4FF]'
                        : 'bg-[#111722] text-[#8E9BAE]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          <div className="pt-5">
            <div className="px-2 pb-2 flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#586579]">
                Competing Accounts ($1K Base)
              </span>
              {selectedAgentId !== 'all' && (
                <button
                  onClick={() => setSelectedAgentId('all')}
                  className="text-[10px] text-[#00adff] hover:underline cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="space-y-1 max-h-[310px] overflow-y-auto pr-1">
              <button
                onClick={() => setSelectedAgentId('all')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                  selectedAgentId === 'all'
                    ? 'bg-[#00adff]/15 text-[#00adff] border border-[#00adff]/30 font-medium'
                    : 'text-[#8E9BAE] hover:bg-[#111722] hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-[#00adff]" />
                  <span>All 11 Accounts Aggregate</span>
                </span>
                <span className="font-mono text-[11px] text-[#00E676]">
                  +${arenaHeadline.totalNetPnl.toFixed(0)}
                </span>
              </button>

              {data.leaderboard.map((acc) => {
                const isSelected = selectedAgentId === acc.agent_id;
                const pos = acc.net_pnl_usd >= 0;
                return (
                  <button
                    key={acc.agent_id}
                    onClick={() => setSelectedAgentId(acc.agent_id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#111722] text-white border border-[#00adff]/50'
                        : 'text-[#8E9BAE] hover:bg-[#111722]/60 hover:text-white border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: acc.color }}
                      />
                      <span className="truncate">{acc.display_name}</span>
                      {acc.blowup_count > 0 && (
                        <span
                          title="Account had a blowup and restarted at $1,000"
                          className="text-[9px] px-1 rounded bg-[#FF3B5C]/20 text-[#FF3B5C] font-mono"
                        >
                          R2
                        </span>
                      )}
                    </span>
                    <span
                      className={`font-mono text-[11px] shrink-0 ${
                        pos ? 'text-[#00E676]' : 'text-[#FF3B5C]'
                      }`}
                    >
                      ${acc.current_equity.toFixed(0)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        <div className="p-3.5 m-3 rounded-xl bg-[#07090E] border border-[#1E2636] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-white flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00adff]" />
              OTE + Break-Even Guard
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#00E676]/15 text-[#00E676]">
              ACTIVE
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] text-[#8E9BAE] font-mono">
            <div className="bg-[#0C1017] px-2 py-1 rounded border border-[#1E2636]/70">
              Start: <span className="text-white">$1,000</span>
            </div>
            <div className="bg-[#0C1017] px-2 py-1 rounded border border-[#1E2636]/70">
              News: <span className="text-[#00adff]">USD Only</span>
            </div>
            <div className="bg-[#0C1017] px-2 py-1 rounded border border-[#1E2636]/70">
              TP1/2: <span className="text-emerald-400">-0.27 / -0.618</span>
            </div>
            <div className="bg-[#0C1017] px-2 py-1 rounded border border-[#1E2636]/70">
              SL Lock: <span className="text-amber-300">Break-Even</span>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 lg:pl-[272px] flex flex-col min-w-0 pb-20 lg:pb-8">
        <header className="sticky top-0 z-20 bg-[#07090E]/90 backdrop-blur-md border-b border-[#1E2636]">
          <div className="max-w-[1600px] mx-auto px-3.5 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg bg-[#0C1017] border border-[#1E2636] text-[#8E9BAE] hover:text-white"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="lg:hidden flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#00adff] flex items-center justify-center">
                  <Zap className="w-4 h-4 text-[#07090E] fill-[#07090E]" />
                </div>
                <span className="font-bold text-base text-white tracking-tight">Startify</span>
              </div>

              <div className="hidden sm:flex items-center gap-3 bg-[#0C1017] border border-[#1E2636] rounded-xl px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
                  <span className="text-xs font-bold tracking-tight text-white">XAUUSD</span>
                  <span className="text-xs font-mono font-semibold text-[#00adff]">
                    ${arenaHeadline.spotPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <span className="text-[#1E2636]">|</span>
                <div className="hidden md:flex items-center gap-2 text-[11px] text-[#8E9BAE] font-mono">
                  <span className="text-[#38C4FF]">M5 • M15 • 1H • 4H</span>
                  <span>•</span>
                  <span>OTE 0.705 (${arenaHeadline.sweetSpot.toFixed(2)})</span>
                  <span>•</span>
                  <span className="text-emerald-400">TP: -0.27 / -0.618</span>
                </div>
              </div>

              <div className="hidden xl:flex items-center gap-2 bg-[#00adff]/10 border border-[#00adff]/30 rounded-xl px-3 py-1.5 text-xs">
                <DollarSign className="w-3.5 h-3.5 text-[#00adff]" />
                <span className="text-[#F3F6FA] font-medium">USD-Only Gate & BE Lock:</span>
                <span className="font-mono text-[#00E676] font-semibold">ARMED</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSearchOpen(true)}
                className="sm:hidden p-2 rounded-lg bg-[#0C1017] border border-[#1E2636] text-[#8E9BAE]"
                aria-label="Search"
              >
                <Search className="w-4 h-4" />
              </button>

              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0C1017] border border-[#1E2636] text-[11px] text-[#8E9BAE]">
                <Activity className="w-3.5 h-3.5 text-[#00adff]" />
                <span>{lastSyncNote}</span>
              </div>

              <button
                onClick={() => syncFromBackend(true)}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00adff] hover:bg-[#38C4FF] text-[#07090E] font-semibold text-xs transition-all shadow-[0_0_20px_rgba(0,173,255,0.3)] cursor-pointer disabled:opacity-60"
              >
                {isSyncing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-[#07090E]" />
                )}
                <span>{apiConnected ? 'Run MTF Cycle' : 'Sync Arena'}</span>
              </button>
            </div>
          </div>

          <div className="border-t border-[#1E2636]/70 bg-[#0A0E15]/90">
            <div className="max-w-[1600px] mx-auto px-3.5 sm:px-6 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#586579] mr-1 shrink-0">
                Portfolio Filter:
              </span>
              <button
                onClick={() => setSelectedAgentId('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition-all cursor-pointer ${
                  selectedAgentId === 'all'
                    ? 'bg-[#00adff] text-[#07090E] font-semibold shadow-[0_0_14px_rgba(0,173,255,0.35)]'
                    : 'bg-[#0C1017] text-[#8E9BAE] hover:text-white border border-[#1E2636]'
                }`}
              >
                All Agents ($1,000 Base)
              </button>
              {data.leaderboard.map((acc) => {
                const active = selectedAgentId === acc.agent_id;
                const isPos = acc.net_pnl_usd >= 0;
                return (
                  <button
                    key={acc.agent_id}
                    onClick={() => setSelectedAgentId(acc.agent_id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs shrink-0 transition-all cursor-pointer ${
                      active
                        ? 'bg-[#00adff]/20 text-white border border-[#00adff] shadow-[0_0_12px_rgba(0,173,255,0.25)]'
                        : 'bg-[#0C1017] text-[#8E9BAE] hover:text-white border border-[#1E2636]'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: acc.color }}
                    />
                    <span className="font-medium">{acc.display_name}</span>
                    <span
                      className={`font-mono text-[10px] ${
                        isPos ? 'text-[#00E676]' : 'text-[#FF3B5C]'
                      }`}
                    >
                      {isPos ? '+' : ''}
                      {acc.net_pnl_pct.toFixed(1)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {arenaHeadline.activeSelected && (
          <div className="bg-gradient-to-r from-[#00adff]/15 via-[#0C1017] to-[#0C1017] border-b border-[#00adff]/30">
            <div className="max-w-[1600px] mx-auto px-3.5 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: arenaHeadline.activeSelected.color }}
                />
                <span className="font-bold text-white">
                  Inspecting: {arenaHeadline.activeSelected.display_name}
                </span>
                <span className="text-[#8E9BAE] font-mono">
                  ({arenaHeadline.activeSelected.provider} • {arenaHeadline.activeSelected.model_name})
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-[#111722] text-[#38C4FF] border border-[#1E2636]">
                  {arenaHeadline.activeSelected.style_archetype}
                </span>
              </div>
              <div className="flex items-center gap-4 font-mono">
                <span>
                  Start: <strong className="text-white">$1,000.00</strong>
                </span>
                <span>
                  Current:{' '}
                  <strong className="text-[#00adff]">
                    ${arenaHeadline.activeSelected.current_equity.toFixed(2)}
                  </strong>
                </span>
                <span>
                  Win Rate:{' '}
                  <strong className="text-[#00E676]">
                    {arenaHeadline.activeSelected.win_rate.toFixed(1)}%
                  </strong>
                </span>
                <button
                  onClick={() => setSelectedAgentId('all')}
                  className="text-[#00adff] hover:underline font-sans font-medium cursor-pointer"
                >
                  Show All 11 Accounts
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 max-w-[1600px] w-full mx-auto px-3.5 sm:px-6 py-5">
          {activeTab === 'calendar' && (
            <CalendarAndStatsView
              data={data}
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
            />
          )}
          {activeTab === 'arena' && (
            <CompareArenaView
              data={data}
              onSelectAgentForCalendar={(id) => {
                setSelectedAgentId(id);
                setActiveTab('calendar');
              }}
            />
          )}
          {activeTab === 'macro' && <UsdMacroAndConsensusView data={data} />}
          {activeTab === 'playbooks' && <PlaybooksAndSystemView data={data} />}
        </main>
      </div>

      {/* MOBILE SLIDE-OVER DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-[290px] max-w-[85vw] bg-[#0A0E15] border-r border-[#1E2636] h-full flex flex-col z-10 p-4">
            <div className="flex items-center justify-between pb-4 border-b border-[#1E2636]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#00adff] flex items-center justify-center">
                  <Zap className="w-4 h-4 text-[#07090E] fill-[#07090E]" />
                </div>
                <div>
                  <div className="font-bold text-white text-base">Startify</div>
                  <div className="text-[10px] text-[#8E9BAE]">XAUUSD Multi-AI Trader v2.5</div>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg bg-[#111722] text-[#8E9BAE]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-1.5 flex-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left ${
                      active
                        ? 'bg-[#00adff]/15 text-white border border-[#00adff]/40'
                        : 'text-[#8E9BAE]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-[#00adff]" />
                      <div>
                        <div className="text-xs font-semibold">{item.label}</div>
                        <div className="text-[10px] text-[#586579]">{item.sublabel}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[#586579]" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0A0E15]/95 backdrop-blur-md border-t border-[#1E2636] grid grid-cols-4 px-2 py-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors ${
                active ? 'text-[#00adff]' : 'text-[#8E9BAE]'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="text-[10px] font-medium">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* QUICK SEARCH MODAL (CMD+K) */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={() => setSearchOpen(false)}
          />
          <div className="relative w-full max-w-xl bg-[#0C1017] border border-[#1E2636] rounded-2xl shadow-2xl overflow-hidden z-10">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1E2636]">
              <Search className="w-4 h-4 text-[#00adff]" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search AI providers, models, styles, or trade reasoning..."
                className="w-full bg-transparent text-sm text-white placeholder-[#586579] focus:outline-none"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="text-xs text-[#8E9BAE] hover:text-white font-mono px-1.5 py-0.5 rounded bg-[#111722]"
              >
                ESC
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-3 space-y-4">
              <div>
                <div className="text-[10px] font-mono uppercase text-[#586579] px-2 mb-1.5">
                  Competing Accounts ({searchResults.accounts.length})
                </div>
                <div className="space-y-1">
                  {searchResults.accounts.map((acc) => (
                    <button
                      key={acc.agent_id}
                      onClick={() => {
                        setSelectedAgentId(acc.agent_id);
                        setSearchOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#111722] text-left transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: acc.color }}
                        />
                        <div>
                          <div className="text-xs font-semibold text-white">{acc.display_name}</div>
                          <div className="text-[10px] text-[#8E9BAE]">
                            {acc.provider} • {acc.model_name} • {acc.style_archetype}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-xs text-[#00adff]">
                        ${acc.current_equity.toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase text-[#586579] px-2 mb-1.5">
                  Matching Paper Trades ({searchResults.trades.length})
                </div>
                <div className="space-y-1">
                  {searchResults.trades.map((t) => (
                    <button
                      key={t.trade_id}
                      onClick={() => {
                        setSelectedAgentId(t.agent_id);
                        setActiveTab('calendar');
                        setSearchOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#111722] text-left transition-colors"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="text-xs font-medium text-white flex items-center gap-2">
                          <span className="font-mono text-[#00adff]">{t.agent_id}</span>
                          <span className="uppercase">{t.action}</span>
                          <span className="text-[10px] text-[#8E9BAE] font-mono">
                            @{t.entry.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#8E9BAE] truncate">{t.reasoning}</div>
                      </div>
                      <span
                        className={`font-mono text-xs shrink-0 ${
                          t.pnl_usd >= 0 ? 'text-[#00E676]' : 'text-[#FF3B5C]'
                        }`}
                      >
                        {t.pnl_usd >= 0 ? '+' : ''}${t.pnl_usd.toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-4 py-2.5 bg-[#07090E] border-t border-[#1E2636] flex items-center justify-between text-[11px] text-[#8E9BAE]">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#00adff]" />
                <span>Startify Multi-AI Terminal • $1,000 Initial Equity</span>
              </span>
              <span className="font-mono text-[10px]">M5/M15/1H/4H • Fib -0.27 / -0.618</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
