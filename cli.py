import argparse
import json
from pathlib import Path
import yaml

from agents.base_agent import AITraderAgent
from agents.playbook_manager import PlaybookManager
from backtest.runner import BacktestRunner
from consensus.detector import ConsensusDetector
from data.price_provider import PriceProvider
from data.quality_check import DataQualityChecker
from db.database import BASE_DIR, init_db
from indicators.snapshot import SnapshotBuilder
from notify.discord import DiscordNotifier
from risk.validator import PlanValidator


def run_single_cycle(as_of_time: str = "2026-11-15T14:00:00Z", dry_run_discord: bool = True):
    cfg = yaml.safe_load((BASE_DIR / "config.yaml").read_text(encoding="utf-8"))
    provider = PriceProvider("XAUUSD")
    candles_h1 = provider.get_closed_candles("H1", as_of_time=as_of_time, limit=72)
    qc = DataQualityChecker().check(candles_h1, as_of_time=as_of_time)
    if not qc["passed"]:
        print(f"[SKIP] Data quality check did not pass: {qc['reason']}")
        return

    snap = SnapshotBuilder().build(as_of_time=as_of_time, candles_h1=candles_h1)
    validator = PlanValidator(cfg)
    notifier = DiscordNotifier(dry_run=dry_run_discord)
    pb_mgr = PlaybookManager()

    valid_plans = []
    for ag_cfg in cfg["agents"]:
        if not ag_cfg["agent_id"].startswith("ai-") or not ag_cfg.get("active", True):
            continue
        pb_text = pb_mgr.ensure_agent_playbook(ag_cfg)
        agent = AITraderAgent(ag_cfg, playbook_text=pb_text)
        res = agent.decide(snap)
        plan = res["plan"]
        ok, reason, norm_plan = validator.validate(plan, snap, snap["account"])
        print(
            f"[{ag_cfg['display_name']} ({ag_cfg['model_name']})] "
            f"Action={norm_plan.get('action')} | Entry=${norm_plan.get('entry', 0):.2f} | "
            f"Lot={norm_plan.get('lot', 0)} | Valid={ok} ({reason})"
        )
        if ok and norm_plan.get("action") in ("long", "short"):
            norm_plan["agent_id"] = ag_cfg["agent_id"]
            valid_plans.append(norm_plan)
            notifier.send_signal(ag_cfg["agent_id"], ag_cfg["display_name"], norm_plan, 1000.0)

    cons_events = ConsensusDetector().detect(as_of_time, valid_plans)
    for ce in cons_events:
        print(f"[CONSENSUS DETECTED] {ce['agreeing_count']} AIs agree on {ce['direction'].upper()} ({ce['entry_range']})")
        notifier.send_consensus_alert(ce)


def main():
    parser = argparse.ArgumentParser(description="Startify — XAUUSD Multi-AI Paper Trader CLI")
    sub = parser.add_subparsers(dest="cmd")

    p_run = sub.add_parser("run-once", help="Run a single hourly evaluation cycle across all 8 AI agents")
    p_run.add_argument("--time", default="2026-11-15T14:00:00Z")
    p_run.add_argument("--dry-run-discord", action="store_true", default=True)

    sub.add_parser("backtest", help="Run baseline OTE rule backtest on H1 XAUUSD")
    sub.add_parser("seed", help="Seed SQLite DB and export arenaSnapshot.json for Web UI")

    args = parser.parse_args()
    if args.cmd == "backtest":
        candles = PriceProvider().get_closed_candles("H1", "2026-11-15T14:00:00Z", limit=180)
        res = BacktestRunner(initial_equity=1000.0).run_baseline_ote(candles)
        print(json.dumps(res, indent=2))
    elif args.cmd == "seed":
        from api.seed_demo import seed_arena_database
        out_json = BASE_DIR / "web" / "src" / "data" / "arenaSnapshot.json"
        seed_arena_database(out_json)
    else:
        run_single_cycle(getattr(args, "time", "2026-11-15T14:00:00Z"))


if __name__ == "__main__":
    main()
