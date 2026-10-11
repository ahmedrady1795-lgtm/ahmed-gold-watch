import {buildSniperOutlook} from './sniper-outlook';
import {buildStructuralWatch} from './structural-watch';
import {buildContinuousBias} from './continuous-direction';
import {stabilizeSniperBias,presentServerBias} from './sniper-stability';
import type {StableBiasState,ObservedBias} from './sniper-stability';
import {analyzeFourHours} from './four-hour-structure';
import type {ForecastJournal} from './forecast-journal';

export type PlotCandle={time:number;open:number;high:number;low:number;close:number;volume:number};
export type PriceBand={key:string;label:string;low:number;high:number;price:number;kind:'TARGET'|'DEMAND'|'SUPPLY'|'REBOUND'|'LIQUIDITY'|'STOP'|'BUY_REBOUND'|'SELL_REBOUND'};
const finite=(x:unknown):number|null=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const valid=(x:unknown)=>{const p=finite(x);return p!=null&&p>0?p:null;};

export function buildForecastIllustration(asset:'GOLD'|'BTC',x:any,quote:any,now:number,snapshotAt:unknown,journal:ForecastJournal|null=null,auditRequired=false,stableState:StableBiasState|null=null,serverBias:ObservedBias|null=null){
  const sniper=buildSniperOutlook(asset,x,quote,now,snapshotAt);
  // Chart uses actual CLOSED candles from the last model snapshot, never synthetic prices.
  const raw=Array.isArray(x?.chartCandles)?x.chartCandles:[];
  const seen=new Map<number,PlotCandle>();
  for(const c of raw){
    const time=finite(c?.time),open=valid(c?.open),high=valid(c?.high),
      low=valid(c?.low),close=valid(c?.close),volume=finite(c?.volume)??0;
    if(time==null||time<=0||time+60000>now||time<now-7*86400000||
       open==null||high==null||low==null||close==null||
       high<Math.max(open,close)||low>Math.min(open,close)||low>high)continue;
    seen.set(time,{time,open,high,low,close,volume:Math.max(0,volume)});
  }
  const candles=[...seen.values()].sort((a,b)=>a.time-b.time).slice(-96);
  const lastAt=candles.length?candles[candles.length-1].time+60000:0;
  const historyAge=lastAt?Math.max(0,now-lastAt):null;
  const historyFresh=historyAge!=null&&historyAge<=180000;
  const price=sniper.view.price;
  const fourHour=analyzeFourHours({asset,candles:raw,frames:x?.chartHigherFrames,now,
    source:x?.candleSource,referencePrice:price});
  const rawBias=buildContinuousBias({asset,frames:x?.chartHigherFrames,price,now,
    sourceReady:sniper.view.priceFresh&&sniper.view.forecastFresh,fourHour});
  const stability=stabilizeSniperBias(stableState,rawBias,price,now);
  const bias=serverBias?presentServerBias(serverBias,rawBias,price):stability.bias;
  // Production audits are evidence of qualified scenarios, NOT a prerequisite
  // for continuously observing real closed-candle market structure.
  const observation=buildStructuralWatch(asset,x,price,now,
    sniper.view.priceFresh&&sniper.view.forecastFresh);
  const plannedTargets=journal?.state==='ACTIVE'?journal.targets:
    auditRequired?[]:sniper.targets;
  const plannedStop=journal?.state==='ACTIVE'?journal.invalidation:sniper.view.invalidation;
  const aheadOf=(dir:'BUY'|'SELL'|'WAIT',levels:Array<{price:number}>)=>price!=null&&
    dir!=='WAIT'&&levels.length>0&&levels.every((t,i)=>
      Number.isFinite(t.price)&&t.price>0&&
      (dir==='BUY'?t.price>price:t.price<price)&&
      (i===0||(dir==='BUY'?t.price>levels[i-1].price:t.price<levels[i-1].price)));
  const stopSafe=(dir:'BUY'|'SELL'|'WAIT',stop:number|null)=>
    price!=null&&stop!=null&&Number.isFinite(stop)&&
    (dir==='BUY'?stop<price:dir==='SELL'?stop>price:false);
  const scenarioAllowed=sniper.view.side!=='WAIT'&&sniper.view.priceFresh&&sniper.view.forecastFresh&&
    historyFresh&&(!journal||journal.state==='ACTIVE'&&journal.side===sniper.view.side)&&
    (!auditRequired||journal?.state==='ACTIVE');
  const ready=Boolean(scenarioAllowed&&aheadOf(sniper.view.side,plannedTargets)&&
    stopSafe(sniper.view.side,plannedStop));
  // A qualified order must still pass its existing independent audit.
  // The uninterrupted H1/H4 observation is only a *watch* even if its bias
  // is strong, and has no effect on server execution or scenario records.
  const distantWatch=bias.active&&bias.side!=='WAIT'&&bias.targets.length>0;
  const authoritative=Boolean(serverBias||stableState);
  const watchSide=authoritative||distantWatch?bias.side:
    sniper.view.side!=='WAIT'?sniper.view.side:observation.side;
  const watchTargets=authoritative||distantWatch?bias.targets:
    sniper.view.side!=='WAIT'?sniper.targets:observation.targets;
  const rawWatchStop=authoritative||distantWatch?bias.invalidation:
    sniper.view.side!=='WAIT'?sniper.view.invalidation:observation.invalidation;
  const watchStop=stopSafe(watchSide,rawWatchStop)?rawWatchStop:null;
  const watchReady=Boolean(!ready&&historyFresh&&sniper.view.priceFresh&&
    sniper.view.forecastFresh&&(!authoritative||bias.active)&&aheadOf(watchSide,watchTargets));
  // Monitoring levels needn't pretend to offer a verified entry or stop.
  const displayTargets=ready?plannedTargets:watchReady?watchTargets:[];
  const displayStop=ready?plannedStop:watchReady?watchStop:null;
  const displaySide=ready?sniper.view.side:watchReady?watchSide:'WAIT';
  const bands:PriceBand[]=[];
  if((ready||watchReady)&&historyFresh){
    for(const t of displayTargets){
      bands.push({key:'TP'+t.stage,label:(ready?'TP':'رصد ')+t.stage,low:t.low,high:t.high,
        price:t.price,kind:'TARGET'});
    }
    const stop=valid(displayStop);
    if(stop!=null)bands.push({key:'STOP',label:'إبطال السيناريو',low:stop,high:stop,price:stop,kind:'STOP'});
  }
  if(historyFresh&&sniper.view.priceFresh&&sniper.view.forecastFresh){
    for(const [index,z] of sniper.zones.entries()){
      const kind:PriceBand['kind']=z.label.includes('ارتداد')?'REBOUND':
        z.label.includes('طلب')?'DEMAND':z.label.includes('عرض')?'SUPPLY':'LIQUIDITY';
      bands.push({key:kind+index,label:z.label,low:z.low,high:z.high,price:(z.high+z.low)/2,kind});
    }
  }
  if(fourHour.ready&&historyFresh){
    for(const [index,z] of fourHour.zones.entries()){
      bands.push({key:'REBOUND_4H_'+index,label:z.side==='BUY'?'ارتداد شراء':'ارتداد بيع',
        low:z.low,high:z.high,price:Number(((z.low+z.high)/2).toFixed(2)),
        kind:z.side==='BUY'?'BUY_REBOUND':'SELL_REBOUND'});
    }
  }
  // Make the chart scale meaningful when only a narrow price range is known.
  const anchors=[
    ...candles.flatMap(c=>[c.low,c.high]),
    ...(price!=null&&sniper.view.priceFresh?[price]:[]),
    ...bands.flatMap(z=>[z.low,z.high])
  ].filter(Number.isFinite);
  const midpoint=price??candles.at(-1)?.close??0;
  const minimum=anchors.length?Math.min(...anchors):midpoint*.998;
  const maximum=anchors.length?Math.max(...anchors):midpoint*1.002;
  const spread=Math.max(maximum-minimum,midpoint*.0007,0.01);
  const lower=minimum-spread*.10,upper=maximum+spread*.10;
  const projected=(ready||watchReady)&&price!=null
    ?[{key:'NOW',price},...displayTargets.map(t=>({key:'TP'+t.stage,price:t.price}))]
    :[];
  return {asset,sniper,observation,bias,stabilityState:serverBias?stableState:stability.state,stabilityReason:stability.explanation,heldBias:serverBias?Boolean(stableState&&stableState.since<now):stability.held,fourHour,candles,bands,price,historyAge,historyFresh,ready,watchReady,displaySide,displayTargets,displayStop,journal,
    lower,upper,projected,
    status:!candles.length?'NO_CANDLES':!historyFresh?'STALE_CANDLES':ready?'SCENARIO':watchReady?'WATCH_PATH':'WATCH'};
}
