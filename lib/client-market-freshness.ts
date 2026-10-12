/** Closed-fail validation for browser-side market streams.
 * A packet's arrival time is NEVER proof that the market quote is current. */
export function sourceTimestamp(value:unknown):number|null {
  if(value==null||value==='')return null;
  if(typeof value==='number'||/^\d{10,13}$/.test(String(value))){
    const n=Number(value);
    if(!Number.isFinite(n)||n<=0)return null;
    const ms=n<1e11?n*1000:n;
    return Number.isFinite(ms)?ms:null;
  }
  if(typeof value!=='string')return null;
  const at=Date.parse(value);
  return Number.isFinite(at)&&at>0?at:null;
}
export function validSourceTime(at:number|null,now:number,maxAgeMs=10000){
  return at!=null&&at>0&&at<=now+2000&&now-at>=-2000&&now-at<=maxAgeMs;
}
export function acceptGoldStreamPacket(tick:any,now:number) {
  const at=sourceTimestamp(tick?.timestamp??tick?.time??tick?.lastQuoteAt);
  const marketState=String(tick?.marketState??tick?.status??'').toLowerCase();
  if(!validSourceTime(at,now)||tick?.stale===true||
    ['closed','stale','delayed','halted','unavailable'].includes(marketState))return null;
  const bid=Number(tick?.bid),ask=Number(tick?.ask),mid=Number(tick?.mid);
  const price=Number.isFinite(mid)&&mid>0?mid:
    Number.isFinite(bid)&&Number.isFinite(ask)&&bid>0&&ask>=bid?(bid+ask)/2:
    Number(tick?.price);
  if(!Number.isFinite(price)||price<=0)return null;
  return {price,at:at!,bid:Number.isFinite(bid)&&bid>0?bid:null,
    ask:Number.isFinite(ask)&&ask>0?ask:null};
}
