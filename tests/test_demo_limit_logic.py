"""Regression checks for virtual M1 limit-order behavior (no MT5 needed)."""
import pathlib
import sys
import unittest

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1] / "mt5_bridge"))
from demo_limit_logic import limit_entry, limit_touched, exit_reason


class DemoLimitTests(unittest.TestCase):
    def test_buy_limit_is_below_ask_and_not_immediate_market(self):
        p=limit_entry("BUY",3300.10,3300.30,0.01,2,5)
        self.assertEqual(p,3300.10)
        self.assertFalse(limit_touched("BUY",p,3300.10,3300.30))
        self.assertTrue(limit_touched("BUY",p,3300.00,3300.10))

    def test_sell_limit_is_above_bid_and_not_immediate_market(self):
        p=limit_entry("SELL",3300.10,3300.30,0.01,2,5)
        self.assertEqual(p,3300.30)
        self.assertFalse(limit_touched("SELL",p,3300.10,3300.30))
        self.assertTrue(limit_touched("SELL",p,3300.30,3300.50))

    def test_stops_level_respected(self):
        self.assertEqual(limit_entry("BUY",3300.10,3300.30,0.01,2,30),3300.00)
        self.assertEqual(limit_entry("SELL",3300.10,3300.30,0.01,2,30),3300.40)

    def test_invalid_quotations_rejected(self):
        self.assertIsNone(limit_entry("BUY",3300,3300,0.01,2))
        self.assertIsNone(limit_entry("WAIT",3300,3301,0.01,2))
        self.assertIsNone(limit_entry("BUY",float("nan"),3301,0.01,2))

    def test_small_loss_is_allowed_time_to_recover(self):
        self.assertIsNone(exit_reason(-1.5,0.50,7.0,12,90))
        self.assertIsNone(exit_reason(0.15,0.50,7.0,30,90))
        self.assertEqual(exit_reason(0.50,0.50,7.0,30,90),"QUICK_NET_PROFIT")

    def test_loss_and_time_bound_are_never_disabled(self):
        self.assertEqual(exit_reason(-7.0,0.5,7.0,20,90),"STOP_LOSS")
        self.assertEqual(exit_reason(-1.5,0.5,7.0,90,90),"MAX_HOLD")
        self.assertEqual(exit_reason(-1.5,0.5,7.0,5,90,True),"STOP_LOSS")

    def test_stop_priority(self):
        self.assertEqual(exit_reason(2.0,0.5,7.0,10,90,True),"STOP_LOSS")


if __name__=="__main__":
    unittest.main()
