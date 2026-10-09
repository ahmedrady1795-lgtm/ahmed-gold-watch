'use client';
import {useMemo,useRef,useState} from 'react';
import {Activity,BrainCircuit,Send,Trash2} from 'lucide-react';

// Text-only diagnostics and analysis. No microphone, speech synthesis or audio permissions.
type ConsoleAction=
  |{type:'REFRESH_ANALYSIS'}
  |{type:'SET_ASSET';asset:'ALL'|'GOLD'|'BTC'}
  |{type:'NAVIGATE';section:'core-console'|'market-overview'|'scalp-opportunities'|'market-forecast'|'market-news'};
type Turn={role:'user'|'core';text:string;id:number};
type SiteCheck={key:string;label:string;state:string;detail:string};
type SiteInspection={checkedAt:number;status:string;checks:SiteCheck[];problems?:string[]};
type Props={data:any;desk:any;onCommand?:(command:ConsoleAction)=>void};
const numberOrNull=(v:unknown)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
function compactMarketContext(data:any,desk:any){
  const pick=(key:'gold'|'bitcoin')=>{
    const asset=data?.[key]||{},prediction=asset.forwardMove||{},decision=asset.recommendation||{},scalp=desk?.[key]||{};
    return {
      price:numberOrNull(asset.price??asset.livePulse?.price),
      side:decision.action||asset.marketLead?.side||prediction.side||'WAIT',
      confidence:numberOrNull(decision.confidence??prediction.confidence),
      forecastSide:prediction.side||'WAIT',forecastConfidence:numberOrNull(prediction.confidence),
      target:numberOrNull(prediction.target),
      checkedAt:numberOrNull(asset.livePulse?.sourceTime??data?.checkedAt),
      scalp:Array.isArray(scalp.plans)?scalp.plans.slice(0,3).map((p:any)=>({
        horizon:p.horizon,status:p.status,side:p.side,
        reason:String(p.reason||p.blockers?.[0]||'').slice(0,180),
        netRR:numberOrNull(p.netRR),cost:numberOrNull(p.cost)
      })):[]
    };
  };
  return {checkedAt:numberOrNull(data?.checkedAt),gold:pick('gold'),bitcoin:pick('bitcoin')};
}
export default function CoreChat({data,desk,onCommand}:Props){
  const [query,setQuery]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [turns,setTurns]=useState<Turn[]>([]);
  const [inspection,setInspection]=useState<SiteInspection|null>(null);
  const [modelState,setModelState]=useState('');
  const [sources,setSources]=useState<Array<{title:string;url:string}>>([]);
  const nextId=useRef(1);
  const turnsRef=useRef<Turn[]>([]);
  const busyRef=useRef(false);
  const context=useMemo(()=>compactMarketContext(data,desk),[data,desk]);
  const contextRef=useRef(context);
  contextRef.current=context;

  async function ask(question:string){
    const clean=question.trim().slice(0,600);
    if(!clean||busyRef.current)return;
    busyRef.current=true;setBusy(true);setError('');setQuery('');
    const previous=turnsRef.current.slice(-18).map(x=>({role:x.role,text:x.text}));
    const userTurn:Turn={id:nextId.current++,role:'user',text:clean};
    turnsRef.current=[...turnsRef.current,userTurn].slice(-24);setTurns(turnsRef.current);
    try{
      const response=await fetch('/api/core-chat',{
        method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',
        body:JSON.stringify({message:clean,context:contextRef.current,history:previous}),
        signal:AbortSignal.timeout(16000)
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw Error(String(payload?.message||'تعذر تنفيذ الطلب'));
      const reply=String(payload.answer||'لا توجد نتيجة متاحة');
      const coreTurn:Turn={id:nextId.current++,role:'core',text:reply};
      turnsRef.current=[...turnsRef.current,coreTurn].slice(-24);setTurns(turnsRef.current);
      setModelState(String(payload.mode||''));
      setInspection(payload.mode==='SITE_INSPECTION'?payload.siteInspection??null:null);
      const raw=Array.isArray(payload.sources)?payload.sources:[];
      setSources(raw.slice(0,5).filter((x:any)=>typeof x?.url==='string'&&/^https:\/\//.test(x.url))
        .map((x:any)=>({title:String(x.title||'مصدر').slice(0,90),url:String(x.url).slice(0,1800)})));
      if(payload.action?.type&&payload.action.type!=='STOP_VOICE')onCommand?.(payload.action as ConsoleAction);
    }catch(e){
      const message=e instanceof Error&&e.name==='TimeoutError'?'الطلب اتأخر، جرّب تاني.':
        e instanceof Error&&e.message?'تعذر إكمال الطلب: '+e.message:'تعذر إكمال الطلب.';
      setError(message);
    }finally{busyRef.current=false;setBusy(false);}
  }
  const reset=()=>{if(busyRef.current)return;turnsRef.current=[];setTurns([]);setInspection(null);setSources([]);setModelState('');setError('');setQuery('');};
  return <section id="core-console" className="panel" aria-labelledby="core-console-title"
    style={{padding:'16px',marginBottom:12}}>
    <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <BrainCircuit size={26} aria-hidden="true"/>
        <div><h2 id="core-console-title" style={{margin:0,fontSize:20}}>النواة · تحليل وفحص</h2>
          <small style={{opacity:.8}}>واجهة نصية فقط، بدون ميكروفون أو صوت</small></div>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button type="button" disabled={busy} onClick={()=>void ask('افحص الموقع والخدمات')}
          style={{padding:'8px 12px',borderRadius:8,display:'flex',alignItems:'center',gap:6}}>
          <Activity size={16}/>{busy?'جاري الفحص…':'افحص الموقع'}
        </button>
        <button type="button" disabled={busy||!turns.length} onClick={reset}
          title="مسح المحادثة" aria-label="مسح المحادثة"
          style={{padding:'8px 10px',borderRadius:8}}><Trash2 size={16}/></button>
      </div>
    </header>
    <form onSubmit={e=>{e.preventDefault();void ask(query);}}
      style={{marginTop:14,display:'flex',gap:8,alignItems:'stretch'}}>
      <input aria-label="اكتب سؤالك للنواة" placeholder="اكتب سؤالك أو اطلب فحص التحليل…"
        value={query} onChange={e=>setQuery(e.target.value)} disabled={busy} dir="auto"
        style={{flex:1,minWidth:0,padding:'12px',borderRadius:9,fontSize:14}}/>
      <button type="submit" disabled={busy||!query.trim()} aria-label="إرسال السؤال"
        style={{padding:'10px 14px',borderRadius:9,display:'flex',gap:7,alignItems:'center'}}>
        <Send size={16}/>إرسال
      </button>
    </form>
    {error&&<p role="alert" style={{marginTop:10,color:'#e7a5a5'}}>{error}</p>}
    {turns.length>0&&<div aria-label="نتائج النواة" aria-live="polite"
      style={{display:'flex',flexDirection:'column',gap:8,marginTop:14}}>
      {turns.slice(-10).map(turn=><div key={turn.id} dir="auto"
        style={{padding:'10px 12px',borderRadius:10,maxWidth:'100%',whiteSpace:'pre-wrap',
          background:turn.role==='user'?'rgba(128,148,180,.11)':'rgba(110,153,185,.08)',
          border:'1px solid rgba(128,148,180,.17)'}}>
        <small style={{display:'block',opacity:.65,marginBottom:5}}>{turn.role==='user'?'سؤالك':'النواة'}</small>
        <span>{turn.text}</span>
      </div>)}
    </div>}
    {inspection&&<div aria-label="تفاصيل فحص الموقع"
      style={{marginTop:12,border:'1px solid rgba(140,155,180,.25)',borderRadius:10,padding:12}}>
      <strong>نتيجة الفحص: {inspection.status==='HEALTHY'?'المؤشرات المتاحة سليمة':
        inspection.status==='DEGRADED'?'فيه ملاحظات محتاجة متابعة':'تعذر التأكد من حالة الخدمات'}</strong>
      <div style={{display:'grid',gap:8,marginTop:9}}>
        {inspection.checks.map(item=><div key={item.key} style={{fontSize:13}}>
          <strong>{item.state==='OK'?'✓':item.state==='FAIL'?'✕':item.state==='WARN'?'!':'?'} {item.label}: </strong>
          {item.detail}
        </div>)}
      </div>
    </div>}
    {sources.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:12}}>
      {sources.map((item,i)=><a key={item.url+i} href={item.url} rel="noopener noreferrer"
        target="_blank" style={{fontSize:12,textDecoration:'underline'}}>{item.title}</a>)}
    </div>}
    {modelState==='MODEL_UNAVAILABLE'&&<small style={{display:'block',marginTop:9,opacity:.8}}>
      المحادثة الحرة محتاجة موديل بديل متوصل؛ فحص الموقع الأساسي متاح بدون موديل.
    </small>}
  </section>;
}
