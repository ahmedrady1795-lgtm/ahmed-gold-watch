'use client';

import {useEffect,useRef,useState} from 'react';
import {Activity,RefreshCw,WifiOff} from 'lucide-react';
import AICommandCenter from '../components/AICommandCenter';
import FastScalpPulse from '../components/FastScalpPulse';
import NewsCommandCenter from '../components/NewsCommandCenter';
import {computeWaveLead,type WaveLead,type WaveTick} from '../lib/wave-lead';

const fmt=(v:any,d=2)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))
  ?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})
  :'—';

export default function Home(){
  const [aiData,setAiData]=useState<any>(null);
  const [aiError,setAiError]=useState('');
  const [scalpDesk,setScalpDesk]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const [btc,setBtc]=useState<number|null>(null);
  const [btcSource,setBtcSource]=useState('Coinbase');
  const [btcAt,setBtcAt]=useState(0);
  const [goldTick,setGoldTick]=useState<any>(null);
  const [marketLead,setMarketLead]=useState<{gold:any;btc:any}>({gold:null,btc:null});
  const goldTickRef=useRef<any>(null);
  const [aiLastOkAt,setAiLastOkAt]=useState(0);
  const [now,setNow]=useState(Date.now());

  const btcWaveTicks=useRef<WaveTick[]>([]);
  const goldWaveTicks=useRef<WaveTick[]>([]);
  const fastWaveRef=useRef<{btc:WaveLead|null;gold:WaveLead|null}>({btc:null,gold:null});
  const aiInFlight=useRef(false);
  const aiReady=useRef(false);
  const aiFailureCount=useRef(0);
  const aiEtag=useRef('');
  const btcUiAt=useRef(0);

  const pushWave=(asset:'btc'|'gold',tick:WaveTick)=>{
    const ref=asset==='btc'?btcWaveTicks:goldWaveTicks;
    ref.current.push(tick);
    const cutoff=tick.at-12000;
    while(ref.current.length&&ref.current[0].at<cutoff)ref.current.shift();
    if(ref.current.length>500)ref.current=ref.current.slice(-500);
    fastWaveRef.current={...fastWaveRef.current,[asset]:computeWaveLead(ref.current,tick.at)};
  };

  const loadAi=async(manual=false)=>{
    if(aiInFlight.current)return;
    aiInFlight.current=true;
    if(manual)setBusy(true);
    try{
      // Normal UI refreshes are read-only and never start the expensive analysis.
      // A manual refresh is the only browser action allowed to request a heavy cycle.
      const endpoint=manual
        ?'/api/ai-analysis?worker=1&manual=1&_='+Date.now()
        :'/api/ai-snapshot?_='+Date.now();
      const headers:Record<string,string>={};
      if(!manual&&aiEtag.current)headers['If-None-Match']=aiEtag.current;
      const r=await fetch(endpoint,{cache:'no-store',headers,signal:AbortSignal.timeout(manual?12000:4500)});
      // An unchanged generation is NOT a stalled AI or an error.
      // Skip decoding and rendering the same large JSON on every poll.
      if(!manual&&r.status===304){
        setAiLastOkAt(Date.now());
        aiFailureCount.current=0;
        return;
      }
      const j=await r.json().catch(()=>null);
      if(r.status===503&&j?.warming){
        if(!aiReady.current)setAiError('');
        return;
      }
      if(!r.ok||!j?.ok)throw new Error(j?.message||'تعذر قراءة محرك AI');
      const responseEtag=r.headers.get('ETag');
      if(!manual&&responseEtag)aiEtag.current=responseEtag;
      setAiData(j);
      setAiLastOkAt(Date.now());
      aiReady.current=true;
      aiFailureCount.current=0;
      setAiError('');
      setNow(Date.now());
    }catch(e){
      aiFailureCount.current+=1;
      if(!aiReady.current&&aiFailureCount.current>=4)setAiError(e instanceof Error?e.message:'تعذر قراءة محرك AI');
    }finally{
      aiInFlight.current=false;
      if(manual)setBusy(false);
    }
  };

  useEffect(()=>{
    let stopped=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController();
    const load=async()=>{
      try{
        if(document.visibilityState==='visible'){
          const r=await fetch('/api/scalp',{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
          const j=await r.json();
          if(!stopped&&r.ok&&j?.ok)setScalpDesk(j);
        }
      }catch{}
      if(!stopped)timer=setTimeout(load,2500);
    };
    void load();
    return()=>{stopped=true;controller.abort();clearTimeout(timer);};
  },[]);

  useEffect(()=>{
    void loadAi();
    // Efficient conditional GET: a 304 has no JSON body and no expensive AI
    // computation. Faster polling reduces the UI delay after a NEW server
    // generation, without starting heavy analysis cycles.
    const aiTimer=setInterval(()=>{if(document.visibilityState==='visible')void loadAi();},1500);
    const clock=setInterval(()=>setNow(Date.now()),2500);
    return()=>{clearInterval(aiTimer);clearInterval(clock);};
  },[]);

  useEffect(()=>{
    let closed=false,ws:WebSocket|null=null,reconnect:ReturnType<typeof setTimeout>|undefined,lastWsTick=0;
    const loadBtc=async()=>{try{
      const r=await fetch('/api/btc?ts='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
      const j=await r.json(),p=Number(j?.price),at=Number(j?.sourceTime)||Number(j?.fetchedAt)||Date.now();
      if(!closed&&r.ok&&j?.ok&&Number.isFinite(p)&&p>0&&Date.now()-lastWsTick>4000){
        setBtc(p);setBtcAt(at);setBtcSource(String(j?.source||'Coinbase'));
      }
    }catch{}};
    const connect=()=>{
      if(closed)return;
      ws=new WebSocket('wss://ws-feed.exchange.coinbase.com');
      ws.onopen=()=>{try{ws?.send(JSON.stringify({type:'subscribe',product_ids:['BTC-USD'],channels:['ticker','heartbeat']}));}catch{}};
      ws.onmessage=e=>{try{
        const x=JSON.parse(e.data);
        if(x?.type!=='ticker'||x?.product_id!=='BTC-USD')return;
        const p=Number(x.price),parsed=Date.parse(x.time),at=Number.isFinite(parsed)?parsed:Date.now(),bid=Number(x.best_bid),ask=Number(x.best_ask);
        if(!Number.isFinite(p)||p<=0)return;
        lastWsTick=Date.now();
        pushWave('btc',{at,price:p,bid:Number.isFinite(bid)?bid:undefined,ask:Number.isFinite(ask)?ask:undefined});
        if(!closed&&Date.now()-btcUiAt.current>=250){
          btcUiAt.current=Date.now();
          setBtc(p);setBtcAt(at);setBtcSource('Coinbase WebSocket');
        }
      }catch{}};
      ws.onerror=()=>ws?.close();
      ws.onclose=()=>{if(!closed)reconnect=setTimeout(connect,1500);};
    };
    connect();void loadBtc();
    const restTimer=setInterval(()=>{if(document.visibilityState==='visible')void loadBtc();},5000);
    return()=>{closed=true;clearInterval(restTimer);clearTimeout(reconnect);ws?.close();};
  },[]);

  useEffect(()=>{
    let closed=false,inFlight=false,timer:ReturnType<typeof setTimeout>|undefined,nextDelay=1800;
    let stream:WebSocket|null=null,reconnect:ReturnType<typeof setTimeout>|undefined,lastStreamTick=0,subscribed=false;
    const applyGold=(tick:any)=>{
      const bid=Number(tick?.bid),ask=Number(tick?.ask),mid=Number(tick?.mid);
      const price=Number.isFinite(mid)&&mid>0?mid:(Number.isFinite(bid)&&Number.isFinite(ask)&&ask>=bid?(bid+ask)/2:Number(tick?.price));
      const parsed=Date.parse(String(tick?.timestamp??tick?.time??tick?.lastQuoteAt??'')),at=Number.isFinite(parsed)?parsed:Date.now();
      if(!Number.isFinite(price)||price<=0)return;
      const receivedAt=Date.now();
      lastStreamTick=receivedAt;
      pushWave('gold',{at,price,bid:Number.isFinite(bid)?bid:undefined,ask:Number.isFinite(ask)?ask:undefined});
      const nextGoldTick={ok:true,price,bid:Number.isFinite(bid)&&bid>0?bid:null,ask:Number.isFinite(ask)&&ask>0?ask:null,sourceTime:at,receivedAt,ageMs:Math.max(0,receivedAt-at),status:'live',mode:'stream',source:'Biquote · MT5 XAUUSD WebSocket',brokerSymbol:'XAUUSD',degraded:false};
      goldTickRef.current=nextGoldTick;
      if(!closed)setGoldTick(nextGoldTick);
    };
    const connectStream=async()=>{
      if(closed)return;
      try{
        const nr=await fetch('https://biquote.io/hubs/tick/negotiate?negotiateVersion=1',{method:'POST',cache:'no-store'});
        const nj=await nr.json(),token=String(nj?.connectionToken||nj?.connectionId||'');
        if(!nr.ok||!token)throw new Error('Biquote negotiate failed');
        stream=new WebSocket('wss://biquote.io/hubs/tick?id='+encodeURIComponent(token));
        stream.onopen=()=>{subscribed=false;try{stream?.send(JSON.stringify({protocol:'json',version:1})+'\x1e');}catch{}};
        stream.onmessage=(event)=>{try{
          const frames=String(event.data||'').split('\x1e').filter(Boolean);
          for(const raw of frames){
            const msg=JSON.parse(raw);
            if(!subscribed&&msg&&Object.keys(msg).length===0){
              subscribed=true;
              stream?.send(JSON.stringify({type:1,invocationId:'gold-sub',target:'Subscribe',arguments:[['XAUUSD']]})+'\x1e');
              continue;
            }
            if(msg?.type===1&&msg?.target==='ReceiveTick'&&Array.isArray(msg?.arguments)){
              const tick=msg.arguments[0];
              if(String(tick?.symbol||'').toUpperCase()==='XAUUSD')applyGold(tick);
            }
          }
        }catch{}};
        stream.onerror=()=>{try{stream?.close();}catch{}};
        stream.onclose=()=>{if(!closed)reconnect=setTimeout(()=>{void connectStream();},1200);};
      }catch{if(!closed)reconnect=setTimeout(()=>{void connectStream();},1800);}
    };
    const loadGold=async()=>{
      if(closed||inFlight||Date.now()-lastStreamTick<3500)return;
      inFlight=true;
      try{
        const r=await fetch('/api/gold-tick?ts='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
        const j=await r.json();
        if(!r.ok||!j?.ok){nextDelay=3000;return;}
        const price=Number(j.price),bid=Number(j.bid),ask=Number(j.ask),at=Number(j.sourceTime)||Date.now();
        if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)){nextDelay=3000;return;}
        const mode=String(j.mode||'external');
        nextDelay=mode==='broker'?650:mode==='external'?1800:3000;
        pushWave('gold',{at,price,bid:Number.isFinite(bid)?bid:undefined,ask:Number.isFinite(ask)?ask:undefined});
        const nextGoldTick={
          ok:true,price,
          bid:Number.isFinite(bid)?bid:null,
          ask:Number.isFinite(ask)?ask:null,
          sourceTime:at,
          receivedAt:Number(j.receivedAt)||Date.now(),
          ageMs:Number(j.ageMs)||0,
          status:String(j.status||'unknown'),
          mode,
          source:String(j.source||'Gold source'),
          brokerSymbol:j.brokerSymbol||null,
          degraded:Boolean(j.degraded)
        };
        goldTickRef.current=nextGoldTick;
        if(!closed)setGoldTick(nextGoldTick);
      }catch{nextDelay=3000;}finally{inFlight=false;}
    };
    const loop=async()=>{
      if(closed)return;
      if(document.visibilityState==='visible')await loadGold();
      if(!closed)timer=setTimeout(loop,nextDelay);
    };
    void connectStream();
    void loop();
    return()=>{closed=true;if(timer)clearTimeout(timer);clearTimeout(reconnect);try{stream?.close();}catch{}};
  },[]);

  useEffect(()=>{
    let closed=false,source:EventSource|null=null,reconnect:ReturnType<typeof setTimeout>|undefined;
    let btcInFlight=false,btcTimer:ReturnType<typeof setTimeout>|undefined;

    const connectGoldLead=()=>{
      if(closed)return;
      source=new EventSource('/api/market-lead/stream');
      source.addEventListener('lead',(event:any)=>{
        try{
          const j=JSON.parse(String(event?.data||'{}'));
          if(!closed&&j?.ok)setMarketLead(prev=>({...prev,gold:j}));
        }catch{}
      });
      source.onerror=()=>{
        try{source?.close();}catch{}
        if(!closed)reconnect=setTimeout(connectGoldLead,500);
      };
    };

    const loadBtcLead=async()=>{
      if(closed||btcInFlight)return;
      btcInFlight=true;
      try{
        const r=await fetch('/api/market-lead?asset=BTC&ts='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
        const j=await r.json();
        if(!closed&&r.ok&&j?.ok)setMarketLead(prev=>({...prev,btc:j}));
      }catch{}finally{btcInFlight=false;}
    };
    const btcLoop=async()=>{
      if(closed)return;
      if(document.visibilityState==='visible')await loadBtcLead();
      if(!closed)btcTimer=setTimeout(btcLoop,1200);
    };

    connectGoldLead();
    void btcLoop();
    return()=>{
      closed=true;
      clearTimeout(reconnect);
      if(btcTimer)clearTimeout(btcTimer);
      try{source?.close();}catch{}
    };
  },[]);

  const aiGold=aiData?.gold?.livePulse;
  const aiBtc=aiData?.bitcoin?.livePulse;
  const goldPrice=goldTick?.price??aiGold?.price??aiData?.gold?.price??null;
  const goldAt=Number(goldTick?.sourceTime||aiGold?.sourceTime||0);
  const goldFresh=Boolean(goldTick?.ok&&Number(goldTick?.receivedAt||goldAt)&&now-Number(goldTick?.receivedAt||goldAt)<10000);
  const goldBrokerLive=Boolean(goldFresh&&goldTick?.mode==='broker'&&goldAt&&now-goldAt<10000);
  const goldStreamLive=Boolean(goldFresh&&goldTick?.mode==='stream'&&goldAt&&now-goldAt<10000);
  const goldPulse=Boolean(goldFresh&&goldTick?.mode==='external'&&goldTick?.status==='live');
  const goldDelayed=Boolean(goldFresh&&goldTick?.mode==='external'&&goldTick?.status!=='live');
  const goldFallback=Boolean(goldFresh&&goldTick?.mode==='analysis_proxy');
  const goldLive=goldBrokerLive||goldStreamLive||goldPulse;
  const goldUsable=goldLive||goldDelayed||goldFallback;
  const goldBadge=goldBrokerLive?'LIVE EXNESS':goldStreamLive?'LIVE':goldPulse?'PULSE':goldDelayed?'DELAYED':goldFallback?'FALLBACK':'WAIT';
  // Snapshot age is not frozen at FETCH time: age keeps growing every tick.
  // A 304 means unchanged analysis, not a new market forecast.
  const aiSnapshotAt=Number(aiData?.snapshot?.servedAt||0)-Number(aiData?.snapshot?.ageMs||0);
  const aiProducedAt=Number(aiData?.checkedAt)||aiSnapshotAt;
  const snapshotAge=aiProducedAt>0?Math.max(0,now-aiProducedAt):Infinity;
  const aiActive=Boolean(aiData?.ok&&aiLastOkAt&&now-aiLastOkAt<10000&&snapshotAge<20000);
  const shownBtc=btc??aiBtc?.price??aiData?.bitcoin?.price??null;
  const shownBtcAt=btcAt||Number(aiBtc?.sourceTime||0);
  const btcLive=Boolean(shownBtcAt&&now-shownBtcAt<10000);

  return <main className="shell">
    <header className="topbar">
      <div className="brand">
        <div className="brandmark">AG</div>
        <div><span>AHMED · LIVE MARKET</span><strong>GOLD WATCH</strong></div>
      </div>
      <div className="tickerstrip">
        <div>
          <small>XAU/USD</small>
          <b>{fmt(goldPrice)}</b>
          <em className={goldLive?'up':goldUsable?'muted':'muted'}>{goldBadge}</em>
        </div>
        <div>
          <small>BTC/USD · {btcSource}</small>
          <b>{fmt(shownBtc,2)}</b>
          <em className={btcLive?'up':'muted'}>{btcLive?'LIVE':'WAIT'}</em>
        </div>
      </div>
      <div className="topbar-actions">
        <span className={'pill '+(aiActive?'ok':'neutral')}><Activity size={14}/>{aiActive?'AI موسع محدث':Number.isFinite(snapshotAge)?'AI موسع منذ '+Math.round(snapshotAge/1000)+' ث':'جارٍ تحميل AI'}</span>
        <button className="refresh" onClick={()=>void loadAi(true)} disabled={busy} aria-label="تحديث التحليل">
          <RefreshCw size={17} className={busy?'spin':''}/><span>تحديث</span>
        </button>
      </div>
    </header>

    {aiError&&!aiData&&<div className="fatal"><WifiOff size={18}/><div><strong>تعذر تحديث AI</strong><span>{aiError}</span></div></div>}

    <section className="content lite-content">
      <FastScalpPulse desk={scalpDesk} now={now} aiAgeMs={Number.isFinite(snapshotAge)?snapshotAge:null}/>
      {aiData?.modelValidation&&<section className="panel" aria-label="جودة وصدق النماذج" style={{padding:'14px 18px'}}>
        <strong>تأهيل نماذج AI · نتائج اختبار خارج العينة</strong>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:8}}>
          {(['mlM1','mlM5','neural'] as const).map(k=>{
            const m=aiData.modelValidation[k];
            return <span key={k} className={'pill '+(m?.ready?'ok':'neutral')} title={m?.reason||''}>
              {k==='mlM1'?'ML دقيقة':k==='mlM5'?'ML خمس دقائق':'Neural'}:
              {' '}{m?.ready?'جاهز باختبار مستقل':m?.serviceOk?'تجريبي غير مؤهل':'غير متاح'}
              {' · '}{m?.oosSelectiveSamples||0} توقع مختبر
              {m?.oosSelectiveSamples>0?' · '+m.oosSelectiveAccuracyPct+'%':''}
            </span>;
          })}
        </div>
        <small>تنبؤات ML وNeural تخص البيتكوين، وليست إثبات ربح أو اختبارًا لنماذج الذهب. نتائج الوسيط الحقيقي لم تُتحقق بعد.</small>
      </section>}
      {(aiData?.gold?.directionValidation||aiData?.bitcoin?.directionValidation)&&
        <details className="panel" style={{padding:'12px 18px'}}>
          <summary><strong>اختبار اتجاه BUY/SELL المستقل · مراقبة خارج العينة</strong></summary>
          <div style={{display:'flex',gap:14,flexWrap:'wrap',marginTop:10}}>
            {(['gold','bitcoin'] as const).map(asset=>(
              (['m1','m5'] as const).map(frame=>{
                const a=aiData?.[asset]?.directionValidation?.[frame];
                if(!a)return null;
                return <div key={asset+frame} style={{minWidth:150,flex:'1 1 160px'}}>
                  <strong>{asset==='gold'?'الذهب':'البيتكوين'} · {frame.toUpperCase()}</strong>
                  <p style={{margin:'4px 0'}}>النموذج المختار: {a.selected}</p>
                  <p style={{margin:'4px 0'}}>اختبار لاحق: {a.holdout?.n??0} توقع · {Number(a.holdout?.n||0)<25?'عينة غير كافية للحكم':a.holdout?.accuracyPct==null?'غير متاح':a.holdout.accuracyPct+'%'}</p>
                  <p style={{margin:'4px 0'}}>المرجع المقارن: {Number(a.baseline?.n||0)<25?'عينة غير كافية':a.baseline?.accuracyPct==null?'—':a.baseline.accuracyPct+'%'}</p>
                  <small>{a.qualified?'اجتاز شرط التحفظ؛ يُستخدم لرفض التعارض فقط':'غير مؤهل لتغيير إشارة BUY/SELL'} · {a.status}</small>
                </div>;
              })
            ))}
          </div>
          <small>اختبار زمني على اتجاه حركة السعر بعد التكلفة التقديرية. ليس اختبارًا للنواة الكاملة، ولا إثبات ربح، ولا نتائج أوامر Exness.</small>
        </details>}
      <AICommandCenter data={scalpDesk?{...aiData,gold:{...aiData?.gold,asset:"GOLD",scalpDesk:scalpDesk.gold},bitcoin:{...aiData?.bitcoin,asset:"BTC",scalpDesk:scalpDesk.bitcoin}}:aiData} error={aiError} now={now} goldLive={goldTick} marketLead={marketLead} fastWave={fastWaveRef.current}/>
      <NewsCommandCenter events={aiData?.newsEvents||[]} now={now} featuredId={aiData?.autopilot?.nextEvent?.id||null}/>
    </section>

    <footer>Gold Watch · تحليل احتمالي ومتابعة تجريبية · ليست أوامر تنفيذ وسيط</footer>
  </main>;
}
