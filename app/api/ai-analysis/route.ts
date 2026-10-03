import {analyze,defaults} from '../../../lib/engine';
import {getMarketSnapshot} from '../../../lib/market-hub';
import {getBtcMarket} from '../../../lib/btc-market';
import {aiDecision} from '../../../lib/ai-analyst';

export const dynamic='force-dynamic';
async function liveBtcSpot(){
  const now=Date.now();
  const providers=[
    async()=>{const r=await fetch('https://api.exchange.coinbase.com/products/BTC-USD/ticker',{cache:'no-store',signal:AbortSignal.timeout(5000),headers:{'User-Agent':'AhmedGoldCommand/1.0'}});const j=await r.json();const price=Number(j?.price),sourceTime=Date.parse(j?.time);if(!r.ok||!Number.isFinite(price)||price<=0)throw new Error('bad coinbase live btc');return {price,source:'Coinbase live ticker',sourceTime:Number.isFinite(sourceTime)?sourceTime:now};},
    async()=>{const r=await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD',{cache:'no-store',signal:AbortSignal.timeout(5000),headers:{'User-Agent':'AhmedGoldCommand/1.0'}});const j=await r.json();const row=Object.values(j?.result||{})[0] as any,price=Number(row?.c?.[0]);if(!r.ok||!Number.isFinite(price)||price<=0)throw new Error('bad kraken live btc');return {price,source:'Kraken live ticker',sourceTime:now};},
    async()=>{const r=await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',{cache:'no-store',signal:AbortSignal.timeout(5000),headers:{'User-Agent':'AhmedGoldCommand/1.0'}});const j=await r.json();const price=Number(j?.price);if(!r.ok||!Number.isFinite(price)||price<=0)throw new Error('bad binance live btc');return {price,source:'Binance live ticker',sourceTime:now};}
  ];
  for(const provider of providers){try{return await provider();}catch{}}
  return null;
}
function atrNow(c:any[]){
  const x=c.slice(-15);if(x.length<3)return null;let sum=0,n=0;
  for(let i=1;i<x.length;i++){const tr=Math.max(x[i].high-x[i].low,Math.abs(x[i].high-x[i-1].close),Math.abs(x[i].low-x[i-1].close));if(Number.isFinite(tr)){sum+=tr;n++;}}
  return n?sum/n:null;
}
export async function GET(){
  const now=Date.now();
  try{
    const [goldSnap,btc,liveBtc]=await Promise.all([getMarketSnapshot(),getBtcMarket(),liveBtcSpot()]);
    const gm=goldSnap.market;
    const goldAnalysis=analyze(gm.c1,gm.c5,gm.c15,gm.c60,gm.events,Boolean(gm.newsReady&&now-gm.checkedAt<120000),now,defaults);
    const btcAnalysis=analyze(btc.c1,btc.c5,btc.c15,btc.c60,[],true,now,defaults);
    const closedM1=btc.c1.filter((c:any)=>c.time+60000<=now).at(-1)||btc.c1.at(-1)||null;
    const btcPrice=liveBtc?.price??btc.c1.at(-1)?.close??null;
    const a1=atrNow(btc.c1),base=closedM1?.close??btcPrice,delta=Number.isFinite(Number(btcPrice))&&Number.isFinite(Number(base))?Number(btcPrice)-Number(base):0;
    const deltaPct=base?delta/base*100:0,momentum=a1&&a1>0?Math.min(100,Math.round(Math.abs(delta)/a1*100)):0;
    const livePulse={price:btcPrice,basePrice:base,delta,deltaPct,momentum,direction:delta>0?'UP':delta<0?'DOWN':'FLAT',source:liveBtc?.source||btc.source,sourceTime:liveBtc?.sourceTime||btc.checkedAt};
    const gold=aiDecision('GOLD',goldAnalysis,{c1:gm.c1,c5:gm.c5,c15:gm.c15,c60:gm.c60},goldSnap.quote?.price??gm.c1.at(-1)?.close??null,{quote:goldSnap.quote?.source||gm.priceSource||'unknown',candles:gm.priceSource||'unknown'},now,defaults);
    const bitcoin=aiDecision('BTC',btcAnalysis,{c1:btc.c1,c5:btc.c5,c15:btc.c15,c60:btc.c60},btcPrice,{quote:liveBtc?.source||btc.source,candles:btc.source},now,defaults);
    return Response.json({ok:true,model:'Quant Ensemble v2',checkedAt:now,gold,bitcoin:{...bitcoin,livePulse},safety:{execution:false,guaranteed:false,failClosed:true,temporalConfirmation:true}},{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    return Response.json({ok:false,message:'تعذر تشغيل محرك التحليل المتقدم.',detail:e instanceof Error?e.message:'unknown'},{status:502,headers:{'Cache-Control':'no-store'}});
  }
}
