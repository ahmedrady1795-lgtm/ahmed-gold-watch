import fs from 'node:fs';
import path from 'node:path';

type Side='BUY'|'SELL'|'WAIT';
type Outcome='HIT'|'FAIL'|'NEUTRAL';

type Stat={
  hits:number;fails:number;neutral:number;
  sumSeconds:number;sumMfeBps:number;sumMaeBps:number;updatedAt:number;
};
type Pending={
  id:string;at:number;side:'BUY'|'SELL';source:string;regime:string;confidence:number;
  entry:number;target:number;stop:number;barrierBps:number;horizonMs:number;
  mfeBps:number;maeBps:number;
  micro?:{edge:number;support:number;opposition:number;strong:boolean};
};
type Recent={
  id:string;at:number;settledAt:number;side:'BUY'|'SELL';source:string;regime:string;confidence:number;
  entry:number;exit:number;target:number;stop:number;barrierBps:number;outcome:Outcome;
  seconds:number;mfeBps:number;maeBps:number;
};
type AssetState={
  global:Stat;
  bySource:Record<string,Stat>;
  byRegime:Record<string,Stat>;
  byConfidence:Record<string,Stat>;
  pending:Pending[];
  recent:Recent[];
  lastRecordedBucket:number;
  lastFingerprint:string;
};
type State={version:string;assets:Record<string,AssetState>};

const FILE='/data/predator-next-move-live.json';
const FALLBACK='/tmp/predator-next-move-live.json';
const cap=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const blankStat=():Stat=>({hits:0,fails:0,neutral:0,sumSeconds:0,sumMfeBps:0,sumMaeBps:0,updatedAt:0});
const blank=():State=>({version:'next-move-live-v2',assets:{}});
let cache:State|null=null,dirty=false,lastSave=0;

function load():State{
  if(cache)return cache;
  for(const f of [FILE,FALLBACK]){
    try{
      const j=JSON.parse(fs.readFileSync(f,'utf8'));
      if(j?.version==='next-move-live-v2'&&j.assets){cache=j;return j;}
    }catch{}
  }
  cache=blank();return cache;
}
function targetFile(){
  try{if(fs.existsSync(path.dirname(FILE)))return FILE;}catch{}
  return FALLBACK;
}
function save(force=false){
  if(!cache||!dirty)return;
  const now=Date.now();
  if(!force&&now-lastSave<3000)return;
  try{
    const f=targetFile(),tmp=f+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(cache));
    fs.renameSync(tmp,f);
    dirty=false;lastSave=now;
  }catch{}
}
function ensure(asset:string):AssetState{
  const st=load();
  if(!st.assets[asset])st.assets[asset]={
    global:blankStat(),bySource:{},byRegime:{},byConfidence:{},
    pending:[],recent:[],lastRecordedBucket:0,lastFingerprint:''
  };
  const a=st.assets[asset];
  a.global ||= blankStat();a.bySource ||= {};a.byRegime ||= {};a.byConfidence ||= {};
  a.pending ||= [];a.recent ||= [];
  return a;
}
function key(x:any,fallback='UNKNOWN'){
  return String(x||fallback).toUpperCase().replace(/[^A-Z0-9_\-]/g,'_').slice(0,64)||fallback;
}
function confidenceBand(v:number){
  return v>=75?'75_PLUS':v>=60?'60_74':v>=45?'45_59':'UNDER_45';
}
function getStat(map:Record<string,Stat>,k:string){
  map[k] ||= blankStat();return map[k];
}
function updateStat(s:Stat,o:Outcome,seconds:number,mfe:number,mae:number,now:number){
  if(o==='HIT')s.hits++;else if(o==='FAIL')s.fails++;else s.neutral++;
  s.sumSeconds+=seconds;s.sumMfeBps+=mfe;s.sumMaeBps+=mae;s.updatedAt=now;
}
function view(s?:Stat){
  const x=s||blankStat(),directional=x.hits+x.fails,resolved=directional+x.neutral;
  return {
    hits:x.hits,fails:x.fails,neutral:x.neutral,resolved,
    accuracy:directional?Number((x.hits/directional*100).toFixed(1)):null,
    resolvedHitRate:resolved?Number((x.hits/resolved*100).toFixed(1)):null,
    posteriorAccuracy:directional?Number(((x.hits+4)/(directional+8)*100).toFixed(1)):50,
    avgSeconds:resolved?Number((x.sumSeconds/resolved).toFixed(1)):null,
    avgMfeBps:resolved?Number((x.sumMfeBps/resolved).toFixed(2)):null,
    avgMaeBps:resolved?Number((x.sumMaeBps/resolved).toFixed(2)):null
  };
}
function updateExcursion(p:Pending,price:number){
  const move=(price-p.entry)/p.entry*10000;
  const favorable=p.side==='BUY'?move:-move;
  const adverse=p.side==='BUY'?-move:move;
  p.mfeBps=Math.max(p.mfeBps,favorable);
  p.maeBps=Math.max(p.maeBps,adverse);
}
function settle(asset:string,price:number,now:number){
  if(!Number.isFinite(price)||price<=0)return;
  const a=ensure(asset),keep:Pending[]=[];
  for(const p of a.pending){
    updateExcursion(p,price);
    const hit=p.side==='BUY'?price>=p.target:price<=p.target;
    const fail=p.side==='BUY'?price<=p.stop:price>=p.stop;
    const expired=now-p.at>=p.horizonMs;
    if(!hit&&!fail&&!expired){keep.push(p);continue;}
    // Strict horizon: an observation arriving after expiry cannot retroactively score HIT/FAIL.
    const outcome:Outcome=expired?'NEUTRAL':hit?'HIT':fail?'FAIL':'NEUTRAL';
    const seconds=expired?p.horizonMs/1000:Math.max(0,(now-p.at)/1000);
    updateStat(a.global,outcome,seconds,p.mfeBps,p.maeBps,now);
    updateStat(getStat(a.bySource,p.source),outcome,seconds,p.mfeBps,p.maeBps,now);
    updateStat(getStat(a.byRegime,p.regime),outcome,seconds,p.mfeBps,p.maeBps,now);
    updateStat(getStat(a.byConfidence,confidenceBand(p.confidence)),outcome,seconds,p.mfeBps,p.maeBps,now);
    a.recent.unshift({
      id:p.id,at:p.at,settledAt:now,side:p.side,source:p.source,regime:p.regime,confidence:p.confidence,
      entry:p.entry,exit:price,target:p.target,stop:p.stop,barrierBps:p.barrierBps,outcome,seconds:Number(seconds.toFixed(1)),
      mfeBps:Number(p.mfeBps.toFixed(2)),maeBps:Number(p.maeBps.toFixed(2))
    });
    if(a.recent.length>120)a.recent=a.recent.slice(0,120);
    dirty=true;
  }
  if(keep.length!==a.pending.length){a.pending=keep;dirty=true;}
}
function summary(asset:string){
  const a=ensure(asset),global=view(a.global);
  const bySource=Object.fromEntries(Object.entries(a.bySource).map(([k,v])=>[k,view(v)]));
  const byRegime=Object.fromEntries(Object.entries(a.byRegime).map(([k,v])=>[k,view(v)]));
  const byConfidence=Object.fromEntries(Object.entries(a.byConfidence).map(([k,v])=>[k,view(v)]));
  const directional=global.hits+global.fails;
  return {
    ok:true,version:'next-move-live-v2',asset,
    global,bySource,byRegime,byConfidence,
    pending:a.pending.length,recent:a.recent.slice(0,12),
    readyForLearning:directional>=50,
    learningSamples:directional,
    storage:targetFile()
  };
}

export function recordNextMoveOutcome(args:{
  asset:string;price:number|null;atr:number|null;now?:number;hunt:any;regime?:string
}){
  const asset=key(args.asset),now=Number(args.now||Date.now()),price=Number(args.price),atr=Number(args.atr);
  if(!Number.isFinite(price)||price<=0)return {ok:false,reason:'invalid_price'};
  settle(asset,price,now);
  const a=ensure(asset);
  const side=args.hunt?.nextMove?.side as Side;
  const confidence=Number(args.hunt?.nextMove?.confidence||0);
  const source=key(args.hunt?.nextMove?.source||'UNKNOWN');
  const regime=key(args.regime||args.hunt?.marketUnderstanding?.mode||args.hunt?.regime||'UNKNOWN');
  const micro=args.hunt?.nextMove?.micro||{};
  let recorded=false,eventId:string|null=null;
  if((side==='BUY'||side==='SELL')&&confidence>=20){
    const bucket=Math.floor(now/30000);
    const atrBps=Number.isFinite(atr)&&atr>0?atr/price*10000:0;
    const barrierBps=Number(cap(Math.max(.8,atrBps*.24),.8,2.5).toFixed(3));
    const fingerprint=[side,source,regime,Math.round(price/(price*barrierBps/10000||1))].join(':');
    const sameLive=a.pending.some(p=>p.side===side&&p.source===source&&now-p.at<25000);
    if(a.lastRecordedBucket!==bucket&&!sameLive){
      eventId=[asset,bucket,side,source].join(':');
      const distance=price*barrierBps/10000;
      const target=side==='BUY'?price+distance:price-distance;
      const stop=side==='BUY'?price-distance:price+distance;
      a.pending.push({
        id:eventId,at:now,side,source,regime,confidence,entry:price,target,stop,barrierBps,horizonMs:120000,
        mfeBps:0,maeBps:0,
        micro:{edge:Number(micro?.edge||0),support:Number(micro?.support||0),opposition:Number(micro?.opposition||0),strong:Boolean(micro?.strong)}
      });
      if(a.pending.length>30)a.pending=a.pending.slice(-30);
      a.lastRecordedBucket=bucket;a.lastFingerprint=fingerprint;dirty=true;recorded=true;
    }
  }
  save(recorded);
  return {...summary(asset),recorded,eventId};
}

export function getNextMoveOutcome(asset:string,price?:number|null,now=Date.now()){
  const a=key(asset),p=Number(price);
  if(Number.isFinite(p)&&p>0)settle(a,p,now);
  save();
  return summary(a);
}

// Background first-passage settlement is driven by instrumentation.ts.
