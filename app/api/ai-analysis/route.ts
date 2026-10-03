import {analyze,defaults} from '../../../lib/engine';
import {getMarketSnapshot} from '../../../lib/market-hub';
import {getBtcMarket} from '../../../lib/btc-market';
import {aiDecision} from '../../../lib/ai-analyst';

export const dynamic='force-dynamic';
export async function GET(){
  const now=Date.now();
  try{
    const [goldSnap,btc]=await Promise.all([getMarketSnapshot(),getBtcMarket()]);
    const gm=goldSnap.market;
    const goldAnalysis=analyze(gm.c1,gm.c5,gm.c15,gm.c60,gm.events,Boolean(gm.newsReady&&now-gm.checkedAt<120000),now,defaults);
    const btcAnalysis=analyze(btc.c1,btc.c5,btc.c15,btc.c60,[],true,now,defaults);
    const btcPrice=btc.c1.at(-1)?.close??null;
    const gold=aiDecision('GOLD',goldAnalysis,{c1:gm.c1,c5:gm.c5,c15:gm.c15,c60:gm.c60},goldSnap.quote?.price??gm.c1.at(-1)?.close??null,{quote:goldSnap.quote?.source||gm.priceSource||'unknown',candles:gm.priceSource||'unknown'},now,defaults);
    const bitcoin=aiDecision('BTC',btcAnalysis,{c1:btc.c1,c5:btc.c5,c15:btc.c15,c60:btc.c60},btcPrice,{quote:btc.source,candles:btc.source},now,defaults);
    return Response.json({ok:true,model:'Quant Ensemble v2',checkedAt:now,gold,bitcoin,safety:{execution:false,guaranteed:false,failClosed:true,temporalConfirmation:true}},{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    return Response.json({ok:false,message:'تعذر تشغيل محرك التحليل المتقدم.',detail:e instanceof Error?e.message:'unknown'},{status:502,headers:{'Cache-Control':'no-store'}});
  }
}
