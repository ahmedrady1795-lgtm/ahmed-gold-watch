/** Low-cost local logistic research model. No network, no lookahead, no
 * trading authorization. Historical chronological validation is NOT live proof.
 * Candle-only features do not claim to measure executed order flow. */
type Bar={time:number;open:number;high:number;low:number;close:number};
type Example={i:number;x:number[];y:number;end:number};
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
   cap((z.high-z.low)/atr),
   cap((Math.min(z.open,z.close)-z.low-(z.high-Math.max(z.open,z.close)))/atr),
   cap((r.slice(-4).reduce((s,v)=>s+v.high-v.low,0)/4)/atr-1),
   z.low<low&&z.close>low?1:0,z.high>high&&z.close<high?1:0];
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
function evaluate(b:Bar[],h:number,neural=false,gold=false):LocalHorizon{
 const current=features(b,b.length-1);
 if(!current)return empty();
 const ex:Example[]=[];
 // GOLD M5 simulates issuance in the final minute before the actual
 // next 5-minute opening; the forming minute is never a feature or label.
 const gap=gold&&h===5?1:0,span=h+gap;
 for(let i=12;i+span<b.length;i++){
   const x=features(b,i);
   if(!x||b[i+span].time-b[i].time!==span*60000||
      b.slice(i+1,i+span+1).some((v,j)=>v.time-b[i+j].time!==60000))continue;
   // Gold is graded on the forecast candle BODY, not close-to-close drift.
   // An M5 body starts at the first future minute and ends at the fifth.
   const anchor=gold?b[i+1+gap].open:b[i].close;
   if(b[i+span].close===anchor)continue;
   ex.push({i,x,y:b[i+span].close>anchor?1:0,end:i+span});
 }
 if(ex.length<180)return empty();
 const recent=ex.slice(gold&&h===5?-120:-60);
 // Overlapping five-minute labels are not independent test observations.
 // Keep the untouched final window and sample disjoint outcome intervals.
 const validation:Example[]=[];
 for(const e of recent){
   if(gold&&h===5&&b[e.i+1+gap].time%300000!==0)continue;
   if(!gold||h===5||!validation.length||e.i>=validation.at(-1)!.end)validation.push(e);
 }
 if(validation.length<(gold&&h===5?20:40))return empty();
 const train=ex.filter(e=>e.end<recent[0].i);
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
 const pairedBaseline=selected.filter(e=>e.y===majority).length;
 const n=selected.length,p=n?selectedHits/n:0,z=1.96;
 const lower=n?(p+z*z/(2*n)-z*Math.sqrt((p*(1-p)+z*z/(4*n))/n))/(1+z*z/n):0;
 const edge=hits>=Math.ceil(all.length*.60)&&hits>=base+4&&selected.length>=20&&
   selectedHits>=Math.ceil(selected.length*.65)&&(!gold||(lower>.5&&selectedHits>pairedBaseline))&&
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
 // Keep the historical metrics available, but suppress a GOLD M5 opening
 // direction outside the true pre-open window. No cached late/early call.
 const goldWindow=scope.startsWith('GOLD:')?last.time+120000:null;
 const forTime=(v:LocalCandleMl)=>goldWindow!=null&&(goldWindow%300000!==0||goldWindow-now>30000||goldWindow<=now)&&
   (v.m5.side!=='WAIT'||v.neuralM5.side!=='WAIT')?{...v,m5:{...v.m5,side:'WAIT' as const},neuralM5:{...v.neuralM5,side:'WAIT' as const}}:v;
 const cached=cache.get(key);if(cached)return forTime(cached);
 const gold=scope.startsWith('GOLD:');
 const result:LocalCandleMl={asOf:last.time+60000,m1:evaluate(bars,1,false,gold),m5:evaluate(bars,5,false,gold),neuralM1:evaluate(bars,1,true,gold),neuralM5:evaluate(bars,5,true,gold),tradeAuthorized:false};
 cache.set(key,result);while(cache.size>6)cache.delete(cache.keys().next().value!);
 return forTime(result);
}
