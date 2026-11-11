"""Pure quote-level helpers for the VIRTUAL gold M1 limit-order demo.

These functions never connect to MetaTrader 5 or submit an order.
"""
from math import isfinite


def limit_entry(side, bid, ask, point, digits, stops_level_points=0):
    """Find a valid resting BUY_LIMIT/SELL_LIMIT price, never a market entry."""
    values = (bid, ask, point, stops_level_points)
    if side not in ("BUY", "SELL") or any(not isfinite(float(v)) for v in values):
        return None
    if bid <= 0 or ask <= bid or point <= 0 or stops_level_points < 0:
        return None
    if not isinstance(digits, int) or not 0 <= digits <= 10:
        return None
    gap = max(point, stops_level_points * point)
    raw = min(bid, ask - gap) if side == "BUY" else max(ask, bid + gap)
    price = round(raw, digits)
    if price <= 0:
        return None
    if side == "BUY" and price > ask - gap + point * 0.01:
        return None
    if side == "SELL" and price < bid + gap - point * 0.01:
        return None
    return price


def limit_touched(side, entry, bid, ask):
    """BUY fills only if ask reaches limit; SELL only if bid reaches limit."""
    if side == "BUY":
        return ask <= entry
    if side == "SELL":
        return bid >= entry
    return False


def exit_reason(net_usd, min_profit_usd, max_loss_usd, elapsed_seconds,
                max_hold_seconds, stop_touched=False):
    """Allow a losing position time to recover, but never wait without a stop."""
    if stop_touched or net_usd <= -max_loss_usd:
        return "STOP_LOSS"
    if net_usd >= min_profit_usd:
        return "QUICK_NET_PROFIT"
    if elapsed_seconds >= max_hold_seconds:
        return "MAX_HOLD"
    return None
