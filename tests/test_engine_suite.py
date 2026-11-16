import unittest
from agents.base_agent import AITraderAgent
from agents.control_bots import RuleBasedOTEBot
from agents.playbook_manager import PlaybookManager
from consensus.detector import ConsensusDetector
from data.news_provider import USDNewsProvider
from data.price_provider import PriceProvider
from data.quality_check import DataQualityChecker
from db.database import init_db, query_all
from indicators.fib_ote import ote_zone
from indicators.snapshot import SnapshotBuilder
from notify.discord import DiscordNotifier
from paper.engine import PaperTradingEngine
from postmortem.writer import PostMortemWriter
from risk.money_management import calc_lot
from risk.validator import PlanValidator


class TestStartifyEngineSuite(unittest.TestCase):
    def test_fib_ote_zone_long_and_short(self):
        long_ote = ote_zone(3980.0, 4030.0, "long")
        self.assertAlmostEqual(long_ote["zone_high"], 3999.0, places=2)
        self.assertAlmostEqual(long_ote["zone_low"], 3990.5, places=2)
        self.assertAlmostEqual(long_ote["sweet_spot"], 3994.75, places=2)
        self.assertAlmostEqual(long_ote["invalidation"], 3980.0, places=2)
        # -0.27 extension: 4030 + 0.27 * 50 = 4043.50; -0.618 extension: 4030 + 0.618 * 50 = 4060.90
        self.assertAlmostEqual(long_ote["tp1_neg_027"], 4043.5, places=2)
        self.assertAlmostEqual(long_ote["tp2_neg_0618"], 4060.9, places=2)

        short_ote = ote_zone(3980.0, 4030.0, "short")
        self.assertAlmostEqual(short_ote["zone_low"], 4011.0, places=2)
        self.assertAlmostEqual(short_ote["zone_high"], 4019.5, places=2)
        self.assertAlmostEqual(short_ote["sweet_spot"], 4015.25, places=2)
        self.assertAlmostEqual(short_ote["invalidation"], 4030.0, places=2)
        # -0.27 extension short: 3980 - 0.27 * 50 = 3966.50; -0.618 extension short: 3980 - 0.618 * 50 = 3949.10
        self.assertAlmostEqual(short_ote["tp1_neg_027"], 3966.5, places=2)
        self.assertAlmostEqual(short_ote["tp2_neg_0618"], 3949.1, places=2)

    def test_mtf_warmup_and_breakeven_partial_close(self):
        provider = PriceProvider()
        mtf = provider.get_multi_timeframe_bundle("2026-11-12T14:00:00Z")
        for tf in ("H4", "H1", "M15", "M5"):
            self.assertIn(tf, mtf)
            self.assertGreater(len(mtf[tf]), 20)

        warmup = provider.analyze_historical_warmup("2026-11-12T14:00:00Z")
        self.assertEqual(warmup["status"], "WARMUP_COMPLETE")
        self.assertGreater(warmup["tp1_neg_027_hit_rate_pct"], 50.0)

        # Verify Partial Close at -0.27 + Break-Even ("กันหน้าทุน") save on reversal
        engine = PaperTradingEngine(initial_equity=1000.0, slippage=0.0, breakeven_buffer_usd=0.50)
        order = {
            "action": "long",
            "order_type": "limit",
            "entry": 4000.0,
            "stop_loss": 3992.0,
            "be_trigger_price": 4007.0,
            "take_profits": [
                {"price": 4012.0, "close_pct": 50, "fib_level": "-0.27"},
                {"price": 4024.0, "close_pct": 50, "fib_level": "-0.618"},
            ],
            "lot": 0.02,
            "risk_usd": 16.0,
        }
        bars = [
            {"time": "2026-11-12T10:00:00Z", "open": 4002.0, "high": 4005.0, "low": 3999.5, "close": 4004.0},
            {"time": "2026-11-12T11:00:00Z", "open": 4004.0, "high": 4013.5, "low": 4003.5, "close": 4011.0},
            {"time": "2026-11-12T12:00:00Z", "open": 4011.0, "high": 4012.0, "low": 3998.0, "close": 3999.0},
        ]
        res = engine.simulate_bar_execution(order, bars)
        self.assertTrue(res["filled"])
        self.assertTrue(res["partial_closed_neg027"])
        self.assertTrue(res["tp1_breakeven_triggered"])
        self.assertTrue(res["be_saved_trade"])
        # 50% (0.01 lot) closed at 4012 (+12 USD) + 50% (0.01 lot) stopped at Break-Even 4000.5 (+0.50 USD) = +$12.50!
        self.assertAlmostEqual(res["pnl_usd"], 12.5, places=2)

    def test_calc_lot_1000_equity(self):
        # $1,000 equity, 1% risk = $10 risk, SL distance $5 -> 0.02 lot
        lot, actual_risk = calc_lot(1000.0, 1.0, 4000.0, 3995.0)
        self.assertEqual(lot, 0.02)
        self.assertEqual(actual_risk, 10.0)

        # Rounds down to 0.01 lot when raw_lot is 0.019
        lot2, actual_risk2 = calc_lot(1000.0, 1.0, 4000.0, 3994.5)
        self.assertEqual(lot2, 0.01)
        self.assertEqual(actual_risk2, 5.5)

    def test_usd_only_news_filter_and_blackout(self):
        news = USDNewsProvider(blackout_before_min=45, blackout_after_min=45)
        mixed_events = [
            {"event": "FOMC Rate Decision", "currency": "USD", "time": "2026-11-16T19:00:00Z"},
            {"event": "ECB Rate Decision", "currency": "EUR", "time": "2026-11-16T13:00:00Z"},
            {"event": "BOJ Policy Statement", "currency": "JPY", "time": "2026-11-16T04:00:00Z"},
        ]
        filtered = news.filter_usd_only(mixed_events)
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["currency"], "USD")

        in_blk, reason = news.is_in_news_blackout("2026-11-16T18:30:00Z", filtered)
        self.assertTrue(in_blk)
        self.assertIn("FOMC", reason)

    def test_validator_and_conservative_sl_first_paper_engine(self):
        validator = PlanValidator()
        snap = {
            "price": 4005.0,
            "news_blackout": False,
            "ote": {"zone_low": 4000.0, "zone_high": 4008.0, "sweet_spot": 4003.5, "invalidation": 3995.0},
        }
        acct = {"equity": 1000.0, "open_positions": [], "today_pnl": 0.0, "week_pnl": 0.0, "trades_today": 0}
        plan = {
            "action": "long",
            "order_type": "limit",
            "entry": 4003.5,
            "stop_loss": 3998.5,
            "take_profits": [{"price": 4014.5, "close_pct": 50}, {"price": 4018.5, "close_pct": 50}],
            "risk_pct": 1.0,
            "lot": 0.02,
            "confidence": 0.8,
            "style_tag": "OTE-Sniper",
            "reasoning": "Valid OTE setup",
            "invalid_if": "Below 3998.5",
        }
        ok, msg, norm = validator.validate(plan, snap, acct)
        self.assertTrue(ok, msg)
        self.assertEqual(norm["lot"], 0.02)

        # Conservative SL-first rule: if single bar hits both SL (3998.5) and TP (4018.5), must take SL!
        engine = PaperTradingEngine(initial_equity=1000.0, slippage=0.0)
        ambiguous_bars = [
            {"time": "2026-11-16T10:00:00Z", "open": 4004.0, "high": 4020.0, "low": 3997.0, "close": 4015.0}
        ]
        res = engine.simulate_bar_execution(norm, ambiguous_bars)
        self.assertTrue(res["filled"])
        self.assertLess(res["pnl_usd"], 0.0)
        self.assertEqual(res["exit_price"], 3998.5)

    def test_account_blowup_and_restart_at_1000(self):
        engine = PaperTradingEngine(initial_equity=1000.0, min_equity_pct=10.0)
        run1 = {
            "run_id": "ai-6-run-1",
            "agent_id": "ai-6",
            "run_number": 1,
            "start_time": "2026-10-01T00:00:00Z",
            "start_equity": 1000.0,
            "end_equity": 1000.0,
            "peak_equity": 1045.0,
            "max_drawdown_pct": 5.0,
            "playbook_version_end": "v2",
        }
        out = engine.check_and_handle_blowup("ai-6", run1, new_equity=88.0, as_of_time="2026-10-19T14:00:00Z")
        self.assertTrue(out["blown_up"])
        self.assertEqual(out["closed_run"]["end_reason"], "blowup")
        self.assertEqual(out["active_run"]["run_number"], 2)
        self.assertEqual(out["active_run"]["start_equity"], 1000.0)
        self.assertEqual(out["active_run"]["playbook_version_start"], "v2")

    def test_all_8_ai_agents_and_consensus_detection(self):
        provider = PriceProvider()
        candles = provider.get_closed_candles("H1", "2026-11-12T14:00:00Z", limit=60)
        qc = DataQualityChecker().check(candles, "2026-11-12T14:00:00Z")
        self.assertTrue(qc["passed"])

        snap = SnapshotBuilder().build("2026-11-12T14:00:00Z", candles)
        plans = []
        for idx, prov in enumerate(["gemini", "groq", "mistral", "openrouter", "cloudflare", "zai", "nvidia", "cohere"], start=1):
            cfg = {
                "agent_id": f"ai-{idx}",
                "display_name": f"Agent-{idx}",
                "provider": prov,
                "model_name": f"{prov}-model",
                "style_archetype": "OTE-Confluence",
            }
            pb = PlaybookManager().ensure_agent_playbook(cfg)
            agent = AITraderAgent(cfg, playbook_text=pb)
            decision = agent.decide(snap)
            plan = decision["plan"]
            plan["agent_id"] = cfg["agent_id"]
            plans.append(plan)
            self.assertIn(plan["action"], ("long", "short", "no_trade"))

        cons = ConsensusDetector(min_agreeing_agents=3, max_entry_diff_usd=5.0).detect("2026-11-12T14:00:00Z", plans)
        self.assertGreaterEqual(len(cons), 1)

        pm = PostMortemWriter().write_postmortem({
            "trade_id": "t-1",
            "agent_id": "ai-1",
            "action": "long",
            "entry": 4002.0,
            "stop_loss": 3996.0,
            "exit_price": 4015.0,
            "pnl_usd": 26.0,
            "r_multiple": 2.17,
            "session": "london",
            "style_tag": "OTE-0.705",
        })
        self.assertEqual(pm["outcome"], "win")

        notifier = DiscordNotifier(dry_run=True)
        sent = notifier.send_signal("ai-1", "Alpha-Gemini", plans[0], 1026.0)
        self.assertEqual(sent["channel"], "ai-1")

    def test_walk_forward_backtest_and_11_skills(self):
        from api.seed_demo import load_config
        from db.database import BASE_DIR
        from paper.backtester import HistoricalBacktestTrainer

        cfg = load_config()
        bt = HistoricalBacktestTrainer(BASE_DIR).run_all_agents_backtest(cfg["agents"])
        self.assertEqual(bt["status"], "COMPLETED")
        self.assertEqual(len(bt["skills_trained"]), 11)
        self.assertEqual(len(bt["agent_backtests"]), 8)
        self.assertGreaterEqual(bt["dataset"]["total_candles"], 2500)


if __name__ == "__main__":
    unittest.main()

