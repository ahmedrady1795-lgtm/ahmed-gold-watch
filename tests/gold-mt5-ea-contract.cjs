// Source contract checks only: these do NOT compile MQL5 or backtest returns.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','mt5_bridge','Experts',
                                   'AlQannas_Gold_M1_Limit_Demo.mq5'),'utf8');
const includes=(pattern,reason)=>assert.match(src,pattern,reason);

includes(/#property version\s+"1\.11"/,'new version');
includes(/ACCOUNT_TRADE_MODE_DEMO/,'demo-only broker orders');
includes(/MathAbs\(InpLots-0\.05\)/,'fixed exact 0.05 lots');
includes(/g_trade\.BuyLimit\(/,'BUY pending Limit');
includes(/g_trade\.SellLimit\(/,'SELL pending Limit');
assert.doesNotMatch(src,/g_trade\.(?:Buy|Sell)\(/,'no Market entries');
includes(/InpTakeNetUsd\s*=\s*6\.00/,'no tiny fixed TP at 0.70 USD');
includes(/InpMaxLossUsd\s*=\s*3\.00/,'bounded nominal per-trade loss');
includes(/InpDailyStopUsd\s*=\s*40\.00/,'daily risk budget remains');
includes(/InpTrailArmUsd\s*=\s*2\.25/,'profit lock activation');
includes(/InpProfitLockUsd\s*=\s*1\.50/,'protected net profit target');
includes(/InpTrailStartUsd\s*=\s*3\.00/,'profit runner activation');
includes(/peak-InpTrailGivebackUsd/,'peak-relative trailing exit');
includes(/bool trailingExit=\(protectedNet>0 && net<=protectedNet\);/,'close even if profit drops through zero');
includes(/g_trade\.PositionModify\(ticket,proposed,currentTp\)/,'attempts broker side SL protection');
includes(/GlobalVariableSet\(key,peak\)/,'persist profit peaks across EA reloads');
includes(/CopyRates\(_Symbol,PERIOD_M1,1,24,bars\)/,'only closed M1 candles');
includes(/CopyRates\(_Symbol,PERIOD_M5,1,12,m5\)/,'only closed M5 candles');
includes(/MathAbs\(score\)<InpMinSignalScore/,'skip ambiguous predictions');
includes(/MathAbs\(trend5\)>=InpM5ConflictScore/,'M5 conflict check');
includes(/MQLInfoInteger\(MQL_TRADE_ALLOWED\)/,'client automated-trade guard');
includes(/g_lastOrderAt=ServerNow\(\)/,'rejected-order backoff');
includes(/RemoveOwnLimits\(false\)/,'M1 expiry cleanup');
assert.doesNotMatch(src,/WebRequest\(/,'site AI not presented as connected to trading EA');
console.log('Gold EA source-contract checks passed. MT5 MetaEditor compilation and demo trading remain required.');
