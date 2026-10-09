import {getAiSnapshot} from '../../../lib/ai-snapshot-cache';

export const dynamic='force-dynamic';
export const runtime='nodejs';

type Side='BUY'|'SELL'|'WAIT';
type AssetContext={
  label:string;price:number|null;side:Side;confidence:number|null;quality:string;
  forecastSide:Side;forecastConfidence:number|null;target:number|null;
  scalp:Array<{horizon:number;status:string;side:Side;reason:string;netRR:number|null;cost:number|null}>;
  reason:string;checkedAt:number;
};
type CoreContext={gold:AssetContext;bitcoin:AssetContext;checkedAt:number};
type ChatHistoryItem={role?:'user'|'core';text?:string};

const finite=(v:unknown)=>Number.isFinite(Number(v));
const num=(v:unknown)=>finite(v)?Number(v):null;
const side=(v:unknown):Side=>v==='BUY'||v==='SELL'?v:'WAIT';
const sideAr=(v:Side)=>v==='BUY'?'شراء':v==='SELL'?'بيع':'انتظار';
const assetName=(key:string)=>key==='bitcoin'?'البيتكوين':'الذهب';
const pct=(v:number|null)=>v==null?'غير متاح':`${Math.round(v)}%`;
const price=(v:number|null)=>v==null?'غير متاح':v.toLocaleString('en-US',{maximumFractionDigits:2});

function compactAsset(key:string,x:any,desk:any,now:number):AssetContext{
  const forecast=x?.forwardMove||{};
  const recommendation=x?.recommendation||{};
  const decisionSide=side(recommendation.action||x?.marketLead?.side||forecast.side);
  const scalp=Array.isArray(desk?.plans)?desk.plans.slice(0,2).map((p:any)=>({
    horizon:Number(p.horizon),status:String(p.status||'WATCH'),side:side(p.side),
    reason:String(p.reason||p.blockers?.[0]||'لا يوجد سبب مسجل'),netRR:num(p.netRR),cost:num(p.cost)
  })) : [];
  const reasons=[
    ...scalp.map((x:{reason:string})=>x.reason),
    ...(Array.isArray(x?.marketLead?.reason)?x.marketLead.reason:[x?.marketLead?.reason]),
    ...(Array.isArray(x?.forwardMove?.reasons)?x.forwardMove.reasons:[])
  ].filter(Boolean) as string[];
  return {
    label:assetName(key),price:num(x?.price??x?.livePulse?.price),side:decisionSide,
    confidence:num(recommendation.confidence??forecast.confidence??x?.marketLead?.confidence),
    quality:String(recommendation.quality||''),forecastSide:side(forecast.side),
    forecastConfidence:num(forecast.confidence),target:num(forecast.target),
    scalp,reason:String(reasons[0]||forecast.reason||'لا يوجد سبب تفصيلي متاح'),checkedAt:Number(x?.livePulse?.sourceTime||now)
  };
}

function contextFrom(payload:any,provided:any,now:number):CoreContext{
  const source=provided&&typeof provided==='object'?provided:payload||{};
  const gold=source.gold||{},btc=source.bitcoin||{};
  return {
    gold:gold.label?gold:compactAsset('gold',gold,gold.scalpDesk,now),
    bitcoin:btc.label?btc:compactAsset('bitcoin',btc,btc.scalpDesk,now),
    checkedAt:Number(source.checkedAt||now)
  };
}

function oneAsset(a:AssetContext){
  const scalp=a.scalp.length?a.scalp.map(p=>`M${p.horizon}: ${p.status}، ${sideAr(p.side)}${p.netRR!=null?`، ${p.netRR.toFixed(2)}R بعد التكلفة`:''}`).join(' | '):'لا توجد خطة سكالب حالية';
  return `${a.label}: السعر ${price(a.price)}، القرار ${sideAr(a.side)}${a.confidence!=null?` بقوة ${pct(a.confidence)}`:''}، توقع 15 دقيقة ${sideAr(a.forecastSide)}${a.forecastConfidence!=null?` بقوة ${pct(a.forecastConfidence)}`:''}، السكالب ${scalp}.`;
}

function recentAsset(history:ChatHistoryItem[]){
  const text=history.filter(x=>x?.role==='user').slice(-4).map(x=>String(x.text||'').toLowerCase()).join(' ');
  return /بيت|btc|bitcoin|بتكوين/.test(text)?'bitcoin':/ذهب|gold|xau/.test(text)?'gold':null;
}

function answerFor(message:string,ctx:CoreContext,now:number,history:ChatHistoryItem[]=[]){
  const q=message.toLowerCase().trim();
  const requested=/بيت|btc|bitcoin|بتكوين/.test(q)?'bitcoin':/ذهب|gold|xau/.test(q)?'gold':null;
  const chosen=requested==='bitcoin'?ctx.bitcoin:requested==='gold'?ctx.gold:recentAsset(history)==='bitcoin'?ctx.bitcoin:recentAsset(history)==='gold'?ctx.gold:null;
  const age=Math.max(0,now-ctx.checkedAt);
  const freshness=age<10000?'البيانات حديثة':age<30000?`آخر لقطة منذ ${Math.round(age/1000)} ثانية`:'اللقطة قديمة، فانتظر التحديث';
  if(/^(اهلا|أهلا|السلام|hello|hi|مرحبا|هاي|تمام|صباح|مساء)/.test(q))return `أهلًا يا أحمد، أنا معاك. أقدر أقولك الاتجاه الحالي، سبب الانتظار، وضع السكالب، والتكلفة من نفس بيانات الموقع. قولّي مثلًا: «حلل البيتكوين» أو «ليه مفيش دخول؟» — ${freshness}.`;
  if(/حلل|تحليل|السوق|الوضع|ملخص|الاتنين|كلهم|كله/.test(q)&&!(/تكلف|دخول|صفقة/.test(q))){
    return `تمام، دي قراءة سريعة: ${oneAsset(ctx.gold)} ${oneAsset(ctx.bitcoin)}. لو عايز ندخل في أصل واحد قول «حلل الذهب» أو «حلل البيتكوين». ${freshness}.`;
  }
  if(/ليه|لماذا|سبب|انتظار|رافض|مفيش دخول|لا يوجد دخول|blocked/.test(q)){
    const a=chosen||ctx.gold;
    const reasons=a.scalp.filter(p=>p.status!=='ARMED').map(p=>`M${p.horizon}: ${p.reason}`).join(' · ');
    return `بص، ${a.label} حالياً على ${sideAr(a.side)}. سبب الانتظار الأساسي: ${reasons||a.reason}. ${a.forecastSide==='WAIT'?'وتوقع الـ15 دقيقة لسه مش معتمد.':'توقع الـ15 دقيقة مائل لـ'+sideAr(a.forecastSide)+'، بس ده لوحده مش كفاية لدخول.'} ${freshness}.`;
  }
  if(/تكلف|سبريد|عمول|انزلاق|fee|cost/.test(q)){
    const a=chosen||ctx.bitcoin,rows=a.scalp.filter(p=>p.cost!=null);
    return `${a.label}: تكلفة الدورة المعروضة تقديرية لكل وحدة. ${rows.length?rows.map(p=>`M${p.horizon}: ${price(p.cost)} دولار`).join(' · '):'مفيش خطة تكلفة حالية'}. دي مش قياس مباشر لرسوم حساب Exness.`;
  }
  if(/دخول|صفقة|شراء|بيع|entry|signal/.test(q)){
    const a=chosen||ctx.gold;
    const armed=a.scalp.find(p=>p.status==='ARMED'&&p.side!=='WAIT');
    return armed?`${a.label}: فيه خطة M${armed.horizon} مائلة لـ${sideAr(armed.side)}، بصافي ${armed.netRR==null?'غير متاح':armed.netRR.toFixed(2)+'R'} بعد التكلفة. لسه محتاجة تأكيد M1 وسعر تنفيذ مناسب.`:`${a.label}: مفيش صفقة دخول مؤهلة دلوقتي. الخطط الحالية: ${a.scalp.map(p=>`M${p.horizon} ${p.status}`).join(' · ')||'مفيش خطة'}.`;
  }
  if(/توقع|15|هدف|اتجاه|صاعد|هابط/.test(q)){
    const a=chosen||ctx.gold;
    return `${oneAsset(a)} ${a.target!=null?`الهدف المرجعي ${price(a.target)}.`:''} دي قراءة 15 دقيقة، ومش أمر تنفيذ.`;
  }
  if(/سرع|تحديث|اخر|آخر|بطء/.test(q))return `الرد ده طالع من آخر لقطة جاهزة عشان يكون سريع. ${freshness}. التحليل الكامل بيشتغل لوحده ومش بيتشغل مع كل سؤال.`;
  if(chosen)return `تمام، ${oneAsset(chosen)} قولّي عايز تعرف الاتجاه، الدخول، ولا سبب الانتظار؟`;
  return `أنا النواة، وأقدر أشرحلك القرار الحالي بسرعة. ${oneAsset(chosen||ctx.gold)} اسألني عن الاتجاه، سبب الانتظار، الدخول، أو التكلفة.`;
}

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const message=String(body?.message||'').trim().slice(0,600);
    if(!message)return Response.json({ok:false,message:'اكتب سؤالك أولًا.'},{status:400});
    const now=Date.now(),snapshot=getAiSnapshot(now),context=contextFrom(snapshot.payload,body?.context,now);
    const history=Array.isArray(body?.history)?body.history.slice(-8).map((x:any)=>({role:x?.role,text:String(x?.text||'').slice(0,300)})):[];
    return Response.json({ok:true,answer:answerFor(message,context,now,history),checkedAt:context.checkedAt,latencyMs:Date.now()-now,mode:'CORE_FAST_CONTEXT',contextUsed:history.length>0},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({ok:false,message:'تعذر رد النواة الآن.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
