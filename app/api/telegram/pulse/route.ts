import {sendTelegramAlert,telegramStatus} from '../../../../lib/telegram';

export const dynamic='force-dynamic';

const MIN_RECOMMENDATION_CONFIDENCE=71;
const lastRecommendationSignature=new Map<string,string>();

const n=(v:any)=>Number.isFinite(Number(v))?Number(v).toFixed(2):'—';

function signature(asset:string,r:any){
  return [
    asset,
    r?.action||'WAIT',
    Math.round(Number(r?.confidence)||0),
    n(r?.entry),
    n(r?.invalidation),
    n(r?.targets?.scalp),
    n(r?.targets?.oneMinute),
    n(r?.targets?.fiveMinute),
    n(r?.targets?.fifteenMinute)
  ].join('|');
}

function recommendationBody(asset:string,r:any){
  const t=r?.targets||{};
  const targets=[
    t.scalp!=null?`Scalp ${n(t.scalp)}`:null,
    t.oneMinute!=null?`1m ${n(t.oneMinute)}`:null,
    t.fiveMinute!=null?`5m ${n(t.fiveMinute)}`:null,
    t.fifteenMinute!=null?`15m ${n(t.fifteenMinute)}`:null
  ].filter(Boolean).join(' · ');
  return [
    `الثقة ${Math.round(Number(r?.confidence)||0)}%`,
    `Entry ≈ ${n(r?.entry)}`,
    `Invalidation / SL ${n(r?.invalidation)}`,
    targets?`Targets: ${targets}`:null,
    'صالحة طالما لم يُكسر مستوى الإلغاء ولم ترجع النواة WAIT.'
  ].filter(Boolean).join('\n');
}

export async function POST(request:Request){
  const status=telegramStatus();
  if(!status.configured||!status.enabled){
    return Response.json({ok:true,configured:status.configured,enabled:status.enabled,sent:false,reason:'telegram_disabled',minimumConfidence:MIN_RECOMMENDATION_CONFIDENCE});
  }

  try{
    const supplied:any=await request.json().catch(()=>null);
    let data:any=supplied?.analysis?.ok?supplied.analysis:null;
    if(!data){
      const url=new URL('/api/ai-analysis',request.url);
      const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(25000),headers:{'x-predator-telegram':'1'}});
      data=await r.json();
      if(!r.ok||!data?.ok)throw new Error(data?.message||'AI analysis unavailable');
    }

    const events:any[]=[];
    for(const [asset,node] of [['BTC',data.bitcoin],['GOLD',data.gold]] as const){
      const rec:any=(node as any)?.recommendation;
      const confidence=Math.round(Number(rec?.confidence)||0);
      const active=Boolean(rec?.active&&(rec?.action==='BUY'||rec?.action==='SELL')&&confidence>=MIN_RECOMMENDATION_CONFIDENCE);
      const prev=lastRecommendationSignature.get(asset)||'';

      if(active){
        const sig=signature(asset,rec);
        if(sig!==prev){
          events.push(await sendTelegramAlert({
            level:'entry',
            title:`${asset} · ${rec.action} · ثقة ${confidence}%`,
            body:recommendationBody(asset,rec),
            key:`predator:${sig}`
          }));
          lastRecommendationSignature.set(asset,sig);
        }
      }else if(prev){
        events.push(await sendTelegramAlert({
          level:'cancel',
          title:`إلغاء توصية ${asset}`,
          body:rec?.active&&confidence<MIN_RECOMMENDATION_CONFIDENCE
            ?`الثقة هبطت إلى ${confidence}%، أقل من حد الإرسال ${MIN_RECOMMENDATION_CONFIDENCE}%.`
            :'النواة لم تعد تعتمد توصية دخول؛ الحالة الحالية WAIT/غير معتمدة.',
          key:`predator-cancel:${asset}:${Date.now()}`
        }));
        lastRecommendationSignature.delete(asset);
      }
    }

    return Response.json({
      ok:true,
      configured:true,
      enabled:true,
      minimumConfidence:MIN_RECOMMENDATION_CONFIDENCE,
      sent:events.some((x:any)=>x?.ok===true),
      results:events
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){
    try{
      await sendTelegramAlert({
        level:'warning',
        title:'تعذر فحص توصيات النواة',
        body:e instanceof Error?e.message:'خطأ غير معروف',
        key:'predator-pulse:error'
      });
    }catch{}
    return Response.json({ok:false,message:'تعذر تشغيل Telegram recommendation pulse.',minimumConfidence:MIN_RECOMMENDATION_CONFIDENCE},{status:502});
  }
}
