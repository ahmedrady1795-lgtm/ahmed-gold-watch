import {getMarketSnapshot} from './market-hub';
import {getBtcMarket,mergeBtcCandles} from './btc-market';
import {buildScalpPlans,type ScalpQuote} from './scalp-opportunities';
import {updateScalpLedger,getScalpPaperQualityGate} from './scalp-paper-ledger';
import {getRuntimeEnv} from './runtime';
import {getCoinbaseServerQuote,getCoinbaseClosedCandles} from './server-tick-brain';
import {readScalpLiquidity,observeScalpPlanHold} from './scalp-liquidity';
import {getBtcLiquidity} from './liquidity-intelligence';
import {auditScalpEntry} from './scalp-entry-audit';

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
// BTC external services can occasionally stall for several seconds. Those
// fetches MUST NOT prevent the independent GOLD scalp engine from observing
// successive ticks. A timed-out BTC feed fails CLOSED for BTC only; it is
// never replaced by synthetic candles or a made-up fill.
async function boundedSource<T>(pendingSource:Promise<T>,limitMs:number):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  return Promise.race([
    pendingSource,
    new Promise<T>((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('BTC external source exceeded latency budget')),limitMs);
    })
  ]).finally(()=>{if(timer)clearTimeout(timer);});
}
// Read-only scalp cache for AI. The normal paper engine still owns every
// entry, fill and settlement. No network refresh occurs in this accessor.
export function peekScalpDesk(maxAgeMs=12000){
  return cached&&cachedAt>0&&Date.now()-cachedAt<=maxAgeMs?cached:null;
}
export async function getScalpDesk(){
  const now=Date.now();
  if(cached&&now-cachedAt<2000)return cached;
  if(pending)return pending;
  pending=(async()=>{
    const [goldResult,btcResult,liquidityResult]=await Promise.allSettled([
      getMarketSnapshot(),
      boundedSource(getBtcMarket(),4000),
      boundedSource(getBtcLiquidity(),2700)
    ]);
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
        // ACTIVE M5 means faster PAPER observation, never auto broker orders:
        // only GOLD high-score M5 setups ALIGNED with completed M5 trend may
        // use a 30s hold, and a post-watch M1 close is mandatory either way.
        const activeHold=asset==='GOLD'&&plan.horizon===5&&plan.score>=85&&
          ['BREAKOUT','CONTINUATION'].includes(plan.setup)&&
          plan.evidence.some(e=>e.label==='سياق M5'&&e.side===plan.side)&&
          Number(plan.netRR)>=1.25;
        const requiredHold:30|60=activeHold?30:60;
        const planHold=plan.status==='ARMED'&&plan.side!=='WAIT'&&
          plan.entry!=null&&plan.stop!=null
          ?observeScalpPlanHold(asset,plan.horizon,plan.side,plan.id,
              plan.entry,plan.stop,plan.expiresAt,input.c1,quote,at,requiredHold)
          :null;
        const confirmation=planHold||watch?.confirmation||null;
        const watchedSide=planHold?plan.side:watch?.side||'WAIT';
        const scenarioConfirmed=Boolean(watch?.confirmation?.state==='CONFIRMED');
        const retestConfirmed=Boolean(planHold&&planHold.state==='RETEST_READY');
        const confirmed=Boolean(planHold&&(planHold.state==='CONFIRMED'||retestConfirmed));
        // A scenario may confirm while the exact PLAN is not eligible. Never
        // report such a case as an almost-executed order.
        const audit=auditScalpEntry(plan,quote,at,planHold?.state??null,scenarioConfirmed);
        const eligible=audit.approved;
        return {
          horizon:plan.horizon,side:watchedSide,
          state:eligible?'ENTRY':confirmed?'CONDITIONS_PENDING':
            confirmation?.state==='HOLDING'?'HOLDING':'WATCH',
          entryAudit:audit,confirmationSource:planHold?'EXACT_PLAN':'SCENARIO_ONLY',
          heldSeconds:Number(confirmation?.heldSeconds||0),
          remainingSeconds:Number(confirmation?.remainingSeconds??60),
          requiredSeconds:Number(confirmation?.requiredSeconds??60),trigger:confirmation?.trigger??null,
          confirmedCandleAt:confirmed?Number(input.c1.filter((c:any)=>c.time+60000<=at).at(-1)?.time||0)+60000:null,
          checkedAt:at,
          entry:eligible?quote.price:null,
          stop:eligible?plan.stop:null,
          targets:eligible?plan.targets:[],
          reason:eligible?(retestConfirmed?
            'دخول ورقي عند إعادة اختبار الخطة بعد تأكيد إغلاق M1 وبعد التكلفة':
            'دخول ورقي بتأكيد '+requiredHold+' ثانية وإغلاق M1 بعد بدء الرصد'):
            audit.code==='AWAITING_M1_CONFIRMATION'&&planHold?
              confirmation?.reason||audit.reason:audit.reason
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
      return {asset,profile:asset==='GOLD'?'ACTIVE_M5_PAPER':'STANDARD_PAPER',
        checkedAt:at,quote,candleSource:input.candleSource,liquidity,orderBook,plans,qualityGates,entryConfirmations,ledger,data:{m1AgeMs:input.c1.length?at-(input.c1.filter((c:any)=>c.time+60000<=at).at(-1)?.time+60000):null,quoteAgeMs:quote.at?at-quote.at:null,newsReady}};
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
    if(market)bq=await boundedSource(btcQuote(market.source),2700).catch(()=>bq);
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
          h:e.horizon,state:e.state,held:e.heldSeconds,required:e.requiredSeconds,
          side:e.side,trigger:e.trigger,confirmedCandleAt:e.confirmedCandleAt,
          audit:e.entryAudit?.code,gate:e.entryAudit?.group,
          executionR:e.entryAudit?.liveNetRR,estimated:e.entryAudit?.costEstimated,
          confirmationSource:e.confirmationSource
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
