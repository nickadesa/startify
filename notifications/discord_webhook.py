import json
import os
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from data.price_provider import load_dotenv_if_present


class DiscordNotifier:
    """
    Sends compact, high-hierarchy Discord Embed alerts with optional PNG chart attachments
    for Startify XAUUSD Desk signals, Break-Even locks, and USD macro alerts.
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
        footer: str = "Startify Quant Desk • $1,000 Portfolio",
        image_bytes: Optional[bytes] = None,
        image_filename: str = "xauusd_setup.png",
    ) -> Dict[str, Any]:
        if not self.is_configured():
            return {"sent": False, "reason": "DISCORD_WEBHOOK_URL not configured"}

        embed: Dict[str, Any] = {
            "title": title,
            "description": description,
            "color": color,
            "fields": fields or [],
            "footer": {"text": footer},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if image_bytes:
            embed["image"] = {"url": f"attachment://{image_filename}"}

        payload = {
            "username": "Startify Quant Desk",
            "embeds": [embed],
        }

        if image_bytes:
            boundary = f"----StartifyBoundary{uuid.uuid4().hex}"
            parts = [
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="payload_json"\r\n'
                f"Content-Type: application/json\r\n\r\n"
                f"{json.dumps(payload)}\r\n".encode("utf-8"),
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="files[0]"; filename="{image_filename}"\r\n'
                f"Content-Type: image/png\r\n\r\n".encode("utf-8")
                + image_bytes
                + b"\r\n",
                f"--{boundary}--\r\n".encode("utf-8"),
            ]
            body = b"".join(parts)
            content_type = f"multipart/form-data; boundary={boundary}"
        else:
            body = json.dumps(payload).encode("utf-8")
            content_type = "application/json"

        req = urllib.request.Request(
            self.webhook_url,
            data=body,
            headers={
                "Content-Type": content_type,
                "User-Agent": "Startify-XAUUSD-Desk/3.1",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                return {"sent": True, "status": resp.status, "has_chart": bool(image_bytes)}
        except Exception as exc:
            return {"sent": False, "reason": str(exc)}

    def send_entry_signal(
        self,
        signal: Dict[str, Any],
        chart_png: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        side = str(signal.get("direction", "long")).upper()
        mode = str(signal.get("execution_mode", "limit")).upper()
        color = 0x30D158 if side == "LONG" else 0xFF453A

        entry = float(signal.get("entry", 0.0))
        sl = float(signal.get("stop_loss", 0.0))
        tp1 = float(signal.get("tp1", 0.0))
        tp2 = float(signal.get("tp2", 0.0))
        tp3 = float(signal.get("tp3", 0.0))
        lot = float(signal.get("lot", 0.01))
        risk_pct = float(signal.get("risk_pct", 0.5))
        risk_usd = float(signal.get("risk_usd", 5.0))
        score = int(signal.get("conviction_score", 0))

        votes = signal.get("specialist_votes", [])
        aligned = signal.get("aligned_count")
        total = signal.get("total_specialists") or len(votes) or 8
        if aligned is None:
            aligned = sum(1 for v in votes if str(v.get("vote", "")).lower() in (side.lower(), "clear", "approved"))

        # Clean, scannable typographic hierarchy (no long per-model wall of text)
        description = (
            f"## {side} @ `${entry:,.2f}` · `{mode}`\n"
            f"**Conviction:** `{score}/100` (`{aligned}/{total}` Aligned) · "
            f"**Risk:** `${risk_usd:.2f}` (`{risk_pct}%`)\n"
            f"-# {signal.get('rationale', 'Fib OTE + Orderflow + FVG consensus')}"
        )

        fields = [
            {"name": "Entry", "value": f"**`${entry:,.2f}`**", "inline": True},
            {"name": "Stop Loss", "value": f"`${sl:,.2f}`", "inline": True},
            {"name": "Size ($1,000)", "value": f"`{lot:.2f} lot`", "inline": True},
            {"name": "TP1 (BE Lock)", "value": f"`${tp1:,.2f}`", "inline": True},
            {"name": "TP2 (-0.27)", "value": f"`${tp2:,.2f}`", "inline": True},
            {"name": "TP3 (-0.618)", "value": f"`${tp3:,.2f}`", "inline": True},
        ]

        return self.send_embed(
            title=f"XAUUSD {side} SIGNAL — {signal.get('setup_label', 'Fib OTE + Orderflow')}",
            description=description,
            color=color,
            fields=fields,
            footer="Startify Quant Desk • $1,000 Portfolio • USD Macro Clear",
            image_bytes=chart_png,
            image_filename="xauusd_setup.png",
        )

    def send_trade_update(self, event_type: str, trade_id: str, detail: str, pnl_usd: float = 0.0) -> Dict[str, Any]:
        color = 0x30D158 if pnl_usd >= 0 else 0xFF453A
        return self.send_embed(
            title=f"XAUUSD {event_type.upper()} — {trade_id}",
            description=f"### `{pnl_usd:+.2f} USD`\n{detail}",
            color=color,
        )
