import {promises as fs} from 'node:fs';
import path from 'node:path';
import type {Candle} from './engine';

type Side='BUY'|'SELL'|'WAIT';
type H='m2'|'m5'|'m15';
type HStats={n:number;up:number;down:number;flat:number;strongUp:number;strongDown:number;sumCloseAtr:number;sumMfeUp:number;sumMfeDown:number;lastAt:number};
type Cal={n:number;correct:number;wrong:number;flat:number;sumSignedAtr:number;lastAt:number};
type Bucket={m2:HStats;m5:HStats;m15:HStats};
type Obs={
  id:string;asset:string;candleTime:number;price:number;atr:number;keys:string[];
  predictions:{m2:Side;m5:Side;m15:Side};
  settled:{m2:boolean;m5:boolean;m15:boolean};
  createdAt:number;
};
type Store={
  version:number;
  patterns:Record<string,Bucket>;
  calibration:Record<string,{m2:Cal;m5:Cal;m15:Cal}>;
  observations:Obs[];
  bootstrapped:Record<string,number>;
  totals:Record<string,{observations:number;resolved2:number;resolved5:number;resolved15:number;updatedAt:number}>;
};

export type ExpectedMoveHorizon={
  side:Side;strength:number;confidence:number;samples:number;
  meanCloseAtr:number;expectedUpAtr:number;expectedDownAtr:number;
  burstSide:Side;burstProbability:number;calibration:number;
};
export type ExpectedMoveLearning={
  ok:boolean;asset:string;
  twoMinute:ExpectedMoveHorizon;
  fiveMinute:ExpectedMoveHorizon;
  fifteenMinute:ExpectedMoveHorizon;
  consensusSide:Side;consensusScore:number;conflict:boolean;
  totals:{observations:number;resolved2:number;resolved5:number;resolved15:number};
  storage:string;reasons:string[];
};

const FILE=process.env.PREDATOR_EXPECTED_MOVE_FILE||'/data/predator-expected-move-learning.json';
const FALLBACK='/tmp/predator-expected-move-learning.json';
const SCHEMA='expected-v1';
const cap=(n:number,a=0,b=92)=>Math.max(a,Math.min(b,n));
const avg=(a:number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const emptyH=():HStats=>({n:0,up:0,down:0,flat:0,strongUp:0,strongDown:0,sumCloseAtr:0,sumMfeUp:0,sumMfeDown:0,lastAt:0});
const emptyCal=():Cal=>({n:0,correct:0,wrong:0,flat:0,sumSignedAtr:0,lastAt:0});
const emptyStore=():Store=>({version:1,patterns:{},calibration:{},observations:[],bootstrapped:{},totals:{}});

let loaded=false,store:Store=emptyStore(),storagePath=FILE,queue=Promise.resolve();
function serialized<T>(fn:()=>Promise<T>):Promise<T>{const p=queue.then(fn,fn);queue=p.then(()=>undefined,()=>undefined);return p;}
async function ensure(file:string){await fs.mkdir(path.dirname(file),{recursive:true}).catch(()=>{});}
async function load(){
  if(loaded)return;
  for(const file of [FILE,FALLBACK]){
    try{await ensure(file);const j=JSON.parse(await fs.readFile(file,'utf8'));if(j?.version>=1){store={...emptyStore(),...j};storagePath=file;loaded=true;return;}}catch{}
  }
  storagePath=FILE;try{await ensure(FILE);await fs.writeFile(FILE,JSON.stringify(store));}catch{storagePath=FALLBACK;}loaded=true;
}
async function save(){
  const file=storagePath,tmp=file+'.tmp';
  try{await ensure(file);await fs.writeFile(tmp,JSON.stringify(store));await fs.rename(tmp,file);}
  catch{if(file!==FALLBACK){storagePath=FALLBACK;await ensure(FALLBACK);await fs.writeFile(FALLBACK,JSON.stringify(store)).catch(()=>{});}}
}
function bars(h:H){return h==='m2'?2:h==='m5'?5:15;}
function halfLife(h:H){return h==='m2'?12*3600000:h==='m5'?36*3600000:5*24*3600000;}
function gate(h:H){return h==='m2'?.16:h==='m5'?.24:.40;}
function burstGate(h:H){return h==='m2'?.45:h==='m5'?.80:1.30;}
function sideOf(v:number,g=8):Side{return v>=g?'BUY':v<=-g?'SELL':'WAIT';}
function session(at:number){const h=new Date(at).getUTCHours();return h>=12&&h<16?'OVERLAP':h>=7&&h<12?'LONDON':h>=16&&h<21?'NEWYORK':h<7?'ASIA':'LATE';}
function atrAt(c:Candle[],i:number,n=14){
  if(i<n)return NaN;let s=0,k=0;
  for(let j=i-n+1;j<=i;j++){const x=c[j],p=c[j-1];if(!x||!p)continue;s+=Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close));k++;}
  return k?s/k:NaN;
}
function bucket(v:number,cuts:number[]){let i=0;while(i<cuts.length&&v>cuts[i])i++;return i;}
function features(c:Candle[],i:number){
  if(i<24)return null;const a=atrAt(c,i);if(!Number.isFinite(a)||a<=0)return null;
  const x=c[i],r1=(x.close-c[i-1].close)/a,r3=(x.close-c[i-3].close)/a,r6=(x.close-c[i-6].close)/a,acc=r1-r3/3;
  const rr=avg(c.slice(i-3,i+1).map(v=>v.high-v.low)),br=avg(c.slice(i-15,i-3).map(v=>v.high-v.low)),comp=br>0?rr/br:1;
  const base=c.slice(i-20,i),hi=Math.max(...base.map(v=>v.high)),lo=Math.min(...base.map(v=>v.low)),span=Math.max(1e-9,hi-lo),pos=(x.close-lo)/span;
  const pathLen=c.slice(i-6,i+1).reduce((s,v,j,a2)=>j?s+Math.abs(v.close-a2[j-1].close):0,0),eff=pathLen?Math.abs(x.close-c[i-6].close)/pathLen:0;
  const atrBps=a/Math.max(1e-9,x.close)*10000;
  return {atr:a,r1,r3,r6,acc,comp,pos,eff,atrBps};
}
function keys(asset:string,f:any,ctx:any,at:number){
  const mom=bucket(f.r3,[-.9,-.35,-.08,.08,.35,.9]),acc=bucket(f.acc,[-.35,-.10,.10,.35]),comp=bucket(f.comp,[.55,.75,1,1.35]),pos=bucket(f.pos,[.2,.4,.6,.8]),eff=bucket(f.eff,[.25,.5,.72]),vol=bucket(f.atrBps,[2,4,7,12,20]),ses=session(at);
  const out=[
    'EM|'+asset+'|m'+mom+'|a'+acc+'|c'+comp+'|p'+pos+'|e'+eff+'|v'+vol,
    'EMS|'+asset+'|'+ses+'|m'+mom+'|c'+comp+'|v'+vol,
    'EMV|'+asset+'|v'+vol+'|c'+comp+'|p'+pos
  ];
  if(ctx){
    const sg=String(ctx?.stateGraph?.current||'NA'),sgn=String(ctx?.stateGraph?.nextState||'NA'),m1=String(ctx?.structure?.m1?.phase||'NA'),m5=String(ctx?.structure?.m5?.phase||'NA'),ac=String(ctx?.accumulation?.phase||'NA'),liq=String(ctx?.liquidity?.side||'NA');
    out.unshift('EMC|'+asset+'|'+ses+'|'+sg+'|'+sgn+'|'+m1+'|'+m5+'|'+ac+'|'+liq);
  }
  return [...new Set(out)];
}
function ensureBucket(k:string){
  if(!store.patterns[k])store.patterns[k]={m2:emptyH(),m5:emptyH(),m15:emptyH()};
  return store.patterns[k];
}
function ensureCal(asset:string){
  if(!store.calibration[asset])store.calibration[asset]={m2:emptyCal(),m5:emptyCal(),m15:emptyCal()};
  return store.calibration[asset];
}
function decayH(s:HStats,at:number,h:H){
  if(!s.lastAt||at<=s.lastAt)return;const f=Math.pow(.5,(at-s.lastAt)/halfLife(h));
  if(f<.999){s.n*=f;s.up*=f;s.down*=f;s.flat*=f;s.strongUp*=f;s.strongDown*=f;s.sumCloseAtr*=f;s.sumMfeUp*=f;s.sumMfeDown*=f;}
}
function decayCal(s:Cal,at:number,h:H){
  if(!s.lastAt||at<=s.lastAt)return;const f=Math.pow(.5,(at-s.lastAt)/halfLife(h));
  if(f<.999){s.n*=f;s.correct*=f;s.wrong*=f;s.flat*=f;s.sumSignedAtr*=f;}
}
function outcome(c:Candle[],startTime:number,entry:number,a:number,h:H){
  const end=startTime+bars(h)*60000,window=c.filter(x=>x.time>startTime&&x.time<=end);
  if(window.length<bars(h))return null;
  const last=window.at(-1)!,closeAtr=(last.close-entry)/a,mfeUp=(Math.max(...window.map(x=>x.high))-entry)/a,mfeDown=(entry-Math.min(...window.map(x=>x.low)))/a;
  return {closeAtr,mfeUp,mfeDown,at:last.time};
}
function label(v:number,h:H):Side{const g=gate(h);return v>=g?'BUY':v<=-g?'SELL':'WAIT';}
function updateStats(s:HStats,o:{closeAtr:number;mfeUp:number;mfeDown:number;at:number},h:H){
  decayH(s,o.at,h);s.n++;s.sumCloseAtr+=o.closeAtr;s.sumMfeUp+=o.mfeUp;s.sumMfeDown+=o.mfeDown;s.lastAt=o.at;
  const y=label(o.closeAtr,h);if(y==='BUY')s.up++;else if(y==='SELL')s.down++;else s.flat++;
  const bg=burstGate(h);
  if(o.mfeUp>=bg||o.mfeDown>=bg){
    if(o.mfeUp>o.mfeDown)s.strongUp++;else if(o.mfeDown>o.mfeUp)s.strongDown++;
  }
}
function updateCal(s:Cal,pred:Side,o:{closeAtr:number;at:number},h:H){
  if(pred==='WAIT')return;decayCal(s,o.at,h);s.n++;const y=label(o.closeAtr,h);
  if(y==='WAIT')s.flat++;else if(y===pred)s.correct++;else s.wrong++;
  s.sumSignedAtr+=o.closeAtr*(pred==='BUY'?1:-1);s.lastAt=o.at;
}
function calScore(s:Cal,now:number,h:H){
  if(s.n<5)return 50;const dir=s.correct+s.wrong,acc=dir?(s.correct+3)/(dir+6):.5,edge=s.sumSignedAtr/Math.max(1,s.n),sample=Math.min(1,s.n/40),age=s.lastAt?now-s.lastAt:halfLife(h),rec=.65+.35*Math.pow(.5,age/halfLife(h));
  return Math.round(cap(50+((acc-.5)*72+Math.max(-.35,Math.min(.35,edge))*42)*sample*rec,30,78));
}
function aggregate(ks:string[],h:H,now:number){
  let w=0,n=0,up=0,down=0,mean=0,mfeUp=0,mfeDown=0,su=0,sd=0,matched=0;
  ks.forEach((k,idx)=>{const s=store.patterns[k]?.[h];if(!s||s.n<3)return;const rec=.35+.65*Math.pow(.5,Math.max(0,now-s.lastAt)/halfLife(h)),sw=Math.min(1,s.n/30)*(idx===0?1:.76)*rec;
    up+=(s.up+2)/(s.n+6)*sw;down+=(s.down+2)/(s.n+6)*sw;mean+=s.sumCloseAtr/(s.n+8)*sw;mfeUp+=s.sumMfeUp/(s.n+8)*sw;mfeDown+=s.sumMfeDown/(s.n+8)*sw;su+=(s.strongUp+1)/(s.n+5)*sw;sd+=(s.strongDown+1)/(s.n+5)*sw;w+=sw;n+=s.n*sw;matched++;});
  if(!w)return {side:'WAIT' as Side,strength:0,confidence:0,samples:0,meanCloseAtr:0,expectedUpAtr:0,expectedDownAtr:0,burstSide:'WAIT' as Side,burstProbability:0,matched:0};
  up/=w;down/=w;mean/=w;mfeUp/=w;mfeDown/=w;su/=w;sd/=w;n/=w;
  let signed=(up-down)*100+Math.max(-42,Math.min(42,mean*70));if((up-down)*mean<0&&Math.abs(mean)>.03)signed*=.55;
  const side=sideOf(signed,9),strength=Math.round(cap(50+Math.abs(signed)*.38,0,88)),confidence=Math.round(cap(35+Math.min(30,n)*1.05+Math.abs(signed)*.20,0,80));
  const burstDelta=(su-sd)*100,burstSide=sideOf(burstDelta,6),burstProbability=Math.round(cap(Math.max(su,sd)*100,0,92));
  return {side,strength,confidence,samples:Math.round(n),meanCloseAtr:Number(mean.toFixed(3)),expectedUpAtr:Number(mfeUp.toFixed(3)),expectedDownAtr:Number(mfeDown.toFixed(3)),burstSide,burstProbability,matched};
}
async function bootstrap(asset:string,c1:Candle[],now:number){
  const key=asset+':'+SCHEMA;if(store.bootstrapped[key])return false;
  const c=c1.filter(x=>x.time+60000<=now).slice(-700);if(c.length<100)return false;
  for(let i=28;i<c.length-15;i++){
    const f=features(c,i);if(!f)continue;const ks=keys(asset,f,null,c[i].time);
    for(const h of ['m2','m5','m15'] as H[]){const o=outcome(c,c[i].time,c[i].close,f.atr,h);if(o)for(const k of ks)updateStats(ensureBucket(k)[h],o,h);}
  }
  store.bootstrapped[key]=c.at(-1)?.time||now;return true;
}
async function settle(asset:string,c1:Candle[],now:number){
  const c=c1.filter(x=>x.time+60000<=now),cal=ensureCal(asset);let changed=false;
  for(const o of store.observations){
    if(o.asset!==asset)continue;
    for(const h of ['m2','m5','m15'] as H[]){
      if(o.settled[h])continue;const out=outcome(c,o.candleTime,o.price,o.atr,h);if(!out)continue;
      for(const k of o.keys)updateStats(ensureBucket(k)[h],out,h);updateCal(cal[h],o.predictions[h],out,h);o.settled[h]=true;changed=true;
      const t=store.totals[asset]||{observations:0,resolved2:0,resolved5:0,resolved15:0,updatedAt:0};
      if(h==='m2')t.resolved2++;else if(h==='m5')t.resolved5++;else t.resolved15++;t.updatedAt=now;store.totals[asset]=t;
    }
  }
  store.observations=store.observations.filter(o=>!(o.settled.m2&&o.settled.m5&&o.settled.m15&&now-o.createdAt>12*3600000)).slice(-900);
  return changed;
}
function decorate(raw:any,cal:number):ExpectedMoveHorizon{
  const factor=.82+cal/280;return {...raw,confidence:Math.round(cap(raw.confidence*factor,0,82)),calibration:cal};
}

export async function getExpectedMoveLearning(args:{asset:string;c1:Candle[];context:any;now?:number}):Promise<ExpectedMoveLearning>{
  return serialized(async()=>{
    await load();const now=args.now||Date.now(),b=await bootstrap(args.asset,args.c1,now),s=await settle(args.asset,args.c1,now);if(b||s)await save();
    const c=args.c1.filter(x=>x.time+60000<=now),i=c.length-1,t=store.totals[args.asset]||{observations:0,resolved2:0,resolved5:0,resolved15:0,updatedAt:0};
    const blank:ExpectedMoveHorizon={side:'WAIT',strength:0,confidence:0,samples:0,meanCloseAtr:0,expectedUpAtr:0,expectedDownAtr:0,burstSide:'WAIT',burstProbability:0,calibration:50};
    if(i<28)return {ok:false,asset:args.asset,twoMinute:blank,fiveMinute:blank,fifteenMinute:blank,consensusSide:'WAIT',consensusScore:0,conflict:false,totals:t,storage:storagePath,reasons:['بيانات غير كافية لذاكرة الحركة المتوقعة.']};
    const f=features(c,i);if(!f)return {ok:false,asset:args.asset,twoMinute:blank,fiveMinute:blank,fifteenMinute:blank,consensusSide:'WAIT',consensusScore:0,conflict:false,totals:t,storage:storagePath,reasons:['ATR غير كافٍ.']};
    const ks=keys(args.asset,f,args.context,c[i].time),cal=ensureCal(args.asset);
    const r2=aggregate(ks,'m2',now),r5=aggregate(ks,'m5',now),r15=aggregate(ks,'m15',now);
    const h2=decorate(r2,calScore(cal.m2,now,'m2')),h5=decorate(r5,calScore(cal.m5,now,'m5')),h15=decorate(r15,calScore(cal.m15,now,'m15'));
    const signed=(h2.side==='BUY'?h2.confidence:h2.side==='SELL'?-h2.confidence:0)*.34+(h5.side==='BUY'?h5.confidence:h5.side==='SELL'?-h5.confidence:0)*.36+(h15.side==='BUY'?h15.confidence:h15.side==='SELL'?-h15.confidence:0)*.30;
    const consensusSide=sideOf(signed,8),active=[h2.side,h5.side,h15.side].filter(x=>x!=='WAIT'),conflict=active.includes('BUY')&&active.includes('SELL');
    const consensusScore=Math.round(cap(Math.abs(signed)+(conflict?-12:8),0,88));
    return {ok:true,asset:args.asset,twoMinute:h2,fiveMinute:h5,fifteenMinute:h15,consensusSide,consensusScore,conflict,totals:t,storage:storagePath,reasons:[
      '2m '+h2.side+' · cal '+h2.calibration+' · '+h2.samples+' samples',
      '5m '+h5.side+' · cal '+h5.calibration+' · '+h5.samples+' samples',
      '15m '+h15.side+' · cal '+h15.calibration+' · '+h15.samples+' samples',
      conflict?'2/5/15 conflict detected':'2/5/15 path internally consistent'
    ]};
  });
}

export async function recordExpectedMoveObservation(args:{asset:string;c1:Candle[];context:any;forecast:any;now?:number}){
  return serialized(async()=>{
    await load();const now=args.now||Date.now(),c=args.c1.filter(x=>x.time+60000<=now),i=c.length-1;if(i<28)return false;
    const candle=c[i],f=features(c,i);if(!f)return false;const id=args.asset+':'+SCHEMA+':'+candle.time;if(store.observations.some(x=>x.id===id))return false;
    const predictions:{m2:Side;m5:Side;m15:Side}={m2:args.forecast?.horizons?.twoMinute?.side||'WAIT',m5:args.forecast?.horizons?.fiveMinute?.side||'WAIT',m15:args.forecast?.horizons?.fifteenMinute?.side||'WAIT'};
    store.observations.push({id,asset:args.asset,candleTime:candle.time,price:candle.close,atr:f.atr,keys:keys(args.asset,f,args.context,candle.time),predictions,settled:{m2:false,m5:false,m15:false},createdAt:now});
    const t=store.totals[args.asset]||{observations:0,resolved2:0,resolved5:0,resolved15:0,updatedAt:0};t.observations++;t.updatedAt=now;store.totals[args.asset]=t;store.observations=store.observations.slice(-900);await save();return true;
  });
}
