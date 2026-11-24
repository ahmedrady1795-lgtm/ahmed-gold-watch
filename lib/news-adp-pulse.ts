import type {Event} from './engine';

export const ADP_LIST='https://mediacenter.adp.com/workforce-data-releases';
const ADP_NAME='ADP Weekly Employment Change';
const DAY=86400000;
export function isAdpWeekly(name:string){
  return /\bADP\b/i.test(name)&&/weekly|pulse/i.test(name)&&/employment|jobs|payroll|pulse/i.test(name);
}
function textOnly(html:string){
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;|&thinsp;/gi,' ').replace(/\s+/g,' ');
}
export function adpReleaseLinks(html:string):string[]{
  const urls:string[]=[];
  for(const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)){
    try{
      const u=new URL(match[1].replace(/&amp;/g,'&'),ADP_LIST);
      if(u.origin!=='https://mediacenter.adp.com'||!/^\/\d{4}-\d{2}-\d{2}-ADP-National-Employment-Report-Preliminary-Estimate/i.test(u.pathname))continue;
      u.search='';u.hash='';
      if(!urls.some(x=>new URL(x).pathname.slice(1,11)===u.pathname.slice(1,11)))urls.push(u.href);
    }catch{}
  }
  return urls.sort((a,b)=>b.localeCompare(a)).slice(0,3);
}
// ADP publishes NER Pulse at 08:15 New York time. DST must be respected.
function nyTime(isoDay:string):number{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(isoDay))return NaN;
  const wanted=Date.parse(isoDay+'T08:15:00Z');
  if(!Number.isFinite(wanted)||new Date(wanted).toISOString().slice(0,10)!==isoDay)return NaN;
  let guess=wanted;
  for(let i=0;i<2;i++){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
    const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
    guess+=wanted-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
  }
  return guess;
}
function compact(n:number){return String(Number((n/1000).toFixed(3)))+'K';}
export function parseAdpRelease(url:string,html:string,now:number):{event:Event;next:Event|null}|null{
  const u=new URL(url);
  if(u.origin!=='https://mediacenter.adp.com')return null;
  const date=u.pathname.match(/^\/(\d{4}-\d{2}-\d{2})-ADP-National-Employment-Report-Preliminary-Estimate/i)?.[1];
  if(!date)return null;
  const time=nyTime(date),body=textOnly(html);
  if(!Number.isFinite(time)||time>now||!/NER Pulse/i.test(body))return null;
  const m=body.match(/private employers\s+(added|shed|lost)\s+an average of\s+(-?[\d,]+)\s+jobs per week/i);
  if(!m)return null;
  let actual=Number(m[2].replace(/,/g,''));
  if(!Number.isFinite(actual)||Math.abs(actual)>1000000)return null;
  if(/shed|lost/i.test(m[1]))actual=-Math.abs(actual);
  const event:Event={id:'adp-pulse:'+date,name:ADP_NAME,time,importance:2,actual:compact(actual),forecast:'',previous:'',source:url,exactTime:true};
  const nextDate=body.match(/next\s+NER Pulse\s+will be released\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1];
  const parsed=nextDate?Date.parse(nextDate+' UTC'):NaN;
  const nextTime=Number.isFinite(parsed)?nyTime(new Date(parsed).toISOString().slice(0,10)):NaN;
  const next=Number.isFinite(nextTime)&&nextTime>time&&nextTime>=now-DAY&&nextTime<=now+30*DAY?
    {...event,id:'adp-pulse:'+new Date(nextTime).toISOString().slice(0,10),time:nextTime,actual:'',previous:event.actual}:null;
  return {event,next};
}
export function mergeAdpEvents(events:Event[],source:Event[],now:number){
  for(const verified of source){
    if(verified.time<now-DAY||verified.time>now+30*DAY)continue;
    const same=events.filter(e=>isAdpWeekly(e.name)&&Math.abs(e.time-verified.time)<2*3600000);
    const existing=same.find(e=>String(e.forecast||'').trim())||same[0];
    const actual=now>=verified.time?(verified.actual||existing?.actual||''):'';
    const combined:Event={...verified,actual,forecast:existing?.forecast||'',previous:verified.previous||existing?.previous||'',importance:Math.max(verified.importance,existing?.importance||1),source:verified.actual?verified.source:existing?.actual?existing.source:verified.source};
    for(let i=events.length-1;i>=0;i--)if(same.includes(events[i]))events.splice(i,1);
    events.push(combined);
  }
}
// A one-time independently verified release, not a generated schedule.
// No Actual is exposed before its public publication timestamp.
export function verifiedAdpToday(now:number):Event[]{
  const time=Date.parse('2026-11-24T13:15:00Z');
  if(time<now-DAY||time>now+30*DAY)return [];
  return [{id:'adp-pulse:2026-11-24',name:ADP_NAME,time,importance:2,
    actual:now>=time?'21K':'',forecast:'',previous:'23.8K',
    source:now>=time?'https://www.prnewswire.com/news-releases/adp-national-employment-report-preliminary-estimate-for-november-7-2026-302948539.html':'https://mediacenter.adp.com/2026-11-17-ADP-National-Employment-Report-Preliminary-Estimate-for-October-31%2C-2026',exactTime:true}];
}
