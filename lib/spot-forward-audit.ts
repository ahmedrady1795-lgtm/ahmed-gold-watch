import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {Candidate} from './spot-radar';

export type ForwardResult={
  total:number;hit3pct:number;avgReturnPct:number;pending:number;
  peakAudited:number;peakHit3pct:number;avgPeakPct:number;
  preMoveAudited:number;preMoveHit3pct:number;preMoveAvgPeakPct:number;preMovePending:number;
  evaluatedAt:number;storage:'ephemeral-runtime';
  target:'next-24h high >= +3%; close return reported separately';
};
type SignalType='HIGH'|'PREMOVE';
type Record24={
  id:string;symbol:string;recordedAt:number;dueAt:number;entry:number;rankScore:number;
  signalType?:SignalType;startChange24h?:number;startChange15m?:number;
  status:'PENDING'|'SETTLED'|'UNRESOLVED';observedAt?:number;exit?:number;returnPct?:number;
  maxHighPct?:number;maxLowPct?:number;
};
const STORE=process.env.SPOT_FORWARD_LOG_PATH ||
  path.join(os.tmpdir(),'qannas-spot-forward-v1.json');
const DAY=86400000,MIN=60000,HOUR=3600000;
const sane=(n:number)=>Number.isFinite(n)&&n>0;

export function settleFromClosedMinute(
  row:Record24,raw:unknown,now=Date.now()
):Record24|null{
  if(row.status!=='PENDING'||now<row.dueAt+MIN||!Array.isArray(raw))return null;
  const times=raw.filter((r):r is unknown[]=>Array.isArray(r)&&r.length>=7)
    .map(r=>({openTime:Number(r[0]),closeTime:Number(r[6]),price:Number(r[4])}))
    .filter(r=>Number.isFinite(r.openTime)&&Number.isFinite(r.closeTime)&&
      sane(r.price)&&r.openTime<=r.closeTime&&r.closeTime<=now&&
      r.closeTime>=row.dueAt&&r.closeTime<=row.dueAt+2*MIN)
    .sort((a,b)=>a.closeTime-b.closeTime);
  if(!times.length)return null;
  const first=times[0];
  return {...row,status:'SETTLED',observedAt:first.closeTime,
    exit:first.price,returnPct:(first.price/row.entry-1)*100};
};

type ForwardBar={openTime:number;closeTime:number;high:number;low:number;close:number};
/** Measures the actual high/low over the forward window, using closed exchange candles only.
 * A prediction with an incomplete/gapped forward window is never treated as evidence. */
export function settleFromForwardCandles(
  row:Record24,raw:unknown,now=Date.now()
):Record24|null{
  if(row.status!=='PENDING'||now<row.dueAt+MIN||!Array.isArray(raw))return null;
  const bars:ForwardBar[]=raw.filter((r):r is unknown[]=>Array.isArray(r)&&r.length>=7)
    .map(r=>({openTime:Number(r[0]),high:Number(r[2]),low:Number(r[3]),
      close:Number(r[4]),closeTime:Number(r[6])}))
    .filter(b=>[b.openTime,b.closeTime,b.high,b.low,b.close].every(Number.isFinite)&&
      sane(b.high)&&sane(b.low)&&sane(b.close)&&b.low<=b.high&&
      b.openTime<=b.closeTime&&b.closeTime<=now&&b.openTime<=row.dueAt+MIN)
    .sort((a,b)=>a.openTime-b.openTime||a.closeTime-b.closeTime);
  const exit=bars.filter(b=>b.closeTime>=row.dueAt&&b.closeTime<=row.dueAt+2*MIN)
    .sort((a,b)=>a.closeTime-b.closeTime)[0];
  const window=bars.filter(b=>b.openTime>=row.recordedAt&&b.closeTime<=row.dueAt);
  if(!exit||window.length<12||window[0].openTime>row.recordedAt+2*MIN||
    window[window.length-1].closeTime<row.dueAt-2*MIN)return null;
  // The hourly and minute segments must join without a candle gap.
  for(let i=1;i<window.length;i++){
    if(window[i].openTime>window[i-1].closeTime+2)return null;
  }
  const high=Math.max(...window.map(b=>b.high));
  const low=Math.min(...window.map(b=>b.low));
  return {...row,status:'SETTLED',observedAt:exit.closeTime,exit:exit.close,
    returnPct:(exit.close/row.entry-1)*100,
    maxHighPct:(high/row.entry-1)*100,maxLowPct:(low/row.entry-1)*100};
}
async function load():Promise<Record24[]>{
  try{
    const j=JSON.parse(await fs.readFile(STORE,'utf8'));
    if(!Array.isArray(j))return [];
    return j.filter((r):r is Record24=>r&&typeof r==='object'&&
      typeof r.symbol==='string'&&sane(r.entry)&&Number.isFinite(r.recordedAt)&&
      Number.isFinite(r.dueAt)&&['PENDING','SETTLED','UNRESOLVED'].includes(r.status))
      .slice(-1200);
  }catch{return [];}
}
const peakValue=(r:Record24)=>Number.isFinite(r.maxHighPct);
const avg=(rows:Record24[],key:'returnPct'|'maxHighPct')=>rows.length
  ?Math.round(rows.reduce((s,r)=>s+Number(r[key]),0)/rows.length*100)/100:0;
export async function recordAndEvaluateSpot(
  ranked:Candidate[],
  getForwardBars:(symbol:string,recordedAt:number,dueAt:number)=>Promise<unknown>,
  now=Date.now(),
  earlyWatch:Candidate[]=[]
):Promise<ForwardResult>{
  const records=await load();
  // Keep the high-conviction close-return scorecard while separately measuring
  // whether low-momentum, buyer-backed setups reached +3% at ANY point after alert.
  const high=ranked.filter(c=>c.outlook24h?.state==='HIGH').slice(0,3);
  const highSymbols=new Set<string>();
  for(const c of high){
    highSymbols.add(c.symbol);
    if(records.some(r=>r.symbol===c.symbol&&now-r.recordedAt<4*HOUR))continue;
    if(!sane(c.price))continue;
    records.push({id:c.symbol+'-HIGH-'+now,recordedAt:now,symbol:c.symbol,
      entry:c.price,rankScore:c.outlook24h!.rankScore,signalType:'HIGH',
      startChange24h:c.change24h,startChange15m:c.change15m,
      dueAt:now+DAY,status:'PENDING'});
  }

  const latestPreMove=records.filter(r=>r.signalType==='PREMOVE')
    .reduce((latest,r)=>Math.max(latest,r.recordedAt),0);
  if(now-latestPreMove>=5*MIN){
    const possible=Array.from(new Map([...earlyWatch,...ranked]
      .filter(c=>!highSymbols.has(c.symbol)&&c.outlook24h&&!c.outlook24h.hardVeto&&
        c.volume24h>=1_500_000&&c.change24h>=-3&&c.change24h<=8&&
        c.change15m>=-.75&&c.change15m<=2.5&&c.buyShare>=.52&&
        c.volumeImpulse>=1.25&&!c.trapRisk&&c.absorption.state!=='SELL_ABSORPTION'&&
        c.book!==null&&c.book.bidShare>=.50&&c.book.spreadBps>0&&c.book.spreadBps<=25)
      .filter(c=>!records.some(r=>r.symbol===c.symbol&&now-r.recordedAt<4*HOUR))
      .sort((a,b)=>(b.outlook24h!.rankScore+Math.min(12,b.volumeImpulse*3)+
        Math.max(0,(b.buyShare-.5)*40)+(b.highUpside?.group==='MEME'?4:0))-
        (a.outlook24h!.rankScore+Math.min(12,a.volumeImpulse*3)+
        Math.max(0,(a.buyShare-.5)*40)+(a.highUpside?.group==='MEME'?4:0)))
      .map(c=>[c.symbol,c] as const)).values()).slice(0,3);
    for(const c of possible){
      records.push({id:c.symbol+'-PREMOVE-'+now,recordedAt:now,symbol:c.symbol,
        entry:c.price,rankScore:c.outlook24h!.rankScore,signalType:'PREMOVE',
        startChange24h:c.change24h,startChange15m:c.change15m,
        dueAt:now+DAY,status:'PENDING'});
    }
  }

  const matured=records.filter(r=>r.status==='PENDING'&&now>=r.dueAt+MIN)
    .sort((a,b)=>a.dueAt-b.dueAt).slice(0,3);
  for(const rec of matured){
    try{
      const bars=await getForwardBars(rec.symbol,rec.recordedAt,rec.dueAt);
      const done=settleFromForwardCandles(rec,bars,now);
      if(done)Object.assign(rec,done);
      else if(now-rec.dueAt>DAY)rec.status='UNRESOLVED';
    }catch{/* Keep pending; never invent a forward price. */}
  }
  const recent=records.slice(-1200);
  try{
    const dir=path.dirname(STORE);
    await fs.mkdir(dir,{recursive:true});
    const temp=STORE+'.'+process.pid+'.tmp';
    await fs.writeFile(temp,JSON.stringify(recent),{mode:0o600});
    await fs.rename(temp,STORE);
  }catch{/* Ranking remains independent of filesystem availability. */}
  const settled=recent.filter(r=>r.status==='SETTLED'&&Number.isFinite(r.returnPct));
  const peakRows=settled.filter(peakValue);
  const preMove=peakRows.filter(r=>r.signalType==='PREMOVE');
  const preMoveAll=recent.filter(r=>r.signalType==='PREMOVE');
  return {
    total:settled.length,hit3pct:settled.filter(r=>Number(r.returnPct)>=3).length,
    avgReturnPct:avg(settled,'returnPct'),
    pending:recent.filter(r=>r.status==='PENDING').length,
    peakAudited:peakRows.length,peakHit3pct:peakRows.filter(r=>Number(r.maxHighPct)>=3).length,
    avgPeakPct:avg(peakRows,'maxHighPct'),
    preMoveAudited:preMove.length,preMoveHit3pct:preMove.filter(r=>Number(r.maxHighPct)>=3).length,
    preMoveAvgPeakPct:avg(preMove,'maxHighPct'),
    preMovePending:preMoveAll.filter(r=>r.status==='PENDING').length,
    evaluatedAt:now,storage:'ephemeral-runtime',
    target:'next-24h high >= +3%; close return reported separately'
  };
}
