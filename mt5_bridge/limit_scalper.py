"""Fail-closed MT5 pending-limit order planner. No order is sent by this module."""
from dataclasses import dataclass
from math import isfinite

@dataclass(frozen=True)
class LimitPlan:
    side: str
    entry: float
    sl: float
    tp: float
    expected_net_reward: float
    expected_net_r: float
    expiration_seconds: int

def build_limit_plan(*, side, bid, ask, proposed_entry, stop_distance,
                     target_distance, point, digits, stops_level_points,
                     commission_roundtrip_price, slippage_buffer_price,
                     min_net_r=1.0, expiration_seconds=60):
    """Price distances are in instrument price units, not broker points.

    Conservative cost budget includes the current spread even though a limit
    might obtain price improvement. Returns None when economics are invalid.
    """
    values=(bid,ask,proposed_entry,stop_distance,target_distance,point,
            commission_roundtrip_price,slippage_buffer_price,min_net_r)
    if any(not isfinite(float(v)) for v in values): return None
    if side not in ('BUY','SELL') or bid<=0 or ask<=bid or point<=0: return None
    if stop_distance<=0 or target_distance<=0 or min_net_r<=0: return None
    if commission_roundtrip_price<0 or slippage_buffer_price<0: return None
    if not 15<=expiration_seconds<=300: return None
    if not 0<=digits<=10 or stops_level_points<0: return None
    entry=round(proposed_entry,digits)
    min_gap=max(point,stops_level_points*point)
    # Pending buy must be below current ask; pending sell above current bid.
    if side=='BUY' and not entry<=ask-min_gap: return None
    if side=='SELL' and not entry>=bid+min_gap: return None
    sl=round(entry-stop_distance if side=='BUY' else entry+stop_distance,digits)
    tp=round(entry+target_distance if side=='BUY' else entry-target_distance,digits)
    if min(abs(entry-sl),abs(entry-tp))<min_gap: return None
    spread=ask-bid
    cost=spread+commission_roundtrip_price+slippage_buffer_price
    net_reward=abs(tp-entry)-cost
    net_r=net_reward/(abs(entry-sl)+cost)
    if net_reward<=0 or net_r<min_net_r: return None
    return LimitPlan(side,entry,sl,tp,net_reward,net_r,expiration_seconds)
