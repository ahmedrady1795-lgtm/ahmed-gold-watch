import type {Event} from './engine';

// A finite, published official BLS schedule. These are one-time events,
// never a synthetic recurring economic calendar. Only the October 2026
// headline CPI month-on-month result has a verified actual in this snapshot.
const verified=[
  {
    id:'bls-verified-cpi-2026-11-10',
    name:'Consumer Price Index (CPI) - October 2026',
    time:Date.parse('2026-11-10T13:30:00Z'),
    source:'https://www.bls.gov/schedule/news_release/cpi.htm',
    matches:(name:string)=>/CPI|consumer price index/i.test(name)&&
      !/core|less food|ex food|year.over.year|yearly|annual|12.month|y\/y|yoy/i.test(name),
    // October CPI-U seasonally adjusted m/m, confirmed by BLS after release.
    // Forecast 0.3% from contemporaneous Reuters consensus; previous 0.6%
    // from BLS. No annual value is published for October 2026.
    result:{
      availableAt:Date.parse('2026-11-10T13:30:00Z'),
      actual:'0.4%',forecast:'0.3%',previous:'0.6%',
      source:'https://www.bls.gov/news.release/archives/cpi_11102026.htm'
    }
  },
  {
    id:'bls-verified-ppi-2026-11-13',
    name:'Producer Price Index (PPI) - October 2026',
    time:Date.parse('2026-11-13T13:30:00Z'),
    source:'https://www.bls.gov/schedule/news_release/ppi.htm',
    matches:(name:string)=>/PPI|producer price index/i.test(name)&&
      !/core|year.over.year|yearly|annual|12.month|y\/y|yoy/i.test(name),
    result:null
  }
];

// Runs after the normal providers and before their event-merge logic.
// A verified official result fills only missing fields. Existing live-provider
// Actual/Forecast/Previous figures are never overridden. Never expose a
// published Actual at an earlier replay/as-of time, or attach monthly CPI
// to core/annual CPI events.
export function appendVerifiedBlsReleases(events:Event[],now=Date.now()):number{
  let added=0;
  for(const release of verified){
    if(!Number.isFinite(release.time)||
      release.time<now-24*60*60*1000||
      release.time>now+30*24*60*60*1000)continue;
    const result=release.result&&now>=release.result.availableAt?release.result:null;
    const existing=events.find(e=>release.matches(String(e.name||''))&&
      Number.isFinite(e.time)&&Math.abs(e.time-release.time)<=2*60*60*1000);
    if(existing){
      // Fill missing official actual only for matching headline monthly release.
      if(result){
        const filledActual=!String(existing.actual||'').trim();
        if(filledActual)existing.actual=result.actual;
        if(!String(existing.forecast||'').trim())existing.forecast=result.forecast;
        if(!String(existing.previous||'').trim())existing.previous=result.previous;
        if(filledActual)existing.source=result.source;
      }
      continue;
    }
    events.push({
      id:release.id,name:release.name,time:release.time,
      importance:3,actual:result?.actual||'',
      forecast:result?.forecast||'',previous:result?.previous||'',
      source:result?.source||release.source,exactTime:true
    });
    added++;
  }
  return added;
}
