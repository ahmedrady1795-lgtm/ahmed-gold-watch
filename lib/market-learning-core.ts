import {promises as fs} from 'node:fs';
import path from 'node:path';
import type {Candle} from './engine';

type Side='BUY'|'SELL'|'WAIT';
type Horizon='h1'|'h5';

type Stats={n:number;up:number;down:number;flat:number;sumAtr:number;sumAbsAtr:number;lastAt:number};
type ComponentStats={n:number;correct:number;wrong:number;flat:number;sumSignedAtr:number};
type PatternBucket={h1:Stats;h5:Stats};
type Observation={
  id:string;asset:string;candleTime:number;price:number;atr:number;keys:string[];
  prediction:Side;predictionConfidence:number;
  components:Record<string,Side>;
  settled1:boolean;settled5:boolean;createdAt:number;
};
type Store={
  version:number;
  patterns:Record<string,PatternBucket>;
  components:Record<string,Record<string,{h1:ComponentStats;h5:ComponentStats}>>;
  forecast:Record<string,{h1:ComponentStats;h5:ComponentStats}>;
  observations:Observation[];
  bootstrapped:Record<string,number>;
  totals:Record<string,{observations:number;resolved1:number;resolved5:number;updatedAt:number}>;
};

export type MarketLearningSignal={
  ok:boolean;asset:string;side:Side;score:number;confidence:number;
  buyScore:number;sellScore:number;effectiveSamples:number;
  horizon1:{side:Side;score:number;confidence:number;samples:number;meanAtr:number};
  horizon5:{side:Side;score:number;confidence:number;samples:number;meanAtr:number};
  matchedPatterns:number;
  componentReliability:Record<string,{h1:number;h5:number;samples1:number;samples5:number}>;
  learnedWeights:Record<string,number>;
  totals:{observations:number;resolved1:number;resolved5:number};
  storage:string;
  reasons:string[];
};

const FILE=process.env.PREDATOR_LEARNING_FILE||'/data/predator-market-learning.json';
const FALLBACK='/tmp/predator-market-learning.json';
const emptyStats=():Stats=>({n:0,up:0,down:0,flat:0,sumAtr:0,sumAbsAtr:0,lastAt:0});
const emptyComponent=():ComponentStats=>({n:0,correct:0,wrong:0,flat:0,sumSignedAtr:0});
const emptyStore=():Store=>({version:2,patterns:{},components:{},forecast:{},observations:[],bootstrapped:{},totals:{}});
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
      if(parsed&&parsed.version>=1){store={...emptyStore(),...parsed};storagePath=file;loaded=true;return;}
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
  const eff=path>0?Math.abs(x.close-c[i-6].close)/path:0;
  return {atr:a,r1,r3,r6,accel,compression,pos,body,wick,eff};
}
function priceKeys(asset:string,f:any){
  const mom=bucket(f.r3,[-.9,-.35,-.08,.08,.35,.9]);
  const acc=bucket(f.accel,[-.35,-.10,.10,.35]);
  const comp=bucket(f.compression,[.55,.75,1.0,1.35]);
  const pos=bucket(f.pos,[.2,.4,.6,.8]);
  const eff=bucket(f.eff,[.25,.5,.72]);
  const body=bucket(f.body,[-.55,-.2,.2,.55]);
  return [
    'P|'+asset+'|m'+mom+'|a'+acc+'|c'+comp+'|p'+pos+'|e'+eff+'|b'+body,
    'B|'+asset+'|m'+mom+'|c'+comp+'|p'+pos,
    'R|'+asset+'|m'+mom+'|a'+acc+'|e'+eff
  ];
}
function contextKeys(asset:string,f:any,ctx:any){
  const keys=priceKeys(asset,f);
  const m1=String(ctx?.structure?.m1?.phase||'NA'),m5=String(ctx?.structure?.m5?.phase||'NA');
  const acc=String(ctx?.accumulation?.phase||'NA');
  const liq=String(ctx?.liquidity?.side||'NA');
  const abs=String(ctx?.liquidity?.absorption?.side||'NA');
  const motion=String(ctx?.motion?.stage||'NA')+':'+String(ctx?.motion?.side||'NA');
  const beh=String(ctx?.behavior?.pattern||'NA')+':'+String(ctx?.behavior?.side||'NA');
  keys.unshift('CTX|'+asset+'|'+m1+'|'+m5+'|'+acc+'|'+liq+'|'+abs);
  keys.push('MS|'+asset+'|'+m1+'|'+m5+'|'+acc);
  keys.push('LM|'+asset+'|'+liq+'|'+abs+'|'+motion);
  keys.push('BH|'+asset+'|'+beh+'|'+m1);
  return [...new Set(keys)];
}
function ensureBucket(k:string){
  if(!store.patterns[k])store.patterns[k]={h1:emptyStats(),h5:emptyStats()};
  return store.patterns[k];
}
function label(retAtr:number,h:Horizon):Side{
  const gate=h==='h1'?.12:.24;
  return retAtr>=gate?'BUY':retAtr<=-gate?'SELL':'WAIT';
}
function updateStats(s:Stats,retAtr:number,h:Horizon,at:number){
  s.n++;s.sumAtr+=retAtr;s.sumAbsAtr+=Math.abs(retAtr);s.lastAt=at;
  const y=label(retAtr,h);if(y==='BUY')s.up++;else if(y==='SELL')s.down++;else s.flat++;
}
function ensureComp(asset:string,name:string){
  store.components[asset] ||= {};
  store.components[asset][name] ||= {h1:emptyComponent(),h5:emptyComponent()};
  return store.components[asset][name];
}
function ensureForecast(asset:string){
  store.forecast[asset] ||= {h1:emptyComponent(),h5:emptyComponent()};
  return store.forecast[asset];
}
function updateComponent(s:ComponentStats,pred:Side,retAtr:number,h:Horizon){
  if(pred==='WAIT')return;
  const y=label(retAtr,h);s.n++;
  if(y==='WAIT')s.flat++;
  else if(y===pred)s.correct++;
  else s.wrong++;
  s.sumSignedAtr+=retAtr*(pred==='BUY'?1:-1);
}
function componentReliability(s:ComponentStats){
  if(s.n<4)return 50;
  const directional=s.correct+s.wrong;
  const acc=directional?(s.correct+3)/(directional+6):.5;
  const edge=s.sumSignedAtr/Math.max(1,s.n);
  const sample=Math.min(1,s.n/35);
  return Math.round(cap(50+((acc-.5)*70+Math.max(-.25,Math.min(.25,edge))*55)*sample,30,75));
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
  return out;
}
function findClose(c:Candle[],time:number){
  const x=c.find(v=>v.time===time);return x?.close??null;
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
      for(const [name,pred] of Object.entries(o.components||{}))updateComponent(ensureComp(asset,name)[h],pred,retAtr,h);
      updateComponent(ensureForecast(asset)[h],o.prediction,retAtr,h);
      o[flag]=true;changed=true;
      const t=store.totals[asset]||{observations:0,resolved1:0,resolved5:0,updatedAt:0};
      if(h==='h1')t.resolved1++;else t.resolved5++;t.updatedAt=now;store.totals[asset]=t;
    }
  }
  store.observations=store.observations.filter(o=>!(o.settled1&&o.settled5&&now-o.createdAt>6*60*60*1000)).slice(-700);
  return changed;
}
function aggregate(keys:string[],h:Horizon){
  let wSum=0,mean=0,up=0,down=0,samples=0,matched=0;
  keys.forEach((k,idx)=>{
    const s=store.patterns[k]?.[h];if(!s||s.n<3)return;
    const specificity=idx===0?1:idx<4?.82:.68;
    const sampleW=Math.min(1,s.n/28),w=specificity*sampleW;
    const shrunkMean=s.sumAtr/(s.n+8);
    const pu=(s.up+2)/(s.n+6),pd=(s.down+2)/(s.n+6);
    mean+=shrunkMean*w;up+=pu*w;down+=pd*w;wSum+=w;samples+=s.n*w;matched++;
  });
  if(!wSum)return {side:'WAIT' as Side,score:0,confidence:0,samples:0,meanAtr:0,matched:0,buy:50,sell:50};
  mean/=wSum;up/=wSum;down/=wSum;samples/=wSum;
  const directional=(up-down)*100+Math.max(-30,Math.min(30,mean*55));
  const side:Side=directional>=8?'BUY':directional<=-8?'SELL':'WAIT';
  const score=Math.round(cap(50+Math.abs(directional)*.42,0,88));
  const confidence=Math.round(cap(Math.min(78,38+Math.min(30,samples)*1.15+Math.abs(directional)*.22),0,78));
  const buy=Math.round(cap(50+directional/2,8,92)),sell=100-buy;
  return {side,score,confidence,samples:Math.round(samples),meanAtr:Number(mean.toFixed(3)),matched,buy,sell};
}
async function bootstrap(asset:string,c1:Candle[],now:number){
  if(store.bootstrapped[asset])return false;
  const c=c1.filter(x=>x.time+60000<=now).slice(-420);
  if(c.length<90)return false;
  for(let i=28;i<c.length-5;i++){
    const f=priceFeatures(c,i);if(!f)continue;
    const keys=priceKeys(asset,f),p=c[i].close;
    for(const [h,bars] of [['h1',1],['h5',5]] as [Horizon,number][]){
      const ret=(c[i+bars].close-p)/f.atr;
      for(const k of keys)updateStats(ensureBucket(k)[h],ret,h,c[i+bars].time);
    }
  }
  store.bootstrapped[asset]=c.at(-1)?.time||now;
  return true;
}

export async function getMarketLearningSignal(args:{asset:string;c1:Candle[];c5:Candle[];price:number|null;atr:number|null;context:any;now?:number}):Promise<MarketLearningSignal>{
  return serialized(async()=>{
    await load();const now=args.now||Date.now();
    const boot=await bootstrap(args.asset,args.c1,now);
    const settled=await settle(args.asset,args.c1,now);
    if(boot||settled)await save();
    const closed=args.c1.filter(x=>x.time+60000<=now),i=closed.length-1,f=i>=0?priceFeatures(closed,i):null;
    const totals=store.totals[args.asset]||{observations:0,resolved1:0,resolved5:0,updatedAt:0};
    if(!f)return {ok:false,asset:args.asset,side:'WAIT',score:0,confidence:0,buyScore:50,sellScore:50,effectiveSamples:0,horizon1:{side:'WAIT',score:0,confidence:0,samples:0,meanAtr:0},horizon5:{side:'WAIT',score:0,confidence:0,samples:0,meanAtr:0},matchedPatterns:0,componentReliability:{},learnedWeights:{},totals,storage:storagePath,reasons:['بيانات الحركة غير كافية للتعلم.']};
    const keys=contextKeys(args.asset,f,args.context),h1=aggregate(keys,'h1'),h5=aggregate(keys,'h5');
    const signed=(h1.side==='BUY'?h1.confidence:h1.side==='SELL'?-h1.confidence:0)*.42+(h5.side==='BUY'?h5.confidence:h5.side==='SELL'?-h5.confidence:0)*.58;
    const side:Side=signed>=8?'BUY':signed<=-8?'SELL':'WAIT';
    const confidence=Math.round(cap(Math.abs(signed)*.78+Math.min(18,(h1.samples+h5.samples)/5),0,80));
    const score=Math.round(cap(50+Math.abs(signed)*.42,0,86));
    const buyScore=Math.round(cap(50+signed/2,8,92)),sellScore=100-buyScore;
    const comp:MarketLearningSignal['componentReliability']={},weights:Record<string,number>={};
    for(const [name,s] of Object.entries(store.components[args.asset]||{})){
      const r1=componentReliability(s.h1),r5=componentReliability(s.h5);
      comp[name]={h1:r1,h5:r5,samples1:s.h1.n,samples5:s.h5.n};
      const blended=r1*.4+r5*.6;weights[name]=Number(Math.max(.75,Math.min(1.25,.75+blended/100*.5)).toFixed(2));
    }
    const reasons:string[]=[
      'ذاكرة 1m: '+h1.side+' · '+h1.samples+' عينة · mean '+h1.meanAtr+' ATR',
      'ذاكرة 5m: '+h5.side+' · '+h5.samples+' عينة · mean '+h5.meanAtr+' ATR',
      'Matched patterns: '+(h1.matched+h5.matched)
    ];
    if(side!=='WAIT')reasons.push('الأنماط المتعلمة تميل '+side+' بثقة '+confidence);
    return {ok:true,asset:args.asset,side,score,confidence,buyScore,sellScore,effectiveSamples:h1.samples+h5.samples,horizon1:{side:h1.side,score:h1.score,confidence:h1.confidence,samples:h1.samples,meanAtr:h1.meanAtr},horizon5:{side:h5.side,score:h5.score,confidence:h5.confidence,samples:h5.samples,meanAtr:h5.meanAtr},matchedPatterns:h1.matched+h5.matched,componentReliability:comp,learnedWeights:weights,totals,storage:storagePath,reasons};
  });
}

export async function recordMarketLearningObservation(args:{asset:string;c1:Candle[];price:number|null;atr:number|null;context:any;forecast:any;now?:number}){
  return serialized(async()=>{
    await load();const now=args.now||Date.now(),closed=args.c1.filter(x=>x.time+60000<=now),i=closed.length-1;
    if(i<24)return false;
    const candle=closed[i],f=priceFeatures(closed,i),price=Number(args.price??candle.close),atr=Number(args.atr);
    if(!f||!Number.isFinite(price)||price<=0||!Number.isFinite(atr)||atr<=0)return false;
    const id=args.asset+':'+candle.time;
    if(store.observations.some(o=>o.id===id))return false;
    const components=sideFromContext(args.context);
    const prediction:Side=args.forecast?.side||'WAIT';
    store.observations.push({id,asset:args.asset,candleTime:candle.time,price,atr,keys:contextKeys(args.asset,f,args.context),prediction,predictionConfidence:Number(args.forecast?.confidence||0),components,settled1:false,settled5:false,createdAt:now});
    const t=store.totals[args.asset]||{observations:0,resolved1:0,resolved5:0,updatedAt:0};t.observations++;t.updatedAt=now;store.totals[args.asset]=t;
    store.observations=store.observations.slice(-700);await save();return true;
  });
}
