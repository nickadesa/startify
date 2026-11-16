import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, Flame, ShieldAlert, Trophy, Users } from 'lucide-react';
import { TournamentItem, WeeklyLeaderboardRow } from '../types/toptier';

interface WeeklyRankedViewProps {
  token: string | null;
  onViewProfile: (username: string) => void;
  onStartTradingRanked: () => void;
  onRequireAuth: () => void;
}

const TIERS = ['ALL', 'Champion', 'Diamond', 'Platinum', 'Gold', 'Silver', 'Bronze'];

const TIER_BADGE: Record<string, string> = {
  Champion: 'bg-rose-500/15 text-rose-500 border-rose-500/40',
  Diamond: 'bg-sky-500/15 text-sky-500 border-sky-500/40',
  Platinum: 'bg-teal-500/15 text-teal-500 border-teal-500/40',
  Gold: 'bg-amber-500/15 text-amber-500 border-amber-500/40',
  Silver: 'bg-slate-400/15 text-slate-400 border-slate-400/40',
  Bronze: 'bg-orange-700/15 text-orange-600 border-orange-600/40',
};

export const WeeklyRankedView: React.FC<WeeklyRankedViewProps> = ({
  token,
  onViewProfile,
  onStartTradingRanked,
  onRequireAuth,
}) => {
  const [subTab, setSubTab] = useState<'weekly' | 'tournaments'>('weekly');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [rows, setRows] = useState<WeeklyLeaderboardRow[]>([]);
  const [tournaments, setTournaments] = useState<TournamentItem[]>([]);
  const [joinedIds, setJoinedIds] = useState<Record<string, boolean>>({});

  const loadData = async () => {
    const [lbRes, trnRes] = await Promise.all([
      fetch(`/api/leaderboard/weekly?tier=${tierFilter}`).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/tournaments').then((r) => (r.ok ? r.json() : null)),
    ]);
    if (lbRes?.leaderboard) setRows(lbRes.leaderboard);
    if (trnRes?.tournaments) setTournaments(trnRes.tournaments);
  };

  useEffect(() => {
    loadData();
  }, [tierFilter]);

  const handleJoinTournament = async (tid: string) => {
    if (!token) {
      onRequireAuth();
      return;
    }
    const res = await fetch(`/api/tournaments/${tid}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setJoinedIds((prev) => ({ ...prev, [tid]: true }));
      loadData();
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5">
      {/* Banner */}
      <div className="tt-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-500 px-3 py-1 text-[0.75rem] font-semibold">
            <Flame className="w-3.5 h-3.5" /> Season 1 · Weekly $10,000 Ranked
          </div>
          <h1 className="text-[1.375rem] font-bold tracking-tight">Weekly Ranked & Tournaments</h1>
          <p className="text-[0.8125rem] text-[var(--text-secondary)]">
            Everyone starts with <strong className="text-[var(--text-primary)]">$10,000.00</strong> on real-time market prices.
            Top 20% promote each week from Bronze to Champion. Min 5 trades · Max DD -25%.
          </p>
        </div>
        <button
          onClick={onStartTradingRanked}
          className="px-5 py-2.5 rounded-full bg-[var(--text-primary)] text-[var(--bg-card)] text-[0.8125rem] font-semibold whitespace-nowrap cursor-pointer hover:opacity-90 shrink-0"
        >
          Trade Weekly $10K Port
        </button>
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center justify-between gap-3 overflow-x-auto no-scrollbar whitespace-nowrap">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-subtle)] shrink-0">
          <button
            onClick={() => setSubTab('weekly')}
            className={`px-4 py-1.5 rounded-lg text-[0.8125rem] font-semibold cursor-pointer ${
              subTab === 'weekly' ? 'bg-[var(--bg-card)] shadow-xs text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            Weekly Ladder
          </button>
          <button
            onClick={() => setSubTab('tournaments')}
            className={`px-4 py-1.5 rounded-lg text-[0.8125rem] font-semibold cursor-pointer ${
              subTab === 'tournaments' ? 'bg-[var(--bg-card)] shadow-xs text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            Tournaments ({tournaments.length})
          </button>
        </div>

        {subTab === 'weekly' && (
          <div className="flex items-center gap-1.5 shrink-0">
            {TIERS.map((t) => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`px-3 py-1 rounded-full text-[0.75rem] font-medium border cursor-pointer ${
                  tierFilter === t
                    ? 'bg-[var(--text-primary)] text-[var(--bg-card)] border-transparent'
                    : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {subTab === 'weekly' ? (
        <div className="tt-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[0.75rem] text-[var(--text-secondary)]">
                  <th className="py-3 px-4 font-medium">#</th>
                  <th className="py-3 px-4 font-medium">Trader</th>
                  <th className="py-3 px-4 font-medium">Rank</th>
                  <th className="py-3 px-4 font-medium text-right">Equity</th>
                  <th className="py-3 px-4 font-medium text-right">ROI %</th>
                  <th className="py-3 px-4 font-medium text-right hidden sm:table-cell">Max DD</th>
                  <th className="py-3 px-4 font-medium text-right hidden sm:table-cell">Trades</th>
                  <th className="py-3 px-4 font-medium text-right">Zone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-[0.8125rem]">
                {rows.map((r, idx) => {
                  const isPromo = idx < Math.max(1, Math.ceil(rows.length * 0.2));
                  const isDemo = idx >= Math.floor(rows.length * 0.8) && rows.length > 3;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => onViewProfile(r.username)}
                      className="hover:bg-[var(--bg-subtle)]/60 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-semibold tabular-nums">{r.position}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            style={{ backgroundColor: r.avatar_color }}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[0.6875rem] font-bold shrink-0"
                          >
                            {r.username.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <div className="font-semibold">@{r.username}</div>
                            <div className="text-[0.6875rem] text-[var(--text-secondary)]">Lv.{r.level} · ELO {r.elo}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold ${TIER_BADGE[r.rank_tier] || TIER_BADGE.Bronze}`}>
                          {r.rank_tier} {r.rank_division}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-medium tabular-nums">${r.equity.toLocaleString()}</td>
                      <td className={`py-3 px-4 text-right font-semibold tabular-nums ${r.roi_pct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {r.roi_pct >= 0 ? '+' : ''}{r.roi_pct.toFixed(2)}%
                      </td>
                      <td className="py-3 px-4 text-right text-rose-500 tabular-nums hidden sm:table-cell">-{r.max_drawdown_pct}%</td>
                      <td className="py-3 px-4 text-right tabular-nums hidden sm:table-cell">{r.trades_count}</td>
                      <td className="py-3 px-4 text-right">
                        {r.status === 'busted' ? (
                          <span className="inline-flex items-center gap-1 text-[0.6875rem] text-rose-500 font-semibold">
                            <ShieldAlert className="w-3.5 h-3.5" /> Busted
                          </span>
                        ) : isPromo ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-500 px-2 py-0.5 text-[0.6875rem] font-semibold">
                            ▲ Promote
                          </span>
                        ) : isDemo ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 text-rose-500 px-2 py-0.5 text-[0.6875rem] font-semibold">
                            ▼ Demote
                          </span>
                        ) : (
                          <span className="text-[0.6875rem] text-[var(--text-secondary)]">Safe</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tournaments.map((t) => (
            <div key={t.id} className="tt-card p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold ${
                      t.status === 'live' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'
                    }`}
                  >
                    {t.status.toUpperCase()}
                  </span>
                  <span className="text-[0.75rem] text-[var(--text-secondary)] flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> {t.participants} joined
                  </span>
                </div>
                <h3 className="text-[1rem] font-bold">{t.title}</h3>
                <p className="text-[0.75rem] text-[var(--text-secondary)]">{t.description}</p>
                <div className="tt-subcard p-3 space-y-1 text-[0.75rem]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Starting Port</span>
                    <span className="font-semibold tabular-nums">${t.starting_balance.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Scope</span>
                    <span className="font-semibold">{t.market_scope}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Reward</span>
                    <span className="font-semibold text-amber-500 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5" /> {t.prize_badge}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleJoinTournament(t.id)}
                disabled={joinedIds[t.id]}
                className="w-full py-2 rounded-full bg-[var(--text-primary)] text-[var(--bg-card)] text-[0.8125rem] font-semibold cursor-pointer hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {joinedIds[t.id] ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Registered
                  </>
                ) : (
                  <>
                    <Trophy className="w-4 h-4" /> Enter Tournament
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
