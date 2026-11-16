import json
import math
import random
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List
import yaml

from agents.playbook_manager import PlaybookManager
from data.news_provider import USD_HIGH_IMPACT_CATALOG
from db.database import BASE_DIR, init_db, query_all
from indicators.fib_ote import ote_zone
from postmortem.writer import PostMortemWriter


def load_config() -> Dict[str, Any]:
    cfg_path = BASE_DIR / "config.yaml"
    return yaml.safe_load(cfg_path.read_text(encoding="utf-8"))


def seed_arena_database(export_json_path: Path = None) -> Dict[str, Any]:
    """
    Populates SQLite (`db/trades.sqlite`) and optionally exports a complete JSON payload
    for the Startify React frontend (ensuring zero-latency Vercel static/serverless operation
    as well as live SQLite API queries).
    """
    cfg = load_config()
    conn = init_db()
    cur = conn.cursor()

    # Clear existing records for clean deterministic seed
    for tbl in [
        "postmortems",
        "shadow_trades",
        "decisions",
        "trades",
        "daily_stats",
        "account_runs",
        "playbooks",
        "consensus_events",
        "weekly_champions",
        "news_events",
        "system_health_logs",
        "agents",
    ]:
        cur.execute(f"DELETE FROM {tbl};")

    rng = random.Random(20261115)
    pb_mgr = PlaybookManager()
    pm_writer = PostMortemWriter()

    agents_cfg = cfg["agents"]
    created_at = "2026-09-28T00:00:00Z"

    # Skill/edge profiles per agent (Starting Equity = $1,000.00 for all)
    # Note: ai-6 (Zeta-GLM) experiences an early Run #1 blowup on Oct 16 and restarts Run #2 at $1,000.00!
    profiles = {
        "ai-1": {"win_prob": 0.66, "avg_win_r": 2.35, "avg_loss_r": -1.0, "freq": 0.78, "pb_ver": "v3", "blowup_day": None, "latency": 410},
        "ai-2": {"win_prob": 0.63, "avg_win_r": 2.45, "avg_loss_r": -1.0, "freq": 0.82, "pb_ver": "v3", "blowup_day": None, "latency": 195},
        "ai-3": {"win_prob": 0.60, "avg_win_r": 2.15, "avg_loss_r": -1.0, "freq": 0.70, "pb_ver": "v2", "blowup_day": None, "latency": 520},
        "ai-4": {"win_prob": 0.58, "avg_win_r": 2.20, "avg_loss_r": -1.0, "freq": 0.72, "pb_ver": "v2", "blowup_day": None, "latency": 640},
        "ai-5": {"win_prob": 0.57, "avg_win_r": 2.10, "avg_loss_r": -1.0, "freq": 0.68, "pb_ver": "v2", "blowup_day": None, "latency": 380},
        "ai-6": {"win_prob": 0.54, "avg_win_r": 2.25, "avg_loss_r": -1.0, "freq": 0.75, "pb_ver": "v3", "blowup_day": "2026-10-16", "latency": 590},
        "ai-7": {"win_prob": 0.64, "avg_win_r": 2.65, "avg_loss_r": -1.0, "freq": 0.65, "pb_ver": "v2", "blowup_day": None, "latency": 780},
        "ai-8": {"win_prob": 0.68, "avg_win_r": 1.95, "avg_loss_r": -0.9, "freq": 0.60, "pb_ver": "v2", "blowup_day": None, "latency": 460},
        "consensus": {"win_prob": 0.71, "avg_win_r": 2.40, "avg_loss_r": -1.0, "freq": 0.52, "pb_ver": "v2", "blowup_day": None, "latency": 120},
        "ctrl-ote": {"win_prob": 0.51, "avg_win_r": 2.00, "avg_loss_r": -1.0, "freq": 0.85, "pb_ver": "v1", "blowup_day": None, "latency": 15},
        "ctrl-bnh": {"win_prob": 0.55, "avg_win_r": 1.45, "avg_loss_r": -1.0, "freq": 1.00, "pb_ver": "v1", "blowup_day": None, "latency": 5},
    }

    style_tags_pool = {
        "ai-1": ["OTE-0.705-Sniper", "London-COT-Pullback", "OI-Wall-Confluence"],
        "ai-2": ["NY-Liquidity-Sweep", "Overlap-OTE-Reversal", "StopHunt-0.705"],
        "ai-3": ["GLD-Strike-Pin", "Put-Wall-Bounce", "Call-Wall-Fade"],
        "ai-4": ["H4-Impulse-OTE", "Structure-Break-Retest", "Discount-Zone-Limit"],
        "ai-5": ["PAXG-OI-Delta-Surge", "Perp-Flush-Reversal", "OTE-SweetSpot"],
        "ai-6": ["Asian-Range-Sweep", "London-Open-Breakout", "High-Beta-OTE"],
        "ai-7": ["USD-Yield-Divergence", "Asymmetric-3R-OTE", "Macro-Impulse"],
        "ai-8": ["Conservative-0.705", "Low-Risk-Confluence", "London-Session-Guard"],
        "consensus": ["Multi-AI-Consensus-3+", "High-Conviction-Cluster"],
        "ctrl-ote": ["Mechanical-0.705-OTE"],
        "ctrl-bnh": ["Passive-Gold-Benchmark"],
    }

    # 1. Insert Agents & Playbooks
    for ag in agents_cfg:
        aid = ag["agent_id"]
        prof = profiles[aid]
        blowups = 1 if prof["blowup_day"] else 0
        cur.execute(
            """INSERT INTO agents
               (agent_id, display_name, provider, model_name, model_version, prompt_version,
                playbook_version, style_archetype, color, active, blowup_count, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                aid,
                ag["display_name"],
                ag["provider"],
                ag["model_name"],
                ag["model_version"],
                "v2.1",
                prof["pb_ver"],
                ag["style_archetype"],
                ag["color"],
                1,
                blowups,
                created_at,
            ),
        )
        pb_text = pb_mgr.ensure_agent_playbook(ag)
        cur.execute(
            """INSERT INTO playbooks
               (agent_id, version, content_md, created_at, change_reason, win_rate_before, win_rate_after, pf_before, pf_after)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                aid,
                "v1",
                pb_text,
                "2026-10-01T00:00:00Z",
                "Initial self-discovered Playbook from Train dataset exploration.",
                0.0,
                56.5,
                0.0,
                1.52,
            ),
        )
        if prof["pb_ver"] in ("v2", "v3"):
            cur.execute(
                """INSERT INTO playbooks
                   (agent_id, version, content_md, created_at, change_reason, win_rate_before, win_rate_after, pf_before, pf_after)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    aid,
                    prof["pb_ver"],
                    pb_text + "\n\n## Revision Note\n- Added 0.25x ATR stop buffer below 0.79 OTE and strict Rank #1 OI wall filter.",
                    "2026-10-23T21:00:00Z",
                    "Reduced `sl_too_tight` mistake tags by 38% after 22 trades sample.",
                    56.5,
                    round(prof["win_prob"] * 100.0, 1),
                    1.52,
                    round(prof["win_prob"] * prof["avg_win_r"] / max(1.0 - prof["win_prob"], 0.1), 2),
                ),
            )

    # 2. Seed USD-Only High-Impact News Events across Oct & Nov 2026
    usd_news_dates = {
        "2026-10-02": USD_HIGH_IMPACT_CATALOG[2],  # NFP
        "2026-10-14": USD_HIGH_IMPACT_CATALOG[1],  # US CPI
        "2026-10-21": USD_HIGH_IMPACT_CATALOG[0],  # FOMC
        "2026-10-29": USD_HIGH_IMPACT_CATALOG[3],  # Core PCE
        "2026-11-04": USD_HIGH_IMPACT_CATALOG[4],  # ISM PMI
        "2026-11-06": USD_HIGH_IMPACT_CATALOG[2],  # NFP
        "2026-11-11": USD_HIGH_IMPACT_CATALOG[1],  # US CPI
        "2026-11-13": USD_HIGH_IMPACT_CATALOG[0],  # FOMC Minutes
    }
    for dt_str, ev in usd_news_dates.items():
        cur.execute(
            """INSERT INTO news_events
               (event_id, time, date, currency, name, category, impact, actual, forecast, prior,
                surprise_delta, gold_15m_move_usd, gold_60m_move_usd, neutral_summary)
               VALUES (?, ?, ?, 'USD', ?, ?, 'high', ?, ?, ?, ?, ?, ?, ?)""",
            (
                f"{ev['event_id']}-{dt_str}",
                f"{dt_str}T13:30:00Z",
                dt_str,
                ev["name"],
                ev["category"],
                ev["actual"],
                ev["forecast"],
                ev["prior"],
                ev["surprise_delta"],
                ev["gold_15m_move_usd"],
                ev["gold_60m_move_usd"],
                ev["neutral_summary"],
            ),
        )

    # 3. Generate Trading Days (Oct 1, 2026 -> Nov 15, 2026)
    start_d = date(2026, 10, 1)
    end_d = date(2026, 11, 15)
    trading_days: List[date] = []
    d_ptr = start_d
    while d_ptr <= end_d:
        if d_ptr.weekday() < 5:  # Mon - Fri
            trading_days.append(d_ptr)
        d_ptr += timedelta(days=1)

    sessions_pool = ["london", "london_ny_overlap", "new_york"]
    regimes_pool = ["bullish_impulse", "bearish_impulse", "high_vol_expansion", "range_consolidation"]
    triggers_pool = ["ote_sweet_spot", "oi_wall_test", "liquidity_sweep_low", "liquidity_sweep_high"]

    for ag in agents_cfg:
        aid = ag["agent_id"]
        prof = profiles[aid]
        tags = style_tags_pool[aid]

        run_num = 1
        run_id = f"{aid}-run-1"
        run_start = "2026-10-01T07:00:00Z"
        equity = 1000.0
        peak_eq = 1000.0
        max_dd = 0.0
        run_trades = 0
        run_wins = 0

        cur.execute(
            """INSERT INTO account_runs
               (run_id, agent_id, run_number, start_time, end_time, start_equity, end_equity,
                peak_equity, max_drawdown_pct, total_trades, win_rate, end_reason,
                playbook_version_start, playbook_version_end, survival_days, blowup_postmortem)
               VALUES (?, ?, 1, ?, NULL, 1000.0, 1000.0, 1000.0, 0.0, 0, 0.0, 'active', 'v1', ?, 0, '')""",
            (run_id, aid, run_start, prof["pb_ver"]),
        )

        for idx_day, t_day in enumerate(trading_days):
            d_str = t_day.strftime("%Y-%m-%d")
            base_gold = round(3965.0 + idx_day * 1.85 + math.sin(idx_day * 0.45) * 14.0, 2)

            # Check if this is Zeta-GLM's blowup demonstration day (2026-10-16)
            if prof["blowup_day"] == d_str and run_num == 1:
                loss_usd = -(equity - 92.50)  # Drops below $100 (10% of $1,000 threshold) -> Blowup!
                equity = 92.50
                max_dd = 91.4
                cur.execute(
                    """UPDATE account_runs
                       SET end_time = ?, end_equity = ?, peak_equity = ?, max_drawdown_pct = ?,
                           total_trades = ?, win_rate = ?, end_reason = 'blowup',
                           playbook_version_end = 'v2', survival_days = 12, blowup_postmortem = ?
                       WHERE run_id = ?""",
                    (
                        f"{d_str}T15:00:00Z",
                        equity,
                        peak_eq,
                        max_dd,
                        max(run_trades, 11),
                        round(run_wins / max(run_trades, 1) * 100.0, 1),
                        "Account Run #1 breached minimum equity threshold after oversized volatility expansion during USD retail sales release. Playbook v2 updated with strict 1.0% risk cap and mandatory Rank #1 OI wall confirmation.",
                        run_id,
                    ),
                )
                cur.execute(
                    """INSERT INTO daily_stats
                       (agent_id, date, pnl_usd, pnl_pct, r_total, equity_close, drawdown_pct,
                        trades, wins, losses, style_tags_json, blowup_occurred)
                       VALUES (?, ?, ?, ?, -4.5, 1000.0, ?, 2, 0, 2, ?, 1)""",
                    (aid, d_str, round(loss_usd, 2), round(loss_usd / 10.0, 2), max_dd, json.dumps([tags[0]])),
                )
                # Restart Run #2 at $1,000.00!
                run_num = 2
                run_id = f"{aid}-run-2"
                run_start = f"{d_str}T16:00:00Z"
                equity = 1000.0
                peak_eq = 1000.0
                max_dd = 0.0
                run_trades = 0
                run_wins = 0
                cur.execute(
                    """INSERT INTO account_runs
                       (run_id, agent_id, run_number, start_time, end_time, start_equity, end_equity,
                        peak_equity, max_drawdown_pct, total_trades, win_rate, end_reason,
                        playbook_version_start, playbook_version_end, survival_days, blowup_postmortem)
                       VALUES (?, ?, 2, ?, NULL, 1000.0, 1000.0, 1000.0, 0.0, 0, 0.0, 'active', 'v2', ?, 0, '')""",
                    (run_id, aid, run_start, prof["pb_ver"]),
                )
                continue

            # Determine number of trades on this day (0, 1, or 2)
            if rng.random() > prof["freq"]:
                cur.execute(
                    """INSERT INTO daily_stats
                       (agent_id, date, pnl_usd, pnl_pct, r_total, equity_close, drawdown_pct,
                        trades, wins, losses, style_tags_json, blowup_occurred)
                       VALUES (?, ?, 0.0, 0.0, 0.0, ?, ?, 0, 0, 0, '[]', 0)""",
                    (aid, d_str, round(equity, 2), round(((peak_eq - equity) / peak_eq) * 100.0, 2)),
                )
                continue

            num_trades = 1 if rng.random() < 0.62 else 2
            day_pnl = 0.0
            day_r = 0.0
            day_wins = 0
            day_losses = 0
            day_tags: List[str] = []

            for t_idx in range(num_trades):
                is_win = rng.random() < prof["win_prob"]
                risk_pct = 1.0 if aid in ("ctrl-ote", "ctrl-bnh", "ai-8") else rng.choice([1.0, 1.2, 1.5])
                risk_usd = round(equity * (risk_pct / 100.0), 2)

                r_mult = (
                    round(prof["avg_win_r"] + rng.uniform(-0.35, 0.65), 2)
                    if is_win
                    else round(prof["avg_loss_r"] + rng.uniform(-0.1, 0.25), 2)
                )
                pnl_usd = round(risk_usd * r_mult, 2)

                direction = "long" if (idx_day + t_idx) % 3 != 0 else "short"
                swing_low = round(base_gold - 18.0, 2)
                swing_high = round(base_gold + 22.0, 2)
                ote = ote_zone(swing_low, swing_high, direction)
                entry_p = ote["sweet_spot"]
                sl_dist = 5.0
                sl_p = round(entry_p - sl_dist if direction == "long" else entry_p + sl_dist, 2)
                tp1_p = round(entry_p + (sl_dist * 2.0 if direction == "long" else -sl_dist * 2.0), 2)
                tp2_p = round(entry_p + (sl_dist * 3.2 if direction == "long" else -sl_dist * 3.2), 2)
                exit_p = round(entry_p + (sl_dist * r_mult if direction == "long" else -sl_dist * r_mult), 2)

                lot = max(round(risk_usd / (sl_dist * 100.0), 2), 0.01)
                sess = sessions_pool[(idx_day + t_idx) % len(sessions_pool)]
                style = tags[(idx_day + t_idx) % len(tags)]
                trig = triggers_pool[(idx_day + t_idx) % len(triggers_pool)]
                regime = regimes_pool[(idx_day + t_idx) % len(regimes_pool)]
                conf = round(rng.uniform(0.68, 0.91), 2)

                open_hr = 8 + t_idx * 5
                opened_at = f"{d_str}T{open_hr:02d}:00:00Z"
                closed_at = f"{d_str}T{min(open_hr + 3, 20):02d}:00:00Z"
                trade_id = f"trd-{aid}-{d_str.replace('-', '')}-{t_idx+1}"

                news_ref = [usd_news_dates[d_str]["event_id"]] if d_str in usd_news_dates else []
                snap_obj = {
                    "symbol": "XAUUSD",
                    "time": opened_at,
                    "price": entry_p,
                    "spread": 0.30,
                    "trend_h4": "bullish" if direction == "long" else "bearish",
                    "last_swing": {"low": swing_low, "high": swing_high},
                    "ote": ote,
                    "oi_levels": [
                        {"price": round(entry_p - 2.5, 2), "oi_rank": 1, "contracts_est": 18400},
                        {"price": round(tp1_p, 2), "oi_rank": 2, "contracts_est": 15200},
                    ],
                    "oi_change_paxg_1h_pct": round(rng.uniform(1.2, 4.4), 2),
                    "cot_bias": "net long increasing (+14,280 contracts WoW)",
                }

                reasoning_text = (
                    f"{ag['display_name']} identified {direction.upper()} setup at 0.705 OTE sweet spot (${entry_p:.2f}) "
                    f"during {sess} session with Rank #1 GLD OI wall defense and +{snap_obj['oi_change_paxg_1h_pct']}% PAXG OI expansion."
                )
                invalid_text = f"H1 close beyond swing invalidation ${ote['invalidation']:.2f} or USD news blackout."

                cur.execute(
                    """INSERT INTO trades
                       (trade_id, agent_id, run_id, opened_at, closed_at, action, order_type,
                        entry, stop_loss, tp_json, lot, risk_pct, risk_usd, exit_price,
                        pnl_usd, pnl_pct, r_multiple, duration_hours, session, style_tag,
                        trigger_type, market_regime, confidence, snapshot_json, reasoning,
                        invalid_if, playbook_version, model_name, model_version, status, news_refs_json)
                       VALUES (?, ?, ?, ?, ?, ?, 'limit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'closed', ?)""",
                    (
                        trade_id,
                        aid,
                        run_id,
                        opened_at,
                        closed_at,
                        direction,
                        entry_p,
                        sl_p,
                        json.dumps([{"price": tp1_p, "close_pct": 50}, {"price": tp2_p, "close_pct": 50}]),
                        lot,
                        risk_pct,
                        risk_usd,
                        exit_p,
                        pnl_usd,
                        round(pnl_usd / equity * 100.0, 2),
                        r_mult,
                        round(rng.uniform(1.5, 4.5), 1),
                        sess,
                        style,
                        trig,
                        regime,
                        conf,
                        json.dumps(snap_obj),
                        reasoning_text,
                        invalid_text,
                        prof["pb_ver"],
                        ag["model_name"],
                        ag["model_version"],
                        json.dumps(news_ref),
                    ),
                )

                # Write Post-Mortem for every trade
                pm = pm_writer.write_postmortem({
                    "trade_id": trade_id,
                    "agent_id": aid,
                    "action": direction,
                    "entry": entry_p,
                    "stop_loss": sl_p,
                    "exit_price": exit_p,
                    "pnl_usd": pnl_usd,
                    "r_multiple": r_mult,
                    "session": sess,
                    "style_tag": style,
                    "closed_at": closed_at,
                })
                cur.execute(
                    """INSERT INTO postmortems
                       (trade_id, agent_id, outcome, followed_plan, what_happened, mistake_tags,
                        what_worked, lesson, playbook_suggestion, created_at)
                       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)""",
                    (
                        trade_id,
                        aid,
                        pm["outcome"],
                        pm["what_happened"],
                        json.dumps(pm["mistake_tags"]),
                        pm["what_worked"],
                        pm["lesson"],
                        pm["playbook_suggestion"],
                        closed_at,
                    ),
                )

                # Record decision & latency metrics
                dec_id = f"dec-{trade_id}"
                cur.execute(
                    """INSERT INTO decisions
                       (decision_id, agent_id, time, trigger_type, action, rejected_reason,
                        raw_response, tokens_in, tokens_out, latency_ms, status)
                       VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, 'accepted')""",
                    (
                        dec_id,
                        aid,
                        opened_at,
                        trig,
                        direction,
                        json.dumps({"action": direction, "entry": entry_p}),
                        rng.randint(820, 1180),
                        rng.randint(155, 240),
                        int(prof["latency"] + rng.uniform(-35, 55)),
                    ),
                )

                equity = round(equity + pnl_usd, 2)
                peak_eq = max(peak_eq, equity)
                dd_now = round(((peak_eq - equity) / peak_eq) * 100.0, 2)
                max_dd = max(max_dd, dd_now)

                day_pnl = round(day_pnl + pnl_usd, 2)
                day_r = round(day_r + r_mult, 2)
                run_trades += 1
                if is_win:
                    day_wins += 1
                    run_wins += 1
                else:
                    day_losses += 1
                if style not in day_tags:
                    day_tags.append(style)

            # Also seed periodic Shadow Trades (rejected by validator or AI chose `no_trade`)
            if idx_day % 4 == 0 and aid.startswith("ai-"):
                shd_id = f"shd-{aid}-{idx_day}"
                shd_type = "validator_rejected" if idx_day % 8 == 0 else "ai_no_trade"
                rej_reason = (
                    "Blocked: Within 45m of USD CPI / FOMC release"
                    if shd_type == "validator_rejected"
                    else "AI stood down: PAXG 1H OI diverging from H4 impulse"
                )
                sim_r = round(rng.uniform(-1.0, 1.4), 2)
                sim_pnl = round(sim_r * 10.0, 2)
                cur.execute(
                    """INSERT INTO shadow_trades
                       (shadow_id, decision_id, agent_id, time, shadow_type, rejected_reason,
                        action, hypothetical_entry, hypothetical_sl, hypothetical_tp,
                        simulated_exit, simulated_pnl_usd, simulated_r, outcome)
                       VALUES (?, ?, ?, ?, ?, ?, 'long', ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        shd_id,
                        f"dec-shd-{aid}-{idx_day}",
                        aid,
                        f"{d_str}T13:00:00Z",
                        shd_type,
                        rej_reason,
                        base_gold,
                        round(base_gold - 5.0, 2),
                        round(base_gold + 10.0, 2),
                        round(base_gold + sim_r * 5.0, 2),
                        sim_pnl,
                        sim_r,
                        "win" if sim_pnl > 0 else "loss",
                    ),
                )

            cur.execute(
                """INSERT INTO daily_stats
                   (agent_id, date, pnl_usd, pnl_pct, r_total, equity_close, drawdown_pct,
                    trades, wins, losses, style_tags_json, blowup_occurred)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
                (
                    aid,
                    d_str,
                    day_pnl,
                    round(day_pnl / 10.0, 2),
                    day_r,
                    round(equity, 2),
                    round(((peak_eq - equity) / peak_eq) * 100.0, 2),
                    num_trades,
                    day_wins,
                    day_losses,
                    json.dumps(day_tags),
                ),
            )

        # Save active account run
        survival_days = (end_d - date.fromisoformat(run_start[:10])).days
        cur.execute(
            """UPDATE account_runs
               SET end_equity = ?, peak_equity = ?, max_drawdown_pct = ?,
                   total_trades = ?, win_rate = ?, playbook_version_end = ?, survival_days = ?
               WHERE run_id = ?""",
            (
                round(equity, 2),
                round(peak_eq, 2),
                round(max_dd, 2),
                run_trades,
                round((run_wins / max(run_trades, 1)) * 100.0, 1),
                prof["pb_ver"],
                survival_days,
                run_id,
            ),
        )

    # 4. Seed Consensus Events
    consensus_samples = [
        ("cons-20261008", "2026-10-08T13:00:00Z", "long", 5, ["ai-1", "ai-2", "ai-3", "ai-7", "ai-8"], "$3984.20 - $3986.50", "$3978.50 - $3980.00", "$3998.00 - $4002.50", 0.84, 2.45, 36.75, "win"),
        ("cons-20261015", "2026-10-15T08:00:00Z", "long", 4, ["ai-1", "ai-4", "ai-5", "ai-7"], "$4001.10 - $4003.40", "$3995.00 - $3996.80", "$4015.00 - $4019.00", 0.81, 2.15, 28.40, "win"),
        ("cons-20261022", "2026-10-22T14:00:00Z", "short", 3, ["ai-2", "ai-3", "ai-6"], "$4018.00 - $4020.80", "$4025.00 - $4026.50", "$4002.00 - $4005.00", 0.76, -1.00, -12.00, "loss"),
        ("cons-20261028", "2026-10-28T12:00:00Z", "long", 6, ["ai-1", "ai-2", "ai-4", "ai-5", "ai-7", "ai-8"], "$4012.40 - $4015.10", "$4006.50 - $4008.00", "$4028.00 - $4033.00", 0.87, 2.80, 42.00, "win"),
        ("cons-20261105", "2026-11-05T13:00:00Z", "long", 5, ["ai-1", "ai-2", "ai-3", "ai-7", "ai-8"], "$4024.00 - $4026.90", "$4018.50 - $4020.00", "$4039.50 - $4044.00", 0.85, 2.30, 34.50, "win"),
        ("cons-20261112", "2026-11-12T09:00:00Z", "long", 4, ["ai-1", "ai-2", "ai-7", "ai-8"], "$4031.20 - $4034.00", "$4025.50 - $4027.00", "$4046.00 - $4051.00", 0.83, 2.55, 38.25, "win"),
    ]
    for ce in consensus_samples:
        cur.execute(
            """INSERT INTO consensus_events
               (event_id, time, direction, agreeing_count, total_active_agents, agents_json,
                entry_range, sl_range, tp_range, avg_confidence, result_r, result_pnl_usd, outcome)
               VALUES (?, ?, ?, ?, 8, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (ce[0], ce[1], ce[2], ce[3], json.dumps(ce[4]), ce[5], ce[6], ce[7], ce[8], ce[9], ce[10], ce[11]),
        )

    # 5. Seed Weekly Champions (Friday 17:00 America/New_York seasons)
    weekly_seasons = [
        ("2026-W41", "2026-10-05", "2026-10-09", "ai-1", "ai-7", 118.40, 11.84, 71.4, 2.85, 7, "Net Long Increasing (+11,200 Contracts)"),
        ("2026-W42", "2026-10-12", "2026-10-16", "ai-2", "ai-1", 134.20, 13.42, 68.8, 2.74, 8, "Net Long Increasing (+14,280 Contracts)"),
        ("2026-W43", "2026-10-19", "2026-10-23", "ai-7", "consensus", 152.60, 15.26, 75.0, 3.12, 6, "Net Long Trimming (-4,100 Contracts)"),
        ("2026-W44", "2026-10-26", "2026-10-30", "consensus", "ai-1", 141.80, 14.18, 72.7, 2.95, 7, "Net Long Increasing (+9,850 Contracts)"),
        ("2026-W45", "2026-11-02", "2026-11-06", "ai-1", "ai-8", 129.50, 12.95, 70.0, 2.68, 7, "Net Long Increasing (+12,640 Contracts)"),
        ("2026-W46", "2026-11-09", "2026-11-13", "ai-7", "ai-1", 164.10, 16.41, 76.5, 3.24, 8, "Net Long Increasing (+15,920 Contracts)"),
    ]
    for ws in weekly_seasons:
        cur.execute(
            """INSERT INTO weekly_champions
               (week_id, week_start, week_end, champion_agent_id, runner_up_agent_id,
                net_pnl_usd, net_return_pct, win_rate, profit_factor, total_trades,
                cot_bias_next_week, summary_markdown)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                ws[0],
                ws[1],
                ws[2],
                ws[3],
                ws[4],
                ws[5],
                ws[6],
                ws[7],
                ws[8],
                ws[9],
                ws[10],
                f"Friday 17:00 America/New_York Report: **{ws[3].upper()}** captured the weekly crown with **+${ws[5]:.2f} (+{ws[6]:.2f}%)**, Win Rate **{ws[7]:.1f}%**, Profit Factor **{ws[8]:.2f}**.",
            ),
        )

    # 6. Seed System Health Logs
    health_logs = [
        ("2026-11-15T12:00:00Z", "data_quality", "info", "H1 XAUUSD & PAXGUSDT OI feed verified: 0 gaps, spread 0.28 USD"),
        ("2026-11-15T13:00:00Z", "trigger_engine", "info", "Trigger-based calling saved 68% API quota over last 7 days (called on OTE/OI/Sweep only)"),
        ("2026-11-14T16:00:00Z", "friday_flatten", "info", "All open paper positions flattened ahead of Friday 17:00 NY market close"),
        ("2026-11-13T18:15:00Z", "news_blackout", "warning", "USD FOMC Minutes blackout window enforced (-45m / +45m); 3 plans deferred to shadow trades"),
    ]
    for hl in health_logs:
        cur.execute(
            "INSERT INTO system_health_logs (time, component, severity, message) VALUES (?, ?, ?, ?)",
            hl,
        )

    conn.commit()

    payload = build_full_arena_payload(conn)
    if export_json_path:
        export_json_path.parent.mkdir(parents=True, exist_ok=True)
        export_json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    return payload


def build_full_arena_payload(conn) -> Dict[str, Any]:
    agents = query_all(conn, "SELECT * FROM agents ORDER BY agent_id")
    runs = query_all(conn, "SELECT * FROM account_runs ORDER BY agent_id, run_number")
    trades = query_all(conn, "SELECT * FROM trades ORDER BY opened_at DESC")
    postmortems = query_all(conn, "SELECT * FROM postmortems")
    daily_stats = query_all(conn, "SELECT * FROM daily_stats ORDER BY date ASC")
    shadow_trades = query_all(conn, "SELECT * FROM shadow_trades ORDER BY time DESC")
    playbooks = query_all(conn, "SELECT * FROM playbooks ORDER BY id ASC")
    consensus_events = query_all(conn, "SELECT * FROM consensus_events ORDER BY time DESC")
    news_events = query_all(conn, "SELECT * FROM news_events ORDER BY date ASC")
    weekly_champions = query_all(conn, "SELECT * FROM weekly_champions ORDER BY week_id DESC")
    health_logs = query_all(conn, "SELECT * FROM system_health_logs ORDER BY log_id DESC")
    decisions = query_all(conn, "SELECT agent_id, COUNT(*) as calls, AVG(latency_ms) as avg_latency, SUM(tokens_in + tokens_out) as total_tokens FROM decisions GROUP BY agent_id")

    pm_map = {p["trade_id"]: p for p in postmortems}
    for t in trades:
        t["tp_list"] = json.loads(t.get("tp_json", "[]"))
        t["snapshot"] = json.loads(t.get("snapshot_json", "{}"))
        t["news_refs"] = json.loads(t.get("news_refs_json", "[]"))
        pm = pm_map.get(t["trade_id"])
        if pm:
            pm_copy = dict(pm)
            pm_copy["mistake_tags"] = json.loads(pm.get("mistake_tags", '["none"]'))
            t["postmortem"] = pm_copy

    for ds in daily_stats:
        ds["style_tags"] = json.loads(ds.get("style_tags_json", "[]"))

    for ce in consensus_events:
        ce["agents"] = json.loads(ce.get("agents_json", "[]"))

    decision_map = {d["agent_id"]: d for d in decisions}

    # Build Leaderboard summary per agent
    leaderboard = []
    for ag in agents:
        aid = ag["agent_id"]
        ag_runs = [r for r in runs if r["agent_id"] == aid]
        active_run = ag_runs[-1] if ag_runs else {"start_equity": 1000.0, "end_equity": 1000.0, "max_drawdown_pct": 0.0, "run_number": 1, "survival_days": 45}
        ag_trades = [t for t in trades if t["agent_id"] == aid]
        wins = [t for t in ag_trades if float(t["pnl_usd"]) > 0]
        losses = [t for t in ag_trades if float(t["pnl_usd"]) <= 0]
        gross_win = sum(float(t["pnl_usd"]) for t in wins)
        gross_loss = abs(sum(float(t["pnl_usd"]) for t in losses))
        pf = round(gross_win / max(gross_loss, 1.0), 2) if ag_trades else 1.0
        avg_rr = round(sum(float(t["r_multiple"]) for t in wins) / max(len(wins), 1), 2)
        current_eq = float(active_run["end_equity"])
        current_pnl = round(current_eq - 1000.0, 2)
        lifetime_pnl = round(sum(float(r["end_equity"]) - float(r["start_equity"]) for r in ag_runs), 2)
        wr = round((len(wins) / max(len(ag_trades), 1)) * 100.0, 1)
        expectancy_r = round(sum(float(t["r_multiple"]) for t in ag_trades) / max(len(ag_trades), 1), 2)
        expectancy_usd = round(sum(float(t["pnl_usd"]) for t in ag_trades) / max(len(ag_trades), 1), 2)
        dec_stat = decision_map.get(aid, {"calls": len(ag_trades), "avg_latency": 420, "total_tokens": len(ag_trades) * 1100})

        leaderboard.append({
            **ag,
            "current_run_number": active_run["run_number"],
            "initial_equity": 1000.0,
            "current_equity": current_eq,
            "net_pnl_usd": current_pnl,
            "net_pnl_pct": round((current_pnl / 1000.0) * 100.0, 2),
            "lifetime_pnl_usd": lifetime_pnl,
            "win_rate": wr,
            "profit_factor": pf,
            "avg_rr": avg_rr,
            "expectancy_r": expectancy_r,
            "expectancy_usd": expectancy_usd,
            "max_drawdown_pct": float(active_run["max_drawdown_pct"]),
            "total_trades": len(ag_trades),
            "wins_count": len(wins),
            "losses_count": len(losses),
            "survival_days": int(active_run.get("survival_days", 45)),
            "api_calls": int(dec_stat.get("calls") or len(ag_trades)),
            "avg_latency_ms": int(dec_stat.get("avg_latency") or 420),
            "total_tokens": int(dec_stat.get("total_tokens") or 0),
        })

    leaderboard.sort(key=lambda x: x["net_pnl_usd"], reverse=True)
    for rank_idx, item in enumerate(leaderboard, start=1):
        item["rank"] = rank_idx

    return {
        "brand": {
            "name": "Startify",
            "symbol": "XAUUSD",
            "initial_equity": 1000.0,
            "primary_color": "#00adff",
            "currency_news_filter": "USD ONLY",
            "last_updated": "2026-11-15T21:00:00Z",
        },
        "leaderboard": leaderboard,
        "account_runs": runs,
        "daily_stats": daily_stats,
        "trades": trades,
        "shadow_trades": shadow_trades,
        "playbooks": playbooks,
        "consensus_events": consensus_events,
        "news_events": news_events,
        "weekly_champions": weekly_champions,
        "health_logs": health_logs,
    }


if __name__ == "__main__":
    out_json = BASE_DIR / "web" / "src" / "data" / "arenaSnapshot.json"
    data = seed_arena_database(out_json)
    print(f"Seeded Startify DB & exported {len(data['trades'])} trades across {len(data['leaderboard'])} accounts.")
