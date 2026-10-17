"""Offline XAUUSD history export from the user's logged-in MetaTrader 5 terminal.

No broker password, account number or orders are uploaded. This is a local,
read-only exporter. Keep data private; do not commit broker history to GitHub.
Example: python mt5_bridge/export_gold_history.py --years 5 --symbol XAUUSDm
"""
import argparse
import calendar
import csv
import gzip
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from math import isfinite

FRAMES = {"M1": 1, "M5": 5, "M15": 15, "H1": 60}
HEADER = ["time", "open", "high", "low", "close", "tick_volume", "spread", "real_volume"]


def months(start, end):
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        a = datetime(year, month, 1, tzinfo=timezone.utc)
        ny, nm = (year + 1, 1) if month == 12 else (year, month + 1)
        b = min(datetime(ny, nm, 1, tzinfo=timezone.utc), end)
        if b > a:
            yield a, b
        year, month = ny, nm


def main():
    parser = argparse.ArgumentParser(description="Local, read-only MT5 XAUUSD history exporter")
    parser.add_argument("--years", type=int, default=5, choices=range(1, 11))
    parser.add_argument("--symbol", default="XAUUSDm")
    parser.add_argument("--output", default="local-data/gold-history")
    parser.add_argument("--terminal", default=None, help="Optional path to logged-in terminal64.exe")
    args = parser.parse_args()
    try:
        import MetaTrader5 as mt5
    except ImportError as exc:
        raise SystemExit("Install MT5 Windows Python dependencies: pip install MetaTrader5") from exc

    kwargs = {"path": args.terminal} if args.terminal else {}
    if not mt5.initialize(**kwargs):
        raise SystemExit(f"MT5 initialize failed: {mt5.last_error()}")
    try:
        if not mt5.symbol_select(args.symbol, True):
            raise SystemExit(f"MT5 cannot select symbol {args.symbol}: {mt5.last_error()}")
        end = datetime.now(timezone.utc)
        start = datetime(end.year - args.years, end.month, 1, tzinfo=timezone.utc)
        dest = Path(args.output)
        dest.mkdir(parents=True, exist_ok=True)
        manifest = {"format": "qannas-mt5-history-v1", "symbol": args.symbol,
                    "timezone": "UTC", "source": "USER_MT5_TERMINAL",
                    "exported_at": end.isoformat(), "frames": {}}
        for label, minutes in FRAMES.items():
            tf = getattr(mt5, "TIMEFRAME_" + label)
            recorded = 0
            files = []
            for a, b in months(start, end):
                # MT5 supplies Unix timestamps (seconds); use UTC-aware dates.
                rates = mt5.copy_rates_range(args.symbol, tf, a, b)
                if rates is None:
                    print("MT5 history missing:", label, a.strftime("%Y-%m"), mt5.last_error())
                    continue
                seen = set()
                valid = []
                for item in rates:
                    t = int(item["time"])
                    o, h, l, c = (float(item[k]) for k in ("open", "high", "low", "close"))
                    if (t in seen or t % (minutes * 60) or not a.timestamp() <= t < b.timestamp()
                            or not all(isfinite(x) for x in (o, h, l, c))
                            or l <= 0 or l > min(o, c) or h < max(o, c)):
                        continue
                    seen.add(t)
                    valid.append([t, o, h, l, c, int(item["tick_volume"]),
                                  int(item["spread"]), int(item["real_volume"])])
                valid.sort(key=lambda x: x[0])
                if not valid:
                    continue
                name = f"{args.symbol}-{label}-{a:%Y-%m}.csv.gz"
                path = dest / name
                # Stable compression; a partial file is never advertised as complete.
                temp = path.with_suffix(path.suffix + ".tmp")
                with gzip.open(temp, "wt", encoding="utf-8", newline="") as file:
                    writer = csv.writer(file)
                    writer.writerow(HEADER)
                    writer.writerows(valid)
                temp.replace(path)
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                files.append({"name": name, "count": len(valid),
                              "start": valid[0][0], "end": valid[-1][0],
                              "sha256": digest})
                recorded += len(valid)
                print(label, a.strftime("%Y-%m"), "closed bars:", len(valid), flush=True)
            manifest["frames"][label] = {"count": recorded, "files": files}
        (dest / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print("Done. Local archive:", dest.resolve())
        if manifest["frames"]["M1"]["count"] < 100000:
            print("WARNING: Limited MT5 chart history. Increase Max bars in chart / "
                  "load broker history; this archive is NOT five complete years.")
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
