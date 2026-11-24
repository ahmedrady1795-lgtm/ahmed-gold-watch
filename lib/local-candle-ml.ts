/** Low-cost local logistic research model. No network, no lookahead, no
 * trading authorization. Historical chronological validation is NOT live proof.
 * Candle-only features do not claim to measure executed order flow. */
type Bar={time:number;open:number;high:number;low:number;close:number};
type Example={i:number;x:number[];y:number};
type Side='BUY'|'SELL'|'WAIT';
export type LocalHorizon={side:Side;validationHits:number;validationCount:number;
 baselineHits:number;selectedCount:number;status:'INSUFFICIENT'|'SHADOW'|'HISTORICAL_EDGE';
 rawScore:number|null};
export type LocalCandleMl={asOf:number|null;m1:LocalHorizon;m5:LocalHorizon;neuralM1:LocalHorizon;neuralM5:LocalHorizon;tradeAuthorized:false};
const empty=():LocalHorizon=>({side:'WAIT',validationHits:0,validationCount:0,
 baselineHits:0,selectedCount:0,status:'INSUFFICIENT',rawScore:null});
const cap=(v:number)=>Math.max(-5,Math.min(5,v));
function features(b:Bar[],i:number){
 if(i<12)return null;
 const r=b.slice(i-12,i+1);
 if(r.some((v,j)=>j>0&&v.time-r[j-1].time!==60000))return null;
 const z=r.at(-1)!;
 const atr=r.slice(1).reduce((s,v,j)=>s+Math.max(v.high-v.low,
   Math.abs(v.high-r[j].close),Math.abs(v.low-r[j].close)),0)/12;
 if(!(atr>0)||atr/z.close>.05)return null;
 const low=Math.min(...r.slice(0,-1).map(v=>v.low));
 const high=Math.max(...r.slice(0,-1).map(v=>v.high));
 return [1,cap((z.close-r[11].close)/atr),cap((z.close-r[9].close)/atr),
   cap((z.close-r[6].close)/atr),cap((z.close-z.open)/atr),
   cap((z.close-z.low-(z.high-z.close))/atr),
   cap((z.close-low)/atr),cap((high-z.close)/atr),
   cap((z.high-z.low)/atr)];
}
const sigmoid=(v:number)=>1/(1+Math.exp(-Math.max(-20,Math.min(20,v))));
const predict=(w:number[],x:number[])=>sigmoid(w.reduce((s,v,i)=>s+v*x[i],0));
// Deterministic, bounded nonlinear research model; no remote dependencies.
function fitNeural(train:Example[],width:number){
 const n=6;
 const w=Array.from({length:n},(_,j)=>Array.from({length:width},(_,k)=>.15*Math.sin((j+1)*11+(k+1)*3.7)));
 const v=Array.from({length:n},(_,j)=>.15*Math.cos((j+1)*2.1));
 let bias=0;
 const hidden=(x:number[])=>w.map(row=>Math.tanh(row.reduce((s,a,k)=>s+a*x[k],0)));
 for(let epoch=0;epoch<40;epoch++){
   const dw=w.map(row=>row.map(a=>.01*a)),dv=v.map(a=>.01*a);let db=0;
   for(const e of train){
     const z=hidden(e.x);
     const err=(sigmoid(bias+v.reduce((s,a,j)=>s+a*z[j],0))-e.y)/train.length;
     db+=err;
     for(let j=0;j<n;j++){
       dv[j]+=err*z[j];
       const d=err*v[j]*(1-z[j]*z[j]);
       for(let k=0;k<width;k++)dw[j][k]+=d*e.x[k];
     }
   }
   bias-=.25*db;
   for(let j=0;j<n;j++){v[j]-=.25*dv[j];for(let k=0;k<width;k++)w[j][k]-=.25*dw[j][k];}
 }
 return (x:number[])=>{const z=hidden(x);return sigmoid(bias+v.reduce((s,a,j)=>s+a*z[j],0));};
}
function evaluate(b:Bar[],h:number,neural=false):LocalHorizon{
 const current=features(b,b.length-1);
 if(!current)return empty();
 const ex:Example[]=[];
 for(let i=12;i+h<b.length;i++){
   const x=features(b,i);
   if(!x||b[i+h].time-b[i].time!==h*60000||
      b.slice(i+1,i+h+1).some((v,j)=>v.time-b[i+j].time!==60000))continue;
   if(b[i+h].close===b[i].close)continue;
   ex.push({i,x,y:b[i+h].close>b[i].close?1:0});
 }
 if(ex.length<180)return empty();
 const validation=ex.slice(-60);
 const train=ex.filter(e=>e.i+h<validation[0].i);
 if(train.length<120)return empty();
 const w=Array(current.length).fill(0) as number[];
 for(let epoch=0;!neural&&epoch<24;epoch++){
   const grad=w.map(v=>.015*v);
   for(const e of train){const err=predict(w,e.x)-e.y;
     for(let k=0;k<w.length;k++)grad[k]+=err*e.x[k]/train.length;}
   for(let k=0;k<w.length;k++)w[k]-=.18*grad[k];
 }
 const majority=train.reduce((s,v)=>s+v.y,0)>=train.length/2?1:0;
 const infer=neural?fitNeural(train,current.length):(x:number[])=>predict(w,x);
 const all=validation.map(e=>({y:e.y,p:infer(e.x)}));
 const selected=all.filter(e=>e.p>=.58||e.p<=.42);
 const hits=all.filter(e=>Number(e.p>=.5)===e.y).length;
 const base=all.filter(e=>e.y===majority).length;
 const selectedHits=selected.filter(e=>Number(e.p>=.5)===e.y).length;
 const edge=hits>=Math.ceil(all.length*.60)&&hits>=base+4&&selected.length>=20&&
   selectedHits>=Math.ceil(selected.length*.65)&&
   selected.some(e=>e.p>=.58)&&selected.some(e=>e.p<=.42);
 const rawScore=infer(current);
 return {side:edge&&rawScore>=.58?'BUY':edge&&rawScore<=.42?'SELL':'WAIT',
   validationHits:hits,validationCount:all.length,baselineHits:base,selectedCount:selected.length,
   status:edge?'HISTORICAL_EDGE':'SHADOW',rawScore};
}
const cache=new Map<string,LocalCandleMl>();
export function localCandleMl(scope:string,raw:unknown,now:number,ready:boolean):LocalCandleMl{
 const none=():LocalCandleMl=>({asOf:null,m1:empty(),m5:empty(),neuralM1:empty(),neuralM5:empty(),tradeAuthorized:false});
 if(!ready||!scope||!Number.isFinite(now)||!Array.isArray(raw))return none();
 const map=new Map<number,Bar>();
 for(const v of raw){
   if(!v||![v.time,v.open,v.high,v.low,v.close].every(Number.isFinite)||
     v.time<=0||v.time%60000!==0||v.time+60000>now||v.low<=0||
     v.high<Math.max(v.open,v.close)||v.low>Math.min(v.open,v.close))continue;
   const old=map.get(v.time);
   if(old&&[old.open,old.high,old.low,old.close].some((n,j)=>n!==[v.open,v.high,v.low,v.close][j]))return none();
   map.set(v.time,v);
 }
 const bars=[...map.values()].sort((a,b)=>a.time-b.time).slice(-420);
 const last=bars.at(-1);
 if(bars.length<220||!last||now-last.time-60000>90000)return none();
 const key=scope+'|'+bars.map(b=>[b.time,b.open,b.high,b.low,b.close].join(':')).join('|');
 const cached=cache.get(key);if(cached)return cached;
 const result:LocalCandleMl={asOf:last.time+60000,m1:evaluate(bars,1),m5:evaluate(bars,5),neuralM1:evaluate(bars,1,true),neuralM5:evaluate(bars,5,true),tradeAuthorized:false};
 cache.set(key,result);while(cache.size>6)cache.delete(cache.keys().next().value!);
 return result;
}
