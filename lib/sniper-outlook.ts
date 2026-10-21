import {buildNextMoveView} from './next-move-view';
import {buildLongRangeTargets} from './long-range-targets';
import {buildSniperRiskPlan} from './sniper-risk-plan';

type Side='BUY'|'SELL'|'WAIT';
type Zone={low:number;high:number;label:string;strength:number|null};
type Target={price:number;low:number;high:number;quality:number;kind:string;stage:1|2|3};
const n=(v:any):number|null=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const positive=(v:any):number|null=>{const q=n(v);return q!=null&&q>0?q:null;};
const bound=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const side=(v:any):Side=>v==='BUY'||v==='SELL'?v:'WAIT';
function zone(raw:any,label:string):Zone|null{
  if(!raw||typeof raw!=='object')return null;
  const p=positive(raw.mid??raw.price);
  const lo=positive(raw.low)??p,hi=positive(raw.high)??p;
  if(lo==null||hi==null||lo>hi)return null;
  return {low:lo,high:hi,label,strength:n(raw.strength??raw.confidence)};
}
function ahead(d:Side,price:number,destination:number){return d==='BUY'?destination>price:d==='SELL'?destination<price:false;}
function ordered(d:Side,a:number,b:number){return d==='BUY'?b>a:b<a;}
export function buildSniperOutlook(asset:'GOLD'|'BTC',x:any,liveQuote:any,now:number,snapshotAt:unknown){
  const baseView=buildNextMoveView(asset,x,liveQuote,now,snapshotAt);
  const price=baseView.price,move=x?.forwardMove||{},lead=x?.marketLead||{},intent=x?.marketMakerIntent||{};
  const acc=x?.accumulation||{},path=x?.huntForecast?.zoneForecast?.pathForecast||{};
  const hf=x?.huntForecast||{},liquidity=x?.liquidity||{};
  const modelSide=side(move?.side),stop=positive(move?.targets?.invalidation??move?.invalidation);
  const confirms=move?.confirmations||{};
  // The old SHORT-HORIZON T1 can be consumed by a recent tick while the
  // independently verified M15/H1 objective is still well ahead.
  // Bridge only that specific case with fresh data + M5/M15 agreement.
  const shortTarget=positive(move?.targets?.t1?.price??move?.target);
  const consumed=price!=null&&shortTarget!=null&&
    (modelSide==='BUY'?price>=shortTarget:modelSide==='SELL'?price<=shortTarget:false);
  const orientedStop=price!=null&&stop!=null&&
    (modelSide==='BUY'?stop<price:modelSide==='SELL'?stop>price:false);
  const bridge=Boolean(baseView.side==='WAIT'&&baseView.quality==='MONITOR'&&
    consumed&&orientedStop&&baseView.priceFresh&&baseView.forecastFresh&&
    move?.status!=='STABILITY_HOLD'&&modelSide!=='WAIT'&&
    Number(move?.confidence||0)>=58&&
    confirms.m5===modelSide&&confirms.m15===modelSide);
  const suggestedSide:Side=baseView.side!=='WAIT'?baseView.side:bridge?modelSide:'WAIT';
  const longRange=buildLongRangeTargets({
    asset,side:suggestedSide,price,now,frames:x?.chartHigherFrames,
    forecast:move,hunt:hf,h4:x?.h4Context
  });
  const repaired=bridge&&price!=null&&longRange.targets.length>0;
  const initialView=repaired?{
    ...baseView,side:suggestedSide,quality:'READY' as const,
    confidence:Number(move.confidence||0),
    invalidation:stop,target:longRange.targets[0].price,
    targetDistancePct:Math.abs(longRange.targets[0].price-price!)/price!*100,
    riskDistancePct:stop==null?null:Math.abs(stop-price!)/price!*100,
    reason:'الهدف السريع تم تجاوزه · السيناريو الهيكلي M15/H1 ما زال أمام السعر'
  }:baseView;
  const riskPlan=buildSniperRiskPlan({asset,side:initialView.side,price,now,
    frames:x?.chartHigherFrames,originalStop:initialView.invalidation,
    target:longRange.targets[0]?.price??null,spread:positive(x?.scalpDesk?.quote?.spread)});
  const view=riskPlan.ready?{...initialView,invalidation:riskPlan.stop,
    target:longRange.targets[0].price,
    targetDistancePct:price!=null?Math.abs(longRange.targets[0].price-price)/price*100:null,
    riskDistancePct:price!=null&&riskPlan.risk!=null?riskPlan.risk/price*100:null}:
    initialView.side!=='WAIT'?{...initialView,side:'WAIT' as const,quality:'MONITOR' as const,
      target:null,invalidation:null,reason:riskPlan.reason}:initialView;
  const valid=view.side!=='WAIT'&&price!=null&&view.target!=null&&view.invalidation!=null;
  const direction:Side=valid?view.side:'WAIT';
  const phase=String(acc.phase||intent.phase||'NEUTRAL');
  const phaseLabel:Record<string,string>={
    ACCUMULATING:'تجميع محتمل',MARKUP_READY:'تجميع قبل اندفاع',
    DISTRIBUTING:'تصريف محتمل',MARKDOWN_READY:'تصريف قبل هبوط',
    ACCUMULATION:'تجميع محتمل',DISTRIBUTION:'تصريف محتمل',
    NEUTRAL:'انتظار سيولة',SWEEP:'سحب سيولة',ABSORPTION:'امتصاص أوامر'
  };
  const phaseText=phaseLabel[phase]||'تحليل هيكل السوق';
  const leadFresh=Boolean(lead.available&&positive(lead.sourceAt)!=null&&now-Number(lead.sourceAt)<=8000&&now>=Number(lead.sourceAt));
  const leadAligned=valid&&leadFresh&&side(lead.side)===direction;
  const intentAligned=valid&&intent.ok&&side(intent.side)===direction&&intent.preMove;
  const compression=Number(acc.breakoutReadiness||0);
  const preliminary=Boolean(!valid&&view.priceFresh&&view.forecastFresh&&acc.ok&&
    Number(acc.breakoutReadiness||0)>=62&&side(acc.side)!=='WAIT');
  const stage: 'WAIT'|'BUILDING'|'ARMED'|'MOVING'|'BLOCKED'=
    !valid?(preliminary?'BUILDING':'WAIT'):
    (move.status==='IN_PROGRESS'||leadAligned&&lead.released)?'MOVING':
    (leadAligned&&lead.armed||intentAligned&&compression>=55)?'ARMED':
    (leadAligned&&lead.stage==='BUILDING'||compression>=55&&side(acc.side)===direction)?'BUILDING':'BLOCKED';
  const stageText={
    WAIT:'قناص في وضع الرصد',BUILDING:'ضغط قبل الحركة',ARMED:'ترقّب تفعيل الحركة',
    MOVING:'الحركة بدأت',BLOCKED:'انتظار تأكيد'
  }[stage];

  // Sniper targets are NOT the 15-minute scalp ladder. Only observed
  // higher-timeframe structures beyond meaningful M15 volatility qualify.
  const targets:Target[]=longRange.targets;
  const target=targets[0]?.price??null;
  let arrival:{min:number;max:number;basis:string}|null=null;
  // Long-range arrivals cannot be inferred from a 1m/5m model. Only use a
  // supported 30-minute horizon that actually reaches the structural target.
  if(valid&&price!=null&&target!=null){
    const h=hf?.horizons?.thirtyMinute;
    const estimate=positive(h?.price);
    if(side(h?.side)===direction&&Number(h?.confidence||0)>=62&&estimate!=null&&
      ahead(direction,price,estimate)&&Math.abs(estimate-price)>=Math.abs(target-price)*.85){
      arrival={min:24,max:36,basis:'تقدير M30؛ هدف هيكلي وليس وعدًا بالوصول'};
    }
  }
  const wl=move?.windowSeconds;
  const activation=valid&&stage!=='MOVING'&&Number.isFinite(Number(wl?.min))&&Number.isFinite(Number(wl?.max))&&
    Number(wl.min)>0&&Number(wl.max)>=Number(wl.min)&&Number(wl.max)<=3600?
    {min:Math.ceil(Number(wl.min)/60),max:Math.ceil(Number(wl.max)/60)}:null;
  const quoteFresh=view.priceFresh&&view.forecastFresh;
  const liquidityFresh=Boolean(quoteFresh&&liquidity.ok&&positive(liquidity.checkedAt)!=null&&
    now>=Number(liquidity.checkedAt)&&now-Number(liquidity.checkedAt)<=12000);
  const hasPressure=liquidityFresh&&n(liquidity.buy)!=null&&n(liquidity.sell)!=null&&
    Math.abs(Number(liquidity.buy)+Number(liquidity.sell)-100)<=2;
  const flow=hasPressure?{buy:bound(Math.round(Number(liquidity.buy)),0,100),
    sell:bound(Math.round(Number(liquidity.sell)),0,100),
    source:liquidity.mode==='DOM'?'دفتر أوامر':'تقدير تدفق من البيانات'}:null;
  const destination=valid?zone(path.destination,'منطقة وجهة'):null;
  const support=quoteFresh?zone(hf?.zoneForecast?.support,'منطقة طلب'):null;
  const resistance=quoteFresh?zone(hf?.zoneForecast?.resistance,'منطقة عرض'):null;
  const rebound=quoteFresh?zone(path.reboundZone,'منطقة ارتداد'):null;
  const above=quoteFresh?zone(path.upperLiquidity,'سيولة علوية'):null;
  const below=quoteFresh?zone(path.lowerLiquidity,'سيولة سفلية'):null;
  const zones=[support,resistance,rebound,above,below].filter((v):v is Zone=>Boolean(v));
  const trigger=valid&&positive(move?.tradeSetup?.entry)!=null&&
    ahead(direction,price!,Number(move.tradeSetup.entry))?Number(move.tradeSetup.entry):null;
  const evidence:string[]=[];
  if(side(acc.side)===direction&&acc.ok)evidence.push('توافق التجميع/التصريف');
  if(intentAligned)evidence.push('امتصاص أو سحب سيولة');
  if(leadAligned)evidence.push('تدفق لحظي مؤيد');
  if(side(move?.confirmations?.m5)===direction&&side(move?.confirmations?.m15)===direction)evidence.push('اتفاق M5 + M15');
  if(destination)evidence.push('منطقة وجهة مرصودة');
  if(targets.length)evidence.push('أهداف M15/H1 هيكلية وليست سكالب');
  return {
    view,stage,stageText,phaseText,compression:acc.ok?bound(Math.round(compression),0,100):null,
    arrival,activation,targets,destination,zones,flow,trigger,evidence,
    forecastBasis:targets[0]?.kind||null,longRange,riskPlan,
    verifiedTradeSetup:Boolean(valid&&move?.tradeSetup&&move?.adaptiveLearning?.execution?.validated),
    priceAge:view.sourceAgeSeconds
  };
}
