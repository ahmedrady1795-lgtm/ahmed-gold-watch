import type {Candle} from './engine';
import type {ScalpQuote} from './scalp-opportunities';

// Price-derived stop-pool candidates, never exchange order-book quantities.
type WatchSide='BUY'|'SELL';
type HoldWatch={
  openedAt:number;expiresAt:number;trigger:number;invalidation:number;
  firstBeyondAt:number|null;lastSeenAt:number;lastQuoteAt:number;
  confirmedAt:number|null;
};
const activeWatches=new Map<string,HoldWatch>();

// This is an OBSERVED 60-second hold from fresh, advancing quotes, never a
// historical candle backfill masquerading as a realtime entry. A closed M1
// candle must additionally confirm the fixed trigger.
function evaluateM1Hold(
  asset:'GOLD'|'BTC',horizon:1|5,side:WatchSide,seed:{trigger:number;invalidation:number},
  closed:Candle[],quote:ScalpQuote,now:number,atr:number
){
  const key=asset+':'+horizon+':'+side;
  let watch=activeWatches.get(key);
  const elapsed=watch?now-watch.openedAt:Infinity;
  if(!watch||now>watch.expiresAt||elapsed<0){
    watch={openedAt:now,expiresAt:now+4*60000,trigger:seed.trigger,invalidation:seed.invalidation,
      firstBeyondAt:null,lastSeenAt:0,lastQuoteAt:0,confirmedAt:null};
    activeWatches.set(key,watch);
  }
  const dir=side==='BUY'?1:-1;
  const at=Number(quote.at);
  const price=Number(quote.price);
  const fresh=quote.price!=null&&quote.at!=null&&Number.isFinite(price)&&price>0&&
    Number.isFinite(at)&&at<=now+2000&&now-at>=0&&now-at<=10000;
  const contiguous=closed.slice(-3).every((c,i,a)=>i===0||c.time-a[i-1].time===60000);
  const continuity=watch.lastSeenAt>0&&now-watch.lastSeenAt>=0&&now-watch.lastSeenAt<=10000;
  if(!fresh||!contiguous||!continuity){
    watch.firstBeyondAt=null;
    watch.confirmedAt=null;
  }
  const beyond=fresh&&dir*(price-watch.trigger)>Math.max(price*.000002,atr*.015);
  const invalid=fresh&&dir*(price-watch.invalidation)<=0;
  if(!beyond||invalid){
    watch.firstBeyondAt=null;
    watch.confirmedAt=null;
  }else if(at>watch.lastQuoteAt){
    if(watch.firstBeyondAt===null)watch.firstBeyondAt=now;
    watch.lastSeenAt=now;
    watch.lastQuoteAt=at;
  }
  // A frozen quote timestamp is not new evidence of holding the level.
  if(watch.lastSeenAt>0&&now-watch.lastSeenAt>10000){
    watch.firstBeyondAt=null;
    watch.confirmedAt=null;
  }
  const last=closed.at(-1);
  const closeAt=last?last.time+60000:0;
  const candleConfirmed=Boolean(last&&contiguous&&closeAt>watch.openedAt&&
    now-closeAt>=0&&now-closeAt<=90000&&
    dir*(last.close-watch.trigger)>0);
  const heldSeconds=watch.firstBeyondAt!==null&&fresh&&beyond&&continuity
    ?Math.max(0,Math.min(60,Math.floor((now-watch.firstBeyondAt)/1000))):0;
  const confirmed=Boolean(beyond&&!invalid&&heldSeconds>=60&&candleConfirmed);
  if(confirmed&&!watch.confirmedAt)watch.confirmedAt=now;
  if(!confirmed)watch.confirmedAt=null;
  return {
    state:confirmed?'CONFIRMED':heldSeconds>0?'HOLDING':'WATCH',
    side,trigger:watch.trigger,invalidation:watch.invalidation,
    heldSeconds,remainingSeconds:Math.max(0,60-heldSeconds),
    requiredSeconds:60,closedCandleConfirmed:candleConfirmed,
    confirmedAt:watch.confirmedAt,expiresAt:watch.expiresAt,
    reason:confirmed?'ثبات 60 ثانية مع إغلاق M1 مؤكد':heldSeconds>0
      ?'جارٍ حساب الثبات من أسعار جديدة؛ يلزم 60 ثانية وإغلاق M1'
      :'بانتظار عبور المستوى ثم الثبات 60 ثانية'
  };
}
export function readScalpLiquidity(rows:Candle[],quote:ScalpQuote,now:number,asset:'GOLD'|'BTC'='GOLD'){
  const closed=rows.filter(c=>c.time+60000<=now&&[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.low>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)).slice(-90);
  const last=closed.at(-1),price=quote.price;
  const fresh=price!=null&&price>0&&quote.at!=null&&now-quote.at<=15000&&quote.at<=now+2000;
  const contiguous=closed.slice(-20).every((c,i,a)=>!i||c.time-a[i-1].time===60000);
  const available=Boolean(last&&closed.length>=21&&now-last.time-60000<=90000&&fresh&&contiguous);
  if(!available)return {available:false,checkedAt:now,reason:'قراءة السيولة تحتاج سعراً حديثاً وشموع M1 متصلة',levels:[],sweeps:[],scenarios:[]};
  const sample=closed.slice(-21,-1),high=Math.max(...sample.map(c=>c.high)),low=Math.min(...sample.map(c=>c.low));
  const atr=closed.slice(-14).reduce((s,c)=>s+c.high-c.low,0)/14,tolerance=Math.max(atr*.12,price!*.000005);
  const pivots:{price:number;side:'ABOVE'|'BELOW';touches:number}[]=[];
  for(let i=2;i<closed.length-2;i++){
    const c=closed[i],near=closed.slice(i-2,i+3);
    for(const side of ['ABOVE','BELOW'] as const){
      const p=side==='ABOVE'?c.high:c.low;
      if(!(side==='ABOVE'?near.every(x=>x.high<=p):near.every(x=>x.low>=p)))continue;
      // Once a later closed candle trades through a pool, it is no longer untouched.
      if(closed.slice(i+1).some(x=>side==='ABOVE'?x.high>p+tolerance:x.low<p-tolerance))continue;
      const cluster=pivots.find(x=>x.side===side&&Math.abs(x.price-p)<=tolerance);
      if(cluster)cluster.touches++;else pivots.push({price:p,side,touches:1});
    }
  }
  const levels=[...pivots.filter(x=>x.side==='ABOVE'&&x.price>price!).sort((a,b)=>a.price-b.price).slice(0,2),...pivots.filter(x=>x.side==='BELOW'&&x.price<price!).sort((a,b)=>b.price-a.price).slice(0,2)].map(x=>({...x,price:Number(x.price.toFixed(2)),distance:Number(Math.abs(x.price-price!).toFixed(2))}));
  const sweeps:{side:'BUY'|'SELL';level:number;at:number}[]=[];
  for(let i=Math.max(20,closed.length-6);i<closed.length;i++){
    const c=closed[i],prior=closed.slice(i-20,i),h=Math.max(...prior.map(x=>x.high)),l=Math.min(...prior.map(x=>x.low));
    if(c.high>h+tolerance&&c.close<h)sweeps.push({side:'SELL',level:h,at:c.time+60000});
    if(c.low<l-tolerance&&c.close>l)sweeps.push({side:'BUY',level:l,at:c.time+60000});
  }
  const move=price!-last!.close;
  const pressure=move>atr*.12?'BUY':move<-atr*.12?'SELL':'WAIT';
  const position=high>low?Math.round((price!-low)/(high-low)*100):50;
  const state=price!>high?'السعر فوق قمة 20 دقيقة · اختبار استمرار الاختراق':price!<low?'السعر تحت قاع 20 دقيقة · اختبار استمرار الكسر':position>=80?'قرب سيولة القمم':position<=20?'قرب سيولة القيعان':'السعر داخل نطاق السيولة';
  const round=(v:number)=>Number(v.toFixed(2));
  const scenarios=atr>0?([1,5] as const).map(horizon=>({horizon,paths:([1,-1] as const).map(dir=>{
    const seedTrigger=last!.close+dir*atr*.15;
    const seedInvalidation=dir===1?Math.min(last!.low,seedTrigger-atr*.5):Math.max(last!.high,seedTrigger+atr*.5);
    const confirmation=evaluateM1Hold(asset,horizon,dir===1?'BUY':'SELL',
      {trigger:round(seedTrigger),invalidation:round(seedInvalidation)},closed,quote,now,atr);
    const trigger=confirmation.trigger,origin=dir===1?Math.max(price!,trigger):Math.min(price!,trigger);
    const step=atr*(horizon===1?.5:1),targets:{price:number;kind:'STRUCTURE'|'PROJECTION'}[]=[];
    const candidates=[...pivots.filter(p=>p.side===(dir===1?'ABOVE':'BELOW')).map(p=>p.price),dir===1?high:low].filter(p=>dir*(p-origin)>.01).sort((a,b)=>dir*(a-b));
    for(let j=0;j<3;j++){
      const previous=j?targets[j-1].price:origin;
      const structural=candidates.find(p=>dir*(p-previous)>Math.max(.02,atr*.15)&&dir*(p-previous)<=step*1.5);
      targets.push({price:round(structural??(previous+dir*step)),kind:structural==null?'PROJECTION':'STRUCTURE'});
    }
    const invalidation=confirmation.invalidation;
    return {side:dir===1?'BUY':'SELL',trigger,invalidation,targets,confirmation};
  })})):[];
  return {available:true,checkedAt:now,reason:state,levels,sweeps,scenarios,rangeHigh:high,rangeLow:low,pressure,move:Number(move.toFixed(2)),bars:closed.length,note:'مناطق سيولة محتملة من القمم والقيعان؛ ليست أوامر معلقة مرصودة. الزخم اللحظي مقارنة بآخر إغلاق.'};
}
