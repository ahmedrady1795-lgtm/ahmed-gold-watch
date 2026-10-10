import {buildSniperOutlook} from './sniper-outlook';
import type {ForecastJournal} from './forecast-journal';

export type PlotCandle={time:number;open:number;high:number;low:number;close:number;volume:number};
export type PriceBand={key:string;label:string;low:number;high:number;price:number;kind:'TARGET'|'DEMAND'|'SUPPLY'|'REBOUND'|'LIQUIDITY'|'STOP'};
const finite=(x:unknown):number|null=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const valid=(x:unknown)=>{const p=finite(x);return p!=null&&p>0?p:null;};

export function buildForecastIllustration(asset:'GOLD'|'BTC',x:any,quote:any,now:number,snapshotAt:unknown,journal:ForecastJournal|null=null,auditRequired=false){
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
  const candles=[...seen.values()].sort((a,b)=>a.time-b.time).slice(-52);
  const lastAt=candles.length?candles[candles.length-1].time+60000:0;
  const historyAge=lastAt?Math.max(0,now-lastAt):null;
  const historyFresh=historyAge!=null&&historyAge<=180000;
  const price=sniper.view.price;
  const displayTargets=journal?.targets??(auditRequired?[]:sniper.targets);
  const displayStop=journal?.invalidation??sniper.view.invalidation;
  const sameDirection=!journal||journal.side===sniper.view.side;
  const ahead=price!=null&&displayTargets.length>0&&displayTargets.every((t,i)=>
    t.price>0&&(sniper.view.side==='BUY'?t.price>price:sniper.view.side==='SELL'?t.price<price:false)&&
    (i===0||(sniper.view.side==='BUY'?t.price>displayTargets[i-1].price:t.price<displayTargets[i-1].price)));
  const stopSafe=price!=null&&displayStop!=null&&
    (sniper.view.side==='BUY'?displayStop<price:sniper.view.side==='SELL'?displayStop>price:false);
  const ready=sniper.view.side!=='WAIT'&&sniper.view.priceFresh&&sniper.view.forecastFresh&&
    displayTargets.length>0&&historyFresh&&sameDirection&&ahead&&stopSafe&&
    (!journal||journal.state==='ACTIVE')&&(!auditRequired||journal?.state==='ACTIVE');
  const bands:PriceBand[]=[];
  if((ready||Boolean(journal))&&historyFresh){
    for(const t of displayTargets){
      bands.push({key:'TP'+t.stage,label:'TP'+t.stage+(journal&&journal.state!=='ACTIVE'?' · محفوظ':''),low:t.low,high:t.high,
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
  const projected=ready&&price!=null
    ?[{key:'NOW',price},...sniper.targets.map(t=>({key:'TP'+t.stage,price:t.price}))]
    :[];
  return {asset,sniper,candles,bands,price,historyAge,historyFresh,ready,displayTargets,displayStop,journal,
    lower,upper,projected,
    status:!candles.length?'NO_CANDLES':!historyFresh?'STALE_CANDLES':!ready?'WATCH':'SCENARIO'};
}
