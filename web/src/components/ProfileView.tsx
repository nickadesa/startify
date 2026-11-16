import React, { useEffect, useState } from 'react';
import { Award, Shield, Trophy, UserCheck, UserPlus } from 'lucide-react';
import { TraderAccount, TraderPosition, UserProfile } from '../types/toptier';
import { AssetIcon } from './AssetIcon';

interface ProfileViewProps {
  username: string;
  token: string | null;
  currentUser: UserProfile | null;
  onRequireAuth: () => void;
}

const RANK_COLORS: Record<string, string> = {
  Champion: 'bg-rose-500/15 text-rose-500 border-rose-500/40',
  Diamond: 'bg-sky-500/15 text-sky-500 border-sky-500/40',
  Platinum: 'bg-teal-500/15 text-teal-500 border-teal-500/40',
  Gold: 'bg-amber-500/15 text-amber-500 border-amber-500/40',
  Silver: 'bg-slate-400/15 text-slate-400 border-slate-400/40',
  Bronze: 'bg-orange-700/15 text-orange-600 border-orange-600/40',
};

export const ProfileView: React.FC<ProfileViewProps> = ({ username, token, currentUser, onRequireAuth }) => {
  const [profile, setProfile] = useState<{
    user: UserProfile;
    followers_count: number;
    following_count: number;
    is_following: boolean;
    accounts: TraderAccount[];
    recent_trades: TraderPosition[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(username)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        setProfile(await res.json());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [username, token]);

  const handleFollow = async () => {
    if (!token) {
      onRequireAuth();
      return;
    }
    const res = await fetch(`/api/follow/${encodeURIComponent(username)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setProfile((prev) =>
        prev ? { ...prev, is_following: data.following, followers_count: data.followers_count } : prev
      );
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-[0.875rem] text-[var(--text-secondary)]">Loading trader profile...</div>;
  }
  if (!profile) {
    return <div className="p-8 text-center text-[0.875rem] text-rose-500">Trader not found.</div>;
  }

  const u = profile.user;
  const wrAcc = profile.accounts.find((a) => a.mode === 'weekly_ranked') || profile.accounts[0];
  const roi = wrAcc ? (((wrAcc.equity - wrAcc.starting_balance) / wrAcc.starting_balance) * 100).toFixed(2) : '0.00';
  const winRate =
    wrAcc && wrAcc.trades_count > 0 ? ((wrAcc.wins / wrAcc.trades_count) * 100).toFixed(1) : '0.0';
  const xpForNext = u.level * 200;
  const xpPct = Math.min(100, Math.round(((u.xp % xpForNext) / xpForNext) * 100));
  const rankBadgeCls = RANK_COLORS[u.rank_tier] || RANK_COLORS.Bronze;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5">
      {/* Header Card */}
      <div className="tt-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            style={{ backgroundColor: u.avatar_color }}
            className="w-16 h-16 rounded-full flex items-center justify-center text-white text-[1.5rem] font-bold shrink-0"
          >
            {u.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[1.25rem] font-bold">@{u.username}</h1>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.75rem] font-semibold ${rankBadgeCls}`}>
                <Trophy className="w-3.5 h-3.5" />
                {u.rank_tier} {u.rank_division}
              </span>
              <span className="rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] px-2.5 py-0.5 text-[0.75rem] font-semibold">
                Lv.{u.level}
              </span>
            </div>
            <p className="text-[0.8125rem] text-[var(--text-secondary)]">{u.bio}</p>
            <div className="flex items-center gap-4 text-[0.75rem] text-[var(--text-secondary)] tabular-nums">
              <span>
                <strong className="text-[var(--text-primary)]">{profile.followers_count}</strong> Followers
              </span>
              <span>
                <strong className="text-[var(--text-primary)]">{profile.following_count}</strong> Following
              </span>
              <span>
                ELO <strong className="text-[var(--text-primary)]">{u.elo}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentUser?.username !== u.username && (
            <button
              onClick={handleFollow}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[0.8125rem] font-semibold cursor-pointer ${
                profile.is_following
                  ? 'border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                  : 'bg-[var(--text-primary)] text-[var(--bg-card)]'
              }`}
            >
              {profile.is_following ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {profile.is_following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>
      </div>

      {/* XP Bar */}
      <div className="tt-card p-4 space-y-2">
        <div className="flex items-center justify-between text-[0.75rem]">
          <span className="font-semibold flex items-center gap-1.5">
            <Award className="w-4 h-4 text-emerald-500" /> Level {u.level} Progression
          </span>
          <span className="text-[var(--text-secondary)] tabular-nums">{u.xp.toLocaleString()} Total XP</span>
        </div>
        <div className="w-full h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${xpPct}%` }} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Weekly ROI', val: `${Number(roi) >= 0 ? '+' : ''}${roi}%`, accent: Number(roi) >= 0 ? 'text-emerald-500' : 'text-rose-500' },
          { label: 'Win Rate', val: `${winRate}%`, accent: '' },
          { label: 'Max Drawdown', val: `-${wrAcc?.max_drawdown_pct ?? 0}%`, accent: 'text-rose-500' },
          { label: '1v1 / Team Record', val: `${u.duel_wins}W - ${u.duel_losses}L`, accent: '' },
        ].map((s) => (
          <div key={s.label} className="tt-card p-4">
            <div className="text-[0.75rem] text-[var(--text-secondary)]">{s.label}</div>
            <div className={`text-[1.125rem] font-bold tabular-nums mt-1 ${s.accent}`}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Recent Trades */}
      <div className="tt-card p-4 space-y-3">
        <h3 className="text-[0.9375rem] font-semibold flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-500" /> Recent Verified Trades
        </h3>
        {profile.recent_trades.length === 0 ? (
          <p className="text-[0.8125rem] text-[var(--text-secondary)] py-4">No closed trades recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {profile.recent_trades.map((t) => (
              <div key={t.id} className="tt-subcard px-3 py-2.5 flex items-center justify-between text-[0.8125rem]">
                <div className="flex items-center gap-2.5">
                  <AssetIcon symbol={t.symbol} size={22} />
                  <div>
                    <div className="font-semibold">
                      {t.symbol}{' '}
                      <span className={t.side === 'LONG' ? 'text-emerald-500' : 'text-rose-500'}>{t.side}</span>
                    </div>
                    <div className="text-[0.6875rem] text-[var(--text-secondary)] tabular-nums">
                      Entry {t.entry_price} · {t.leverage}x
                    </div>
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className={`font-semibold ${t.pnl_usd >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {t.pnl_usd >= 0 ? '+' : ''}${t.pnl_usd.toFixed(2)}
                  </div>
                  <div className="text-[0.6875rem] text-[var(--text-secondary)]">{t.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
