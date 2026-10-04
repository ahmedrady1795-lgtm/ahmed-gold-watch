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
  micro?:{edge:number;support:number;opposition:number;strong:boolean;[key:string]:any};
};
type Recent={
  id:string;at:number;settledAt:number;side:'BUY'|'SELL';source:string;regime:string;confidence:number;
  entry:number;exit:number;target:number;stop:number;barrierBps:number;outcome:Outcome;
  seconds:number;mfeBps:number;maeBps:number;
  micro?:{edge:number;support:number;opposition:number;strong:boolean;[key:string]:any};
};
type AssetState={
  global:Stat;
  bySource:Record<string,Stat>;
  byRegime:Record<string,Stat>;
  byConfidence:Record<string,Stat>;
  pending:Pending[];
  recent:Recent[];
  history:Recent[];
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
    pending:[],recent:[],history:[],lastRecordedBucket:0,lastFingerprint:''
  };
  const a=st.assets[asset];
  a.global ||= blankStat();a.bySource ||= {};a.byRegime ||= {};a.byConfidence ||= {};
  a.pending ||= [];a.recent ||= [];
  if(!Array.isArray(a.history)||!a.history.length)a.history=[...a.recent].reverse();
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
    const settled:Recent={
      id:p.id,at:p.at,settledAt:now,side:p.side,source:p.source,regime:p.regime,confidence:p.confidence,
      entry:p.entry,exit:price,target:p.target,stop:p.stop,barrierBps:p.barrierBps,outcome,seconds:Number(seconds.toFixed(1)),
      mfeBps:Number(p.mfeBps.toFixed(2)),maeBps:Number(p.maeBps.toFixed(2)),micro:p.micro
    };
    a.recent.unshift(settled);
    a.history.push(settled);
    if(a.recent.length>120)a.recent=a.recent.slice(0,120);
    if(a.history.length>2400)a.history=a.history.slice(-2400);
    dirty=true;
  }
  if(keep.length!==a.pending.length){a.pending=keep;dirty=true;}
}

function directionalRows(a:AssetState){
  return (a.history||[]).filter(x=>x.outcome==='HIT'||x.outcome==='FAIL').sort((x,y)=>x.settledAt-y.settledAt);
}
function acc(rows:Recent[]){
  if(!rows.length)return null;
  const h=rows.filter(x=>x.outcome==='HIT').length;
  return h/rows.length*100;
}
function chooseThreshold(train:Recent[]){
  const candidates=[20,30,35,40,45,50,55,60,65,70];
  let best={threshold:20,score:-1,accuracy:50,coverage:1,n:train.length};
  for(const threshold of candidates){
    const selected=train.filter(x=>Number(x.confidence)>=threshold);
    const coverage=train.length?selected.length/train.length:0;
    if(selected.length<5||coverage<.25)continue;
    const hits=selected.filter(x=>x.outcome==='HIT').length;
    const posterior=(hits+4)/(selected.length+8)*100;
    const score=posterior-Math.max(0,.45-coverage)*12;
    if(score>best.score)best={threshold,score,accuracy:hits/selected.length*100,coverage,n:selected.length};
  }
  return best;
}
function walkForwardRows(rows:Recent[]){
  const minTrain=20,testSize=5;
  if(rows.length<minTrain+testSize){
    const recent=rows.slice(-10),prior=rows.slice(Math.max(0,rows.length-30),Math.max(0,rows.length-10));
    return {
      status:'COLLECTING',ready:false,directional:rows.length,minRequired:minTrain+testSize,
      oos:{folds:0,n:0,hits:0,fails:0,accuracy:null,coverage:null},
      drift:{recentAccuracy:acc(recent),priorAccuracy:acc(prior),delta:null,status:'COLLECTING'},
      activeThreshold:null
    };
  }
  const folds:any[]=[];let totalTest=0,totalSelected=0,totalHits=0,totalFails=0;
  for(let start=minTrain;start<rows.length;start+=testSize){
    const train=rows.slice(0,start);
    const test=rows.slice(start,Math.min(rows.length,start+testSize));
    if(!test.length)break;
    const pick=chooseThreshold(train);
    const selected=test.filter(x=>Number(x.confidence)>=pick.threshold);
    const hits=selected.filter(x=>x.outcome==='HIT').length,fails=selected.filter(x=>x.outcome==='FAIL').length;
    totalTest+=test.length;totalSelected+=selected.length;totalHits+=hits;totalFails+=fails;
    folds.push({
      trainN:train.length,testN:test.length,threshold:pick.threshold,
      trainAccuracy:Number(pick.accuracy.toFixed(1)),trainCoverage:Number((pick.coverage*100).toFixed(1)),
      selectedN:selected.length,hits,fails,
      accuracy:selected.length?Number((hits/selected.length*100).toFixed(1)):null,
      coverage:Number((selected.length/test.length*100).toFixed(1))
    });
  }
  const recent=rows.slice(-10),prior=rows.slice(Math.max(0,rows.length-30),Math.max(0,rows.length-10));
  const recentAccuracy=acc(recent),priorAccuracy=acc(prior);
  const delta=recentAccuracy!=null&&priorAccuracy!=null?recentAccuracy-priorAccuracy:null;
  const oosAcc=totalSelected?totalHits/totalSelected*100:null;
  const oosCoverage=totalTest?totalSelected/totalTest*100:null;
  const active=chooseThreshold(rows);
  const driftStatus=delta==null?'COLLECTING':delta<=-15?'DEGRADING':delta>=12?'IMPROVING':'STABLE';
  const status=totalSelected<10?'COLLECTING':oosAcc!=null&&oosAcc>=55&&Number(oosCoverage)>=25&&driftStatus!=='DEGRADING'?'PASS':'WATCH';
  return {
    status,ready:status==='PASS',directional:rows.length,minRequired:minTrain+testSize,
    oos:{
      folds:folds.length,n:totalSelected,hits:totalHits,fails:totalFails,
      accuracy:oosAcc==null?null:Number(oosAcc.toFixed(1)),
      coverage:oosCoverage==null?null:Number(oosCoverage.toFixed(1)),
      recentFolds:folds.slice(-6)
    },
    drift:{
      recentN:recent.length,priorN:prior.length,
      recentAccuracy:recentAccuracy==null?null:Number(recentAccuracy.toFixed(1)),
      priorAccuracy:priorAccuracy==null?null:Number(priorAccuracy.toFixed(1)),
      delta:delta==null?null:Number(delta.toFixed(1)),status:driftStatus
    },
    activeThreshold:active.threshold,
    activeTrainAccuracy:Number(active.accuracy.toFixed(1)),
    activeCoverage:Number((active.coverage*100).toFixed(1))
  };
}
function walkForward(a:AssetState,source?:string){
  const rows=directionalRows(a).filter(x=>!source||x.source===source);
  return walkForwardRows(rows);
}

function summary(asset:string){
  const a=ensure(asset),global=view(a.global);
  const bySource=Object.fromEntries(Object.entries(a.bySource).map(([k,v])=>[k,view(v)]));
  const byRegime=Object.fromEntries(Object.entries(a.byRegime).map(([k,v])=>[k,view(v)]));
  const byConfidence=Object.fromEntries(Object.entries(a.byConfidence).map(([k,v])=>[k,view(v)]));
  const directional=global.hits+global.fails;
  const walk=walkForward(a);
  const walkForwardBySource=Object.fromEntries(
    Object.keys(a.bySource||{}).map(source=>[source,walkForward(a,source)])
  );
  return {
    ok:true,version:'next-move-live-v2',asset,
    global,bySource,byRegime,byConfidence,
    pending:a.pending.length,recent:a.recent.slice(0,12),
    walkForward:walk,walkForwardBySource,
    readyForLearning:directional>=50,
    learningSamples:directional,
    storage:targetFile()
  };
}


function statReliability(v:any){
  const hits=Number(v?.hits||0),fails=Number(v?.fails||0),neutral=Number(v?.neutral||0);
  const directional=hits+fails,resolved=directional+neutral;
  const posterior=directional?Number(v?.posteriorAccuracy??((hits+4)/(directional+8)*100)):50;
  const coverage=resolved?directional/resolved:0;
  const effective=50+(posterior-50)*Math.sqrt(Math.max(0,Math.min(1,coverage)));
  return {effective,posterior,coverage,directional,resolved};
}

export function calibrateNextMoveConfidence(nextMove:any,live:any,regime?:string){
  if(!nextMove||!['BUY','SELL'].includes(String(nextMove?.side)))return nextMove;
  const raw=cap(Number(nextMove?.confidence||0),0,88);
  const source=key(nextMove?.source||'UNKNOWN');
  const reg=key(regime||'UNKNOWN');
  const band=confidenceBand(raw);
  const global=statReliability(live?.global);
  const src=statReliability(live?.bySource?.[source]);
  const rg=statReliability(live?.byRegime?.[reg]);
  const bd=statReliability(live?.byConfidence?.[band]);

  const rows=[
    {r:global,w:.24*Math.min(1,global.directional/20)},
    {r:src,w:.36*Math.min(1,src.directional/18)},
    {r:rg,w:.24*Math.min(1,rg.directional/18)},
    {r:bd,w:.16*Math.min(1,bd.directional/12)}
  ].filter(x=>x.w>0);
  const wsum=rows.reduce((a,x)=>a+x.w,0);
  const observed=wsum?rows.reduce((a,x)=>a+x.r.effective*x.w,0)/wsum:50;
  const samples=Number(live?.learningSamples||global.directional||0);
  const maturity=Math.min(1,samples/60);
  const liveWeight=.70*maturity;
  let calibrated=raw*(1-liveWeight)+observed*liveWeight;
  const capFromLive=observed+14+(1-maturity)*10;
  calibrated=Math.min(calibrated,capFromLive);
  if(Number(nextMove?.micro?.opposition||0)>=3)calibrated-=4;
  if(nextMove?.conflictWithLockedDirection)calibrated-=3;

  const sourceWf=live?.walkForwardBySource?.[source]||null;
  const wf=Number(sourceWf?.directional||0)>=25?sourceWf:(live?.walkForward||{});
  const wfScope=Number(sourceWf?.directional||0)>=25?'SOURCE':'GLOBAL_PRIOR';
  const oosN=Number(wf?.oos?.n||0),oosAcc=Number(wf?.oos?.accuracy),oosCoverage=Number(wf?.oos?.coverage);
  const driftDelta=Number(wf?.drift?.delta);
  let walkForwardAdjustment=0;
  if(oosN>=10){
    if(wf?.drift?.status==='DEGRADING')walkForwardAdjustment-=8;
    else if(wf?.status==='WATCH')walkForwardAdjustment-=4;
    else if(wf?.status==='PASS'&&Number.isFinite(oosAcc)&&oosAcc>=58)walkForwardAdjustment+=2;
    if(Number.isFinite(driftDelta)&&driftDelta<=-25)walkForwardAdjustment-=4;
    if(Number.isFinite(oosCoverage)&&oosCoverage<25)walkForwardAdjustment-=3;
    const threshold=Number(wf?.activeThreshold);
    if(Number.isFinite(threshold)&&raw<threshold)walkForwardAdjustment-=5;
  }
  calibrated+=walkForwardAdjustment;
  calibrated=Math.round(cap(calibrated,12,86));

  return {
    ...nextMove,
    confidence:calibrated,
    rawConfidence:Math.round(raw),
    calibration:{
      version:'confidence-v3',
      observedReliability:Number(observed.toFixed(1)),
      maturity:Number(maturity.toFixed(3)),
      learningSamples:samples,
      sourceSamples:src.directional,
      regimeSamples:rg.directional,
      bandSamples:bd.directional,
      sourcePosterior:Number(src.posterior.toFixed(1)),
      sourceCoverage:Number((src.coverage*100).toFixed(1)),
      cap:Number(capFromLive.toFixed(1)),
      walkForwardStatus:String(wf?.status||'COLLECTING'),
      walkForwardScope:wfScope,
      walkForwardOosN:oosN,
      walkForwardOosAccuracy:Number.isFinite(oosAcc)?Number(oosAcc.toFixed(1)):null,
      walkForwardCoverage:Number.isFinite(oosCoverage)?Number(oosCoverage.toFixed(1)):null,
      driftStatus:String(wf?.drift?.status||'COLLECTING'),
      driftDelta:Number.isFinite(driftDelta)?Number(driftDelta.toFixed(1)):null,
      activeThreshold:Number.isFinite(Number(wf?.activeThreshold))?Number(wf.activeThreshold):null,
      walkForwardAdjustment
    }
  };
}

export function recordNextMoveOutcome(args:{
  asset:string;price:number|null;atr:number|null;now?:number;hunt:any;regime?:string;
  horizonMs?:number;barrierScale?:number;minBarrierBps?:number;maxBarrierBps?:number
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
    const horizonMs=Math.max(30000,Math.min(180000,Number(args.horizonMs||120000)));
    const bucket=Math.floor(now/Math.min(30000,horizonMs/2));
    const atrBps=Number.isFinite(atr)&&atr>0?atr/price*10000:0;
    const scale=Number.isFinite(Number(args.barrierScale))?Number(args.barrierScale):.24;
    const minBarrier=Number.isFinite(Number(args.minBarrierBps))?Number(args.minBarrierBps):.8;
    const maxBarrier=Number.isFinite(Number(args.maxBarrierBps))?Number(args.maxBarrierBps):2.5;
    const barrierBps=Number(cap(Math.max(minBarrier,atrBps*scale),minBarrier,maxBarrier).toFixed(3));
    const fingerprint=[side,source,regime,Math.round(price/(price*barrierBps/10000||1))].join(':');
    const sameLive=a.pending.some(p=>p.side===side&&p.source===source&&now-p.at<25000);
    if(a.lastRecordedBucket!==bucket&&!sameLive){
      eventId=[asset,bucket,side,source].join(':');
      const distance=price*barrierBps/10000;
      const target=side==='BUY'?price+distance:price-distance;
      const stop=side==='BUY'?price-distance:price+distance;
      a.pending.push({
        id:eventId,at:now,side,source,regime,confidence,entry:price,target,stop,barrierBps,horizonMs,
        mfeBps:0,maeBps:0,
        micro:{
          edge:Number(micro?.edge||0),support:Number(micro?.support||0),opposition:Number(micro?.opposition||0),strong:Boolean(micro?.strong),
          liveSupport:Number(micro?.liveSupport||0),liveOpposition:Number(micro?.liveOpposition||0),
          requiredEdge:Number(micro?.requiredEdge||0),requiredSupport:Number(micro?.requiredSupport||0),
          scalp:String(micro?.scalp||'WAIT'),liquidity:String(micro?.liquidity||'WAIT'),tick:String(micro?.tick||'WAIT'),
          motion:String(micro?.motion||'WAIT'),ml1:String(micro?.ml1||'WAIT'),trap:String(micro?.trap||'WAIT'),
          validatedMlConflict:Boolean(micro?.validatedMlConflict),reactionConflict:Boolean(micro?.reactionConflict),
          slowDoubleConflict:Boolean(micro?.slowDoubleConflict),historicalWeak:Boolean(micro?.historicalWeak),
          wfScope:String(micro?.wfScope||''),wfStatus:String(micro?.wfStatus||''),
          predatorPhase:String(micro?.predator?.phase||micro?.predatorPhase||''),
          predatorPattern:String(micro?.predator?.pattern||micro?.predatorPattern||''),
          predatorScore:Number(micro?.predator?.score||micro?.predatorScore||0),
          predatorStableCount:Number(micro?.predator?.stableCount||micro?.predatorStableCount||0),
          predatorPersistence:Number(micro?.predator?.persistence||micro?.predatorPersistence||0),
          predatorTemporalReady:Boolean(micro?.predator?.temporalReady||micro?.predatorTemporalReady),
          predatorShockReady:Boolean(micro?.predator?.shockReady||micro?.predatorShockReady)
        }
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
