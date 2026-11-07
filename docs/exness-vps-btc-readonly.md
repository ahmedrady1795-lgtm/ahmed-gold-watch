# BTCUSDm on Exness VPS — read-only, separate from gold

The existing Qannas MQL5 adapter supports **both** `XAUUSDm` and `BTCUSDm` on a demo MT5 chart after the source update from this PR is re-downloaded and compiled. It picks a separate HTTPS route according to the chart symbol:

- XAUUSDm -> `POST /api/mt5/status` (existing gold broker quote)
- BTCUSDm -> `POST /api/mt5/btc-status` (new independent Bitcoin CFD quote)
- `GET /api/mt5/btc-status` is the public non-secret health/status endpoint.

The BTC quote is **an Exness Bitcoin CFD**, not Coinbase BTC/USD spot or Binance trades. This first phase does **not** substitute Exness candles into the existing Coinbase/Kraken paper scorer or assume execution fills. The new BTC endpoint records independent observed bid/ask, freshness, and when enough, authentic closed candles. It has **no broker order operations**.

## Steps on the user's already-connected Exness VPS

1. Before changing MT5, deploy the server changes to the existing Render **`render-free`** service (after reviews/tests). Do not use Railway or a second Qannas website. The Render repo has auto-deploy **disabled**.
2. On VPS, replace the prior `QannasReadOnlyBridge.mq5` source in MT5 **File -> Open Data Folder -> MQL5 -> Experts** with this updated file from the current PR. Back up the previous file. Open in MetaEditor and use **Compile**; do not continue unless `0 errors`.
3. Leave the existing GOLD EA on the `XAUUSDm` chart if desired. Open **a new `BTCUSDm` chart** through Market Watch (Ctrl+M). Never attach the BTC instance to the GOLD chart.
4. In Navigator -> Expert Advisors drag `QannasReadOnlyBridge` to the BTCUSDm chart. In Inputs set `QannasSymbol=BTCUSDm` and keep the private `QannasBridgeToken` matching the Render service. Never share that token in chat or screenshots. Server URL should remain `https://ahmed-gold-watch-free.onrender.com`.
5. MT5 -> Tools -> Options -> Expert Advisors: allow WebRequest for the HTTPS site URL as before; **do not enable Algo Trading, DLL imports, or broker execution**. This EA has no order code.
6. MT5 Experts / Journal should report `Qannas read-only bridge started on BTCUSDm`. For HTTP errors: 404 likely means server changes are **not deployed**, 401 token mismatch, -1 WebRequest blocked / network, 400 invalid broker feed payload.
7. On a phone open `https://ahmed-gold-watch-free.onrender.com/api/mt5/btc-status`. Look for `connected:true`, `fresh:true`, `candlesFresh:true` when broker markets are active and all 240/240/240/240 closed-bar histories are loaded.
8. Broker holidays, network stalls and Exness maintenance mean `fresh:false` should be expected at times; do **not** override freshness to make it green.

Exness crypto CFDs generally quote 24/7 except maintenance. No real-money activity is necessary to test this bridge; don't generate trades just to meet Exness's VPS turnover target. The environment secret previously shared outside the server should be rotated before enabling any real-money functionality.
