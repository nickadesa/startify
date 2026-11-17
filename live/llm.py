"""One tiny client for every provider in config.yaml. Returns None when the key is
missing or the call fails — the caller then falls back to rule mode and says so."""
from __future__ import annotations
import json, os, re, urllib.request
from typing import Any, Dict, Optional, Tuple

OPENAI_COMPAT = {
    "XAI_API_KEY": "https://api.x.ai/v1/chat/completions",
    "OPENROUTER_API_KEY": "https://openrouter.ai/api/v1/chat/completions",
    "CEREBRAS_API_KEY": "https://api.cerebras.ai/v1/chat/completions",
    "GEMINI_API_KEY": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    "GROQ_API_KEY": "https://api.groq.com/openai/v1/chat/completions",
    "MISTRAL_API_KEY": "https://api.mistral.ai/v1/chat/completions",
}

def has_key(agent: Dict[str, Any]) -> bool:
    return bool(os.getenv(agent.get("api_key_env", ""), "").strip())

def _post(url: str, headers: Dict[str, str], body: Dict[str, Any], timeout: float = 40) -> Dict[str, Any]:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "User-Agent": "Startify/3.0", **headers}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def ask(agent: Dict[str, Any], system: str, user: str, max_tokens: int = 400) -> Optional[Tuple[str, int]]:
    env = agent.get("api_key_env", "")
    key = os.getenv(env, "").strip()
    if not key:
        return None
    model = agent["model_name"]
    try:
        if env == "ANTHROPIC_API_KEY":
            j = _post("https://api.anthropic.com/v1/messages", {"x-api-key": key, "anthropic-version": "2023-06-01"},
                      {"model": model, "max_tokens": max_tokens, "system": system, "messages": [{"role": "user", "content": user}]})
            return j["content"][0]["text"], int(j.get("usage", {}).get("output_tokens", 0)) + int(j.get("usage", {}).get("input_tokens", 0))
        if env == "CLOUDFLARE_API_TOKEN":
            acc = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
            j = _post(f"https://api.cloudflare.com/client/v4/accounts/{acc}/ai/run/{model}", {"Authorization": f"Bearer {key}"},
                      {"messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], "max_tokens": max_tokens})
            return j["result"]["response"], max_tokens // 2
        url = OPENAI_COMPAT.get(env)
        if not url:
            return None
        j = _post(url, {"Authorization": f"Bearer {key}"},
                  {"model": model, "max_tokens": max_tokens, "temperature": 0.6,
                   "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
        txt = j["choices"][0]["message"]["content"] or ""
        txt = re.sub(r"<think>.*?</think>", "", txt, flags=re.S).strip()   # deepseek / qwen reasoning tags
        return txt, int(j.get("usage", {}).get("total_tokens", 0))
    except Exception:
        return None

def parse_json(txt: str) -> Optional[Dict[str, Any]]:
    m = re.search(r"\{.*\}", txt, flags=re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None
