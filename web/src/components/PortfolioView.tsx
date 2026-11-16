import React, { useMemo, useState } from 'react';
import { TraderAccount, TraderPosition, UserProfile } from '../types/toptier';
import { AssetIcon } from './AssetIcon';

interface PortfolioViewProps {
  user: UserProfile | null;
  accounts: TraderAccount[];
  positions: TraderPosition[];
  streamerMode: boolean;
  onRequireAuth: () => void;
  onGoTrade: () => void;
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  user,
  accounts,
  positions,
  streamerMode,
  onRequireAuth,
  onGoTrade,
}) => {
  const [subTab, setSubTab] = useState<'portfolio' | 'accounts'>('portfolio');
  const [range, setRange] = useState<'1H' | '1D' | '1W' | '1M'>('1W');
  const [dockTab, setDockTab] = useState<'active' | 'orders' | 'history'>('active');

  const primaryAcc = accounts.find((a) => a.mode === 'weekly_ranked') || accounts[0];
  const eq = primaryAcc?.equity ?? 10000;
  const startBal = primaryAcc?.starting_balance ?? 10000;
  const pnlUsd = eq - startBal;
  const pnlPct = startBal > 0 ? (pnlUsd / startBal) * 100 : 0;

  // Build crisp SVG performance curve from closed trades
  const curvePoints = useMemo(() => {
    const closed = positions
      .filter((p) => p.status === 'CLOSED')
      .slice()
      .reverse();
    let running = startBal;
    const pts = [running];
    for (const c of closed) {
      running += c.pnl_usd;
      pts.push(running);
    }
    if (pts.length === 1) {
      pts.push(running + 120, running + 80, running + 240, eq);
    }
    const min = Math.min(...pts) * 0.995;
    const max = Math.max(...pts) * 1.005;
    const span = Math.max(1, max - min);
    return pts
      .map((val, i) => {
        const x = (i / Math.max(1, pts.length - 1)) * 100;
        const y = 92 - ((val - min) / span) * 80;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [positions, startBal, eq]);

  const activePos = positions.filter((p) => p.status === 'OPEN');
  const openOrders = positions.filter((p) => p.status === 'PENDING');
  const closedPos = positions.filter((p) => p.status === 'CLOSED');

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5">
      {/* Sub-navigation matching Vest Markets /portfolio */}
      <div className="flex items-center gap-6 border-b border-[var(--border-subtle)] pb-2">
        <button
          onClick={() => setSubTab('portfolio')}
          className={`text-[1.125rem] font-bold cursor-pointer ${
            subTab === 'portfolio' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
          }`}
        >
          Portfolio
        </button>
        <button
          onClick={() => setSubTab('accounts')}
          className={`text-[1.125rem] font-bold cursor-pointer ${
            subTab === 'accounts' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
          }`}
        >
          Competition Accounts ({accounts.length})
        </button>
      </div>

      {subTab === 'portfolio' ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Trading Performance Card */}
            <div className="lg:col-span-8 tt-card p-5 space-y-4 flex flex-col justify-between min-h-[19rem]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[1rem] font-bold">Trading Performance</h2>
                <div className="flex items-center gap-1">
                  {(['1H', '1D', '1W', '1M'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`px-3 py-1 rounded-lg text-[0.75rem] font-semibold border cursor-pointer ${
                        range === r
                          ? 'border-[var(--text-primary)] text-[var(--text-primary)] bg-[var(--bg-subtle)]'
                          : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {!user ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 py-10">
                  <p className="text-[0.8125rem] text-[var(--text-secondary)]">Sign in to track your equity curve and competition stats</p>
                  <button
                    onClick={onRequireAuth}
                    className="px-5 py-2 rounded-full bg-[var(--text-primary)] text-[var(--bg-card)] text-[0.8125rem] font-semibold cursor-pointer"
                  >
                    Sign In / Register
                  </button>
                </div>
              ) : (
                <div className="w-full h-44">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                    <polyline
                      fill="none"
                      stroke={pnlPct >= 0 ? '#10B981' : '#EF4444'}
                      strokeWidth="1.5"
                      points={curvePoints}
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Right Account Value + Health */}
            <div className="lg:col-span-4 space-y-4">
              <div className="tt-card p-5 space-y-3">
                <div>
                  <div className="text-[0.75rem] text-[var(--text-secondary)]">Account Value</div>
                  <div className="text-[1.5rem] font-bold tabular-nums mt-0.5">
                    {streamerMode ? '$****' : `$${eq.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                  </div>
                  <div className={`text-[0.75rem] font-semibold tabular-nums ${pnlPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {pnlUsd >= 0 ? '+' : ''}${pnlUsd.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                  </div>
                </div>
                <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-between text-[0.75rem]">
                  <span className="text-[var(--text-secondary)]">Available Margin</span>
                  <span className="font-semibold tabular-nums">
                    {streamerMode ? '$****' : `$${(primaryAcc?.balance ?? 10000).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                  </span>
                </div>
                <button
                  onClick={onGoTrade}
                  className="w-full py-2 rounded-full bg-[var(--text-primary)] text-[var(--bg-card)] text-[0.8125rem] font-semibold cursor-pointer"
                >
                  Open Terminal
                </button>
              </div>

              <div className="tt-card p-5 space-y-2.5">
                <div className="flex justify-between text-[0.875rem] font-bold">
                  <span>Account Health</span>
                  <span className="text-emerald-500 tabular-nums">
                    {Math.max(0, 100 - (primaryAcc?.max_drawdown_pct ?? 0)).toFixed(1)}%
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {[1, 2, 3, 4, 5].map((b) => (
                    <div key={b} className="h-1.5 rounded-full bg-emerald-500" />
                  ))}
                </div>
                <div className="space-y-1 text-[0.75rem] pt-1 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Total Trades</span>
                    <span>{primaryAcc?.trades_count ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Max Drawdown</span>
                    <span className="text-rose-500">-{primaryAcc?.max_drawdown_pct ?? 0}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Positions / Orders / History */}
          <div className="tt-card p-4 space-y-3">
            <div className="flex items-center gap-5 border-b border-[var(--border-subtle)] pb-2 text-[0.8125rem] overflow-x-auto no-scrollbar whitespace-nowrap">
              {[
                { id: 'active', label: `Active Positions (${activePos.length})` },
                { id: 'orders', label: `Open Orders (${openOrders.length})` },
                { id: 'history', label: `Trade History (${closedPos.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDockTab(t.id as typeof dockTab)}
                  className={`font-semibold pb-1 cursor-pointer ${
                    dockTab === t.id ? 'text-[var(--text-primary)] border-b-2 border-emerald-500' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {dockTab === 'active' &&
              (activePos.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-[0.8125rem] text-[var(--text-secondary)]">No active positions yet</p>
                  <button
                    onClick={onGoTrade}
                    className="px-4 py-1.5 rounded-full bg-[var(--text-primary)] text-[var(--bg-card)] text-[0.75rem] font-semibold cursor-pointer"
                  >
                    Trade Now
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {activePos.map((p) => (
                    <div key={p.id} className="tt-subcard px-3 py-2.5 flex items-center justify-between text-[0.8125rem]">
                      <div className="flex items-center gap-2">
                        <AssetIcon symbol={p.symbol} size={22} />
                        <span className="font-semibold">
                          {p.symbol} {p.side} {p.leverage}x
                        </span>
                      </div>
                      <span className="tabular-nums">Entry ${p.entry_price}</span>
                    </div>
                  ))}
                </div>
              ))}

            {dockTab === 'orders' && (
              <p className="text-center py-6 text-[0.8125rem] text-[var(--text-secondary)]">
                {openOrders.length} pending limit orders
              </p>
            )}

            {dockTab === 'history' &&
              (closedPos.length === 0 ? (
                <p className="text-center py-6 text-[0.8125rem] text-[var(--text-secondary)]">No trade history yet.</p>
              ) : (
                <div className="space-y-2">
                  {closedPos.slice(0, 15).map((p) => (
                    <div key={p.id} className="tt-subcard px-3 py-2 flex items-center justify-between text-[0.8125rem]">
                      <span>
                        {p.symbol} {p.side} · {p.entry_price} → {p.exit_price}
                      </span>
                      <span className={`font-semibold tabular-nums ${p.pnl_usd >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {p.pnl_usd >= 0 ? '+' : ''}${p.pnl_usd.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="tt-card p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[0.9375rem] uppercase">{acc.mode.replace('_', ' ')}</span>
                <span className="rounded-full bg-emerald-500/15 text-emerald-500 px-2.5 py-0.5 text-[0.6875rem] font-semibold">
                  {acc.status}
                </span>
              </div>
              <div className="text-[1.25rem] font-bold tabular-nums">${acc.equity.toLocaleString()}</div>
              <div className="text-[0.75rem] text-[var(--text-secondary)] tabular-nums">
                Trades: {acc.trades_count} · W/L: {acc.wins}/{acc.losses} · Max DD: -{acc.max_drawdown_pct}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
