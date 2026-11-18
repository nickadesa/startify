"""One tiny client for every provider in config.yaml.
Returns None when the key is missing or the call fails — the caller then falls back to
template/rule mode. NEW: every failure is now logged + remembered per agent (see status()),
so you can SEE why an AI fell back instead of silently getting canned lines."""
from __future__ import annotations
import json, os, re, time, urllib.error, urllib.request
from typing import Any, Dict, List, Optional, Tuple

OPENAI_COMPAT = {
    "XAI_API_KEY": "https://api.x.ai/v1/chat/completions",
    "OPENROUTER_API_KEY": "https://openrouter.ai/api/v1/chat/completions",
    "CEREBRAS_API_KEY": "https://api.cerebras.ai/v1/chat/completions",
    "GEMINI_API_KEY": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    "GROQ_API_KEY": "https://api.groq.com/openai/v1/chat/completions",
    "MISTRAL_API_KEY": "https://api.mistral.ai/v1/chat/completions",
}

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
    """-> (env_name, key, model). Native key first, OpenRouter as fallback. ('', '', '') if no key."""
    env = agent.get("api_key_env", "")
    key = os.getenv(env, "").strip()
    if key:
        return env, key, agent["model_name"]
    if agent.get("openrouter_model"):
        k = os.getenv("OPENROUTER_API_KEY", "").strip()
        if k:
            return "OPENROUTER_API_KEY", k, agent["openrouter_model"]
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
        acc = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
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
    or_key = os.getenv("OPENROUTER_API_KEY", "").strip()
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

def status(agents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for a in agents:
        env, key, model = _route(a)
        s = _STATE.get(a["agent_id"], {})
        out.append({"agent_id": a["agent_id"], "name": a["short_name"], "has_key": bool(key),
                    "via": env or None, "model": model or a.get("model_name"),
                    "last_error": s.get("err"), "last_ok_ago_s": round(time.time() - s["ok_at"]) if s.get("ok_at") else None})
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
