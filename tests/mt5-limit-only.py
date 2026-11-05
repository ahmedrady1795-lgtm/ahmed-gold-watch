"""Pure pending-LIMIT checks; no broker/account imports and no trades."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'mt5_bridge'))
from limit_scalper import build_limit_plan

def plan(side,entry,**kw):
    return build_limit_plan(side=side,bid=100.2,ask=100.25,proposed_entry=entry,
        stop_distance=1,target_distance=3,point=.01,digits=2,
        stops_level_points=2,commission_roundtrip_price=0,
        slippage_buffer_price=.02,min_net_r=1.25,expiration_seconds=30,**kw)
buy=plan('BUY',100)
assert buy and buy.entry==100 and buy.sl==99 and buy.tp==103
assert buy.expected_net_reward>0 and buy.expiration_seconds==30
assert plan('BUY',100.21) is None, 'BUY_LIMIT must be below bid, not in spread'
sell=plan('SELL',100.5)
assert sell and sell.entry==100.5 and sell.sl==101.5 and sell.tp==97.5
assert plan('SELL',100.24) is None, 'SELL_LIMIT must be above ask, not in spread'
assert build_limit_plan(side='BUY',bid=100.2,ask=100.25,proposed_entry=99,
    stop_distance=1,target_distance=3,point=.01,digits=2,
    stops_level_points=2,commission_roundtrip_price=0,
    slippage_buffer_price=.02,min_net_r=1.25,expiration_seconds=10) is None
bridge=Path(__file__).resolve().parent.parent.joinpath('mt5_bridge/bridge.py').read_text()
assert 'TRADE_ACTION_DEAL' not in bridge, 'future MT5 bridge must not enter market'
assert "'action':mt5.TRADE_ACTION_PENDING" in bridge
assert 'ORDER_TYPE_BUY_LIMIT' in bridge and 'ORDER_TYPE_SELL_LIMIT' in bridge
assert 'ORDER_TIME_SPECIFIED' in bridge and 'TRADE_RETCODE_PLACED' in bridge
assert 'orders_get(symbol=SYMBOL)' in bridge
assert "s['demo_pending']=pending" in bridge
assert 'SCALP DEMO LIMIT FILLED' in bridge
print('PASS: pending MT5 buy/sell limit geometry, no market action, time expiry and order cap')
