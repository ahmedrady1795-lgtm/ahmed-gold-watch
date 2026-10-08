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
  const cooldownMs=15*60*1000;
  const blocked=Boolean((failureStreak||persistentWeak)&&latest>0&&now-latest>=0&&now-latest<cooldownMs);
  return {
    blocked,source:'PAPER_REFERENCE',samples:recent.length,
    expectancyR:recent.length?round(recentNetR/recent.length):null,
    remainingSeconds:blocked?Math.ceil((cooldownMs-(now-latest))/1000):0,
    reason:blocked?'إيقاف تجريبي مؤقت بعد خسائر متتابعة أو توقع عائد سلبي؛ متابعة بلا دخول حتى تنتهي فترة التهدئة':''
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
    const lane=data.lanes[key]||={current:null,lastId:'',history:[]};
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
    if(!lane.current&&plan.status==='ARMED'&&plan.id!==lane.lastId&&quote.price!=null&&quote.at!=null){
      // A new issue never starts as filled. The next fresh quote must cross its trigger.
      lane.lastId=plan.id;
      lane.current={plan:JSON.parse(JSON.stringify(plan)),state:'ARMED',activatedAt:null,closedAt:null,exit:null,netR:null,lastAt:quote.at,lastPrice:quote.price,note:'انتظار تجاوز الدخول؛ لا توجد صفقة مفعلة بعد'};
    }
    const verified=lane.history.filter(t=>t.netR!=null&&['TP1','STOP','TIME_EXIT'].includes(t.state));
    const wins=verified.filter(t=>Number(t.netR)>0),losses=verified.filter(t=>Number(t.netR)<0);
    const positive=wins.reduce((s,t)=>s+Number(t.netR),0),negative=-losses.reduce((s,t)=>s+Number(t.netR),0);
    return {horizon:plan.horizon,current:lane.current,recent:lane.history.slice(0,8),stats:{
      samples:verified.length,wins:wins.length,losses:losses.length,
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
  return {mode:'PAPER_REFERENCE',persisted,lanes,note:'نتائج تجريبية بسعر المصدر بعد التكلفة؛ ليست تنفيذ وسيط. هدف T1 والوقف ثابتان. النتائج المجهولة لا تُحسب نجاحاً.'};
}
