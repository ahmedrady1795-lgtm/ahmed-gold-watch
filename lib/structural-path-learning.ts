import fs from 'node:fs';
import path from 'node:path';

type Side='BUY'|'SELL'|'WAIT';
type Outcome='HIT'|'FAIL'|'NEUTRAL';
type Stat={hits:number;fails:number;neutral:number;sumSeconds:number;sumMfeBps:number;sumMaeBps:number;updatedAt:number;};
type Pending={
  id:string;at:number;side:'BUY'|'SELL';phase:string;confidence:number;
  entry:number;targetLow:number;targetHigh:number;invalidPrice:number;horizonMs:number;
  targetKind:string;distanceAtr:number;liquidityGap:number;conviction:string;signature:string;
  bestBps:number;worstBps:number;
};
type Recent=Pending&{settledAt:number;exit:number;outcome:Outcome;seconds:number;};
type AssetState={
  global:Stat;bySide:Record<string,Stat>;byPhase:Record<string,Stat>;bySignature:Record<string,Stat>;byTargetKind:Record<string,Stat>;byDistance:Record<string,Stat>;
  pending:Pending[];recent:Recent[];lastBucket:number;
};
type State={version:string;assets:Record<string,AssetState>};

const FILE='/data/structural-path-learning.json';
const FALLBACK='/tmp/structural-path-learning.json';
const VERSION='structural-path-learning-v1';
const cap=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const blankStat=():Stat=>({hits:0,fails:0,neutral:0,sumSeconds:0,sumMfeBps:0,sumMaeBps:0,updatedAt:0});
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
  st.assets[k] ||= {global:blankStat(),bySide:{},byPhase:{},bySignature:{},byTargetKind:{},byDistance:{},pending:[],recent:[],lastBucket:0};
  const a=st.assets[k];
  a.global ||= blankStat();a.bySide ||= {};a.byPhase ||= {};a.bySignature ||= {};a.byTargetKind ||= {};a.byDistance ||= {};a.pending ||= [];a.recent ||= [];
  return a;
}
function stat(map:Record<string,Stat>,key:string){map[key] ||= blankStat();return map[key];}
function update(s:Stat,o:Outcome,now:number,seconds=0,mfe=0,mae=0){
  if(o==='HIT')s.hits++;else if(o==='FAIL')s.fails++;else s.neutral++;
  s.sumSeconds=Number(s.sumSeconds||0)+Math.max(0,seconds);
  s.sumMfeBps=Number(s.sumMfeBps||0)+Math.max(0,mfe);
  s.sumMaeBps=Number(s.sumMaeBps||0)+Math.max(0,mae);
  s.updatedAt=now;
}
function view(s?:Stat){
  const x=s||blankStat(),n=x.hits+x.fails,resolved=n+x.neutral;
  return {
    hits:x.hits,fails:x.fails,neutral:x.neutral,directional:n,resolved,
    accuracy:n?Number((x.hits/n*100).toFixed(1)):null,
    posteriorAccuracy:Number(((x.hits+5)/(n+10)*100).toFixed(1)),
    resolvedHitRate:resolved?Number((x.hits/resolved*100).toFixed(1)):null,
    avgSeconds:resolved?Number((Number(x.sumSeconds||0)/resolved).toFixed(1)):null,
    avgMfeBps:resolved?Number((Number(x.sumMfeBps||0)/resolved).toFixed(2)):null,
    avgMaeBps:resolved?Number((Number(x.sumMaeBps||0)/resolved).toFixed(2)):null,
    excursionEdge:resolved?Number(((Number(x.sumMfeBps||0)-Number(x.sumMaeBps||0))/resolved).toFixed(2)):null
  };
}
function safeKey(x:any,fallback='UNKNOWN'){return String(x||fallback).toUpperCase().replace(/[^A-Z0-9_\-]/g,'_').slice(0,72)||fallback;}
function distanceBand(v:number){return v<=.45?'D0_045':v<=.8?'D045_08':v<=1.2?'D08_12':v<=1.8?'D12_18':'D18_PLUS';}
function gapBand(v:number){return v>=24?'G24_PLUS':v>=16?'G16_23':v>=10?'G10_15':'G0_9';}
function signatureOf(x:{side:string;phase:string;targetKind:string;distanceAtr:number;liquidityGap:number;conviction:string}){
  return [safeKey(x.side),safeKey(x.phase),safeKey(x.targetKind),distanceBand(Number(x.distanceAtr||0)),gapBand(Number(x.liquidityGap||0)),safeKey(x.conviction)].join('|');
}
function weightedPosterior(rows:{n:number;acc:number;w:number}[]){
  const usable=rows.map(x=>({...x,ew:x.w*Math.min(1,Math.max(0,x.n)/24)})).filter(x=>x.ew>0);
  const w=usable.reduce((a,x)=>a+x.ew,0);
  return w?usable.reduce((a,x)=>a+x.acc*x.ew,0)/w:50;
}
function qualityFromStat(v:any){
  const n=Number(v?.directional||0),posterior=Number(v?.posteriorAccuracy||50);
  const mfe=Number(v?.avgMfeBps||0),mae=Number(v?.avgMaeBps||0);
  const excursion=mfe+mae>0?(mfe-mae)/(mfe+mae):0;
  const hit=Number(v?.resolvedHitRate||0);
  const sample=Math.min(1,n/28);
  return 50+(posterior-50)*.72*sample+excursion*18*sample+(hit-35)*.10*sample;
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
    const seconds=Number(((now-p.at)/1000).toFixed(1));
    update(a.global,outcome,now,seconds,p.bestBps,p.worstBps);
    update(stat(a.bySide,p.side),outcome,now,seconds,p.bestBps,p.worstBps);
    update(stat(a.byPhase,String(p.phase||'NEUTRAL')),outcome,now,seconds,p.bestBps,p.worstBps);
    update(stat(a.bySignature,p.signature),outcome,now,seconds,p.bestBps,p.worstBps);
    update(stat(a.byTargetKind,safeKey(p.targetKind)),outcome,now,seconds,p.bestBps,p.worstBps);
    update(stat(a.byDistance,distanceBand(p.distanceAtr)),outcome,now,seconds,p.bestBps,p.worstBps);
    const r:Recent={...p,settledAt:now,exit:price,outcome,seconds};
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
    bySignature:Object.fromEntries(Object.entries(a.bySignature).map(([k,v])=>[k,view(v)])),
    byTargetKind:Object.fromEntries(Object.entries(a.byTargetKind).map(([k,v])=>[k,view(v)])),
    byDistance:Object.fromEntries(Object.entries(a.byDistance).map(([k,v])=>[k,view(v)])),
    pending:a.pending.length,recent:a.recent.slice(0,36),failureStreak:failStreak(a.recent),
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
  const kind=String(pathForecast?.destination?.kind||'UNKNOWN');
  const distanceAtr=Number(pathForecast?.destination?.distanceAtr||0);
  const liqGap=Math.abs(Number(pathForecast?.evidence?.liquidity?.gap||0));
  const conviction=String(pathForecast?.conviction||'WEAK');
  const sig=signatureOf({side,phase:ph,targetKind:kind,distanceAtr,liquidityGap:liqGap,conviction});
  const g=learning?.global||{},s=learning?.bySide?.[side]||{},p=learning?.byPhase?.[ph]||{};
  const sg=learning?.bySignature?.[sig]||{},tk=learning?.byTargetKind?.[safeKey(kind)]||{},db=learning?.byDistance?.[distanceBand(distanceAtr)]||{};
  const rows=[
    {n:Number(g.directional||0),acc:Number(g.posteriorAccuracy||50),w:.16},
    {n:Number(s.directional||0),acc:Number(s.posteriorAccuracy||50),w:.14},
    {n:Number(p.directional||0),acc:Number(p.posteriorAccuracy||50),w:.10},
    {n:Number(tk.directional||0),acc:Number(tk.posteriorAccuracy||50),w:.16},
    {n:Number(db.directional||0),acc:Number(db.posteriorAccuracy||50),w:.14},
    {n:Number(sg.directional||0),acc:Number(sg.posteriorAccuracy||50),w:.30}
  ];
  const observed=weightedPosterior(rows);
  const signatureQuality=qualityFromStat(sg);
  const targetQuality=qualityFromStat(tk);
  const distanceQuality=qualityFromStat(db);
  const gn=Number(g.directional||0),sn=Number(sg.directional||0);
  const maturity=Math.min(1,(gn*.35+sn*.65)/40);
  let confidence=raw*(1-.72*maturity)+observed*(.54*maturity)+signatureQuality*(.18*maturity);
  const streak=Number(learning?.failureStreak||0);
  if(streak>=4)confidence-=14; else if(streak===3)confidence-=9; else if(streak===2)confidence-=5;
  const excursionEdge=Number(sg?.excursionEdge??tk?.excursionEdge??g?.excursionEdge??0);
  if(sn>=6&&excursionEdge<0)confidence-=Math.min(10,Math.abs(excursionEdge)*.8);
  if(sn>=8&&Number(sg.posteriorAccuracy||50)<46)confidence-=10;
  if(Number(tk.directional||0)>=10&&targetQuality<47)confidence-=6;
  if(Number(db.directional||0)>=10&&distanceQuality<47)confidence-=5;
  const primaryProbability=Math.max(Number(pathForecast?.probabilities?.up||0),Number(pathForecast?.probabilities?.down||0),Number(pathForecast?.rawProbability||0));
  if(conviction==='WEAK'||primaryProbability<55)confidence=Math.min(confidence,Math.round(cap(primaryProbability,42,55)));
  confidence=Math.round(cap(confidence,18,84));
  const archetypeSamples=sn;
  const hardVeto=Boolean(
    (archetypeSamples>=10&&Number(sg.posteriorAccuracy||50)<43)||
    (Number(tk.directional||0)>=16&&targetQuality<42)||
    (gn>=30&&Number(g.posteriorAccuracy||50)<43&&streak>=2)
  );
  const promoted=Boolean(
    !hardVeto&&confidence>=54&&
    (archetypeSamples<8||Number(sg.posteriorAccuracy||50)>=52)&&
    (Number(tk.directional||0)<10||targetQuality>=48)
  );
  return {
    ...pathForecast,
    side:hardVeto?'WAIT':pathForecast.side,
    rawConfidence:Math.round(raw),
    confidence:hardVeto?Math.min(34,confidence):confidence,
    conviction:hardVeto?'WEAK':pathForecast.conviction,
    learning:{
      version:'structural-path-learning-v2-contextual',
      samples:gn,observedAccuracy:Number(observed.toFixed(1)),
      globalPosterior:Number(g.posteriorAccuracy||50),sidePosterior:Number(s.posteriorAccuracy||50),
      phasePosterior:Number(p.posteriorAccuracy||50),signature:sig,signatureSamples:archetypeSamples,
      signaturePosterior:Number(sg.posteriorAccuracy||50),targetKindPosterior:Number(tk.posteriorAccuracy||50),
      distancePosterior:Number(db.posteriorAccuracy||50),signatureQuality:Number(signatureQuality.toFixed(1)),
      targetQuality:Number(targetQuality.toFixed(1)),distanceQuality:Number(distanceQuality.toFixed(1)),
      excursionEdge:Number(excursionEdge.toFixed(2)),failureStreak:streak,maturity:Number(maturity.toFixed(2)),
      promoted,hardVeto
    },
    scenario:hardVeto?'تم رفض المسار لأن هذا النمط خاسر تاريخيًا أو جودة حركته ضعيفة':pathForecast.scenario
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
  const targetKind=String(d.kind||'UNKNOWN');
  const liquidityGap=Math.abs(Number(pf?.evidence?.liquidity?.gap||0));
  const conviction=String(pf?.conviction||'WEAK');
  const signature=signatureOf({side,phase:String(args.phase||pf.phase||'NEUTRAL'),targetKind,distanceAtr,liquidityGap,conviction});
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
    confidence,entry:price,targetLow:low,targetHigh:high,invalidPrice,horizonMs,
    targetKind,distanceAtr:Number(distanceAtr.toFixed(3)),liquidityGap:Number(liquidityGap.toFixed(1)),conviction,signature,
    bestBps:0,worstBps:0
  });
  if(a.pending.length>24)a.pending=a.pending.slice(-24);
  a.lastBucket=bucket;dirty=true;save(true);
  return {...summary(args.asset),recorded:true,eventId:id};
}
