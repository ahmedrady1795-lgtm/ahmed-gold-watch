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
 leader:'Bybit'|'Binance'|null;leadPairs:number;actionable:false;heatmaps?:GoldDepthHeatmap[];preparation?:GoldDepthPreparation[];
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

/** Actual sampled depth at native perpetual prices, not XAUUSD broker levels.
 * Missing intervals are blank. Quantity changes cannot identify cancellation
 * versus fills; public aggregate L2 cannot prove iceberg orders. */
export type DepthLevel={price:number;qty:number;side:'BID'|'ASK'};
export type DepthFrame={at:number;mid:number;levels:DepthLevel[]};
export type GoldDepthHeatmap={source:string;asOf:number;frames:DepthFrame[];
 bidWall:number;askWall:number;bidReduced:number;askReduced:number;
 bidAdded:number;askAdded:number;changeKnown:boolean;actionable:false};
export function recordDepthFrame(history:DepthFrame[],raw:any,at:number,now:number):boolean{
 const book=observeBook(raw,at,now);
 if(!book||history.length&&at<=history.at(-1)!.at)return false;
 const levels:DepthLevel[]=[];
 for(const [rows,side] of [[raw.bids,'BID'],[raw.asks,'ASK']] as const){
   for(const r of rows.slice(0,20))levels.push({price:Number(r[0]),qty:Number(r[1]),side});
 }
 history.push({at,mid:(book.bid+book.ask)/2,levels});
 while(history.length>42||history.length&&now-history[0].at>120000)history.shift();
 return true;
}
export function readDepthHeatmap(history:readonly DepthFrame[],source:string,now:number):GoldDepthHeatmap|null{
 if(!['Bybit XAUUSDT perpetual','Binance XAUUSDT perpetual'].includes(source))return null;
 const frames=history.filter(f=>f.at<=now&&now-f.at<=120000).slice(-42);
 const last=frames.at(-1);
 if(!last||now-last.at>8000)return null;
 const strongest=(side:DepthLevel['side'])=>last.levels.filter(r=>r.side===side)
   .reduce((a,b)=>a.qty>=b.qty?a:b).price;
 const prev=frames.at(-2);
 let bidReduced=0,askReduced=0,bidAdded=0,askAdded=0;
 const changeKnown=Boolean(prev&&last.at>prev.at&&last.at-prev.at<=10000);
 if(changeKnown&&prev){
   for(const side of ['BID','ASK'] as const){
     const old=prev.levels.filter(l=>l.side===side),cur=last.levels.filter(l=>l.side===side);
     const lo=Math.max(Math.min(...old.map(l=>l.price)),Math.min(...cur.map(l=>l.price)));
     const hi=Math.min(Math.max(...old.map(l=>l.price)),Math.max(...cur.map(l=>l.price)));
     const levels=new Set([...old,...cur].map(l=>l.price).filter(p=>p>=lo&&p<=hi));
     let reduced=0,added=0;
     for(const p of levels){
       const diff=(cur.find(l=>l.price===p)?.qty??0)-(old.find(l=>l.price===p)?.qty??0);
       if(diff<0)reduced-=diff;else added+=diff;
     }
     if(side==='BID'){bidReduced=reduced;bidAdded=added;}else{askReduced=reduced;askAdded=added;}
   }
 }
 return {source,asOf:last.at,frames,bidWall:strongest('BID'),askWall:strongest('ASK'),
  bidReduced,askReduced,bidAdded,askAdded,changeKnown,actionable:false};
}

// Prospective same-venue absorption hypothesis: repeated visible size at
// fixed prices while opposite executions occur and the mid barely moves.
// Aggregate L2 cannot determine order identity, hidden volume or cancellations.
export type GoldDepthPreparation={source:string;asOf:number;side:'BUY'|'SELL';samples:number;
 spanMs:number;level:number;deltaPct:number;priceChangeBps:number;actionable:false};
export function observeGoldDepthPreparation(history:readonly DepthFrame[],flow:PaxgFlow|null,now:number):GoldDepthPreparation|null{
 if(!flow||!['Bybit XAUUSDT perpetual','Binance XAUUSDT perpetual'].includes(flow.source||'')||
   flow.side==='UNAVAILABLE'||!Number.isFinite(flow.observedAt)||flow.observedAt>now||now-flow.observedAt>10000||
   !Number.isFinite(flow.tradeAt)||flow.tradeAt>flow.observedAt||now-flow.tradeAt>8000||
   flow.count<12||!Number.isFinite(flow.tradeDeltaPct)||Math.abs(flow.tradeDeltaPct!)<40||Math.abs(flow.tradeDeltaPct!)>100)return null;
 const frames=history.filter(f=>f.at<=now&&now-f.at<=20000).slice(-5);
 if(frames.length<3)return null;
 const first=frames[0],last=frames.at(-1)!;
 const span=last.at-first.at;
 if(now-last.at>5000||span<6000||span>18000||Math.abs(last.at-flow.tradeAt)>8000||
   frames.some((f,i)=>i>0&&(f.at<=frames[i-1].at||f.at-frames[i-1].at>7000)))return null;
 const buy=flow.tradeDeltaPct!<0,side=buy?'BID':'ASK',sign=buy?1:-1;
 const change=10000*(last.mid/first.mid-1);
 if(!Number.isFinite(change)||sign*change<-.6||Math.abs(change)>3)return null;
 const initial=first.levels.filter(l=>l.side===side);
 const sorted=initial.map(l=>l.qty).sort((a,b)=>a-b);
 const median=sorted[Math.floor(sorted.length/2)];
 const persistent=initial.filter(l=>{
   if(l.qty<median*1.5||Math.abs(l.price/first.mid-1)>.0015)return false;
   const quantities=frames.map(f=>f.levels.find(x=>x.side===side&&x.price===l.price)?.qty);
   if(quantities.some(q=>q==null||!Number.isFinite(q)||q!<=0))return false;
   const q=quantities as number[];
   const replenished=q.some((v,i)=>i>=2&&v>=q[i-1]*1.2&&q[i-1]<=q[0]*.9);
   return replenished&&q.at(-1)!>=q[0]*.9&&q.every(v=>v>=q[0]*.4);
 }).sort((a,b)=>b.qty-a.qty);
 if(!persistent.length)return null;
 return {source:flow.source!,asOf:last.at,side:buy?'BUY':'SELL',samples:frames.length,
   spanMs:span,level:persistent[0].price,deltaPct:flow.tradeDeltaPct!,priceChangeBps:change,actionable:false};
}


/** Independent venue refresh slots. Never let a slower venue hold a fresh
 * sample hostage. A failed refresh cannot advance a venue's trade timestamp. */
export function independentFlowSlot<T>(sample:()=>Promise<T|null>,
 fresh:(value:T,now:number)=>boolean,interval:number){
 let last:T|null=null,attempt=-Infinity,pending:Promise<T|null>|null=null;
 const read=(now:number)=>last!==null&&fresh(last,now)?last:null;
 const refresh=(now:number)=>{
   if(pending)return pending;
   if(now-attempt<interval)return null;
   attempt=now;
   pending=Promise.resolve().then(sample).then(value=>{
     if(value!==null&&fresh(value,Date.now()))last=value;
     return read(Date.now());
   }).catch(()=>read(Date.now())).finally(()=>{pending=null;});
   return pending;
 };
 return {read,refresh};
}
export async function collectIndependentFlow<T>(slots:readonly ReturnType<typeof independentFlowSlot<T>>[]){
 const now=Date.now();
 const jobs=slots.map(slot=>slot.refresh(now)).filter((p):p is Promise<T|null>=>p!==null);
 if(!slots.some(slot=>slot.read(now)!==null)&&jobs.length){
   // A first valid result is sufficient. Other venues continue refreshing.
   await Promise.any(jobs.map(p=>p.then(v=>{
     if(v===null)throw Error('No fresh sample');return v;
   }))).catch(()=>null);
 }
 const at=Date.now();
 return slots.map(slot=>slot.read(at));
}
