import {buildLongRangeTargets} from './long-range-targets';

// A separate, non-tradable M5/M15/H1 market observation.
// It must never bypass the validated forecast, server audit or MT5 risk gates.
type Side='BUY'|'SELL'|'WAIT';
type Bar={time:number;open:number;high:number;low:number;close:number};
const numeric=(x:unknown)=>x!=null&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
function bars(raw:any,period:number,now:number):Bar[]{
  if(!Array.isArray(raw))return [];
  const unique=new Map<number,Bar>();
  for(const c of raw){
    const time=numeric(c?.time),open=numeric(c?.open),high=numeric(c?.high),
      low=numeric(c?.low),close=numeric(c?.close);
    if(time==null||open==null||high==null||low==null||close==null||
      time<=0||time+period>now||time<now-9*86400000||
      low<=0||high<Math.max(open,close)||low>Math.min(open,close))continue;
    unique.set(time,{time,open,high,low,close});
  }
  return [...unique.values()].sort((a,b)=>a.time-b.time);
}
function vote(rows:Bar[]):Side{
  if(rows.length<30)return 'WAIT';
  const last=rows.slice(-24),closes=last.map(c=>c.close);
  const avg=(a:number[])=>a.reduce((s,x)=>s+x,0)/a.length;
  const fast=avg(closes.slice(-7)),slow=avg(closes.slice(-21));
  const tr=last.slice(1).map((c,i)=>Math.max(c.high-c.low,
    Math.abs(c.high-last[i].close),Math.abs(c.low-last[i].close)));
  const atr=avg(tr.slice(-14));
  if(!Number.isFinite(atr)||atr<=0)return 'WAIT';
  const bias=(fast-slow)/atr;
  const position=(last.at(-1)!.close-slow)/atr;
  if(bias>.13&&position>.17)return 'BUY';
  if(bias<-.13&&position<-.17)return 'SELL';
  return 'WAIT';
}
export function buildStructuralWatch(asset:'GOLD'|'BTC',x:any,price:number|null,now:number,sourceReady:boolean){
  const empty=(reason:string)=>({side:'WAIT' as Side,targets:[] as ReturnType<typeof buildLongRangeTargets>['targets'],
    invalidation:null as number|null,votes:0,reason,ready:false});
  if(!sourceReady||price==null||!Number.isFinite(price)||price<=0)return empty('مصدر السعر أو تحديث التحليل غير جاهز');
  const frames=x?.chartHigherFrames||{};
  const m5=bars(frames.m5,300000,now),m15=bars(frames.m15,900000,now),
    h1=bars(frames.h1,3600000,now);
  if(m5.length<30||m15.length<30||h1.length<30)return empty('فريمات هيكل السوق غير مكتملة');
  if(now-(m5.at(-1)!.time+300000)>13*60000||
     now-(m15.at(-1)!.time+900000)>28*60000||
     now-(h1.at(-1)!.time+3600000)>120*60000)return empty('فريمات هيكل السوق قديمة');
  if([m5,m15,h1].some((rows,i)=>{
    const period=[300000,900000,3600000][i],tail=rows.slice(-4);
    return tail.some((b,j)=>j>0&&b.time-tail[j-1].time>period*2);
  }))return empty('فجوات في شموع التأكيد الأخيرة');
  if(Math.abs(price-m5.at(-1)!.close)/price>.015)return empty('تباعد بين سعر اللحظة وسعر شموع التحليل');
  const readings=[vote(m5),vote(m15),vote(h1)];
  const longs=readings.filter(x=>x==='BUY').length,shorts=readings.filter(x=>x==='SELL').length;
  const direction:Side=longs>=2&&shorts===0?'BUY':shorts>=2&&longs===0?'SELL':'WAIT';
  if(direction==='WAIT')return {...empty('فريمات M5/M15/H1 لا تتفق على ميل مبكر'),votes:Math.max(longs,shorts)};
  const structured=buildLongRangeTargets({asset,side:direction,price,now,frames});
  const edge=m15.slice(-10);
  const stop=direction==='BUY'?Math.min(...edge.map(b=>b.low)):Math.max(...edge.map(b=>b.high));
  const safe=direction==='BUY'?stop<price:stop>price;
  const targets=structured.targets.filter(t=>direction==='BUY'?t.price>price:t.price<price);
  const ready=targets.length>0&&safe;
  return {side:direction,targets:ready?targets:[],invalidation:ready?Number(stop.toFixed(2)):null,
    votes:Math.max(longs,shorts),ready,
    reason:ready?'ميل هيكلي من '+Math.max(longs,shorts)+'/3 فريمات · مستويات مرصودة للمراقبة فقط':
      'ميل هيكلي مرصود لكن لا توجد مستويات بعيدة صالحة؛ لا نختلق هدفًا'};
}
