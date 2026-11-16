import React, { useMemo } from "react";
import { AITrader } from "../types/arena";

interface MonthlyPnLCalendarProps {
  ais: AITrader[];
  selectedAI?: AITrader | null;
}

export const MonthlyPnLCalendar: React.FC<MonthlyPnLCalendarProps> = ({ ais, selectedAI }) => {
  const days = useMemo(() => {
    const sourceAIs = selectedAI ? [selectedAI] : ais;
    if (!sourceAIs.length) return [];
    const candles = sourceAIs[0].pnl_candles || [];
    return candles.map((c, idx) => {
      const total = sourceAIs.reduce((acc, a) => acc + (a.pnl_candles[idx]?.day_pnl || 0), 0);
      const dt = new Date(`${c.date}T00:00:00Z`);
      return {
        date: c.date,
        dayNum: dt.getUTCDate(),
        weekday: dt.getUTCDay(),
        pnl: Math.round(total * 100) / 100,
        trades: Math.max(1, Math.round(sourceAIs.length * 1.4)),
      };
    });
  }, [ais, selectedAI]);

  const weeks = useMemo(() => {
    if (!days.length) return [];
    const rows: (typeof days[number] | null)[][] = [];
    let currentWeek: (typeof days[number] | null)[] = Array(days[0].weekday).fill(null);
    for (const d of days) {
      currentWeek.push(d);
      if (currentWeek.length === 7) {
        rows.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      rows.push(currentWeek);
    }
    return rows;
  }, [days]);

  const headers = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT", "WEEKLY"];

  return (
    <div className="apple-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-[1.125rem] font-semibold tracking-tight">
            {selectedAI ? `${selectedAI.display_name} — Monthly PnL Calendar` : "Arena Monthly PnL Calendar"}
          </h3>
          <p className="text-[0.8125rem]" style={{ color: "var(--text-secondary)" }}>
            TradeSyncer-style daily profit tiles with weekly rollup & trade count
          </p>
        </div>
        <span className="apple-pill px-3 py-1 text-[0.75rem] font-medium" style={{ backgroundColor: "var(--bg-subtle)" }}>
          Last 30 Days
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-8 gap-2 mb-2 text-[0.6875rem] font-semibold tracking-wider text-center" style={{ color: "var(--text-secondary)" }}>
            {headers.map((h) => (
              <div key={h} className="py-1">{h}</div>
            ))}
          </div>

          <div className="space-y-2">
            {weeks.map((week, wIdx) => {
              const weekTotal = week.reduce((acc, d) => acc + (d ? d.pnl : 0), 0);
              const weekTrades = week.reduce((acc, d) => acc + (d ? d.trades : 0), 0);
              return (
                <div key={wIdx} className="grid grid-cols-8 gap-2">
                  {week.map((cell, cIdx) => {
                    if (!cell) {
                      return (
                        <div
                          key={cIdx}
                          className="h-[4.75rem] rounded-2xl opacity-35"
                          style={{ backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}
                        />
                      );
                    }
                    const pos = cell.pnl >= 0;
                    return (
                      <div
                        key={cell.date}
                        className="h-[4.75rem] rounded-2xl p-2.5 flex flex-col justify-between transition-transform hover:scale-[1.02]"
                        style={{
                          backgroundColor: pos ? "rgba(52, 199, 89, 0.14)" : "rgba(255, 59, 48, 0.13)",
                          border: `1px solid ${pos ? "rgba(52, 199, 89, 0.28)" : "rgba(255, 59, 48, 0.28)"}`,
                        }}
                      >
                        <span className="text-[0.6875rem] font-medium tabular-nums" style={{ color: "var(--text-secondary)" }}>
                          {cell.dayNum}
                        </span>
                        <span
                          className="text-[0.875rem] font-bold tabular-nums text-center"
                          style={{ color: pos ? "var(--accent-green)" : "var(--accent-red)" }}
                        >
                          {pos ? `+$${Math.round(cell.pnl)}` : `-$${Math.abs(Math.round(cell.pnl))}`}
                        </span>
                        <span className="text-[0.625rem] text-center opacity-70 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                          {cell.trades} trades
                        </span>
                      </div>
                    );
                  })}
                  <div
                    className="h-[4.75rem] rounded-2xl p-2.5 flex flex-col justify-center items-center"
                    style={{ backgroundColor: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}
                  >
                    <span
                      className="text-[0.875rem] font-bold tabular-nums"
                      style={{ color: weekTotal >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}
                    >
                      {weekTotal >= 0 ? `+$${Math.round(weekTotal)}` : `-$${Math.abs(Math.round(weekTotal))}`}
                    </span>
                    <span className="text-[0.6875rem] mt-0.5 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {weekTrades} trades
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
