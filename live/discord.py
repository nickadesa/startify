"""Lightweight Discord webhook notifier for the live arena (stdlib only, non-blocking)."""
from __future__ import annotations

import json
import os
import threading
import urllib.request
from typing import Any, Dict, List, Optional


def _hex_to_int(hex_color: str, default: int = 0x2F5BFF) -> int:
    s = (hex_color or "").strip().lstrip("#")
    try:
        return int(s, 16)
    except ValueError:
        return default


def _post_async(url: str, payload: Dict[str, Any]) -> None:
    def _send() -> None:
        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json", "User-Agent": "Startify/3.0"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=6) as resp:
                resp.read()
        except Exception as e:
            print("discord webhook error:", repr(e), flush=True)

    threading.Thread(target=_send, daemon=True, name="discord-webhook").start()


def send_embed(
    env_name: str,
    agent: Dict[str, Any],
    description: str,
    fields: Optional[List[Dict[str, Any]]] = None,
    ts: Optional[str] = None,
    footer: Optional[str] = None,
) -> bool:
    url = os.getenv(env_name, "").strip()
    if not url:
        return False

    embed: Dict[str, Any] = {
        "title": agent.get("display_name") or agent.get("short_name") or agent.get("agent_id", "AI"),
        "description": description,
        "color": _hex_to_int(agent.get("color", "")),
        "footer": {"text": footer or f"Startify · XAUUSD · {agent.get('provider', '')}".strip(" ·")},
    }
    if fields:
        embed["fields"] = fields
    if ts:
        embed["timestamp"] = ts

    _post_async(url, {"username": "Startify Arena", "embeds": [embed]})
    return True


def notify_trade_open(agent: Dict[str, Any], trade: Dict[str, Any], ts: str) -> bool:
    rr = abs(trade["tp"] - trade["entry"]) / max(0.01, abs(trade["entry"] - trade["sl"]))
    desc = f"**OPEN {trade['side']}** `{trade['lots']} lot` **XAUUSD**\n{trade.get('thesis', '')}"
    fields = [
        {"name": "Entry", "value": f"`{trade['entry']}`", "inline": True},
        {"name": "SL / TP", "value": f"`{trade['sl']}` / `{trade['tp']}` ({rr:.1f}R)", "inline": True},
        {"name": "Session / Mode", "value": f"{trade.get('session', '-')} · `{trade.get('mode', 'rules')}`", "inline": True},
    ]
    return send_embed("DISCORD_WEBHOOK_LIVE_TRADES", agent, desc, fields, ts)


def notify_trade_close(
    agent: Dict[str, Any],
    trade: Dict[str, Any],
    account: Dict[str, Any],
    journal_entry: Optional[Dict[str, Any]],
    ts: str,
) -> bool:
    sign = "+" if trade["pnl"] > 0 else ""
    r_sign = "+" if trade["r_multiple"] > 0 else ""
    desc = (
        f"**CLOSED {trade['side']}** ({trade.get('exit_reason', '-')}) · "
        f"**{sign}${trade['pnl']:.2f}** (`{r_sign}{trade['r_multiple']:.2f}R`)"
    )
    fields = [
        {"name": "Fill", "value": f"`{trade['entry']}` → `{trade['exit']}`", "inline": True},
        {"name": "Equity", "value": f"`${account['equity']:,.2f}`", "inline": True},
        {"name": "Lots", "value": f"`{trade['lots']}`", "inline": True},
    ]
    if journal_entry:
        if journal_entry.get("review"):
            fields.append({"name": "Review", "value": journal_entry["review"][:500], "inline": False})
        if journal_entry.get("lesson"):
            fields.append({"name": "Lesson", "value": journal_entry["lesson"][:300], "inline": False})
    return send_embed("DISCORD_WEBHOOK_LIVE_TRADES", agent, desc, fields, ts)


def notify_chat(agent: Dict[str, Any], text: str, ts: str, reply_preview: Optional[str] = None) -> bool:
    desc = f"> {reply_preview[:140]}\n\n{text}" if reply_preview else text
    return send_embed("DISCORD_WEBHOOK_GROKBOT", agent, desc, None, ts, footer=f"AI Floor · {agent.get('style_archetype', '')}")
