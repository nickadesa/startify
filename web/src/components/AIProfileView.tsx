import React, { useState } from "react";
import { ArrowLeft, Crown, ShieldCheck, Sparkles, Brain, Activity } from "lucide-react";
import { AITrader, ArenaOrder, KPITargets } from "../types/arena";
import { BrandIcon } from "./BrandIcon";
import { ArenaCharts, ChartMode } from "./ArenaCharts";
import { MonthlyPnLCalendar } from "./MonthlyPnLCalendar";

interface AIProfileViewProps {
  ai: AITrader;
  kpiTargets: KPITargets;
  orders: ArenaOrder[];
  onBack: () => void;
  onToggleMirror: (agentId: string) => void;
}

export const AIProfileView: React.FC<AIProfileViewProps> = ({
  ai,
  kpiTargets,
  orders,
  onBack,
  onToggleMirror,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>("equity");
  const aiOrders = orders.filter((o) => o.agent_id === ai.agent_id);

  const kpiRows = [
    { label: "Winrate", value: `${ai.winrate_pct.toFixed(1)}%`, target: `≥ ${kpiTargets.winrate_pct}%`, pct: Math.min(100, (ai.winrate_pct / kpiTargets.winrate_pct) * 100), ok: ai.winrate_pct >= kpiTargets.winrate_pct },
    { label: "Profit Factor", value: ai.profit_factor.toFixed(2), target: `≥ ${kpiTargets.profit_factor.toFixed(2)}`, pct: Math.min(100, (ai.profit_factor / kpiTargets.profit_factor) * 100), ok: ai.profit_factor >= kpiTargets.profit_factor },
    { label: "Sharpe Ratio", value: ai.sharpe_ratio.toFixed(2), target: `≥ ${kpiTargets.sharpe_ratio.toFixed(2)}`, pct: Math.min(100, Math.max(0, (ai.sharpe_ratio / kpiTargets.sharpe_ratio) * 100)), ok: ai.sharpe_ratio >= kpiTargets.sharpe_ratio },
    { label: "Max Drawdown", value: `${ai.max_dd_pct.toFixed(1)}%`, target: `≤ ${kpiTargets.max_drawdown_pct}%`, pct: Math.min(100, Math.max(0, (kpiTargets.max_drawdown_pct / Math.max(ai.max_dd_pct, 0.5)) * 100)), ok: ai.max_dd_pct <= kpiTargets.max_drawdown_pct },
    { label: "Weekly Trades", value: `${ai.weekly_trades}`, target: `≥ ${kpiTargets.weekly_trades}/wk`, pct: Math.min(100, (ai.weekly_trades / kpiTargets.weekly_trades) * 100), ok: ai.weekly_trades >= kpiTargets.weekly_trades },
  ];

  const sessions: ("Asian" | "London" | "NY Overlap")[] = ["Asian", "London", "NY Overlap"];
  const regimes: ("Trending" | "Ranging" | "High-Vol")[] = ["Trending", "Ranging", "High-Vol"];

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[0.8125rem] font-medium transition hover:opacity-80"
        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Arena
      </button>

      {/* Profile Header */}
      <div className="apple-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <BrandIcon brand={ai.brand_key} size={64} className="ring-2 ring-white/15" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[1.5rem] font-bold tracking-tight">{ai.display_name}</h2>
              {ai.is_leader && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.75rem] font-semibold bg-[#FF9F0A]/15 text-[#FF9F0A]">
                  <Crown className="w-3.5 h-3.5" /> #1 Leader
                </span>
              )}
              <span
                className="px-2.5 py-0.5 rounded-full text-[0.75rem] font-semibold"
                style={{
                  backgroundColor: ai.status === "COOLDOWN" ? "rgba(255,59,48,0.14)" : "rgba(52,199,89,0.14)",
                  color: ai.status === "COOLDOWN" ? "var(--accent-red)" : "var(--accent-green)",
                }}
              >
                {ai.status}
              </span>
            </div>
            <p className="text-[0.875rem] mt-1" style={{ color: "var(--text-secondary)" }}>
              {ai.provider} • <span className="font-mono text-[0.8125rem]">{ai.model_name}</span>
            </p>
            <p className="text-[0.8125rem] mt-1 font-medium">{ai.style_archetype}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="text-right">
            <div className="text-[0.75rem]" style={{ color: "var(--text-secondary)" }}>Total Equity / ROI</div>
            <div className="text-[1.75rem] font-bold tabular-nums leading-tight">
              ${ai.equity.toLocaleString()}{" "}
              <span className="text-[1.125rem]" style={{ color: ai.roi_pct >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                ({ai.roi_pct >= 0 ? `+${ai.roi_pct}%` : `${ai.roi_pct}%`})
              </span>
            </div>
          </div>

          <button
            onClick={() => onToggleMirror(ai.agent_id)}
            className="px-5 py-2.5 rounded-full text-[0.875rem] font-semibold transition"
            style={{
              backgroundColor: ai.is_mirrored ? "var(--accent-blue)" : "var(--bg-subtle)",
              color: ai.is_mirrored ? "#FFFFFF" : "var(--text-primary)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {ai.is_mirrored ? "✓ Mirroring AI" : "Mirror / Follow AI"}
          </button>
        </div>
      </div>

      {/* KPI Targets + Quant Tear Sheet */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 apple-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-[#007AFF]" />
            <h3 className="text-[1.0625rem] font-semibold">Weekly KPI Targets</h3>
          </div>
          <div className="space-y-4">
            {kpiRows.map((k) => (
              <div key={k.label}>
                <div className="flex justify-between text-[0.8125rem] mb-1">
                  <span className="font-medium">{k.label}</span>
                  <span className="tabular-nums">
                    <strong style={{ color: k.ok ? "var(--accent-green)" : "var(--accent-red)" }}>{k.value}</strong>{" "}
                    <span style={{ color: "var(--text-secondary)" }}>/ {k.target}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-subtle)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${k.pct}%`, backgroundColor: k.ok ? "var(--accent-green)" : "var(--accent-amber)" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 apple-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#34C759]" />
              <h3 className="text-[1.0625rem] font-semibold">Personal Performance</h3>
            </div>
            <select
              value={chartMode}
              onChange={(e) => setChartMode(e.target.value as ChartMode)}
              className="apple-pill px-3 py-1.5 text-[0.8125rem] font-medium outline-none"
              style={{ backgroundColor: "var(--bg-subtle)", color: "var(--text-primary)" }}
            >
              <option value="equity">Equity Curve</option>
              <option value="candles">Daily PnL Candles</option>
              <option value="drawdown">Drawdown %</option>
            </select>
          </div>
          <ArenaCharts ais={[ai]} mode={chartMode} />
        </div>
      </div>

      {/* Quant Tear Sheet + Session/Regime Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 apple-card p-6">
          <h3 className="text-[1.0625rem] font-semibold mb-4">Quant Tear Sheet</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { k: "Sharpe Ratio", v: ai.sharpe_ratio.toFixed(2) },
              { k: "Sortino Ratio", v: ai.sortino_ratio.toFixed(2) },
              { k: "Calmar Ratio", v: ai.calmar_ratio.toFixed(2) },
              { k: "Profit Factor", v: ai.profit_factor.toFixed(2) },
              { k: "Expectancy / Trade", v: `$${ai.expectancy_usd.toFixed(0)}` },
              { k: "Avg R:R", v: `${ai.avg_rr.toFixed(2)}R` },
              { k: "Kelly Criterion", v: `${ai.kelly_pct.toFixed(1)}%` },
              { k: "Max Drawdown", v: `-${ai.max_dd_pct.toFixed(1)}%` },
            ].map((item) => (
              <div key={item.k} className="apple-subcard p-3">
                <div className="text-[0.75rem]" style={{ color: "var(--text-secondary)" }}>{item.k}</div>
                <div className="text-[1.125rem] font-bold tabular-nums mt-0.5">{item.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 apple-card p-6">
          <h3 className="text-[1.0625rem] font-semibold mb-4">Session & Market Regime Heatmap</h3>
          <div className="grid grid-cols-4 gap-2 text-[0.75rem]">
            <div />
            {regimes.map((r) => (
              <div key={r} className="text-center font-semibold py-1" style={{ color: "var(--text-secondary)" }}>{r}</div>
            ))}
            {sessions.map((sess) => (
              <React.Fragment key={sess}>
                <div className="flex items-center font-semibold text-[0.8125rem]">{sess}</div>
                {regimes.map((reg) => {
                  const cell = ai.session_regime_heatmap.find((c) => c.session === sess && c.regime === reg);
                  const pos = (cell?.pnl || 0) >= 0;
                  return (
                    <div
                      key={`${sess}-${reg}`}
                      className="rounded-2xl p-3 text-center"
                      style={{
                        backgroundColor: pos ? "rgba(52,199,89,0.14)" : "rgba(255,59,48,0.13)",
                        border: `1px solid ${pos ? "rgba(52,199,89,0.28)" : "rgba(255,59,48,0.28)"}`,
                      }}
                    >
                      <div className="text-[0.875rem] font-bold tabular-nums" style={{ color: pos ? "var(--accent-green)" : "var(--accent-red)" }}>
                        {cell?.winrate.toFixed(0)}% WR
                      </div>
                      <div className="text-[0.6875rem] tabular-nums mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {pos ? `+$${cell?.pnl.toFixed(0)}` : `-$${Math.abs(cell?.pnl || 0).toFixed(0)}`} ({cell?.trades}t)
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly PnL Calendar */}
      <MonthlyPnLCalendar ais={[ai]} selectedAI={ai} />

      {/* Playbook + Autonomous Research Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="apple-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-[#FF9F0A]" />
            <h3 className="text-[1.0625rem] font-semibold">Self-Taught Playbook & Mutations</h3>
          </div>
          <ul className="space-y-2.5 mb-5">
            {ai.playbook.map((rule, i) => (
              <li key={i} className="apple-subcard p-3 text-[0.8125rem] leading-relaxed">
                {rule}
              </li>
            ))}
          </ul>
          <div className="text-[0.75rem] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
            Mutation History
          </div>
          {ai.mutations.map((m, idx) => (
            <div key={idx} className="apple-subcard p-3 text-[0.8125rem] flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{m.mentor} • {m.date}</div>
                <div style={{ color: "var(--text-secondary)" }}>{m.change}</div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[0.75rem] font-semibold bg-[#34C759]/15 text-[#34C759] shrink-0">
                {m.impact_pct}
              </span>
            </div>
          ))}
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-[#0A84FF]" />
            <h3 className="text-[1.0625rem] font-semibold">Autonomous Research & Recent Trades</h3>
          </div>
          <div className="space-y-2.5 mb-5">
            {ai.research_log.slice(0, 4).map((r, i) => (
              <div key={i} className="apple-subcard p-3 text-[0.8125rem]">
                <div className="flex justify-between text-[0.75rem] mb-1" style={{ color: "var(--text-secondary)" }}>
                  <span className="font-semibold text-[#0A84FF]">{r.source}</span>
                  <span>{new Date(r.ts).toLocaleTimeString()}</span>
                </div>
                <div>{r.summary}</div>
              </div>
            ))}
          </div>
          <div className="text-[0.75rem] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
            Recent Trades ({aiOrders.length})
          </div>
          <div className="space-y-2">
            {aiOrders.map((o) => (
              <div key={o.id} className="apple-subcard p-3 flex items-center justify-between text-[0.8125rem]">
                <div>
                  <span className="font-semibold">{o.side} {o.symbol}</span>{" "}
                  <span style={{ color: "var(--text-secondary)" }}>@ {o.entry_price} • {o.tag}</span>
                </div>
                <span className="font-bold tabular-nums" style={{ color: o.pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                  {o.pnl >= 0 ? `+$${o.pnl.toFixed(2)}` : `-$${Math.abs(o.pnl).toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
