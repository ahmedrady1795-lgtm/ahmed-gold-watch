import {getRuntimeEnv} from '../../../lib/runtime';
import {getMarketData,getQuoteData,getMt5BridgeStatus} from '../../../lib/market-hub';
import {getKillSwitch} from '../../../lib/admin-state';
export const dynamic='force-dynamic';

async function probe<T>(fn:()=>Promise<T>){
  const started=Date.now();
  try{const value=await fn();return {ok:true,status:200,latencyMs:Date.now()-started,detail:null,value};}
  catch(e){return {ok:false,status:0,latencyMs:Date.now()-started,detail:e instanceof Error?e.message:'probe failed',value:null};}
}
function goldSessionOpen(now:number){
  const d=new Date(now),day=d.getUTCDay(),h=d.getUTCHours()+d.getUTCMinutes()/60;
  if(day===6)return false;
  if(day===0&&h<22)return false;
  if(day===5&&h>=21)return false;
  if(day>=1&&day<=4&&h>=21&&h<22)return false;
  return true;
}

export async function GET(){
  const env=getRuntimeEnv(),started=Date.now(),now=Date.now(),goldOpen=goldSessionOpen(now);
  const [quoteProbe,marketRaw,kill]=await Promise.all([
    probe(()=>getQuoteData()),
    probe(()=>getMarketData({force:true})),
    getKillSwitch()
  ]);

  const marketValue:any=marketRaw.value;
  const marketReady=Boolean(marketRaw.ok&&marketValue?.pricesReady);
  const market={
    ok:marketReady,
    required:goldOpen,
    state:marketReady?'ready':goldOpen?'unavailable':'market_closed',
    status:marketReady?200:goldOpen?503:200,
    latencyMs:marketRaw.latencyMs,
    detail:marketRaw.ok&&!marketValue?.pricesReady?(marketValue?.errors||[]).join(' | ').slice(0,500):marketRaw.detail,
    pricesReady:Boolean(marketValue?.pricesReady),
    newsReady:Boolean(marketValue?.newsReady),
    source:marketValue?.priceSource||null
  };

  const quoteValue:any=quoteProbe.value,quotePrice=Number(quoteValue?.price);
  const quoteAvailable=Boolean(quoteProbe.ok&&Number.isFinite(quotePrice)&&quotePrice>0&&quoteValue?.status!=='unavailable');
  const quote={
    ok:quoteAvailable,
    required:true,
    status:quoteAvailable?200:503,
    latencyMs:quoteProbe.latencyMs,
    detail:quoteProbe.detail,
    source:quoteValue?.source||null,
    marketStatus:quoteValue?.status||'unavailable',
    price:quoteAvailable?quotePrice:null
  };

  const bridgeConfigured=Boolean(env.MT5_BRIDGE_TOKEN),execution=env.MT5_AUTOTRADE_ENABLED==='true',mt5=getMt5BridgeStatus();
  const backgroundConfigured=Boolean(env.TWELVE_DATA_API_KEY);
  const coreMarketReady=quote.ok&&(market.ok||!goldOpen);
  const status=coreMarketReady?'healthy':quote.ok||market.ok?'degraded':'halted';

  return Response.json({
    ok:status!=='halted',
    status,
    checkedAt:Date.now(),
    latencyMs:Date.now()-started,
    session:{goldOpen,state:goldOpen?'open':'closed'},
    services:{
      quote,
      market,
      backtest:{configured:true,source:'Binance Futures XAUUSDT proxy',requiresApiKey:false,optional:false},
      journal:{mode:'vercel-memory + browser-local',optional:false},
      paperTrading:{mode:'server-journal'},
      background:{configured:backgroundConfigured,optional:true,state:backgroundConfigured?'configured':'not_configured'},
      news:{configured:true,primary:Boolean(env.TRADING_ECONOMICS_API_KEY)?'Trading Economics':'Free USD calendar fallback',ready:Boolean(marketValue?.newsReady),optionalForTechnical:true},
      adminSafety:{killSwitch:kill.enabled,killSwitchUpdatedAt:kill.updatedAt},
      mt5Bridge:{
        configured:bridgeConfigured,
        optional:true,
        state:!bridgeConfigured?'not_configured':mt5.fresh?'ready':'not_ready',
        connected:mt5.connected,
        fresh:mt5.fresh,
        candlesFresh:mt5.candlesFresh,
        executionEnabled:execution,
        symbol:mt5.status?.symbol??null
      }

    },
    safety:{failClosed:true,providerFallback:true,marketDataHub:true,mt5QuotePriority:true,mt5CandlePriority:true,autoRetry:true,marketRegimeGate:true,riskEngineLocal:true,executionQualityMonitor:true}
  },{headers:{'Cache-Control':'private, no-store'}});
}
