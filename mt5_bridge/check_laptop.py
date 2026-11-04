"""Preflight for the Windows laptop DEMO-only bridge launcher.

Does not make trades or read stored MT5 passwords. Fails closed when the
selected MetaTrader account is not a demo account.
"""
from __future__ import annotations

import os
import struct
import sys
from pathlib import Path

from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")


def fail(message: str) -> None:
    print("NOT READY:", message, flush=True)
    sys.exit(1)


def main() -> None:
    if sys.platform != "win32":
        fail("This launcher requires Windows with the MT5 desktop terminal.")
    if struct.calcsize("P") != 8:
        fail("Install 64-bit Python 3.11 or 3.12.")
    if not (3, 11) <= sys.version_info[:2] <= (3, 12):
        fail("Use Python 3.11 or 3.12 x64 for this setup.")

    url = os.getenv("SITE_URL", "").strip().rstrip("/")
    token = os.getenv("MT5_BRIDGE_TOKEN", "").strip()
    symbol = os.getenv("MT5_SYMBOL", "").strip()
    if not url.startswith("https://"):
        fail("Set SITE_URL to the HTTPS Render site in .env.")
    if len(token) < 24 or token.startswith("put-the-"):
        fail("Set the same strong MT5_BRIDGE_TOKEN as the Render site secret.")
    if not symbol:
        fail("Set MT5_SYMBOL to the exact Exness gold symbol in Market Watch.")
    if os.getenv("LIVE_TRADING", "").strip().lower() != "false":
        fail("Set LIVE_TRADING=false. This laptop launcher supports demo only.")
    if os.getenv("SCALP_DEMO_MODE", "").strip().lower() != "true":
        fail("Set SCALP_DEMO_MODE=true for virtual scalp testing.")

    try:
        import MetaTrader5 as mt5
    except ImportError:
        fail("MetaTrader5 package missing; run setup_laptop.bat.")

    path = os.getenv("MT5_TERMINAL_PATH", "").strip()
    initialized = mt5.initialize(path=path) if path else mt5.initialize()
    if not initialized:
        fail("Open and sign in to MetaTrader 5 first. Check MT5_TERMINAL_PATH if needed.")
    try:
        account = mt5.account_info()
        if account is None:
            fail("Log in to an Exness demo account inside MT5.")
        if int(getattr(account, "trade_mode", -1)) != mt5.ACCOUNT_TRADE_MODE_DEMO:
            fail("A real account is selected. Switch MT5 to an Exness DEMO account.")
        info = mt5.symbol_info(symbol)
        if info is None:
            fail("MT5_SYMBOL not found. Copy the exact gold symbol from Market Watch.")
        if not info.visible and not mt5.symbol_select(symbol, True):
            fail("The broker symbol could not be activated in Market Watch.")
        print("READY: Windows x64, demo account, broker symbol, safe config.")
        print("The bridge will send gold tick/candle data to the configured HTTPS site.")
        if os.getenv("SEND_ACCOUNT_DETAILS", "false").lower() == "true":
            print("PRIVACY NOTICE: SEND_ACCOUNT_DETAILS=true sends login and balances to the site.")
        else:
            print("PRIVACY: Account login and balances stay on this laptop.")
        print("NO real orders are permitted by this launcher.")
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
