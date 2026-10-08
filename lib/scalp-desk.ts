import {getMarketSnapshot} from './market-hub';
import {getBtcMarket} from './btc-market';
import {buildScalpPlans,type ScalpQuote} from './scalp-opportunities';
import {updateScalpLedger} from './scalp-paper-ledger';
import {getRuntimeEnv} from './runtime';
import {getCoinbaseServerQuote} from './server-tick-brain';

function session(now:number){const d=new Date(now),day=d.getUTCDay(),h=d.getUTCHours()+d.getUTCMinutes()/60;return day!==6&&!(day===0&&h<22)&&!(day===5&&h>=21)&&!(day>=1&&day<=4&&h>=21&&h<22);}
function envNumber(key:string){const raw=(getRuntimeEnv() as Record<string,unknown>)[key]??process.env[key];if(raw==null||raw==='')return null;const n=Number(raw);return Number.isFinite(n)&&n>=0&&n<=100?n:null;}
async function btcQuote(source:string):Promise<ScalpQuote>{
  const kraken=/Kraken/i.test(source);
  const streaming=kraken?null:getCoinbaseServerQuote();
  if(streaming)return streaming;
  const r=await fetch(kraken?'https://api.kraken.com/0/public/Ticker?pair=XBTUSD':'https://api.exchange.coinbase.com/products/BTC-USD/ticker',{cache:'no-store',signal:AbortSignal.timeout(5000),headers:{'User-Agent':'AhmedGoldCommand/1.0','Accept':'application/json'}});
  if(!r.ok)throw new Error('BTC quote HTTP '+r.status);
  const j=await r.json(),row=kraken?Object.values(j?.result||{})[0] as any:j;
  const price=Number(kraken?row?.c?.[0]:row?.price),bid=Number(kraken?row?.b?.[0]:row?.bid),ask=Number(kraken?row?.a?.[0]:row?.ask);
  if(!Number.isFinite(price)||price<=0)throw new Error('BTC quote unavailable');
  const parsed=kraken?Date.now():Date.parse(row?.time);
  return {price,at:Number.isFinite(parsed)?parsed:null,bid:Number.isFinite(bid)?bid:null,ask:Number.isFinite(ask)?ask:null,source:kraken?'Kraken XBT/USD':'Coinbase BTC-USD'};
}
let cached:any=null,cachedAt=0;
let pending:Promise<any>|null=null;
export async function getScalpDesk(){
  const now=Date.now();
  if(cached&&now-cachedAt<2000)return cached;
  if(pending)return pending;
  pending=(async()=>{
    const [goldResult,btcResult]=await Promise.allSettled([getMarketSnapshot(),getBtcMarket()]);
    const make=(asset:'GOLD'|'BTC',market:any,quote:ScalpQuote,events:any[],newsReady:boolean)=>{
      const at=Date.now();
      const input={asset,c1:market?.c1||[],c5:market?.c5||[],candleSource:market?.priceSource||market?.source||'unavailable',quote,now:at,events,newsReady,marketOpen:asset==='BTC'||session(at),feeBps:envNumber('SCALP_'+asset+'_FEE_BPS'),slippageBps:envNumber('SCALP_'+asset+'_SLIPPAGE_BPS')};
      const plans=buildScalpPlans(input);
      return {asset,checkedAt:at,quote,candleSource:input.candleSource,plans,ledger:updateScalpLedger(asset,plans,quote,at,input.c1),data:{m1AgeMs:input.c1.length?at-(input.c1.filter((c:any)=>c.time+60000<=at).at(-1)?.time+60000):null,quoteAgeMs:quote.at?at-quote.at:null,newsReady}};
    };
    const goldSnap=goldResult.status==='fulfilled'?goldResult.value:null;
    const market=btcResult.status==='fulfilled'?btcResult.value:null;
    const q=goldSnap?.quote;
    const events=goldSnap?.market.events||[],newsReady=Boolean(goldSnap?.market.newsReady&&Date.now()-goldSnap.market.checkedAt<120000);
    let bq:ScalpQuote={price:null,at:null,source:market?.source||'unavailable'};
    if(market)bq=await btcQuote(market.source).catch(()=>bq);
    const gold=make('GOLD',goldSnap?.market,{price:q?.price??null,at:q?.sourceTime??null,bid:q?.bid,ask:q?.ask,source:q?.source||'unavailable'},events,newsReady);
    const bitcoin=make('BTC',market,bq,events,newsReady);
    cached={ok:true,version:'scalp-desk-v1',checkedAt:Date.now(),gold,bitcoin};cachedAt=Date.now();return cached;
  })();
  try{return await pending;}finally{pending=null;}
}
