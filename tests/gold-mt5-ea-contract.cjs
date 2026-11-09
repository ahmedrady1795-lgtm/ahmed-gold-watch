// Static MQL5 source-contract checks, NOT a MetaEditor compile or profitability backtest.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','mt5_bridge','Experts',
  'AlQannas_Gold_M1_Limit_Demo.mq5'),'utf8');
const check=(pattern,why)=>assert.match(src,pattern,why);
check(/#property version\s+"1\.17"/,'v1.17 build');
check(/ACCOUNT_TRADE_MODE_DEMO/,'DEMO mode guard');
check(/InpOrderStyle=AQ_LIMIT_PULLBACK/,'LIMIT is the user-editable default');
check(/AQ_STOP_BREAKOUT=1/,'STOP ladder remains available in Inputs');
check(/g_trade\.BuyLimit\(/,'BUY LIMIT path exists');
check(/g_trade\.SellLimit\(/,'SELL LIMIT path exists');
check(/g_trade\.BuyStop\(/,'BUY STOP path exists');
check(/g_trade\.SellStop\(/,'SELL STOP path exists');
assert.doesNotMatch(src,/g_trade\.(?:Buy|Sell)\(/,'market orders are not used for entries');
check(/if\(InpOrderStyle==AQ_LIMIT_PULLBACK\)\s*\{\s*int side=LocalSignal\(\)/,
 'LIMIT entry uses the M1/M5 directional prediction instead of both-sided STOP ladder');
check(/if\(HasOtherModeOrders\(\)\)/,'no mixed old and new pending order types');
check(/CancelPendingIfPossible\(ticket,"ORDER_MODE_SWITCH"\)/,'old mode pending orders canceled on switch');
check(/InpCancelOppositeOnFill/,'opposite STOP cancellation retained');
check(/InpUseSignalFilter\s*=\s*false/,'STOP may follow direct breakout if selected');
check(/InpLots\s*=\s*0\.01/,'conservative demo starting lot');
check(/InpMaxLossUsd\s*=\s*3\.00/,'per-position loss protection target');
check(/InpProfitLockUsd\s*=\s*1\.50/,'profit lock control');
check(/OrderCalcProfit\(profitType,_Symbol,InpLots,entry,sl,worst\)/,
 'broker order P/L checked for both entry types');
check(/SYMBOL_ORDER_LIMIT:SYMBOL_ORDER_STOP/,'selected pending order type checked against broker support');
check(/TRADE_RETCODE_FROZEN/,'frozen cancel and exit handling');
assert.doesNotMatch(src,/WebRequest\(/,'site AI not falsely connected to MT5 orders');
console.log('Gold v1.17 selectable pending-order type static checks passed.');
