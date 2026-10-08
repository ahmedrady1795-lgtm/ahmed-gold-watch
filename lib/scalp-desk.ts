import {getMarketSnapshot} from './market-hub';
import {getBtcMarket,mergeBtcCandles} from './btc-market';
import {buildScalpPlans,type ScalpQuote} from './scalp-opportunities';
import {updateScalpLedger,getScalpPaperQualityGate} from './scalp-paper-ledger';
import {getRuntimeEnv} from './runtime';
import {getCoinbaseServerQuote,getCoinbaseClosedCandles} from './server-tick-brain';
import {readScalpLiquidity,observeScalpPlanHold} from './scalp-liquidity';
import {getBtcLiquidity} from './liquidity-intelligence';

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
let lastScalpDiagnosticAt=0;
let pending:Promise<any>|null=null;
export async function getScalpDesk(){
  const now=Date.now();
  if(cached&&now-cachedAt<2000)return cached;
  if(pending)return pending;
  pending=(async()=>{
    const [goldResult,btcResult,liquidityResult]=await Promise.allSettled([getMarketSnapshot(),getBtcMarket(),getBtcLiquidity()]);
    const make=(asset:'GOLD'|'BTC',market:any,quote:ScalpQuote,events:any[],newsReady:boolean)=>{
      const at=Date.now();
      const input={asset,c1:market?.c1||[],c5:market?.c5||[],candleSource:market?.priceSource||market?.source||'unavailable',quote,now:at,events,newsReady,marketOpen:asset==='BTC'||session(at),feeBps:envNumber('SCALP_'+asset+'_FEE_BPS'),slippageBps:envNumber('SCALP_'+asset+'_SLIPPAGE_BPS')};
      const plans=buildScalpPlans(input);
      const orderBook=asset==='BTC'&&liquidityResult.status==='fulfilled'?liquidityResult.value:null;
      const bookFresh=Boolean(orderBook?.ok&&Number(orderBook?.quality||0)>=65&&
        Number(orderBook?.checkedAt||0)>0&&at-Number(orderBook.checkedAt)>=0&&at-Number(orderBook.checkedAt)<12000);
      const qualityGates=plans.map(plan=>{
        const losses=getScalpPaperQualityGate(asset,plan.horizon,at);
        const issues:string[]=[];
        if(plan.status==='ARMED'&&asset==='BTC'){
          if(!bookFresh)issues.push('دفتر أوامر BTC غير موثوق أو متأخر؛ متابعة فقط');
          else if(orderBook?.side!=='WAIT'&&orderBook?.side!==plan.side&&Number(orderBook?.strength||0)>=59)
            issues.push('تدفق سيولة BTC يعاكس الدخول المقترح');
          if(bookFresh&&Number(orderBook?.book?.spreadBps||0)>5)
            issues.push('سبريد دفتر أوامر BTC مرتفع للحركة المتوقعة');
        }
        if(plan.status==='ARMED'&&losses.blocked)issues.push(losses.reason);
        if(plan.status==='ARMED'&&issues.length){
          plan.status='WATCH';plan.blockers=[...plan.blockers,...issues];plan.reason=issues[0];
        }
        return {horizon:plan.horizon,...losses,issues};
      });
      const liquidity=readScalpLiquidity(input.c1,quote,at,asset);
      const entryConfirmations=plans.map(plan=>{
        const paths=liquidity?.scenarios?.find(s=>s.horizon===plan.horizon)?.paths||[];
        // Show the hold timer for the qualified plan first. In the absence of a
        // plan, watch the more advanced path without declaring it an entry.
        const watch=paths.find(s=>s.side===plan.side)||
          paths.find(s=>s.side===liquidity.pressure)||
          [...paths].sort((a,b)=>
            Number(b.confirmation?.heldSeconds||0)-Number(a.confirmation?.heldSeconds||0)||
            Math.abs(Number(a.trigger)-Number(quote.price||0))-Math.abs(Number(b.trigger)-Number(quote.price||0)))[0];
        // The map's directional scenario is useful for visibility, NOT for
        // authorizing a trade: only hold the exact frozen setup entry level.
        const planHold=plan.status==='ARMED'&&plan.side!=='WAIT'&&
          plan.entry!=null&&plan.stop!=null
          ?observeScalpPlanHold(asset,plan.horizon,plan.side,plan.id,
              plan.entry,plan.stop,plan.expiresAt,input.c1,quote,at)
          :null;
        const confirmation=planHold||watch?.confirmation||null;
        const watchedSide=planHold?plan.side:watch?.side||'WAIT';
        const confirmed=confirmation?.state==='CONFIRMED';
        const fresh=quote.at!=null&&at-Number(quote.at)>=0&&at-Number(quote.at)<=10000;
        const planRisk=plan.entry!=null&&plan.stop!=null?Math.abs(plan.entry-plan.stop):0;
        const entryNearby=planRisk>0&&quote.price!=null&&
          Math.abs(quote.price-Number(plan.entry))<=planRisk*.35;
        const dir=plan.side==='BUY'?1:-1;
        const realizedRisk=plan.stop!=null&&quote.price!=null?dir*(quote.price-plan.stop):0;
        const realizedReward=plan.targets[0]?.price!=null&&quote.price!=null?
          dir*(plan.targets[0].price-quote.price):0;
        const liveRR=realizedRisk>0?
          (realizedReward-plan.cost)/(realizedRisk+plan.cost):0;
        const eligible=Boolean(
          confirmed&&planHold&&plan.status==='ARMED'&&
          fresh&&entryNearby&&realizedRisk>0&&realizedReward>0&&
          liveRR>=1.25&&Number(plan.netRR)>=1.25
        );
        return {
          horizon:plan.horizon,side:watchedSide,
          state:eligible?'ENTRY':confirmed?'CONDITIONS_PENDING':
            confirmation?.state==='HOLDING'?'HOLDING':'WATCH',
          heldSeconds:Number(confirmation?.heldSeconds||0),
          remainingSeconds:Number(confirmation?.remainingSeconds??60),
          requiredSeconds:60,trigger:confirmation?.trigger??null,
          confirmedCandleAt:confirmed?Number(input.c1.filter((c:any)=>c.time+60000<=at).at(-1)?.time||0)+60000:null,
          checkedAt:at,
          entry:eligible?quote.price:null,
          stop:eligible?plan.stop:null,
          targets:eligible?plan.targets:[],
          reason:eligible?'دخول تجريبي بسعر المرجع الحالي بعد ثبات الدخول نفسه دقيقة وإغلاق M1':
            confirmed&&!entryNearby?'اكتمل الثبات لكن السعر ابتعد عن الدخول؛ لا مطاردة':
            confirmed&&!planHold?'ثبت السيناريو العام، لكن لا توجد صفقة مستوفية للشروط':
            confirmed&&liveRR<1.25?'انخفض العائد بعد تكلفة الدخول الحالي؛ لا صفقة':
            confirmed?'ثبتت الدقيقة لكن الشروط غير مكتملة: '+(plan.blockers?.[0]||plan.reason):
            confirmation?.reason||'بانتظار مستوى الرصد وسعر حي صالح'
        };
      });
      // The paper ledger must never arm/activate before the exact 60-second
      // M1 hold and the final order-book/risk gate have passed.
      const paperPlans=plans.map((plan,i)=>({
        ...plan,status:(entryConfirmations[i]?.state==='ENTRY'?'ARMED':'WATCH') as typeof plan.status
      }));
      const ledger=updateScalpLedger(asset,paperPlans,quote,at,input.c1);
      for(const entry of entryConfirmations){
        const lane=ledger.lanes.find(x=>x.horizon===entry.horizon);
        if(lane?.current?.state==='ACTIVE'){
          const newlyOpened=entry.state==='ENTRY'&&
            lane.current.plan.id===plans.find(x=>x.horizon===entry.horizon)?.id&&
            at-Number(lane.current.activatedAt||0)<=15000;
          if(newlyOpened){
            entry.entry=lane.current.plan.entry;
            entry.stop=lane.current.plan.stop;
            entry.targets=lane.current.plan.targets;
            entry.reason='إشارة دخول مؤكدة وسجل ورقي مفعّل بالسعر الحالي؛ دون تنفيذ وسيط';
          }else{
            entry.state='ACTIVE';
            entry.entry=null;entry.stop=null;entry.targets=[];
            entry.reason='متابعة صفقة تجريبية مفعّلة؛ ممنوع تكرار الإشارة';
          }
        }else if(entry.state==='ENTRY'&&lane?.recent?.some(t=>
          t.plan.id===plans.find(x=>x.horizon===entry.horizon)?.id)){
          entry.state='WATCH';entry.entry=null;entry.stop=null;entry.targets=[];
          entry.reason='هذه الفرصة مسجلة بالفعل؛ لا تكرار لإشارة قديمة';
        }
      }
      return {asset,checkedAt:at,quote,candleSource:input.candleSource,liquidity,orderBook,plans,qualityGates,entryConfirmations,ledger,data:{m1AgeMs:input.c1.length?at-(input.c1.filter((c:any)=>c.time+60000<=at).at(-1)?.time+60000):null,quoteAgeMs:quote.at?at-quote.at:null,newsReady}};
    };
    const goldSnap=goldResult.status==='fulfilled'?goldResult.value:null;
    let market=btcResult.status==='fulfilled'?btcResult.value:null;
    if(market&&/Coinbase/i.test(market.source)){
      const live=getCoinbaseClosedCandles();
      // Full observed minute bars bridge the REST publication delay. No partial or gap bar is used.
      if(live.length)market={...market,c1:mergeBtcCandles([...market.c1,...live]),source:market.source+' · closed WebSocket M1'};
    }
    const q=goldSnap?.quote;
    const events=goldSnap?.market.events||[],newsReady=Boolean(goldSnap?.market.newsReady&&Date.now()-goldSnap.market.checkedAt<120000);
    let bq:ScalpQuote={price:null,at:null,source:market?.source||'unavailable'};
    if(market)bq=await btcQuote(market.source).catch(()=>bq);
    const gold=make('GOLD',goldSnap?.market,{price:q?.price??null,at:q?.sourceTime??null,bid:q?.bid,ask:q?.ask,source:q?.source||'unavailable'},events,newsReady);
    const bitcoin=make('BTC',market,bq,events,newsReady);
    // Monitor missing trade flow without leaking provider credentials or
    // treating a WATCH setup as an executed order.
    const measuredAt=Date.now();
    if(measuredAt-lastScalpDiagnosticAt>=30000){
      lastScalpDiagnosticAt=measuredAt;
      const diag=(x:any)=>({
        quote:x.quote?.price,quoteAgeMs:x.data?.quoteAgeMs,source:x.candleSource,
        m1AgeMs:x.data?.m1AgeMs,newsReady:x.data?.newsReady,
        liquidityReady:x.liquidity?.available,bookOk:x.orderBook?.ok,
        plans:x.plans.map((pl:any)=>({
          h:pl.horizon,status:pl.status,side:pl.side,setup:pl.setup,
          score:pl.score,entry:pl.entry,stop:pl.stop,t1:pl.targets?.[0]?.price,
          netRR:pl.netRR,cost:pl.cost,estimated:pl.costEstimated,
          blockers:pl.blockers.slice(0,5)
        })),
        watches:x.entryConfirmations.map((e:any)=>({
          h:e.horizon,state:e.state,held:e.heldSeconds,side:e.side,
          trigger:e.trigger,confirmedCandleAt:e.confirmedCandleAt
        })),
        ledger:x.ledger.lanes.map((l:any)=>({
          h:l.horizon,active:l.current?.state||null,
          paperEntry:l.current?.plan?.entry??null,
          verifiedResults:l.stats.samples,wins:l.stats.wins,
          netR:l.stats.netR,unknown:l.stats.unknown,
          exitBreakdown:l.recent.reduce((acc:any,t:any)=>{
            acc[t.state]=(acc[t.state]||0)+1;return acc;
          },{}),
          autopsy:l.recent.slice(0,8).map((t:any)=>({
            state:t.state,side:t.plan.side,setup:t.plan.setup,
            score:t.plan.score,entry:t.plan.entry,stop:t.plan.stop,
            target:t.plan.targets?.[0]?.price,cost:t.plan.cost,
            at:t.activatedAt,closed:t.closedAt,
            exit:t.exit,netR:t.netR,note:t.note
          }))
        })),
        ledgerSaved:x.ledger.persisted
      });
      console.info('[SCALP-DIAG]',JSON.stringify({gold:diag(gold),btc:diag(bitcoin)}));
    }
    cached={ok:true,version:'scalp-desk-v1',checkedAt:Date.now(),gold,bitcoin};cachedAt=Date.now();return cached;
  })();
  try{return await pending;}finally{pending=null;}
}
