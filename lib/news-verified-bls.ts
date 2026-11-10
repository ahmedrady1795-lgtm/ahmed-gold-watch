import type {Event} from './engine';

// Time-limited contingency for BLS releases verified against the BLS's own
// published schedule on 2026-11-10. This is NOT an economic data result:
// Actual/Forecast stay blank until a live provider supplies them. The weekly
// calendar and live API remain authoritative when they report the release.
const verified=[
  {
    id:'bls-verified-cpi-2026-11-10',
    name:'Consumer Price Index (CPI) - October 2026',
    time:Date.parse('2026-11-10T13:30:00Z'),
    source:'https://www.bls.gov/schedule/news_release/cpi.htm',
    family:/\bCPI\b|consumer price index/i
  },
  {
    id:'bls-verified-ppi-2026-11-13',
    name:'Producer Price Index (PPI) - October 2026',
    time:Date.parse('2026-11-13T13:30:00Z'),
    source:'https://www.bls.gov/schedule/news_release/ppi.htm',
    family:/\bPPI\b|producer price index/i
  }
];

// Add only missing verified schedule entries; never duplicate or overwrite a
// provider's revised time or published Actual figures. A contingency expires
// after the date is over and is NOT used as a permanent recurring calendar.
export function appendVerifiedBlsReleases(events:Event[],now=Date.now()):number{
  let added=0;
  for(const release of verified){
    if(!Number.isFinite(release.time)||
      release.time<now-24*60*60*1000||
      release.time>now+30*24*60*60*1000)continue;
    if(events.some(e=>release.family.test(String(e.name||''))&&
      Number.isFinite(e.time)&&Math.abs(e.time-release.time)<=48*60*60*1000))continue;
    events.push({
      id:release.id,name:release.name,time:release.time,
      importance:3,actual:'',forecast:'',previous:'',
      source:release.source,exactTime:true
    });
    added++;
  }
  return added;
}
