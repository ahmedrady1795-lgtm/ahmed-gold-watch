/** Reference gold/COMEX session, not broker execution permission.
 * 17:00–18:00 New York maintenance follows US DST automatically.
 * Broker-specific minutes, close-only periods and holidays may differ.
 * https://www.cmegroup.com/markets/metals/precious/gold.html
 */
const clock=new Intl.DateTimeFormat('en-US',{
 timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
export function goldMarketSession(now:number){
 if(!Number.isFinite(now))return {open:false,reason:'UNKNOWN' as const};
 const parts=clock.formatToParts(new Date(now));
 const field=(name:string)=>parts.find(p=>p.type===name)?.value;
 const day=field('weekday'),minute=Number(field('hour'))*60+Number(field('minute'));
 const weekend=day==='Sat'||(day==='Sun'&&minute<1080)||(day==='Fri'&&minute>=1020);
 const maintenance=['Mon','Tue','Wed','Thu'].includes(day||'')&&minute>=1020&&minute<1080;
 return {open:!weekend&&!maintenance,
   reason:weekend?'WEEKEND' as const:maintenance?'MAINTENANCE' as const:'OPEN' as const};
}
/** Classify missing slots only; never fill candles or certify a forecast.
 * Any missing OPEN-market slot keeps the source-gap warning. */
export function goldM15SessionBreakOnly(rows:readonly {time:number}[]):boolean{
 const period=900000;
 let missing=0;
 for(let i=1;i<rows.length;i++){
   const a=rows[i-1].time,b=rows[i].time,span=b-a;
   if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a%period||b%period||
     span<period||span>4*86400000)return false;
   for(let at=a+period;at<b;at+=period){
     missing++;
     if(goldMarketSession(at).open||goldMarketSession(at+period-1).open)return false;
   }
 }
 return missing>0;
}
