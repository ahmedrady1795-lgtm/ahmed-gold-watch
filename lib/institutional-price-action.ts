/**
 * Closed-candle displacement -> BOS / possible CHoCH -> OB/FVG retest.
 * "Order block" describes a prior opposite candle, not verified bank orders.
 * This is price-action research and does NOT grant trading authority.
 */
export type StructureSide='BUY'|'SELL';
export type StructurePhase='AWAIT_RETEST'|'RETEST_CONFIRMED'|'INVALIDATED'|'EXPIRED';
export type StructureCandle={time:number;open:number;high:number;low:number;close:number;realVolume?:number;tickVolume?:number;volume?:number};
export type Zone={low:number;high:number};
export type DisplacementSetup={
  id:string;side:StructureSide;kind:'BOS'|'POSSIBLE_CHOCH';phase:StructurePhase;
  impulseAt:number;confirmedAt:number;retestAt:number|null;
  structuralLevel:number;impulseHigh:number;impulseLow:number;obAt:number;
  ob:Zone;fvg:Zone;entryZone:Zone;invalidation:number;
  bodyAtr:number;bodyRatio:number;participation:number|null;
  reason:string;reference:'CLOSED_M1_CANDLE_HEURISTIC';
};
export type StructureScan={ok:boolean;reason:string;setups:DisplacementSetup[];latestClosedAt:number|null};
const avg=(a:number[])=>a.reduce((s,n)=>s+n,0)/Math.max(1,a.length);
const round=(n:number)=>Number(n.toFixed(5));
const valid=(c:StructureCandle)=>c&&
  [c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&
  c.time>0&&c.time%60000===0&&c.low>0&&c.high>=Math.max(c.open,c.close)&&
  c.low<=Math.min(c.open,c.close);
export function detectDisplacementObFvg(raw:readonly StructureCandle[],now:number):StructureScan{
  const fail=(reason:string,at:number|null=null):StructureScan=>({ok:false,reason,setups:[],latestClosedAt:at});
  if(!Array.isArray(raw)||!Number.isFinite(now))return fail('INVALID_INPUT');
  const seen=new Map<number,StructureCandle>();
  for(const c of raw)if(valid(c)&&c.time+60000<=now)seen.set(c.time,c);
  const bars=[...seen.values()].sort((a,b)=>a.time-b.time).slice(-360);
  if(bars.length<75)return fail('INSUFFICIENT_M1');
  const lastClosed=bars.at(-1)!.time+60000;
  if(now-lastClosed>120000)return fail('STALE_M1',lastClosed);
  const last40=bars.slice(-40);
  if(last40.some((c,i)=>i>0&&c.time-last40[i-1].time!==60000))
    return fail('GAPPED_M1',lastClosed);
  const setups:DisplacementSetup[]=[];
  // All pivots, ATR and OB candidates are observable BEFORE impulse close.
  for(let i=Math.max(28,bars.length-58);i<bars.length;i++){
    const c=bars[i],prev=bars.slice(i-18,i);
    if(prev.length!==18||c.time-prev.at(-1)!.time!==60000||
      prev.some((p,k)=>k>0&&p.time-prev[k-1].time!==60000))continue;
    const avgRange=avg(prev.slice(-14).map(x=>x.high-x.low));
    if(avgRange<=0)continue;
    const body=Math.abs(c.close-c.open),range=c.high-c.low;
    if(body<avgRange*1.22||range<=0||body/range<.66)continue;
    const dir=c.close>c.open?1:-1;
    const side:StructureSide=dir===1?'BUY':'SELL';
    const top=Math.max(...prev.slice(-12).map(x=>x.high));
    const bottom=Math.min(...prev.slice(-12).map(x=>x.low));
    const level=dir===1?top:bottom;
    if((dir===1?c.close-top:bottom-c.close)<avgRange*.15)continue;
    const earlier=bars[i-2];
    if(!earlier||c.time-earlier.time!==120000)continue;
    const fvg:Zone=dir===1?{low:earlier.high,high:c.low}:
      {low:c.high,high:earlier.low};
    if(fvg.high-fvg.low<avgRange*.075)continue;
    const opp=prev.slice(-8).reverse().find(x=>
      dir===1?x.close<x.open:x.close>x.open);
    if(!opp)continue;
    const ob:Zone={low:opp.low,high:opp.high};
    if(ob.high<=ob.low)continue;
    if(dir===1?c.close<=ob.high:c.close>=ob.low)continue;
    // A far-away opposite candle is not the origin of THIS imbalance.
    // Allow overlap or a small gap, but reject arbitrary historical OBs.
    const obToFvg=dir===1?fvg.low-ob.high:ob.low-fvg.high;
    if(obToFvg>avgRange*.45||obToFvg<-avgRange*.65)continue;
    // The last opposite candle + a separate three-bar FVG are required.
    const previousTrend=prev.at(-1)!.close-prev[0].close;
    const kind:DisplacementSetup['kind']=dir*previousTrend<0?'POSSIBLE_CHOCH':'BOS';
    const volume=Number(c.realVolume??c.tickVolume??c.volume??0);
    const vs=prev.slice(-14).map(x=>Number(x.realVolume??x.tickVolume??x.volume??0)).filter(x=>x>0);
    const participation=volume>0&&vs.length>=10?round(volume/avg(vs)):null;
    const invalidation=round(dir===1?ob.low-avgRange*.12:ob.high+avgRange*.12);
    const entryZone={...fvg};
    let phase:StructurePhase='AWAIT_RETEST',retestAt:number|null=null;
    // A later candle must revisit the FVG and CLOSE in the expected
    // direction. Keep checking newer CLOSED candles even AFTER confirmation:
    // otherwise an invalidation could leave an old trade marked ARMED.
    // Only the first 18 M1 closes may produce a retest, not an unlimited wait.
    for(let j=i+1;j<bars.length;j++){
      const bar=bars[j],prior=bars[j-1];
      if(bar.time-prior.time!==60000){phase='EXPIRED';break;}
      if(dir===1?bar.close<=invalidation:bar.close>=invalidation){
        phase='INVALIDATED';retestAt=null;break;
      }
      if(phase==='RETEST_CONFIRMED')continue;
      if(j>i+18){phase='EXPIRED';break;}
      const touched=bar.low<=entryZone.high&&bar.high>=entryZone.low;
      const rejected=dir===1?bar.close>bar.open&&bar.close>entryZone.low:
        bar.close<bar.open&&bar.close<entryZone.high;
      if(touched&&rejected){phase='RETEST_CONFIRMED';retestAt=bar.time+60000;}
    }
    // Confirmation loses trade-readiness after the next M1; still visible
    // as completed historical research in the chart's inspection layer.
    const reason=phase==='RETEST_CONFIRMED'?'FVG + شمعة معاكسة سابقة + إعادة اختبار مغلق':
      phase==='AWAIT_RETEST'?'اندفاع وكسر جسم الشمعة مع FVG/OB؛ انتظار إعادة اختبار':
      phase==='INVALIDATED'?'كسر الإبطال الهيكلي؛ السيناريو ملغى':'انتهت صلاحية المنطقة دون اختبار مؤهل';
    setups.push({id:side+'-'+c.time,side,kind,phase,impulseAt:c.time,
      confirmedAt:c.time+60000,retestAt,structuralLevel:round(level),
      impulseHigh:round(c.high),impulseLow:round(c.low),obAt:opp.time,ob:{
        low:round(ob.low),high:round(ob.high)},fvg:{
        low:round(fvg.low),high:round(fvg.high)},
      entryZone:{low:round(entryZone.low),high:round(entryZone.high)},
      invalidation,bodyAtr:round(body/avgRange),bodyRatio:round(body/range),
      participation,reason,reference:'CLOSED_M1_CANDLE_HEURISTIC'});
  }
  return {ok:true,reason:'CLOSED_M1_CAUSAL',latestClosedAt:lastClosed,
    setups:setups.slice(-12)};
}
export function activeStructureRetest(result:StructureScan,now:number,ttlMs=90000){
  if(!result.ok||!Number.isFinite(now))return null;
  return result.setups.filter(x=>x.phase==='RETEST_CONFIRMED'&&
    x.retestAt!=null&&x.retestAt<=now&&now-x.retestAt<=ttlMs).at(-1)??null;
}
