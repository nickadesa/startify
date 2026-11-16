import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  AccountRun,
  LeaderboardEntry,
  PlaybookVersion,
  ShadowTrade,
  TradeRecord,
} from '../types/arena';
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
  agent: LeaderboardEntry;
  runs: AccountRun[];
  trades: TradeRecord[];
  shadowTrades: ShadowTrade[];
  playbooks: PlaybookVersion[];
  onClose: () => void;
}

export const AgentDetailModal: React.FC<Props> = ({
  agent,
  runs,
  trades,
  shadowTrades,
  playbooks,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<string>('trades');

  // Donut Ring SVG math (Reference Image 14 Winrate Ring Style)
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const winStroke = (agent.win_rate / 100) * circumference;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.09] bg-[#0A0A0C] text-[#F5F5F7] p-5 sm:p-6 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-4">
          <div className="flex items-center gap-3">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: agent.color }}
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#F5F5F7]">
                  {agent.display_name}
                </h2>
                <Badge variant="secondary" className="font-mono-tabular">
                  {agent.model_name}
                </Badge>
                <Badge variant="default" className="font-mono-tabular">
                  Rank #{agent.rank}
                </Badge>
                {agent.blowup_count > 0 && (
                  <Badge variant="negative">
                    Run #{agent.current_run_number} ({agent.blowup_count} prior reset)
                  </Badge>
                )}
              </div>
              <p className="text-[13px] text-[#8E8E93] mt-0.5">
                {agent.style_archetype} • Provider: {agent.provider} • Playbook {agent.playbook_version}
              </p>
            </div>
          </div>

          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-4 h-4" strokeWidth={1.5} />
            <span>Close</span>
          </Button>
        </div>

        {/* 3-Card Summary Row with Winrate Ring (Reference Image 14 Style) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-[#121215] border border-white/[0.06] p-4 flex flex-col justify-between space-y-3">
            <div className="text-[12px] text-[#8E8E93]">Account equity & return</div>
            <div>
              <div className="text-[26px] font-semibold tracking-[-0.025em] font-mono-tabular text-[#F5F5F7]">
                ${agent.current_equity.toFixed(2)}
              </div>
              <div
                className={`text-[13px] font-mono-tabular mt-1 ${
                  agent.net_pnl_usd >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                }`}
              >
                {agent.net_pnl_usd >= 0 ? '+' : ''}${agent.net_pnl_usd.toFixed(2)} (
                {agent.net_pnl_pct >= 0 ? '+' : ''}
                {agent.net_pnl_pct.toFixed(2)}%) vs $1,000.00
              </div>
            </div>
            <div className="text-[12px] text-[#636366] font-mono-tabular">
              Max drawdown: {agent.max_drawdown_pct.toFixed(2)}% • Survival: {agent.survival_days} days
            </div>
          </div>

          <div className="rounded-xl bg-[#121215] border border-white/[0.06] p-4 flex items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="text-[12px] text-[#8E8E93]">Win rate & sample</div>
              <div className="text-[24px] font-semibold tracking-[-0.025em] font-mono-tabular text-[#F5F5F7]">
                {agent.win_rate.toFixed(1)}%
              </div>
              <div className="text-[12px] text-[#8E8E93] font-mono-tabular">
                {agent.wins_count} wins • {agent.losses_count} losses
              </div>
              <div className="text-[12px] text-[#00adff] font-mono-tabular">
                Profit factor {agent.profit_factor.toFixed(2)}
              </div>
            </div>

            <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 88 88">
                <circle
                  cx="44"
                  cy="44"
                  r={radius}
                  fill="none"
                  stroke="#FF453A"
                  strokeOpacity={0.35}
                  strokeWidth="7"
                />
                <circle
                  cx="44"
                  cy="44"
                  r={radius}
                  fill="none"
                  stroke="#30D158"
                  strokeWidth="7"
                  strokeDasharray={`${winStroke} ${circumference}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[13px] font-semibold font-mono-tabular text-[#F5F5F7]">
                  {agent.total_trades}
                </span>
                <span className="text-[10px] text-[#8E8E93]">Trades</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-[#121215] border border-white/[0.06] p-4 flex flex-col justify-between space-y-3">
            <div className="text-[12px] text-[#8E8E93]">Expectancy & inference</div>
            <div>
              <div className="text-[24px] font-semibold tracking-[-0.025em] font-mono-tabular text-[#F5F5F7]">
                {agent.expectancy_r >= 0 ? '+' : ''}
                {agent.expectancy_r.toFixed(2)}R
              </div>
              <div className="text-[13px] text-[#A1A1AA] font-mono-tabular mt-1">
                Avg win {agent.avg_rr.toFixed(2)}R • ${agent.expectancy_usd.toFixed(2)} / trade
              </div>
            </div>
            <div className="text-[12px] text-[#636366] font-mono-tabular">
              Latency {agent.avg_latency_ms} ms • {agent.api_calls} calls
            </div>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="trades">Executed trades ({trades.length})</TabsTrigger>
              <TabsTrigger value="runs">Account runs ({runs.length})</TabsTrigger>
              <TabsTrigger value="shadows">Shadow counterfactuals ({shadowTrades.length})</TabsTrigger>
              <TabsTrigger value="playbook">Playbook ({playbooks.length})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {activeTab === 'trades' && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Opened</TableHead>
                <TableHead>Side & lot</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Stop loss</TableHead>
                <TableHead className="text-right">Exit</TableHead>
                <TableHead className="text-right">R-multiple</TableHead>
                <TableHead className="text-right">Net P&L</TableHead>
                <TableHead>Reasoning & post-mortem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.slice(0, 15).map((t) => (
                <TableRow key={t.trade_id}>
                  <TableCell className="font-mono-tabular whitespace-nowrap text-[#A1A1AA]">
                    {t.opened_at.slice(0, 16).replace('T', ' ')}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant={t.action === 'long' ? 'positive' : 'negative'}>
                      {t.action === 'long' ? 'Long' : 'Short'} {t.lot.toFixed(2)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono-tabular">
                    ${t.entry.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono-tabular text-[#8E8E93]">
                    ${t.stop_loss.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono-tabular">
                    ${t.exit_price.toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono-tabular ${
                      t.r_multiple >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                    }`}
                  >
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
                  <TableCell className="max-w-md text-[#A1A1AA]">
                    <div>{t.reasoning}</div>
                    {t.postmortem && (
                      <div className="text-[11px] text-[#8E8E93] mt-1">
                        Lesson: {t.postmortem.lesson}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {activeTab === 'runs' && (
          <div className="space-y-3">
            {runs.map((r) => (
              <div
                key={r.run_id}
                className="rounded-xl bg-[#121215] border border-white/[0.06] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={r.end_reason === 'active' ? 'positive' : 'negative'}>
                      Run #{r.run_number} — {r.end_reason}
                    </Badge>
                    <span className="text-[12px] font-mono-tabular text-[#8E8E93]">
                      Started {r.start_time.slice(0, 10)}
                    </span>
                  </div>
                  {r.blowup_postmortem && (
                    <p className="text-[12px] text-[#A1A1AA] mt-1">{r.blowup_postmortem}</p>
                  )}
                </div>
                <div className="text-right font-mono-tabular">
                  <div className="text-[15px] font-semibold text-[#F5F5F7]">
                    ${r.start_equity.toFixed(2)} → ${r.end_equity.toFixed(2)}
                  </div>
                  <div className="text-[12px] text-[#8E8E93]">
                    {r.total_trades} trades • Win rate {r.win_rate.toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'shadows' && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Hypothetical entry</TableHead>
                <TableHead className="text-right">Counterfactual P&L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shadowTrades.map((st) => (
                <TableRow key={st.shadow_id}>
                  <TableCell className="font-mono-tabular text-[#A1A1AA]">
                    {st.time.slice(0, 16).replace('T', ' ')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{st.shadow_type}</Badge>
                  </TableCell>
                  <TableCell className="text-[#A1A1AA]">{st.rejected_reason}</TableCell>
                  <TableCell className="text-right font-mono-tabular">
                    ${st.hypothetical_entry.toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono-tabular ${
                      st.simulated_pnl_usd >= 0 ? 'text-[#30D158]' : 'text-[#FF453A]'
                    }`}
                  >
                    {st.simulated_pnl_usd >= 0 ? '+' : ''}${st.simulated_pnl_usd.toFixed(2)} (
                    {st.simulated_r.toFixed(2)}R)
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {activeTab === 'playbook' && (
          <div className="space-y-3">
            {playbooks.map((pb) => (
              <div
                key={pb.id}
                className="rounded-xl bg-[#121215] border border-white/[0.06] p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="accent">{pb.version}</Badge>
                  <span className="text-[12px] font-mono-tabular text-[#8E8E93]">
                    {pb.created_at.slice(0, 10)}
                  </span>
                </div>
                <pre className="text-[12px] font-mono-tabular text-[#A1A1AA] whitespace-pre-wrap bg-[#050507] p-3.5 rounded-lg border border-white/[0.05]">
                  {pb.content_md}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
