/** Independent, causal M1 pullback/reclaim WATCH.
 * This labels the NEXT prospective continuation after a short retracement,
 * not the prior rally. Closed same-source M1/M5 OHLC only: no fictional
 * aggressive executions, no broker orders and no profit inference.
 */
type Side='BUY'|'SELL';
type Bar={time:number;open:number;high:number;low:number;close:number};
export type M1ReclaimWatch={
 side:Side;trigger:number;invalidation:number;asOf:number;
 evidence:'CLOSED_M1_PULLBACK_RECLAIM';tradeAuthorized:false;
};
const num=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const good=(b:any):b is Bar=>b&&[b.time,b.open,b.high,b.low,b.close].every(num)&&
 b.time>0&&b.low>0&&b.low<=Math.min(b.open,b.close)&&
 b.high>=Math.max(b.open,b.close);
function recent(raw:unknown,period:number,now:number,n:number){
 const map=new Map<number,Bar>();
 for(const b of Array.isArray(raw)?raw:[])
  if(good(b)&&b.time%period===0&&b.time+period<=now)map.set(b.time,b);
 const rows=[...map.values()].sort((a,b)=>a.time-b.time).slice(-n);
 return rows.length===n&&rows.every((b,i)=>!i||b.time-rows[i-1].time===period)?rows:null;
}
export function detectM1ReclaimWatch(a:{
 now:number;price:number|null;priceFresh:boolean;providerTransition:boolean;
 marketOpen:boolean;m1:unknown;m5:unknown
}):M1ReclaimWatch|null{
 if(!num(a.now)||!num(a.price)||a.price<=0||!a.priceFresh||
    a.providerTransition||!a.marketOpen)return null;
 const m1=recent(a.m1,60000,a.now,24);
 const m5=recent(a.m5,300000,a.now,3);
 if(!m1||!m5)return null;
 const issued=m1[23].time+60000,closed5=m5[2].time+300000;
 if(a.now<issued||a.now-issued>75000||a.now<closed5||
    a.now-closed5>360000)return null;
 const tr=m1.slice(1).map((b,i)=>Math.max(b.high-b.low,
    Math.abs(b.high-m1[i].close),Math.abs(b.low-m1[i].close)));
 const atr=tr.slice(-18).reduce((s,x)=>s+x,0)/18;
 if(!(atr>0)||atr>a.price*.03)return null;
 const last=m1[23],prev=m1[22];
 const trendDelta=m1[21].close-m1[11].close;
 const m5Delta=m5[2].close-m5[0].close;
 const m5Tr=m5.slice(1).map((b,i)=>Math.max(b.high-b.low,
   Math.abs(b.high-m5[i].close),Math.abs(b.low-m5[i].close)));
 const atr5=m5Tr.reduce((s,x)=>s+x,0)/m5Tr.length;
 const rise=trendDelta>atr*1.05,fall=trendDelta< -atr*1.05;
 const m5Up=m5Delta>Math.max(atr5*.22,atr*.4);
 const m5Down=m5Delta< -Math.max(atr5*.22,atr*.4);
 // A counter-M5 reversal is NOT a continuation entry watch.
 if(!(rise&&!m5Down||fall&&!m5Up))return null;
 const min8=Math.min(...m1.slice(-11,-2).map(b=>b.low));
 const max8=Math.max(...m1.slice(-11,-2).map(b=>b.high));
 const buy=rise&&!m5Down&&prev.close<prev.open-atr*.10&&
   last.close>last.open+atr*.19&&last.close>prev.close+atr*.12&&
   last.low>=min8-atr*.20&&
   last.close>prev.open-atr*.24;
 const sell=fall&&!m5Up&&prev.close>prev.open+atr*.10&&
   last.close<last.open-atr*.19&&last.close<prev.close-atr*.12&&
   last.high<=max8+atr*.20&&
   last.close<prev.open+atr*.24;
 if(buy===sell)return null;
 const side:Side=buy?'BUY':'SELL';
 const buffer=Math.max(.01,atr*.075);
 const trigger=buy?last.high+buffer:last.low-buffer;
 const invalidation=buy?
   Math.min(...m1.slice(-4).map(b=>b.low))-buffer:
   Math.max(...m1.slice(-4).map(b=>b.high))+buffer;
 const risk=Math.abs(trigger-invalidation);
 const ahead=buy?trigger-a.price:a.price-trigger;
 if(!(risk>=atr*.55&&risk<=atr*6&&
    ahead>Math.max(a.price*.000001,atr*.04)&&
    ahead<=risk*.95&&
    (buy?a.price>invalidation:a.price<invalidation)))return null;
 return {side,trigger:Number(trigger.toFixed(4)),
   invalidation:Number(invalidation.toFixed(4)),
   asOf:issued,evidence:'CLOSED_M1_PULLBACK_RECLAIM',
   tradeAuthorized:false};
}
