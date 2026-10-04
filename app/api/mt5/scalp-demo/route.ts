import {getRuntimeEnv} from '../../../../lib/runtime';
import {getMarketSnapshot} from '../../../../lib/market-hub';
import {scalpAnalyze} from '../../../../lib/engine';
import {trainScalpLearner} from '../../../../lib/scalp-learning';
import {commitDirection} from '../../../../lib/direction-commitment';

export const dynamic='force-dynamic';

function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function atrNow(c:any[]){const x=c.slice(-15);if(x.length<3)return null;let sum=0,n=0;for(let i=1;i<x.length;i++){const tr=Math.max(x[i].high-x[i].low,Math.abs(x[i].high-x[i-1].close),Math.abs(x[i].low-x[i-1].close));if(Number.isFinite(tr)){sum+=tr;n++;}}return n?sum/n:null;}

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
    const price=Number(q?.price),atr=atrNow(m.c1),spread=Number(q?.spread),costAtr=atr&&Number(atr)>0&&Number.isFinite(spread)?Math.max(.05,spread/Number(atr)+.03):.10,learner=trainScalpLearner(m.c1,now,costAtr),scalp=scalpAnalyze(m.c1,m.c5,now,price);
    const l=Number(scalp?.score?.long||0),s=Number(scalp?.score?.short||0),microSide=l-s>=14?'BUY':s-l>=14?'SELL':'WAIT',microScore=Math.max(l,s);
    const learnerBuy=learner.side==='BUY'?Number(learner.confidence||0):0,learnerSell=learner.side==='SELL'?Number(learner.confidence||0):0;
    const commitBuy=l*.58+learnerBuy*.42,commitSell=s*.58+learnerSell*.42;
    const commitment=commitDirection('mt5-scalp:'+String((mt5 as any)?.symbol||'XAUUSDm'),commitBuy,commitSell,now,null);
    const side=commitment.side;
    const aligned=Boolean(side!=='WAIT'&&learner.side===side&&microSide===side);
    const qualified=Boolean(aligned&&learner.ok&&learner.gate?.passed&&learner.oosAccuracy>=56&&learner.oosEdgeAtr>=.06&&learner.profitFactor>=1.20&&learner.confidence>=55&&microScore>=60&&Number.isFinite(price)&&price>0&&Number.isFinite(Number(atr))&&Number(atr)>0);
    const a=Number(atr||0),dir=side==='BUY'?1:side==='SELL'?-1:0,entry=price;
    const stopDist=a*Number(learner.exitPlan.stopAtr||.32),takeDist=a*Number(learner.exitPlan.takeAtr||.45);
    const plan=qualified?{
      id:`scalp-demo:${side}:${Math.floor(now/1000)}`,side,entry:Number(entry.toFixed(2)),sl:Number((entry-dir*stopDist).toFixed(2)),tp:Number((entry+dir*takeDist).toFixed(2)),
      maxHoldSeconds:learner.exitPlan.maxHoldSeconds,exitOnFlip:true,expiresAt:now+2500
    }:null;
    return Response.json({
      ok:true,demoOnly:true,liveOrderAllowed:false,ready:true,checkedAt:now,expiresAt:now+2500,
      quote:{price:q?.price,bid:q?.bid,ask:q?.ask,spread:q?.spread,source:q?.source},
      learner:{ok:learner.ok,side:learner.side,score:learner.score,confidence:learner.confidence,oosAccuracy:learner.oosAccuracy,oosEdgeAtr:learner.oosEdgeAtr,oosGrossEdgeAtr:learner.oosGrossEdgeAtr,profitFactor:learner.profitFactor,maxDrawdownAtr:learner.maxDrawdownAtr,costAtr:learner.costAtr,gate:learner.gate,sampleCount:learner.sampleCount,preferredHoldBars:learner.preferredHoldBars,exitPlan:learner.exitPlan},
      micro:{side:microSide,score:microScore,long:l,short:s,action:scalp?.action,reason:scalp?.reason},
      commitment,
      plan,
      blockedBy:[...(!learner.ok?['learner_not_validated']:[]),...(!learner.gate?.passed?['final_holdout_edge_gate_failed']:[]),...(learner.side!==microSide?['learner_micro_disagree']:[]),...(commitment.side!==learner.side||commitment.side!==microSide?['direction_commitment_not_aligned']:[]),...(microScore<58?['micro_score_low']:[]),...(side==='WAIT'?['no_single_direction']:[])],
      note:'Demo scalp plan only. Directional Commitment يمنع flip-flop، وهذا endpoint لا يصرح بأي أمر MT5 حقيقي.'
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){
    return Response.json({ok:false,code:'SCALP_DEMO_SOURCE_ERROR',message:'تعذر تكوين خطة السكالب التجريبية.',detail:e instanceof Error?e.message:'unknown'},{status:502,headers:{'Cache-Control':'private, no-store'}});
  }
}
