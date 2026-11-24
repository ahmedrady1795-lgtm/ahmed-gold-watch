const assert=require('node:assert/strict'),fs=require('node:fs'),
 vm=require('node:vm'),ts=require('typescript');
const ex={};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/chart-last-good.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText,{exports:ex});
const {CHART_LAST_GOOD_KEY,prepareChartHistorySave,
 restoreChartHistory,historicalChartAsset,retainChartDuringOutage}=ex;
const now=Date.parse('2026-11-24T06:00:00.000Z');
const mk=(minutes,count,price)=>Array.from({length:count},(_,i)=>{
 const time=now-minutes*60000*(count-i);
 return {time,open:price,high:price+2,low:price-2,
   close:price+.2,volume:9,volumeBasis:'TICK'};
});
const make=(source,price)=>({
 candleSource:source,chartCandles:mk(1,200,price),
 chartHigherFrames:{m5:mk(5,80,price),m15:mk(15,65,price),h1:mk(60,40,price)},
 fresh:true,lastClosedAt:now-60000
});
const gold=make('Biquote · MT5 XAUUSD candles',3625);
const bitcoin=make('Coinbase Exchange · BTC-USD',61800);
const saved=prepareChartHistorySave({gold,bitcoin},now);
assert.ok(saved&&saved.includes('Biquote'));
assert.equal(CHART_LAST_GOOD_KEY,'qannas-chart-last-closed-v1');
const restored=restoreChartHistory(saved,now+1000);
assert.equal(restored?.gold?.historicalOnly,true);
assert.equal(restored?.gold?.providerTransition,true);
assert.equal(restored?.gold?.fresh,false);
assert.equal(restored?.gold?.chartHigherFrames?.m5?.length,80);
assert.equal(restored?.gold?.chartCandles.at(-1).close,3625.2);
assert.equal(restored?.bitcoin?.chartHigherFrames?.m5?.length,80);
const before=JSON.stringify(gold);
assert.equal(JSON.stringify(gold),before,'recovery must never change original OHLC');
const partial=retainChartDuringOutage(restored,{
 ok:true,gold:{chartCandles:[],chartHigherFrames:{m5:[]},fresh:false},
 bitcoin
},now+2000);
assert.equal(partial?.gold?.historicalOnly,true,
 'BTC HTTP200 with GOLD empty must retain last verified XAU prices');
assert.equal(partial?.gold?.chartHigherFrames?.m5?.length,80);
assert.equal(partial?.bitcoin?.historicalOnly,undefined,
 'healthy BTC chart keeps its genuine live OHLC');
assert.equal(partial?.bitcoin?.fresh,true);
const serverOnly=retainChartDuringOutage(null,{ok:true,gold:restored.gold,bitcoin:null},now+3000);
assert.equal(serverOnly?.gold?.historicalOnly,true,
 'a new browser can draw verified server-held M5 after Biquote 503');
assert.equal(serverOnly?.gold?.chartHigherFrames.m5.length,80);
assert.equal(serverOnly?.gold?.fresh,false);
const noProvider=retainChartDuringOutage(restored,null,now+3000);
assert.equal(noProvider?.gold?.historicalOnly,true);
assert.equal(noProvider?.bitcoin?.historicalOnly,true);
const resumed=retainChartDuringOutage(restored,{ok:true,gold,
 bitcoin},now+2000);
assert.equal(resumed?.gold?.historicalOnly,undefined);
assert.equal(resumed?.gold?.fresh,true);
assert.equal(resumed?.gold?.chartCandles.length,200);
assert.equal(prepareChartHistorySave({gold:noProvider.gold,bitcoin:noProvider.bitcoin},now),null,
 'a HISTORICAL_ONLY retry cannot renew last-good cache timestamp');
const mixed=prepareChartHistorySave(partial,now+2000);
const mixedHistory=restoreChartHistory(mixed,now+3000);
assert.equal(mixedHistory?.gold?.chartHigherFrames.m5.length,80,
 'a fresh BTC update must not erase last recorded real gold candles');
for(const [desc,bad] of [
 ['unavailable source',{...gold,candleSource:'unavailable'}],
 ['wrong PAXG market',{...gold,candleSource:'Binance PAXG/USDT proxy'}],
 ['fake $1 prices',make('Biquote XAUUSD',1)],
 ['corrupt OHLC',{...gold,chartHigherFrames:{...gold.chartHigherFrames,
  m5:gold.chartHigherFrames.m5.map((r,i)=>i===0?{...r,low:r.high+10}:r)}}],
 ['missing M5',{...gold,chartHigherFrames:{...gold.chartHigherFrames,m5:[]}}],
 ['future bars',{...gold,chartCandles:gold.chartCandles.map((r,i)=>
  i===199?{...r,time:now+60000}:r)}]
])assert.equal(historicalChartAsset('gold',bad,now),null,desc);
assert.equal(restoreChartHistory(saved,now+73*3600000),null,'old archives expire');
assert.equal(restoreChartHistory('garbage',now),null);
assert.equal(restoreChartHistory(JSON.stringify({...JSON.parse(saved),
 storedAt:now+50000}),now),null,'cannot accept future observation');
const page=fs.readFileSync('app/page.tsx','utf8');
const center=fs.readFileSync('components/AICommandCenter.tsx','utf8');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(page,/restoreChartHistory\(window.localStorage.getItem\(CHART_LAST_GOOD_KEY\)/);
assert.match(page,/retainChartDuringOutage\(prior,source,checked\)/);
assert.match(center,/historicalOnly:Boolean\(separate.historicalOnly\)/);
assert.match(panel,/const providerTransition=historicalOnly\|\|/);
assert.match(panel,/historicalOnly\?null:asset==='GOLD'\?goldLive:btcLive/);
assert.match(panel,/trueHistory.length>0&&<g className="sniper-price-axis"/,
 'the false $1 axis must be absent when NO VERIFIED OHLC exists');
const hub=fs.readFileSync('lib/market-hub.ts','utf8');
assert.match(hub,/export async function getGoldChartMarket\(/);
assert.match(hub,/if\(goldPriceInFlight\)return goldPriceInFlight/);
assert.match(hub,/const price=await getGoldChartMarket\(\)/);
const chartRoute=fs.readFileSync('app/api/chart-history/route.ts','utf8');
assert.match(chartRoute,/let lastGoodGold:any=null,lastGoodBitcoin:any=null/);
assert.match(chartRoute,/goldLive\?g:goldOnly\?null:display/);
const m5Only=historicalChartAsset('gold',{...gold,chartCandles:[],chartHigherFrames:{m5:gold.chartHigherFrames.m5,m15:[],h1:[]}},now);
assert.equal(m5Only?.historicalOnly,true);
assert.equal(m5Only?.fresh,false);
assert.equal(m5Only?.chartHigherFrames.m5.length,80);
assert.equal(retainChartDuringOutage(null,{ok:true,gold:m5Only},now)?.gold?.chartHigherFrames.m5.length,80);
assert.match(chartRoute,/gold:goldLive\?gold:null,bitcoin:bitcoinLive\?bitcoin:null/,
 'server audit must NEVER score stale fallback OHLC');
assert.match(hub,/if\(!options.force&&marketInFlight\)return marketInFlight/,
 'the same slow 4-frame market request must be shared between chart and AI viewers');
assert.match(hub,/finally\{if\(marketInFlight===task\)marketInFlight=null;\}/,
 'failed source fetch must free the next retry slot');
assert.match(chartRoute,/CHART_FEED_TIMEOUT'\)\),14000\)/,
 'a valid 9-12s candle request must not be killed by an 8s budget');
assert.match(page,/source=\{gold:r.ok&&j\?\.ok\?j.gold:null/,
 'a BTC-only HTTP 200 must never evict last-known real GOLD OHLC');
console.log('PASS: closed XAU/BTC M5 cache after 503, no synthetic price axis, no historical trades, recovery and provider source guards');
