import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Crown,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Shield,
  Sun,
  Zap,
  LayoutGrid,
} from "lucide-react";
import { AITrader, ArenaState } from "./types/arena";
import { FALLBACK_ARENA_STATE } from "./data/fallbackArena";
import { BrandIcon } from "./components/BrandIcon";
import { ArenaCharts, ChartMode, MiniSparkline } from "./components/ArenaCharts";
import { MonthlyPnLCalendar } from "./components/MonthlyPnLCalendar";
import { ShareFlexModal } from "./components/ShareFlexModal";
import { AIProfileView } from "./components/AIProfileView";
import { GrokBotChatView } from "./components/GrokBotChatView";
import { SundaySummitView } from "./components/SundaySummitView";

type TabKey = "arena" | "profiles" | "calendar" | "chat" | "summit";
type OrderFilter = "All" | "Open" | "Filled" | "Canceled";

export function App() {
  const [state, setState] = useState<ArenaState>(FALLBACK_ARENA_STATE);
  const [tab, setTab] = useState<TabKey>("arena");
  const [selectedAIId, setSelectedAIId] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("equity");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("All");
  const [showAllAIs, setShowAllAIs] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [summitRunning, setSummitRunning] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("tt_theme") as "dark" | "light") || "dark";
  });

  const carouselRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("tt_theme", theme);
  }, [theme]);

  const fetchLiveXauFallback = useCallback(async () => {
    try {
      const r = await fetch("https://api.bybit.com/v5/market/tickers?category=linear&symbol=PAXGUSDT");
      if (r.ok) {
        const j = await r.json();
        const px = Number(j?.result?.list?.[0]?.lastPrice);
        if (px > 0) {
          setState((prev) => ({
            ...prev,
            updated_at: new Date().toISOString(),
            cockpit: { ...prev.cockpit, xauusd_price: Math.round(px * 100) / 100 },
          }));
        }
      }
    } catch {
      // ignore network error
    }
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/arena/state");
      if (res.ok) {
        const data: ArenaState = await res.json();
        setState(data);
        return;
      }
    } catch {
      // fallback below
    }
    fetchLiveXauFallback();
  }, [fetchLiveXauFallback]);

  useEffect(() => {
    fetchState();
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/arena/tick", { method: "POST" });
        if (res.ok) {
          const updated: ArenaState = await res.json();
          setState(updated);
          return;
        }
      } catch {
        // fallback below
      }
      fetchLiveXauFallback();
    }, 15000);
    return () => clearInterval(timer);
  }, [fetchState, fetchLiveXauFallback]);

  const handleSendUserMessage = async (message: string, targetAgentId?: string) => {
    try {
      const res = await fetch("/api/arena/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, target_agent_id: targetAgentId }),
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload.state) {
          setState(payload.state);
          return;
        }
      }
    } catch {
      // client fallback below
    }
    const responder = state.ais.find((a) => a.agent_id === targetAgentId) || state.ais[0];
    const nowIso = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      chat: [
        {
          id: `MSG-${Date.now()}`,
          agent_id: responder.agent_id,
          agent_name: responder.display_name,
          avatar: "",
          brand_key: responder.brand_key,
          event_type: "DEBATE" as const,
          tokens_used: 48,
          message: `Copy Commander. Monitoring XAUUSD @ $${prev.cockpit.xauusd_price.toFixed(2)}. Status: ${responder.status} (${responder.roi_pct >= 0 ? "+" : ""}${responder.roi_pct}% ROI). Ready for Nov 17 open.`,
          ts: nowIso,
        },
        {
          id: `USR-${Date.now()}`,
          agent_id: "commander",
          agent_name: "Commander (You)",
          avatar: "",
          brand_key: "openai" as const,
          event_type: "DEBATE" as const,
          tokens_used: 0,
          message,
          ts: nowIso,
        },
        ...prev.chat,
      ].slice(0, 50),
    }));
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/arena/scan", { method: "POST" });
      if (res.ok) {
        const payload = await res.json();
        if (payload.state) {
          setState(payload.state);
          return;
        }
      }
    } catch {
      // fallback below
    } finally {
      setScanning(false);
    }
    await fetchLiveXauFallback();
  };

  const handleToggleMirror = async (agentId: string) => {
    try {
      const res = await fetch(`/api/arena/mirror/${agentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const updated: ArenaState = await res.json();
        setState(updated);
        return;
      }
    } catch {
      // local fallback
    }
    setState((prev) => ({
      ...prev,
      ais: prev.ais.map((a) => (a.agent_id === agentId ? { ...a, is_mirrored: !a.is_mirrored } : a)),
    }));
  };

  const handleCockpitAction = async (action: string) => {
    try {
      const res = await fetch("/api/arena/cockpit/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const updated: ArenaState = await res.json();
        setState(updated);
        return;
      }
    } catch {
      // local fallback
    }
    setState((prev) => {
      if (action === "toggle_risk_shield") {
        return { ...prev, cockpit: { ...prev.cockpit, risk_shield_enabled: !prev.cockpit.risk_shield_enabled } };
      }
      if (action === "toggle_auto_mirror") {
        return { ...prev, cockpit: { ...prev.cockpit, auto_mirror_enabled: !prev.cockpit.auto_mirror_enabled } };
      }
      if (action === "pause_all") {
        return { ...prev, cockpit: { ...prev.cockpit, arena_status: "PAUSED" } };
      }
      if (action === "resume_all") {
        return { ...prev, cockpit: { ...prev.cockpit, arena_status: "LIVE" } };
      }
      return prev;
    });
  };

  const handleRunSummit = async () => {
    setSummitRunning(true);
    try {
      const res = await fetch("/api/arena/summit/run", { method: "POST" });
      if (res.ok) {
        const payload = await res.json();
        if (payload.state) setState(payload.state);
      }
    } finally {
      setSummitRunning(false);
    }
  };

  const handleSendDiscordSnapshot = async () => {
    if (!state) return;
    const totalProfit = state.ais.reduce((acc, a) => acc + a.total_pnl, 0);
    await fetch("/api/arena/discord/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "live_trades_env",
        title: "📸 TOPTIERclub Arena Snapshot",
        description: `Total Arena Profit: $${totalProfit.toFixed(2)} | #1 Leader: ${state.ais[0]?.display_name} (${state.ais[0]?.roi_pct >= 0 ? "+" : ""}${state.ais[0]?.roi_pct}%)`,
      }),
    });
  };

  const scrollCarousel = (dir: "left" | "right") => {
    if (!carouselRef.current) return;
    const delta = dir === "left" ? -380 : 380;
    carouselRef.current.scrollBy({ left: delta, behavior: "smooth" });
  };

  const openProfile = (ai: AITrader) => {
    setSelectedAIId(ai.agent_id);
    setTab("profiles");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="apple-card px-8 py-6 text-center">
          <div className="text-[1.25rem] font-bold tracking-tight">TOPTIERclub</div>
          <div className="text-[0.875rem] mt-1" style={{ color: "var(--text-secondary)" }}>
            Initializing Autonomous Multi-AI Quant Arena...
          </div>
        </div>
      </div>
    );
  }

  const leaderAI = state.ais[0];
  const activeProfileAI = state.ais.find((a) => a.agent_id === selectedAIId) || leaderAI;
  const filteredOrders =
    orderFilter === "All" ? state.orders : state.orders.filter((o) => o.status === orderFilter);

  return (
    <div className="min-h-screen fullscreen-section pb-16">
      {/* Apple Frosted Top Navbar */}
      <header
        className="sticky top-0 z-40 w-full backdrop-blur-xl"
        style={{
          backgroundColor: "var(--bg-glass)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="w-[94%] max-w-[1440px] mx-auto py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <button
              onClick={() => {
                setTab("arena");
                setSelectedAIId(null);
              }}
              className="text-[1.25rem] font-extrabold tracking-tight"
            >
              TOPTIERclub
            </button>

            <nav className="hidden md:flex items-center gap-1 p-1 rounded-full" style={{ backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}>
              {(
                [
                  { id: "arena", label: "Arena" },
                  { id: "profiles", label: "AI Profiles" },
                  { id: "calendar", label: "PnL Calendar" },
                  { id: "chat", label: "GrokBot Chat" },
                  { id: "summit", label: "Sunday Summit" },
                ] as { id: TabKey; label: string }[]
              ).map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    className="px-4 py-1.5 rounded-full text-[0.8125rem] font-medium transition"
                    style={{
                      backgroundColor: active ? "var(--bg-card)" : "transparent",
                      color: active ? "var(--text-primary)" : "var(--text-secondary)",
                      boxShadow: active ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-9 h-9 rounded-full flex items-center justify-center transition hover:opacity-80"
              style={{ backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}
              title="Toggle Theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setShowShareModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[0.8125rem] font-medium transition hover:opacity-85"
              style={{ backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}
            >
              <Camera className="w-4 h-4 text-[#007AFF]" />
              <span className="hidden sm:inline">Share</span>
            </button>

            <button
              onClick={handleScan}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[0.8125rem] font-semibold bg-[#007AFF] text-white hover:opacity-90 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Scanning..." : "Run AI Scan"}
            </button>
          </div>
        </div>

        {/* Mobile Pill Nav */}
        <div className="md:hidden w-[94%] mx-auto pb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(
            [
              { id: "arena", label: "Arena" },
              { id: "profiles", label: "Profiles" },
              { id: "calendar", label: "Calendar" },
              { id: "chat", label: "GrokBot" },
              { id: "summit", label: "Summit" },
            ] as { id: TabKey; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className="px-3.5 py-1.5 rounded-full text-[0.75rem] font-medium shrink-0"
              style={{
                backgroundColor: tab === item.id ? "var(--accent-blue)" : "var(--bg-subtle)",
                color: tab === item.id ? "#FFFFFF" : "var(--text-secondary)",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="w-[94%] max-w-[1440px] mx-auto pt-6 space-y-6">
        {/* TradeSyncer-Inspired Cockpit Bar */}
        <section className="apple-card p-4 md:px-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 md:gap-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[10px] text-[0.75rem] font-medium" style={{ backgroundColor: "rgba(52,199,89,0.12)", color: "var(--accent-green)" }}>
              <span className="w-2 h-2 rounded-full bg-[#30D158]" />
              Arena {state.cockpit.arena_status}
            </div>

            <div>
              <div className="text-[0.75rem]" style={{ color: "var(--text-secondary)" }}>XAUUSD feed</div>
              <div className="text-[0.9375rem] font-semibold tabular-nums">${state.cockpit.xauusd_price.toFixed(2)}</div>
            </div>

            <div>
              <div className="text-[0.75rem]" style={{ color: "var(--text-secondary)" }}>Day PnL</div>
              <div className="text-[0.9375rem] font-semibold tabular-nums" style={{ color: state.cockpit.total_day_pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                {state.cockpit.total_day_pnl >= 0 ? `+$${state.cockpit.total_day_pnl.toLocaleString()}` : `-$${Math.abs(state.cockpit.total_day_pnl).toLocaleString()}`}
              </div>
            </div>

            <div>
              <div className="text-[0.75rem]" style={{ color: "var(--text-secondary)" }}>Open PnL</div>
              <div className="text-[0.9375rem] font-semibold tabular-nums" style={{ color: state.cockpit.total_open_pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                {state.cockpit.total_open_pnl >= 0 ? `+$${state.cockpit.total_open_pnl.toFixed(2)}` : `-$${Math.abs(state.cockpit.total_open_pnl).toFixed(2)}`}
              </div>
            </div>

            <div>
              <div className="text-[0.75rem]" style={{ color: "var(--text-secondary)" }}>Arena capital</div>
              <div className="text-[0.9375rem] font-semibold tabular-nums">${state.cockpit.total_balance.toLocaleString()}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleCockpitAction("toggle_risk_shield")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[0.75rem] font-medium transition-colors"
              style={{
                backgroundColor: state.cockpit.risk_shield_enabled ? "rgba(52,199,89,0.12)" : "var(--bg-subtle)",
                color: state.cockpit.risk_shield_enabled ? "var(--accent-green)" : "var(--text-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <Shield className="w-3.5 h-3.5" />
              Risk Shield {state.cockpit.risk_shield_enabled ? "On" : "Off"}
            </button>

            <button
              onClick={() => handleCockpitAction("toggle_auto_mirror")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[0.75rem] font-medium transition-colors"
              style={{
                backgroundColor: state.cockpit.auto_mirror_enabled ? "rgba(10,132,255,0.12)" : "var(--bg-subtle)",
                color: state.cockpit.auto_mirror_enabled ? "var(--accent-blue)" : "var(--text-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <Zap className="w-3.5 h-3.5" />
              Auto-Mirror {state.cockpit.auto_mirror_enabled ? "On" : "Off"}
            </button>

            <button
              onClick={() => handleCockpitAction(state.cockpit.arena_status === "LIVE" ? "pause_all" : "resume_all")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[0.75rem] font-medium transition-colors"
              style={{ backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}
            >
              {state.cockpit.arena_status === "LIVE" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {state.cockpit.arena_status === "LIVE" ? "Pause All" : "Resume"}
            </button>

            <button
              onClick={() => handleCockpitAction("flatten_all")}
              className="px-3.5 py-1.5 rounded-[10px] text-[0.75rem] font-medium bg-[#FF3B30] text-white hover:opacity-90 transition-opacity"
            >
              Flatten All
            </button>
          </div>
        </section>

        {tab === "arena" && (
          <>
            {/* Hero Spotlight + AI of the Week */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 apple-card p-6 md:p-8 flex flex-col justify-between">
                <div>
                  <div className="text-[0.75rem] font-medium mb-2" style={{ color: "var(--accent-blue)" }}>
                    Autonomous XAUUSD Quant Arena
                  </div>
                  <h1 className="text-[1.75rem] md:text-[2.125rem] font-semibold tracking-tight leading-tight">
                    8 Frontier AIs Competing. Zero Manual Orders
                  </h1>
                  <p className="text-[0.9375rem] mt-2.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    Claude, Grok, DeepSeek, Qwen, Gemini, GPT-OSS, Mistral, and Llama research macro orderflow, execute paper setups, and evolve every Sunday.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 mt-6">
                  <button
                    onClick={handleScan}
                    disabled={scanning}
                    className="px-5 py-2.5 rounded-[10px] text-[0.875rem] font-medium bg-[#0A84FF] text-white hover:opacity-90 transition-opacity"
                  >
                    {scanning ? "Running AI Scan..." : "Run AI Scan"}
                  </button>
                  <button
                    onClick={() => setTab("summit")}
                    className="px-5 py-2.5 rounded-[10px] text-[0.875rem] font-medium transition-colors"
                    style={{ backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}
                  >
                    Sunday Summit
                  </button>
                  <button
                    onClick={() => setTab("chat")}
                    className="px-5 py-2.5 rounded-[10px] text-[0.875rem] font-medium transition-colors"
                    style={{ backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}
                  >
                    GrokBot Chat
                  </button>
                </div>
              </div>

              {/* AI of the Week Card */}
              {leaderAI && (
                <div className="lg:col-span-5 apple-card p-6 md:p-7 flex flex-col justify-between relative overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[0.75rem] font-medium bg-[#FF9F0A]/12 text-[#FF9F0A]">
                      <Crown className="w-3.5 h-3.5" /> AI of the Week
                    </span>
                    <span className="text-[0.75rem]" style={{ color: "var(--text-secondary)" }}>
                      Rank #1 Leader
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mb-5">
                    <BrandIcon brand={leaderAI.brand_key} size={52} className="ring-1 ring-white/15" />
                    <div>
                      <h2 className="text-[1.25rem] font-semibold tracking-tight">{leaderAI.display_name}</h2>
                      <p className="text-[0.8125rem] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {leaderAI.style_archetype}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="apple-subcard p-3">
                      <div className="text-[0.75rem]" style={{ color: "var(--text-secondary)" }}>ROI</div>
                      <div className="text-[1.25rem] font-semibold tabular-nums text-[#30D158]">
                        +{leaderAI.roi_pct}%
                      </div>
                    </div>
                    <div className="apple-subcard p-3">
                      <div className="text-[0.75rem]" style={{ color: "var(--text-secondary)" }}>Winrate</div>
                      <div className="text-[1.25rem] font-semibold tabular-nums">{leaderAI.winrate_pct}%</div>
                    </div>
                    <div className="apple-subcard p-3">
                      <div className="text-[0.75rem]" style={{ color: "var(--text-secondary)" }}>Sharpe</div>
                      <div className="text-[1.25rem] font-semibold tabular-nums">{leaderAI.sharpe_ratio.toFixed(2)}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => openProfile(leaderAI)}
                    className="w-full py-2.5 rounded-[10px] text-[0.875rem] font-medium transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-canvas)" }}
                  >
                    View Leader Profile
                  </button>
                </div>
              )}
            </section>

            {/* AI Traders Carousel + View More */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[1.25rem] font-bold tracking-tight">Competing AI Traders (8 Models)</h2>
                  <p className="text-[0.8125rem]" style={{ color: "var(--text-secondary)" }}>
                    Swipe or click arrows • Toggle Mirror to copy #1 Leader • Click View Profile for Quant Tear Sheet
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {!showAllAIs && (
                    <>
                      <button
                        onClick={() => scrollCarousel("left")}
                        className="w-9 h-9 rounded-full flex items-center justify-center transition hover:opacity-80"
                        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
                        aria-label="Previous"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => scrollCarousel("right")}
                        className="w-9 h-9 rounded-full flex items-center justify-center transition hover:opacity-80"
                        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
                        aria-label="Next"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setShowAllAIs(!showAllAIs)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[0.8125rem] font-semibold transition"
                    style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    {showAllAIs ? "Carousel View" : "View All AIs (8)"}
                  </button>
                </div>
              </div>

              <div
                ref={carouselRef}
                className={
                  showAllAIs
                    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
                    : "flex gap-5 overflow-x-auto no-scrollbar pb-2 snap-x snap-mandatory"
                }
              >
                {state.ais.map((ai) => {
                  const pos = ai.roi_pct >= 0;
                  return (
                    <div
                      key={ai.agent_id}
                      className={`apple-card p-5 flex flex-col justify-between transition-colors ${
                        showAllAIs ? "" : "min-w-[84%] sm:min-w-[46%] lg:min-w-[31%] snap-start"
                      }`}
                    >
                      <div>
                        {/* Card Top */}
                        <div className="flex items-start justify-between gap-2 mb-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <BrandIcon brand={ai.brand_key} size={42} className="ring-1 ring-white/15" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-[0.9375rem] truncate">{ai.short_name}</span>
                                {ai.is_leader && <Crown className="w-3.5 h-3.5 text-[#FF9F0A] shrink-0" />}
                              </div>
                              <div className="text-[0.75rem] truncate" style={{ color: "var(--text-secondary)" }}>
                                #{ai.rank} • {ai.provider}
                              </div>
                            </div>
                          </div>

                          <span
                            className="px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold shrink-0"
                            style={{
                              backgroundColor:
                                ai.status === "COOLDOWN"
                                  ? "rgba(255,59,48,0.14)"
                                  : ai.status === "IN TRADE"
                                  ? "rgba(52,199,89,0.14)"
                                  : "var(--bg-subtle)",
                              color:
                                ai.status === "COOLDOWN"
                                  ? "var(--accent-red)"
                                  : ai.status === "IN TRADE"
                                  ? "var(--accent-green)"
                                  : "var(--text-secondary)",
                            }}
                          >
                            {ai.status}
                          </span>
                        </div>

                        {/* ROI & Sparkline */}
                        <div className="flex items-end justify-between gap-3 mb-4">
                          <div>
                            <div className="text-[0.6875rem]" style={{ color: "var(--text-secondary)" }}>Total ROI</div>
                            <div
                              className="text-[1.75rem] font-extrabold tabular-nums leading-none mt-0.5"
                              style={{ color: pos ? "var(--accent-green)" : "var(--accent-red)" }}
                            >
                              {pos ? `+${ai.roi_pct}%` : `${ai.roi_pct}%`}
                            </div>
                            <div className="text-[0.75rem] tabular-nums mt-1" style={{ color: "var(--text-secondary)" }}>
                              {ai.total_pnl >= 0 ? `+$${ai.total_pnl.toLocaleString()}` : `-$${Math.abs(ai.total_pnl).toLocaleString()}`}
                            </div>
                          </div>
                          <div className="w-[45%]">
                            <MiniSparkline data={ai.sparkline} positive={pos} />
                          </div>
                        </div>

                        {/* 4 Quant Metrics */}
                        <div className="grid grid-cols-4 gap-2 mb-4 text-center">
                          <div className="apple-subcard py-2 px-1">
                            <div className="text-[0.625rem]" style={{ color: "var(--text-secondary)" }}>Sharpe</div>
                            <div className="text-[0.8125rem] font-bold tabular-nums">{ai.sharpe_ratio.toFixed(1)}</div>
                          </div>
                          <div className="apple-subcard py-2 px-1">
                            <div className="text-[0.625rem]" style={{ color: "var(--text-secondary)" }}>PF</div>
                            <div className="text-[0.8125rem] font-bold tabular-nums">{ai.profit_factor.toFixed(2)}</div>
                          </div>
                          <div className="apple-subcard py-2 px-1">
                            <div className="text-[0.625rem]" style={{ color: "var(--text-secondary)" }}>Max DD</div>
                            <div className="text-[0.8125rem] font-bold tabular-nums">-{ai.max_dd_pct.toFixed(1)}%</div>
                          </div>
                          <div className="apple-subcard py-2 px-1">
                            <div className="text-[0.625rem]" style={{ color: "var(--text-secondary)" }}>Win%</div>
                            <div className="text-[0.8125rem] font-bold tabular-nums">{ai.winrate_pct.toFixed(0)}%</div>
                          </div>
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                        <button
                          onClick={() => handleToggleMirror(ai.agent_id)}
                          className="inline-flex items-center gap-2 text-[0.75rem] font-semibold"
                          style={{ color: ai.is_mirrored ? "var(--accent-blue)" : "var(--text-secondary)" }}
                        >
                          <span
                            className="w-8 h-4.5 rounded-full p-0.5 transition flex items-center"
                            style={{
                              backgroundColor: ai.is_mirrored ? "var(--accent-blue)" : "var(--bg-subtle)",
                              justifyContent: ai.is_mirrored ? "flex-end" : "flex-start",
                            }}
                          >
                            <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs" />
                          </span>
                          Mirror
                        </button>

                        <button
                          onClick={() => openProfile(ai)}
                          className="px-4 py-1.5 rounded-full text-[0.75rem] font-semibold transition hover:opacity-85"
                          style={{ backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}
                        >
                          View Profile
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Separated Benchmarks Strip */}
              <div className="apple-card p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="text-[0.75rem] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                  Benchmarks (Non-AI Controls)
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  {state.benchmarks.map((b) => (
                    <div key={b.agent_id} className="apple-subcard px-3.5 py-2 flex items-center gap-3 text-[0.8125rem]">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                      <span className="font-semibold">{b.display_name}</span>
                      <span className="tabular-nums font-bold text-[#34C759]">+{b.roi_pct}%</span>
                      <span className="text-[0.75rem] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        SR {b.sharpe_ratio.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Arena PnL Overview (Dropdown) */}
            <section className="apple-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-[1.125rem] font-bold tracking-tight">Arena PnL & Quant Overview</h2>
                  <p className="text-[0.8125rem]" style={{ color: "var(--text-secondary)" }}>
                    Switch views between Equity Curve, Portfolio PnL Candles (OHLC), Drawdown & Quant Matrix
                  </p>
                </div>

                <select
                  value={chartMode}
                  onChange={(e) => setChartMode(e.target.value as ChartMode)}
                  className="apple-pill px-4 py-2 text-[0.8125rem] font-semibold outline-none cursor-pointer"
                  style={{ backgroundColor: "var(--bg-subtle)", color: "var(--text-primary)" }}
                >
                  <option value="equity">Equity Curve</option>
                  <option value="candles">Portfolio PnL Candles (OHLC)</option>
                  <option value="drawdown">Drawdown Bar</option>
                  <option value="matrix">Quant Matrix</option>
                </select>
              </div>

              <ArenaCharts ais={state.ais} mode={chartMode} />
            </section>

            {/* TradeSyncer-Style Orders & Journal Table */}
            <section className="apple-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-[1.125rem] font-bold tracking-tight">Autonomous Orders & Auto-Synced Journal</h2>
                  <p className="text-[0.8125rem]" style={{ color: "var(--text-secondary)" }}>
                    Every AI trade auto-tagged by Session, Market Regime & Confidence Score
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 rounded-full" style={{ backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}>
                  {(["All", "Open", "Filled", "Canceled"] as OrderFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setOrderFilter(f)}
                      className="px-3.5 py-1 rounded-full text-[0.75rem] font-semibold transition"
                      style={{
                        backgroundColor: orderFilter === f ? "var(--accent-blue)" : "transparent",
                        color: orderFilter === f ? "#FFFFFF" : "var(--text-secondary)",
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[0.75rem] font-medium" style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                      <th className="py-2.5 px-3">AI trader</th>
                      <th className="py-2.5 px-3">Side / Type</th>
                      <th className="py-2.5 px-3 text-right">Entry</th>
                      <th className="py-2.5 px-3 text-right">Lots</th>
                      <th className="py-2.5 px-3">Session / Tag</th>
                      <th className="py-2.5 px-3 text-right">PnL</th>
                      <th className="py-2.5 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                    {filteredOrders.map((o) => (
                      <tr key={o.id} className="text-[0.8125rem] tabular-nums">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2 font-semibold">
                            <BrandIcon
                              brand={state.ais.find((a) => a.agent_id === o.agent_id)?.brand_key || "openai"}
                              size={22}
                            />
                            <span>{o.agent_name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-bold" style={{ color: o.side === "BUY" ? "var(--accent-green)" : "var(--accent-red)" }}>
                            {o.side}
                          </span>{" "}
                          <span style={{ color: "var(--text-secondary)" }}>{o.type}</span>
                        </td>
                        <td className="py-3 px-3 text-right">${o.entry_price.toFixed(2)}</td>
                        <td className="py-3 px-3 text-right">{o.qty.toFixed(2)}</td>
                        <td className="py-3 px-3">
                          <span className="px-2.5 py-0.5 rounded-full text-[0.75rem]" style={{ backgroundColor: "var(--bg-subtle)" }}>
                            {o.session} • {o.tag}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-bold" style={{ color: o.pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                          {o.pnl >= 0 ? `+$${o.pnl.toFixed(2)}` : `-$${Math.abs(o.pnl).toFixed(2)}`}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold"
                            style={{
                              backgroundColor: o.status === "Open" ? "rgba(0,122,255,0.14)" : o.status === "Filled" ? "rgba(52,199,89,0.14)" : "var(--bg-subtle)",
                              color: o.status === "Open" ? "var(--accent-blue)" : o.status === "Filled" ? "var(--accent-green)" : "var(--text-secondary)",
                            }}
                          >
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {tab === "profiles" && activeProfileAI && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {state.ais.map((a) => (
                <button
                  key={a.agent_id}
                  onClick={() => setSelectedAIId(a.agent_id)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[0.8125rem] font-semibold shrink-0 transition"
                  style={{
                    backgroundColor: activeProfileAI.agent_id === a.agent_id ? "var(--accent-blue)" : "var(--bg-card)",
                    color: activeProfileAI.agent_id === a.agent_id ? "#FFFFFF" : "var(--text-primary)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <BrandIcon brand={a.brand_key} size={20} />
                  <span>{a.short_name}</span>
                </button>
              ))}
            </div>
            <AIProfileView
              ai={activeProfileAI}
              kpiTargets={state.kpi_targets}
              orders={state.orders}
              onBack={() => setTab("arena")}
              onToggleMirror={handleToggleMirror}
            />
          </div>
        )}

        {tab === "calendar" && <MonthlyPnLCalendar ais={state.ais} />}

        {tab === "chat" && (
          <GrokBotChatView
            messages={state.chat}
            ais={state.ais}
            cockpit={state.cockpit}
            onTriggerScan={handleScan}
            onSendUserMessage={handleSendUserMessage}
            scanning={scanning}
          />
        )}

        {tab === "summit" && (
          <SundaySummitView
            summit={state.summit}
            onRunSummit={handleRunSummit}
            running={summitRunning}
          />
        )}
      </main>

      {showShareModal && (
        <ShareFlexModal
          state={state}
          onClose={() => setShowShareModal(false)}
          onSendDiscord={handleSendDiscordSnapshot}
        />
      )}
    </div>
  );
}

export default App;
