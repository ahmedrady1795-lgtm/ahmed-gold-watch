import {getAiSnapshot} from '../../../lib/ai-snapshot-cache';
import {searchMarketNews} from '../../../lib/core-web-research';
import {generateEgyptianCoreAnswer,coreModelConfigured} from '../../../lib/core-language-model';
import {buildCoreAnalysisSkills} from '../../../lib/core-analysis-skills';

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
  if(/^(اهلا|أهلا|السلام|hello|hi|مرحبا|هاي|تمام|صباح|مساء)/.test(q))return `أهلًا، أنا معاكي في التحليل خطوة بخطوة. أقدر أقولك الاتجاه الحالي، سبب الانتظار، وضع السكالب، والتكلفة من نفس بيانات الموقع. قولّي مثلًا: «حلل البيتكوين» أو «ليه مفيش دخول؟» — ${freshness}.`;
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
  if(chosen)return `بالنسبة لـ${chosen.label}، ${oneAsset(chosen)} عايز نراجع الاتجاه ولا سبب الانتظار؟`;
  return 'سامعاك، بس عشان أقدر أتكلم معاك بحرية في أي موضوع وأفهم متابعة الكلام، لازم موديل المحادثة يتوصل بالنواة. الوضع الأساسي الحالي يقدر يشرح تحليلات السوق وينفذ أوامر الموقع المحددة، لكنه مش ذكاء محادثة عام.';
}


type VoiceCommand=
 |{type:'REFRESH_ANALYSIS'}
 |{type:'SET_ASSET';asset:'ALL'|'GOLD'|'BTC'}
 |{type:'NAVIGATE';section:'core-console'|'market-overview'|'scalp-opportunities'|'market-forecast'|'market-news'}
 |{type:'STOP_VOICE'};
function voiceCommand(input:string):{answer:string;action:VoiceCommand|null}|null{
 const q=input.toLowerCase().trim();
 // Broker orders, account changes, and code mutations are never executed from speech.
 if(/(?:افتح|نفذ|نفّذ|ادخل|اشتري|بيعلي|حط|حطلي)\s+(?:صفقة|شراء|بيع|اوردر|أمر|limit|order)/.test(q))
   return {answer:'أقدر أجهز خطة وتحليل، بس فتح صفقة حقيقية على ميتاتريدر محتاج ربط تداول منفصل وتأكيد واضح. مش هفتحها من الكلام بس.',action:null};
 if(/^(?:اقفل|وقف|اوقف|أوقف|إيقاف|اطفي)\s+(?:ال)?صوت/.test(q))
   return {answer:'حاضر، هوقف الوضع الصوتي.',action:{type:'STOP_VOICE'}};
 if(/(?:حدّث|حدث|جدد|جدّد|اعمل تحديث|شغل تحليل|شغّل تحليل|اعد التحليل|أعد التحليل)/.test(q)&&
   /(?:تحليل|الذهب|البيتكوين|السوق|البيانات|الكل|الاسعار|الأسعار|التحديث)/.test(q))
   return {answer:'حاضر، بطلب تحديث جديد لتحليل السوق دلوقتي.',action:{type:'REFRESH_ANALYSIS'}};
 if(/^(?:اعرض|وريني|اظهر|أظهر|اختار|غير|غيّر|خلي)\s/.test(q)){
   if(/(?:الكل|الاتنين|كله|كل الأصول)/.test(q))
      return {answer:'تمام، هعرضلك الذهب والبيتكوين مع بعض.',action:{type:'SET_ASSET',asset:'ALL'}};
   if(/(?:ذهب|gold|xau)/.test(q))
      return {answer:'حاضر، هركز العرض على الذهب.',action:{type:'SET_ASSET',asset:'GOLD'}};
   if(/(?:بيتكوين|بتكوين|bitcoin|btc)/.test(q))
      return {answer:'حاضر، هركز العرض على البيتكوين.',action:{type:'SET_ASSET',asset:'BTC'}};
 }
 if(/^(?:افتح|روح|انقلني|وديني|وريني|اعرض|اظهر|أظهر)/.test(q)){
   const section=/سكالب|صفقات|فرص/.test(q)?'scalp-opportunities':
     /توقع|15 دقيقة|ربع ساعة/.test(q)?'market-forecast':
     /أخبار|اخبار|أجندة|الاجندة/.test(q)?'market-news':
     /سوق|نظرة|نبض/.test(q)?'market-overview':
     /النواة|الصوت/.test(q)?'core-console':null;
   if(section)return {answer:'حاضر، بفتح القسم ده دلوقتي.',action:{type:'NAVIGATE',section}};
 }
 return null;
}
function isNewsRequest(message:string){
 return /(?:أخبار|اخبار|الخبر|آخر الأخبار|اخر الاخبار|news|breaking|خبر النهاردة)/i.test(message)&&
   !/(?:إيه أخبارك|ايه اخبارك|عامل ايه)/.test(message);
}
function wantsWebSearch(message:string){
 // General-purpose public internet research, not just gold/BTC headlines.
 return /(?:ابحث|ابحثي|دور|دوّر|دوري|فتش|فتّش|بحث|جوجل|النت|الإنترنت|الانترنت|المواقع|مصادر|أخبار|اخبار|news|search|online|معلومة حديثة|آخر|اخر|أحدث|احدث|النهاردة|اليوم|دلوقتي|حاليا|حاليًا|2026|الرائج|ترندات|latest|today|current|recent|سعر اليوم|كم سعر)/i.test(message);
}
// Keep the publicly reachable voice endpoint from silently exhausting an API allowance.
const requestWindow=new Map<string,{start:number,count:number}>();
function withinRateLimit(request:Request,now:number){
 const ip=(request.headers.get('x-forwarded-for')||request.headers.get('x-real-ip')||'unknown').split(',')[0].trim().slice(0,72);
 const entry=requestWindow.get(ip);
 const active=entry&&now-entry.start<60000?entry:{start:now,count:0};
 active.count++;requestWindow.set(ip,active);
 if(requestWindow.size>600){
   for(const [key,value] of requestWindow)if(now-value.start>60000)requestWindow.delete(key);
   if(requestWindow.size>600)requestWindow.clear();
 }
 return active.count<=18;
}
export async function POST(request:Request){
 try{
  const body=await request.json().catch(()=>({}));
  const message=String(body?.message||'').trim().slice(0,600);
  if(!message)return Response.json({ok:false,message:'قولّي سؤالك الأول.'},{status:400});
  const now=Date.now();
  if(!withinRateLimit(request,now))return Response.json({ok:false,message:'الطلبات كتير قوي في وقت قصير، جرّب بعد دقيقة.'},{status:429});
  const snapshot=getAiSnapshot(now),context=contextFrom(snapshot.payload,body?.context,now);
  const history:ChatHistoryItem[]=Array.isArray(body?.history)?body.history.slice(-18).map((x:any)=>({role:x?.role,text:String(x?.text||'').slice(0,550)})):[];
  const command=voiceCommand(message);
  if(command)return Response.json({ok:true,answer:command.answer,action:command.action,checkedAt:context.checkedAt,
    mode:'VOICE_COMMAND'},{headers:{'Cache-Control':'private, no-store'}});
  const research=isNewsRequest(message),webSearch=wantsWebSearch(message);
  const analysis=buildCoreAnalysisSkills(message,snapshot.payload,body?.context,now);
  const asset=/بيت|btc|bitcoin|بتكوين/.test(message.toLowerCase())?'BTC':
    /ذهب|gold|xau/.test(message.toLowerCase())?'GOLD':'BOTH';
  // RSS is a no-key fallback for news; Google's grounded search handles broad research.
  const found=research?await searchMarketNews(message,asset):null;
  const recent=(found?.items||[]).filter(x=>!x.publishedAt||(x.publishedAt<=Date.now()+60000&&Date.now()-x.publishedAt<3*86400000)).slice(0,3);
  const web=research?{ok:Boolean(found?.ok),query:found?.query,checkedAt:found?.checkedAt,
    headlines:recent.map(x=>({title:x.title,source:x.source,publishedAt:x.publishedAt,url:x.url}))}:undefined;
  // LLM is conversational only; actions are deterministic and never taken from model output.
  const natural=await generateEgyptianCoreAnswer({message,
    history:history.map(x=>({role:x.role==='core'?'core':'user',text:String(x.text||'')})),
    context,web,analysis,useGoogleSearch:webSearch});
  if(natural)return Response.json({ok:true,answer:natural.answer,
    mode:natural.grounded?'EGYPTIAN_LLM_GROUNDED':'EGYPTIAN_LLM',
    action:null,modelConfigured:true,analysisSkill:analysis?.skill||null,
    web:{searchRequested:webSearch,searchConfirmed:natural.grounded,queries:natural.searchQueries,
      ...(research?{newsFallbackReady:Boolean(found?.ok)}:{})},
    sources:natural.sources.length?natural.sources:recent.map(x=>({title:x.title,url:x.url})),
    checkedAt:context.checkedAt,latencyMs:Date.now()-now},
    {headers:{'Cache-Control':'private, no-store'}});
  let answer:string;
  if(webSearch&&!research)answer='بحث الإنترنت العام مش متاح حاليًا من الموديل. جرّب تاني بعد شوية، ومش هخترع نتائج بحث.';
  else if(research)answer=found?.ok&&recent.length
    ?'دورت على الإنترنت، ودي آخر العناوين المتاحة: '+recent.map((x,i)=>(i+1)+'، '+x.title+'، المصدر '+x.source).join('؛ ')+
      '. دي عناوين مش تأكيد لحركة السعر، ولازم نراجع بيانات السوق قبل أي صفقة.'
    :found?.ok?'لقيت أخبار، بس مش لاقية عناوين بتاريخ حديث كفاية أعتمد عليها دلوقتي.':
      'حاولت أبحث على الإنترنت، لكن مصدر الأخبار مش متاح دلوقتي. مش هقولك معلومة مش متأكدة منها.';
  else answer=answerFor(message,context,now,history);
  return Response.json({ok:true,answer,action:null,modelConfigured:coreModelConfigured(),
    mode:research?'NEWS_RSS_FALLBACK':webSearch?'WEB_SEARCH_UNAVAILABLE':'RULE_BASED_FALLBACK',
    analysisSkill:analysis?.skill||null,
    web:research?{ok:Boolean(found?.ok),query:found?.query,checkedAt:found?.checkedAt}:undefined,
    sources:recent,checkedAt:context.checkedAt,latencyMs:Date.now()-now},
    {headers:{'Cache-Control':'private, no-store'}});
 }catch{
  return Response.json({ok:false,message:'تعذر رد النواة دلوقتي.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}

// Show actual model readiness to the voice interface without exposing API keys.
export async function GET(){
  return Response.json({ok:true,conversationModelReady:coreModelConfigured(),
    capabilities:{voiceCommands:true,marketData:true,publicNews:true,
      publicGoogleSearch:coreModelConfigured()&&process.env.CORE_GOOGLE_SEARCH_ENABLED!=='false',
      analysisSkills:['TREND','SCALP','BREAKOUT','LIQUIDITY','COST','FORECAST','RISK','VALIDATION','MARKET_REVIEW'],
      openConversation:coreModelConfigured()}},
    {headers:{'Cache-Control':'private, no-store'}});
}
