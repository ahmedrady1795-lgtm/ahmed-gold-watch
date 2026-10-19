/**
 * Exchange L2 snapshots are public displayed liquidity, NOT the identity of
 * any market maker. Repeated snapshots can suggest a pull/refill, never prove
 * cancellation, spoofing, hidden iceberg volume or future direction.
 */
export type L2BookSample={
 at:number;bid:number;ask:number;bidUsd:number;askUsd:number;
 bidWallPrice:number|null;askWallPrice:number|null
};
export type OrderFlowMicroEvidence={
 ready:boolean;status:'WARMUP'|'STALE'|'OBSERVING'|'POSSIBLE_PULL';
 snapshots:number;spanSeconds:number;spreadBps:number|null;
 bidDepthUsd:number;askDepthUsd:number;imbalancePct:number;
 bidWall:number|null;askWall:number|null;
 bidPersistent:boolean;askPersistent:boolean;
 possibleBidPull:boolean;possibleAskPull:boolean;reason:string;
 actionable:false;
};
type Side='BUY'|'SELL';
export function inspectL2Book(a:{
 bids:readonly [number,number][];asks:readonly [number,number][];
 at:number
}):L2BookSample|null{
 const valid=(rows:readonly [number,number][],descending:boolean)=>
   rows.filter(([price,size])=>Number.isFinite(price)&&price>0&&
     Number.isFinite(size)&&size>0)
    .sort((a,b)=>descending?b[0]-a[0]:a[0]-b[0]);
 const bids=valid(a.bids,true),asks=valid(a.asks,false);
 const bid=bids[0]?.[0],ask=asks[0]?.[0];
 if(!bid||!ask||bid>=ask||!Number.isFinite(a.at))return null;
 const mid=(bid+ask)/2;
 if((ask-bid)/mid*10000>12)return null;
 const nearby=(rows:[number,number][])=>rows.filter(([p])=>
   Math.abs(p-mid)/mid<=.0015).slice(0,140);
 const b=nearby(bids),s=nearby(asks);
 if(b.length<3||s.length<3)return null;
 const sum=(rows:[number,number][])=>rows.reduce((n,[p,size])=>n+p*size,0);
 const wall=(rows:[number,number][])=>{
  if(rows.length<5)return null;
  const avg=sum(rows)/rows.length;
  const top=[...rows].sort((a,b)=>b[0]*b[1]-a[0]*a[1])[0];
  return top[0]*top[1]>=Math.max(35000,avg*2.6)?top[0]:null;
 };
 return {at:a.at,bid,ask,bidUsd:sum(b),askUsd:sum(s),
  bidWallPrice:wall(b),askWallPrice:wall(s)};
}
export function assessL2Persistence(input:{
 snapshots:readonly L2BookSample[];now:number;
 executed?:readonly {at:number;price:number;size:number;
 aggressor:Side}[];
}):OrderFlowMicroEvidence{
 const result=(status:OrderFlowMicroEvidence['status'],reason:string,
  extras:Partial<OrderFlowMicroEvidence>={}):OrderFlowMicroEvidence=>({
    ready:false,status,reason,snapshots:0,spanSeconds:0,spreadBps:null,
    bidDepthUsd:0,askDepthUsd:0,imbalancePct:0,
    bidWall:null,askWall:null,bidPersistent:false,askPersistent:false,
    possibleBidPull:false,possibleAskPull:false,actionable:false,...extras
  });
 const now=input.now;
 const recent=input.snapshots.filter(s=>s&&Number.isFinite(s.at)&&
   now-s.at>=0&&now-s.at<=15000&&s.bid>0&&s.ask>s.bid&&
   Number.isFinite(s.bidUsd)&&s.bidUsd>=0&&
   Number.isFinite(s.askUsd)&&s.askUsd>=0)
   .sort((a,b)=>a.at-b.at);
 const latest=recent.at(-1);
 if(!latest||now-latest.at>4000)return result('STALE','دفتر أوامر متأخر');
 const span=recent.length>1?(latest.at-recent[0].at)/1000:0;
 const spread=(latest.ask-latest.bid)/((latest.ask+latest.bid)/2)*10000;
 const baseline={snapshots:recent.length,spanSeconds:span,
  spreadBps:Number(spread.toFixed(2)),bidDepthUsd:Math.round(latest.bidUsd),
  askDepthUsd:Math.round(latest.askUsd),
  imbalancePct:latest.bidUsd+latest.askUsd?
    Number(((latest.bidUsd-latest.askUsd)/(latest.bidUsd+latest.askUsd)*100).toFixed(1)):0,
  bidWall:latest.bidWallPrice,askWall:latest.askWallPrice};
 if(spread>12)return result('STALE','سبريد غير طبيعي',baseline);
 if(recent.length<5||span<6||
    recent.slice(1).some((s,i)=>s.at-recent[i].at>4500))
   return result('WARMUP','نحتاج عينات عمق مستمرة لست ثوانٍ',baseline);
 // Price levels and volumes can change through fills, cancels or new orders.
 // A disappearance is only a POSSIBLE_PULL after a flat-book comparison.
 const prior=recent.slice(0,Math.max(1,recent.length-2));
 const reference=prior[0],mid0=(reference.ask+reference.bid)/2,
   mid1=(latest.ask+latest.bid)/2,stable=Math.abs(mid1-mid0)/mid0*10000<=3;
 const held=(key:'bidWallPrice'|'askWallPrice')=>{
   const level=latest[key];if(level==null)return false;
   const tolerance=Math.max(.01,level*.00001);
   return prior.filter(s=>s[key]!=null&&Math.abs(s[key]!-level)<=tolerance)
    .length>=3;
 };
 const executed=input.executed?.filter(t=>t&&Number.isFinite(t.at)&&
    t.at>=reference.at&&t.at<=now&&t.price>0&&t.size>0)||[];
 const had=(side:'bid'|'ask')=>side==='bid'?reference.bidUsd:reference.askUsd;
 const has=(side:'bid'|'ask')=>side==='bid'?latest.bidUsd:latest.askUsd;
 const expectedFills=(side:'bid'|'ask')=>executed.filter(t=>
   (side==='bid'?t.aggressor==='SELL':t.aggressor==='BUY')&&
   Math.abs(t.price-mid1)/mid1<=.0015)
   .reduce((n,t)=>n+t.price*t.size,0);
 const pull=(side:'bid'|'ask')=>{
   const prev=had(side),cur=has(side),drop=prev-cur;
   return stable&&prev>=120000&&cur<=prev*.48&&
     drop>Math.max(55000,expectedFills(side)*2.5)&&
     recent.slice(-2).every(s=>(side==='bid'?s.bidUsd:s.askUsd)<prev*.60);
 };
 const possibleBidPull=pull('bid'),possibleAskPull=pull('ask');
 return result(possibleBidPull||possibleAskPull?'POSSIBLE_PULL':'OBSERVING',
  possibleBidPull||possibleAskPull?
   'انخفاض عمق مع سعر شبه ثابت؛ احتمال إلغاء أو تنفيذ غير مرصود، ليس إثبات تلاعب':
   'عمق Coinbase المرصود والصفقات المنفذة من نفس المنصة فقط',
  {...baseline,ready:true,bidPersistent:held('bidWallPrice'),
   askPersistent:held('askWallPrice'),possibleBidPull,possibleAskPull});
}
