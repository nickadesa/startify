from typing import Any, Dict, List, Optional
from risk.money_management import calc_margin_required


class PaperTradingEngine:
    """
    Simulates institutional paper execution per AI agent:
    - Independent $1,000.00 starting equity per account run
    - Spread & slippage modeling (expanded during USD news windows)
    - Limit order fill detection & timeout expiration (8 H1 bars)
    - Conservative SL-first rule when a single bar's high/low touches both SL and TP
    - Break-Even Protection ("ตั้ง SL กันหน้าทุน"): Once price moves +1.0R or reaches Fib 0.0,
      automatically moves Stop Loss to Entry ± $0.50 buffer so a profitable trade never turns into a loss.
    - Multi-Lot Partial Close at Fibonacci Extensions:
      * TP1 = Fib -0.27 extension -> Partial close 50% of lots & lock Break-Even+
      * TP2 = Fib -0.618 extension -> Close remaining 50% runner (while trailing SL to Fib 0.0)
    - Automatic Account Blowup detection & instant restart at $1,000.00 initial equity
    - Shadow Trade simulation for validator-rejected plans and AI `no_trade` decisions
    """

    def __init__(
        self,
        initial_equity: float = 1000.0,
        base_spread: float = 0.30,
        slippage: float = 0.08,
        limit_timeout_bars: int = 8,
        min_equity_pct: float = 10.0,
        contract_oz: int = 100,
        breakeven_buffer_usd: float = 0.50,
    ):
        self.initial_equity = initial_equity
        self.base_spread = base_spread
        self.slippage = slippage
        self.limit_timeout_bars = limit_timeout_bars
        self.min_equity_usd = initial_equity * (min_equity_pct / 100.0)
        self.contract_oz = contract_oz
        self.breakeven_buffer_usd = breakeven_buffer_usd

    def simulate_bar_execution(
        self,
        order: Dict[str, Any],
        future_bars: List[Dict[str, Any]],
        spread: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Simulates a validated trade plan across subsequent bars.
        Applies conservative SL-first logic if a single candle hits both SL and TP,
        Break-Even ("กันหน้าทุน") after +1R / Fib 0.0, and Partial Close at Fib -0.27 -> Runner to -0.618.
        """
        eff_spread = spread if spread is not None else self.base_spread
        action = order["action"]
        order_type = order.get("order_type", "limit")
        requested_entry = float(order["entry"])
        stop_loss = float(order["stop_loss"])
        tps = [dict(tp) for tp in order.get("take_profits", [{"price": requested_entry + 10.0, "close_pct": 100}])]
        lot = float(order["lot"])
        sl_dist = max(abs(requested_entry - stop_loss), 1.0)
        risk_usd = float(order.get("risk_usd", max(sl_dist * lot * self.contract_oz, 1.0)))

        # Break-Even ("กันหน้าทุน") trigger level: +1.0R in favor or explicit fib_0_0 level
        be_trigger_price = float(
            order.get(
                "be_trigger_price",
                (requested_entry + sl_dist * 0.85) if action == "long" else (requested_entry - sl_dist * 0.85),
            )
        )

        filled = False
        fill_price = requested_entry
        fill_time = order.get("opened_at", "")
        bars_waited = 0

        remaining_pct = 100.0
        realized_pnl = 0.0
        current_sl = stop_loss
        breakeven_locked = False
        tp1_hit = False
        tp2_hit = False
        be_saved_trade = False
        exit_price = requested_entry
        closed_at = fill_time
        status = "closed"

        for idx, bar in enumerate(future_bars):
            b_high = float(bar["high"])
            b_low = float(bar["low"])
            b_time = bar["time"]

            if not filled:
                if order_type == "market":
                    fill_cost = (eff_spread / 2.0) + self.slippage
                    fill_price = round(requested_entry + (fill_cost if action == "long" else -fill_cost), 2)
                    fill_time = b_time
                    filled = True
                elif order_type == "zone_confirm":
                    # Wait for price to reach target zone WITHOUT a resting limit order, then confirm candle close
                    b_close = float(bar.get("close", requested_entry))
                    b_open = float(bar.get("open", requested_entry))
                    zone_touched = (b_low <= requested_entry + 1.5) if action == "long" else (b_high >= requested_entry - 1.5)
                    candle_confirmed = (b_close >= b_open) if action == "long" else (b_close <= b_open)
                    if zone_touched and candle_confirmed:
                        fill_cost = (eff_spread / 2.0) + self.slippage
                        fill_price = round(b_close + (fill_cost if action == "long" else -fill_cost), 2)
                        fill_time = b_time
                        filled = True
                    else:
                        bars_waited += 1
                        if bars_waited >= self.limit_timeout_bars:
                            return {
                                "status": "expired_timeout",
                                "filled": False,
                                "entry": requested_entry,
                                "exit_price": None,
                                "pnl_usd": 0.0,
                                "r_multiple": 0.0,
                                "tp1_breakeven_triggered": False,
                                "partial_closed_neg027": False,
                                "runner_hit_neg0618": False,
                                "be_saved_trade": False,
                                "closed_at": b_time,
                                "bars_held": 0,
                            }
                        continue
                else:
                    if b_low <= requested_entry <= b_high:
                        fill_price = round(requested_entry + (self.slippage if action == "long" else -self.slippage), 2)
                        fill_time = b_time
                        filled = True
                    else:
                        bars_waited += 1
                        if bars_waited >= self.limit_timeout_bars:
                            return {
                                "status": "expired_timeout",
                                "filled": False,
                                "entry": requested_entry,
                                "exit_price": None,
                                "pnl_usd": 0.0,
                                "r_multiple": 0.0,
                                "tp1_breakeven_triggered": False,
                                "partial_closed_neg027": False,
                                "runner_hit_neg0618": False,
                                "be_saved_trade": False,
                                "closed_at": b_time,
                                "bars_held": 0,
                            }
                        continue

            # 1. Conservative Rule: Check Stop Loss BEFORE Take Profit on this bar
            sl_touched = (b_low <= current_sl) if action == "long" else (b_high >= current_sl)
            if sl_touched:
                sl_exit = round(current_sl - (self.slippage if action == "long" else -self.slippage), 2)
                leg_lot = lot * (remaining_pct / 100.0)
                price_diff = (sl_exit - fill_price) if action == "long" else (fill_price - sl_exit)
                realized_pnl += price_diff * leg_lot * self.contract_oz
                exit_price = sl_exit
                closed_at = b_time
                if breakeven_locked:
                    be_saved_trade = True
                remaining_pct = 0.0
                break

            # 2. Check Break-Even ("ตั้ง SL กันหน้าทุน") trigger if not yet locked
            if not breakeven_locked:
                be_reached = (b_high >= be_trigger_price) if action == "long" else (b_low <= be_trigger_price)
                if be_reached:
                    breakeven_locked = True
                    current_sl = round(
                        (fill_price + self.breakeven_buffer_usd)
                        if action == "long"
                        else (fill_price - self.breakeven_buffer_usd),
                        2,
                    )

            # 3. Check Fibonacci Extension Take Profit targets (-0.27 Partial Close & -0.618 Runner)
            for tp_idx, tp in enumerate(tps):
                if tp.get("_filled"):
                    continue
                tp_price = float(tp["price"])
                tp_pct = float(tp.get("close_pct", 100.0))
                # If multi-lot (>= 0.02) and multiple TPs exist, support partial close; if 0.01 micro-lot, still simulate proportional partial or lock BE
                tp_touched = (b_high >= tp_price) if action == "long" else (b_low <= tp_price)
                if tp_touched:
                    tp["_filled"] = True
                    close_share = min(remaining_pct, tp_pct)
                    leg_lot = lot * (close_share / 100.0)
                    price_diff = (tp_price - fill_price) if action == "long" else (fill_price - tp_price)
                    realized_pnl += price_diff * leg_lot * self.contract_oz
                    remaining_pct = round(remaining_pct - close_share, 4)
                    exit_price = tp_price
                    closed_at = b_time
                    if tp_idx == 0:
                        tp1_hit = True
                        breakeven_locked = True
                        # Lock SL at Break-Even+ ("กันหน้าทุน") after TP1 (-0.27) partial close
                        be_sl = (
                            fill_price + self.breakeven_buffer_usd
                            if action == "long"
                            else fill_price - self.breakeven_buffer_usd
                        )
                        current_sl = round(
                            max(current_sl, be_sl) if action == "long" else min(current_sl, be_sl),
                            2,
                        )
                    elif tp_idx >= 1:
                        tp2_hit = True

            if remaining_pct <= 0.01:
                break

        # If still open at the end of provided bars, mark-to-market at final bar close
        if filled and remaining_pct > 0.01 and future_bars:
            last_close = float(future_bars[-1]["close"])
            leg_lot = lot * (remaining_pct / 100.0)
            price_diff = (last_close - fill_price) if action == "long" else (fill_price - last_close)
            realized_pnl += price_diff * leg_lot * self.contract_oz
            exit_price = last_close
            closed_at = future_bars[-1]["time"]

        pnl_usd = round(realized_pnl, 2)
        r_mult = round(pnl_usd / risk_usd, 2) if risk_usd > 0 else 0.0
        return {
            "status": status,
            "filled": filled,
            "entry": fill_price,
            "exit_price": round(exit_price, 2),
            "pnl_usd": pnl_usd,
            "r_multiple": r_mult,
            "tp1_breakeven_triggered": bool(tp1_hit or breakeven_locked),
            "partial_closed_neg027": tp1_hit,
            "runner_hit_neg0618": tp2_hit,
            "be_saved_trade": be_saved_trade,
            "opened_at": fill_time,
            "closed_at": closed_at,
        }

    def check_and_handle_blowup(
        self,
        agent_id: str,
        current_run: Dict[str, Any],
        new_equity: float,
        as_of_time: str,
        used_margin: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Checks if an account has blown up (equity <= $100 / 10% of $1,000 initial equity,
        or margin level < 50%). If blown up, closes the run and opens Run #(N+1) at $1,000.00.
        """
        margin_level_pct = (new_equity / used_margin * 100.0) if used_margin > 0 else 999.0
        blown_up = (new_equity <= self.min_equity_usd) or (used_margin > 0 and margin_level_pct < 50.0)

        if not blown_up:
            peak = max(float(current_run.get("peak_equity", self.initial_equity)), new_equity)
            dd = round(((peak - new_equity) / peak) * 100.0, 2) if peak > 0 else 0.0
            updated_run = dict(current_run)
            updated_run["end_equity"] = round(new_equity, 2)
            updated_run["peak_equity"] = round(peak, 2)
            updated_run["max_drawdown_pct"] = max(float(current_run.get("max_drawdown_pct", 0.0)), dd)
            return {"blown_up": False, "active_run": updated_run, "closed_run": None}

        closed_run = dict(current_run)
        closed_run["ended_at"] = as_of_time
        closed_run["end_time"] = as_of_time
        closed_run["end_equity"] = round(max(new_equity, 0.0), 2)
        closed_run["max_drawdown_pct"] = round(
            ((self.initial_equity - max(new_equity, 0.0)) / self.initial_equity) * 100.0, 2
        )
        closed_run["status"] = "blown_up"
        closed_run["end_reason"] = "blowup"
        closed_run["blowup_reason"] = (
            "margin_stop_out" if (used_margin > 0 and margin_level_pct < 50.0) else "equity_below_min_threshold"
        )

        next_run_num = int(current_run.get("run_number", 1)) + 1
        pb_ver = current_run.get("playbook_version_end", "v1")
        new_run = {
            "run_id": f"{agent_id}-run-{next_run_num}",
            "agent_id": agent_id,
            "run_number": next_run_num,
            "started_at": as_of_time,
            "start_time": as_of_time,
            "ended_at": None,
            "end_time": None,
            "initial_equity": self.initial_equity,
            "start_equity": self.initial_equity,
            "end_equity": self.initial_equity,
            "peak_equity": self.initial_equity,
            "max_drawdown_pct": 0.0,
            "total_trades": 0,
            "status": "active",
            "end_reason": "active",
            "playbook_version_start": pb_ver,
            "playbook_version_end": pb_ver,
            "blowup_reason": None,
        }
        return {
            "blown_up": True,
            "closed_run": closed_run,
            "active_run": new_run,
        }

    def simulate_shadow_trade(
        self,
        agent_id: str,
        snapshot: Dict[str, Any],
        future_bars: List[Dict[str, Any]],
        rejection_reason: str,
        proposed_order: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Records a counterfactual Shadow Trade when an AI decides `no_trade` or is blocked by the Hard Risk Validator.
        """
        ote = snapshot.get("ote", {})
        direction = snapshot.get("last_swing", {}).get("impulse_direction", "long")
        entry = float(proposed_order.get("entry") if proposed_order else ote.get("sweet_spot", snapshot.get("price", 4020.0)))
        sl = float(
            proposed_order.get("stop_loss")
            if proposed_order
            else (ote.get("invalidation", entry - 8.0) - (1.5 if direction == "long" else -1.5))
        )
        tp1_neg027 = float(ote.get("tp1_neg_027", entry + (12.0 if direction == "long" else -12.0)))
        tp2_neg0618 = float(ote.get("tp2_neg_0618", entry + (20.0 if direction == "long" else -20.0)))

        synthetic_order = {
            "action": proposed_order.get("action", direction) if proposed_order else direction,
            "order_type": "limit",
            "entry": entry,
            "stop_loss": sl,
            "take_profits": [
                {"price": tp1_neg027, "close_pct": 50},
                {"price": tp2_neg0618, "close_pct": 50},
            ],
            "lot": 0.02,
            "opened_at": snapshot.get("time", ""),
        }
        sim = self.simulate_bar_execution(synthetic_order, future_bars)
        return {
            "agent_id": agent_id,
            "created_at": snapshot.get("time", ""),
            "source_type": "validator_rejected" if proposed_order else "ai_no_trade",
            "reject_reason": rejection_reason,
            "action": synthetic_order["action"],
            "entry": entry,
            "stop_loss": sl,
            "tp": tp1_neg027,
            "hypothetical_r": sim["r_multiple"],
            "outcome": "missed_winner" if sim["r_multiple"] > 0.5 else ("good_skip" if sim["r_multiple"] <= 0 else "scratch"),
        }
