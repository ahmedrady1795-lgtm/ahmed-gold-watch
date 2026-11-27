import {goldOpeningRegime,type GoldRegime,type OpeningSide} from './gold-opening-call.ts';
import {acceptGoldPulse} from './gold-tick-quality.ts';
import {goldQuoteMatchesCandles} from './gold-preparation-lead.ts';
import type {GoldCombinedLiquidity} from './gold-liquidity-meter.ts';
type Bar={time:number;open:number;high:number;low:number;close:number};
type Side='BUY'|'SELL'|'FLAT';
export type MarketMemoryRow={
 target:number;observedAt:number;source:string;quoteAt:number;mid:number;spread:number|null;
 regime:GoldRegime;baseline:OpeningSide;trend:OpeningSide;atr:number;
 flowAt:number|null;flowDelta:number|null;fastDelta:number|null;flowSources:number;flowSide:OpeningSide;
 session:string;outcome:'PENDING'|'UNKNOWN'|'SETTLED';settledAt?:number;
 open?:number;close?:number;high?:number;low?:number;direction?:Side;
 moveAtr?:number;buyReachAtr?:number;sellReachAtr?:number;firstThreshold?:'BUY'|'SELL'|'AMBIGUOUS'|'NONE';firstMinute?:number|null;
};
const validBar=(b:any,now:number):b is Bar=>b&&[b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&
 b.time%60000===0&&b.time+60000<=now-3000&&b.low>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);
function barsAt(raw:unknown,now:number){
 const map=new Map<number,Bar>();
 if(!Array.isArray(raw))return map;
 const rejected=new Set<number>();
 for(const b of raw){
   if(!validBar(b,now)||rejected.has(b.time))continue;
   const p=map.get(b.time);
   if(p&&[p.open,p.high,p.low,p.close].some((v,i)=>v!==[b.open,b.high,b.low,b.close][i])){
     map.delete(b.time);rejected.add(b.time);continue;
   }
   map.set(b.time,b);
 }
 return map;
}
export function marketSessionBucket(at:number){
 const h=new Date(at).getUTCHours();
 return h<7?'ASIA_UTC':h<13?'EUROPE_UTC':h<17?'OVERLAP_UTC':h<22?'US_UTC':'LATE_UTC';
}
export function captureMarketMemory(now:number,source:string,raw:unknown,quote:any,flow:GoldCombinedLiquidity):MarketMemoryRow|null{
 const target=(Math.floor(now/300000)+1)*300000;
 if(target-now>30000||target-now<1000||!goldQuoteMatchesCandles(quote?.source,source))return null;
 const tick=acceptGoldPulse(quote,now);
 if(!tick||tick.sourceTime>now||now-tick.sourceTime>10000)return null;
 const bars=[...barsAt(raw,now).values()].sort((a,b)=>a.time-b.time).slice(-16);
 if(bars.length!==16||bars.at(-1)!.time!==target-120000||bars.some((b,i)=>i>0&&b.time-bars[i-1].time!==60000))return null;
 const ranges=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));
 const atr=ranges.reduce((a,b)=>a+b,0)/ranges.length;
 if(!Number.isFinite(atr)||atr<=0)return null;
 const r=goldOpeningRegime(bars,now);
 const flowFresh=flow.asOf!=null&&flow.asOf<=now&&now-flow.asOf<=10000&&flow.sources.length>0;
 const finitePct=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100?v:null;
 return {target,observedAt:now,source,quoteAt:tick.sourceTime,mid:tick.price,
   spread:tick.bid!=null&&tick.ask!=null&&tick.ask>tick.bid?tick.ask-tick.bid:null,
   regime:r.regime,baseline:r.baseline,trend:r.trend,atr,
   flowAt:flowFresh?flow.asOf:null,flowDelta:flowFresh?finitePct(flow.delta):null,
   fastDelta:flowFresh&&flow.fastBuyPct!=null?finitePct(flow.fastBuyPct*2-100):null,
   flowSources:flowFresh?new Set(flow.sources).size:0,flowSide:flowFresh?flow.strongSide:'WAIT',
   session:marketSessionBucket(target),outcome:'PENDING'};
}
export function settleMarketMemory(rows:readonly MarketMemoryRow[],now:number,source:string,raw:unknown):MarketMemoryRow[]{
 const bars=barsAt(raw,now);
 return rows.map(r=>{
   if(r.outcome!=='PENDING'||now<r.target+303000)return r;
   const window=Array.from({length:5},(_,i)=>bars.get(r.target+i*60000));
   if(source!==r.source||window.some(b=>!b))return now>=r.target+900000?{...r,outcome:'UNKNOWN',settledAt:now}:r;
   const w=window as Bar[],open=w[0].open,close=w[4].close,high=Math.max(...w.map(b=>b.high)),low=Math.min(...w.map(b=>b.low));
   // First 1-ATR excursion is interval-censored to M1, not an exact tick.
   // If both sides cross in one minute, the first side is unknowable.
   let firstThreshold:MarketMemoryRow['firstThreshold']='NONE',firstMinute:number|null=null;
   for(let i=0;i<w.length;i++){
     const up=w[i].high>=open+r.atr,down=w[i].low<=open-r.atr;
     if(up||down){firstThreshold=up&&down?'AMBIGUOUS':up?'BUY':'SELL';firstMinute=i+1;break;}
   }
   return {...r,outcome:'SETTLED',settledAt:now,open,close,high,low,
     direction:close>open?'BUY':close<open?'SELL':'FLAT',moveAtr:(close-open)/r.atr,
     buyReachAtr:(high-open)/r.atr,sellReachAtr:(open-low)/r.atr,firstThreshold,firstMinute};
 });
}
function validRow(r:any,now:number,sources:readonly string[]):r is MarketMemoryRow{
 if(!r||!Number.isSafeInteger(r.target)||r.target%300000!==0||
  !Number.isSafeInteger(r.observedAt)||r.observedAt>now||r.target-r.observedAt<1000||r.target-r.observedAt>30000||
  !(sources[0].startsWith('Kraken')?Number.isFinite(r.quoteAt)&&r.quoteAt>0&&r.quoteAt<=Number.MAX_SAFE_INTEGER:Number.isSafeInteger(r.quoteAt))||r.quoteAt>r.observedAt||r.observedAt-r.quoteAt>10000||
  !sources.includes(r.source)||
  ![r.mid,r.atr].every(n=>Number.isFinite(n)&&n>0)||
  !['PENDING','SETTLED','UNKNOWN'].includes(r.outcome))return false;
 if(r.outcome==='PENDING')return true;
 if(!Number.isSafeInteger(r.settledAt)||r.settledAt<r.target+303000||r.settledAt>now)return false;
 if(r.outcome==='UNKNOWN')return true;
 return [r.open,r.close,r.high,r.low].every(n=>Number.isFinite(n)&&n>0)&&
 r.high>=Math.max(r.open,r.close)&&r.low<=Math.min(r.open,r.close)&&
 r.direction===(r.close>r.open?'BUY':r.close<r.open?'SELL':'FLAT');
}
function mergeMemoryForSources(now:number,sources:readonly string[],...inputs:unknown[]):MarketMemoryRow[]{
 const map=new Map<string,MarketMemoryRow>();
 for(const input of inputs){
   if(!Array.isArray(input))continue;
   for(const r of input.slice(-2016)){
     if(!validRow(r,now,sources))continue;
     const key=r.source+'|'+r.target,prior=map.get(key);
     if(prior){
       if(prior.outcome!=='PENDING'||r.outcome==='PENDING'||prior.observedAt!==r.observedAt||prior.mid!==r.mid||prior.atr!==r.atr)continue;
       map.set(key,{...prior,outcome:r.outcome,settledAt:r.settledAt,open:r.open,close:r.close,high:r.high,low:r.low,
       direction:r.direction,moveAtr:r.moveAtr,buyReachAtr:r.buyReachAtr,sellReachAtr:r.sellReachAtr,firstThreshold:r.firstThreshold,firstMinute:r.firstMinute});
     }else map.set(key,r);
   }
 }
 return [...map.values()].sort((a,b)=>a.target-b.target).slice(-2016);
}
export function marketMemoryReport(rows:readonly MarketMemoryRow[]){
 const groups=new Map<string,MarketMemoryRow[]>();
 for(const r of rows){
   const key=r.source+'|'+r.session+'|'+r.regime;
   const a=groups.get(key)??[];a.push(r);groups.set(key,a);
 }
 return {observed:rows.length,settled:rows.filter(r=>r.outcome==='SETTLED').length,
 pending:rows.filter(r=>r.outcome==='PENDING').length,unknown:rows.filter(r=>r.outcome==='UNKNOWN').length,
 groups:[...groups].map(([key,all])=>{
   const rs=all.filter(r=>r.outcome==='SETTLED'),strong=rs.filter(r=>Math.abs(r.moveAtr??0)>=1);
   return {key,n:rs.length,strong:strong.length,strongUp:strong.filter(r=>r.direction==='BUY').length,
   strongDown:strong.filter(r=>r.direction==='SELL').length,flowCovered:rs.filter(r=>r.flowSources>=2).length};
 }),scope:'FORWARD_RESEARCH_NO_TRADE_PROFIT'};
}

export function mergeMarketMemory(now:number,...inputs:unknown[]){return mergeMemoryForSources(now,['Biquote · MT5 XAUUSD candles','Deriv · XAUUSD'],...inputs);}
export function mergeBtcMarketMemory(now:number,...inputs:unknown[]){return mergeMemoryForSources(now,['Kraken XBT/USD · fresh-candle fallback','Coinbase BTC-USD · extended M1'],...inputs);}
