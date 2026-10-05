import fs from 'node:fs';
import path from 'node:path';

type Side='BUY'|'SELL'|'WAIT';
type Outcome='HIT'|'FAIL'|'NEUTRAL';
type Stat={hits:number;fails:number;neutral:number;updatedAt:number;};
type Pending={
  id:string;at:number;side:'BUY'|'SELL';phase:string;confidence:number;
  entry:number;targetLow:number;targetHigh:number;invalidPrice:number;horizonMs:number;
  bestBps:number;worstBps:number;
};
type Recent=Pending&{settledAt:number;exit:number;outcome:Outcome;seconds:number;};
type AssetState={
  global:Stat;bySide:Record<string,Stat>;byPhase:Record<string,Stat>;
  pending:Pending[];recent:Recent[];lastBucket:number;
};
type State={version:string;assets:Record<string,AssetState>};

const FILE='/data/structural-path-learning.json';
const FALLBACK='/tmp/structural-path-learning.json';
const VERSION='structural-path-learning-v1';
const cap=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const blankStat=():Stat=>({hits:0,fails:0,neutral:0,updatedAt:0});
let cache:State|null=null,dirty=false,lastSave=0;

function load():State{
  if(cache)return cache;
  for(const f of [FILE,FALLBACK]){
    try{
      const j=JSON.parse(fs.readFileSync(f,'utf8'));
      if(j?.version===VERSION&&j?.assets){cache=j;return j;}
    }catch{}
  }
  cache={version:VERSION,assets:{}};
  return cache;
}
function targetFile(){
  try{if(fs.existsSync(path.dirname(FILE)))return FILE;}catch{}
  return FALLBACK;
}
function save(force=false){
  if(!cache||!dirty)return;
  const now=Date.now();
  if(!force&&now-lastSave<4000)return;
  try{
    const f=targetFile(),tmp=f+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(cache));
    fs.renameSync(tmp,f);
    dirty=false;lastSave=now;
  }catch{}
}
function ensure(asset:string):AssetState{
  const st=load(),k=String(asset||'ASSET').toUpperCase();
  st.assets[k] ||= {global:blankStat(),bySide:{},byPhase:{},pending:[],recent:[],lastBucket:0};
  const a=st.assets[k];
  a.global ||= blankStat();a.bySide ||= {};a.byPhase ||= {};a.pending ||= [];a.recent ||= [];
  return a;
}
function stat(map:Record<string,Stat>,key:string){map[key] ||= blankStat();return map[key];}
function update(s:Stat,o:Outcome,now:number){
  if(o==='HIT')s.hits++;else if(o==='FAIL')s.fails++;else s.neutral++;
  s.updatedAt=now;
}
function view(s?:Stat){
  const x=s||blankStat(),n=x.hits+x.fails,resolved=n+x.neutral;
  return {
    hits:x.hits,fails:x.fails,neutral:x.neutral,directional:n,resolved,
    accuracy:n?Number((x.hits/n*100).toFixed(1)):null,
    posteriorAccuracy:Number(((x.hits+5)/(n+10)*100).toFixed(1))
  };
}
function settle(asset:string,price:number,now:number){
  if(!Number.isFinite(price)||price<=0)return;
  const a=ensure(asset),keep:Pending[]=[];
  for(const p of a.pending){
    const raw=(price-p.entry)/p.entry*10000;
    const favorable=p.side==='BUY'?raw:-raw,adverse=p.side==='BUY'?-raw:raw;
    p.bestBps=Math.max(Number(p.bestBps||0),favorable);
    p.worstBps=Math.max(Number(p.worstBps||0),adverse);
    const hit=price>=p.targetLow&&price<=p.targetHigh||
      (p.side==='BUY'&&price>p.targetHigh)||(p.side==='SELL'&&price<p.targetLow);
    const fail=p.side==='BUY'?price<=p.invalidPrice:price>=p.invalidPrice;
    const expired=now-p.at>=p.horizonMs;
    if(!hit&&!fail&&!expired){keep.push(p);continue;}
    const outcome:Outcome=hit?'HIT':fail?'FAIL':'NEUTRAL';
    update(a.global,outcome,now);
    update(stat(a.bySide,p.side),outcome,now);
    update(stat(a.byPhase,String(p.phase||'NEUTRAL')),outcome,now);
    const r:Recent={...p,settledAt:now,exit:price,outcome,seconds:Number(((now-p.at)/1000).toFixed(1))};
    a.recent.unshift(r);
    if(a.recent.length>160)a.recent=a.recent.slice(0,160);
    dirty=true;
  }
  if(keep.length!==a.pending.length){a.pending=keep;dirty=true;}
}
function failStreak(rows:Recent[]){
  let n=0;
  for(const r of rows){
    if(r.outcome==='FAIL')n++;
    else if(r.outcome==='HIT')break;
  }
  return n;
}
function summary(asset:string){
  const a=ensure(asset),global=view(a.global);
  return {
    ok:true,version:VERSION,asset:String(asset).toUpperCase(),global,
    bySide:Object.fromEntries(Object.entries(a.bySide).map(([k,v])=>[k,view(v)])),
    byPhase:Object.fromEntries(Object.entries(a.byPhase).map(([k,v])=>[k,view(v)])),
    pending:a.pending.length,recent:a.recent.slice(0,18),failureStreak:failStreak(a.recent),
    readyForCalibration:global.directional>=12,storage:targetFile()
  };
}

export function getStructuralPathLearning(asset:string,price?:number|null,now=Date.now()){
  const p=Number(price);
  if(Number.isFinite(p)&&p>0)settle(asset,p,now);
  save();
  return summary(asset);
}

export function calibrateStructuralPathForecast(pathForecast:any,learning:any,phase?:string){
  if(!pathForecast||!['BUY','SELL'].includes(String(pathForecast.side||'')))return pathForecast;
  const raw=cap(Number(pathForecast.confidence||0),20,88);
  const side=String(pathForecast.side),ph=String(phase||pathForecast.phase||'NEUTRAL');
  const g=learning?.global||{},s=learning?.bySide?.[side]||{},p=learning?.byPhase?.[ph]||{};
  const gn=Number(g.directional||0),sn=Number(s.directional||0),pn=Number(p.directional||0);
  const rows=[
    {n:gn,acc:Number(g.posteriorAccuracy||50),w:.42},
    {n:sn,acc:Number(s.posteriorAccuracy||50),w:.34},
    {n:pn,acc:Number(p.posteriorAccuracy||50),w:.24}
  ].map(x=>({...x,ew:x.w*Math.min(1,x.n/20)})).filter(x=>x.ew>0);
  const w=rows.reduce((a,x)=>a+x.ew,0);
  const observed=w?rows.reduce((a,x)=>a+x.acc*x.ew,0)/w:50;
  const maturity=Math.min(1,gn/45);
  let confidence=raw*(1-.62*maturity)+observed*(.62*maturity);
  const streak=Number(learning?.failureStreak||0);
  if(streak>=4)confidence-=12;
  else if(streak===3)confidence-=8;
  else if(streak===2)confidence-=4;
  if(gn>=12&&Number(g.posteriorAccuracy||50)<48)confidence-=5;
  const primaryProbability=Math.max(Number(pathForecast?.probabilities?.up||0),Number(pathForecast?.probabilities?.down||0),Number(pathForecast?.rawProbability||0));
  if(pathForecast?.conviction==='WEAK'||primaryProbability<55){
    confidence=Math.min(confidence,Math.round(cap(primaryProbability,45,55)));
  }
  confidence=Math.round(cap(confidence,24,84));
  return {
    ...pathForecast,
    rawConfidence:Math.round(raw),
    confidence,
    learning:{
      version:VERSION,samples:gn,observedAccuracy:Number(observed.toFixed(1)),
      globalPosterior:Number(g.posteriorAccuracy||50),sidePosterior:Number(s.posteriorAccuracy||50),
      phasePosterior:Number(p.posteriorAccuracy||50),failureStreak:streak,maturity:Number(maturity.toFixed(2))
    }
  };
}

export function recordStructuralPathOutcome(args:{
  asset:string;price:number|null;atr:number|null;now?:number;pathForecast:any;phase?:string;
}){
  const now=Number(args.now||Date.now()),price=Number(args.price),atr=Number(args.atr);
  if(!Number.isFinite(price)||price<=0)return {ok:false,reason:'invalid_price'};
  settle(args.asset,price,now);
  const pf=args.pathForecast||{},side=String(pf.side||'WAIT') as Side,d=pf.destination;
  if((side!=='BUY'&&side!=='SELL')||!d)return {...summary(args.asset),recorded:false};
  const low=Number(d.low),high=Number(d.high);
  if(!Number.isFinite(low)||!Number.isFinite(high)||high<low)return {...summary(args.asset),recorded:false};
  const confidence=Number(pf.confidence||0);
  const primaryProbability=Math.max(Number(pf?.probabilities?.up||0),Number(pf?.probabilities?.down||0),Number(pf?.rawProbability||0));
  if(confidence<30||pf?.conviction==='WEAK'||primaryProbability<55)return {...summary(args.asset),recorded:false,reason:'weak_or_ambiguous_path'};
  const a=ensure(args.asset),distanceAtr=Math.abs(Number(d.mid??((low+high)/2))-price)/Math.max(1e-9,atr||price*.001);
  const horizonMs=distanceAtr<=.6?180000:distanceAtr<=1.2?360000:720000;
  const bucket=Math.floor(now/60000);
  const same=a.pending.some(x=>x.side===side&&now-x.at<45000);
  if(a.lastBucket===bucket||same)return {...summary(args.asset),recorded:false};
  const inv=Number(pf?.invalidation?.price);
  const fallbackDistance=Math.max(Number.isFinite(atr)&&atr>0?atr*.55:price*.0018,price*.0007);
  const invalidPrice=Number.isFinite(inv)&&inv>0?inv:(side==='BUY'?price-fallbackDistance:price+fallbackDistance);
  const id=[String(args.asset).toUpperCase(),bucket,side].join(':');
  a.pending.push({
    id,at:now,side:side as 'BUY'|'SELL',phase:String(args.phase||pf.phase||'NEUTRAL'),
    confidence,entry:price,targetLow:low,targetHigh:high,invalidPrice,horizonMs,bestBps:0,worstBps:0
  });
  if(a.pending.length>24)a.pending=a.pending.slice(-24);
  a.lastBucket=bucket;dirty=true;save(true);
  return {...summary(args.asset),recorded:true,eventId:id};
}
