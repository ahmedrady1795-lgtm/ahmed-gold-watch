"""Unit checks; never connect to MT5 or send broker orders."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'mt5_bridge'))
from pending_guard import pending_cancel_reason

BASE = dict(
    response={'ok': True, 'allowed': True, 'brokerSymbolHint': 'XAUUSDm',
              'signal': {'id': 'gold-001'}, 'expiresAt': 199000},
    last_signal_id='gold-001', local_kill=False, broker_symbol='XAUUSDm',
    tick_age_ms=250, spread_points=20, max_tick_age_ms=5000,
    max_spread_points=100, now_ms=100000,
)

def reason(**changed):
    return pending_cancel_reason(**{**BASE, **changed})

assert reason() is None
assert reason(local_kill=True) == 'local_kill_switch'
assert reason(response=None) == 'remote_signal_unavailable'
assert reason(response={'ok': False}) == 'remote_signal_unavailable'
assert reason(response={**BASE['response'], 'allowed': False}) == 'remote_execution_blocked'
assert reason(response={**BASE['response'], 'brokerSymbolHint': 'OTHER'}) == 'broker_symbol_changed'
assert reason(response={**BASE['response'], 'signal': {'id': 'gold-002'}}) == 'signal_changed'
assert reason(last_signal_id='') == 'signal_changed'
assert reason(tick_age_ms=5001) == 'stale_broker_quote'
assert reason(tick_age_ms=-1) == 'stale_broker_quote'
assert reason(spread_points=101) == 'spread_expanded'
assert reason(response={**BASE['response'], 'expiresAt': 99999}) == 'signal_expired'
assert reason(response={**BASE['response'], 'expiresAt': 'oops'}) == 'bad_signal_expiry'

bridge = Path(__file__).resolve().parent.parent.joinpath('mt5_bridge/bridge.py').read_text('utf-8')
assert "if not LIVE:return" in bridge
assert 'TRADE_ACTION_REMOVE' in bridge
assert 'reconcile_pending_orders(data,s)' in bridge
assert "reconcile_pending_orders(None,s)" in bridge
assert 'orders_get(symbol=SYMBOL)' in bridge
assert 'getattr(order,\'magic\',0)' in bridge
assert 'mt5.ORDER_TYPE_BUY_LIMIT' in bridge
assert 'mt5.ORDER_TYPE_SELL_LIMIT' in bridge
print('PASS: MT5 pending LIMIT cancellation fail-closed policy')
