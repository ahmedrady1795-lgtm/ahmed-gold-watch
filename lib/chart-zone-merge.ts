// Fold visually overlapping levels without changing the trading model or its targets.
export type DisplayZone={key:string;kind:string;label:string;low:number;high:number;price:number};
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
    const existing=items.findIndex(q=>{
      const tolerance=Math.max(.001,Math.min(q.price,z.price)*.00008);
      return z.low<=q.high+tolerance&&z.high>=q.low-tolerance;
    });
    if(existing>=0){
      const old=items[existing];
      const low=Math.min(old.low,z.low),high=Math.max(old.high,z.high);
      const label=group==='BUY'?'طلب / ارتداد شراء':
        group==='SELL'?'عرض / ارتداد بيع':old.label;
      items[existing]={...old,key:old.key,label,low,high,price:(low+high)/2};
    }else items.push({...z});
    groups.set(group,items);
  }
  const merged=[...groups.values()].flatMap(items=>
    items.sort((a,b)=>Math.abs(a.price-(reference??a.price))-Math.abs(b.price-(reference??b.price)))
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
