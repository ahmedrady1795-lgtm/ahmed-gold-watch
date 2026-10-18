'use client';

import {useEffect,useRef,useState} from 'react';
import AICommandCenter from '../components/AICommandCenter';
import NewsCommandCenter from '../components/NewsCommandCenter';
import {acceptGoldStreamPacket,sourceTimestamp,validSourceTime} from '../lib/client-market-freshness';
import {reconcileBtcChartProvider,type BtcProviderGate} from '../lib/btc-chart-source-guard';
import {shouldApplyGoldQuote} from '../lib/gold-feed-order';

const fmt=(v:any,d=2)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))
  ?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})
  :'—';

export default function Home(){
  const [assetView,setAssetView]=useState<'ALL'|'GOLD'|'BTC'>('ALL');
  const [aiData,setAiData]=useState<any>(null);
  const [chartData,setChartData]=useState<any>(null);
  const [aiError,setAiError]=useState('');
  const [busy,setBusy]=useState(false);
  const [btc,setBtc]=useState<number|null>(null);
  const [btcSource,setBtcSource]=useState('Coinbase');
  const [btcAt,setBtcAt]=useState(0);
  const [goldTick,setGoldTick]=useState<any>(null);
  const goldTickRef=useRef<any>(null);
  const [aiLastOkAt,setAiLastOkAt]=useState(0);
  const [now,setNow]=useState(Date.now());

  const aiInFlight=useRef(false);
  const aiReady=useRef(false);
  const aiFailureCount=useRef(0);
  const aiEtag=useRef('');
  const btcUiAt=useRef(0);
  const chartDataRef=useRef<any>(null);
  const btcChartProviderGate=useRef<BtcProviderGate|null>(null);

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
        aiFailureCount.current+=1;
        if(j.stale){
          // Keep the last chart as historical context, never as live advice.
          setAiLastOkAt(0);
          setAiError('التحليل الآلي متأخر عن السوق؛ جارٍ استعادة النواة. الأسعار الحية مستقلة.');
        }else if(!aiReady.current&&aiFailureCount.current>=10){
          setAiError('محرك التحليل لم ينتج قراءة حديثة بعد. جارٍ التحقق من المصادر.');
        }
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
    let closed=false,loading=false;
    const refreshChart=async()=>{
      if(loading||document.visibilityState!=='visible')return;
      loading=true;
      try{
        const r=await fetch('/api/chart-history',{cache:'no-store',signal:AbortSignal.timeout(18000)});
        const j=await r.json().catch(()=>null);
        if(r.ok&&j?.ok&&!closed){
          const guarded=reconcileBtcChartProvider(chartDataRef.current?.bitcoin??null,
            j.bitcoin??null,btcChartProviderGate.current,Date.now());
          btcChartProviderGate.current=guarded.gate;
          const next={...j,bitcoin:guarded.chart};
          chartDataRef.current=next;
          setNow(Date.now());setChartData(next);
        }
      }catch{/* Keep the last observed candles; never manufacture new ones. */}
      finally{loading=false;}
    };
    void refreshChart();
    const timer=setInterval(()=>{void refreshChart();},20000);
    return()=>{closed=true;clearInterval(timer);};
  },[]);

  useEffect(()=>{
    void loadAi();
    // Efficient conditional GET: a 304 has no JSON body and no expensive AI
    // computation. Faster polling reduces the UI delay after a NEW server
    // generation, without starting heavy analysis cycles.
    const aiTimer=setInterval(()=>{if(document.visibilityState==='visible')void loadAi();},3000);
    const clock=setInterval(()=>setNow(Date.now()),1000);
    return()=>{clearInterval(aiTimer);clearInterval(clock);};
  },[]);

  useEffect(()=>{
    let closed=false,ws:WebSocket|null=null,reconnect:ReturnType<typeof setTimeout>|undefined,lastWsTick=0;
    const loadBtc=async()=>{try{
      const r=await fetch('/api/btc?ts='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
      const j=await r.json(),p=Number(j?.price),at=sourceTimestamp(j?.sourceTime)||0;
      // A provider may return a numeric Spot or last-good price WITHOUT
      // a valid trade timestamp. Keep its price for context, not a LIVE flag.
      const timedLive=j?.status==='live'&&validSourceTime(at||null,Date.now(),10000);
      if(!closed&&r.ok&&j?.ok&&Number.isFinite(p)&&p>0&&Date.now()-lastWsTick>4000){
        setBtc(p);setBtcAt(timedLive?at:0);
        setBtcSource(String(j?.source||'BTC provider'));
      }
    }catch{}};
    const connect=()=>{
      if(closed)return;
      ws=new WebSocket('wss://ws-feed.exchange.coinbase.com');
      ws.onopen=()=>{try{ws?.send(JSON.stringify({type:'subscribe',product_ids:['BTC-USD'],channels:['ticker','heartbeat']}));}catch{}};
      ws.onmessage=e=>{try{
        const x=JSON.parse(e.data);
        if(x?.type!=='ticker'||x?.product_id!=='BTC-USD')return;
        const p=Number(x.price),at=sourceTimestamp(x.time),bid=Number(x.best_bid),ask=Number(x.best_ask);
        if(!Number.isFinite(p)||p<=0||!validSourceTime(at,Date.now()))return;
        lastWsTick=Date.now();

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
      const fresh=acceptGoldStreamPacket(tick,Date.now());
      if(!fresh)return;
      const {price,at,bid,ask}=fresh;
      const receivedAt=Date.now();
      const nextGoldTick={ok:true,price,bid,ask,sourceTime:at,receivedAt,ageMs:Math.max(0,receivedAt-at),status:'live',mode:'stream',source:'Biquote · MT5 XAUUSD WebSocket',brokerSymbol:'XAUUSD',degraded:false};
      if(!shouldApplyGoldQuote(nextGoldTick,goldTickRef.current,receivedAt,lastStreamTick))return;
      lastStreamTick=receivedAt;
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
        const r=await fetch('/api/gold-tick?ts='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(6500)});
        const j=await r.json();
        if(!r.ok||!j?.ok){nextDelay=3000;return;}
        const price=Number(j.price),bid=Number(j.bid),ask=Number(j.ask),at=sourceTimestamp(j.sourceTime)||0;
        if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)){nextDelay=3000;return;}
        const mode=String(j.mode||'external');
        nextDelay=mode==='broker'?650:mode==='external'?1800:3000;

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
        // REST can complete AFTER a WebSocket update. Never roll the displayed
        // market timestamp backwards: that produced a false temporary pause.
        if(!shouldApplyGoldQuote(nextGoldTick,goldTickRef.current,Date.now(),lastStreamTick))return;
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

  const aiGold=aiData?.gold?.livePulse;
  const aiBtc=aiData?.bitcoin?.livePulse;
  const goldPrice=goldTick?.price??aiGold?.price??aiData?.gold?.price??null;
  const goldAt=Number(goldTick?.sourceTime||aiGold?.sourceTime||0);
  const goldFresh=Boolean(goldTick?.ok&&Number(goldTick?.receivedAt||goldAt)&&now-Number(goldTick?.receivedAt||goldAt)<10000);
  const goldSourceFresh=validSourceTime(goldAt||null,now);
  const goldBrokerLive=Boolean(goldFresh&&goldSourceFresh&&goldTick?.mode==='broker');
  const goldStreamLive=Boolean(goldFresh&&goldSourceFresh&&goldTick?.mode==='stream'&&goldTick?.status==='live');
  const goldPulse=Boolean(goldFresh&&goldSourceFresh&&goldTick?.mode==='external'&&goldTick?.status==='live');
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
  // A stale WS/REST value must not hide a *newer* genuine server quote.
  // Always pair a quote's price with the timestamp of THAT SAME source.
  const aiBtcAt=sourceTimestamp(aiBtc?.sourceTime)||0;
  const btcDirectFresh=btc!=null&&Number.isFinite(btc)&&btc>0&&
    validSourceTime(btcAt||null,now,10000);
  const btcAiPrice=Number(aiBtc?.price);
  const btcAiFresh=Number.isFinite(btcAiPrice)&&btcAiPrice>0&&
    validSourceTime(aiBtcAt||null,now,10000);
  const shownBtc=btcDirectFresh?btc:btcAiFresh?btcAiPrice:
    btc??(Number.isFinite(btcAiPrice)&&btcAiPrice>0?btcAiPrice:null);
  const shownBtcAt=btcDirectFresh?btcAt:btcAiFresh?aiBtcAt:
    btcAt||aiBtcAt;
  const btcLive=Boolean(btcDirectFresh||btcAiFresh);

  return <main className="shell modern-workspace compact-sniper">
    <a className="skip-link" href="#market-forecast">انتقل إلى خريطة الحركة</a>
    <nav className="sniper-solo-nav" aria-label="سكالب الثواني">
      <a href="/scalp" className="workspace-scalp-link">سكالب الثواني ↗</a>
    </nav>
    <section className="content lite-content" aria-label="القناص الذكي">
      <NewsCommandCenter now={now}/>
      <AICommandCenter assetView="ALL" data={aiData} chartData={chartData} error={aiError} now={now} goldLive={goldTick}
        btcLive={btcLive&&shownBtc!=null?{asset:'BTC',ok:true,price:shownBtc,sourceTime:shownBtcAt}:null}/>
    </section>
  </main>;
}
