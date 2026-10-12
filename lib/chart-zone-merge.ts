// Fold visually overlapping levels without changing the trading model or its targets.
export type DisplayZone={sources?:string[];touches?:number;confirmedAt?:number;key:string;kind:string;label:string;low:number;high:number;price:number};
const grouping=(kind:string)=>kind==='BUY_REBOUND'||kind==='DEMAND'?'BUY':
  kind==='SELL_REBOUND'||kind==='SUPPLY'?'SELL':kind;

export function collapseChartZones<T extends DisplayZone>(zones:T[],reference:number|null,maxPerSide=2):T[]{
  const fixed:T[]=[];
  const groups=new Map<string,T[]>();
  for(const z of zones){
    if(!Number.isFinite(z.low)||!Number.isFinite(z.high)||z.low>z.high||
      !Number.isFinite(z.price)||z.price<=0)continue;
    if(z.kind==='TARGET'||z.kind==='STOP'){fixed.push(z);continue;}
    const group=grouping(z.kind),items=groups.get(group)||[];
    // A bridging zone can join several existing zones. Merge transitively,
    // regardless of arrival order, before applying the per-side limit.
    let combined={...z,sources:[...(z.sources||[])]},remaining=items.slice(),changed=true;
    while(changed){
      changed=false;
      remaining=remaining.filter(q=>{
        const tolerance=Math.max(.001,Math.min(q.price,combined.price)*.00008);
        if(combined.low>q.high+tolerance||combined.high<q.low-tolerance)return true;
        const low=Math.min(q.low,combined.low),high=Math.max(q.high,combined.high);
        combined={...combined,sources:[...new Set([...(combined.sources||[]),...(q.sources||[])])],
          touches:Math.max(combined.touches||0,q.touches||0),confirmedAt:Math.max(combined.confirmedAt||0,q.confirmedAt||0),key:[q.key,combined.key].sort().join('+'),low,high,price:(low+high)/2,
          label:group==='BUY'?'طلب / ارتداد شراء':group==='SELL'?'عرض / ارتداد بيع':combined.label};
        changed=true;return false;
      });
    }
    items.splice(0,items.length,...remaining,combined);
    groups.set(group,items);
  }
  const merged=[...groups.values()].flatMap(items=>
    items.sort((a,b)=>compareZoneEvidence(a,b,reference))
      .slice(0,Math.max(1,maxPerSide)));
  return [...fixed,...merged];
}

export function findOpposingOverlap<T extends DisplayZone>(
  zones:T[],reference:number|null
):{low:number;high:number;buy:T;sell:T}|null{
  const buy=zones.filter(z=>grouping(z.kind)==='BUY');
  const sell=zones.filter(z=>grouping(z.kind)==='SELL');
  const overlaps:{low:number;high:number;buy:T;sell:T}[]=[];
  for(const b of buy)for(const s of sell){
    const low=Math.max(b.low,s.low),high=Math.min(b.high,s.high);
    if(low<=high)overlaps.push({low,high,buy:b,sell:s});
  }
  overlaps.sort((a,b)=>Math.abs((a.low+a.high)/2-(reference??(a.low+a.high)/2))-
    Math.abs((b.low+b.high)/2-(reference??(b.low+b.high)/2)));
  return overlaps[0]??null;
}

// Relative display priority, not a probability or measured institutional liquidity.
export function compareZoneEvidence(a:DisplayZone,b:DisplayZone,reference:number|null){
  const evidence=(z:DisplayZone)=>(z.confirmedAt?3:0)+Math.min(new Set(z.sources||[]).size,3);
  return evidence(b)-evidence(a)||
    Math.abs(a.price-(reference??a.price))-Math.abs(b.price-(reference??b.price))||
    (b.confirmedAt||0)-(a.confirmedAt||0)||a.key.localeCompare(b.key);
}
export function primaryLiquidityZone<T extends DisplayZone>(zones:T[],reference:number|null):T|null{
  return zones.filter(z=>['BUY_REBOUND','SELL_REBOUND','DEMAND','SUPPLY'].includes(z.kind))
    .sort((a,b)=>compareZoneEvidence(a,b,reference))[0]??null;
}
