import fs from 'node:fs';
import type {Candle} from './engine';
import type {ScalpPlan,ScalpQuote} from './scalp-opportunities';

export type PaperTrade={plan:ScalpPlan;state:'ARMED'|'ACTIVE'|'TP1'|'STOP'|'TIME_EXIT'|'EXPIRED'|'CANCELED'|'UNKNOWN';activatedAt:number|null;closedAt:number|null;exit:number|null;netR:number|null;lastAt:number;lastPrice:number;note:string};
type Ledger={version:1;lanes:Record<string,{current:PaperTrade|null;lastId:string;history:PaperTrade[]}>};
declare global {var __scalpPaperLedger:Ledger|undefined;}
function load():Ledger{
  if(globalThis.__scalpPaperLedger)return globalThis.__scalpPaperLedger;
  let data:Ledger={version:1,lanes:{}};
  try{const parsed=JSON.parse(fs.readFileSync('/data/scalp-paper-v1.json','utf8'));if(parsed.version===1&&parsed.lanes)data=parsed;}catch{}
  globalThis.__scalpPaperLedger=data;return data;
}
function save(data:Ledger){
  try{
    if(!fs.existsSync('/data'))return false;
    fs.writeFileSync('/data/scalp-paper-v1.json.tmp',JSON.stringify(data));
    fs.renameSync('/data/scalp-paper-v1.json.tmp','/data/scalp-paper-v1.json');return true;
  }catch{return false;}
}
const round=(v:number)=>Number(v.toFixed(3));
// A fixed post-upgrade cohort avoids claiming that old historical fills
// demonstrate profitability of the new engine. Do not back-date this marker.
export const SCALP_PROOF_FROM=Date.parse('2026-10-08T09:00:00Z');
// First M5 retest launch, not the original broader scalp strategy cohort.
export const SCALP_RETEST_PROOF_FROM=Date.parse('2026-10-10T19:44:30Z');
export function evaluatePaperProof(trades:PaperTrade[],start=SCALP_PROOF_FROM){
  // Closed outcomes only; canceled, unknown, unfilled and old historical
  // observations NEVER count as wins or statistical evidence.
  const rows=trades.filter(t=>t.activatedAt!=null&&t.activatedAt>=start&&
    t.netR!=null&&Number.isFinite(t.netR)&&['TP1','STOP','TIME_EXIT'].includes(t.state))
    .sort((a,b)=>Number(a.activatedAt)-Number(b.activatedAt));
  const rets=rows.map(t=>Number(t.netR));
  const n=rets.length,net=rets.reduce((sum,v)=>sum+v,0);
  const expectancy=n?net/n:0;
  const variance=n>1?rets.reduce((a,v)=>a+(v-expectancy)**2,0)/(n-1):0;
  const lower95=n>1?expectancy-1.96*Math.sqrt(variance/n):null;
  const positive=rets.filter(v=>v>0).reduce((a,b)=>a+b,0);
  const negative=-rets.filter(v=>v<0).reduce((a,b)=>a+b,0);
  let equity=0,peak=0,maxDrawdownR=0;
  for(const v of rets){equity+=v;peak=Math.max(peak,equity);
    maxDrawdownR=Math.max(maxDrawdownR,peak-equity);}
  const profitFactor=negative>0?positive/negative:null;
  const target=50;
  const qualified=n>=target&&lower95!=null&&lower95>0&&
    profitFactor!=null&&profitFactor>=1.2&&maxDrawdownR<=6;
  return {
    status:n<target?'COLLECTING':qualified?'POSITIVE_PAPER_SAMPLE':'NOT_VALIDATED',
    cohortStart:start,samples:n,requiredSamples:target,
    wins:rets.filter(v=>v>0).length,
    netR:round(net),expectancyR:n?round(expectancy):null,
    lower95MeanR:lower95!=null?round(lower95):null,
    profitFactor:profitFactor!=null?round(profitFactor):null,
    maxDrawdownR:round(maxDrawdownR),
    eligibleForLiveTrading:false,
    note:'عينة صفقات ورقية بعد التحديث وبسعر مرجعي؛ لا تختبر تنفيذ Exness. حد الثقة تقريبي ولا يضمن الربحية.'
  };
}

export function evaluateRetestPaperProof(trades:PaperTrade[]){
  // Closed trades of the new setup ONLY. Old M5 breakout profits never
  // count as evidence for RETEST, even when they are in the same ledger.
  return evaluatePaperProof(trades.filter(t=>t.plan?.setup==='RETEST'),
    SCALP_RETEST_PROOF_FROM);
}

// Paper-only circuit breaker: a run of poor simulated entries pauses new
// candidates for 15 minutes. It never alters settled outcomes or real orders.
export function getScalpPaperQualityGate(asset:'GOLD'|'BTC',horizon:1|5,now=Date.now()){
  const lane=load().lanes[asset+'-'+horizon];
  const rows=(lane?.history||[]).filter(t=>
    t.netR!=null&&Number.isFinite(Number(t.netR))&&
    ['TP1','STOP','TIME_EXIT'].includes(t.state)).slice(0,30);
  const recent=rows.slice(0,12);
  const recentNetR=recent.reduce((sum,t)=>sum+Number(t.netR),0);
  const latest=Number(rows[0]?.closedAt||0);
  const lastFour=rows.slice(0,4);
  const failureStreak=lastFour.length===4&&lastFour.every(t=>Number(t.netR)<0);
  const persistentWeak=recent.length>=12&&recentNetR/recent.length<-.18&&
    recent.filter(t=>Number(t.netR)<0).length>=8;
  // Six or more real paper outcomes with major negative expectancy warrant
  // a longer pause; historical weak batches do not freeze the system forever.
  const severeWeak=recent.length>=6&&recentNetR<=-2&&
    recent.filter(t=>Number(t.netR)>0).length<=Math.floor(recent.length*.25);
  const cooldownMs=severeWeak?90*60*1000:15*60*1000;
  const blocked=Boolean((failureStreak||persistentWeak||severeWeak)&&
    latest>0&&now-latest>=0&&now-latest<cooldownMs);
  return {
    blocked,source:'PAPER_REFERENCE',samples:recent.length,
    expectancyR:recent.length?round(recentNetR/recent.length):null,
    remainingSeconds:blocked?Math.ceil((cooldownMs-(now-latest))/1000):0,
    reason:blocked?'إيقاف دخول '+horizon+' دقيقة بعد خسائر تجريبية متكررة؛ التهدئة '+Math.ceil(cooldownMs/60000)+' دقيقة من آخر نتيجة، مع استمرار متابعة السوق':''
  };
}

// Reference-price simulation, not a claim of an executed broker fill.
// No wins are invented during a quote gap. Closed bars recover barriers only after entry.
export function advancePaperTrade(trade:PaperTrade,quote:ScalpQuote,now:number,c1:Candle[]):PaperTrade{
  const t:PaperTrade={...trade},p=Number(quote.price),at=Number(quote.at),plan=t.plan;
  if(!['ARMED','ACTIVE'].includes(t.state)||quote.price==null||quote.at==null||!Number.isFinite(p)||p<=0||!Number.isFinite(at)||now-at>15000||at>now+2000||at<=t.lastAt)return t;
  const dir=plan.side==='BUY'?1:-1;
  const close=(state:PaperTrade['state'],exit:number|null,when:number,note:string)=>{
    t.state=state;t.exit=exit;t.closedAt=when;t.note=note;
    if(exit!=null&&plan.entry!=null&&plan.stop!=null){
      const risk=Math.abs(plan.entry-plan.stop);
      t.netR=risk>0?round((dir*(exit-plan.entry)-plan.cost)/(risk+plan.cost)):null;
    }
  };
  if(t.state==='ARMED'){
    if(at>=plan.expiresAt){close('EXPIRED',null,plan.expiresAt,'انتهت صلاحية الدخول قبل التفعيل');return t;}
    if(plan.stop!=null&&dir*(p-plan.stop)<=0){close('CANCELED',null,at,'كُسر مستوى الإبطال قبل الدخول');return t;}
    if(at>=plan.at&&plan.entry!=null&&dir*(t.lastPrice-plan.entry)<0&&dir*(p-plan.entry)>=0){
      if(at-t.lastAt>15000){close('UNKNOWN',null,at,'انقطاع أسعار عند التفعيل؛ لا نفترض دخولاً');return t;}
      const risk=Math.abs(plan.entry-Number(plan.stop));
      if(dir*(p-plan.entry)>risk*.3){close('CANCELED',null,at,'تجاوز الدخول بفجوة؛ الإعداد فات');return t;}
      t.state='ACTIVE';t.activatedAt=at;t.note='تفعيل تجريبي بسعر المرجع؛ المستويات ثابتة';
    }
  }else{
    const expiry=Number(t.activatedAt)+plan.horizon*60000;
    const target=plan.targets[0]?.price,stop=plan.stop;
    const bars=c1.filter(c=>c.time>=Number(t.activatedAt)&&c.time>=t.lastAt&&c.time+60000<=Math.min(at,expiry));
    for(const c of bars){
      const stopped=stop!=null&&(dir===1?c.low<=stop:c.high>=stop);
      const hit=target!=null&&(dir===1?c.high>=target:c.low<=target);
      if(stopped||hit){close(stopped?'STOP':'TP1',stopped?stop:target,c.time+60000,stopped&&hit?'الوقف والهدف في الشمعة نفسها؛ احتساب الوقف أولاً':'حاجز تحقق في شمعة مغلقة بعد الدخول');return t;}
    }
    if(at-t.lastAt>15000){close('UNKNOWN',null,at,'انقطاع متابعة بعد الدخول؛ النتيجة غير قابلة للتحقق');return t;}
    if(at>=expiry){
      if(expiry-t.lastAt<=5000)close('TIME_EXIT',t.lastPrice,expiry,'انتهاء المدة؛ آخر سعر موثق قبل انتهاء الصلاحية');
      else close('UNKNOWN',null,expiry,'لا يوجد سعر قريب موثق عند انتهاء المدة');
      return t;
    }
    // Stop wins an ambiguous same-bar recovery; a single quote cannot cross both barriers.
    if(stop!=null&&dir*(p-stop)<=0){close('STOP',p,at,'وصل السعر إلى الوقف؛ احتساب تجاوز الوقف');return t;}
    if(target!=null&&dir*(p-target)>=0){close('TP1',target,at,'تحقق الهدف الأول بعد التفعيل');return t;}
  }
  t.lastAt=at;t.lastPrice=p;return t;
}

export function updateScalpLedger(asset:'GOLD'|'BTC',plans:ScalpPlan[],quote:ScalpQuote,now:number,c1:Candle[]){
  const data=load();
  const lanes=plans.map(plan=>{
    const key=asset+'-'+plan.horizon;
    // Register the lane in persisted state; a temporary local lane would
    // silently lose every active paper trade and its historical results.
    const lane=data.lanes[key]??(data.lanes[key]={current:null,lastId:'',history:[]});
    if(lane.current){
      // Revoked or replaced entries must not fill on a tick that arrived after
      // the current conditions ceased to approve the earlier plan.
      if(lane.current.state==='ARMED'&&(plan.status!=='ARMED'||lane.current.plan.id!==plan.id)){
        lane.current={...lane.current,state:'CANCELED',closedAt:now,note:'انتهى تأكيد شروط الدخول أو تغير نموذج الإعداد'};
      }else{
        lane.current=advancePaperTrade(lane.current,quote,now,c1);
      }
      if(!['ARMED','ACTIVE'].includes(lane.current.state)){
        lane.history.unshift(lane.current);lane.history=lane.history.slice(0,500);lane.current=null;
      }
    }
    if(!lane.current&&plan.status==='ARMED'&&plan.id!==lane.lastId&&
        quote.price!=null&&quote.at!=null&&now-quote.at>=0&&now-quote.at<=10000&&
        quote.at<=plan.expiresAt&&plan.side!=='WAIT'&&plan.entry!=null&&
        plan.stop!=null&&plan.targets[0]?.price!=null){
      // ENTRY is passed here only AFTER a plan-specific 60-second hold.
      // Record a reference fill at the CURRENT quote (not the old trigger);
      // already includes spread/fees/slippage via plan.cost, not an actual
      // broker order. Do not count off-market/reward-negative fills.
      const dir=plan.side==='BUY'?1:-1,p=quote.price,anchorRisk=Math.abs(plan.entry-plan.stop);
      const risk=dir*(p-plan.stop),reward=dir*(plan.targets[0].price-p);
      const priceNearby=anchorRisk>0&&Math.abs(p-plan.entry)<=anchorRisk*.35;
      const rr=risk>0?(reward-plan.cost)/(risk+plan.cost):0;
      if(priceNearby&&risk>0&&reward>0&&rr>=1.25){
        const filled:ScalpPlan={...plan,entry:p,netRR:round(rr)};
        lane.lastId=plan.id;
        lane.current={
          plan:filled,state:'ACTIVE',activatedAt:quote.at,closedAt:null,
          exit:null,netR:null,lastAt:quote.at,lastPrice:p,
          note:'تفعيل ورقي بعد 60 ثانية عند سعر المرجع الحالي؛ لا تنفيذ وسيط'
        };
      }
    }
    const verified=lane.history.filter(t=>t.netR!=null&&['TP1','STOP','TIME_EXIT'].includes(t.state));
    const wins=verified.filter(t=>Number(t.netR)>0),losses=verified.filter(t=>Number(t.netR)<0);
    const positive=wins.reduce((s,t)=>s+Number(t.netR),0),negative=-losses.reduce((s,t)=>s+Number(t.netR),0);
    const timeExits=verified.filter(t=>t.state==='TIME_EXIT');
    const stopExits=verified.filter(t=>t.state==='STOP');
    const targetExits=verified.filter(t=>t.state==='TP1');
    return {horizon:plan.horizon,current:lane.current,recent:lane.history.slice(0,8),stats:{
      samples:verified.length,wins:wins.length,losses:losses.length,
      exitCauses:{
        timeExits:timeExits.length,stops:stopExits.length,targets:targetExits.length,
        negativeTimeExits:timeExits.filter(t=>Number(t.netR)<0).length,
        timeExitNetR:round(timeExits.reduce((sum,t)=>sum+Number(t.netR),0)),
        stopNetR:round(stopExits.reduce((sum,t)=>sum+Number(t.netR),0))
      },
      forwardProof:evaluatePaperProof(lane.history),
      // Never show profitable results from older breakout/pullback trades as
      // if they validated the newly launched RETEST strategy.
      retestProof:evaluateRetestPaperProof(lane.history),
      winRate:verified.length?round(wins.length/verified.length*100):null,
      netR:round(verified.reduce((s,t)=>s+Number(t.netR),0)),
      expectancyR:verified.length?round(verified.reduce((s,t)=>s+Number(t.netR),0)/verified.length):null,
      profitFactor:negative>0?round(positive/negative):null,
      unknown:lane.history.filter(t=>t.state==='UNKNOWN').length,
      expired:lane.history.filter(t=>['EXPIRED','CANCELED'].includes(t.state)).length,
      validation:verified.length<30?'COLLECTING':verified.reduce((s,t)=>s+Number(t.netR),0)/verified.length>.08&&negative>0&&positive/negative>=1.15?'POSITIVE_SAMPLE':'NEGATIVE_SAMPLE'
    }};
  });
  const persisted=save(data);
  return {mode:'PAPER_REFERENCE',persisted,lanes,note:'نتائج تجريبية بسعر المرجع عند تأكيد الدقيقة، وبعد التكلفة؛ لا تنفيذ وسيط. الهدف والوقف يظلان ثابتين. النتائج المجهولة لا تُحسب نجاحاً.'};
}
