import unittest

from api.arena_engine import (
    MODEL_DISCORD_COLORS,
    get_state,
    realtime_tick,
    run_autonomous_scan,
    send_user_chat,
    train_ais,
)


class ArenaV8Tests(unittest.TestCase):
    def test_train_all_8_ais_for_nov17(self):
        state = train_ais()
        self.assertEqual(len(state["ais"]), 8)
        for ai in state["ais"]:
            self.assertTrue(ai.get("nov17_ready"))
            self.assertTrue(any("[Trained • Nov 17 Ready]" in r for r in ai["playbook"]))
        self.assertIn("avg_atr_h1", state.get("training_baseline", {}))

    def test_autonomous_scan_and_discord_model_color(self):
        res = run_autonomous_scan()
        preview = res["discord"]["embed_preview"]
        scanned_name = res["scanned_ai"]
        self.assertEqual(preview["title"], scanned_name)
        matched = [a for a in res["state"]["ais"] if a["display_name"] == scanned_name]
        self.assertTrue(matched)
        expected_color = MODEL_DISCORD_COLORS[matched[0]["agent_id"]]
        self.assertEqual(preview["color"], expected_color)
        self.assertTrue(len(preview.get("fields", [])) >= 3)

    def test_commander_interactive_chat(self):
        res = send_user_chat("Status check for Nov 17 open?", target_agent_id="ai-1")
        self.assertIn("reply", res)
        self.assertEqual(res["responder"], "Claude Sonnet 4")
        state = get_state()
        self.assertEqual(state["chat"][0]["agent_name"], "Claude Sonnet 4")
        self.assertEqual(state["chat"][1]["agent_name"], "Commander (You)")

    def test_realtime_tick_persists(self):
        state = realtime_tick()
        self.assertIn("total_balance", state["cockpit"])
        self.assertGreater(state["cockpit"]["total_balance"], 0)


if __name__ == "__main__":
    unittest.main()
