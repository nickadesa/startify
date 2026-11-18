"""One tiny client for every provider in config.yaml.
Returns None when the key is missing or the call fails — the caller then falls back to
template/rule mode. NEW: every failure is now logged + remembered per agent (see status()),
so you can SEE why an AI fell back instead of silently getting canned lines."""
from __future__ import annotations
import json, os, re, time, urllib.error, urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

OPENAI_COMPAT = {
    "XAI_API_KEY": "https://api.x.ai/v1/chat/completions",
    "OPENROUTER_API_KEY": "https://openrouter.ai/api/v1/chat/completions",
    "CEREBRAS_API_KEY": "https://api.cerebras.ai/v1/chat/completions",
    "GEMINI_API_KEY": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    "GROQ_API_KEY": "https://api.groq.com/openai/v1/chat/completions",
    "MISTRAL_API_KEY": "https://api.mistral.ai/v1/chat/completions",
    "OPENAI_API_KEY": "https://api.openai.com/v1/chat/completions",
    "DEEPSEEK_API_KEY": "https://api.deepseek.com/chat/completions",
    "NVIDIA_API_KEY": "https://integrate.api.nvidia.com/v1/chat/completions",
    "PERPLEXITY_API_KEY": "https://api.perplexity.ai/chat/completions",
    "ZAI_API_KEY": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    "MOONSHOT_API_KEY": "https://api.moonshot.ai/v1/chat/completions",
    "COHERE_API_KEY": "https://api.cohere.ai/compatibility/v1/chat/completions",
    "DASHSCOPE_API_KEY": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
}

ENV_ALIASES: Dict[str, List[str]] = {
    "OPENROUTER_API_KEY": ["OPENROUTER_API_KEY", "OPENROUTER_KEY", "OPEN_ROUTER_API_KEY", "OPENROUTER_TOKEN", "OPENROUTER"],
    "ANTHROPIC_API_KEY": ["ANTHROPIC_API_KEY", "ANTHROPIC_KEY", "CLAUDE_API_KEY", "CLAUDE_KEY"],
    "XAI_API_KEY": ["XAI_API_KEY", "XAI_KEY", "GROK_API_KEY", "GROK_KEY"],
    "GEMINI_API_KEY": ["GEMINI_API_KEY", "GEMINI_KEY", "GOOGLE_API_KEY", "GOOGLE_GEMINI_API_KEY"],
    "GROQ_API_KEY": ["GROQ_API_KEY", "GROQ_KEY"],
    "MISTRAL_API_KEY": ["MISTRAL_API_KEY", "MISTRAL_KEY"],
    "CEREBRAS_API_KEY": ["CEREBRAS_API_KEY", "CEREBRAS_KEY"],
    "CLOUDFLARE_API_TOKEN": ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN", "CLOUDFLARE_API_KEY"],
    "OPENAI_API_KEY": ["OPENAI_API_KEY", "OPENAI_KEY", "CHATGPT_API_KEY"],
    "DEEPSEEK_API_KEY": ["DEEPSEEK_API_KEY", "DEEPSEEK_KEY"],
    "NVIDIA_API_KEY": ["NVIDIA_API_KEY", "NVIDIA_KEY", "NIM_API_KEY"],
    "PERPLEXITY_API_KEY": ["PERPLEXITY_API_KEY", "PPLX_API_KEY", "SONAR_API_KEY"],
    "ZAI_API_KEY": ["ZAI_API_KEY", "ZHIPU_API_KEY", "GLM_API_KEY"],
    "MOONSHOT_API_KEY": ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
    "COHERE_API_KEY": ["COHERE_API_KEY", "COHERE_KEY"],
    "DASHSCOPE_API_KEY": ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
}

BRAND_NATIVE: Dict[str, Tuple[str, str]] = {
    "anthropic": ("ANTHROPIC_API_KEY", "claude-3-5-sonnet-latest"),
    "xai": ("XAI_API_KEY", "grok-3-mini"),
    "deepseek": ("DEEPSEEK_API_KEY", "deepseek-chat"),
    "qwen": ("DASHSCOPE_API_KEY", "qwen-max"),
    "gemini": ("GEMINI_API_KEY", "gemini-2.5-flash"),
    "gemma": ("GEMINI_API_KEY", "gemini-2.5-flash"),
    "openai": ("OPENAI_API_KEY", "gpt-4o-mini"),
    "mistral": ("MISTRAL_API_KEY", "mistral-small-latest"),
    "meta": ("GROQ_API_KEY", "llama-3.3-70b-versatile"),
    "zai": ("ZAI_API_KEY", "glm-4.5-flash"),
    "kimi": ("MOONSHOT_API_KEY", "moonshot-v1-8k"),
    "perplexity": ("PERPLEXITY_API_KEY", "sonar-pro"),
    "nvidia": ("NVIDIA_API_KEY", "meta/llama-3.3-70b-instruct"),
    "cohere": ("COHERE_API_KEY", "command-a-03-2025"),
}

def _load_secret_files() -> None:
    base = Path(__file__).resolve().parent.parent
    for p in (base / ".env", Path("/etc/secrets/.env"), Path("/etc/secrets/env")):
        if not p.is_file():
            continue
        try:
            for raw in p.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and v and not os.getenv(k, "").strip():
                    os.environ[k] = v
        except Exception:
            pass
    sec_dir = Path("/etc/secrets")
    if sec_dir.is_dir():
        try:
            for f in sec_dir.iterdir():
                if f.is_file() and f.name not in (".env", "env"):
                    val = f.read_text(encoding="utf-8", errors="ignore").strip()
                    if val and "=" not in val and "\n" not in val and not os.getenv(f.name, "").strip():
                        os.environ[f.name] = val
        except Exception:
            pass

def _get_env(canonical: str) -> str:
    _load_secret_files()
    for name in ENV_ALIASES.get(canonical, [canonical]):
        v = os.getenv(name, "").strip().strip('"').strip("'")
        if v:
            return v
    # Prefix-based fallback if the user named the env var something custom (e.g. API_KEY=sk-or-v1-...)
    for k, raw_v in os.environ.items():
        v = (raw_v or "").strip().strip('"').strip("'")
        if not v:
            continue
        if canonical == "OPENROUTER_API_KEY" and v.startswith("sk-or-"):
            return v
        if canonical == "ANTHROPIC_API_KEY" and v.startswith("sk-ant-"):
            return v
        if canonical == "GROQ_API_KEY" and v.startswith("gsk_"):
            return v
        if canonical == "XAI_API_KEY" and v.startswith("xai-"):
            return v
        if canonical == "GEMINI_API_KEY" and v.startswith("AIza"):
            return v
        if canonical == "NVIDIA_API_KEY" and v.startswith("nvapi-"):
            return v
    return ""

# Models that "think" before answering: they burn max_tokens on hidden reasoning and can
# return an EMPTY reply when max_tokens is small (e.g. 120). We give them extra headroom.
_REASONING_HINT = re.compile(r"gpt-oss|reasoning|deepseek|qwen|kimi|glm|minimax|sonar|nemotron|gemini-(2\.5|3|4)|grok-(3|4)|o1|o3|r1", re.I)
REASONING_HEADROOM = 900

_STATE: Dict[str, Dict[str, Any]] = {}   # agent_id -> {"err": str|None, "err_at": float, "ok_at": float, "route": str}

def _mark(agent: Dict[str, Any], ok: bool, route: str, err: str = "") -> None:
    s = _STATE.setdefault(agent.get("agent_id", "?"), {})
    s["route"] = route
    if ok:
        s["ok_at"] = time.time(); s["err"] = None
    else:
        s["err"] = err[:300]; s["err_at"] = time.time()
        print(f"[llm] {agent.get('agent_id')} {agent.get('short_name')} via {route} FAILED: {err[:300]}", flush=True)

def _route(agent: Dict[str, Any]) -> Tuple[str, str, str]:
    """-> (env_name, key, model). Native key first, brand native second, OpenRouter third, any available key as universal fallback."""
    env = agent.get("api_key_env", "")
    if env:
        key = _get_env(env)
        if key:
            return env, key, agent["model_name"]
    brand_info = BRAND_NATIVE.get(agent.get("brand_key", ""))
    if brand_info:
        b_env, b_model = brand_info
        b_key = _get_env(b_env)
        if b_key:
            return b_env, b_key, (agent["model_name"] if env == b_env else b_model)
    if agent.get("openrouter_model"):
        k = _get_env("OPENROUTER_API_KEY")
        if k:
            return "OPENROUTER_API_KEY", k, agent["openrouter_model"]
    # Universal fallback: if the user set at least ONE working LLM key (e.g. GROQ_API_KEY or GEMINI_API_KEY),
    # route unkeyed agents through that provider so all 17 AIs can converse with real LLM reasoning.
    for fb_env, fb_model in (
        ("OPENROUTER_API_KEY", agent.get("openrouter_model") or "meta-llama/llama-3.3-70b-instruct:free"),
        ("GROQ_API_KEY", "llama-3.3-70b-versatile"),
        ("GEMINI_API_KEY", "gemini-2.5-flash"),
        ("CEREBRAS_API_KEY", "llama-3.3-70b"),
        ("MISTRAL_API_KEY", "mistral-small-latest"),
        ("DEEPSEEK_API_KEY", "deepseek-chat"),
        ("OPENAI_API_KEY", "gpt-4o-mini"),
        ("XAI_API_KEY", "grok-3-mini"),
        ("ANTHROPIC_API_KEY", "claude-3-5-sonnet-latest"),
    ):
        fb_k = _get_env(fb_env)
        if fb_k:
            return fb_env, fb_k, fb_model
    return "", "", ""

def has_key(agent: Dict[str, Any]) -> bool:
    return bool(_route(agent)[1])

def _post(url: str, headers: Dict[str, str], body: Dict[str, Any], timeout: float = 40) -> Dict[str, Any]:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "User-Agent": "Startify/3.0", **headers}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:   # keep the provider's real error message (bad model id, quota, 401 ...)
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode(errors='ignore')[:250]}") from None

def _clean(txt: str) -> str:
    txt = re.sub(r"<think>.*?</think>", "", txt or "", flags=re.S)
    txt = re.sub(r"<think>.*$", "", txt, flags=re.S)          # unclosed think block
    return txt.strip().strip('"').strip()

def _call(env: str, key: str, model: str, system: str, user: str, max_tokens: int, image: Optional[str]) -> Tuple[str, int]:
    budget = max_tokens + (REASONING_HEADROOM if _REASONING_HINT.search(model) else 0)
    if env == "ANTHROPIC_API_KEY":
        content: Any = user
        m = re.match(r"data:(image/[\w+.-]+);base64,(.+)$", image or "", flags=re.S)
        if m:
            content = [{"type": "image", "source": {"type": "base64", "media_type": m.group(1), "data": m.group(2)}}, {"type": "text", "text": user}]
        j = _post("https://api.anthropic.com/v1/messages", {"x-api-key": key, "anthropic-version": "2023-06-01"},
                  {"model": model, "max_tokens": max_tokens, "system": system, "messages": [{"role": "user", "content": content}]})
        txt = "".join(b.get("text", "") for b in j.get("content", []) if b.get("type") == "text")
        u = j.get("usage", {})
        return txt, int(u.get("output_tokens", 0)) + int(u.get("input_tokens", 0))
    if env == "CLOUDFLARE_API_TOKEN":
        acc = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip() or os.getenv("CF_ACCOUNT_ID", "").strip()
        j = _post(f"https://api.cloudflare.com/client/v4/accounts/{acc}/ai/run/{model}", {"Authorization": f"Bearer {key}"},
                  {"messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], "max_tokens": max_tokens})
        return j["result"]["response"], max_tokens // 2
    url = OPENAI_COMPAT.get(env)
    if not url:
        raise RuntimeError(f"unsupported key env {env}")
    uc: Any = user
    if image:
        uc = [{"type": "text", "text": user}, {"type": "image_url", "image_url": {"url": image}}]
    j = _post(url, {"Authorization": f"Bearer {key}"},
              {"model": model, "max_tokens": budget, "temperature": 0.8,
               "messages": [{"role": "system", "content": system}, {"role": "user", "content": uc}]})
    txt = (j["choices"][0]["message"].get("content") or "")
    return txt, int(j.get("usage", {}).get("total_tokens", 0))

def ask(agent: Dict[str, Any], system: str, user: str, max_tokens: int = 400, image_data_url: Optional[str] = None) -> Optional[Tuple[str, int]]:
    env, key, model = _route(agent)
    if not key:
        _mark(agent, False, "none", f"no API key (set {agent.get('api_key_env')} or OPENROUTER_API_KEY)")
        return None
    attempts: List[Tuple[str, str, str]] = [(env, key, model)]
    # if the native provider fails, retry once through OpenRouter (when configured)
    or_key = _get_env("OPENROUTER_API_KEY")
    if env != "OPENROUTER_API_KEY" and or_key and agent.get("openrouter_model"):
        attempts.append(("OPENROUTER_API_KEY", or_key, agent["openrouter_model"]))
    first_err = ""
    for e, k, m in attempts:
        try:
            txt, tok = _call(e, k, m, system, user, max_tokens, image_data_url)
            txt = _clean(txt)
            if not txt:
                raise RuntimeError("empty reply (reasoning model used all tokens, or content filtered)")
            _mark(agent, True, f"{e}:{m}")
            if first_err:   # native provider is broken but OpenRouter saved the call — keep the warning visible
                _STATE[agent["agent_id"]]["err"] = f"native failed, running via OpenRouter: {first_err}"[:300]
            return txt, tok
        except Exception as ex:
            first_err = first_err or str(ex)
            _mark(agent, False, f"{e}:{m}", str(ex))
    return None

def env_keys_present() -> List[str]:
    _load_secret_files()
    ignore = {"PATH", "HOME", "USER", "HOSTNAME", "PWD", "SHLVL", "LANG", "GPG_KEY", "PYTHON_VERSION", "PORT"}
    return sorted(
        k for k, v in os.environ.items()
        if (v or "").strip() and k not in ignore and (
            any(w in k.upper() for w in ("KEY", "TOKEN", "SECRET", "API", "OPENROUTER", "GROQ", "GEMINI", "ANTHROPIC", "CLAUDE", "XAI", "GROK", "MISTRAL", "DEEPSEEK", "OPENAI", "CEREBRAS", "NVIDIA", "COHERE", "TURSO"))
        )
    )

def status(agents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    present = env_keys_present()
    for a in agents:
        env, key, model = _route(a)
        s = _STATE.get(a["agent_id"], {})
        item: Dict[str, Any] = {"agent_id": a["agent_id"], "name": a["short_name"], "has_key": bool(key),
                    "via": env or None, "model": model or a.get("model_name"),
                    "last_error": s.get("err"), "last_ok_ago_s": round(time.time() - s["ok_at"]) if s.get("ok_at") else None}
        if a["agent_id"] == "ai-1":
            item["env_keys_detected"] = present
        out.append(item)
    return out

def ping(agent: Dict[str, Any]) -> Dict[str, Any]:
    t0 = time.time()
    r = ask(agent, "Reply with exactly one word.", "Say: pong", 20)
    return {"agent_id": agent["agent_id"], "name": agent["short_name"], "ok": bool(r), "reply": (r[0][:40] if r else None),
            "ms": int((time.time() - t0) * 1000), "error": None if r else _STATE.get(agent["agent_id"], {}).get("err")}

def parse_json(txt: str) -> Optional[Dict[str, Any]]:
    m = re.search(r"\{.*\}", txt, flags=re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None
