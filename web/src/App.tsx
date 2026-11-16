import React, { useEffect, useState } from 'react';
import {
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  Swords,
  Trophy,
  User,
  X,
} from 'lucide-react';
import { AssetIcon } from './components/AssetIcon';
import { AuthModal } from './components/AuthModal';
import { MarketOverviewItem, MarketsWatchlistView } from './components/MarketsWatchlistView';
import { ProfileView } from './components/ProfileView';
import { TeamArenaView } from './components/TeamArenaView';
import { TradingTerminal } from './components/TradingTerminal';
import { WeeklyRankedView } from './components/WeeklyRankedView';
import { TraderAccount, TraderPosition, UserProfile } from './types/toptier';

type NavTab = 'trade' | 'ranked' | 'arenas' | 'markets' | 'profile';

const FALLBACK_MARKETS: MarketOverviewItem[] = [
  { symbol: 'XAUUSD', name: 'Gold Spot', category: 'Commodities', leverage: '25x', price: 3874.5, change_24h_pct: -0.76, funding_rate: -0.0003, open_interest: '$12.36M', volume_24h: '$317.18M' },
  { symbol: 'NAS100', name: 'NASDAQ 100', category: 'Indices', leverage: '50x', price: 21704.25, change_24h_pct: -1.85, funding_rate: 0.0001, open_interest: '$84.45M', volume_24h: '$6.64B' },
  { symbol: 'SPX500', name: 'S&P 500', category: 'Indices', leverage: '75x', price: 6046.38, change_24h_pct: -0.85, funding_rate: -0.0001, open_interest: '$5.61M', volume_24h: '$282.44M' },
  { symbol: 'BTCUSDT', name: 'Bitcoin', category: 'Crypto', leverage: '50x', price: 91354.0, change_24h_pct: -1.45, funding_rate: 0.0006, open_interest: '$10.38M', volume_24h: '$1.64B' },
  { symbol: 'ETHUSDT', name: 'Ethereum', category: 'Crypto', leverage: '50x', price: 3104.16, change_24h_pct: -1.71, funding_rate: 0.0012, open_interest: '$4.22M', volume_24h: '$187.77M' },
  { symbol: 'SOLUSDT', name: 'Solana', category: 'Crypto', leverage: '20x', price: 211.24, change_24h_pct: -2.06, funding_rate: -0.0009, open_interest: '$5.53M', volume_24h: '$23.01M' },
  { symbol: 'PAXGUSDT', name: 'Gold Perp', category: 'Commodities', leverage: '25x', price: 3876.4, change_24h_pct: -0.72, funding_rate: 0.0012, open_interest: '$28.45M', volume_24h: '$142.80M' },
  { symbol: 'XAGUSD', name: 'Silver Spot', category: 'Commodities', leverage: '25x', price: 31.42, change_24h_pct: -2.77, funding_rate: 0.0, open_interest: '$165.49K', volume_24h: '$12.74M' },
  { symbol: 'EURUSD', name: 'Euro / USD', category: 'Forex', leverage: '100x', price: 1.0542, change_24h_pct: -0.16, funding_rate: -0.0001, open_interest: '$1.17M', volume_24h: '$8.37M' },
  { symbol: 'DXY', name: 'US Dollar Index', category: 'Forex', leverage: '50x', price: 106.68, change_24h_pct: 0.34, funding_rate: 0.0, open_interest: '$3.20M', volume_24h: '$44.10M' },
];

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('trade');
  const [activeSymbol, setActiveSymbol] = useState('XAUUSD');
  const [markets, setMarkets] = useState<MarketOverviewItem[]>(FALLBACK_MARKETS);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return (localStorage.getItem('toptier_theme') as 'light' | 'dark') || 'light';
    } catch {
      return 'light';
    }
  });
  const [streamerMode, setStreamerMode] = useState(false);
  const [showTickerBar, setShowTickerBar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Auth & Trader State
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('toptier_token');
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accounts, setAccounts] = useState<TraderAccount[]>([]);
  const [positions, setPositions] = useState<TraderPosition[]>([]);
  const [activeAccountMode, setActiveAccountMode] = useState<'demo' | 'weekly_ranked' | 'room'>('weekly_ranked');
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [profileTarget, setProfileTarget] = useState<string>('apex_kai');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('toptier_theme', theme);
    } catch {}
  }, [theme]);

  const fetchMe = async (tok = token) => {
    if (!tok) return;
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setAccounts(data.accounts || []);
        setPositions(data.positions || []);
      } else {
        setToken(null);
        setUser(null);
        localStorage.removeItem('toptier_token');
      }
    } catch {}
  };

  useEffect(() => {
    fetchMe();
  }, [token]);

  useEffect(() => {
    const loadMarkets = () => {
      fetch('/api/markets/overview')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.markets?.length > 0) setMarkets(d.markets);
        })
        .catch(() => {});
    };
    loadMarkets();
    const timer = setInterval(loadMarkets, 20000);
    return () => clearInterval(timer);
  }, []);

  const handleAuthSuccess = (tok: string, u: UserProfile) => {
    setToken(tok);
    setUser(u);
    try {
      localStorage.setItem('toptier_token', tok);
    } catch {}
    fetchMe(tok);
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setAccounts([]);
    setPositions([]);
    try {
      localStorage.removeItem('toptier_token');
    } catch {}
  };

  const activeAccount = accounts.find((a) => a.mode === activeAccountMode) || accounts[0];
  const displayBal = activeAccount?.balance ?? 10000;

  const navItems: { id: NavTab; label: string }[] = [
    { id: 'trade', label: 'Trade' },
    { id: 'ranked', label: 'Weekly Ranked' },
    { id: 'arenas', label: '1v1–5v5 Arenas' },
    { id: 'markets', label: 'Markets' },
  ];

  return (
    <div className="min-h-screen w-full flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] pb-10">
      {/* Top Navbar (Single-line on both Mobile & Desktop) */}
      <header className="sticky top-0 z-40 w-full h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/95 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setShowMobileDrawer(true)}
            className="md:hidden p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] cursor-pointer shrink-0"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <button
            onClick={() => setActiveTab('trade')}
            className="flex items-center gap-2 font-extrabold text-[1rem] tracking-tight cursor-pointer shrink-0"
          >
            <span className="w-7 h-7 rounded-lg bg-[var(--text-primary)] text-[var(--bg-card)] flex items-center justify-center text-[0.75rem] font-black">
              TT
            </span>
            <span>TOPTIERclub</span>
          </button>

          <nav className="hidden md:flex items-center gap-1 ml-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3.5 py-1.5 rounded-full text-[0.8125rem] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === item.id
                    ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-1 text-[0.75rem] font-semibold tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>{streamerMode ? '$****' : `$${displayBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</span>
          </div>

          <button
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            className="p-2 rounded-full border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            title="Toggle Theme"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="hidden sm:inline-flex p-2 rounded-full border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {user ? (
            <button
              onClick={() => {
                setProfileTarget(user.username);
                setActiveTab('profile');
              }}
              className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[0.75rem] font-semibold cursor-pointer whitespace-nowrap"
            >
              <span
                style={{ backgroundColor: user.avatar_color }}
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[0.625rem] font-bold"
              >
                {user.username.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden sm:inline">@{user.username}</span>
              <span className="text-[0.6875rem] text-amber-500 font-bold">Lv.{user.level}</span>
            </button>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-4 py-1.5 rounded-full bg-[var(--text-primary)] text-[var(--bg-card)] text-[0.75rem] font-semibold cursor-pointer hover:opacity-90 whitespace-nowrap"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Mobile Slide-Out Drawer */}
      {showMobileDrawer && (
        <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={() => setShowMobileDrawer(false)}>
          <div
            className="w-72 h-full bg-[var(--bg-card)] p-5 flex flex-col justify-between shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <span className="font-extrabold text-[1rem]">TOPTIERclub</span>
                <button onClick={() => setShowMobileDrawer(false)} className="p-1 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setShowMobileDrawer(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-[0.875rem] font-semibold cursor-pointer ${
                      activeTab === item.id ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                {user && (
                  <button
                    onClick={() => {
                      setProfileTarget(user.username);
                      setActiveTab('profile');
                      setShowMobileDrawer(false);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl text-[0.875rem] font-semibold text-[var(--text-secondary)] flex items-center gap-2 cursor-pointer"
                  >
                    <User className="w-4 h-4" /> My Profile (@{user.username})
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
              <button
                onClick={() => {
                  setShowSettings(true);
                  setShowMobileDrawer(false);
                }}
                className="w-full py-2 rounded-xl bg-[var(--bg-subtle)] text-[0.8125rem] font-semibold cursor-pointer"
              >
                Settings
              </button>
              {user && (
                <button
                  onClick={() => {
                    handleLogout();
                    setShowMobileDrawer(false);
                  }}
                  className="w-full py-2 rounded-xl text-rose-500 text-[0.8125rem] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> Log Out
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full px-3 sm:px-6 py-4">
        {activeTab === 'trade' && (
          <TradingTerminal
            activeSymbol={activeSymbol}
            onSymbolChange={setActiveSymbol}
            markets={markets}
            theme={theme}
            streamerMode={streamerMode}
            user={user}
            token={token}
            accounts={accounts}
            positions={positions}
            activeAccountMode={activeAccountMode}
            onAccountModeChange={setActiveAccountMode}
            activeRoomCode={activeRoomCode}
            onExitRoom={() => {
              setActiveRoomCode(null);
              setActiveAccountMode('weekly_ranked');
            }}
            onRefreshUser={() => fetchMe()}
            onRequireAuth={() => setShowAuthModal(true)}
          />
        )}

        {activeTab === 'ranked' && (
          <WeeklyRankedView
            token={token}
            onViewProfile={(uname) => {
              setProfileTarget(uname);
              setActiveTab('profile');
            }}
            onStartTradingRanked={() => {
              setActiveAccountMode('weekly_ranked');
              setActiveTab('trade');
            }}
            onRequireAuth={() => setShowAuthModal(true)}
          />
        )}

        {activeTab === 'arenas' && (
          <TeamArenaView
            token={token}
            onEnterRoom={(code) => {
              setActiveRoomCode(code);
              setActiveAccountMode('room');
              setActiveTab('trade');
            }}
            onRequireAuth={() => setShowAuthModal(true)}
          />
        )}

        {activeTab === 'markets' && (
          <MarketsWatchlistView
            markets={markets}
            onSelectSymbol={(sym) => {
              setActiveSymbol(sym);
              setActiveTab('trade');
            }}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            username={profileTarget}
            token={token}
            currentUser={user}
            onRequireAuth={() => setShowAuthModal(true)}
          />
        )}
      </main>

      {/* Bottom Live Ticker Bar (Full-screen width vw) */}
      {showTickerBar && (
        <footer className="fullscreen-section fixed bottom-0 left-0 z-30 h-9 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]/95 backdrop-blur-md px-3 flex items-center gap-4 overflow-x-auto no-scrollbar whitespace-nowrap text-[0.75rem]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-500 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            TOPTIERclub Live
          </span>
          {markets.map((m) => (
            <button
              key={m.symbol}
              onClick={() => {
                setActiveSymbol(m.symbol);
                setActiveTab('trade');
              }}
              className="inline-flex items-center gap-1.5 hover:opacity-80 cursor-pointer shrink-0 tabular-nums"
            >
              <AssetIcon symbol={m.symbol} size={15} />
              <span className="font-semibold">{m.symbol}</span>
              <span>${m.price.toLocaleString(undefined, { minimumFractionDigits: m.symbol === 'EURUSD' ? 4 : 2 })}</span>
              <span className={m.change_24h_pct >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                {m.change_24h_pct >= 0 ? '+' : ''}{m.change_24h_pct.toFixed(2)}%
              </span>
            </button>
          ))}
        </footer>
      )}

      {/* Global Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div className="tt-card w-full max-w-md p-5 space-y-4 rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-[1rem] font-bold">TOPTIERclub Settings</h3>
              <button onClick={() => setShowSettings(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-[0.8125rem]">
              <div className="flex items-center justify-between">
                <span>Theme</span>
                <div className="flex gap-1 p-1 rounded-full bg-[var(--bg-subtle)]">
                  {(['light', 'dark'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`px-3 py-1 rounded-full text-[0.75rem] font-semibold capitalize cursor-pointer ${
                        theme === t ? 'bg-[var(--text-primary)] text-[var(--bg-card)]' : ''
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between cursor-pointer">
                <span>Streamer Mode (Hide Balances)</span>
                <input type="checkbox" checked={streamerMode} onChange={(e) => setStreamerMode(e.target.checked)} className="accent-emerald-500" />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span>Show Bottom Live Ticker</span>
                <input type="checkbox" checked={showTickerBar} onChange={(e) => setShowTickerBar(e.target.checked)} className="accent-emerald-500" />
              </label>
              {user && (
                <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-between items-center">
                  <span className="text-[var(--text-secondary)]">Signed in as @{user.username}</span>
                  <button
                    onClick={() => {
                      handleLogout();
                      setShowSettings(false);
                    }}
                    className="text-rose-500 font-semibold cursor-pointer"
                  >
                    Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onSuccess={handleAuthSuccess} />}
    </div>
  );
}

export default App;
