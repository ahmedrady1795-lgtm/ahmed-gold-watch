'use client';

import {useEffect,useRef,useState} from 'react';
import {Activity,RefreshCw,Wifi,WifiOff} from 'lucide-react';
import AICommandCenter from '../components/AICommandCenter';
import {computeWaveLead,type WaveLead,type WaveTick} from '../lib/wave-lead';

const fmt=(v:any,d=2)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))
  ?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})
  :'—';

export default function Home(){
  const [aiData,setAiData]=useState<any>(null);
  const [aiError,setAiError]=useState('');
  const [busy,setBusy]=useState(false);
  const [btc,setBtc]=useState<number|null>(null);
  const [btcSource,setBtcSource]=useState('Coinbase');
  const [btcAt,setBtcAt]=useState(0);
  const [goldTick,setGoldTick]=useState<any>(null);
  const [aiLastOkAt,setAiLastOkAt]=useState(0);
  const [now,setNow]=useState(Date.now());

  const btcWaveTicks=useRef<WaveTick[]>([]);
  const goldWaveTicks=useRef<WaveTick[]>([]);
  const fastWaveRef=useRef<{btc:WaveLead|null;gold:WaveLead|null}>({btc:null,gold:null});
  const aiInFlight=useRef(false);
  const aiReady=useRef(false);
  const aiFailureCount=useRef(0);
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
      const q=new URLSearchParams();
      const add=(p:string,w:WaveLead|null)=>{
        if(!w?.ok||Date.now()-w.at>2500)return;
        q.set(p+'s',w.side);q.set(p+'st',w.stage);q.set(p+'sc',String(w.score));q.set(p+'cf',String(w.confidence));q.set(p+'at',String(w.at));
      };
      add('b',fastWaveRef.current.btc);
      add('g',fastWaveRef.current.gold);
      const bl=btcWaveTicks.current.at(-1);
      if(bl&&Date.now()-bl.at<=2500)q.set('bat',String(bl.at));
      const gl=goldWaveTicks.current.at(-1);
      if(gl&&Date.now()-gl.at<=2500&&Number.isFinite(gl.price)&&gl.price>0){
        q.set('gp',String(gl.price));q.set('gt',String(gl.at));
        if(Number.isFinite(gl.bid)&&Number(gl.bid)>0)q.set('gb',String(gl.bid));
        if(Number.isFinite(gl.ask)&&Number(gl.ask)>=Number(gl.bid||0))q.set('ga',String(gl.ask));
      }
      const r=await fetch('/api/ai-analysis'+(q.size?'?'+q.toString():''),{
        cache:'no-store',
        signal:AbortSignal.timeout(12000)
      });
      const j=await r.json();
      if(!r.ok||!j?.ok)throw new Error(j?.message||'تعذر تشغيل محرك AI');
      setAiData(j);
      setAiLastOkAt(Date.now());
      aiReady.current=true;
      aiFailureCount.current=0;
      setAiError('');
      setNow(Date.now());
    }catch(e){
      aiFailureCount.current+=1;
      if(!aiReady.current&&aiFailureCount.current>=3)setAiError(e instanceof Error?e.message:'تعذر تشغيل محرك AI');
    }finally{
      aiInFlight.current=false;
      if(manual)setBusy(false);
    }
  };

  useEffect(()=>{
    void loadAi();
    const aiTimer=setInterval(()=>{if(document.visibilityState==='visible')void loadAi();},1200);
    const clock=setInterval(()=>setNow(Date.now()),5000);
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
    let closed=false,inFlight=false,timer:ReturnType<typeof setTimeout>|undefined,nextDelay=1500;
    const loadGold=async()=>{
      if(closed||inFlight)return;
      inFlight=true;
      try{
        const r=await fetch('/api/gold-tick?ts='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
        const j=await r.json();
        if(!r.ok||!j?.ok){nextDelay=3000;return;}
        const price=Number(j.price),bid=Number(j.bid),ask=Number(j.ask),at=Number(j.sourceTime)||Date.now();
        if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)){nextDelay=3000;return;}
        const mode=String(j.mode||'external');
        nextDelay=mode==='broker'?650:mode==='external'?1600:3000;
        pushWave('gold',{at,price,bid:Number.isFinite(bid)?bid:undefined,ask:Number.isFinite(ask)?ask:undefined});
        if(!closed)setGoldTick({
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
        });
      }catch{nextDelay=3000;}finally{inFlight=false;}
    };
    const loop=async()=>{
      if(closed)return;
      if(document.visibilityState==='visible')await loadGold();
      if(!closed)timer=setTimeout(loop,nextDelay);
    };
    void loop();
    return()=>{closed=true;if(timer)clearTimeout(timer);};
  },[]);

  const aiGold=aiData?.gold?.livePulse;
  const aiBtc=aiData?.bitcoin?.livePulse;
  const goldPrice=goldTick?.price??aiGold?.price??aiData?.gold?.price??null;
  const goldAt=Number(goldTick?.sourceTime||aiGold?.sourceTime||0);
  const goldFresh=Boolean(goldTick?.ok&&Number(goldTick?.receivedAt||goldAt)&&now-Number(goldTick?.receivedAt||goldAt)<10000);
  const goldBrokerLive=Boolean(goldFresh&&goldTick?.mode==='broker'&&goldAt&&now-goldAt<10000);
  const goldPulse=Boolean(goldFresh&&goldTick?.mode==='external'&&goldTick?.status==='live');
  const goldDelayed=Boolean(goldFresh&&goldTick?.mode==='external'&&goldTick?.status!=='live');
  const goldFallback=Boolean(goldFresh&&goldTick?.mode==='analysis_proxy');
  const goldLive=goldBrokerLive||goldPulse;
  const goldUsable=goldLive||goldDelayed||goldFallback;
  const goldBadge=goldBrokerLive?'LIVE MT5':goldPulse?'PULSE':goldDelayed?'DELAYED':goldFallback?'FALLBACK':'WAIT';
  const aiActive=Boolean((aiData?.ok&&aiLastOkAt&&now-aiLastOkAt<20000)||aiData?.ok);
  const shownBtc=btc??aiBtc?.price??aiData?.bitcoin?.price??null;
  const shownBtcAt=btcAt||Number(aiBtc?.sourceTime||0);
  const btcLive=Boolean(shownBtcAt&&now-shownBtcAt<10000);

  return <main className="shell">
    <header className="topbar">
      <div className="brand">
        <div className="brandmark">AG</div>
        <div><span>AHMED GOLD · AI LITE</span><strong>SCALP</strong></div>
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
      <button className="refresh" onClick={()=>void loadAi(true)} disabled={busy}>
        <RefreshCw size={17} className={busy?'spin':''}/><span>تحديث AI</span>
      </button>
    </header>

    <section className="statusrail lite-status">
      <span className={goldLive?'pill ok':goldUsable?'pill':'pill bad'}>{goldLive?<Wifi size={14}/>:<WifiOff size={14}/>} GOLD {goldBadge}</span>
      <span className={btcLive?'pill ok':'pill bad'}>{btcLive?<Wifi size={14}/>:<WifiOff size={14}/>} BTC {btcLive?'LIVE':'WAIT'}</span>
      <span className={aiActive?'pill ok':'pill neutral'}><Activity size={14}/> AI {aiActive?'ACTIVE':'SYNCING'}</span>
    </section>

    {aiError&&!aiData&&<div className="fatal"><WifiOff size={18}/><div><strong>تعذر تحديث AI</strong><span>{aiError}</span></div></div>}

    <section className="content lite-content">
      <AICommandCenter data={aiData} error={aiError} now={now} goldLive={goldTick}/>
    </section>

    <footer>Ahmed Gold AI Lite · السعر والسكالب والتوقع فقط</footer>
  </main>;
}
