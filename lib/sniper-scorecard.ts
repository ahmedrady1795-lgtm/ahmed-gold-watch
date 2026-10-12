// Closed-candle-only audit of the forward structural sniper. Never a trading order.
export type Asset='GOLD'|'BTC';
export type Dir='BUY'|'SELL';
export type AuditStatus='ACTIVE'|'COMPLETED'|'STOPPED'|'EXPIRED'|'AMBIGUOUS'|'UNOBSERVED'|'REVERSED';
export type Level={stage:1|2|3;price:number;low:number;high:number;quality:number;kind:string;reachedAt:number|null};
export type Scenario={
  id:string;asset:Asset;side:Dir;startedAt:number;modelAt:number;expiresAt:number;
  entry:number;stop:number;confidence:number;source:string;targets:Level[];
  status:AuditStatus;lastBarOpen:number|null;lastCheckedAt:number;firstHitAt:number|null;
  resolvedAt:number|null;resolvedPrice:number|null;bestFavorableR:number;worstAdverseR:number;
  note:string;processedBars:number
  purpose?:'SCENARIO'|'OBSERVATION';
};
export type Bar={time:number;open:number;high:number;low:number;close:number};
const n=(v:unknown):number|null=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export const terminal=(s:AuditStatus)=>s!=='ACTIVE';
export function validClosedBars(rows:any,now:number):Bar[]{
  const found=new Map<number,Bar>();
  if(!Array.isArray(rows))return [];
  for(const c of rows){
    const time=n(c?.time),open=n(c?.open),high=n(c?.high),low=n(c?.low),close=n(c?.close);
    if(time==null||open==null||high==null||low==null||close==null||
      open<=0||low<=0||high<low||high<Math.max(open,close)||low>Math.min(open,close)||
      time+60000>now||time>now+1000)continue;
    found.set(time,{time,open,high,low,close});
  }
  return [...found.values()].sort((a,b)=>a.time-b.time).slice(-1000);
}
export function startScenario(args:{
  asset:Asset;side:Dir;at:number;modelAt:number;price:number;stop:number;confidence:number;
  targets:Array<{stage:1|2|3;price:number;low:number;high:number;quality:number;kind:string;source?:string}>
  durationMs?:number;purpose?:'SCENARIO'|'OBSERVATION'
}):Scenario|null{
  const {asset,side,at,modelAt,price,stop,confidence}=args;
  const targets=args.targets.slice(0,3);
  if(![at,modelAt,price,stop,confidence].every(Number.isFinite)||price<=0||stop<=0||
    !(side==='BUY'?stop<price:stop>price)||targets.length<1)return null;
  let before=price;
  for(const t of targets){
    if(![t.price,t.low,t.high,t.quality].every(Number.isFinite)||t.price<=0||t.low<=0||t.high<t.low||
      !(side==='BUY'?t.price>before:t.price<before))return null;
    before=t.price;
  }
  const risk=Math.abs(price-stop);
  if(risk<=0)return null;
  const reward=Math.abs(targets[0].price-price);
  const observation=args.purpose==='OBSERVATION';
  if(!observation&&reward/risk<1.35)return null; // Entry qualification stays independent of observation.
  const duration=Math.max(30*60000,Math.min((observation?480:90)*60000,Number(args.durationMs||60*60000)));
  const id=[asset,Math.round(at/1000),Math.round(price*100),Math.round(stop*100)].join('-');
  return {id,asset,side,startedAt:at,modelAt,expiresAt:at+duration,entry:price,
    stop,confidence,purpose:observation?'OBSERVATION':'SCENARIO',
    source:observation?'H1/H4_WATCH':'M15/H1_STRUCTURAL',targets:targets.map(t=>({...t,reachedAt:null})),
    status:'ACTIVE',lastBarOpen:null,lastCheckedAt:at,firstHitAt:null,
    resolvedAt:null,resolvedPrice:null,bestFavorableR:0,worstAdverseR:0,
    note:'توقع ورقي جارٍ، لم تتم معايرة نجاحه بعد',processedBars:0};
}
const crossed=(side:Dir,price:number,high:number,low:number)=>
  side==='BUY'?high>=price:low<=price;
const badStop=(side:Dir,stop:number,high:number,low:number)=>
  side==='BUY'?low<=stop:high>=stop;
function finish(r:Scenario,status:AuditStatus,at:number,price:number|null,note:string){
  r.status=status;r.resolvedAt=at;r.resolvedPrice=price;r.note=note;
}
export function advanceScenario(previous:Scenario,raw:any,now:number):Scenario{
  const s:Scenario={...previous,targets:previous.targets.map(x=>({...x}))};
  if(terminal(s.status))return s;
  const bars=validClosedBars(raw,now)
    .filter(b=>b.time>=s.startedAt&&b.time+60000<=s.expiresAt&&
      (s.lastBarOpen==null||b.time>s.lastBarOpen));
  for(const b of bars){
    if(s.lastBarOpen!=null&&b.time-s.lastBarOpen!==60000){
      finish(s,'UNOBSERVED',now,null,'انقطاع في تاريخ الشموع؛ لا يمكن حساب نجاح أو فشل');return s;
    }
    if(s.lastBarOpen==null&&b.time-s.startedAt>120000){
      finish(s,'UNOBSERVED',now,null,'تاريخ الشموع ناقص منذ بدء السيناريو');return s;
    }
    const risk=Math.abs(s.entry-s.stop);
    const favorable=s.side==='BUY'?b.high-s.entry:s.entry-b.low;
    const adverse=s.side==='BUY'?s.entry-b.low:b.high-s.entry;
    s.bestFavorableR=Math.max(s.bestFavorableR,favorable/risk);
    s.worstAdverseR=Math.max(s.worstAdverseR,adverse/risk);
    const stop=badStop(s.side,s.stop,b.high,b.low);
    const hits=s.targets.filter(t=>t.reachedAt==null&&crossed(s.side,t.price,b.high,b.low));
    s.lastBarOpen=b.time;s.processedBars++;
    const seenAt=b.time+60000;
    if(stop&&hits.length){
      // OHLC does not identify which happened first. Exclude from performance rates.
      finish(s,'AMBIGUOUS',seenAt,null,'وصل الهدف والوقف داخل نفس شمعة M1؛ لا نعرف الترتيب');break;
    }
    if(stop){finish(s,'STOPPED',seenAt,s.stop,'مستوى الإبطال لُمِس قبل الوصول إلى الهدف التالي');break;}
    for(const t of hits){
      t.reachedAt=seenAt;
      if(s.firstHitAt==null)s.firstHitAt=seenAt;
    }
    if(s.targets.every(t=>t.reachedAt!=null)){
      finish(s,'COMPLETED',seenAt,s.targets.at(-1)!.price,'وصل إلى جميع الأهداف المرصودة');break;
    }
  }
  s.lastCheckedAt=now;
  if(s.status==='ACTIVE'&&now>=s.expiresAt){
    const last=s.lastBarOpen;
    // Never score an elapsed plan without continuous completed M1 coverage.
    if(last==null||last+60000<s.expiresAt-120000){
      finish(s,'UNOBSERVED',now,null,'انتهت المدة دون متابعة كاملة للشموع؛ لا نتيجة مثبتة');
    }else finish(s,'EXPIRED',s.expiresAt,null,'انتهت المدة قبل استكمال كل الأهداف');
  }
  return s;
}
export function scorecard(records:Scenario[],asset:Asset){
  const rows=records.filter(r=>r.asset===asset);
  const observed=rows.filter(r=>['COMPLETED','STOPPED','EXPIRED','REVERSED'].includes(r.status));
  const ambiguous=rows.filter(r=>r.status==='AMBIGUOUS').length;
  const unobserved=rows.filter(r=>r.status==='UNOBSERVED').length;
  const pending=rows.filter(r=>r.status==='ACTIVE').length;
  const n=observed.length;
  const median=(values:number[])=>{const a=[...values].sort((x,y)=>x-y);return a.length?Number(((a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2).toFixed(1)):null;};
  const rates=([1,2,3] as const).map(stage=>{
    const applicable=observed.filter(r=>r.targets.some(t=>t.stage===stage));
    const hits=applicable.filter(r=>r.targets.some(t=>t.stage===stage&&t.reachedAt!=null));
    const minutes=hits.map(r=>(r.targets.find(t=>t.stage===stage)!.reachedAt!-r.startedAt)/60000);
    return {stage,samples:applicable.length,hits:hits.length,medianMinutes:median(minutes),
      observedPct:applicable.length?Number((100*hits.length/applicable.length).toFixed(1)):null,
      avgMinutes:hits.length?Number((hits.reduce((sum,r)=>sum+(r.targets.find(t=>t.stage===stage)!.reachedAt!-r.startedAt)/60000,0)/hits.length).toFixed(1)):null};
  });
  const fullyCompleted=observed.filter(r=>r.status==='COMPLETED').length;
  return {status:n>=40?'TRACKING':'COLLECTING',requiredSamples:40,observed:n,pending,ambiguous,unobserved,
    medianResolutionMinutes:median(observed.filter(r=>r.resolvedAt!=null).map(r=>(r.resolvedAt!-r.startedAt)/60000)),
    completed:fullyCompleted,stopped:observed.filter(r=>r.status==='STOPPED').length,
    expired:observed.filter(r=>r.status==='EXPIRED').length,
    reversed:observed.filter(r=>r.status==='REVERSED').length,
    targets:rates,
    // These are *observed reach rates*, not profitability, win probability or OOS validation.
    description:'نتائج أهداف قناص هيكلية منذ تفعيل السجل، من شموع M1 مغلقة. حالات الانقطاع والتداخل مستبعدة. ليست باكتيست مستقلًا.'};
}
