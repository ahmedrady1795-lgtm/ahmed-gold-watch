/** Finite public gold perpetual samples, not COMEX or global capital flows.
 * Separate venue units; never add contracts across venues. */
import type {PaxgFlow} from './paxg-flow';
export type FlowPrint={id:string;at:number;qty:number;buy:boolean};
export type BookObservation={at:number;bid:number;ask:number;bidWall:number;askWall:number};
export type VenueHistory={
 prints:Map<string,FlowPrint>;book:BookObservation|null;
};
export type VenueEvidence={source:string;asOf:number;count:number;spanSeconds:number;
 sampledCvd60s:number;buy60s:number;sell60s:number;
 bidWallShift:number|null;askWallShift:number|null;mid:number|null;bookAt:number|null;
};
export type LeadPoint={at:number;a:number;b:number};
export type GoldCrossFlow={
 venues:VenueEvidence[];consensus:'BUY'|'SELL'|'CONFLICT'|'INSUFFICIENT';
 leader:'Bybit'|'Binance'|null;leadPairs:number;actionable:false;
};
export const newVenueHistory=():VenueHistory=>({prints:new Map(),book:null});
export function updateVenueHistory(state:VenueHistory,source:string,now:number,
 rows:readonly FlowPrint[],book:BookObservation|null):VenueEvidence{
 for(const [id,p] of state.prints)if(now-p.at>60000||p.at>now)state.prints.delete(id);
 for(const p of rows){
   if(typeof p.id!=='string'||!p.id||!Number.isSafeInteger(p.at)||p.at<=0||
      p.at>now||now-p.at>60000||!Number.isFinite(p.qty)||p.qty<=0||
      typeof p.buy!=='boolean'||state.prints.has(p.id))continue;
   state.prints.set(p.id,p);
 }
 // Bound memory without pretending coverage is complete.
 while(state.prints.size>10000)state.prints.delete(state.prints.keys().next().value!);
 let buy=0,sell=0,first=Infinity,last=0;
 for(const p of state.prints.values()){
   if(p.buy)buy+=p.qty;else sell+=p.qty;
   first=Math.min(first,p.at);last=Math.max(last,p.at);
 }
 let bidWallShift:number|null=null,askWallShift:number|null=null;
 const prior=state.book;
 if(book&&Number.isSafeInteger(book.at)&&book.at<=now&&now-book.at<=8000&&
   [book.bid,book.ask,book.bidWall,book.askWall].every(v=>Number.isFinite(v)&&v>0)&&
   book.bid<book.ask&&book.bidWall<=book.bid&&book.askWall>=book.ask){
   if(prior&&book.at>prior.at&&book.at-prior.at<=15000){
     bidWallShift=book.bidWall-prior.bidWall;askWallShift=book.askWall-prior.askWall;
   }
   if(!prior||book.at>prior.at)state.book=book;
 }else book=null;
 return {source,asOf:last,count:state.prints.size,spanSeconds:last?(last-first)/1000:0,
   sampledCvd60s:buy-sell,buy60s:buy,sell60s:sell,bidWallShift,askWallShift,
   mid:book?(book.bid+book.ask)/2:null,bookAt:book?.at??null};
}
export function observeBook(raw:any,at:number,now:number):BookObservation|null{
 const side=(rows:any[],descending:boolean)=>{
   if(!Array.isArray(rows)||rows.length<5)return null;
   let last=descending?Infinity:0,wall=0,max=0;
   const top=Number(rows[0]?.[0]);
   for(const row of rows.slice(0,20)){
     const price=Number(row?.[0]),qty=Number(row?.[1]);
     if(!Number.isFinite(price)||price<=0||!Number.isFinite(qty)||qty<=0||
       (descending?price>=last:price<=last))return null;
     last=price;if(qty>max){max=qty;wall=price;}
   }
   return {top,wall};
 };
 const b=side(raw?.bids,true),a=side(raw?.asks,false);
 if(!b||!a||b.top>=a.top||!Number.isSafeInteger(at)||at>now||now-at>8000)return null;
 return {at,bid:b.top,ask:a.top,bidWall:b.wall,askWall:a.wall};
}
export function compareGoldVenues(a:PaxgFlow|null,b:PaxgFlow|null,now:number){
 const side=(f:PaxgFlow|null)=>{
   if(!f||f.side==='UNAVAILABLE'||f.count<8||f.tradeAt>now||now-f.tradeAt>8000||
      f.observedAt>now||now-f.observedAt>12000||
      !Number.isFinite(f.tradeDeltaPct)||Math.abs(f.tradeDeltaPct!)>100)return null;
   return f.tradeDeltaPct!>=35?'BUY':f.tradeDeltaPct!<=-35?'SELL':null;
 };
 const x=side(a),y=side(b);
 return x&&y?(x===y?x:'CONFLICT'):'INSUFFICIENT';
}
function corr(a:number[],b:number[]){
 const n=a.length;if(n<20||n!==b.length)return null;
 const ma=a.reduce((s,v)=>s+v,0)/n,mb=b.reduce((s,v)=>s+v,0)/n;
 let x=0,y=0,xy=0;
 for(let i=0;i<n;i++){const u=a[i]-ma,v=b[i]-mb;x+=u*u;y+=v*v;xy+=u*v;}
 return x>0&&y>0?xy/Math.sqrt(x*y):null;
}
/** Exploratory 5-second cross-perpetual lead/lag. No claim of leading XAUUSD.
 * Equal contiguous intervals only, compare lagged with synchronous correlation. */
export function observeLeadLag(points:readonly LeadPoint[],now:number){
 const p=points.filter(v=>v.at<=now&&now-v.at<=300000).slice(-61);
 const a:number[]=[],b:number[]=[],aa:number[]=[],bb:number[]=[],ab:number[]=[],ba:number[]=[];
 let prev:{a:number;b:number}|null=null;
 for(let i=1;i<p.length;i++){
   const x=p[i-1],y=p[i];
   if(y.at-x.at!==5000||![x.a,x.b,y.a,y.b].every(v=>Number.isFinite(v)&&v>0)){prev=null;continue;}
   const u=Math.log(y.a/x.a),v=Math.log(y.b/x.b);
   if(prev){a.push(prev.a);b.push(prev.b);aa.push(u);bb.push(v);ab.push(u);ba.push(v);}
   prev={a:u,b:v};
 }
 const sync=corr(aa,bb),forward=corr(a,bb),reverse=corr(b,aa);
 let leader:'Bybit'|'Binance'|null=null;
 if(sync!=null&&forward!=null&&reverse!=null){
   if(forward>=.65&&forward>sync+.15&&forward>reverse+.2)leader='Bybit';
   else if(reverse>=.65&&reverse>sync+.15&&reverse>forward+.2)leader='Binance';
 }
 return {leader,leadPairs:a.length};
}
