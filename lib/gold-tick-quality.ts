/** Gold microstructure must only use timestamped, actually new provider ticks. 
 * Fetch time alone does not make a cached quote live. */
export type GoldPulse={price:number;sourceTime:number;bid:number|null;ask:number|null};
export function acceptGoldPulse(q:any,now:number,previous:GoldPulse|null=null):GoldPulse|null{
  const price=Number(q?.price),sourceTime=Number(q?.sourceTime),fetchedAt=Number(q?.fetchedAt);
  if(!Number.isFinite(price)||price<=0||
    !Number.isFinite(sourceTime)||sourceTime<=0||
    !Number.isFinite(fetchedAt)||fetchedAt<=0)return null;
  // A delayed quote can be usable when only a few seconds old, but never
  // substitute 'recently fetched' for 'recently observed by the source'.
  if(q?.status!=='live'&&q?.status!=='delayed')return null;
  if(sourceTime>now+2000||now-sourceTime>10000||
    fetchedAt>now+2000||now-fetchedAt>10000)return null;
  if(previous&&previous.price===price&&previous.sourceTime===sourceTime)return null;
  const bid=Number(q?.bid),ask=Number(q?.ask);
  return {price,sourceTime,bid:Number.isFinite(bid)&&bid>0?bid:null,
    ask:Number.isFinite(ask)&&ask>0?ask:null};
}
