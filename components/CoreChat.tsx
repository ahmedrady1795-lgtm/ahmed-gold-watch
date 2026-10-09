'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {BrainCircuit,Mic,MicOff,Trash2,Volume2,Zap} from 'lucide-react';

type Message={id:number;role:'user'|'core';text:string};
type VoiceAction=
  |{type:'REFRESH_ANALYSIS'}
  |{type:'SET_ASSET';asset:'ALL'|'GOLD'|'BTC'}
  |{type:'NAVIGATE';section:'core-console'|'market-overview'|'scalp-opportunities'|'market-forecast'|'market-news'}
  |{type:'STOP_VOICE'};
type CoreChatProps={data:any;desk:any;onCommand?:(command:VoiceAction)=>void};
const cleanNumber=(v:any)=>Number.isFinite(Number(v))?Number(v):null;

function compactContext(data:any,desk:any){
  const pick=(key:'gold'|'bitcoin',label:string)=>{
    const x=data?.[key]||{},f=x.forwardMove||{},r=x.recommendation||{},d=desk?.[key]||{};
    return {label,price:cleanNumber(x.price??x.livePulse?.price),side:r.action||x.marketLead?.side||f.side||'WAIT',confidence:cleanNumber(r.confidence??f.confidence),quality:r.quality||'',forecastSide:f.side||'WAIT',forecastConfidence:cleanNumber(f.confidence),target:cleanNumber(f.target),reason:f.reason||d.plans?.[0]?.reason||'لا يوجد سبب مسجل',checkedAt:Number(x.livePulse?.sourceTime||data?.checkedAt||Date.now()),scalp:(d.plans||[]).slice(0,2).map((p:any)=>({horizon:p.horizon,status:p.status,side:p.side||'WAIT',reason:p.reason||p.blockers?.[0]||'لا يوجد سبب مسجل',netRR:cleanNumber(p.netRR),cost:cleanNumber(p.cost)}))};
  };
  return {checkedAt:Number(data?.checkedAt||Date.now()),gold:pick('gold','الذهب'),bitcoin:pick('bitcoin','البيتكوين')};
}

export default function CoreChat({data,desk,onCommand}:CoreChatProps){
  // The voice-first surface keeps a short in-memory history for context,
  // but never renders a text chat or asks the user to type.
  const [messages,setMessages]=useState<Message[]>([]);
  // Voice recognition callbacks are long-lived: always read the latest turns,
  // never the messages array captured when the microphone first started.
  const messagesRef=useRef<Message[]>([]);
  const rememberTurn=(role:'user'|'core',text:string,id:number)=>{
    const next=[...messagesRef.current,{id,role,text}].slice(-32);
    messagesRef.current=next;
    setMessages(next);
  };
  const [busy,setBusy]=useState(false);
  const [listening,setListening]=useState(false);
  const [liveVoice,setLiveVoice]=useState(false);
  const [speaking,setSpeaking]=useState(false);
  const [voiceError,setVoiceError]=useState('');
  const [arabicVoices,setArabicVoices]=useState<Array<{id:string;name:string;lang:string}>>([]);
  const [selectedVoiceURI,setSelectedVoiceURI]=useState('');
  const selectedVoiceRef=useRef('');
  const [intelligenceMode,setIntelligenceMode]=useState<'checking'|'smart'|'basic'>('checking');
  const [modelReady,setModelReady]=useState<boolean|null>(null);
  const [modelConnection,setModelConnection]=useState<'not_tested'|'confirmed'|'failed'>('not_tested');
  const [researchSources,setResearchSources]=useState<Array<{title:string;url:string}>>([]);
  const [researchUsed,setResearchUsed]=useState(false);
  const [analysisSkill,setAnalysisSkill]=useState('');
  const recognitionRef=useRef<any>(null);
  const liveVoiceRef=useRef(false);
  const speakingRef=useRef(false);
  const busyRef=useRef(false);
  const voiceBufferRef=useRef('');
  const interimVoiceRef=useRef('');
  const voiceSendTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const voicesRef=useRef<SpeechSynthesisVoice[]>([]);
  const speechTokenRef=useRef(0);
  const speechWatchRef=useRef<number|null>(null);
  const audioContextRef=useRef<any>(null);
  const nextId=useRef(1);
  const context=useMemo(()=>compactContext(data,desk),[data,desk]);
  // The microphone callback may outlive multiple market snapshots.
  const latestMarketContext=useRef(context);
  latestMarketContext.current=context;

  useEffect(()=>{
    let mounted=true;
    fetch('/api/core-chat',{cache:'no-store',signal:AbortSignal.timeout(5000)})
      .then(r=>r.json()).then(j=>{if(mounted){setModelReady(Boolean(j?.conversationModelReady));setModelConnection(j?.modelConnection==='confirmed'?'confirmed':j?.modelConnection==='failed'?'failed':'not_tested');}})
      .catch(()=>{if(mounted)setModelReady(null);});
    return()=>{mounted=false;};
  },[]);

  useEffect(()=>{
    if(typeof window==='undefined'||!('speechSynthesis' in window))return;
    const loadVoices=()=>{
      const found=window.speechSynthesis.getVoices();
      voicesRef.current=found;
      const arabic=found.filter(v=>/^ar(?:[-_]|$)/i.test(v.lang))
        .map(v=>({id:v.voiceURI,name:v.name,lang:v.lang}));
      setArabicVoices(arabic);
      const selected=found.find(v=>v.voiceURI===selectedVoiceRef.current);
      if(!selected){
        const preferred=found.find(v=>/^ar[-_]EG$/i.test(v.lang))||
          found.find(v=>/^ar(?:[-_]|$)/i.test(v.lang));
        selectedVoiceRef.current=preferred?.voiceURI||'';
        setSelectedVoiceURI(selectedVoiceRef.current);
      }
    };
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
    if(voiceSendTimerRef.current)clearTimeout(voiceSendTimerRef.current);
    voiceBufferRef.current='';interimVoiceRef.current='';
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
        if(result?.isFinal&&text){voiceBufferRef.current=(voiceBufferRef.current+' '+text).trim();interimVoiceRef.current='';}
        else if(text)interimVoiceRef.current=text;
      }
      if(continuous&&voiceBufferRef.current&&!busyRef.current&&!speakingRef.current){
        if(voiceSendTimerRef.current)clearTimeout(voiceSendTimerRef.current);
        voiceSendTimerRef.current=setTimeout(()=>{
          const message=voiceBufferRef.current.trim();
          voiceBufferRef.current='';interimVoiceRef.current='';
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
      // Safari sometimes ends a recognition turn with a transcript that has
      // never been marked final; keep it instead of silently discarding it.
      if(liveVoiceRef.current&&!busyRef.current&&!speakingRef.current){
        const pending=(voiceBufferRef.current||interimVoiceRef.current).trim();
        if(pending){
          if(voiceSendTimerRef.current)clearTimeout(voiceSendTimerRef.current);
          voiceSendTimerRef.current=setTimeout(()=>{
            if(!liveVoiceRef.current||busyRef.current||speakingRef.current)return;
            voiceBufferRef.current='';interimVoiceRef.current='';
            void submitVoice(pending);
          },300);
        }else window.setTimeout(()=>startRecognition(true),350);
      }
    };
    recognitionRef.current=recognition;
    setVoiceError('');
    setListening(true);
    try{recognition.start();return true;}catch{setListening(false);setVoiceError('تعذر تشغيل الميكروفون. أعد الضغط على زر بدء الكلام.');return false;}
  };
  // These substitutions are spoken only; the model response text remains unchanged.
  // Web Speech on iOS frequently reads Latin trading abbreviations letter by letter.
  const textForSpeech=(value:string)=>{
    const glossary:Array<[RegExp,string]>=[
      [/\bXAUUSD\b/gi,'الذهب مقابل الدولار'],
      [/\bBTCUSDT?\b/gi,'بيتكوين مقابل الدولار'],
      [/\bEURUSD\b/gi,'اليورو مقابل الدولار'],
      [/\bMT5\b/gi,'ميتا تريدر خمسة'],
      [/\bM15\b/gi,'فريم الخمستاشر دقيقة'],
      [/\bM5\b/gi,'فريم الخمس دقايق'],
      [/\bM3\b/gi,'فريم التلات دقايق'],
      [/\bM1\b/gi,'فريم الدقيقة'],
      [/\bH4\b/gi,'فريم الأربع ساعات'],
      [/\bSL\b/gi,'وقف الخسارة'],
      [/\bTP\b/gi,'جني الربح'],
      [/\bRR\b/gi,'نسبة العائد للمخاطرة'],
      [/\bBTC\b/gi,'بيتكوين'],
      [/\bAI\b/gi,'ذكاء اصطناعي'],
      [/\bGemini\b/gi,'جيميناي'],
      [/\bExness\b/gi,'إكسنس'],
      [/([0-9]+(?:[.,][0-9]+)?)\s*%/g,'$1 في المية'],
    ];
    let valueForVoice=value.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,'$1')
      .replace(/https?:\/\/\S+/g,'رابط').replace(/[\x60*_#~]+/g,' ');
    for(const [pattern,spoken] of glossary)valueForVoice=valueForVoice.replace(pattern,spoken);
    return valueForVoice.replace(/\s+/g,' ').trim();
  };
  const speechChunks=(text:string)=>{
    const compact=textForSpeech(text);
    if(!compact)return [];
    const sentences=compact.replace(/([.!؟؛])\s+/g,'$1\n').split('\n').filter(Boolean);
    const chunks:string[]=[];
    let current='';
    for(const sentence of (sentences.length?sentences:[compact])){
      for(const word of sentence.trim().split(' ')){
        const next=current?`${current} ${word}`:word;
        if(next.length>150&&current){chunks.push(current);current=word;}else current=next;
      }
      if(current){chunks.push(current);current='';}
    }
    return chunks;
  };
  const arabicVoice=()=>{
    const voices=voicesRef.current.length?voicesRef.current:typeof window!=='undefined'&&'speechSynthesis' in window?window.speechSynthesis.getVoices():[];
    return voices.find(v=>v.voiceURI===selectedVoiceRef.current)||
      voices.find(v=>/^ar[-_]EG$/i.test(v.lang))||
      voices.find(v=>/^ar(?:[-_]|$)/i.test(v.lang))||null;
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
      utterance.lang=usingDefaultVoice?'ar':(preferredVoice?.lang||'ar');
      if(preferredVoice&&!usingDefaultVoice)utterance.voice=preferredVoice;
      utterance.rate=.9;
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
  const testSpeech=()=>{unlockAudio(true);speak('أيوه، أنا سامعاك. اتكلم معايا براحتك. هنبص على الذهب وفريم الخمس دقايق، ونشوف السعر رايح على فين.');};
  const submitVoice=async(text:string)=>{
    const clean=text.trim();
    if(!clean||busyRef.current)return;
    recognitionRef.current?.stop();
    const history=messagesRef.current.slice(-18).map(item=>({role:item.role,text:item.text.slice(0,650)}));
    rememberTurn('user',clean,nextId.current++);
    setBusyState(true);
    try{
      const response=await fetch('/api/core-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:clean,context:latestMarketContext.current,history}),signal:AbortSignal.timeout(16000)});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok)throw new Error(payload?.message||'تعذر الرد');
      rememberTurn('core',String(payload.answer||''),nextId.current++);
      const replyMode=String(payload.mode||'');
      if(replyMode==='CORE_AI'){setIntelligenceMode('smart');setModelConnection('confirmed');}
      else if(replyMode==='MODEL_UNAVAILABLE'){setIntelligenceMode('basic');setModelConnection('failed');}
      else if(replyMode==='RULE_BASED_FALLBACK'||replyMode==='WEB_SEARCH_UNAVAILABLE'){setIntelligenceMode('basic');}
      setResearchUsed(Boolean(payload.web?.searchConfirmed));
      setAnalysisSkill(String(payload.analysisSkill||''));
      setResearchSources(Array.isArray(payload.sources)?payload.sources.slice(0,5)
        .filter((x:any)=>typeof x?.url==='string'&&/^https:\/\//i.test(x.url))
        .map((x:any)=>({title:String(x.title||x.source||'مصدر').slice(0,90),url:String(x.url)})):[]);
      if(payload?.action?.type==='STOP_VOICE'){stopVoice();return;}
      if(payload?.action)onCommand?.(payload.action as VoiceAction);
      speak(payload.answer);
    }catch{
      const fallback='معلش، الرد اتأخر. ممكن تعيد آخر حتة قلتها؟';
      rememberTurn('core',fallback,nextId.current++);
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
    voiceBufferRef.current='';interimVoiceRef.current='';
    if(!startRecognition(true)){liveVoiceRef.current=false;setLiveVoice(false);}
  };
  const clearConversation=()=>{messagesRef.current=[];setMessages([]);setVoiceError('');voiceBufferRef.current='';interimVoiceRef.current='';setResearchSources([]);setResearchUsed(false);setAnalysisSkill('');};
  useEffect(()=>()=>{liveVoiceRef.current=false;recognitionRef.current?.stop();if(voiceSendTimerRef.current)clearTimeout(voiceSendTimerRef.current);clearSpeechWatch();if(typeof window!=='undefined')window.speechSynthesis?.cancel();},[]);

  const selectedNativeVoice=arabicVoices.find(v=>v.id===selectedVoiceURI);
  const egyptianSpeechAvailable=Boolean(selectedNativeVoice&&/^ar[-_]EG$/i.test(selectedNativeVoice.lang));
  const status=voiceError?'الصوت محتاج تفعيل':speaking?'النواة بترد عليك صوتيًا':busy?'بحلل سؤالك بسرعة':listening?'سامعك… اتكلم دلوقتي':liveVoice?'قول سؤالك بصوتك':'اضغط «ابدأ الكلام» وابدأ سؤالك';
  const hint=voiceError?voiceError:liveVoice?'لما تخلص جملتك، النواة هترد بالصوت المتاح على جهازك وتسمع السؤال اللي بعده تلقائيًا.':'مش هتحتاج تكتب؛ كل الحوار هيكون بالصوت.';

  return <section id="core-console" className="core-console voice-only" aria-labelledby="core-console-title">
    <div className="core-console-visual">
      <div className="core-network" aria-hidden="true">
        <svg viewBox="0 0 360 220" role="presentation"><path d="M35 50L120 28L190 80L285 42L330 105L248 168L160 132L62 180L35 50M120 28L160 132M190 80L248 168M62 180L190 80M35 50L160 132M285 42L248 168"/></svg>
        <span className="core-node node-a"/><span className="core-node node-b"/><span className="core-node node-c"/><span className="core-node node-d"/><span className="core-node node-e"/><span className="core-node node-f"/>
        <span className="core-orbit orbit-one"/><span className="core-orbit orbit-two"/><div className="core-emblem"><BrainCircuit size={33}/><small>CORE</small></div>
      </div>
      <div className="core-identity"><span className="core-kicker"><Zap size={13}/> CORE / VOICE</span><h2 id="core-console-title">النواة الصوتية</h2><p>اتكلم بحرية بالمصري؛ النواة تقدر تبحث وتحلل، والنطق بيتحدد حسب أصوات جهازك.</p></div>
      <div className="core-health"><i/> مصري · <b>{modelConnection==='confirmed'?'محادثة الذكاء شغالة':modelConnection==='failed'?'موديل الذكاء مش بيرد':modelReady===false?'موديل غير متصل':modelReady===true?'موديل ذكاء مُعدّ، لم يتم اختباره':'مساعد صوتي'}</b></div>
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
      <div className="core-voice-options" style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',padding:'7px 12px'}}>
        <label htmlFor="core-voice-select" style={{fontSize:12}}>صوت النواة:</label>
        <select id="core-voice-select" value={selectedVoiceURI}
          onChange={e=>{selectedVoiceRef.current=e.target.value;setSelectedVoiceURI(e.target.value);}}
          disabled={!arabicVoices.length} dir="auto"
          style={{maxWidth:'100%',padding:'5px 8px',borderRadius:8,background:'transparent',color:'inherit'}}>
          {!arabicVoices.length&&<option value="">مفيش صوت عربي متاح</option>}
          {arabicVoices.map(v=><option key={v.id} value={v.id} style={{color:'#111'}}>
            {v.name} ({v.lang}){/^ar[-_]EG$/i.test(v.lang)?' · مصري':''}
          </option>)}
        </select>
        <small style={{fontSize:11,opacity:.8}}>
          {egyptianSpeechAvailable?'صوت الجهاز محدد على ar-EG.':
           'الصوت الحالي مش مصري؛ لو مش ظاهر ar-EG فالجهاز محتاج صوت مصري أو محرك نطق خارجي.'}
        </small>
      </div>
      {(researchSources.length>0||analysisSkill)&&
        <div className="core-voice-research" style={{padding:'8px 12px',fontSize:12}}>
          {analysisSkill&&<small style={{display:'block',opacity:.85,marginBottom:5}}>تحليل قائم على بيانات الموقع · {({
            TREND:'اتجاه متعدد الفريمات',SCALP:'سكالب بعد التكلفة',BREAKOUT:'تأكيد الاختراق',
            LIQUIDITY:'سيولة وحجم تداول',COST:'تكلفة التنفيذ',FORECAST:'توقع الحركة',
            RISK:'إدارة المخاطر',VALIDATION:'اختبار الدقة',MARKET_REVIEW:'مراجعة السوق'
          } as Record<string,string>)[analysisSkill]||'فحص البيانات'}</small>}
          {researchSources.length>0&&<small style={{display:'block',marginBottom:5}}>
            {researchUsed?'مصادر بحث الإنترنت:':'مصادر أخبار متاحة:'}
          </small>}
          {researchSources.map((item,i)=><a key={item.url+i} href={item.url} target="_blank" rel="noopener noreferrer"
            style={{display:'inline-block',padding:'3px 7px',margin:'2px 4px',borderRadius:6,
              border:'1px solid rgba(130,140,170,.3)',color:'inherit',maxWidth:'96%',overflow:'hidden',
              textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {i+1} · {item.title}
          </a>)}
        </div>}

      <small className="core-note">{modelReady===false
        ?'Gemini متوقف تمامًا. المحادثة الحرة تحتاج ربط Groq أو OpenRouter بمفتاح خاص في Railway. تحليل السوق والصوت الأساسي شغالين من غيره.'
        :'اسألني عن أي موضوع. لو صوت ar-EG مش متاح على جهازك، اختيار صوت عربي تاني مش هيضمن النطق المصري الصحيح.'}</small>
    </div>
  </section>;
}
