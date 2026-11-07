# Native MT5 read-only bridge for the existing Exness VPS

File: [QannasReadOnlyBridge.mq5](../mt5_bridge/mql5/QannasReadOnlyBridge.mq5)

This is a **proposed native MQL5 adapter**, not a deployed or broker-tested EA. It has no transaction code: it only publishes the broker's XAUUSDm tick and authentic closed M1/M5/M15/H1 candles to the existing Render endpoint `POST /api/mt5/status`. It must be compiled with MetaEditor on the actual VPS and tested on the demo account before being considered operational.

## Installation and configuration

1. On the VPS Windows desktop, use Firefox to download the raw `.mq5` file from this PR branch. Keep it in the VPS filesystem, not on your iPhone.
2. MT5: `File → Open Data Folder → MQL5 → Experts`. Copy the `.mq5` file to this folder.
3. Open `Tools → MetaQuotes Language Editor` (or press F4); open the file and choose **Compile**. Fix any actual compiler errors before proceeding; source has not been compiled in the hosted connector.
4. Existing Render production service (`render-free`) must already have a private `MT5_BRIDGE_TOKEN` set as an environment secret. **Never paste or commit this token in GitHub, chat, screenshots, or files.** Generate it securely on your own machine.
5. MT5 `Tools → Options → Expert Advisors`: enable **Allow WebRequest for listed URL** and add exactly `https://ahmed-gold-watch-free.onrender.com`. **Do not turn on Algo Trading or DLL imports to test this read-only EA**.
6. Restart MT5 / refresh Navigator, open the `XAUUSDm` chart, attach `QannasReadOnlyBridge`. Set `QannasBridgeToken` privately in the EA inputs (32+ chars) to match the Render secret. Keep `QannasSymbol` equal to the actual MT5 chart symbol.
7. Check MT5's **Experts / Journal** tabs for status sync errors. HTTP 401 means the token is wrong; HTTP -1 often means the URL is missing from the allowed list (read the MQL error code); HTTP 503 can mean the server token is not configured.
8. Check the public, non-secret `https://ahmed-gold-watch-free.onrender.com/api/mt5/status` for `fresh:true` and `candlesFresh:true`. During market closure, quote freshness should be false. `candlesFresh` can remain false until enough completed history loads (>=80 M1 and >=220 for M5/M15/H1). This is normal; do not fabricate candles or force trades.

## Deliberate restrictions

- There is **no trading** on the broker account from this EA, real or demo. No ORDER_SEND, order placement, limit execution, or response-based commands are implemented.
- It publishes no password or account credentials. Authentication is a bearer token in the HTTP request headers, stored in private MT5 inputs and in Render secrets. Protect the VPS login and the saved EA settings.
- Production `MT5_AUTOTRADE_ENABLED=false` and the kill switch stay on; no order should be enabled by this adapter.
- Render free may cold-start. First HTTP requests can time out. A single successful call is not proof of durable connectivity.
- True order-flow/depth is **not** supplied by this read-only version; it only has native broker quote and candle tick-volume data. Never label this as consolidated CME order flow.
- Do not merge/deploy until code review and real MT5 Compile + demo heartbeat test are successful.

See the existing `docs/exness-vps-integration.md` for the separate Python bridge and risk controls. 
