import json
import unittest
from unittest.mock import MagicMock, patch

from agents.desk_roles import DESK_ROLES, SpecializedDeskCoordinator
from data.orderflow_provider import OrderflowProvider
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

    def test_specialized_desk_8_roles_and_blackout_gate(self):
        self.assertEqual(len(DESK_ROLES), 8)
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

    def test_discord_notifier_entry_signal_formatting(self):
        notifier = DiscordNotifier(webhook_url="https://discord.com/api/webhooks/123456/abcdef")
        self.assertTrue(notifier.is_configured())

        coordinator = SpecializedDeskCoordinator()
        plan = coordinator.evaluate_desk(
            snapshot={"price": 4020.0, "trend_h4": "bullish", "atr_h1": 6.5, "ote": {"zone_low": 4015.0, "zone_high": 4025.0, "sweet_spot": 4020.0, "invalidation": 4008.0}},
            orderflow={"net_delta": 12.0, "delta_bias": "bullish", "open_interest_paxg": 25000.0, "bid_wall": {"price": 4016.0, "qty": 20.0}, "ask_wall": {"price": 4030.0, "qty": 18.0}},
            portfolio_equity=1000.0,
            news_blackout_active=False,
        )

        mock_resp = MagicMock()
        mock_resp.status = 204
        mock_resp.__enter__.return_value = mock_resp
        mock_resp.__exit__.return_value = False

        with patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
            result = notifier.send_entry_signal(plan)

        self.assertTrue(result["sent"])
        self.assertEqual(result["status"], 204)
        req_arg = mock_urlopen.call_args[0][0]
        body = json.loads(req_arg.data.decode("utf-8"))
        self.assertEqual(body["username"], "Startify Quant Desk")
        self.assertIn("XAUUSD LONG SIGNAL", body["embeds"][0]["title"])
        votes_field = body["embeds"][0]["fields"][-1]
        self.assertEqual(votes_field["name"], "8-AI Specialist Votes")
        self.assertIn("Gemini 3.8", votes_field["value"])


if __name__ == "__main__":
    unittest.main()
