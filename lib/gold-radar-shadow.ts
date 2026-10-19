import type {GoldSide} from './gold-liquidity-radar';
import {trustedSpotGoldSource} from './gold-liquidity-radar';
export type GoldOutcome={status:'PENDING'|'SCORED'|'NO_DATA';barAt:number;
 direction:GoldSide|'FLAT'|null;correct:boolean|null;moveBps:number|null};
export type GoldRadarEvent={id:string;at:number;source:string;side:'BUY'|'SELL';
 price:number;reason:string;confirm:number;invalidate:number;
 baseline:GoldSide;m1:GoldOutcome;m15:GoldOutcome};
export type GoldRadarLedger={schema:'gold-radar-shadow-v1';updatedAt:number;
 events:GoldRadarEvent[]};
export type GoldClosed={time:number;open:number;high:number;low:number;close:number};
export const emptyGoldLedger=():GoldRadarLedger=>({schema:'gold-radar-shadow-v1',
 updatedAt:0,events:[]});
const nextWhole=(at:number,period:number)=>(Math.floor(at/period)+1)*period;
const round=(n:number)=>Number(n.toFixed(3));
const blank=(at:number,period:number):GoldOutcome=>({status:'PENDING',
 barAt:nextWhole(at,period),direction:null,correct:null,moveBps:null});
export function appendGoldRadarEvent(input:{ledger:GoldRadarLedger;now:number;
 source:string;closedAt:number;side:GoldSide;price:number;reason:string;
 confirm:number|null;invalidate:number|null;baseline:GoldSide}){
 const {ledger,now,source,closedAt,side,price,confirm,invalidate}=input;
 if(!trustedSpotGoldSource(source)||!Number.isSafeInteger(now)||
  !Number.isSafeInteger(closedAt)||closedAt%60000!==0||
  now<closedAt||now-closedAt>90000||price<=0||
  !Number.isFinite(price)||!Number.isFinite(confirm)||!Number.isFinite(invalidate)||
  confirm==null||invalidate==null||confirm<=0||invalidate<=0||
  !['BUY','SELL'].includes(side)||!['BUY','SELL','WAIT'].includes(input.baseline)||
  (side==='BUY'?confirm<=invalidate:confirm>=invalidate))
   return {ledger,added:false,reason:'INVALID_OR_STALE'};
 const id='XAU:'+encodeURIComponent(source)+':'+closedAt+':'+side;
 if(ledger.events.some(e=>e.id===id))
   return {ledger,added:false,reason:'DUPLICATE'};
 const previous=ledger.events.at(-1);
 if(previous&&now-previous.at<900000)
   return {ledger,added:false,reason:'COHORT_COOLDOWN'};
 const event:GoldRadarEvent={id,source,at:now,side:side as 'BUY'|'SELL',
   price:round(price),reason:input.reason.slice(0,190),
   confirm:round(confirm),invalidate:round(invalidate),
   baseline:input.baseline,m1:blank(now,60000),
   m15:blank(now,900000)};
 return {ledger:{schema:'gold-radar-shadow-v1' as const,updatedAt:now,
    events:[...ledger.events,event].slice(-2500)},
   added:true,reason:'OBSERVED_SPOT_M1'};
}
export function settleGoldRadar(input:{ledger:GoldRadarLedger;now:number;
 source:string;m1:readonly GoldClosed[];m15:readonly GoldClosed[]}){
 const {ledger,source,now}=input;let updated=0;
 const evalOutcome=(v:GoldOutcome,e:GoldRadarEvent,period:number,rows:readonly GoldClosed[])=>{
  if(v.status!=='PENDING')return v;
  const t=nextWhole(e.at,period);
  if(t+period+3000>now)return v;
  if(e.source!==source)return v; // Never backtest a different spot provider.
  const found=rows.find(b=>b.time===t&&b.time%period===0&&
   b.time+period<=now-3000&&b.low>0&&b.high>=Math.max(b.open,b.close)&&
   b.low<=Math.min(b.open,b.close));
  if(!found){
   if(now<t+period+6*3600000)return v;
   updated++;return {...v,status:'NO_DATA' as const};
  }
  const move=(found.close-e.price)/e.price*10000;
  const direction=Math.abs(move)<=2?'FLAT' as const:move>0?'BUY' as const:'SELL' as const;
  updated++;
  return {...v,status:'SCORED' as const,direction,correct:direction===e.side,
   moveBps:round(move)};
 };
 const events=ledger.events.map(e=>({...e,
  m1:evalOutcome(e.m1,e,60000,input.m1),
  m15:evalOutcome(e.m15,e,900000,input.m15)}));
 return {ledger:updated?{...ledger,events,updatedAt:now}:ledger,updated};
}
export function goldRadarScore(ledger:GoldRadarLedger){
 const frame=(key:'m1'|'m15')=>{
  const outcomes=ledger.events.filter(e=>e[key].status==='SCORED');
  const directionals=outcomes.filter(e=>e[key].direction!=='FLAT');
  const paired=directionals.filter(e=>e.baseline!=='WAIT');
  const right=directionals.filter(e=>e[key].correct).length;
  const baselineCorrect=paired.filter(e=>e.baseline===e[key].direction).length;
  const pairedCorrect=paired.filter(e=>e[key].correct).length;
  return {scored:outcomes.length,directional:directionals.length,
   correct:right,paired:paired.length,pairedCorrect,baselineCorrect,
   accuracy:directionals.length?round(right/directionals.length):null,
   pairedRadarRate:paired.length?round(pairedCorrect/paired.length):null,
   pairedBaselineRate:paired.length?round(baselineCorrect/paired.length):null,
   pending:ledger.events.filter(e=>e[key].status==='PENDING').length,
   noData:ledger.events.filter(e=>e[key].status==='NO_DATA').length,
   ready:paired.length>=50&&directionals.length>=70,qualified:false as const};
 };
 return {mode:'SHADOW' as const,source:'XAUUSD CLOSED M1 OHLC' as const,
  events:ledger.events.length,m1:frame('m1'),m15:frame('m15'),
  tradingEnabled:false as const,modelQualified:false as const};
}
export function safeGoldRadarLedger(raw:unknown,now:number):GoldRadarLedger{
 const data=raw as GoldRadarLedger;
 if(data?.schema!=='gold-radar-shadow-v1'||!Array.isArray(data.events))
  return emptyGoldLedger();
 const events=data.events.slice(-2500).filter(e=>e&&
   trustedSpotGoldSource(e.source)&&typeof e.id==='string'&&
   e.id==='XAU:'+encodeURIComponent(e.source)+':'+
     (Math.floor(e.at/60000)*60000===0?0:Number(decodeURIComponent(e.id.split(':').at(-2)||'0')))+':'+e.side &&
   Number.isSafeInteger(e.at)&&now>=e.at&&now-e.at<180*86400000&&
   (e.side==='BUY'||e.side==='SELL')&&Number.isFinite(e.price)&&e.price>0&&
   e.m1?.barAt===nextWhole(e.at,60000)&&
   e.m15?.barAt===nextWhole(e.at,900000));
 return {schema:'gold-radar-shadow-v1',
 updatedAt:Number.isFinite(data.updatedAt)?data.updatedAt:0,events};
}
export function mergeGoldRadarLedger(oldRaw:unknown,newRaw:unknown,now:number){
 const a=safeGoldRadarLedger(oldRaw,now),b=safeGoldRadarLedger(newRaw,now);
 const map=new Map(a.events.map(e=>[e.id,e]));
 const rank=(o:GoldOutcome)=>o.status==='SCORED'?2:
   o.status==='NO_DATA'?1:0;
 for(const e of b.events){
  const original=map.get(e.id);
  if(!original){map.set(e.id,e);continue;}
  if(original.price!==e.price||original.side!==e.side||
     original.source!==e.source||original.at!==e.at)continue;
  map.set(e.id,{...original,
   m1:rank(e.m1)>rank(original.m1)?e.m1:original.m1,
   m15:rank(e.m15)>rank(original.m15)?e.m15:original.m15});
 }
 return {schema:'gold-radar-shadow-v1' as const,updatedAt:Math.max(a.updatedAt,b.updatedAt),
  events:[...map.values()].sort((x,y)=>x.at-y.at).slice(-2500)};
}
