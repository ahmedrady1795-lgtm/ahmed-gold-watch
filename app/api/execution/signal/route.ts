import {getRuntimeEnv} from '../../../../lib/runtime';
import {analyze,defaults,type Rules} from '../../../../lib/engine';
import {getMarketSnapshot} from '../../../../lib/market-hub';
import {getKillSwitch} from '../../../../lib/admin-state';
import {getAiSnapshot} from '../../../../lib/ai-snapshot-cache';
import {assessExecutionReadiness} from '../../../../lib/execution-readiness';

export const dynamic='force-dynamic';
export const runtime='nodejs';
function safeEqual(a:string,b:string){
  if(a.length!==b.length)return false;
  let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;
}
function validTrade(t:any){
  if(!t||!['buy','sell'].includes(String(t.sideCode)))return false;
  const entry=Number(t.entry),sl=Number(t.sl),tp=Number(t.tp);
  if(![entry,sl,tp].every(n=>Number.isFinite(n)&&n>0))return false;
  const buy=t.sideCode==='buy';
  const geometry=buy?sl<entry&&entry<tp:tp<entry&&entry<sl;
  return geometry&&Math.abs(tp-entry)/Math.abs(entry-sl)>=2;
}
export async function GET(request:Request){
  const env=getRuntimeEnv(),token=env.MT5_BRIDGE_TOKEN;
  if(!token)return Response.json({ok:false,code:'BRIDGE_NOT_CONFIGURED'},{status:503});
  const auth=request.headers.get('authorization')||'';
  if(!auth.startsWith('Bearer ')||!safeEqual(auth.slice(7),token))
    return Response.json({ok:false,code:'UNAUTHORIZED'},{status:401});

  const enabled=env.MT5_AUTOTRADE_ENABLED==='true';
  const rules:Rules={...defaults,minScore:Math.min(95,Math.max(82,Number(env.MT5_MIN_SCORE||82)))};
  try{
    const [s,kill]=await Promise.all([getMarketSnapshot(),getKillSwitch()]);
    const m=s.market,q=s.quote,now=Date.now();
    const a=analyze(m.c1,m.c5,m.c15,m.c60,m.events,
      Boolean(m.newsReady&&now-m.checkedAt<120000),now,rules);
    const newsSignal=a.signal?.mode==='news';
    const baseMaxSpread=Math.max(.05,Math.min(.55,Number(env.MT5_MAX_SPREAD_USD||.55)));
    const maxSpread=newsSignal?Math.min(baseMaxSpread,Math.max(.05,Number(env.MT5_MAX_NEWS_SPREAD_USD||.60))):baseMaxSpread;
    const snap=getAiSnapshot(now);
    const preflight=assessExecutionReadiness({
      now,enabled,killEnabled:kill.enabled,tokenConfigured:!!token,
      ack:env.MT5_LIVE_ACK,expectedLogin:env.MT5_EXPECTED_LOGIN,
      expectedSymbol:env.MT5_SYMBOL||'XAUUSDm',
      mt5:s.mt5,quote:q,market:m,analysis:a,aiSnapshot:snap.payload,maxSpread
    });
    const geometryOk=validTrade(a.signal);
    const allowed=preflight.allowed&&geometryOk;
    const ttlMs=newsSignal?20000:45000,expiresAt=now+ttlMs;
    const blockedBy=[...preflight.blockedBy,...(!geometryOk?['trade_levels_or_net_rr_invalid']:[])];
    return Response.json({
      ok:true,enabled,allowed,checkedAt:now,issuedAt:now,expiresAt,
      symbol:'XAU/USD',brokerSymbolHint:env.MT5_SYMBOL||'XAUUSDm',
      quote:{price:q?.price??null,bid:q?.bid??null,ask:q?.ask??null,
        spread:q?.spread??null,status:q?.status??'unknown',source:q?.source??null},
      analysis:{state:a.state,title:a.title,reason:a.reason,score:a.score,regime:a.regime,news:a.news},
      signal:allowed?a.signal:null,blockedBy,
      preflight:{demoReady:preflight.demoReady,
        brokerAccountVerified:preflight.brokerAccountVerified,
        brokerFeedVerified:preflight.brokerFeedVerified,
        aiCoreVerified:preflight.aiCoreVerified,
        coreCheckedAt:preflight.coreCheckedAt},
      adminSafety:{killSwitch:kill.enabled,killSwitchUpdatedAt:kill.updatedAt},
      riskPolicy:{
        mode:'LOSS_MINIMIZATION',maxRiskPerTradePct:newsSignal?0.10:0.15,
        maxDailyLossPct:0.5,maxWeeklyLossPct:1.5,maxEquityDrawdownPct:3,
        maxConsecutiveLosses:2,maxOpenPositions:1,minRiskReward:2,
        maxSpreadUsd:maxSpread,newsMode:Boolean(newsSignal),failClosed:true,
        breakEvenAtR:0.45,lockProfitAtR:0.80,lockProfitR:0.10
      },
      qualityPolicy:{
        signalTtlMs:ttlMs,brokerTickFreshnessRequired:true,
        mt5QuoteMustBeFresh:true,preTradeSlippageCheck:true,
        orderCheckLatencyCheck:true,fillSlippageLogged:true,
        cancelOnSignalFlip:true,cancelOnSpreadExpansion:true,
        cancelOnStaleQuote:true,requiresFreshPredatorCore:true,
        requiresExplicitLiveAck:true,requiresPinnedBrokerAccount:true,
        highImpactNewsBlackout:true
      }
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){
    return Response.json({ok:false,code:'EXECUTION_SOURCE_ERROR',
      message:'تعذر تكوين إشارة تنفيذ آمنة.',
      detail:e instanceof Error?e.message:'unknown'},{status:502,
      headers:{'Cache-Control':'private, no-store'}});
  }
}
