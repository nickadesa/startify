import tempfile
import unittest
from pathlib import Path

from api.competition_engine import (
    close_position,
    create_room,
    ensure_seeded,
    get_profile,
    get_weekly_leaderboard,
    join_room,
    login_user,
    place_order,
    propose_team_trade,
    register_user,
    toggle_follow,
    vote_team_proposal,
)
from db.database import init_db


class TopTierCompetitionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
        self.tmp.close()
        self.conn = init_db(self.tmp.name)
        ensure_seeded(self.conn)

    def tearDown(self) -> None:
        self.conn.close()
        Path(self.tmp.name).unlink(missing_ok=True)

    def test_auth_profile_and_follow(self) -> None:
        reg = register_user(self.conn, "trader_one", "one@toptier.club", "secret123")
        self.assertIn("token", reg)
        self.assertEqual(reg["user"]["username"], "trader_one")
        self.assertEqual(reg["user"]["rank_tier"], "Bronze")

        log = login_user(self.conn, "trader_one", "secret123")
        self.assertEqual(log["user"]["id"], reg["user"]["id"])

        res = toggle_follow(self.conn, reg["user"]["id"], "apex_kai")
        self.assertTrue(res["following"])
        prof = get_profile(self.conn, "apex_kai", reg["user"]["id"])
        self.assertTrue(prof["is_following"])

    def test_demo_order_execution_and_pnl(self) -> None:
        reg = register_user(self.conn, "scalper_x", "sx@toptier.club", "secret123")
        uid = reg["user"]["id"]
        acc_id = f"acc_demo_{uid}"

        pos = place_order(self.conn, uid, acc_id, "NAS100", "LONG", "market", 21000.0, 21000.0, 25, 20900.0, 21200.0)
        self.assertEqual(pos["status"], "OPEN")

        closed = close_position(self.conn, uid, pos["id"], 21100.0)
        self.assertEqual(closed["status"], "CLOSED")
        self.assertGreater(closed["pnl_usd"], 90.0)

    def test_weekly_leaderboard_populated(self) -> None:
        lb = get_weekly_leaderboard(self.conn)
        self.assertGreaterEqual(len(lb), 8)
        self.assertEqual(lb[0]["rank_tier"], "Champion")

    def test_team_room_2v2_voting_executes_trade(self) -> None:
        u1 = register_user(self.conn, "mate_a1", "a1@toptier.club", "secret123")["user"]
        u2 = register_user(self.conn, "mate_a2", "a2@toptier.club", "secret123")["user"]
        u3 = register_user(self.conn, "mate_b1", "b1@toptier.club", "secret123")["user"]

        rm = create_room(self.conn, u1, "2v2 Test Arena", "2v2", "public", 60, 10000.0, "All Markets", 50, "majority")
        code = rm["room"]["code"]
        join_room(self.conn, u2, code, "A")
        join_room(self.conn, u3, code, "B")

        prop_res = propose_team_trade(self.conn, u1, code, "XAUUSD", "LONG", "market", 3875.0, 5000.0, 25, 3850.0, 3920.0)
        self.assertFalse(prop_res["executed"])
        prop_id = prop_res["proposal"]["id"]

        vote_res = vote_team_proposal(self.conn, u2, prop_id, "approve")
        self.assertTrue(vote_res["executed"])
        self.assertEqual(vote_res["proposal"]["status"], "approved")


if __name__ == "__main__":
    unittest.main()
