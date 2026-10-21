/** One volatility/structure horizon for a paper entry and its structural TP1. */
export const SNIPER_PLAN_VERSION='SNIPER_STRUCTURAL_V2';
type Bar={time:number;open:number;high:number;low:number;close:number};
const num=(v:unknown)=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
function closed(raw:any,period:number,now:number):Bar[]{
 const seen=new Map<number,Bar>();
 for(const b of Array.isArray(raw)?raw:[]){
  if(!b||![b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)||
   b.time%period!==0||b.time+period>now||b.low<=0||
   b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))continue;
  seen.set(b.time,b);
 }
 return [...seen.values()].sort((a,b)=>a.time-b.time).slice(-100);
}
function atr(rows:Bar[],period:number){
 if(rows.length<15)return null;
 const tail=rows.slice(-15);
 if(tail.some((b,i)=>i>0&&b.time-tail[i-1].time!==period))return null;
 const values=tail.slice(1).map((b,i)=>Math.max(b.high-b.low,
  Math.abs(b.high-tail[i].close),Math.abs(b.low-tail[i].close)));
 const a=values.reduce((s,v)=>s+v,0)/values.length;
 return a>0?a:null;
}
export function buildSniperRiskPlan(input:{asset:'GOLD'|'BTC';side:'BUY'|'SELL'|'WAIT';
 price:number|null;now:number;frames:any;originalStop:number|null;target:number|null;spread?:number|null}){
 const no=(reason:string)=>({ready:false,version:SNIPER_PLAN_VERSION,stop:null as number|null,
  risk:null as number|null,rr:null as number|null,atr5:null as number|null,atr15:null as number|null,
  minRisk:null as number|null,repaired:false,reason});
 const price=num(input.price),target=num(input.target),original=num(input.originalStop);
 if(input.side==='WAIT'||price==null||price<=0||target==null)return no('لا هدف واتجاه لبناء خطة المخاطرة');
 const sign=input.side==='BUY'?1:-1;
 if(sign*(target-price)<=0)return no('الهدف الهيكلي ليس أمام السعر');
 const m5=closed(input.frames?.m5,300000,input.now),m15=closed(input.frames?.m15,900000,input.now);
 const a5=atr(m5,300000),a15=atr(m15,900000);
 if(a5==null||a15==null||input.now-(m5.at(-1)!.time+300000)>13*60000||
  input.now-(m15.at(-1)!.time+900000)>28*60000)
  return no('لا مدى M5/M15 متصل وحديث لبناء الوقف');
 // Costs and normal higher-frame noise must fit INSIDE the stop. A tiny
 // one-minute invalidation is never borrowed for a 75-minute structural TP.
 const minRisk=Math.max(a5*.9,a15*.5,Math.max(0,num(input.spread)??0)*3,
  price*(input.asset==='GOLD'?.00015:.00025));
 const buffer=Math.max(a5*.18,price*.00003);
 let stop=original!=null&&sign*(price-original)>=minRisk?original:null;
 if(stop==null){
  // The last completed pullback and confirmed M5 pivots are real anchors.
  // Never move a target or tighten a structural stop to force a desired RR.
  const recent=m5.slice(-3),anchors=[input.side==='BUY'?
   Math.min(...recent.map(b=>b.low)):Math.max(...recent.map(b=>b.high))];
  for(let i=m5.length-3;i>=Math.max(2,m5.length-18);i--){
   const b=m5[i],around=[m5[i-2],m5[i-1],m5[i+1],m5[i+2]];
   if(input.side==='BUY'?around.every(x=>b.low<=x.low):around.every(x=>b.high>=x.high))
    anchors.push(input.side==='BUY'?b.low:b.high);
  }
  const usable=anchors.map(p=>p-sign*buffer)
   .filter(p=>p>0&&sign*(price-p)>=minRisk)
   .sort((a,b)=>Math.abs(price-a)-Math.abs(price-b));
  stop=usable[0]??null;
 }
 if(stop==null)return {...no('لم يظهر ارتكاز مغلق يسمح بوقف خارج ضوضاء M15'),atr5:a5,atr15:a15,minRisk};
 // Round AWAY from entry, never through a protective structural boundary.
 stop=(sign===1?Math.floor(stop*100):Math.ceil(stop*100))/100;
 const risk=sign*(price-stop),rr=sign*(target-price)/risk;
 return {ready:rr>=1.35,version:SNIPER_PLAN_VERSION,stop,risk,rr,
  atr5:a5,atr15:a15,minRisk,repaired:stop!==original,
  reason:rr>=1.35?'وقف هيكلي خارج الضوضاء مع هدف M15/H1':
   'الهدف الحقيقي لا يغطي الوقف الهيكلي بعائد/مخاطرة 1.35'};
}
