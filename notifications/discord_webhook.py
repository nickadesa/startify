import json
import os
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from data.price_provider import load_dotenv_if_present


class DiscordNotifier:
    """
    Sends rich Discord Embed alerts for Startify XAUUSD Desk signals,
    Break-Even ("กันหน้าทุน") updates, partial closes, and USD macro blackouts.
    """

    def __init__(self, webhook_url: Optional[str] = None):
        load_dotenv_if_present()
        self.webhook_url = (webhook_url or os.environ.get("DISCORD_WEBHOOK_URL", "")).strip()

    def is_configured(self) -> bool:
        return bool(self.webhook_url and self.webhook_url.startswith("https://discord.com/api/webhooks/"))

    def send_embed(
        self,
        title: str,
        description: str,
        color: int = 0x00ADFF,
        fields: Optional[List[Dict[str, Any]]] = None,
        footer: str = "Startify XAUUSD 8-AI Desk • $1,000 Portfolio",
    ) -> Dict[str, Any]:
        if not self.is_configured():
            return {"sent": False, "reason": "DISCORD_WEBHOOK_URL not configured"}

        payload = {
            "username": "Startify Quant Desk",
            "embeds": [
                {
                    "title": title,
                    "description": description,
                    "color": color,
                    "fields": fields or [],
                    "footer": {"text": footer},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ],
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.webhook_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Startify-XAUUSD-Desk/3.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return {"sent": True, "status": resp.status}
        except Exception as exc:
            return {"sent": False, "reason": str(exc)}

    def send_entry_signal(self, signal: Dict[str, Any]) -> Dict[str, Any]:
        side = str(signal.get("direction", "long")).upper()
        color = 0x30D158 if side == "LONG" else 0xFF453A
        votes = signal.get("specialist_votes", [])
        vote_summary = "\n".join(
            f"• **{v.get('display_name', 'AI')}** ({v.get('role') or v.get('role_title') or v.get('role_code', 'Specialist')}): `{str(v.get('vote', 'wait')).upper()}` ({v.get('confidence', 0)}%)"
            for v in votes[:8]
        )
        fields = [
            {"name": "Direction & Mode", "value": f"**{side}** (`{signal.get('execution_mode', 'limit')}`)", "inline": True},
            {"name": "Entry Price", "value": f"`${float(signal.get('entry', 0)):.2f}`", "inline": True},
            {"name": "Stop Loss", "value": f"`${float(signal.get('stop_loss', 0)):.2f}`", "inline": True},
            {"name": "TP1 (ATR + BE)", "value": f"`${float(signal.get('tp1', 0)):.2f}`", "inline": True},
            {"name": "TP2 (Fib -0.27)", "value": f"`${float(signal.get('tp2', 0)):.2f}`", "inline": True},
            {"name": "TP3 (Fib -0.618)", "value": f"`${float(signal.get('tp3', 0)):.2f}`", "inline": True},
            {"name": "Lot / Risk ($1,000)", "value": f"`{signal.get('lot', 0.01)} lot` ({signal.get('risk_pct', 0.5)}%)", "inline": True},
            {"name": "Desk Conviction", "value": f"`{signal.get('conviction_score', 0)}/100`", "inline": True},
            {"name": "8-AI Specialist Votes", "value": vote_summary or "Consensus approved", "inline": False},
        ]
        return self.send_embed(
            title=f"XAUUSD {side} SIGNAL — {signal.get('setup_label', 'Fib OTE 0.79 + Orderflow')}",
            description=signal.get("rationale", "8-AI specialized desk consensus approved."),
            color=color,
            fields=fields,
        )

    def send_trade_update(self, event_type: str, trade_id: str, detail: str, pnl_usd: float = 0.0) -> Dict[str, Any]:
        color = 0x30D158 if pnl_usd >= 0 else 0xFF453A
        return self.send_embed(
            title=f"XAUUSD {event_type.upper()} — {trade_id}",
            description=detail,
            color=color,
            fields=[{"name": "Realized P&L", "value": f"`{pnl_usd:+.2f} USD`", "inline": True}],
        )
