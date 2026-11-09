// Static source-contract checks only. GitHub CI does NOT run MetaEditor or prove profits.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','mt5_bridge','Experts',
  'AlQannas_Gold_M1_Limit_Demo.mq5'),'utf8');
const yes=(pattern,why)=>assert.match(src,pattern,why);

yes(/#property version\s+"1\.18"/,'v1.18 version');
yes(/ACCOUNT_TRADE_MODE_DEMO/,'broker DEMO only');
yes(/InpOrderStyle=AQ_LIMIT_PULLBACK/,'LIMIT entry by default');
yes(/AQ_STOP_BREAKOUT=1/,'optional STOP mode retained');
yes(/InpEntryStyle = AQ_FAST/,'no heavy M5/M1 entry confirmation by default');
yes(/g_trade\.BuyLimit\(/,'BUY LIMIT only for long entries');
yes(/g_trade\.SellLimit\(/,'SELL LIMIT only for short entries');
yes(/g_trade\.BuyStop\(/,'legacy STOP breakout optional');
yes(/g_trade\.SellStop\(/,'legacy STOP breakout optional');
assert.doesNotMatch(src,/g_trade\.(?:Buy|Sell)\(/,'never market ENTRY orders');

yes(/InpLots\s*=\s*0\.02/,'small initial lot, rather than revenge-sized');
yes(/InpTakeNetUsd\s*=\s*1\.50/,'net TP target $1.50');
yes(/InpMaxLossUsd\s*=\s*3\.00/,'SL nominal risk budget');
yes(/InpProfitLockUsd\s*=\s*0\.50/,'profit lock below profit target');
yes(/InpTrailArmUsd\s*=\s*0\.90/,'arm profit lock before hard TP');
yes(/InpTrailStartUsd\s*=\s*1\.20/,'trailing before hard TP');
yes(/InpExitOnTickReversal\s*=\s*true/,'early opposite-flow cut');
yes(/bool reverseExit=/,'reversal exit implementation');
yes(/OrderCalcProfit\(profitType,_Symbol,InpLots,entry,sl,worst\)/,'risk calculations');
yes(/TRADE_RETCODE_FROZEN/,'broker frozen trade handling');

yes(/InpMaxConcurrent\s*=\s*1/,'one concurrent order or position by default');
yes(/InpMaxEntriesPerM1\s*=\s*1/,'one successful entry order per M1');
yes(/InpCancelOnNewBar\s*=\s*true/,'old unfilled pending canceled on next bar');
yes(/InpMaxPendingAgeSec\s*=\s*55/,'pending 55 second timeout');
yes(/g_lastLimitOrderBar=g_barStart/,'M1 entry guard updated after successful order');
yes(/GlobalVariableSet\(g_lastLimitEntryKey,\(double\)g_barStart\)/,
    'M1 guard persisted across reloads');
yes(/g_lastLimitOrderBar==g_barStart/,'same-bar reentry prohibited');
yes(/int slots=\(InpOrderStyle==AQ_LIMIT_PULLBACK\?1:/,
    'one active LIMIT even when user increases STOP ladder slots');

yes(/sweptLow/,'liquidity sweep below closed swing lows');
yes(/sweptHigh/,'liquidity sweep above closed swing highs');
yes(/volumeBins\[16\]/,'tick-volume-by-price estimate');
yes(/RecentTickFlow\(\)/,'latest local MT5 bid-ask movement');
yes(/double volumePressure=/,'tick-volume directional proxy');
yes(/g_buyZone/,'nearby demand zone snap');
yes(/g_sellZone/,'nearby supply zone snap');
yes(/InpMaxZoneSnapPrice\s*=\s*0\.45/,'near zone distance bound');
yes(/bool zoneValid=/,'zone selected without distant placement');
yes(/g_predictionBar=g_barStart/,'M1 prediction timestamp before candle close');
yes(/FinalizePreviousCandle\(g_barStart\)/,'evaluate previous only on next candle');
yes(/g_predictionBar==g_barStart && g_predictionSide!=0/,'avoid repaint');
yes(/g_predictionFeatures\[k\]=f\[k\]/,'feature snapshot for next candle');
yes(/InpModelLearningRate\*error\*g_predictionFeatures\[k\]/,'bounded online learning');
yes(/InpEnableAdaptiveWeights\s*=\s*true/,'adaptive model is user controlled');
yes(/InpModelLearningRate\s*=\s*0\.015/,'bounded default online learning speed');
yes(/g_barFills\+\+/,'broker-confirmed filled-deal counter');
yes(/GlobalVariableSet\(g_modelKey\+IntegerToString\(k\),g_modelWeights\[k\]\)/,
    'online model persistent across restarts');
yes(/AlQannas_Gold_M1_Predictions\.csv/,'forward-only prediction audit');
yes(/if\(g_barStart>0 && g_predictionBar!=g_barStart\)\s*LocalSignal\(\);/,
    'forecasts even if last position is still open');
yes(/void OnTradeTransaction\(/,'broker trade outcome audit');
yes(/AlQannas_Gold_Trades\.csv/,'actual execution deal log');
yes(/InpEnableDailyStop\s*=\s*false/,'user-controlled daily lock remains optional');
assert.doesNotMatch(src,/WebRequest\(/,'do not misrepresent website AI as entry oracle');

console.log('Gold M1 LIMIT v1.18 static source contracts passed; compile and DEMO forward tests are still needed.');
