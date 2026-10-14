// Pure timeline selection for economic events. All timestamps are epoch milliseconds.
// No synthetic events are manufactured when the feed is empty or stale.
export const NEWS_EARLY_MS=8*60*60*1000;
type EconomicEvent={name:string;time:number|string;id?:unknown;actual?:unknown;[key:string]:unknown};
export function economicNewsTimeline(
  events:EconomicEvent[]|unknown,featured:EconomicEvent|null,now:number
){
  const source=[...(Array.isArray(events)?events:[]),featured].filter(Boolean) as EconomicEvent[];
  const seen=new Set<string>();
  const unique=source.filter(e=>{
    const at=Number(e.time);
    if(typeof e.name!=='string'||!e.name.trim()||!Number.isFinite(at)||at<=0)return false;
    const key=e.name.trim().toLowerCase()+'|'+at;
    if(seen.has(key))return false;
    seen.add(key);return true;
  }).sort((a,b)=>Number(a.time)-Number(b.time));
  const upcoming=unique.filter(e=>Number(e.time)>=now&&Number(e.time)<=now+30*86400000);
  // Show every confirmed release in the eight-hour window; never drop a
  // high-impact event merely because earlier lower-impact ones filled a cap.
  const alerts=upcoming.filter(e=>Number(e.time)-now<=NEWS_EARLY_MS);
  const recent=unique.filter(e=>Number(e.time)<now&&Number(e.time)>=now-10*60000&&
    String(e.actual??'').trim()).slice(-2);
  return {upcoming,alerts,recent};
}
