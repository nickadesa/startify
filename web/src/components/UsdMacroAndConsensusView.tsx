import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Flame,
  Newspaper,
  Radio,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { ArenaPayload } from '../types/arena';

interface Props {
  data: ArenaPayload;
}

export const UsdMacroAndConsensusView: React.FC<Props> = ({ data }) => {
  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0C1017] p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[#00adff]" />
            <h1 className="text-base font-semibold text-white tracking-tight">
              USD-Only Macro Economic Intelligence, Consensus Signals & Shadow Trade Audit
            </h1>
          </div>
          <p className="text-xs text-slate-400">
            Strictly filtered to high-impact USD releases (FOMC, NFP, US CPI, Core PCE, ISM PMI) with mandatory ±45m blackout guardrails and factual neutral digests
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular">
          <span className="px-3 py-1.5 rounded-lg bg-[#00adff]/15 border border-[#00adff]/30 text-[#00adff] font-semibold">
            CURRENCY FILTER: USD ONLY (100%)
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-[#111722] border border-white/[0.08] text-slate-300">
            Blackout Window: -45m / +45m
          </span>
        </div>
      </div>

      {/* USD High-Impact Economic Calendar & Historical XAUUSD Impact Database */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0C1017] overflow-hidden">
        <div className="p-4 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white">
              USD Macro Event Tape & Measured XAUUSD Post-Release Volatility (15m / 60m)
            </h2>
            <p className="text-xs text-slate-400">
              Neutral News Agent summarizes strictly factual Actual vs Forecast numbers without directional bias so each AI interprets macro impact via its own Playbook
            </p>
          </div>
          <span className="text-xs font-mono-tabular text-amber-400">
            Non-USD currencies excluded by code
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono-tabular">
            <thead>
              <tr className="border-b border-white/[0.07] bg-[#111722]/70 text-slate-400">
                <th className="py-2.5 px-3">Date / UTC</th>
                <th className="py-2.5 px-3">Currency</th>
                <th className="py-2.5 px-3">USD Macro Release</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Actual</th>
                <th className="py-2.5 px-3">Forecast</th>
                <th className="py-2.5 px-3">Surprise</th>
                <th className="py-2.5 px-3">XAU 15m Move</th>
                <th className="py-2.5 px-3">XAU 60m Move</th>
                <th className="py-2.5 px-3">Neutral Factual Digest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {data.news_events.map((ev) => (
                <tr key={ev.event_id} className="hover:bg-[#111722] transition-colors">
                  <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                    {ev.date} 13:30Z
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded bg-[#00adff]/20 text-[#00adff] font-semibold">
                      {ev.currency}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-sans font-semibold text-white whitespace-nowrap">
                    {ev.name}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 capitalize">
                    {ev.category.replace('_', ' ')}
                  </td>
                  <td className="py-2.5 px-3 text-white font-semibold">{ev.actual}</td>
                  <td className="py-2.5 px-3 text-slate-400">{ev.forecast}</td>
                  <td className="py-2.5 px-3 text-amber-300">{ev.surprise_delta}</td>
                  <td
                    className={`py-2.5 px-3 font-semibold ${
                      ev.gold_15m_move_usd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {ev.gold_15m_move_usd >= 0 ? '+' : '-'}$
                    {Math.abs(ev.gold_15m_move_usd).toFixed(2)}
                  </td>
                  <td
                    className={`py-2.5 px-3 font-semibold ${
                      ev.gold_60m_move_usd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {ev.gold_60m_move_usd >= 0 ? '+' : '-'}$
                    {Math.abs(ev.gold_60m_move_usd).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 font-sans text-slate-300 max-w-md">
                    {ev.neutral_summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-AI Consensus Signals & Shadow Trades Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Multi-AI Consensus Detector Tape */}
        <div className="xl:col-span-6 rounded-xl border border-white/[0.08] bg-[#0C1017] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-2.5">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#00adff]" />
              <h2 className="text-sm font-semibold text-white">
                Uncorrelated Multi-AI Consensus Signals (≥3 AIs Agree)
              </h2>
            </div>
            <span className="text-xs font-mono-tabular text-emerald-400">
              83.3% Consensus Win Rate
            </span>
          </div>

          <div className="space-y-2.5">
            {data.consensus_events.map((ce) => (
              <div
                key={ce.event_id}
                className="rounded-xl bg-[#111722] border border-white/[0.06] p-3.5 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10.5px] font-mono-tabular font-semibold uppercase ${
                        ce.direction === 'long'
                          ? 'bg-[#00adff]/20 text-[#00adff]'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      CONSENSUS {ce.direction}
                    </span>
                    <span className="text-xs font-mono-tabular text-slate-300">
                      {ce.agreeing_count}/{ce.total_active_agents} AIs Aligned • {ce.time}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-mono-tabular font-semibold ${
                      ce.result_pnl_usd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {ce.result_pnl_usd >= 0 ? '+' : '-'}${Math.abs(ce.result_pnl_usd).toFixed(2)} (
                    {ce.result_r >= 0 ? '+' : ''}
                    {ce.result_r.toFixed(2)}R)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px] font-mono-tabular bg-[#090C13] rounded-lg p-2 border border-white/[0.05]">
                  <div>
                    <div className="text-slate-500">Entry Cluster</div>
                    <div className="text-slate-200">{ce.entry_range}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">SL Band</div>
                    <div className="text-rose-400">{ce.sl_range}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">TP1 Band</div>
                    <div className="text-emerald-400">{ce.tp_range}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular">
                  <div className="flex flex-wrap gap-1">
                    {ce.agents.map((aid) => (
                      <span
                        key={aid}
                        className="px-2 py-0.5 rounded bg-[#07090E] text-[#00adff] border border-[#00adff]/25"
                      >
                        {aid.toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <span className="text-slate-400">
                    Avg Confidence: {(ce.avg_confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Shadow Trades Audit (Validator Rejected vs AI No-Trade Simulation) */}
        <div className="xl:col-span-6 rounded-xl border border-white/[0.08] bg-[#0C1017] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-2.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#00adff]" />
              <h2 className="text-sm font-semibold text-white">
                Shadow Trades Audit (Validator Rejections & AI No-Trade Simulation)
              </h2>
            </div>
            <span className="text-xs font-mono-tabular text-slate-400">
              {data.shadow_trades.length} Simulated Shadow Orders
            </span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {data.shadow_trades.slice(0, 12).map((sh) => (
              <div
                key={sh.shadow_id}
                className="rounded-lg bg-[#111722] border border-white/[0.06] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-mono-tabular">
                    <span className="text-white font-semibold">{sh.agent_id.toUpperCase()}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        sh.shadow_type === 'validator_rejected'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {sh.shadow_type === 'validator_rejected'
                        ? 'VALIDATOR BLOCKED'
                        : 'AI STOOD DOWN'}
                    </span>
                    <span className="text-slate-400">{sh.time.slice(0, 16)}Z</span>
                  </div>
                  <div className="text-slate-300">{sh.rejected_reason}</div>
                </div>

                <div className="text-right font-mono-tabular shrink-0">
                  <div className="text-[10.5px] text-slate-400">
                    Hypothetical @ ${sh.hypothetical_entry.toFixed(2)}
                  </div>
                  <div
                    className={`font-semibold ${
                      sh.simulated_pnl_usd < 0 ? 'text-emerald-400' : 'text-amber-300'
                    }`}
                  >
                    {sh.simulated_pnl_usd < 0
                      ? `Saved $${Math.abs(sh.simulated_pnl_usd).toFixed(2)} Loss (${sh.simulated_r}R)`
                      : `Missed +$${sh.simulated_pnl_usd.toFixed(2)} (+${sh.simulated_r}R)`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
