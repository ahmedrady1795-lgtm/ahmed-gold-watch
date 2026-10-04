import {sendTelegramAlert,telegramStatus} from '../../../../lib/telegram';

export const dynamic='force-dynamic';

const MIN_ENTRY_CONFIDENCE=71;
const MIN_SETUP_CONFIDENCE=58;
const lastRecommendationSignature=new Map<string,string>();
const lastOpportunitySignature=new Map<string,string>();

const n=(v:any)=>Number.isFinite(Number(v))?Number(v).toFixed(2):'—';

function recommendationSignature(asset:string,r:any){
  return [asset,r?.action||'WAIT'].join('|');
}
function opportunitySignature(asset:string,o:any){
  const target=Number.isFinite(Number(o?.target))?Math.round(Number(o.target)*10)/10:'na';
  return [asset,o?.id||'x',o?.side||'WAIT',o?.stage||'WATCH',target].join('|');
}
function recommendationBody(r:any){
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
    r?.invalidation!=null?`Invalidation / SL ${n(r.invalidation)}`:null,
    targets?`Targets: ${targets}`:null,
    'توصية تحليلية فقط؛ لا يوجد تنفيذ تداول تلقائي.'
  ].filter(Boolean).join('\n');
}
function opportunityBody(o:any){
  return [
    `الأفق: ${o?.label||o?.id||'—'}`,
    `الاتجاه: ${o?.side==='BUY'?'صعود / BUY':o?.side==='SELL'?'هبوط / SELL':'WAIT'}`,
    `الثقة: ${Math.round(Number(o?.confidence)||0)}% · الجودة: ${Math.round(Number(o?.quality)||0)}%`,
    `التوافق: ${Number(o?.agreement||0)} مقابل تعارض ${Number(o?.opposition||0)}`,
    `السعر الحالي ≈ ${n(o?.entry)}`,
    o?.target!=null?`الهدف المتوقع ≈ ${n(o.target)}`:null,
    o?.invalidation!=null?`الإلغاء ≈ ${n(o.invalidation)}`:null,
    o?.reason?String(o.reason):null,
    'هذه فرصة مستقلة من محرك Multi-Opportunity وليست صفقة منفذة.'
  ].filter(Boolean).join('\n');
}

export async function POST(request:Request){
  const status=telegramStatus();
  if(!status.configured||!status.enabled){
    return Response.json({ok:true,configured:status.configured,enabled:status.enabled,sent:false,reason:'telegram_disabled'});
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
    let entries=0,setups=0,deduped=0;
    const states:Record<string,any>={};

    for(const [asset,node] of [['BTC',data.bitcoin],['GOLD',data.gold]] as const){
      const rec:any=(node as any)?.recommendation;
      const recConfidence=Math.round(Number(rec?.confidence)||0);
      const entryActive=Boolean(rec?.active&&(rec?.action==='BUY'||rec?.action==='SELL')&&recConfidence>=MIN_ENTRY_CONFIDENCE);
      const prevEntry=lastRecommendationSignature.get(asset)||'';

      const opportunities=(Array.isArray((node as any)?.opportunities)?(node as any).opportunities:[])
        .filter((o:any)=>o&&(o.side==='BUY'||o.side==='SELL')&&(o.stage==='SETUP'||o.stage==='ENTRY')&&Number(o.confidence)>=MIN_SETUP_CONFIDENCE)
        .sort((a:any,b:any)=>(b.stage==='ENTRY'?1:0)-(a.stage==='ENTRY'?1:0)||Number(b.quality||0)-Number(a.quality||0))
        .slice(0,2);

      states[asset]={
        finalEntry:entryActive,
        finalAction:rec?.action||'WAIT',
        finalConfidence:recConfidence,
        masterState:(node as any)?.master?.state||null,
        opportunities:opportunities.map((o:any)=>({id:o.id,side:o.side,stage:o.stage,confidence:o.confidence,quality:o.quality}))
      };

      if(entryActive){
        entries++;
        const sig=recommendationSignature(asset,rec);
        if(sig!==prevEntry){
          events.push(await sendTelegramAlert({
            level:'entry',
            title:`${asset} · دخول ${rec.action} · ثقة ${recConfidence}%`,
            body:recommendationBody(rec),
            key:`predator-entry:${sig}`
          }));
          lastRecommendationSignature.set(asset,sig);
        }else deduped++;
      }else if(prevEntry){
        const learning:any=(node as any)?.recommendationLearning;
        const failed=learning?.status==='FAILED';
        events.push(await sendTelegramAlert({
          level:'cancel',
          title:failed?`فشل توصية ${asset} · تم تسجيلها للتعلم`:`إلغاء توصية ${asset}`,
          body:failed
            ?`تم كسر مستوى الإلغاء قبل الهدف الأول. النواة سجلت الحالة والسياق. Adverse ${Number(learning?.failure?.adverseAtr||0).toFixed(2)} ATR.`
            :'النواة لم تعد تعتمد دخولًا نهائيًا لهذا الاتجاه.',
          key:failed?`predator-failed:${asset}:${learning?.failure?.id||Date.now()}`:`predator-cancel:${asset}:${Date.now()}`
        }));
        lastRecommendationSignature.delete(asset);
      }

      for(const o of opportunities){
        if(entryActive&&o.stage==='ENTRY'&&o.side===rec?.action)continue;
        const key=`${asset}:${o.id}`,sig=opportunitySignature(asset,o),prev=lastOpportunitySignature.get(key)||'';
        if(sig===prev){deduped++;continue;}
        setups++;
        events.push(await sendTelegramAlert({
          level:o.stage==='ENTRY'?'entry':'watch',
          title:`${asset} · ${o.stage==='ENTRY'?'دخول':'SETUP'} ${o.label} · ${o.side}`,
          body:opportunityBody(o),
          key:`predator-opportunity:${sig}`
        }));
        lastOpportunitySignature.set(key,sig);
      }
    }

    const sent=events.some((x:any)=>x?.ok===true);
    const reason=sent?'sent':entries+setups>0&&deduped>0?'deduped_active_opportunities':'no_qualified_opportunity';
    const result={
      ok:true,configured:true,enabled:true,
      minimumEntryConfidence:MIN_ENTRY_CONFIDENCE,
      minimumSetupConfidence:MIN_SETUP_CONFIDENCE,
      sent,reason,entries,setups,deduped,states,results:events
    };
    console.info('[PREDATOR-TG]',JSON.stringify({configured:true,enabled:true,sent,reason,entries,setups,deduped,states}));
    return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){
    try{
      await sendTelegramAlert({
        level:'warning',
        title:'تعذر فحص فرص النواة',
        body:e instanceof Error?e.message:'خطأ غير معروف',
        key:'predator-pulse:error'
      });
    }catch{}
    return Response.json({ok:false,message:'تعذر تشغيل Telegram opportunity pulse.'},{status:502});
  }
}
