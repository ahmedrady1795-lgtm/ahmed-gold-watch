# Gold read-only bridge: MT5 Exness Demo -> existing Render Al-Qannas

The file [AlQannas_Gold_ReadOnly_Bridge.mq5](AlQannas_Gold_ReadOnly_Bridge.mq5)
is a market-data bridge, not an automatic trading robot. It never sends or closes broker orders.

## Same existing VPS, no new server

1. On the existing Windows VPS, open MT5 using the Exness **Demo** account.
2. Download AlQannas_Gold_ReadOnly_Bridge.mq5 and put it in
   File > Open Data Folder > MQL5 > Experts.
3. In MetaEditor (F4), open that source and compile with F7. Stop if any errors.
4. Open a **separate** gold chart XAUUSDm H1; keep AlQannas_Gold_M1_Limit_Demo
   (trading EA) on its own XAUUSDm M1 chart. MT5 only attaches one EA per chart.
5. MT5 Tools > Options > Expert Advisors > Allow WebRequest for listed URL
   and ADD https://ahmed-gold-watch-free.onrender.com .
6. Drag AlQannas_Gold_ReadOnly_Bridge from Navigator > Expert Advisors
   to the separate gold H1 chart. In Inputs:
   - InpSiteUrl = https://ahmed-gold-watch-free.onrender.com
   - InpBridgeToken = the SAME secret configured in Render as MT5_BRIDGE_TOKEN.
     Never paste the token in public screenshots or chat. Do not make a second token
     unless the Render endpoint is also updated to match.
   - InpTickPushSeconds = 2, InpCandlePushSeconds = 15, InpCandleCount = 300
   - Allow Algo Trading (necessary for EA timers and WebRequest in your MT5 environment).
7. Check the Experts tab: "AQ Gold Bridge: connected HTTP 200".
   If HTTP 401: Render token mismatch; HTTP -1/MT5 error 4014 or 520x:
   check MT5 WebRequest allowlist, enabled Algo Trading, internet/SSL, and the URL.
8. On Render check https://ahmed-gold-watch-free.onrender.com/api/mt5/status
   Expected when running with the market open:
   connected=true, fresh=true; candlesFresh=true only after M1/M5/M15/H1
   histories load and a candle batch is accepted. If MT5 market is closed
   or history hasn't loaded, these states can be false.

## Important architecture limits
- The bridge only sends sanitized gold quote, broker closed candles and available
  depth-of-market snapshots to the existing /api/mt5/status endpoint.
  It does **not** read AI decisions from Render and does **not** cause the trading EA
  to follow the website's Ambush signals. A separate, explicitly validated
  trade-signal bridge would be required for that.
- MT5 WebRequest is synchronous and supported in EA, not in Strategy Tester.
- Without DOM offered by Exness for the symbol, orderBook.available=false;
  it must not be presented as actual exchange order flow.
- Render's current in-memory MT5 state requires regular requests and may disappear
  on restarts/scale changes. This bridge retries at its configured interval.
- Do NOT attach another data bridge that posts BTC to the Gold endpoint.
- This is DEMO-only and should remain so while validating the setup.
