// Gold STOP ladder source-contract checks. This does not compile MQL5 or prove profit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'mt5_bridge', 'Experts',
  'AlQannas_Gold_M1_Limit_Demo.mq5'), 'utf8');
const check=(pattern,reason)=>assert.match(src,pattern,reason);

check(/#property version\s+"1\.16"/,'v1.16 version present');
check(/ACCOUNT_TRADE_MODE_DEMO/,'demo only');
check(/SYMBOL_ORDER_STOP/,'broker supports STOP pending orders');
check(/g_trade\.BuyStop\(/,'places BUY STOP above ASK');
check(/g_trade\.SellStop\(/,'places SELL STOP below BID');
assert.doesNotMatch(src,/g_trade\.(?:BuyLimit|SellLimit|Buy|Sell)\(/,
  'new orders must NOT be limit or market orders');
check(/InpLots\s*=\s*0\.01/,'video-style starter volume');
check(/InpStopLevelsPerSide\s*=\s*3/,'3 ladder levels per side');
check(/InpFirstStopOffsetPrice\s*=\s*0\.30/,'first STOP offset');
check(/InpStopStepPrice\s*=\s*0\.30/,'STOP ladder step');
check(/InpMaxStopDistancePrice\s*=\s*1\.50/,'skip orders far from quote');
check(/InpMaxConcurrent\s*=\s*6/,'cap total pending plus positions');
check(/InpUseSignalFilter\s*=\s*false/,'2-sided ladder does not wait on M5');
check(/InpCancelOppositeOnFill\s*=\s*true/,'opposite-side pending cleanup after fill');
check(/RemoveOppositeStops\(openSide\)/,'opposite-side cancellation active');
check(/HasLegacyLimits\(\)/,'old LIMIT orders detected and canceled');
check(/InpManualPause\s*=\s*false/,'user-controlled pause');
check(/InpEnableDailyStop\s*=\s*false/,'user may enable daily loss guard');
check(/InpMaxLossUsd\s*=\s*3\.00/,'per-position intended risk target');
check(/InpProfitLockUsd\s*=\s*1\.50/,'requested profit lock');
check(/g_trade\.PositionModify\(ticket,proposed,currentTp\)/,'broker-side stop profit protection');
check(/OrderCalcProfit\(profitType,_Symbol,InpLots,entry,sl,worst\)/,'order loss calculation');
check(/TRADE_RETCODE_FROZEN/,'frozen broker order cooldown');
check(/bool trailingExit=\(protectedNet>0 && net<=protectedNet\)/,'profit trail handles gap');
check(/CancelPendingIfPossible\(ticket,reason\)/,'stale STOP cancel handles freeze');
check(/InpMaxPendingAgeSec\s*=\s*75/,'STOP pending max age');
check(/InpTradeDirection=AQ_BOTH/,'user controls trading side');
assert.doesNotMatch(src,/WebRequest\(/,'MT5 trading EA does not fetch website AI');
console.log('Gold v1.16 STOP ladder contract passed (compile/forward test still needed).');
