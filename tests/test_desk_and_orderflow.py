import json
import unittest
from unittest.mock import MagicMock, patch

from agents.desk_roles import ALTERNATIVE_FREE_MODELS, DESK_ROLES, SpecializedDeskCoordinator
from data.orderflow_provider import OrderflowProvider
from notifications.chart_renderer import render_setup_chart_png
from notifications.discord_webhook import DiscordNotifier


class TestDeskAndOrderflow(unittest.TestCase):
    def test_orderflow_provider_fallback_schema(self):
        provider = OrderflowProvider()
        with patch.object(provider, "_get_json", side_effect=RuntimeError("offline")):
            data = provider.get_live_orderflow(spot_xauusd_price=4025.0)
        self.assertEqual(data["symbol"], "PAXGUSDT")
        self.assertEqual(data["spot_proxy_xauusd"], 4025.0)
        self.assertIn("Fallback Snapshot", data["source"])
        self.assertEqual(len(data["footprint_buckets"]), 6)
        self.assertGreater(data["bid_wall"]["qty"], 0)
        self.assertGreater(data["ask_wall"]["qty"], 0)

    def test_m45_kline_aggregation(self):
        provider = OrderflowProvider()
        fake_raw = [
            [1700000000000 + i * 900000, "4000", str(4005 + i), str(3995 - i), str(4002 + i), "10.0", 0, "0", 0, "6.0"]
            for i in range(6)
        ]
        with patch.object(provider, "_get_json", return_value=fake_raw) as mock_get:
            bars = provider.get_live_klines(interval="M45", limit=10)
        self.assertIn("interval=15m", mock_get.call_args[0][0])
        self.assertEqual(len(bars), 2)
        self.assertEqual(bars[0]["high"], 4007.0)
        self.assertEqual(bars[0]["volume"], 30.0)

    def test_specialized_desk_8_roles_and_blackout_gate(self):
        self.assertEqual(len(DESK_ROLES), 8)
        self.assertGreaterEqual(len(ALTERNATIVE_FREE_MODELS), 4)
        coordinator = SpecializedDeskCoordinator()
        snapshot = {
            "price": 4020.0,
            "trend_h4": "bullish",
            "atr_h1": 7.0,
            "ote": {
                "zone_low": 4015.0,
                "zone_high": 4025.0,
                "sweet_spot": 4020.0,
                "invalidation": 4008.0,
            },
        }
        orderflow = {
            "net_delta": 18.5,
            "delta_bias": "bullish",
            "open_interest_paxg": 28450.0,
            "bid_wall": {"price": 4016.0, "qty": 24.0},
            "ask_wall": {"price": 4032.0, "qty": 19.0},
        }

        approved_plan = coordinator.evaluate_desk(
            snapshot=snapshot,
            orderflow=orderflow,
            portfolio_equity=1000.0,
            news_blackout_active=False,
        )
        self.assertTrue(approved_plan["approved"])
        self.assertEqual(approved_plan["direction"], "long")
        self.assertEqual(approved_plan["portfolio_equity"], 1000.0)
        self.assertEqual(len(approved_plan["specialist_votes"]), 8)
        self.assertGreaterEqual(approved_plan["aligned_count"], 5)
        self.assertGreaterEqual(approved_plan["conviction_score"], 65)
        self.assertGreater(approved_plan["tp3"], approved_plan["tp2"])
        self.assertGreater(approved_plan["tp2"], approved_plan["tp1"])

        blocked_plan = coordinator.evaluate_desk(
            snapshot=snapshot,
            orderflow=orderflow,
            portfolio_equity=1000.0,
            news_blackout_active=True,
        )
        self.assertFalse(blocked_plan["approved"])
        self.assertEqual(blocked_plan["specialist_votes"][6]["vote"], "block")
        self.assertEqual(blocked_plan["specialist_votes"][7]["vote"], "hold")

    def test_pure_python_chart_png_renderer(self):
        candles = [
            {"open": 4010 + i * 0.4, "high": 4012 + i * 0.4, "low": 4008 + i * 0.4, "close": 4011 + i * 0.4}
            for i in range(30)
        ]
        signal = {
            "direction": "long",
            "entry": 4020.0,
            "stop_loss": 4012.0,
            "tp1": 4026.0,
            "tp2": 4034.0,
            "tp3": 4045.0,
            "conviction_score": 85,
            "lot": 0.01,
            "risk_pct": 0.5,
        }
        png_bytes = render_setup_chart_png(candles=candles, signal=signal, ote={"zone_low": 4015.0, "zone_high": 4023.0})
        self.assertTrue(png_bytes.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertGreater(len(png_bytes), 2000)

    def test_discord_notifier_compact_signal_with_chart_attachment(self):
        notifier = DiscordNotifier(webhook_url="https://discord.com/api/webhooks/123456/abcdef")
        self.assertTrue(notifier.is_configured())

        coordinator = SpecializedDeskCoordinator()
        plan = coordinator.evaluate_desk(
            snapshot={"price": 4020.0, "trend_h4": "bullish", "atr_h1": 6.5, "ote": {"zone_low": 4015.0, "zone_high": 4025.0, "sweet_spot": 4020.0, "invalidation": 4008.0}},
            orderflow={"net_delta": 12.0, "delta_bias": "bullish", "open_interest_paxg": 25000.0, "bid_wall": {"price": 4016.0, "qty": 20.0}, "ask_wall": {"price": 4030.0, "qty": 18.0}},
            portfolio_equity=1000.0,
            news_blackout_active=False,
        )
        chart_png = render_setup_chart_png(candles=[], signal=plan)

        mock_resp = MagicMock()
        mock_resp.status = 204
        mock_resp.__enter__.return_value = mock_resp
        mock_resp.__exit__.return_value = False

        with patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
            result = notifier.send_entry_signal(plan, chart_png=chart_png)

        self.assertTrue(result["sent"])
        self.assertTrue(result["has_chart"])
        self.assertEqual(result["status"], 204)
        req_arg = mock_urlopen.call_args[0][0]
        self.assertIn("multipart/form-data", req_arg.headers["Content-type"])
        self.assertIn(b"attachment://xauusd_setup.png", req_arg.data)
        self.assertIn(b"Aligned", req_arg.data)
        self.assertNotIn(b"8-AI Specialist Votes", req_arg.data)


if __name__ == "__main__":
    unittest.main()
