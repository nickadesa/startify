import math
from typing import Any, Dict, List, Tuple


def calc_lot(
    equity: float,
    risk_pct: float,
    entry: float,
    stop_loss: float,
    contract_oz: int = 100,
    lot_step: float = 0.01,
    min_lot: float = 0.01,
    max_lot: float = 1.0,
) -> Tuple[float, float]:
    """
    Calculates position size in lots rounded DOWN to `lot_step`, along with actual USD risk.
    """
    risk_usd = equity * (risk_pct / 100.0)
    sl_distance = abs(entry - stop_loss)
    if sl_distance <= 0 or equity <= 0 or risk_pct <= 0:
        return 0.0, 0.0

    raw_lot = risk_usd / (sl_distance * contract_oz)
    lot = math.floor((raw_lot + 1e-9) / lot_step) * lot_step
    lot = round(min(lot, max_lot), 4)
    if lot < min_lot:
        return 0.0, 0.0

    actual_risk = round(lot * contract_oz * sl_distance, 2)
    return round(lot, 3), actual_risk


def calc_margin_required(lot: float, entry_price: float, contract_oz: int = 100, leverage: int = 100) -> float:
    if lot <= 0 or leverage <= 0:
        return 0.0
    return round((lot * contract_oz * entry_price) / float(leverage), 2)


def calc_weighted_rr(entry: float, stop_loss: float, take_profits: List[Dict[str, Any]], action: str) -> float:
    sl_dist = abs(entry - stop_loss)
    if sl_dist <= 0 or not take_profits:
        return 0.0

    total_pct = sum(float(tp.get("close_pct", 0)) for tp in take_profits)
    if total_pct <= 0:
        return 0.0

    weighted_reward = 0.0
    for tp in take_profits:
        tp_price = float(tp.get("price", 0.0))
        weight = float(tp.get("close_pct", 0.0)) / total_pct
        reward_dist = (tp_price - entry) if action == "long" else (entry - tp_price)
        if reward_dist <= 0:
            return -1.0
        weighted_reward += reward_dist * weight

    return round(weighted_reward / sl_dist, 2)
