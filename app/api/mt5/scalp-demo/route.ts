import {getRuntimeEnv} from '../../../../lib/runtime';
import {getMarketSnapshot} from '../../../../lib/market-hub';
import {scalpAnalyze} from '../../../../lib/engine';
import {trainScalpLearner} from '../../../../lib/scalp-learning';
import {commitDirection} from '../../../../lib/direction-commitment';

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
  const bidWall=bidRows.sort((a:any,b:any)=>b.price*b.volume-a.price*a.volume)[0]||null,askWall=askRows.sort((a:any,b:any)=>b.price*b.volume-a.price*a.volume)[0]||null;
  const score=side==='WAIT'?0:cap(48+Math.abs(imbalance)*.55,0,88);
  return {available:Boolean(book?.available&&bidRows.length&&askRows.length),side,score:Number(score.toFixed(1)),imbalance:Number(imbalance.toFixed(1)),bestBid,bestAsk,bidWall,askWall,bidUsd,askUsd};
}

function trajectoryStations(c1:any[],price:number,atr:number,side:Side,book:any){
  if(side==='WAIT'||!Number.isFinite(price)||price<=0||!Number.isFinite(atr)||atr<=0)return [];
  const rows=c1.slice(-100),avgVol=Math.max(1,rows.reduce((s:number,x:any)=>s+Number(x?.tickVolume||1),0)/Math.max(1,rows.length));
  const candidates:any[]=[];
  for(let i=2;i<rows.length-2;i++){
    const x=rows[i],prev1=rows[i-1],prev2=rows[i-2],next1=rows[i+1],next2=rows[i+2];
    const range=Math.max(1e-9,Number(x.high)-Number(x.low)),volRatio=cap(Number(x?.tickVolume||avgVol)/avgVol,.5,2.5);
    if(side==='BUY'&&x.high>=prev1.high&&x.high>=prev2.high&&x.high>=next1.high&&x.high>=next2.high&&x.high>price+atr*.04){
      const wick=cap((Number(x.high)-Math.max(Number(x.open),Number(x.close)))/range,0,1);
      candidates.push({price:Number(x.high),score:45+(i/rows.length)*16+volRatio*7+wick*10,kind:'LIQUIDITY_HIGH'});
    }
    if(side==='SELL'&&x.low<=prev1.low&&x.low<=prev2.low&&x.low<=next1.low&&x.low<=next2.low&&x.low<price-atr*.04){
      const wick=cap((Math.min(Number(x.open),Number(x.close))-Number(x.low))/range,0,1);
      candidates.push({price:Number(x.low),score:45+(i/rows.length)*16+volRatio*7+wick*10,kind:'LIQUIDITY_LOW'});
    }
  }
  const wall=side==='BUY'?book?.askWall:book?.bidWall;
  if(Number(wall?.price)>0&&((side==='BUY'&&Number(wall.price)>price)||(side==='SELL'&&Number(wall.price)<price))){
    candidates.push({price:Number(wall.price),score:82,kind:'BOOK_WALL'});
  }
  candidates.sort((a,b)=>side==='BUY'?a.price-b.price:b.price-a.price);
  const clustered:any[]=[];
  for(const x of candidates){
    const near=clustered.find((z:any)=>Math.abs(z.price-x.price)<=atr*.09);
    if(near){near.price=(near.price+x.price)/2;near.score=Math.max(near.score,x.score);near.kind=near.kind==='BOOK_WALL'||x.kind==='BOOK_WALL'?'BOOK_WALL':'PIVOT_CLUSTER';}
    else clustered.push({...x});
  }
  const picked=clustered.slice(0,3);
  const fallbackMult=[.22,.48,.82];
  while(picked.length<3){
    const idx=picked.length,base=picked.at(-1)?.price??price,mult=fallbackMult[idx]||(.22+idx*.28);
    const projected=idx===0?price+(side==='BUY'?1:-1)*atr*mult:base+(side==='BUY'?1:-1)*atr*(.24+idx*.10);
    picked.push({price:projected,score:38-idx*3,kind:'ATR_PROJECTION'});
  }
  return picked.map((x:any,i:number)=>{
    const pad=atr*(.045+i*.01);
    return {index:i+1,name:'P'+(i+1),center:Number(x.price.toFixed(2)),zoneLow:Number((x.price-pad).toFixed(2)),zoneHigh:Number((x.price+pad).toFixed(2)),confidence:Math.round(cap(x.score,25,88)),source:x.kind,recalcOnArrival:true};
  });
}

function interceptPlan(price:number,atr:number,side:Side,book:any){
  if(side==='WAIT'||!Number.isFinite(price)||price<=0||!Number.isFinite(atr)||atr<=0)return {side:'WAIT',status:'NO_EDGE',ready:false};
  const bestBid=Number(book?.bestBid),bestAsk=Number(book?.bestAsk),dir=side==='BUY'?1:-1;
  const spread=Number.isFinite(bestBid)&&Number.isFinite(bestAsk)&&bestAsk>bestBid?bestAsk-bestBid:atr*.02;
  const launch=side==='BUY'?(Number.isFinite(bestAsk)&&bestAsk>0?bestAsk:price):(Number.isFinite(bestBid)&&bestBid>0?bestBid:price);
  const pad=Math.max(spread*1.6,atr*.045),low=side==='BUY'?launch-pad:launch-pad*.20,high=side==='BUY'?launch+pad*.20:launch+pad;
  const chaseBoundary=launch+dir*atr*.12,ranAway=side==='BUY'?price>chaseBoundary:price<chaseBoundary;
  const inZone=price>=low&&price<=high;
  return {
    side,status:ranAway?'NO_CHASE':inZone?'READY':'WAIT_ZONE',ready:Boolean(inZone&&!ranAway),
    launchLine:Number(launch.toFixed(2)),zoneLow:Number(low.toFixed(2)),zoneHigh:Number(high.toFixed(2)),chaseBoundary:Number(chaseBoundary.toFixed(2))
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
    if(!fresh)return Response.json({ok:true,demoOnly:true,ready:false,reason:'MT5 tick/candles not fresh',checkedAt:now,liveOrderAllowed:false},{headers:{'Cache-Control':'private, no-store'}});
    const price=Number(q?.price),atr=atrNow(m.c1),spread=Number(q?.spread),costAtr=atr&&Number(atr)>0&&Number.isFinite(spread)?Math.max(.05,spread/Number(atr)+.03):.10;
    const learner=trainScalpLearner(m.c1,now,costAtr),scalp=scalpAnalyze(m.c1,m.c5,now,price),book=bookIntel((mt5 as any)?.status||mt5);
    const l=Number(scalp?.score?.long||0),s=Number(scalp?.score?.short||0),microSide:Side=l-s>=14?'BUY':s-l>=14?'SELL':'WAIT',microScore=Math.max(l,s);
    const learnerBuy=learner.side==='BUY'?Number(learner.confidence||0):0,learnerSell=learner.side==='SELL'?Number(learner.confidence||0):0;
    const bookBuy=book.side==='BUY'?book.score:0,bookSell=book.side==='SELL'?book.score:0;
    const commitBuy=l*.48+learnerBuy*.30+bookBuy*.22,commitSell=s*.48+learnerSell*.30+bookSell*.22;
    const commitment=commitDirection('mt5-intercept:'+String((mt5 as any)?.status?.symbol||(mt5 as any)?.symbol||'XAUUSDm'),commitBuy,commitSell,now,null);
    const side=commitment.side;
    const bookAligned=book.side==='WAIT'||book.side===side;
    const aligned=Boolean(side!=='WAIT'&&microSide===side&&learner.side===side&&bookAligned);
    const qualified=Boolean(aligned&&learner.ok&&learner.gate?.passed&&learner.oosAccuracy>=56&&learner.oosEdgeAtr>=.06&&learner.profitFactor>=1.20&&learner.confidence>=55&&microScore>=60&&Number.isFinite(price)&&price>0&&Number.isFinite(Number(atr))&&Number(atr)>0);
    const a=Number(atr||0),intercept=interceptPlan(price,a,side,book),stations=trajectoryStations(m.c1,price,a,side,book);
    const etaSeconds=side==='WAIT'?null:Math.round(cap(22-Math.abs(book.imbalance)*.08-Math.max(0,microScore-55)*.12,4,25));
    const trajectory={
      version:'mt5-intercept-v1',side,status:intercept.status,qualified,etaSeconds,
      current:intercept,stations,
      logic:'INTERCEPT_FIRST_THEN_RECALCULATE_EACH_STATION',
      nextAction:intercept.status==='READY'?'INTERCEPT_NOW':intercept.status==='WAIT_ZONE'?'WAIT_FOR_ZONE':intercept.status==='NO_CHASE'?'SKIP_AND_RECALCULATE':'WAIT'
    };
    const dir=side==='BUY'?1:side==='SELL'?-1:0,entry=price;
    const stopDist=a*Number(learner.exitPlan.stopAtr||.32),takeDist=a*Number(learner.exitPlan.takeAtr||.45);
    const firstStation=stations[0]?.center;
    const plan=qualified&&intercept.ready?{
      id:`scalp-intercept:${side}:${Math.floor(now/1000)}`,side,entry:Number(entry.toFixed(2)),sl:Number((entry-dir*stopDist).toFixed(2)),
      tp:Number((Number.isFinite(Number(firstStation))?Number(firstStation):entry+dir*takeDist).toFixed(2)),
      station1:stations[0]||null,station2:stations[1]||null,station3:stations[2]||null,
      maxHoldSeconds:learner.exitPlan.maxHoldSeconds,exitOnFlip:true,recalculateOnStation:true,expiresAt:now+2200
    }:null;
    return Response.json({
      ok:true,demoOnly:true,liveOrderAllowed:false,ready:true,checkedAt:now,expiresAt:now+2200,
      quote:{price:q?.price,bid:q?.bid,ask:q?.ask,spread:q?.spread,source:q?.source},
      learner:{ok:learner.ok,side:learner.side,score:learner.score,confidence:learner.confidence,oosAccuracy:learner.oosAccuracy,oosEdgeAtr:learner.oosEdgeAtr,oosGrossEdgeAtr:learner.oosGrossEdgeAtr,profitFactor:learner.profitFactor,maxDrawdownAtr:learner.maxDrawdownAtr,costAtr:learner.costAtr,gate:learner.gate,sampleCount:learner.sampleCount,preferredHoldBars:learner.preferredHoldBars,exitPlan:learner.exitPlan},
      micro:{side:microSide,score:microScore,long:l,short:s,action:scalp?.action,reason:scalp?.reason,orderBook:book},
      commitment,trajectory,plan,
      blockedBy:[...(!learner.ok?['learner_not_validated']:[]),...(!learner.gate?.passed?['final_holdout_edge_gate_failed']:[]),...(learner.side!==microSide?['learner_micro_disagree']:[]),...(!bookAligned?['orderbook_opposes_direction']:[]),...(commitment.side!==learner.side||commitment.side!==microSide?['direction_commitment_not_aligned']:[]),...(microScore<60?['micro_score_low']:[]),...(side==='WAIT'?['no_single_direction']:[]),...(intercept.status==='NO_CHASE'?['late_entry_no_chase']:[]),...(qualified&&!intercept.ready?['waiting_for_intercept_zone']:[])],
      note:'Demo-only MT5 intercept planner. يحسب منطقة الاستقبال والمحطات التالية ويعيد الحساب عند كل محطة؛ لا يصرح بأوامر MT5 حقيقية.'
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){
    return Response.json({ok:false,code:'SCALP_DEMO_SOURCE_ERROR',message:'تعذر تكوين خطة السكالب التجريبية.',detail:e instanceof Error?e.message:'unknown'},{status:502,headers:{'Cache-Control':'private, no-store'}});
  }
}
