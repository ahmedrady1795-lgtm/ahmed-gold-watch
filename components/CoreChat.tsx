'use client';
import {FormEvent,useEffect,useMemo,useRef,useState} from 'react';
import {BrainCircuit,Mic,MicOff,Send,Volume2,VolumeX,Zap} from 'lucide-react';

type Message={id:number;role:'user'|'core';text:string};
type CoreChatProps={data:any;desk:any};
const arSide=(v:any)=>v==='BUY'?'شراء':v==='SELL'?'بيع':'انتظار';
const cleanNumber=(v:any)=>Number.isFinite(Number(v))?Number(v):null;

function compactContext(data:any,desk:any){
  const pick=(key:'gold'|'bitcoin',label:string)=>{
    const x=data?.[key]||{},f=x.forwardMove||{},r=x.recommendation||{},d=desk?.[key]||{};
    return {label,price:cleanNumber(x.price??x.livePulse?.price),side:r.action||x.marketLead?.side||f.side||'WAIT',confidence:cleanNumber(r.confidence??f.confidence),quality:r.quality||'',forecastSide:f.side||'WAIT',forecastConfidence:cleanNumber(f.confidence),target:cleanNumber(f.target),reason:f.reason||d.plans?.[0]?.reason||'لا يوجد سبب مسجل',checkedAt:Number(x.livePulse?.sourceTime||data?.checkedAt||Date.now()),scalp:(d.plans||[]).slice(0,2).map((p:any)=>({horizon:p.horizon,status:p.status,side:p.side||'WAIT',reason:p.reason||p.blockers?.[0]||'لا يوجد سبب مسجل',netRR:cleanNumber(p.netRR),cost:cleanNumber(p.cost)}))};
  };
  return {checkedAt:Number(data?.checkedAt||Date.now()),gold:pick('gold','الذهب'),bitcoin:pick('bitcoin','البيتكوين')};
}

export default function CoreChat({data,desk}:CoreChatProps){
  const [messages,setMessages]=useState<Message[]>([{id:1,role:'core',text:'أنا النواة. اسألني عن الاتجاه، سبب الانتظار، الدخول، أو تكلفة الصفقة.'}]);
  const [draft,setDraft]=useState('');
  const [busy,setBusy]=useState(false);
  const [listening,setListening]=useState(false);
  const [voiceReply,setVoiceReply]=useState(false);
  const recognitionRef=useRef<any>(null);
  const nextId=useRef(2);
  const context=useMemo(()=>compactContext(data,desk),[data,desk]);
  const suggestions=['ما الاتجاه الآن؟','ليه مفيش دخول؟','حلل البيتكوين','ما تكلفة الصفقة؟'];

  const speak=(text:string)=>{
    if(!voiceReply||typeof window==='undefined'||!('speechSynthesis' in window))return;
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(text);utterance.lang='ar-EG';utterance.rate=.98;utterance.pitch=1;
    window.speechSynthesis.speak(utterance);
  };
  const startListening=()=>{
    if(typeof window==='undefined')return;
    const Recognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!Recognition){setDraft('الميكروفون يحتاج متصفحًا يدعم التعرف على الكلام.');return;}
    if(listening){recognitionRef.current?.stop();return;}
    const recognition=new Recognition();recognition.lang='ar-EG';recognition.interimResults=true;recognition.continuous=false;
    recognition.onresult=(event:any)=>{const text=Array.from(event.results||[]).map((x:any)=>x[0]?.transcript||'').join('');setDraft(text);};
    recognition.onerror=()=>setListening(false);recognition.onend=()=>setListening(false);recognitionRef.current=recognition;setListening(true);recognition.start();
  };
  useEffect(()=>()=>{recognitionRef.current?.stop();if(typeof window!=='undefined')window.speechSynthesis?.cancel();},[]);
  const send=async(event?:FormEvent)=>{
    event?.preventDefault();const text=draft.trim();if(!text||busy)return;
    setDraft('');setMessages(prev=>[...prev,{id:nextId.current++,role:'user',text}]);setBusy(true);
    try{
      const response=await fetch('/api/core-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,context}),signal:AbortSignal.timeout(7000)});
      const payload=await response.json().catch(()=>null);if(!response.ok||!payload?.ok)throw new Error(payload?.message||'تعذر الرد');
      setMessages(prev=>[...prev,{id:nextId.current++,role:'core',text:payload.answer}]);speak(payload.answer);
    }catch{const fallback='النواة مشغولة لحظة. استخدم بيانات الشاشة الحالية أو أعد إرسال السؤال بعد قليل.';setMessages(prev=>[...prev,{id:nextId.current++,role:'core',text:fallback}]);speak(fallback);}
    finally{setBusy(false);}
  };
  return <section id="core-console" className="core-console" aria-labelledby="core-console-title">
    <div className="core-console-visual">
      <div className="core-network" aria-hidden="true">
        <svg viewBox="0 0 360 220" role="presentation"><path d="M35 50L120 28L190 80L285 42L330 105L248 168L160 132L62 180L35 50M120 28L160 132M190 80L248 168M62 180L190 80M35 50L160 132M285 42L248 168"/></svg>
        <span className="core-node node-a"/><span className="core-node node-b"/><span className="core-node node-c"/><span className="core-node node-d"/><span className="core-node node-e"/><span className="core-node node-f"/>
        <span className="core-orbit orbit-one"/><span className="core-orbit orbit-two"/><div className="core-emblem"><BrainCircuit size={33}/><small>CORE</small></div>
      </div>
      <div className="core-identity"><span className="core-kicker"><Zap size={13}/> CORE / LIVE</span><h2 id="core-console-title">اسأل النواة</h2><p>رد سريع من حالة السوق الحالية، مع نبرة واضحة وقرار مفهوم.</p></div>
      <div className="core-health"><i/> متصلة بالبيانات · <b>سريعة</b></div>
    </div>
    <div className="core-chat-panel">
      <div className="core-chat-head"><div><strong>محادثة مباشرة</strong><small>اكتب أو استخدم الميكروفون</small></div><button type="button" className={'core-voice-toggle '+(voiceReply?'active':'')} onClick={()=>setVoiceReply(v=>!v)} aria-pressed={voiceReply} title="تشغيل صوت الرد">{voiceReply?<Volume2 size={17}/>:<VolumeX size={17}/>}<span>{voiceReply?'صوت الرد مفعل':'صوت الرد مغلق'}</span></button></div>
      <div className="core-messages" aria-live="polite">{messages.slice(-5).map(m=><div key={m.id} className={'core-message '+m.role}><span>{m.role==='core'?'النواة':'أنت'}</span><p>{m.text}</p></div>)}{busy&&<div className="core-message core typing"><span>النواة</span><p><i/><i/><i/></p></div>}</div>
      <div className="core-suggestions" aria-label="أسئلة سريعة">{suggestions.map(s=><button key={s} type="button" onClick={()=>setDraft(s)}>{s}</button>)}</div>
      <form className="core-composer" onSubmit={send}><button type="button" className={'core-mic '+(listening?'recording':'')} onClick={startListening} aria-label={listening?'إيقاف التسجيل':'تحدث مع النواة'} title={listening?'إيقاف التسجيل':'تحدث مع النواة'}>{listening?<MicOff size={19}/>:<Mic size={19}/>}</button><textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send();}}} placeholder="اكتب سؤالك للنواة…" rows={1} aria-label="رسالتك للنواة"/><button className="core-send" type="submit" disabled={!draft.trim()||busy} aria-label="إرسال السؤال"><Send size={18}/></button></form>
      <small className="core-note">النواة تشرح بيانات الموقع الحالية. الرد السريع لا يشغّل دورة تحليل جديدة.</small>
    </div>
  </section>;
}
