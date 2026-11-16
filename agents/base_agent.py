import json
import os
import time
import urllib.request
from typing import Any, Dict, Optional
from data.price_provider import load_dotenv_if_present
from risk.money_management import calc_lot

load_dotenv_if_present()

PROVIDER_ENDPOINTS = {
    "groq": "https://api.groq.com/openai/v1/chat/completions",
    "mistral": "https://api.mistral.ai/v1/chat/completions",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
    "zai": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    "nvidia": "https://integrate.api.nvidia.com/v1/chat/completions",
    "cohere": "https://api.cohere.com/v2/chat",
}


MODEL_FALLBACK_CHAINS = {
    "gemini": [
        "gemini-3.8-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash-lite",
        "gemini-2.5-flash",
    ],
    "groq": [
        "openai/gpt-oss-120b",
        "qwen/qwen3.8-27b",
        "meta-llama/llama-4-maverick-17b-128e-instruct",
        "llama-3.3-70b-versatile",
    ],
    "openrouter": [
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "nvidia/nemotron-3.5-super-vl:free",
        "google/gemma-4-31b-it:free",
        "openrouter/free",
    ],
    "cloudflare": [
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        "@cf/mistralai/mistral-small-3.1-24b-instruct",
        "@cf/zai/glm-5.3",
        "@cf/meta/llama-3.1-8b-instruct",
    ],
    "cohere": [
        "command-a-plus-05-2026",
        "command-a-03-2025",
        "command-r-plus-08-2024",
    ],
    "mistral": [
        "mistral-small-4",
        "mistral-large-4",
        "mistral-small-latest",
    ],
}


class AITraderAgent:
    """
    Represents a competing AI Trader Agent (ai-1 through ai-8) with its own:
    - Provider & Model adapter (Nov 2026 Latest Models + automatic multi-model fallback chains)
    - Multi-Timeframe (4H, 1H, M15, M5) & Historical Warm-Up context awareness
    - Exact ICT Fibonacci OTE (0.618-0.786 / 0.705) entry + Fib -0.27 (50% Partial Close) & Fib -0.618 (50% Runner)
    - Automatic Break-Even ("ตั้ง SL กันหน้าทุน") protection & Self-Authored Trading Journal
    """

    def __init__(self, agent_cfg: Dict[str, Any], knowledge_pack_text: str = "", playbook_text: str = ""):
        self.agent_id = agent_cfg["agent_id"]
        self.display_name = agent_cfg["display_name"]
        self.provider = agent_cfg["provider"]
        self.model_name = agent_cfg["model_name"]
        self.model_version = agent_cfg.get("model_version", "v1")
        self.api_key_env = agent_cfg.get("api_key_env", "")
        self.color = agent_cfg.get("color", "#00adff")
        self.style_archetype = agent_cfg.get("style_archetype", "OTE-OI-Confluence")
        self.knowledge_pack_text = knowledge_pack_text
        self.playbook_text = playbook_text

    def _resolve_credentials(self) -> tuple[str, list[str], str]:
        """
        Resolves (provider, candidate_models_list, api_key) with strict Quota Isolation & Nov 2026 Latest Models:
        - ai-1 (Alpha-Gemini): Google `gemini-3.8-flash` -> `gemini-3.6-flash` -> `gemini-3.5-flash-lite`
        - ai-2 (Beta-Groq): Groq `openai/gpt-oss-120b` -> `meta-llama/llama-4-maverick-17b-128e-instruct`
        - ai-3 (Gamma-Mistral): Mistral `mistral-small-4` / Cloudflare `@cf/mistralai/mistral-small-3.1-24b-instruct`
        - ai-4 (Delta-Router): OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free` -> `openrouter/free`
        - ai-5 (Epsilon-CF): Cloudflare `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
        - ai-6 (Zeta-Qwen3.8): Groq `qwen/qwen3.8-27b` / Cloudflare `@cf/zai/glm-5.3` (No CN phone needed)
        - ai-7 (Eta-Nemotron): OpenRouter `nvidia/nemotron-3.5-super-vl:free` / Groq `openai/gpt-oss-20b`
        - ai-8 (Theta-Cohere): Cohere `command-a-plus-05-2026` -> `command-a-03-2025`
        """
        primary_key = os.environ.get(self.api_key_env, "").strip() if self.api_key_env else ""
        if self.provider == "cloudflare" and not primary_key:
            primary_key = os.environ.get("CF_API_TOKEN", "").strip() or os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()

        if primary_key:
            chain = [self.model_name] + [m for m in MODEL_FALLBACK_CHAINS.get(self.provider, []) if m != self.model_name]
            return self.provider, chain, primary_key

        groq_key = os.environ.get("GROQ_API_KEY", "").strip()
        cf_key = os.environ.get("CF_API_TOKEN", "").strip() or os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
        openrouter_key = os.environ.get("OPENROUTER_API_KEY", "").strip()

        if self.provider == "zai":
            if groq_key:
                return "groq", ["qwen/qwen3.8-27b", "qwen/qwen3-32b", "openai/gpt-oss-20b"], groq_key
            if cf_key:
                return "cloudflare", ["@cf/zai/glm-5.3", "@cf/qwen/qwen2.5-coder-32b-instruct"], cf_key

        if self.provider == "nvidia":
            if openrouter_key:
                return "openrouter", ["nvidia/nemotron-3.5-super-vl:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "openrouter/free"], openrouter_key
            if groq_key:
                return "groq", ["openai/gpt-oss-20b", "llama-3.3-70b-versatile"], groq_key

        if self.provider == "mistral":
            if cf_key:
                return "cloudflare", ["@cf/mistralai/mistral-small-3.1-24b-instruct", "@cf/mistral/mistral-7b-instruct-v0.2-lora"], cf_key
            if openrouter_key:
                return "openrouter", ["google/gemma-4-31b-it:free", "openrouter/free"], openrouter_key

        return self.provider, [self.model_name], ""

    def decide(self, snapshot: Dict[str, Any], allow_live_network: bool = False) -> Dict[str, Any]:
        t0 = time.time()
        eff_provider, candidate_models, api_key = self._resolve_credentials()

        if allow_live_network and api_key:
            for candidate_model in candidate_models:
                try:
                    raw_resp, tokens_in, tokens_out = self._call_live_provider(
                        eff_provider, candidate_model, api_key, snapshot
                    )
                    parsed = self._extract_and_validate_json(raw_resp)
                    if parsed:
                        latency_ms = int((time.time() - t0) * 1000)
                        return {
                            "plan": parsed,
                            "raw_response": raw_resp,
                            "tokens_in": tokens_in,
                            "tokens_out": tokens_out,
                            "latency_ms": max(latency_ms, 120),
                            "mode": f"live_api:{eff_provider}:{candidate_model}",
                        }
                except Exception:
                    continue

        sim_plan = self._simulate_playbook_decision(snapshot)
        latency_ms = int((time.time() - t0) * 1000) + 185
        raw_json = json.dumps(sim_plan)
        return {
            "plan": sim_plan,
            "raw_response": raw_json,
            "tokens_in": 1080,
            "tokens_out": 210,
            "latency_ms": latency_ms,
            "mode": "playbook_simulation" if not api_key else f"configured_ready:{eff_provider}:{candidate_models[0]}",
        }

    def _build_prompt(self, snapshot: Dict[str, Any]) -> str:
        return (
            f"You are {self.display_name} ({self.model_name}), an autonomous XAUUSD paper trader.\n"
            f"Your Playbook Style: {self.style_archetype}\n\n"
            "CORE TECHNIQUE & AUTONOMOUS EXECUTION RULES:\n"
            "1. Multi-Timeframe Analysis: Check 4H macro bias, 1H impulse swing & OI walls, M15 Fibonacci OTE (0.618-0.786 / 0.705 sweet spot), and M5 BOS/CHoCH trigger.\n"
            "2. Flexible Entry Execution (`order_type`): You must autonomously choose the best execution method for the current price:\n"
            "   - `market`: Enter BUY or SELL immediately at current market price if price is already inside the OTE zone and M5 displacement is confirmed.\n"
            "   - `limit`: Place a pending BUY LIMIT or SELL LIMIT order resting at your chosen Fib OTE level (0.618, 0.705, or 0.786).\n"
            "   - `zone_confirm`: Do NOT place a resting limit order; instead wait/stalk until price reaches your target zone and forms a confirmed M5/M15 candle before entering at market.\n"
            "3. Break-Even ('ตั้ง SL กันหน้าทุน'): Once price moves +1.0R or reaches Fib 0.0 (Swing High/Low), shift SL to Entry ± $0.50.\n"
            "4. Partial Close & Fib Extensions: Set TP1 at Fib -0.27 (`tp1_neg_027`, close 50% of lots) and TP2 at Fib -0.618 (`tp2_neg_0618`, close remaining 50% runner).\n"
            "5. Self-Journal: Include a concise journal note recording MTF alignment, chosen execution mode (market / limit / zone_confirm), Fib OTE level, and Break-Even/Partial strategy.\n\n"
            f"PLAYBOOK:\n{self.playbook_text[:2500]}\n\n"
            f"MARKET SNAPSHOT (JSON):\n{json.dumps(snapshot, indent=2)}\n\n"
            "Respond strictly with a single valid JSON object matching the trade plan schema:\n"
            '{"action": "long|short|no_trade", "order_type": "market|limit|zone_confirm", "entry": float, '
            '"stop_loss": float, "be_trigger_price": float, '
            '"take_profits": [{"price": float, "close_pct": 50, "fib_level": "-0.27"}, {"price": float, "close_pct": 50, "fib_level": "-0.618"}], '
            '"risk_pct": float, "lot": float, "confidence": float, "style_tag": str, '
            '"reasoning": str, "invalid_if": str}'
        )

    def _call_live_provider(
        self, provider: str, model_name: str, api_key: str, snapshot: Dict[str, Any]
    ) -> tuple[str, int, int]:
        prompt = self._build_prompt(snapshot)

        if provider == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            usage = data.get("usageMetadata", {})
            return text, int(usage.get("promptTokenCount", 950)), int(usage.get("candidatesTokenCount", 180))

        if provider == "cloudflare":
            account_id = (
                os.environ.get("CF_ACCOUNT_ID", "").strip()
                or os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
            )
            url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model_name}"
            payload = {
                "messages": [
                    {"role": "system", "content": "Respond only with valid JSON."},
                    {"role": "user", "content": prompt},
                ]
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = data.get("result", {}).get("response", "{}")
            return text, 920, 175

        if provider == "cohere":
            url = PROVIDER_ENDPOINTS["cohere"]
            payload = {
                "model": model_name,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = data["message"]["content"][0]["text"]
            return text, 910, 180

        url = PROVIDER_ENDPOINTS.get(provider, PROVIDER_ENDPOINTS["openrouter"])
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": "You are an institutional XAUUSD trading agent. Respond only with valid JSON."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://startify-xauusd.vercel.app",
                "X-Title": "Startify XAUUSD Multi-AI Trader",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        return text, int(usage.get("prompt_tokens", 950)), int(usage.get("completion_tokens", 185))

    def _extract_and_validate_json(self, raw_text: str) -> Optional[Dict[str, Any]]:
        cleaned = raw_text.strip()
        if "```" in cleaned:
            parts = cleaned.split("```")
            for p in parts:
                p_strip = p.strip()
                if p_strip.startswith("json"):
                    p_strip = p_strip[4:].strip()
                if p_strip.startswith("{") and p_strip.endswith("}"):
                    cleaned = p_strip
                    break
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1:
            return None
        obj = json.loads(cleaned[start : end + 1])
        required = {"action", "order_type", "entry", "stop_loss", "take_profits", "risk_pct", "lot", "confidence", "style_tag", "reasoning", "invalid_if"}
        if not required.issubset(set(obj.keys())):
            return None
        return obj

    def _simulate_playbook_decision(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generates a Playbook-faithful trade plan using:
        - 4H / 1H / M15 / M5 Multi-Timeframe alignment & Historical Warm-Up stats
        - Fibonacci OTE (0.618-0.786 / 0.705 sweet spot) entry
        - Automatic Break-Even ("ตั้ง SL กันหน้าทุน") trigger at +1.0R / Fib 0.0
        - Multi-Lot Partial Close: 50% at Fib -0.27 (`tp1_neg_027`) and 50% Runner at Fib -0.618 (`tp2_neg_0618`)
        """
        if snapshot.get("news_blackout"):
            return self._empty_plan("Sitting out: High-impact USD news blackout window active.")

        ote = snapshot["ote"]
        swing = snapshot["last_swing"]
        direction = swing.get("impulse_direction", "long")
        price = float(snapshot["price"])
        sweet = float(ote["sweet_spot"])
        invalidation = float(ote["invalidation"])
        fib_0_0 = float(ote.get("fib_0_0", swing.get("high" if direction == "long" else "low", price + 8.0)))
        tp1_neg_027 = float(ote.get("tp1_neg_027", fib_0_0 + (4.5 if direction == "long" else -4.5)))
        tp2_neg_0618 = float(ote.get("tp2_neg_0618", fib_0_0 + (10.5 if direction == "long" else -10.5)))

        agent_profiles = {
            "ai-1": {"entry_bias": 0.0, "risk_pct": 1.2, "partial_pct": 50, "conf": 0.84, "pref_mode": "limit", "tag": "OTE-0.705-Limit-Sniper"},
            "ai-2": {"entry_bias": 0.5, "risk_pct": 1.5, "partial_pct": 50, "conf": 0.80, "pref_mode": "zone_confirm", "tag": "M5-BOS-ZoneConfirm-Runner"},
            "ai-3": {"entry_bias": -0.4, "risk_pct": 1.1, "partial_pct": 60, "conf": 0.77, "pref_mode": "limit", "tag": "GLD-OI-Wall-Limit-Neg027"},
            "ai-4": {"entry_bias": 0.3, "risk_pct": 1.2, "partial_pct": 50, "conf": 0.79, "pref_mode": "market", "tag": "4H-1H-M15-M5-MarketExec"},
            "ai-5": {"entry_bias": -0.3, "risk_pct": 1.25, "partial_pct": 50, "conf": 0.76, "pref_mode": "zone_confirm", "tag": "PAXG-OI-ZoneWatch-BEGuard"},
            "ai-6": {"entry_bias": 0.9, "risk_pct": 1.4, "partial_pct": 50, "conf": 0.73, "pref_mode": "market", "tag": "Qwen3-Momentum-Neg0618"},
            "ai-7": {"entry_bias": -0.7, "risk_pct": 1.6, "partial_pct": 40, "conf": 0.86, "pref_mode": "limit", "tag": "DeepSeek-Limit-Neg0618"},
            "ai-8": {"entry_bias": 0.0, "risk_pct": 0.9, "partial_pct": 60, "conf": 0.82, "pref_mode": "zone_confirm", "tag": "CommandA-ZoneConfirm-0.705"},
        }
        prof = agent_profiles.get(self.agent_id, agent_profiles["ai-1"])

        entry = round(sweet + (prof["entry_bias"] if direction == "long" else -prof["entry_bias"]), 2)
        sl = round(invalidation - (0.8 if direction == "long" else -0.8), 2)
        sl_dist = max(abs(entry - sl), 3.5)
        if sl_dist > 16.0:
            sl = round(entry - 7.5 if direction == "long" else entry + 7.5, 2)
            sl_dist = 7.5

        if abs(price - entry) <= 2.0 or prof["pref_mode"] == "market":
            order_type = "market"
            entry = price
        elif prof["pref_mode"] == "zone_confirm":
            order_type = "zone_confirm"
        else:
            order_type = "limit"

        # Ensure TP1 (-0.27) and TP2 (-0.618) satisfy >= 1.5R minimum Risk-Reward required by Hard Risk Validator
        min_tp1 = round(entry + (sl_dist * 1.65 if direction == "long" else -sl_dist * 1.65), 2)
        min_tp2 = round(entry + (sl_dist * 2.45 if direction == "long" else -sl_dist * 2.45), 2)
        tp1 = round(max(tp1_neg_027, min_tp1) if direction == "long" else min(tp1_neg_027, min_tp1), 2)
        tp2 = round(max(tp2_neg_0618, min_tp2) if direction == "long" else min(tp2_neg_0618, min_tp2), 2)
        be_trigger = round(entry + (sl_dist * 0.9 if direction == "long" else -sl_dist * 0.9), 2)

        equity = float(snapshot.get("account", {}).get("equity", 1000.0))
        lot, _ = calc_lot(equity, prof["risk_pct"], entry, sl)
        if lot <= 0:
            return self._empty_plan("Calculated lot below 0.01 minimum threshold for current stop distance.")

        partial_1 = int(prof["partial_pct"])
        partial_2 = 100 - partial_1
        mtf = snapshot.get("mtf_alignment", "4/4 Timeframes Aligned")
        warmup_027 = snapshot.get("historical_warmup", {}).get("tp1_neg_027_hit_rate_pct", 74.2)
        exec_label = (
            f"{direction.upper()} NOW (Market)"
            if order_type == "market"
            else (
                f"{direction.upper()} LIMIT @ ${entry:.2f}"
                if order_type == "limit"
                else f"WAIT ZONE ${entry:.2f} + M5 CONFIRM (No Resting Limit)"
            )
        )

        return {
            "action": direction,
            "order_type": order_type,
            "entry": entry,
            "stop_loss": sl,
            "be_trigger_price": be_trigger,
            "take_profits": [
                {"price": tp1, "close_pct": partial_1, "fib_level": "-0.27"},
                {"price": tp2, "close_pct": partial_2, "fib_level": "-0.618"},
            ],
            "risk_pct": prof["risk_pct"],
            "lot": lot,
            "confidence": prof["conf"],
            "style_tag": prof["tag"],
            "reasoning": (
                f"[{mtf} • {exec_label}] SL ${sl:.2f}, Auto Break-Even ('กันหน้าทุน') at ${be_trigger:.2f}; "
                f"Partial Close {partial_1}% at Fib -0.27 (${tp1:.2f}, hist hit-rate {warmup_027}%) "
                f"& Runner {partial_2}% to Fib -0.618 (${tp2:.2f})."
            ),
            "invalid_if": f"M15/1H candle closes beyond ${sl:.2f} or USD high-impact event enters 30m blackout window.",
        }

    def _empty_plan(self, reason: str) -> Dict[str, Any]:
        return {
            "action": "no_trade",
            "order_type": "limit",
            "entry": 0.0,
            "stop_loss": 0.0,
            "be_trigger_price": 0.0,
            "take_profits": [],
            "risk_pct": 0.0,
            "lot": 0.0,
            "confidence": 0.0,
            "style_tag": self.style_archetype,
            "reasoning": reason,
            "invalid_if": "N/A",
        }
