import {getQuoteData} from './market-hub';
type Asset='BTC'|'GOLD';
type Side='BUY'|'SELL'|'WAIT';
type Tick={at:number;price:number;bid:number|null;ask:number|null;bidQty:number|null;askQty:number|null;source:string};
type State={started:boolean;ticks:Record<Asset,Tick[]>;sockets:any[]};

declare global {
  // eslint-disable-next-line no-var
  var __predatorTickBrain: State | undefined;
}
const cap=(n:number,a=0,b=92)=>Math.max(a,Math.min(b,n));
function state():State{
  if(!globalThis.__predatorTickBrain)globalThis.__predatorTickBrain={started:false,ticks:{BTC:[],GOLD:[]},sockets:[]};
  return globalThis.__predatorTickBrain;
}
function push(asset:Asset,t:Tick){
  const s=state(),cut=t.at-30000,arr=s.ticks[asset].filter(x=>x.at>=cut);arr.push(t);s.ticks[asset]=arr.slice(-240);
}
function connect(url:string,onOpen:(ws:any)=>void,onData:(j:any)=>void){
  const WS=(globalThis as any).WebSocket;if(!WS)return;
  const open=()=>{
    let ws:any;try{ws=new WS(url);}catch{return;}
    state().sockets.push(ws);
    ws.onopen=()=>{try{onOpen(ws);}catch{}};
    ws.onmessage=(e:any)=>{try{onData(JSON.parse(typeof e.data==='string'?e.data:String(e.data)));}catch{}};
    ws.onerror=()=>{try{ws.close();}catch{}};
    ws.onclose=()=>{const t=setTimeout(open,1800);(t as any).unref?.();};
  };
  open();
}
export function startServerTickBrain(){
  const s=state();if(s.started)return;s.started=true;
  connect('wss://ws-feed.exchange.coinbase.com',
    ws=>ws.send(JSON.stringify({type:'subscribe',product_ids:['BTC-USD'],channels:['ticker']})),
    j=>{if(j?.type!=='ticker'||j?.product_id!=='BTC-USD')return;const price=Number(j.price),bid=Number(j.best_bid),ask=Number(j.best_ask);if(!Number.isFinite(price)||price<=0)return;push('BTC',{at:Date.parse(j.time)||Date.now(),price,bid:Number.isFinite(bid)?bid:null,ask:Number.isFinite(ask)?ask:null,bidQty:null,askQty:null,source:'Coinbase server WebSocket'});}
  );
  let goldBusy=false;
  const pollGold=async()=>{
    if(goldBusy)return;goldBusy=true;
    try{
      const q=await getQuoteData({forceExternal:true}),price=Number(q?.price),sourceTime=Number(q?.sourceTime);
      const observedAt=Date.now(),fetchedAt=Number(q?.fetchedAt||observedAt);
      const sourceAge=Number.isFinite(sourceTime)&&sourceTime>0?Math.max(0,observedAt-sourceTime):Infinity;
      const fetchAge=Number.isFinite(fetchedAt)&&fetchedAt>0?Math.max(0,observedAt-fetchedAt):Infinity;
      // Biquote/provider timestamps can arrive in coarse batches. A quote freshly fetched by
      // this server is still usable for micro-flow as long as the provider did not mark it closed/stale.
      const usable=q?.status!=='closed_or_stale'&&(q?.status==='live'||sourceAge<=10000||fetchAge<=5000);
      if(!usable||!Number.isFinite(price)||price<=0)return;
      const bid=Number(q?.bid),ask=Number(q?.ask);
      push('GOLD',{
        // The wave engine measures when this server observed each quote.
        // Provider timestamps can update in coarse batches and should only be used as a freshness gate above.
        at:observedAt,price,
        bid:Number.isFinite(bid)&&bid>0?bid:null,
        ask:Number.isFinite(ask)&&ask>0?ask:null,
        bidQty:null,askQty:null,
        source:String(q?.source||'Gold external quote')+(q?.status==='delayed'?' near-live fallback':'')+' server pulse'
      });
    }catch{}finally{goldBusy=false;}
  };
  void pollGold();
  const goldTimer=setInterval(()=>{void pollGold();},1500);
  (goldTimer as any).unref?.();
}
function older(arr:Tick[],now:number,ms:number){for(let i=arr.length-1;i>=0;i--)if(arr[i].at<=now-ms)return arr[i];return arr[0]||null;}
function vel(latest:Tick,old:Tick|null){return old&&old.price>0?(latest.price-old.price)/old.price*10000:0;}
export function getServerTickSignal(asset:Asset,now=Date.now()){
  const arr=state().ticks[asset].filter(x=>now-x.at<=18000),latest=arr.at(-1);if(!latest||arr.length<5||now-latest.at>4500)return null;
  const v1=vel(latest,older(arr,now,1000)),v3=vel(latest,older(arr,now,3000)),v8=vel(latest,older(arr,now,8000)),acc=v1-v3/3;
  let up=0,down=0;for(let i=1;i<arr.length;i++){if(arr[i].price>arr[i-1].price)up++;else if(arr[i].price<arr[i-1].price)down++;}
  const persistence=Math.round(Math.max(up,down)/Math.max(1,up+down)*100);
  const q=latest.bidQty!=null&&latest.askQty!=null&&latest.bidQty+latest.askQty>0?(latest.bidQty-latest.askQty)/(latest.bidQty+latest.askQty)*100:0;
  const sign=v3>0?1:v3<0?-1:0,raw=cap(v3*8,-34,34)+cap(acc*10,-24,24)+sign*Math.max(0,persistence-50)*.45+cap(q*.18,-14,14);
  const side:Side=raw>=8?'BUY':raw<=-8?'SELL':'WAIT',score=Math.round(cap(43+Math.abs(raw),0,90)),confidence=Math.round(cap(28+Math.abs(raw)*.72+Math.min(20,arr.length*.8),0,86));
  let stage='WARMING';if(side!=='WAIT'&&Math.abs(v1)>=1.1&&Math.abs(acc)>=.3&&persistence>=62)stage='IGNITION';else if(side!=='WAIT'&&Math.abs(v3)>=1.25&&persistence>=60)stage='WAVE_FORMING';else if(side!=='WAIT'&&Math.abs(v3)<=1.05&&Math.abs(acc)>=.16&&persistence>=58)stage='PRE_TRIGGER';
  return {ok:true,side,stage,score,confidence,at:latest.at,velocity1s:Number(v1.toFixed(3)),velocity3s:Number(v3.toFixed(3)),velocity8s:Number(v8.toFixed(3)),acceleration:Number(acc.toFixed(3)),persistence,bboImbalance:Number(q.toFixed(1)),samples:arr.length,source:latest.source};
}
