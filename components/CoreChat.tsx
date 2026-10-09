'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {BrainCircuit,Mic,MicOff,Trash2,Volume2,Zap} from 'lucide-react';

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
  const voicesRef=useRef<SpeechSynthesisVoice[]>([]);
  const speechTokenRef=useRef(0);
  const speechWatchRef=useRef<number|null>(null);
  const audioContextRef=useRef<any>(null);
  const nextId=useRef(1);
  const context=useMemo(()=>compactContext(data,desk),[data,desk]);

  useEffect(()=>{
    if(typeof window==='undefined'||!('speechSynthesis' in window))return;
    const loadVoices=()=>{voicesRef.current=window.speechSynthesis.getVoices();};
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged',loadVoices);
    return ()=>window.speechSynthesis.removeEventListener?.('voiceschanged',loadVoices);
  },[]);

  const setBusyState=(value:boolean)=>{busyRef.current=value;setBusy(value);};
  const clearSpeechWatch=()=>{
    if(speechWatchRef.current){clearTimeout(speechWatchRef.current);speechWatchRef.current=null;}
  };
  const unlockAudio=(audible=false)=>{
    if(typeof window==='undefined')return;
    try{
      const AudioContextCtor=(window as any).AudioContext||(window as any).webkitAudioContext;
      if(typeof AudioContextCtor!=='function')return;
      const audioContext=audioContextRef.current||new AudioContextCtor();
      audioContextRef.current=audioContext;
      void audioContext.resume?.();
      const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
      gain.gain.value=audible ? 0.12 : 0.0001;
      oscillator.frequency.value=760;
      oscillator.connect(gain);gain.connect(audioContext.destination);
      oscillator.start();oscillator.stop(audioContext.currentTime+(audible ? 0.2 : 0.02));
    }catch{}
  };
  const stopVoice=()=>{
    liveVoiceRef.current=false;
    setLiveVoice(false);
    setListening(false);
    setSpeaking(false);
    speakingRef.current=false;
    speechTokenRef.current+=1;
    clearSpeechWatch();
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
    recognition.onstart=()=>{setVoiceError('');setListening(true);};
    recognition.onerror=(event:any)=>{
      setListening(false);
      if(event?.error==='not-allowed')setVoiceError('اسمح للمتصفح بالميكروفون من إعدادات الموقع ثم جرّب مرة أخرى.');
      else if(event?.error==='audio-capture')setVoiceError('لم يتم العثور على ميكروفون متاح.');
      else if(event?.error==='service-not-allowed'||event?.error==='network')setVoiceError('التعرّف الصوتي غير متاح في هذا المتصفح؛ افتح الموقع في Safari أو Chrome محدث.');
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
  const speechChunks=(text:string)=>{
    const compact=text.replace(/\s+/g,' ').trim();
    if(!compact)return [];
    const sentences=compact.split(/(?:[.!؟؛:]+\s*)/).filter(Boolean);
    const chunks:string[]=[];
    let current='';
    for(const sentence of (sentences.length?sentences:[compact])){
      for(const word of sentence.trim().split(' ')){
        const next=current?`${current} ${word}`:word;
        if(next.length>180&&current){chunks.push(current);current=word;}else current=next;
      }
      if(current){chunks.push(current);current='';}
    }
    return chunks;
  };
  const arabicVoice=()=>{
    const voices=voicesRef.current.length?voicesRef.current:typeof window!=='undefined'&&'speechSynthesis' in window?window.speechSynthesis.getVoices():[];
    return voices.find(v=>/^ar(-|_)/i.test(v.lang))||voices.find(v=>/arabic|ar-eg|ar-sa/i.test(`${v.name} ${v.lang}`))||null;
  };
  const speak=(text:string)=>{
    if(typeof window==='undefined'||!('speechSynthesis' in window)||typeof (window as any).SpeechSynthesisUtterance!=='function'){
      setVoiceError('المتصفح لا يدعم تشغيل الكلام. جرّب فتح الموقع في Safari المحدث.');
      return;
    }
    const synth=window.speechSynthesis,Utterance=(window as any).SpeechSynthesisUtterance;
    const chunks=speechChunks(text);
    if(!chunks.length)return;
    const token=++speechTokenRef.current;
    const preferredVoice=arabicVoice();
    let index=0,usingDefaultVoice=false;
    clearSpeechWatch();
    speakingRef.current=true;
    // Do not show "speaking" until Web Speech reports playback starting.
    setSpeaking(false);
    setVoiceError('');
    try{recognitionRef.current?.stop();}catch{}
    unlockAudio();
    // On iOS, the first speak() MUST happen synchronously inside the tap.
    // Delaying it with setTimeout loses Safari's user activation.
    synth.cancel();
    const finish=()=>{
      if(token!==speechTokenRef.current)return;
      clearSpeechWatch();
      speakingRef.current=false;
      setSpeaking(false);
      if(liveVoiceRef.current)window.setTimeout(()=>startRecognition(true),350);
    };
    const fail=(message:string)=>{
      if(token!==speechTokenRef.current)return;
      clearSpeechWatch();
      setVoiceError(message);
      finish();
    };
    const playNext=()=>{
      if(token!==speechTokenRef.current)return;
      if(index>=chunks.length){finish();return;}
      let utterance:any;
      try{utterance=new Utterance(chunks[index]);}
      catch{fail('تعذر إنشاء الصوت في المتصفح.');return;}
      utterance.lang=usingDefaultVoice?'ar':'ar-EG';
      if(preferredVoice&&!usingDefaultVoice)utterance.voice=preferredVoice;
      utterance.rate=.96;
      utterance.pitch=1;
      utterance.volume=1;
      let started=false;
      const retryOrFail=()=>{
        if(token!==speechTokenRef.current)return;
        clearSpeechWatch();
        // A deliberate cancel during fallback must not fire an error on this utterance.
        utterance.onstart=null;
        utterance.onend=null;
        utterance.onerror=null;
        if(preferredVoice&&!usingDefaultVoice){
          usingDefaultVoice=true;
          synth.cancel();
          window.setTimeout(playNext,100);
        }else{
          fail('السماعة لم تبدأ النطق. ألغِ الصامت، ارفع صوت الوسائط، وافصل سماعة البلوتوث إن كانت متصلة، ثم اضغط «اختبار الصوت».');
        }
      };
      utterance.onstart=()=>{
        if(token!==speechTokenRef.current)return;
        started=true;
        clearSpeechWatch();
        setSpeaking(true);
        setVoiceError('');
      };
      utterance.onend=()=>{
        if(token!==speechTokenRef.current)return;
        clearSpeechWatch();
        index+=1;
        window.setTimeout(playNext,90);
      };
      utterance.onerror=(event:any)=>{
        if(token!==speechTokenRef.current)return;
        if(event?.error==='canceled'||event?.error==='interrupted'){
          // An interruption that was not initiated by a newer speech token
          // must not leave the UI stuck in "speaking".
          fail('الصوت اتوقف من المتصفح. اضغط «اختبار الصوت» لتشغيل السماعة من جديد.');
          return;
        }
        retryOrFail();
      };
      try{
        // Keep this synchronous: essential for the iOS speaker test.
        synth.speak(utterance);
        synth.resume();
        speechWatchRef.current=window.setTimeout(()=>{
          if(token!==speechTokenRef.current||started)return;
          if(synth.speaking){
            // A few Safari versions omit onstart even while speaking.
            started=true;
            setSpeaking(true);
            clearSpeechWatch();
          }else retryOrFail();
        },3500);
      }catch{retryOrFail();}
    };
    playNext();
  };
  const primeSpeech=()=>{
    unlockAudio();
    if(typeof window==='undefined'||!('speechSynthesis' in window))return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
  };
  const testSpeech=()=>{unlockAudio(true);speak('اختبار الصوت. أنا النواة، سامعاك وهرد عليك بصوت عربي.');};
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
  const toggleLiveVoice=()=>{
    if(liveVoice){stopVoice();return;}
    if(typeof window==='undefined')return;
    setVoiceError('');
    primeSpeech();
    liveVoiceRef.current=true;
    setLiveVoice(true);
    voiceBufferRef.current='';
    if(!startRecognition(true)){liveVoiceRef.current=false;setLiveVoice(false);}
  };
  const clearConversation=()=>{setMessages([]);setVoiceError('');voiceBufferRef.current='';};
  useEffect(()=>()=>{liveVoiceRef.current=false;recognitionRef.current?.stop();if(voiceSendTimerRef.current)clearTimeout(voiceSendTimerRef.current);clearSpeechWatch();if(typeof window!=='undefined')window.speechSynthesis?.cancel();},[]);

  const status=voiceError?'الصوت محتاج تفعيل':speaking?'النواة بترد عليك صوتيًا':busy?'بحلل سؤالك بسرعة':listening?'سامعك… اتكلم دلوقتي':liveVoice?'قول سؤالك بصوتك':'اضغط «ابدأ الكلام» وابدأ سؤالك';
  const hint=voiceError?voiceError:liveVoice?'لما تخلص جملتك، النواة هتجاوبك بصوت مصري وتسمع السؤال اللي بعده تلقائيًا.':'مش هتحتاج تكتب؛ كل الحوار هيكون بالصوت.';

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
      <div className="core-chat-head"><div><strong>اتكلم مع النواة</strong><small>{liveVoice?'الوضع الصوتي شغال':'صوت فقط · بدون شات'}</small></div><div className="core-chat-actions"><button type="button" className={'core-live-voice core-voice-primary '+(liveVoice?'active':'')} onClick={()=>void toggleLiveVoice()} aria-pressed={liveVoice} title={liveVoice?'إيقاف الصوت':'بدء الكلام'}>{liveVoice?<MicOff size={17}/>:<Mic size={17}/>}<span>{liveVoice?'إيقاف الصوت':'ابدأ الكلام'}</span></button><button type="button" className="core-voice-test" onClick={testSpeech} aria-label="اختبار صوت النواة" title="اختبار صوت النواة"><Volume2 size={16}/><span>اختبار الصوت</span></button><button type="button" className="core-clear" onClick={clearConversation} aria-label="بدء جلسة صوتية جديدة" title="بدء جلسة صوتية جديدة"><Trash2 size={15}/></button></div></div>
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
