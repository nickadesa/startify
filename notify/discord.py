import json
import os
import urllib.request
from typing import Any, Dict, List, Optional


class DiscordNotifier:
    """
    Routes rich Discord embeds to dedicated per-AI channels (`ai-1-signals` .. `ai-8-signals`),
    `consensus`, `weekly-report`, and `system-log`.
    Operates safely in dry-run mode when webhook URLs are not configured in `.env`.
    """

    WEBHOOK_ENV_MAP = {
        "ai-1": "DISCORD_WEBHOOK_AI1",
        "ai-2": "DISCORD_WEBHOOK_AI2",
        "ai-3": "DISCORD_WEBHOOK_AI3",
        "ai-4": "DISCORD_WEBHOOK_AI4",
        "ai-5": "DISCORD_WEBHOOK_AI5",
        "ai-6": "DISCORD_WEBHOOK_AI6",
        "ai-7": "DISCORD_WEBHOOK_AI7",
        "ai-8": "DISCORD_WEBHOOK_AI8",
        "consensus": "DISCORD_WEBHOOK_CONSENSUS",
        "weekly-report": "DISCORD_WEBHOOK_WEEKLY_REPORT",
        "system-log": "DISCORD_WEBHOOK_SYSTEM_LOG",
    }

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.sent_History: List[Dict[str, Any]] = []

    def build_signal_embed(self, agent_name: str, plan: Dict[str, Any], equity: float) -> Dict[str, Any]:
        color = 0x00ADFF if plan.get("action") == "long" else 0xEF4444
        tps_str = ", ".join(f"${float(t['price']):.2f} ({t.get('close_pct', 50)}%)" for t in plan.get("take_profits", []))
        return {
            "username": f"Startify • {agent_name}",
            "embeds": [
                {
                    "title": f"XAUUSD {str(plan.get('action', '')).upper()} (Paper) — {agent_name}",
                    "color": color,
                    "fields": [
                        {"name": "Entry", "value": f"${float(plan.get('entry', 0)):.2f} ({plan.get('order_type', 'limit')})", "inline": True},
                        {"name": "Stop Loss", "value": f"${float(plan.get('stop_loss', 0)):.2f}", "inline": True},
                        {"name": "Take Profits", "value": tps_str or "N/A", "inline": True},
                        {"name": "Lot / Risk", "value": f"{plan.get('lot', 0.01)} lot / {plan.get('risk_pct', 1.0)}%", "inline": True},
                        {"name": "Confidence", "value": f"{float(plan.get('confidence', 0.75)):.0%}", "inline": True},
                        {"name": "Style Tag", "value": str(plan.get("style_tag", "OTE")), "inline": True},
                        {"name": "Reasoning", "value": str(plan.get("reasoning", ""))[:1000]},
                        {"name": "Invalid If", "value": str(plan.get("invalid_if", ""))[:500]},
                    ],
                    "footer": {"text": f"Startify Paper Equity: ${equity:,.2f} | Paper Trading Only — Not Financial Advice"},
                }
            ],
        }

    def send_signal(self, channel_key: str, agent_name: str, plan: Dict[str, Any], equity: float) -> Dict[str, Any]:
        payload = self.build_signal_embed(agent_name, plan, equity)
        return self._dispatch(channel_key, payload)

    def send_consensus_alert(self, consensus_event: Dict[str, Any]) -> Dict[str, Any]:
        agents_str = ", ".join(consensus_event.get("agents", []))
        payload = {
            "username": "Startify • Consensus Detector",
            "embeds": [
                {
                    "title": f"⚡ MULTI-AI CONSENSUS SIGNAL: XAUUSD {consensus_event['direction'].upper()}",
                    "color": 0x00ADFF,
                    "fields": [
                        {"name": "Agreeing AIs", "value": f"{consensus_event['agreeing_count']}/{consensus_event['total_active_agents']} ({agents_str})", "inline": False},
                        {"name": "Entry Band", "value": consensus_event["entry_range"], "inline": True},
                        {"name": "SL Band", "value": consensus_event["sl_range"], "inline": True},
                        {"name": "TP Band", "value": consensus_event["tp_range"], "inline": True},
                        {"name": "Avg Confidence", "value": f"{consensus_event['avg_confidence']:.0%}", "inline": True},
                    ],
                    "footer": {"text": "Startify Uncorrelated Multi-AI Consensus • Paper Trading"},
                }
            ],
        }
        return self._dispatch("consensus", payload)

    def _dispatch(self, channel_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        env_var = self.WEBHOOK_ENV_MAP.get(channel_key, "")
        webhook_url = os.environ.get(env_var, "").strip() if env_var else ""
        record = {"channel": channel_key, "payload": payload, "delivered": False}

        if not self.dry_run and webhook_url:
            try:
                req = urllib.request.Request(
                    webhook_url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json", "User-Agent": "Startify-Bot/2.0"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=8) as resp:
                    record["delivered"] = 200 <= resp.status < 300
            except Exception as e:
                record["error"] = str(e)

        self.sent_History.append(record)
        return record
