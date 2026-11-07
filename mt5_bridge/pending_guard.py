"""Pure fail-closed checks for broker-owned resting LIMIT orders.

Does not import MT5, place trades or cancel any order on its own.
"""


def pending_cancel_reason(*, response, last_signal_id, local_kill,
                          broker_symbol, tick_age_ms, spread_points,
                          max_tick_age_ms, max_spread_points, now_ms):
    """Return why an existing Qannas LIMIT must be canceled, or None.

    A pending order is an executable broker instruction. If the server stops
    approving it, it must not simply remain until its broker-side expiry.
    """
    if local_kill:
        return 'local_kill_switch'
    if tick_age_ms is None or tick_age_ms < 0 or tick_age_ms > max_tick_age_ms:
        return 'stale_broker_quote'
    if spread_points is None or spread_points < 0 or spread_points > max_spread_points:
        return 'spread_expanded'
    if not isinstance(response, dict) or response.get('ok') is not True:
        return 'remote_signal_unavailable'
    if response.get('allowed') is not True:
        return 'remote_execution_blocked'
    if response.get('brokerSymbolHint') != broker_symbol:
        return 'broker_symbol_changed'
    signal = response.get('signal')
    if not isinstance(signal, dict) or not signal.get('id'):
        return 'remote_signal_missing'
    if not last_signal_id or str(signal['id']) != str(last_signal_id):
        return 'signal_changed'
    try:
        expiry = int(response.get('expiresAt', 0))
    except (TypeError, ValueError):
        return 'bad_signal_expiry'
    if expiry <= now_ms:
        return 'signal_expired'
    return None
