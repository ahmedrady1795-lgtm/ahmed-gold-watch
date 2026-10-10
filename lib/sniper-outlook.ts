import {buildNextMoveView} from './next-move-view';

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
  const view=buildNextMoveView(asset,x,liveQuote,now,snapshotAt);
  const price=view.price,move=x?.forwardMove||{},lead=x?.marketLead||{},intent=x?.marketMakerIntent||{};
  const acc=x?.accumulation||{},path=x?.huntForecast?.zoneForecast?.pathForecast||{};
  const hf=x?.huntForecast||{},liquidity=x?.liquidity||{};
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
  const stage: 'WAIT'|'BUILDING'|'ARMED'|'MOVING'|'BLOCKED'=
    !valid?'WAIT':
    (move.status==='IN_PROGRESS'||leadAligned&&lead.released)?'MOVING':
    (leadAligned&&lead.armed||intentAligned&&compression>=55)?'ARMED':
    (leadAligned&&lead.stage==='BUILDING'||compression>=55&&side(acc.side)===direction)?'BUILDING':'BLOCKED';
  const stageText={
    WAIT:'قناص في وضع الرصد',BUILDING:'ضغط قبل الحركة',ARMED:'ترقّب تفعيل الحركة',
    MOVING:'الحركة بدأت',BLOCKED:'انتظار تأكيد'
  }[stage];

  const targets:Target[]=[];
  if(valid&&price!=null){
    let previous=price;
    for(const i of [1,2,3] as const){
      const t=move?.targets?.['t'+i],target=positive(t?.price);
      const lo=positive(t?.low)??target,hi=positive(t?.high)??target;
      if(target==null||lo==null||hi==null||lo>hi||
         !ahead(direction,price,target)||!ordered(direction,previous,target))continue;
      // A projected destination is still a projection; do not mark it guaranteed.
      targets.push({price:target,low:lo,high:hi,
        quality:bound(Math.round(Number(t?.quality||0)),0,100),
        kind:String(t?.kind||'MODEL'),stage:i});
      previous=target;
    }
  }

  // Estimate arrival ONLY when a matching horizon model provides a concrete
  // future price that reaches a meaningful portion of the observed T1 distance.
  // The engine has no validated 60m arrival model: never relabel M15 as 1h.
  const horizonDefs=[['twoMinute',2],['fiveMinute',5],['fifteenMinute',15],['thirtyMinute',30]] as const;
  const target=targets[0]?.price??null;
  let arrival:{min:number;max:number;basis:string}|null=null;
  if(valid&&price!=null&&target!=null){
    const distance=Math.abs(target-price);
    for(const [key,minutes] of horizonDefs){
      const h=hf?.horizons?.[key],end=positive(h?.price),confidence=Number(h?.confidence||0);
      if(side(h?.side)!==direction||confidence<55||end==null||!ahead(direction,price,end))continue;
      if(Math.abs(end-price)<distance*.72)continue;
      // 20% temporal bands express model uncertainty, not a hard deadline.
      arrival={min:Math.max(1,Math.floor(minutes*.8)),max:Math.ceil(minutes*1.2),basis:'نموذج '+minutes+' دقائق'};break;
    }
    if(!arrival){
      const first=n(hf?.nextMove?.firstHitMinutes),hm=hf?.horizons?.fifteenMinute;
      if(first!=null&&first>=1&&first<=30&&side(hf?.nextMove?.side)===direction&&
         side(hm?.side)===direction&&Number(hm?.confidence||0)>=55){
        arrival={min:Math.max(1,Math.floor(first*.75)),max:Math.ceil(first*1.25),basis:'تقدير وصول الحركة'};
      }
    }
  }
  const wl=move?.windowSeconds;
  const activation=valid&&Number.isFinite(Number(wl?.min))&&Number.isFinite(Number(wl?.max))&&
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
  if(targets[0]?.kind==='PROJECTION')evidence.push('الهدف تقديري');
  return {
    view,stage,stageText,phaseText,compression:acc.ok?bound(Math.round(compression),0,100):null,
    arrival,activation,targets,destination,zones,flow,trigger,evidence,
    forecastBasis:targets[0]?.kind||null,
    verifiedTradeSetup:Boolean(valid&&move?.tradeSetup&&move?.adaptiveLearning?.execution?.validated),
    priceAge:view.sourceAgeSeconds
  };
}
