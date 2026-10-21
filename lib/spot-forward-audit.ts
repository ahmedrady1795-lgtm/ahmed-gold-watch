import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {Candidate} from './spot-radar';

export type ForwardResult={total:number;hit3pct:number;avgReturnPct:number;pending:number;
  evaluatedAt:number;storage:'ephemeral-runtime';target:'24h closing return >= 3%'};
type Record24={
  id:string;symbol:string;recordedAt:number;dueAt:number;entry:number;rankScore:number;
  status:'PENDING'|'SETTLED'|'UNRESOLVED';observedAt?:number;exit?:number;returnPct?:number;
};
const STORE=process.env.SPOT_FORWARD_LOG_PATH ||
  path.join(os.tmpdir(),'qannas-spot-forward-v1.json');
const DAY=86400000,MIN=60000;
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
export async function recordAndEvaluateSpot(
  ranked:Candidate[],
  getClosingBars:(symbol:string,dueAt:number)=>Promise<unknown>,
  now=Date.now()
):Promise<ForwardResult>{
  const records=await load();
  // Freeze up to three NEW high-conviction forecasts on each scan window.
  const high=ranked.filter(c=>c.outlook24h?.state==='HIGH').slice(0,3);
  for(const c of high){
    if(records.some(r=>r.symbol===c.symbol&&now-r.recordedAt<4*3600000))continue;
    if(!sane(c.price))continue;
    records.push({id:c.symbol+'-'+now,recordedAt:now,symbol:c.symbol,
      entry:c.price,rankScore:c.outlook24h!.rankScore,dueAt:now+DAY,status:'PENDING'});
  }
  const matured=records.filter(r=>r.status==='PENDING'&&now>=r.dueAt+MIN)
    .sort((a,b)=>a.dueAt-b.dueAt).slice(0,3);
  for(const rec of matured){
    try{
      const bars=await getClosingBars(rec.symbol,rec.dueAt);
      const done=settleFromClosedMinute(rec,bars,now);
      if(done)Object.assign(rec,done);
      else if(now-rec.dueAt>DAY)rec.status='UNRESOLVED';
    }catch{/* Keep pending. No invented closing price. */}
  }
  // Runtime container storage may be erased by a redeploy; never brand as
  // historical lifetime performance or a statistically validated edge.
  const recent=records.slice(-1200);
  try{
    const dir=path.dirname(STORE);
    await fs.mkdir(dir,{recursive:true});
    const temp=STORE+'.'+process.pid+'.tmp';
    await fs.writeFile(temp,JSON.stringify(recent),{mode:0o600});
    await fs.rename(temp,STORE);
  }catch{/* The ranking is not dependent on filesystem availability. */}
  const settled=recent.filter(r=>r.status==='SETTLED'&&
    Number.isFinite(r.returnPct));
  const total=settled.length;
  return {total,hit3pct:settled.filter(r=>Number(r.returnPct)>=3).length,
    avgReturnPct:total?Math.round(settled.reduce((a,r)=>a+r.returnPct!,0)/total*100)/100:0,
    pending:recent.filter(r=>r.status==='PENDING').length,
    evaluatedAt:now,storage:'ephemeral-runtime',
    target:'24h closing return >= 3%'};
}
