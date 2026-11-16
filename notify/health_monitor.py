from datetime import datetime, timezone
from typing import Any, Dict, List


class SystemHealthMonitor:
    """
    Monitors system stability, data freshness, API quota usage, and consecutive LLM failures
    (from xauusd-ai-trader-ideas.md section 5.1).
    """

    def __init__(self, daily_quota_limits: Dict[str, int] = None):
        self.daily_quota_limits = daily_quota_limits or {
            "gemini": 1500,
            "groq": 1000,
            "mistral": 1000,
            "openrouter": 50,
            "cloudflare": 800,
            "zai": 1000,
            "nvidia": 1000,
            "cohere": 35,
        }

    def evaluate_health(
        self,
        data_quality_result: Dict[str, Any],
        api_calls_today_by_provider: Dict[str, int],
        consecutive_failures_by_agent: Dict[str, int],
    ) -> Dict[str, Any]:
        alerts: List[Dict[str, Any]] = []
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        if not data_quality_result.get("passed", True):
            alerts.append({
                "time": now_iso,
                "component": "data_quality",
                "severity": "warning",
                "message": f"Data quality check skipped bar: {data_quality_result.get('reason')}",
            })

        for provider, used in api_calls_today_by_provider.items():
            limit = self.daily_quota_limits.get(provider, 500)
            usage_pct = (used / max(limit, 1)) * 100.0
            if usage_pct >= 85.0:
                alerts.append({
                    "time": now_iso,
                    "component": f"quota_{provider}",
                    "severity": "warning" if usage_pct < 98.0 else "critical",
                    "message": f"Free API quota for {provider} at {usage_pct:.1f}% ({used}/{limit} RPD)",
                })

        for agent_id, fails in consecutive_failures_by_agent.items():
            if fails >= 3:
                alerts.append({
                    "time": now_iso,
                    "component": f"agent_{agent_id}",
                    "severity": "error",
                    "message": f"Agent {agent_id} experienced {fails} consecutive API failures; fallback active",
                })

        return {
            "status": "healthy" if not alerts else "degraded",
            "checked_at": now_iso,
            "alerts": alerts,
        }
