import uuid
from typing import Any, Dict, List


class ConsensusDetector:
    """
    Detects uncorrelated Multi-AI Consensus when >= `min_agreeing_agents` independent AI models
    choose the same trade direction (`long` or `short`) within the same H1 bar window and
    within `max_entry_diff_usd` of each other.
    """

    def __init__(self, min_agreeing_agents: int = 3, max_entry_diff_usd: float = 5.0):
        self.min_agreeing_agents = min_agreeing_agents
        self.max_entry_diff_usd = max_entry_diff_usd

    def detect(self, time_iso: str, agent_plans: List[Dict[str, Any]], total_active_agents: int = 8) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        for direction in ("long", "short"):
            matching = [
                p for p in agent_plans
                if p.get("action") == direction and float(p.get("entry", 0.0)) > 0
            ]
            if len(matching) < self.min_agreeing_agents:
                continue

            # Find largest cluster of plans within max_entry_diff_usd
            matching_sorted = sorted(matching, key=lambda x: float(x["entry"]))
            best_cluster: List[Dict[str, Any]] = []
            for i, base_p in enumerate(matching_sorted):
                base_e = float(base_p["entry"])
                cluster = [
                    p for p in matching_sorted[i:]
                    if (float(p["entry"]) - base_e) <= self.max_entry_diff_usd
                ]
                if len(cluster) > len(best_cluster):
                    best_cluster = cluster

            if len(best_cluster) >= self.min_agreeing_agents:
                entries = [float(p["entry"]) for p in best_cluster]
                sls = [float(p["stop_loss"]) for p in best_cluster]
                tps = [
                    float(p["take_profits"][0]["price"])
                    for p in best_cluster
                    if p.get("take_profits")
                ]
                avg_conf = sum(float(p.get("confidence", 0.75)) for p in best_cluster) / len(best_cluster)
                events.append({
                    "event_id": f"cons-{uuid.uuid4().hex[:8]}",
                    "time": time_iso,
                    "direction": direction,
                    "agreeing_count": len(best_cluster),
                    "total_active_agents": total_active_agents,
                    "agents": [p.get("agent_id", "") for p in best_cluster],
                    "entry_range": f"${min(entries):.2f} - ${max(entries):.2f}",
                    "sl_range": f"${min(sls):.2f} - ${max(sls):.2f}",
                    "tp_range": f"${min(tps):.2f} - ${max(tps):.2f}" if tps else "N/A",
                    "avg_entry": round(sum(entries) / len(entries), 2),
                    "avg_sl": round(sum(sls) / len(sls), 2),
                    "avg_tp": round(sum(tps) / len(tps), 2) if tps else 0.0,
                    "avg_confidence": round(avg_conf, 2),
                })
        return events
