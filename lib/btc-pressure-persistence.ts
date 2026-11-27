/** Three non-overlapping execution windows. A large imbalance is not
 * necessarily directional pressure: require persistence and price response.
 * All features are same-venue, timestamped, observed before the forecast. */
type Side='BUY'|'SELL'|'WAIT';
type Print={id:number;time:number;price:number;size:number;aggressor:'BUY'|'SELL'};
type Window={from:number;to:number;count:number;delta:number;volume:number;dominantShare:number;
 first:number;last:number;low:number;high:number};
export type BtcPressureEvidence={asOf:number;windows:Window[];complete:boolean};
export type PressureReading={kind:'UNAVAILABLE'|'BALANCED'|'TRANSIENT'|'PERSISTENT'|'ABSORPTION';side:Side;asOf:number|null;level:number|null;reason:string};
export function btcPressureEvidence(raw:readonly Print[],now:number):BtcPressureEvidence|null{
 const seen=new Map<number,Print>(),bad=new Set<number>();
 for(const p of raw){
   if(!Number.isSafeInteger(p.id)||bad.has(p.id)||!Number.isFinite(p.time)||p.time>now||now-p.time>20000||
     !Number.isFinite(p.price)||p.price<=0||!Number.isFinite(p.size)||p.size<=0||!['BUY','SELL'].includes(p.aggressor))continue;
   const old=seen.get(p.id);
   if(old&&(old.time!==p.time||old.price!==p.price||old.size!==p.size||old.aggressor!==p.aggressor)){seen.delete(p.id);bad.add(p.id);continue;}
   seen.set(p.id,p);
 }
 const rows=[...seen.values()].sort((a,b)=>a.time-b.time||a.id-b.id),asOf=rows.at(-1)?.time;
 if(asOf==null||now-asOf>5000)return null;
 const windows:Window[]=[];
 for(let i=0;i<3;i++){
   const from=asOf-(3-i)*5000,to=from+5000;
   const a=rows.filter(p=>p.time>from&&p.time<=to);
   if(a.length<5||a.at(-1)!.time-a[0].time<1000)return {asOf,windows,complete:false};
   const volume=a.reduce((s,p)=>s+p.size,0),delta=100*a.reduce((s,p)=>s+(p.aggressor==='BUY'?p.size:-p.size),0)/volume;
   windows.push({from:a[0].time,to:a.at(-1)!.time,count:a.length,volume,delta,
     dominantShare:Math.max(...a.map(p=>p.size))/volume,first:a[0].price,last:a.at(-1)!.price,
     low:Math.min(...a.map(p=>p.price)),high:Math.max(...a.map(p=>p.price))});
 }
 return {asOf,windows,complete:true};
}
export function classifyBtcPressure(e:BtcPressureEvidence|null|undefined,now:number,atr:number,price:number):PressureReading{
 const out=(kind:PressureReading['kind'],side:Side,reason:string,level:number|null=null):PressureReading=>
   ({kind,side,reason,level,asOf:e?.asOf??null});
 if(!e?.complete||e.windows.length!==3||!Number.isFinite(e.asOf)||e.asOf>now||now-e.asOf>5000||
   !Number.isFinite(atr)||atr<=0||!Number.isFinite(price)||price<=0)return out('UNAVAILABLE','WAIT','incomplete or stale execution windows');
 const [a,b,c]=e.windows;
 if(e.windows.some((w,i)=>![w.from,w.to,w.delta,w.volume,w.dominantShare,w.first,w.last,w.low,w.high].every(Number.isFinite)||
   w.from>w.to||w.to>e.asOf||e.asOf-w.from>15000||w.to-w.from<1000||w.count<5||w.volume<=0||
   Math.abs(w.delta)>100||w.dominantShare<0||w.dominantShare>1||w.low<=0||w.low>Math.min(w.first,w.last)||w.high<Math.max(w.first,w.last)||
   (i>0&&w.from<=e.windows[i-1].to))||c.to!==e.asOf||Math.abs(c.last-price)>atr*.2)
   return out('UNAVAILABLE','WAIT','invalid or mismatched tape');
 if(e.windows.some(w=>w.dominantShare>.65))return out('TRANSIENT','WAIT','one print dominates a window');
 const direction=(d:number):Side=>d>=25?'BUY':d<=-25?'SELL':'WAIT';
 const first=direction(a.delta),second=direction(b.delta),last=direction(c.delta);
 // Absorption hypothesis: pressure persists into an extreme but fails to
 // advance price, then actual aggressive flow flips and price reclaims.
 if(first!=='WAIT'&&first===second&&last!=='WAIT'&&last!==first){
   const sign=last==='BUY'?1:-1;
   const extreme=last==='BUY'?Math.min(a.low,b.low):Math.max(a.high,b.high);
   const advance=-sign*(b.last-a.first);
   const recoil=sign*(c.last-extreme);
   const reclaim=sign*(c.last-b.last);
   const held=last==='BUY'?c.low>=extreme-atr*.04:c.high<=extreme+atr*.04;
   if(advance<=atr*.20&&recoil>=atr*.16&&recoil<=atr*.70&&reclaim>=atr*.08&&held)
     return out('ABSORPTION',last,'persistent opposite executions stalled, then flow flipped and price reclaimed',extreme);
 }
 if(last!=='WAIT'&&last===second&&last===first){
   const sign=last==='BUY'?1:-1;
   const progress=sign*(c.last-a.first),recent=sign*(c.last-b.last);
   if(progress>=atr*.06&&progress<=atr*.85&&recent>=-atr*.04)
     return out('PERSISTENT',last,'three separate execution windows agree and price responds');
 }
 if(last!=='WAIT'||first!=='WAIT'||second!=='WAIT')return out('TRANSIENT','WAIT','imbalance lacks persistent price response');
 return out('BALANCED','WAIT','no sustained aggressive direction');
}
