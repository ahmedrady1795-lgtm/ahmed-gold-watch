'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {BrainCircuit,Mic,MicOff,Trash2,Zap} from 'lucide-react';

type Message={id:number;role:'user'|'core';text:string};
type CoreChatProps={data:any;desk:any};
const cleanNumber=(v:any)=>Number.isFinite(Number(v))?Number(v):null;

function compactContext(data:any,desk:any){
  const pick=(key:'gold'|'bitcoin',label:string)=>{
    const x=data?.[key]||{},f=x.forwardMove||{},r=x.recommendation||{},d=desk?.[key]||{};
    return {label,price:cleanNumber(x.price??x.livePulse?.price),side:r.action||x.marketLead?.side||f.side||'WAIT',confidence:cleanNumber(r.confidence??f.confidence),quality:r.quality||'',forecastSide:f.side||'WAIT',forecastConfidence:cleanNumber(f.confidence),target:cleanNumber(f.target),reason:f.reason||d.plans?.[0]?.reason||'لا يوجد سبب مسجل',checkedAt:Number(x.livePulse?.sourceTime||data?.checkedAt||Date.now()),scalp:(d.plans||[]).slice(0,2).map((p:any)=>({horizon:p.horizon,status:p.status,side:p.side||'WAIT',reason:p.reason||p.blockers?.[0]||'لا يوجد سبب مسجل',netRR:cleanNumber(p.netRR),cost:cleanNumber(p.cost)}))};
  };
  return {checkedAt:Number(data?.checkedAt||Date.now()),gold:pick('gold','الذهب'),bitcoin:pick('bitcoin','البيتكوين')};
}

export default function CoreChat({data,desk}:CoreChatProps){
  // The voice-first surface keeps a short in-memory history for context,
  // but never renders a text chat or asks the user to type.
  const [messages,setMessages]=useState<Message[]>([]);
  const [busy,setBusy]=useState(false);
  const [listening,setListening]=useState(false);
  const [liveVoice,setLiveVoice]=useState(false);
  const [speaking,setSpeaking]=useState(false);
  const [voiceError,setVoiceError]=useState('');
  const recognitionRef=useRef<any>(null);
  const liveVoiceRef=useRef(false);
  const speakingRef=useRef(false);
  const busyRef=useRef(false);
  const voiceBufferRef=useRef('');
  const voiceSendTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const nextId=useRef(1);
  const context=useMemo(()=>compactContext(data,desk),[data,desk]);

  const setBusyState=(value:boolean)=>{busyRef.current=value;setBusy(value);};
  const stopVoice=()=>{
    liveVoiceRef.current=false;
    setLiveVoice(false);
    setListening(false);
    setSpeaking(false);
    speakingRef.current=false;
    recognitionRef.current?.stop();
    if(typeof window!=='undefined')window.speechSynthesis?.cancel();
  };
  const startRecognition=(continuous=false)=>{
    if(typeof window==='undefined')return false;
    const Recognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!Recognition){setVoiceError('المتصفح لا يدعم الكلام المباشر. جرّب Chrome أو Safari محدثًا.');return false;}
    const recognition=new Recognition();
    recognition.lang='ar-EG';
    recognition.interimResults=true;
    recognition.continuous=continuous;
    recognition.onresult=(event:any)=>{
      for(let i=event.resultIndex||0;i<(event.results||[]).length;i++){
        const result=event.results[i],text=String(result?.[0]?.transcript||'').trim();
        if(result?.isFinal&&text)voiceBufferRef.current=(voiceBufferRef.current+' '+text).trim();
      }
      if(continuous&&voiceBufferRef.current&&!busyRef.current&&!speakingRef.current){
        if(voiceSendTimerRef.current)clearTimeout(voiceSendTimerRef.current);
        voiceSendTimerRef.current=setTimeout(()=>{
          const message=voiceBufferRef.current.trim();
          voiceBufferRef.current='';
          if(message)void submitVoice(message);
        },650);
      }
    };
    recognition.onerror=(event:any)=>{
      setListening(false);
      if(event?.error==='not-allowed')setVoiceError('اسمح للمتصفح بالميكروفون من إعدادات الموقع ثم جرّب مرة أخرى.');
      else if(event?.error==='audio-capture')setVoiceError('لم يتم العثور على ميكروفون متاح.');
    };
    recognition.onend=()=>{
      setListening(false);
      if(liveVoiceRef.current&&!speakingRef.current&&!busyRef.current)window.setTimeout(()=>startRecognition(true),350);
    };
    recognitionRef.current=recognition;
    setVoiceError('');
    setListening(true);
    try{recognition.start();return true;}catch{setListening(false);setVoiceError('تعذر تشغيل الميكروفون. أعد الضغط على زر بدء الكلام.');return false;}
  };
  const speak=(text:string)=>{
    if(typeof window==='undefined'||!('speechSynthesis' in window)){setVoiceError('المتصفح لا يدعم الرد الصوتي.');return;}
    speakingRef.current=true;
    setSpeaking(true);
    recognitionRef.current?.stop();
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang='ar-EG';
    utterance.rate=.98;
    utterance.pitch=1;
    utterance.onend=()=>{speakingRef.current=false;setSpeaking(false);if(liveVoiceRef.current)window.setTimeout(()=>startRecognition(true),350);};
    utterance.onerror=()=>{speakingRef.current=false;setSpeaking(false);if(liveVoiceRef.current)window.setTimeout(()=>startRecognition(true),350);};
    window.speechSynthesis.speak(utterance);
  };
  const submitVoice=async(text:string)=>{
    const clean=text.trim();
    if(!clean||busyRef.current)return;
    recognitionRef.current?.stop();
    const history=messages.slice(-8).map(item=>({role:item.role,text:item.text}));
    setMessages(prev=>[...prev,{id:nextId.current++,role:'user',text:clean}]);
    setBusyState(true);
    try{
      const response=await fetch('/api/core-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:clean,context,history}),signal:AbortSignal.timeout(7000)});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error(payload?.message||'تعذر الرد');
      setMessages(prev=>[...prev,{id:nextId.current++,role:'core',text:payload.answer}]);
      speak(payload.answer);
    }catch{
      const fallback='النواة مشغولة لحظة. اسألني تاني بعد ثانية.';
      setMessages(prev=>[...prev,{id:nextId.current++,role:'core',text:fallback}]);
      speak(fallback);
    }finally{setBusyState(false);}
  };
  const toggleLiveVoice=async()=>{
    if(liveVoice){stopVoice();return;}
    if(typeof window==='undefined')return;
    try{
      if(navigator.mediaDevices?.getUserMedia){
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        stream.getTracks().forEach(track=>track.stop());
      }
      liveVoiceRef.current=true;
      setLiveVoice(true);
      voiceBufferRef.current='';
      if(!startRecognition(true)){liveVoiceRef.current=false;setLiveVoice(false);}
    }catch{setVoiceError('لم يتم السماح بالميكروفون. اضغط سماح من نافذة المتصفح ثم أعد المحاولة.');}
  };
  const clearConversation=()=>{setMessages([]);setVoiceError('');voiceBufferRef.current='';};
  useEffect(()=>()=>{liveVoiceRef.current=false;recognitionRef.current?.stop();if(voiceSendTimerRef.current)clearTimeout(voiceSendTimerRef.current);if(typeof window!=='undefined')window.speechSynthesis?.cancel();},[]);

  const status=voiceError?'راجع إذن الميكروفون':speaking?'النواة بترد عليك صوتيًا':busy?'بحلل سؤالك بسرعة':listening?'سامعك… اتكلم دلوقتي':liveVoice?'قول سؤالك بصوتك':'اضغط «ابدأ الكلام» وابدأ سؤالك';
  const hint=voiceError?'اسمح بالميكروفون من إعدادات الموقع ثم اضغط الزر مرة أخرى.':liveVoice?'لما تخلص جملتك، النواة هتجاوبك بصوت مصري وتسمع السؤال اللي بعده تلقائيًا.':'مش هتحتاج تكتب؛ كل الحوار هيكون بالصوت.';

  return <section id="core-console" className="core-console voice-only" aria-labelledby="core-console-title">
    <div className="core-console-visual">
      <div className="core-network" aria-hidden="true">
        <svg viewBox="0 0 360 220" role="presentation"><path d="M35 50L120 28L190 80L285 42L330 105L248 168L160 132L62 180L35 50M120 28L160 132M190 80L248 168M62 180L190 80M35 50L160 132M285 42L248 168"/></svg>
        <span className="core-node node-a"/><span className="core-node node-b"/><span className="core-node node-c"/><span className="core-node node-d"/><span className="core-node node-e"/><span className="core-node node-f"/>
        <span className="core-orbit orbit-one"/><span className="core-orbit orbit-two"/><div className="core-emblem"><BrainCircuit size={33}/><small>CORE</small></div>
      </div>
      <div className="core-identity"><span className="core-kicker"><Zap size={13}/> CORE / VOICE</span><h2 id="core-console-title">النواة الصوتية</h2><p>اتكلم طبيعي، والنواة ترد عليك بصوت مصري من بيانات السوق الحالية.</p></div>
      <div className="core-health"><i/> صوت عربي · <b>سريعة</b></div>
    </div>
    <div className="core-chat-panel voice-panel">
      <div className="core-chat-head"><div><strong>اتكلم مع النواة</strong><small>{liveVoice?'الوضع الصوتي شغال':'صوت فقط · بدون شات'}</small></div><div className="core-chat-actions"><button type="button" className={'core-live-voice core-voice-primary '+(liveVoice?'active':'')} onClick={()=>void toggleLiveVoice()} aria-pressed={liveVoice} title={liveVoice?'إيقاف الصوت':'بدء الكلام'}>{liveVoice?<MicOff size={17}/>:<Mic size={17}/>}<span>{liveVoice?'إيقاف الصوت':'ابدأ الكلام'}</span></button><button type="button" className="core-clear" onClick={clearConversation} aria-label="بدء جلسة صوتية جديدة" title="بدء جلسة صوتية جديدة"><Trash2 size={15}/></button></div></div>
      <div className="core-voice-stage" aria-live="polite">
        <div className={'core-voice-orb '+(liveVoice?'active ':'')+(listening?'listening ':'')+(speaking?'speaking':'')} aria-hidden="true">{speaking?<BrainCircuit size={34}/>:<Mic size={34}/>}</div>
        <strong>{status}</strong>
        <p>{hint}</p>
        <div className="core-voice-wave" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/></div>
      </div>
      {voiceError&&<small className="core-voice-error" role="status">{voiceError}</small>}
      <small className="core-note">لا يوجد صندوق كتابة أو رسائل معروضة؛ النواة تسمعك وترد صوتيًا فقط.</small>
    </div>
  </section>;
}
