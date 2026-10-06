import fs from 'node:fs';
import path from 'node:path';

type Side='BUY'|'SELL'|'WAIT';
type Outcome='HIT'|'FAIL'|'NEUTRAL';
type Stat={hits:number;fails:number;neutral:number;sumSeconds:number;sumMfeBps:number;sumMaeBps:number;updatedAt:number;};
type Pending={
  id:string;at:number;side:'BUY'|'SELL';phase:string;confidence:number;
  entry:number;targetLow:number;targetHigh:number;invalidPrice:number;horizonMs:number;
  targetKind:string;distanceAtr:number;liquidityGap:number;conviction:string;signature:string;
  exactSignature:string;learningMode:'LIVE'|'SHADOW';
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
function phaseFamily(x:string){
  const p=safeKey(x,'NEUTRAL');
  if(p==='ACCUMULATING'||p==='MARKUP_READY')return 'ACCUMULATION';
  if(p==='DISTRIBUTING'||p==='MARKDOWN_READY')return 'DISTRIBUTION';
  return 'NEUTRAL';
}
function targetFamily(x:string){
  const k=safeKey(x,'UNKNOWN');
  if(k.includes('UPPER')||k.includes('SUPPLY')||k.includes('ABOVE'))return 'UPPER_LIQUIDITY';
  if(k.includes('LOWER')||k.includes('DEMAND')||k.includes('BELOW'))return 'LOWER_LIQUIDITY';
  return k;
}
function signatureOf(x:{side:string;phase:string;targetKind:string;distanceAtr:number;liquidityGap:number;conviction:string}){
  // Stable archetype: enough context to learn market behavior, but not so granular
  // that every cycle becomes a new signature.
  return [safeKey(x.side),phaseFamily(x.phase),targetFamily(x.targetKind),distanceBand(Number(x.distanceAtr||0)),gapBand(Number(x.liquidityGap||0))].join('|');
}
function exactSignatureOf(x:{side:string;phase:string;targetKind:string;distanceAtr:number;liquidityGap:number;conviction:string}){
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
function signaturePolicy(v:any){
  const n=Number(v?.directional||0),hits=Number(v?.hits||0),fails=Number(v?.fails||0);
  const accuracy=n?hits/n*100:50,posterior=Number(v?.posteriorAccuracy||50);
  const edge=Number(v?.excursionEdge||0),resolved=Number(v?.resolved||0);
  const neutral=Number(v?.neutral||0);
  const earlyPenalty=Boolean(
    n>=3&&accuracy<=34&&edge<0
  );
  const adverseNeutralPenalty=Boolean(
    resolved>=4&&neutral>=3&&edge<=-4
  );
  const hardBlacklist=Boolean(
    (n>=3&&hits===0&&fails>=3&&edge<=-1)||
    (n>=6&&accuracy<=30&&posterior<44&&edge<0)
  );
  const softPenalty=Boolean(
    !hardBlacklist&&(
      (n>=4&&accuracy<46&&edge<0)||
      earlyPenalty||
      adverseNeutralPenalty
    )
  );
  const promoted=Boolean(
    !hardBlacklist&&!softPenalty&&(
      (n>=4&&hits>=4&&accuracy>=80&&posterior>=60&&edge>=.75)||
      (n>=6&&accuracy>=70&&posterior>=58&&edge>=.5)
    )
  );
  let confidenceDelta=0,weight=1;
  if(hardBlacklist){confidenceDelta=-24;weight=.15;}
  else if(promoted){
    const sampleBoost=Math.min(5,Math.max(0,n-4)*.8);
    const qualityBoost=Math.min(5,Math.max(0,posterior-58)*.45+Math.max(0,edge)*.35);
    confidenceDelta=Math.round(4+sampleBoost+qualityBoost);
    weight=Number(Math.min(1.35,1.08+confidenceDelta*.022).toFixed(2));
  }else if(softPenalty){
    const earlyExtra=earlyPenalty?3:0;
    const neutralExtra=adverseNeutralPenalty?Math.min(5,Math.round(Math.abs(edge)*.35)):0;
    confidenceDelta=-Math.min(14,Math.round(4+(46-accuracy)*.22+Math.min(4,Math.abs(edge)*.30)+earlyExtra+neutralExtra));
    weight=Number(Math.max(.45,1+confidenceDelta*.038).toFixed(2));
  }
  return {
    status:hardBlacklist?'AUTO_BLACKLIST'
      :promoted?'AUTO_PROMOTE'
      :earlyPenalty?'EARLY_PENALIZE'
      :adverseNeutralPenalty?'ADVERSE_NEUTRAL_PENALIZE'
      :softPenalty?'AUTO_PENALIZE'
      :n>=3?'WATCH':'COLLECTING',
    n,hits,fails,neutral,resolved,accuracy:Number(accuracy.toFixed(1)),posterior:Number(posterior.toFixed(1)),
    excursionEdge:Number(edge.toFixed(2)),confidenceDelta,weight,
    hardBlacklist,promoted,softPenalty,earlyPenalty,adverseNeutralPenalty,
    negativeContext:Boolean(hardBlacklist||softPenalty)
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
    const seconds=Number(((now-p.at)/1000).toFixed(1));
    update(a.global,outcome,now,seconds,p.bestBps,p.worstBps);
    update(stat(a.bySide,p.side),outcome,now,seconds,p.bestBps,p.worstBps);
    update(stat(a.byPhase,String(p.phase||'NEUTRAL')),outcome,now,seconds,p.bestBps,p.worstBps);
    const learnedSignature=String(p.signature||signatureOf({
      side:p.side,phase:p.phase,targetKind:p.targetKind||'LEGACY',
      distanceAtr:Number(p.distanceAtr||0),liquidityGap:Number(p.liquidityGap||0),conviction:p.conviction||'UNKNOWN'
    }));
    update(stat(a.bySignature,learnedSignature),outcome,now,seconds,p.bestBps,p.worstBps);
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
    pending:a.pending.length,
    pendingLive:a.pending.filter(x=>x.learningMode!=='SHADOW').length,
    pendingShadow:a.pending.filter(x=>x.learningMode==='SHADOW').length,
    recent:a.recent.slice(0,36),
    recentLive:a.recent.slice(0,80).filter(x=>x.learningMode!=='SHADOW').length,
    recentShadow:a.recent.slice(0,80).filter(x=>x.learningMode==='SHADOW').length,
    failureStreak:failStreak(a.recent),
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
  const context={side,phase:ph,targetKind:kind,distanceAtr,liquidityGap:liqGap,conviction};
  const sig=signatureOf(context);
  const exactSig=exactSignatureOf(context);
  const upProb=Number(pathForecast?.probabilities?.up||50),downProb=Number(pathForecast?.probabilities?.down||50);
  const probabilityAligned=side==='BUY'?upProb>downProb:side==='SELL'?downProb>upProb:false;
  const learningCandidate={
    side,confidence:raw,conviction,phase:ph,destination:pathForecast?.destination||null,
    probabilities:pathForecast?.probabilities||null,evidence:pathForecast?.evidence||null,
    invalidation:pathForecast?.invalidation||null,signature:sig,exactSignature:exactSig,
    probabilityAligned
  };
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
  const autoPolicy=signaturePolicy(sg);
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
  confidence+=Number(autoPolicy.confidenceDelta||0);
  const primaryProbability=Math.max(Number(pathForecast?.probabilities?.up||0),Number(pathForecast?.probabilities?.down||0),Number(pathForecast?.rawProbability||0));
  if(conviction==='WEAK'||primaryProbability<55)confidence=Math.min(confidence,Math.round(cap(primaryProbability,42,55)));
  confidence=Math.round(cap(confidence,18,84));
  const archetypeSamples=sn;
  const hardVeto=Boolean(
    autoPolicy.hardBlacklist||
    (archetypeSamples>=10&&Number(sg.posteriorAccuracy||50)<43)||
    (Number(tk.directional||0)>=16&&targetQuality<42)||
    (gn>=30&&Number(g.posteriorAccuracy||50)<43&&streak>=2)
  );
  const contextReady=Boolean(archetypeSamples>=8&&Number(tk.directional||0)>=10);
  const broadQualified=Boolean(
    !autoPolicy.negativeContext&&
    gn>=30&&Number(g.posteriorAccuracy||50)>=55&&
    (Number(s.directional||0)<12||Number(s.posteriorAccuracy||50)>=52)
  );
  const contextQualified=Boolean(
    contextReady&&Number(sg.posteriorAccuracy||50)>=54&&signatureQuality>=49&&targetQuality>=48
  );
  const autoPromoted=Boolean(autoPolicy.promoted&&!hardVeto);
  const coldContextBlocked=Boolean(!contextReady&&!broadQualified&&gn>=30);
  const promoted=Boolean(!hardVeto&&confidence>=54&&(autoPromoted||contextQualified||(!contextReady&&broadQualified)));
  const probabilityConflict=!probabilityAligned;
  const backstopBelowGate=Boolean(!contextReady&&broadQualified&&!promoted);
  const finalBlocked=hardVeto||coldContextBlocked||probabilityConflict||backstopBelowGate;
  const learningStatus=probabilityConflict?'PROBABILITY_SIDE_CONFLICT'
    :backstopBelowGate?'BACKSTOP_BELOW_GATE'
    :autoPolicy.hardBlacklist?'AUTO_BLACKLIST'
    :hardVeto?'HARD_VETO'
    :autoPromoted?'AUTO_PROMOTE'
    :autoPolicy.earlyPenalty?'EARLY_PENALIZE'
    :autoPolicy.adverseNeutralPenalty?'ADVERSE_NEUTRAL_PENALIZE'
    :autoPolicy.softPenalty?'AUTO_PENALIZE'
    :contextQualified?'CONTEXT_PROMOTED'
    :contextReady?'CONTEXT_WATCH'
    :broadQualified?'COLLECTING_CONTEXT_WITH_STRONG_BACKSTOP'
    :'COLLECTING_CONTEXT_BLOCKED';
  return {
    ...pathForecast,
    side:finalBlocked?'WAIT':pathForecast.side,
    rawConfidence:Math.round(raw),
    confidence:finalBlocked?Math.min(36,confidence):autoPromoted?Math.min(84,Math.max(confidence,raw+4)):!contextReady&&broadQualified?Math.min(62,confidence):confidence,
    conviction:finalBlocked?'WEAK':autoPromoted&&pathForecast.conviction==='WEAK'?'MODERATE':pathForecast.conviction,
    learning:{
      version:'structural-path-learning-v4-loss-memory',
      status:learningStatus,
      samples:gn,observedAccuracy:Number(observed.toFixed(1)),
      globalPosterior:Number(g.posteriorAccuracy||50),sidePosterior:Number(s.posteriorAccuracy||50),
      phasePosterior:Number(p.posteriorAccuracy||50),signature:sig,exactSignature:exactSig,signatureSamples:archetypeSamples,
      signaturePosterior:Number(sg.posteriorAccuracy||50),targetKindPosterior:Number(tk.posteriorAccuracy||50),
      distancePosterior:Number(db.posteriorAccuracy||50),signatureQuality:Number(signatureQuality.toFixed(1)),
      targetQuality:Number(targetQuality.toFixed(1)),distanceQuality:Number(distanceQuality.toFixed(1)),
      excursionEdge:Number(excursionEdge.toFixed(2)),failureStreak:streak,maturity:Number(maturity.toFixed(2)),
      contextReady,broadQualified,contextQualified,promoted,autoPromoted,autoPolicy,hardVeto,coldContextBlocked,backstopBelowGate,probabilityAligned,probabilityConflict
    },
    learningCandidate,
    scenario:probabilityConflict
      ?'تم إيقاف المسار لأن الاتجاه المثبت لا يطابق الاحتمالات الحالية'
      :backstopBelowGate
        ?'التاريخ العام يدعم السيناريو لكن الثقة السياقية الحالية أقل من بوابة الاعتماد؛ المسار تحت المراقبة فقط'
        :autoPolicy.hardBlacklist
        ?'تم حظر عائلة المسار تلقائيًا بعد تكرار الفشل وحركة سلبية ضد السيناريو؛ تستمر في Shadow للتعافي'
        :autoPolicy.earlyPenalty
          ?'تم إيقاف دعم التاريخ العام لهذا السيناريو بعد أداء مبكر ضعيف؛ يستمر Shadow حتى تتضح العينة'
          :autoPolicy.adverseNeutralPenalty
            ?'السيناريو يكرر حركة سلبية رغم انتهاء النتائج كمحايدة؛ تم خفضه وإبقاؤه تحت المراقبة'
            :hardVeto
              ?'تم رفض المسار لأن هذا النمط خاسر تاريخيًا أو جودة حركته ضعيفة'
              :autoPromoted
            ?'عائلة مسار مثبتة إحصائيًا؛ تمت ترقية وزنها تلقائيًا مع استمرار المراقبة'
            :coldContextBlocked
              ?'المسار تحت التعلم السياقي؛ التاريخ العام غير قوي بما يكفي للسماح بتوقع اتجاهي الآن'
              :pathForecast.scenario
  };
}

export function recordStructuralPathOutcome(args:{
  asset:string;price:number|null;atr:number|null;now?:number;pathForecast:any;phase?:string;
}){
  const now=Number(args.now||Date.now()),price=Number(args.price),atr=Number(args.atr);
  if(!Number.isFinite(price)||price<=0)return {ok:false,reason:'invalid_price'};
  settle(args.asset,price,now);
  const pf=args.pathForecast||{};
  const visibleSide=String(pf.side||'WAIT') as Side;
  const candidate=pf?.learningCandidate||null;
  const useShadow=Boolean(
    (visibleSide==='WAIT')&&candidate&&
    (candidate.side==='BUY'||candidate.side==='SELL')&&
    candidate.destination&&candidate.probabilityAligned!==false
  );
  const source=useShadow?candidate:pf;
  const side=String(source?.side||'WAIT') as Side,d=source?.destination;
  if((side!=='BUY'&&side!=='SELL')||!d)return {...summary(args.asset),recorded:false,reason:'no_directional_candidate'};
  const low=Number(d.low),high=Number(d.high);
  if(!Number.isFinite(low)||!Number.isFinite(high)||high<low)return {...summary(args.asset),recorded:false,reason:'invalid_destination'};
  const confidence=Number(source?.confidence||pf?.rawConfidence||pf?.confidence||0);
  const probs=source?.probabilities||pf?.probabilities||{};
  const sideProbability=side==='BUY'?Number(probs?.up||0):Number(probs?.down||0);
  const probabilityGap=Math.abs(Number(probs?.up||50)-Number(probs?.down||50));
  // Shadow candidates are deliberately learned even when not shown. They still need a
  // real directional edge and destination, otherwise noise would poison the learner.
  if(confidence<28||sideProbability<53||probabilityGap<6)return {...summary(args.asset),recorded:false,reason:'candidate_too_ambiguous'};
  const a=ensure(args.asset),distanceAtr=Math.abs(Number(d.mid??((low+high)/2))-price)/Math.max(1e-9,atr||price*.001);
  const targetKind=String(d.kind||'UNKNOWN');
  const liquidityGap=Math.abs(Number((source?.evidence?.liquidity?.gap??pf?.evidence?.liquidity?.gap)??0));
  const conviction=String(source?.conviction||pf?.conviction||'WEAK');
  const phase=String(source?.phase||args.phase||pf.phase||'NEUTRAL');
  const signature=String(source?.signature||signatureOf({side,phase,targetKind,distanceAtr,liquidityGap,conviction}));
  const exactSignature=String(source?.exactSignature||exactSignatureOf({side,phase,targetKind,distanceAtr,liquidityGap,conviction}));
  const learningMode:'LIVE'|'SHADOW'=useShadow?'SHADOW':'LIVE';
  const horizonMs=distanceAtr<=.6?180000:distanceAtr<=1.2?360000:720000;
  const bucket=Math.floor(now/60000);
  const same=a.pending.some(x=>x.side===side&&now-x.at<45000);
  if(a.lastBucket===bucket||same)return {...summary(args.asset),recorded:false};
  const inv=Number(pf?.invalidation?.price);
  const fallbackDistance=Math.max(Number.isFinite(atr)&&atr>0?atr*.55:price*.0018,price*.0007);
  const invalidPrice=Number.isFinite(inv)&&inv>0?inv:(side==='BUY'?price-fallbackDistance:price+fallbackDistance);
  const id=[String(args.asset).toUpperCase(),bucket,side].join(':');
  a.pending.push({
    id,at:now,side:side as 'BUY'|'SELL',phase,
    confidence,entry:price,targetLow:low,targetHigh:high,invalidPrice,horizonMs,
    targetKind,distanceAtr:Number(distanceAtr.toFixed(3)),liquidityGap:Number(liquidityGap.toFixed(1)),conviction,signature,exactSignature,learningMode,
    bestBps:0,worstBps:0
  });
  if(a.pending.length>24)a.pending=a.pending.slice(-24);
  a.lastBucket=bucket;dirty=true;save(true);
  return {...summary(args.asset),recorded:true,eventId:id,learningMode,signature,exactSignature};
}
