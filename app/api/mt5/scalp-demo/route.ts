import {getRuntimeEnv} from '../../../../lib/runtime';
import {getMarketSnapshot,getMt5FastSignal} from '../../../../lib/market-hub';
import {scalpAnalyze} from '../../../../lib/engine';
import {trainScalpLearner} from '../../../../lib/scalp-learning';
import {buildAccumulationMap} from '../../../../lib/accumulation-map';
import {buildScalpFusion} from '../../../../lib/scalp-fusion';

export const dynamic='force-dynamic';

type Side='BUY'|'SELL'|'WAIT';
const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function atrNow(c:any[]){const x=c.slice(-15);if(x.length<3)return null;let sum=0,n=0;for(let i=1;i<x.length;i++){const tr=Math.max(x[i].high-x[i].low,Math.abs(x[i].high-x[i-1].close),Math.abs(x[i].low-x[i-1].close));if(Number.isFinite(tr)){sum+=tr;n++;}}return n?sum/n:null;}

function bookIntel(mt5:any){
  const book=mt5?.microstructure?.orderBook||{},bids=Array.isArray(book?.bids)?book.bids:[],asks=Array.isArray(book?.asks)?book.asks:[];
  const bidRows=bids.map((x:any)=>({price:Number(x?.price),volume:Number(x?.volume)})).filter((x:any)=>x.price>0&&x.volume>0);
  const askRows=asks.map((x:any)=>({price:Number(x?.price),volume:Number(x?.volume)})).filter((x:any)=>x.price>0&&x.volume>0);
  const bidUsd=bidRows.reduce((s:number,x:any)=>s+x.price*x.volume,0),askUsd=askRows.reduce((s:number,x:any)=>s+x.price*x.volume,0),total=bidUsd+askUsd;
  const imbalance=total>0?(bidUsd-askUsd)/total*100:0;
  const side:Side=imbalance>=10?'BUY':imbalance<=-10?'SELL':'WAIT';
  const bestBid=bidRows.sort((a:any,b:any)=>b.price-a.price)[0]?.price??null,bestAsk=askRows.sort((a:any,b:any)=>a.price-b.price)[0]?.price??null;
  return {available:Boolean(book?.available&&bidRows.length&&askRows.length),side,imbalance:Number(imbalance.toFixed(1)),bestBid,bestAsk,bidUsd,askUsd};
}

function liquidityFromMt5(book:any,fast:any,price:number){
  const quality=book.available?72:0;
  const buy=Math.round(cap(50+Number(book.imbalance||0)/2,8,92)),sell=100-buy;
  const mid=Number(book.bestBid)>0&&Number(book.bestAsk)>0?(Number(book.bestBid)+Number(book.bestAsk))/2:price;
  const spreadBps=Number(book.bestBid)>0&&Number(book.bestAsk)>0&&mid>0?(Number(book.bestAsk)-Number(book.bestBid))/mid*10000:0;
  return {
    ok:quality>=55,quality,side:book.side,buy,sell,strength:Math.max(buy,sell),pressure:Number(book.imbalance||0),
    book:{
      bestBid:book.bestBid,bestAsk:book.bestAsk,spreadBps,
      bboImbalance:Number(book.imbalance||0),depthImbalance:Number(book.imbalance||0),weightedImbalance:Number(book.imbalance||0),
      microprice:mid,microEdge:0,bidDepthUsd:book.bidUsd,askDepthUsd:book.askUsd,bidWall:1,askWall:1,wallSide:book.side
    },
    flow:{tradeCount:0,buyVolume:0,sellVolume:0,deltaVolume:0,deltaPct:0,priceChangeBps:0,cvdSide:'WAIT'},
    dynamics:{pressureChange:0,bidDepthChangePct:0,askDepthChangePct:0,acceleration:Number(fast?.acceleration||0)},
    absorption:{side:'WAIT',score:0,reason:'MT5 helper only',trapDetected:false,followThrough:false},
    warnings:[]
  };
}

export async function GET(request:Request){
  const env=getRuntimeEnv(),token=env.MT5_BRIDGE_TOKEN;
  if(!token)return Response.json({ok:false,code:'BRIDGE_NOT_CONFIGURED'},{status:503});
  const auth=request.headers.get('authorization')||'';
  if(!auth.startsWith('Bearer ')||!safeEqual(auth.slice(7),token))return Response.json({ok:false,code:'UNAUTHORIZED'},{status:401});
  const now=Date.now();
  try{
    const snap=await getMarketSnapshot(),m=snap.market,q=snap.quote,mt5=snap.mt5;
    const fresh=Boolean(mt5?.fresh&&mt5?.candlesFresh&&String(m?.priceSource||'').startsWith('Exness/MT5')&&q?.ok&&q?.status==='live');
    if(!fresh)return Response.json({ok:true,demoOnly:true,authority:'AMBUSH',ready:false,reason:'MT5 tick/candles not fresh',checkedAt:now,liveOrderAllowed:false},{headers:{'Cache-Control':'private, no-store'}});

    const price=Number(q?.price),atr=atrNow(m.c1),spread=Number(q?.spread);
    const costAtr=atr&&atr>0&&Number.isFinite(spread)?Math.max(.05,spread/atr+.03):.10;
    const learner=trainScalpLearner(m.c1,now,costAtr);
    const technicalHelper=scalpAnalyze(m.c1,m.c5,now,price);
    const fast=getMt5FastSignal(now);
    const book=bookIntel((mt5 as any)?.status||mt5);
    const liquidity=liquidityFromMt5(book,fast,price);
    const accumulation=buildAccumulationMap(m.c1,m.c5,price,liquidity,now);
    const ambush=buildScalpFusion(technicalHelper,liquidity,null,learner,null,price,atr,null,fast,accumulation,'GOLD');
    const plan=ambush?.ambushPlan||null;
    const trade=ambush?.trade||null;
    const ambushActive=Boolean(ambush?.action==='BUY'||ambush?.action==='SELL');

    return Response.json({
      ok:true,demoOnly:true,liveOrderAllowed:false,authority:'AMBUSH',ready:true,checkedAt:now,expiresAt:now+2200,
      quote:{price:q?.price,bid:q?.bid,ask:q?.ask,spread:q?.spread,source:q?.source},
      ambush:{
        active:ambushActive,side:ambush?.action||'WAIT',confidence:ambush?.confidence||0,
        phase:ambush?.fusionV8?.predator?.phase||'HUNT',pattern:ambush?.fusionV8?.predator?.pattern||'NO_EDGE',
        plan,trade,assistants:ambush?.fusionV8?.assistants||{},assistantCount:ambush?.fusionV8?.assistantCount||0
      },
      helpers:{
        technical:{side:technicalHelper?.helperSide||'WAIT',confidence:technicalHelper?.helperConfidence||0,score:technicalHelper?.score},
        learner:{ok:learner.ok,side:learner.side,confidence:learner.confidence,oosAccuracy:learner.oosAccuracy,profitFactor:learner.profitFactor,gate:learner.gate},
        orderBook:book,
        fastRadar:fast,
        accumulation:{side:accumulation?.side||'WAIT',phase:accumulation?.phase||'NEUTRAL',readiness:accumulation?.breakoutReadiness||0}
      },
      blockedBy:[
        ...(!ambushActive?['ambush_not_approved']:[]),
        ...(plan?.status==='CANCEL'?['ambush_plan_cancelled']:[]),
        ...(plan?.entry&&!plan.entry.ready?['waiting_for_ambush_entry_zone']:[])
      ],
      note:'Demo-only. Ambush is the only trade authority. MT5 technicals, learner, order book, fast radar and accumulation are helpers only; no independent scalp path can create a trade.'
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){
    return Response.json({ok:false,code:'AMBUSH_DEMO_SOURCE_ERROR',message:'تعذر تكوين خطة Ambush التجريبية.',detail:e instanceof Error?e.message:'unknown'},{status:502,headers:{'Cache-Control':'private, no-store'}});
  }
}
