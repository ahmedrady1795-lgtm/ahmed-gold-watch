import {promises as fs} from 'node:fs';
import path from 'node:path';
import type {Candle} from './engine';

type Side='BUY'|'SELL'|'WAIT';
type Horizon='h1'|'h5';

type Stats={n:number;up:number;down:number;flat:number;strongUp:number;strongDown:number;sumAtr:number;sumAbsAtr:number;lastAt:number};
type ComponentStats={n:number;correct:number;wrong:number;flat:number;sumSignedAtr:number;lastAt:number};
type PatternBucket={h1:Stats;h5:Stats};
type Observation={
  id:string;asset:string;candleTime:number;price:number;atr:number;keys:string[];
  prediction:Side;predictionConfidence:number;
  components:Record<string,Side>;
  settled1:boolean;settled5:boolean;createdAt:number;
};
type RecommendationCase={
  id:string;asset:string;side:'BUY'|'SELL';entry:number;invalidation:number;target:number|null;confidence:number;
  atr:number;keys:string[];components:Record<string,Side>;createdAt:number;
};
type FailureCase={
  id:string;asset:string;side:'BUY'|'SELL';entry:number;exit:number;invalidation:number;confidence:number;
  adverseAtr:number;keys:string[];components:Record<string,Side>;at:number;reason:string;
};
type Store={
  version:number;
  patterns:Record<string,PatternBucket>;
  components:Record<string,Record<string,{h1:ComponentStats;h5:ComponentStats}>>;
  forecast:Record<string,{h1:ComponentStats;h5:ComponentStats}>;
  observations:Observation[];
  activeRecommendations:Record<string,RecommendationCase>;
  failures:FailureCase[];
  bootstrapped:Record<string,number>;
  totals:Record<string,{observations:number;resolved1:number;resolved5:number;updatedAt:number}>;
};

export type MarketLearningSignal={
  ok:boolean;asset:string;side:Side;score:number;confidence:number;
  buyScore:number;sellScore:number;effectiveSamples:number;
  horizon1:{side:Side;score:number;confidence:number;samples:number;meanAtr:number;burstSide:Side;burstScore:number;burstProbability:number};
  horizon5:{side:Side;score:number;confidence:number;samples:number;meanAtr:number;burstSide:Side;burstScore:number;burstProbability:number};
  strongMoveMemory:{side:Side;score:number;probability:number;samples:number;meanAtr:number}|null;
  selfCalibration:{reliability:number;h1:number;h5:number;samples1:number;samples5:number};
  matchedPatterns:number;
  componentReliability:Record<string,{h1:number;h5:number;samples1:number;samples5:number}>;
  learnedWeights:Record<string,number>;
  totals:{observations:number;resolved1:number;resolved5:number};
  storage:string;
  reasons:string[];
};

const FILE=process.env.PREDATOR_LEARNING_FILE||'/data/predator-market-learning.json';
const FALLBACK='/tmp/predator-market-learning.json';
const SCHEMA='v3';
const emptyStats=():Stats=>({n:0,up:0,down:0,flat:0,strongUp:0,strongDown:0,sumAtr:0,sumAbsAtr:0,lastAt:0});
const emptyComponent=():ComponentStats=>({n:0,correct:0,wrong:0,flat:0,sumSignedAtr:0,lastAt:0});
const emptyStore=():Store=>({version:4,patterns:{},components:{},forecast:{},observations:[],activeRecommendations:{},failures:[],bootstrapped:{},totals:{}});
const cap=(n:number,a=0,b=92)=>Math.max(a,Math.min(b,n));
const avg=(a:number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;

let loaded=false,store:Store=emptyStore(),storagePath=FILE;
let queue=Promise.resolve();

function serialized<T>(fn:()=>Promise<T>):Promise<T>{
  const next=queue.then(fn,fn);
  queue=next.then(()=>undefined,()=>undefined);
  return next;
}
async function ensureDir(file:string){await fs.mkdir(path.dirname(file),{recursive:true}).catch(()=>{});}
async function load(){
  if(loaded)return;
  for(const file of [FILE,FALLBACK]){
    try{
      await ensureDir(file);
      const raw=await fs.readFile(file,'utf8');
      const parsed=JSON.parse(raw);
      if(parsed&&parsed.version>=1){store={...emptyStore(),...parsed,version:4};store.patterns||={};store.components||={};store.forecast||={};store.observations||=[];store.activeRecommendations||={};store.failures||=[];store.bootstrapped||={};store.totals||={};storagePath=file;loaded=true;return;}
    }catch{}
  }
  storagePath=FILE;
  try{await ensureDir(FILE);await fs.writeFile(FILE,JSON.stringify(store));}
  catch{storagePath=FALLBACK;await ensureDir(FALLBACK).catch(()=>{});}
  loaded=true;
}
async function save(){
  const file=storagePath,tmp=file+'.tmp';
  try{await ensureDir(file);await fs.writeFile(tmp,JSON.stringify(store));await fs.rename(tmp,file);}
  catch{
    if(file!==FALLBACK){
      storagePath=FALLBACK;await ensureDir(FALLBACK).catch(()=>{});
      await fs.writeFile(FALLBACK+'.tmp',JSON.stringify(store)).catch(()=>{});
      await fs.rename(FALLBACK+'.tmp',FALLBACK).catch(()=>{});
    }
  }
}
function halfLife(h:Horizon){return h==='h1'?12*60*60*1000:48*60*60*1000;}
function normalizeStats(s:Stats){s.n=Number(s.n||0);s.up=Number(s.up||0);s.down=Number(s.down||0);s.flat=Number(s.flat||0);s.strongUp=Number(s.strongUp||0);s.strongDown=Number(s.strongDown||0);s.sumAtr=Number(s.sumAtr||0);s.sumAbsAtr=Number(s.sumAbsAtr||0);s.lastAt=Number(s.lastAt||0);return s;}
function normalizeComp(s:ComponentStats){s.n=Number(s.n||0);s.correct=Number(s.correct||0);s.wrong=Number(s.wrong||0);s.flat=Number(s.flat||0);s.sumSignedAtr=Number(s.sumSignedAtr||0);s.lastAt=Number(s.lastAt||0);return s;}
function decayStats(s:Stats,at:number,h:Horizon){normalizeStats(s);if(!s.lastAt||at<=s.lastAt)return;const f=Math.pow(.5,(at-s.lastAt)/halfLife(h));if(f<.999){s.n*=f;s.up*=f;s.down*=f;s.flat*=f;s.strongUp*=f;s.strongDown*=f;s.sumAtr*=f;s.sumAbsAtr*=f;}}
function decayComp(s:ComponentStats,at:number,h:Horizon){normalizeComp(s);if(!s.lastAt||at<=s.lastAt)return;const f=Math.pow(.5,(at-s.lastAt)/halfLife(h));if(f<.999){s.n*=f;s.correct*=f;s.wrong*=f;s.flat*=f;s.sumSignedAtr*=f;}}
function session(at:number){const h=new Date(at).getUTCHours();if(h>=12&&h<16)return 'OVERLAP';if(h>=7&&h<12)return 'LONDON';if(h>=16&&h<21)return 'NEWYORK';if(h>=0&&h<7)return 'ASIA';return 'LATE';}
function atrAt(c:Candle[],i:number,n=14){
  if(i<n)return NaN;let sum=0,k=0;
  for(let j=i-n+1;j<=i;j++){const x=c[j],p=c[j-1];if(!x||!p)continue;sum+=Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close));k++;}
  return k?sum/k:NaN;
}
function bucket(v:number,cuts:number[]){
  let i=0;while(i<cuts.length&&v>cuts[i])i++;return i;
}
function priceFeatures(c:Candle[],i:number){
  if(i<24)return null;
  const a=atrAt(c,i,14);if(!Number.isFinite(a)||a<=0)return null;
  const x=c[i],p1=c[i-1],p3=c[i-3],p6=c[i-6];
  const r1=(x.close-p1.close)/a,r3=(x.close-p3.close)/a,r6=(x.close-p6.close)/a,accel=r1-r3/3;
  const recent=c.slice(i-3,i+1).map(v=>v.high-v.low),prior=c.slice(i-15,i-3).map(v=>v.high-v.low);
  const compression=avg(prior)>0?avg(recent)/avg(prior):1;
  const base=c.slice(i-20,i),hi=Math.max(...base.map(v=>v.high)),lo=Math.min(...base.map(v=>v.low)),span=Math.max(1e-9,hi-lo);
  const pos=(x.close-lo)/span;
  const range=Math.max(1e-9,x.high-x.low),body=(x.close-x.open)/range;
  const upper=(x.high-Math.max(x.open,x.close))/range,lower=(Math.min(x.open,x.close)-x.low)/range,wick=lower-upper;
  const path=c.slice(i-6,i+1).reduce((s,v,j,a2)=>j?s+Math.abs(v.close-a2[j-1].close):0,0);
  const eff=path>0?Math.abs(x.close-c[i-6].close)/path:0,atrBps=a/Math.max(1e-9,x.close)*10000;
  return {atr:a,r1,r3,r6,accel,compression,pos,body,wick,eff,atrBps};
}
function priceKeys(asset:string,f:any,at:number){
  const mom=bucket(f.r3,[-.9,-.35,-.08,.08,.35,.9]),acc=bucket(f.accel,[-.35,-.10,.10,.35]);
  const comp=bucket(f.compression,[.55,.75,1.0,1.35]),pos=bucket(f.pos,[.2,.4,.6,.8]),eff=bucket(f.eff,[.25,.5,.72]);
  const body=bucket(f.body,[-.55,-.2,.2,.55]),vol=bucket(f.atrBps,[2,4,7,12,20]),ses=session(at);
  return [
    'P3|'+asset+'|m'+mom+'|a'+acc+'|c'+comp+'|p'+pos+'|e'+eff+'|b'+body+'|v'+vol,
    'B3|'+asset+'|m'+mom+'|c'+comp+'|p'+pos+'|v'+vol,
    'R3|'+asset+'|m'+mom+'|a'+acc+'|e'+eff+'|v'+vol,
    'S3|'+asset+'|'+ses+'|m'+mom+'|c'+comp+'|v'+vol,
    'V3|'+asset+'|v'+vol+'|c'+comp+'|p'+pos
  ];
}
function contextKeys(asset:string,f:any,ctx:any,at:number){
  const keys=priceKeys(asset,f,at),m1=String(ctx?.structure?.m1?.phase||'NA'),m5=String(ctx?.structure?.m5?.phase||'NA');
  const acc=String(ctx?.accumulation?.phase||'NA'),liq=String(ctx?.liquidity?.side||'NA'),abs=String(ctx?.liquidity?.absorption?.side||'NA');
  const motion=String(ctx?.motion?.stage||'NA')+':'+String(ctx?.motion?.side||'NA'),beh=String(ctx?.behavior?.pattern||'NA')+':'+String(ctx?.behavior?.side||'NA'),ses=session(at);
  const sg=String(ctx?.stateGraph?.current||'NA'),sgNext=String(ctx?.stateGraph?.nextState||'NA'),cp=ctx?.stateGraph?.changePoint?'CP':'STABLE';
  keys.unshift('CTX3|'+asset+'|'+ses+'|'+m1+'|'+m5+'|'+acc+'|'+liq+'|'+abs);
  keys.push('MS3|'+asset+'|'+m1+'|'+m5+'|'+acc,'LM3|'+asset+'|'+liq+'|'+abs+'|'+motion,'BH3|'+asset+'|'+beh+'|'+m1,'SG3|'+asset+'|'+ses+'|'+sg+'|'+sgNext+'|'+cp);
  return [...new Set(keys)];
}
function ensureBucket(k:string){if(!store.patterns[k])store.patterns[k]={h1:emptyStats(),h5:emptyStats()};normalizeStats(store.patterns[k].h1);normalizeStats(store.patterns[k].h5);return store.patterns[k];}
function label(retAtr:number,h:Horizon):Side{const gate=h==='h1'?.12:.24;return retAtr>=gate?'BUY':retAtr<=-gate?'SELL':'WAIT';}
function strongLabel(retAtr:number,h:Horizon):Side{const gate=h==='h1'?.45:.90;return retAtr>=gate?'BUY':retAtr<=-gate?'SELL':'WAIT';}
function updateStats(s:Stats,retAtr:number,h:Horizon,at:number){
  decayStats(s,at,h);s.n++;s.sumAtr+=retAtr;s.sumAbsAtr+=Math.abs(retAtr);s.lastAt=at;
  const y=label(retAtr,h);if(y==='BUY')s.up++;else if(y==='SELL')s.down++;else s.flat++;
  const strong=strongLabel(retAtr,h);if(strong==='BUY')s.strongUp++;else if(strong==='SELL')s.strongDown++;
}
function ensureComp(asset:string,name:string){
  store.components[asset]||={};store.components[asset][name]||={h1:emptyComponent(),h5:emptyComponent()};
  normalizeComp(store.components[asset][name].h1);normalizeComp(store.components[asset][name].h5);return store.components[asset][name];
}
function ensureForecast(asset:string){store.forecast[asset]||={h1:emptyComponent(),h5:emptyComponent()};normalizeComp(store.forecast[asset].h1);normalizeComp(store.forecast[asset].h5);return store.forecast[asset];}
function updateComponent(s:ComponentStats,pred:Side,retAtr:number,h:Horizon,at:number){
  if(pred==='WAIT')return;decayComp(s,at,h);const y=label(retAtr,h);s.n++;
  if(y==='WAIT')s.flat++;else if(y===pred)s.correct++;else s.wrong++;
  s.sumSignedAtr+=retAtr*(pred==='BUY'?1:-1);s.lastAt=at;
}
function componentReliability(s:ComponentStats,now:number,h:Horizon){
  normalizeComp(s);if(s.n<4)return 50;
  const directional=s.correct+s.wrong,acc=directional?(s.correct+3)/(directional+6):.5,edge=s.sumSignedAtr/Math.max(1,s.n),sample=Math.min(1,s.n/35);
  const age=s.lastAt?Math.max(0,now-s.lastAt):halfLife(h),recency=.6+.4*Math.pow(.5,age/halfLife(h));
  return Math.round(cap(50+((acc-.5)*70+Math.max(-.25,Math.min(.25,edge))*55)*sample*recency,30,75));
}
function sideFromContext(ctx:any){
  const out:Record<string,Side>={};
  out.structure=ctx?.structure?.side||ctx?.structure?.m1?.nextSide||'WAIT';
  out.accumulation=ctx?.accumulation?.side||'WAIT';
  out.liquidity=ctx?.liquidity?.side||'WAIT';
  out.absorption=ctx?.liquidity?.absorption?.side||'WAIT';
  out.motion=ctx?.motion?.side||'WAIT';
  out.behavior=ctx?.behavior?.side||'WAIT';
  const l=Number(ctx?.scalp?.score?.long||0),s=Number(ctx?.scalp?.score?.short||0);
  out.scalp=l-s>=10?'BUY':s-l>=10?'SELL':'WAIT';
  out.m1=ctx?.decision?.indicatorMatrix?.rows?.m1?.bias||'WAIT';
  out.m5=ctx?.decision?.indicatorMatrix?.rows?.m5?.bias||'WAIT';
  out.stateGraph=ctx?.stateGraph?.nextSide||'WAIT';
  return out;
}
function findClose(c:Candle[],time:number){
  const x=c.find(v=>v.time===time);return x?.close??null;
}
function failurePenalty(asset:string,keys:string[],side:Side,now:number){
  if(side==='WAIT')return {penalty:0,count:0};
  let score=0,count=0;
  for(const f of store.failures||[]){
    if(f.asset!==asset||f.side!==side||now-f.at>6*60*60*1000)continue;
    const overlap=f.keys.filter(k=>keys.includes(k)).length;
    if(overlap<2)continue;
    const similarity=Math.min(1,overlap/Math.max(3,Math.min(keys.length,f.keys.length)));
    const recency=Math.pow(.5,Math.max(0,now-f.at)/(2*60*60*1000));
    score+=similarity*recency*10;count++;
  }
  return {penalty:Number(Math.min(20,score).toFixed(1)),count};
}
async function settle(asset:string,c1:Candle[],now:number){
  const closed=c1.filter(x=>x.time+60000<=now);
  if(!closed.length)return false;
  let changed=false;
  for(const o of store.observations){
    if(o.asset!==asset)continue;
    for(const [h,bars] of [['h1',1],['h5',5]] as [Horizon,number][]){
      const flag=h==='h1'?'settled1':'settled5';if(o[flag])continue;
      const close=findClose(closed,o.candleTime+bars*60000);if(close==null)continue;
      const retAtr=(close-o.price)/Math.max(1e-9,o.atr);
      for(const k of o.keys)updateStats(ensureBucket(k)[h],retAtr,h,now);
      for(const [name,pred] of Object.entries(o.components||{}))updateComponent(ensureComp(asset,name)[h],pred,retAtr,h,now);
      updateComponent(ensureForecast(asset)[h],o.prediction,retAtr,h,now);
      o[flag]=true;changed=true;
      const t=store.totals[asset]||{observations:0,resolved1:0,resolved5:0,updatedAt:0};
      if(h==='h1')t.resolved1++;else t.resolved5++;t.updatedAt=now;store.totals[asset]=t;
    }
  }
  store.observations=store.observations.filter(o=>!(o.settled1&&o.settled5&&now-o.createdAt>6*60*60*1000)).slice(-700);
  return changed;
}
function aggregate(keys:string[],h:Horizon,now:number){
  let wSum=0,mean=0,up=0,down=0,strongUp=0,strongDown=0,samples=0,matched=0;
  keys.forEach((k,idx)=>{
    const s=store.patterns[k]?.[h];if(!s)return;normalizeStats(s);if(s.n<3)return;
    const specificity=idx===0?1:idx<6?.84:.70,sampleW=Math.min(1,s.n/28),age=s.lastAt?Math.max(0,now-s.lastAt):halfLife(h),recency=.35+.65*Math.pow(.5,age/halfLife(h)),w=specificity*sampleW*recency;
    const shrunkMean=s.sumAtr/(s.n+8),pu=(s.up+2)/(s.n+6),pd=(s.down+2)/(s.n+6),psu=(s.strongUp+1)/(s.n+5),psd=(s.strongDown+1)/(s.n+5);
    mean+=shrunkMean*w;up+=pu*w;down+=pd*w;strongUp+=psu*w;strongDown+=psd*w;wSum+=w;samples+=s.n*w;matched++;
  });
  if(!wSum)return {side:'WAIT' as Side,score:0,confidence:0,samples:0,meanAtr:0,matched:0,buy:50,sell:50,burstSide:'WAIT' as Side,burstScore:0,burstProbability:0};
  mean/=wSum;up/=wSum;down/=wSum;strongUp/=wSum;strongDown/=wSum;samples/=wSum;
  const probDir=(up-down)*100,meanDir=Math.max(-45,Math.min(45,mean*75));let directional=probDir*.66+meanDir;
  if(probDir*mean<0&&Math.abs(mean)>=.03)directional*=.48;
  const side:Side=directional>=9?'BUY':directional<=-9?'SELL':'WAIT',score=Math.round(cap(50+Math.abs(directional)*.40,0,88)),confidence=Math.round(cap(Math.min(78,36+Math.min(32,samples)*1.1+Math.abs(directional)*.20),0,78));
  const buy=Math.round(cap(50+directional/2,8,92)),sell=100-buy,burstDelta=(strongUp-strongDown)*100,burstProb=Math.max(0,Math.min(.95,strongUp+strongDown));
  const burstSide:Side=burstDelta>=7?'BUY':burstDelta<=-7?'SELL':'WAIT',burstScore=Math.round(cap(burstProb*72+Math.abs(burstDelta)*.32,0,86));
  return {side,score,confidence,samples:Math.round(samples),meanAtr:Number(mean.toFixed(3)),matched,buy,sell,burstSide,burstScore,burstProbability:Math.round(burstProb*100)};
}
async function bootstrap(asset:string,c1:Candle[],now:number){
  const bootKey=asset+':'+SCHEMA;if(store.bootstrapped[bootKey])return false;
  const c=c1.filter(x=>x.time+60000<=now).slice(-420);
  if(c.length<90)return false;
  for(let i=28;i<c.length-5;i++){
    const f=priceFeatures(c,i);if(!f)continue;
    const keys=priceKeys(asset,f,c[i].time),p=c[i].close;
    for(const [h,bars] of [['h1',1],['h5',5]] as [Horizon,number][]){
      const ret=(c[i+bars].close-p)/f.atr;
      for(const k of keys)updateStats(ensureBucket(k)[h],ret,h,c[i+bars].time);
    }
  }
  store.bootstrapped[bootKey]=c.at(-1)?.time||now;
  return true;
}

export async function getMarketLearningSignal(args:{asset:string;c1:Candle[];c5:Candle[];price:number|null;atr:number|null;context:any;now?:number}):Promise<MarketLearningSignal>{
  return serialized(async()=>{
    await load();const now=args.now||Date.now(),boot=await bootstrap(args.asset,args.c1,now),settled=await settle(args.asset,args.c1,now);if(boot||settled)await save();
    const closed=args.c1.filter(x=>x.time+60000<=now),i=closed.length-1,f=i>=0?priceFeatures(closed,i):null,totals=store.totals[args.asset]||{observations:0,resolved1:0,resolved5:0,updatedAt:0};
    const empty:MarketLearningSignal={ok:false,asset:args.asset,side:'WAIT',score:0,confidence:0,buyScore:50,sellScore:50,effectiveSamples:0,horizon1:{side:'WAIT',score:0,confidence:0,samples:0,meanAtr:0,burstSide:'WAIT',burstScore:0,burstProbability:0},horizon5:{side:'WAIT',score:0,confidence:0,samples:0,meanAtr:0,burstSide:'WAIT',burstScore:0,burstProbability:0},strongMoveMemory:null,selfCalibration:{reliability:50,h1:50,h5:50,samples1:0,samples5:0},matchedPatterns:0,componentReliability:{},learnedWeights:{},totals,storage:storagePath,reasons:['بيانات الحركة غير كافية للتعلم.']};
    if(!f)return empty;
    const at=closed[i].time,keys=contextKeys(args.asset,f,args.context,at),h1=aggregate(keys,'h1',now),h5=aggregate(keys,'h5',now),forecastStats=ensureForecast(args.asset);
    const fr1=componentReliability(forecastStats.h1,now,'h1'),fr5=componentReliability(forecastStats.h5,now,'h5'),samples1=Math.round(forecastStats.h1.n),samples5=Math.round(forecastStats.h5.n),selfReliability=Math.round(fr1*.42+fr5*.58);
    let signed=(h1.side==='BUY'?h1.confidence:h1.side==='SELL'?-h1.confidence:0)*.42+(h5.side==='BUY'?h5.confidence:h5.side==='SELL'?-h5.confidence:0)*.58;
    const preSide:Side=signed>=9?'BUY':signed<=-9?'SELL':'WAIT',failureMemory=failurePenalty(args.asset,keys,preSide,now);
    if(preSide==='BUY')signed=Math.max(0,signed-failureMemory.penalty);
    else if(preSide==='SELL')signed=Math.min(0,signed+failureMemory.penalty);
    const side:Side=signed>=9?'BUY':signed<=-9?'SELL':'WAIT';
    const rawConfidence=cap(Math.abs(signed)*.76+Math.min(18,(h1.samples+h5.samples)/5),0,80),calFactor=samples1+samples5>=8?Math.max(.84,Math.min(1.10,.80+selfReliability/250)):1;
    const confidence=Math.round(cap(rawConfidence*calFactor,0,80)),score=Math.round(cap(50+Math.abs(signed)*.40,0,86)),buyScore=Math.round(cap(50+signed/2,8,92)),sellScore=100-buyScore;
    const comp:MarketLearningSignal['componentReliability']={},weights:Record<string,number>={};
    for(const [name,s] of Object.entries(store.components[args.asset]||{})){
      const r1=componentReliability(s.h1,now,'h1'),r5=componentReliability(s.h5,now,'h5'),n1=Math.round(s.h1.n),n5=Math.round(s.h5.n),blended=r1*.4+r5*.6,sampleScale=Math.min(1,(n1+n5)/30);
      comp[name]={h1:r1,h5:r5,samples1:n1,samples5:n5};weights[name]=Number(Math.max(.82,Math.min(1.18,1+(blended-50)/100*.40*sampleScale)).toFixed(2));
    }
    let burstSide:Side='WAIT',burstScore=0,burstProbability=0,burstSamples=0,burstMean=0;
    if(h1.burstSide!=='WAIT'&&h1.burstSide===h5.burstSide){burstSide=h1.burstSide;burstScore=Math.round(h1.burstScore*.4+h5.burstScore*.6);burstProbability=Math.round(h1.burstProbability*.4+h5.burstProbability*.6);burstSamples=h1.samples+h5.samples;burstMean=Number((h1.meanAtr*.4+h5.meanAtr*.6).toFixed(3));}
    else if(h5.burstSide!=='WAIT'&&h5.burstScore>=58){burstSide=h5.burstSide;burstScore=h5.burstScore;burstProbability=h5.burstProbability;burstSamples=h5.samples;burstMean=h5.meanAtr;}
    else if(h1.burstSide!=='WAIT'&&h1.burstScore>=62){burstSide=h1.burstSide;burstScore=h1.burstScore;burstProbability=h1.burstProbability;burstSamples=h1.samples;burstMean=h1.meanAtr;}
    const strongMoveMemory=burstSide!=='WAIT'?{side:burstSide,score:burstScore,probability:burstProbability,samples:burstSamples,meanAtr:burstMean}:null;
    const reasons=['ذاكرة 1m: '+h1.side+' · '+h1.samples+' عينة · mean '+h1.meanAtr+' ATR','ذاكرة 5m: '+h5.side+' · '+h5.samples+' عينة · mean '+h5.meanAtr+' ATR','Self calibration '+selfReliability+' · forecast samples '+(samples1+samples5),'Matched patterns: '+(h1.matched+h5.matched)];
    if(failureMemory.count>0)reasons.push('Failure memory: '+failureMemory.count+' حالة مشابهة · penalty '+failureMemory.penalty);
    if(strongMoveMemory)reasons.push('Strong-move memory '+strongMoveMemory.side+' · '+strongMoveMemory.probability+'%');if(side!=='WAIT')reasons.push('الأنماط المتعلمة تميل '+side+' بثقة '+confidence);
    return {ok:true,asset:args.asset,side,score,confidence,buyScore,sellScore,effectiveSamples:h1.samples+h5.samples,horizon1:{side:h1.side,score:h1.score,confidence:h1.confidence,samples:h1.samples,meanAtr:h1.meanAtr,burstSide:h1.burstSide,burstScore:h1.burstScore,burstProbability:h1.burstProbability},horizon5:{side:h5.side,score:h5.score,confidence:h5.confidence,samples:h5.samples,meanAtr:h5.meanAtr,burstSide:h5.burstSide,burstScore:h5.burstScore,burstProbability:h5.burstProbability},strongMoveMemory,selfCalibration:{reliability:selfReliability,h1:fr1,h5:fr5,samples1,samples5},matchedPatterns:h1.matched+h5.matched,componentReliability:comp,learnedWeights:weights,totals,storage:storagePath,reasons};
  });
}

export async function recordMarketLearningObservation(args:{asset:string;c1:Candle[];price:number|null;atr:number|null;context:any;forecast:any;now?:number}){
  return serialized(async()=>{
    await load();const now=args.now||Date.now(),closed=args.c1.filter(x=>x.time+60000<=now),i=closed.length-1;if(i<24)return false;
    const candle=closed[i],f=priceFeatures(closed,i);if(!f)return false;
    const id=args.asset+':'+SCHEMA+':'+candle.time;if(store.observations.some(o=>o.id===id))return false;
    const components=sideFromContext(args.context),prediction:Side=args.forecast?.side||'WAIT';
    store.observations.push({id,asset:args.asset,candleTime:candle.time,price:candle.close,atr:f.atr,keys:contextKeys(args.asset,f,args.context,candle.time),prediction,predictionConfidence:Number(args.forecast?.confidence||0),components,settled1:false,settled5:false,createdAt:now});
    const t=store.totals[args.asset]||{observations:0,resolved1:0,resolved5:0,updatedAt:0};t.observations++;t.updatedAt=now;store.totals[args.asset]=t;store.observations=store.observations.slice(-700);await save();return true;
  });
}

export async function recordFinalRecommendationOutcome(args:{asset:string;c1:Candle[];price:number|null;atr:number|null;context:any;recommendation:any;now?:number}){
  return serialized(async()=>{
    await load();const now=args.now||Date.now(),asset=args.asset,price=Number(args.price),atr=Math.max(1e-9,Number(args.atr)||0);
    const active=store.activeRecommendations[asset];
    let outcome:{status:'NONE'|'TRACKING'|'SUCCESS'|'FAILED'|'EXPIRED';failure?:FailureCase}|null={status:'NONE'};

    if(active&&Number.isFinite(price)){
      const failed=active.side==='BUY'?price<=active.invalidation:price>=active.invalidation;
      const success=active.target!=null&&(active.side==='BUY'?price>=active.target:price<=active.target);
      const expired=now-active.createdAt>20*60*1000;
      if(failed){
        const adverseAtr=Math.abs(price-active.entry)/Math.max(1e-9,active.atr);
        const failure:FailureCase={id:'FAIL:'+active.id,asset,side:active.side,entry:active.entry,exit:price,invalidation:active.invalidation,confidence:active.confidence,adverseAtr:Number(adverseAtr.toFixed(3)),keys:active.keys,components:active.components,at:now,reason:'Final recommendation invalidation was crossed before first target.'};
        if(!store.failures.some(x=>x.id===failure.id)){
          store.failures.push(failure);
          const syntheticRet=active.side==='BUY'?-Math.max(.30,adverseAtr):Math.max(.30,adverseAtr);
          for(const [name,pred] of Object.entries(active.components||{}))if(pred===active.side)updateComponent(ensureComp(asset,name).h1,pred,syntheticRet,'h1',now);
          updateComponent(ensureForecast(asset).h1,active.side,syntheticRet,'h1',now);
        }
        delete store.activeRecommendations[asset];outcome={status:'FAILED',failure};
      }else if(success){
        const favorableAtr=Math.max(.30,Math.min(3,Math.abs(Number(active.target??price)-active.entry)/Math.max(1e-9,active.atr)));
        const syntheticRet=active.side==='BUY'?favorableAtr:-favorableAtr;
        for(const [name,pred] of Object.entries(active.components||{}))if(pred===active.side)updateComponent(ensureComp(asset,name).h1,pred,syntheticRet,'h1',now);
        updateComponent(ensureForecast(asset).h1,active.side,syntheticRet,'h1',now);
        delete store.activeRecommendations[asset];outcome={status:'SUCCESS'};
      }else if(expired){
        delete store.activeRecommendations[asset];outcome={status:'EXPIRED'};
      }else outcome={status:'TRACKING'};
    }

    const r=args.recommendation;
    if(!store.activeRecommendations[asset]&&r?.active&&(r.action==='BUY'||r.action==='SELL')&&Number(r.confidence)>=71&&Number.isFinite(Number(r.entry))&&Number.isFinite(Number(r.invalidation))){
      const closed=args.c1.filter(x=>x.time+60000<=now),i=closed.length-1,f=i>=0?priceFeatures(closed,i):null;
      if(f){
        const keys=contextKeys(asset,f,args.context,closed[i].time),components=sideFromContext(args.context),t=r.targets||{};
        const candidates=[t.scalp,t.oneMinute,t.fiveMinute,t.fifteenMinute].map(Number).filter(Number.isFinite);
        const target=candidates.find((x:number)=>r.action==='BUY'?x>Number(r.entry):x<Number(r.entry))??null;
        const rec:RecommendationCase={id:asset+':'+r.action+':'+Math.round(Number(r.entry)*100)+':'+now,asset,side:r.action,entry:Number(r.entry),invalidation:Number(r.invalidation),target,confidence:Number(r.confidence),atr:f.atr,keys,components,createdAt:now};
        store.activeRecommendations[asset]=rec;
        if(outcome?.status==='NONE')outcome={status:'TRACKING'};
      }
    }
    store.failures=(store.failures||[]).filter(x=>now-x.at<=14*24*60*60*1000).slice(-300);
    await save();return outcome;
  });
}
