/**
 * Conservative venue-evidence rules for the sniper's M1/M5 confirmation mesh.
 * A daily ticker change, last trade inside the spread, or a funding-rate
 * extreme is NOT an independently validated short-term directional signal.
 */
type Side='BUY'|'SELL'|'WAIT';
type Asset='GOLD'|'BTC';
type Probe={id:string;category:string;ok:boolean;value:number|null;unit:string|null;side:Side;score:number;quality:number};
const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
export function freshEvidence(data:any,now:number,maxAgeMs=8000):boolean{
  if(!data||data.available===false||data.ok===false)return false;
  const raw=Number(data.sourceAt??data.checkedAt??data.sourceTime??data.receivedAt??NaN);
  if(!Number.isFinite(raw)||raw<=0||!Number.isFinite(now))return false;
  const at=raw>=1e9&&raw<1e11?raw*1000:raw;
  return at<=now+2000&&now-at<=maxAgeMs;
}
export function spotPriceConsensus(asset:Asset,probes:Probe[]){
  // Do not mix futures with spot, or USDT with USD. Two USD spot
  // references are a cross-check, not an execution-grade quote.
  const allowed=new Set(asset==='GOLD'?['biquote_xau','goldprice_spot']:['coinbase_ticker','kraken_ticker']);
  const values=probes.filter(p=>p.ok&&p.category==='PRICE'&&allowed.has(p.id)&&
    p.unit==='USD'&&finite(p.value)&&Number(p.value)>0).map(p=>Number(p.value)).sort((a,b)=>a-b);
  if(!values.length)return {mid:null as number|null,spreadBps:null as number|null,sourceCount:0};
  const n=values.length,mid=n%2?values[(n-1)/2]:(values[n/2-1]+values[n/2])/2;
  const spreadBps=n>1?(values[n-1]-values[0])/mid*10000:null;
  return {mid,spreadBps,sourceCount:n};
}
export function independentToolConsensus(probes:Probe[]){
  // The lead and liquidity models reuse order-flow evidence, so counting
  // both as independent confirmation would silently double confidence.
  const families=new Map<string,{side:Side;power:number}>();
  for(const p of probes){
    if(!p.ok||(p.side!=='BUY'&&p.side!=='SELL')||!finite(p.score)||!finite(p.quality)||
      p.score<=0||p.quality<=0)continue;
    const family=p.id==='market_lead'||p.id==='liquidity_engine'?'FLOW':
      p.id==='web_scout'?'WEB':p.category;
    const power=p.score*Math.min(100,p.quality)/100;
    if(power>(families.get(family)?.power??0))families.set(family,{side:p.side,power});
  }
  let buy=0,sell=0;
  for(const f of families.values()){if(f.side==='BUY')buy+=f.power;else sell+=f.power;}
  const total=buy+sell,edge=total?Math.abs(buy-sell)/total*100:0;
  const agree=total?Math.max(buy,sell)/total*100:0;
  const winner:Side=buy>sell?'BUY':sell>buy?'SELL':'WAIT';
  return {buy,sell,edge,agreement:agree,independentVotes:families.size,
    side:families.size>=2&&edge>=12?winner:'WAIT' as Side};
}
