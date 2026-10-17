/**
 * CPU-cheap display adapter for OFFLINE trained GOLD XAUUSD/MT5 shape rules.
 *
 * No backend ML inference or automatic trade authority. The only eligible
 * JSON comes from the read-only MT5 archive exporter and time-purged trainer.
 * Refuses mixed-provider feeds, untrained artifacts, stale or gapped bars.
 */
import type {GhostCandle,GhostForecast,GhostSide} from './ghost-forecast';
import modelFile from '../public/models/gold-shape-model.json';
type Bar={time:number;open:number;high:number;low:number;close:number};
type Shape={n:number;path:number[][];holdout:{
  n:number;wins:number;accuracy:number;wilsonLower:number;
  pairedMomentumBaseline:number;maeAtr:number;months:number}};
type Model={schema:string;status:string;source:string;symbol:string;frame:string;
  horizon:number;training:{origin:string;nonOverlapping:boolean;
  purgedSampleGap:number};patterns:Record<string,Shape>};
const model=modelFile as unknown as Model;
const isNum=(x:unknown)=>typeof x==='number'&&Number.isFinite(x);
function context(rows:Bar[]){
  const tail=rows.slice(-60),latest=tail.at(-1)!;
  const samples:number[]=[];
  for(let i=45;i<60;i++){
    const curr=tail[i],prev=tail[i-1];
    samples.push(Math.max(curr.high-curr.low,
      Math.abs(curr.high-prev.close),Math.abs(curr.low-prev.close)));
  }
  samples.sort((a,b)=>a-b);
  const a=(samples[6]+samples[7])/2;
  if(!isNum(a)||a<=latest.close*1e-6||a>latest.close*.025)return null;
  const d6=(latest.close-tail[53].close)/a,d12=(latest.close-tail[47].close)/a;
  const trend=d6>.32&&d12>.4?'UP':d6<-.32&&d12<-.4?'DOWN':'FLAT';
  const body=(latest.close-latest.open)/a;
  const b=body>.18?'UP':body<-.18?'DOWN':'SMALL';
  const utc=new Date(latest.time).getUTCHours();
  const session=utc<7?'ASIA':utc<13?'EU':utc<21?'US':'ROLL';
  const vol=(latest.high-latest.low)/a>1.55?'FAST':'NORMAL';
  return {a,key:[session,trend,b,vol].join('|')};
}
function certified(entry:Shape){
  const v=entry?.holdout;
  return Boolean(entry&&entry.n>=250&&Array.isArray(entry.path)&&entry.path.length===3&&
    entry.path.every(x=>Array.isArray(x)&&x.length===4&&x.every(isNum)&&x.every(n=>Math.abs(n)<45))&&
    v&&v.n>=100&&v.months>=3&&v.wins>=0&&v.wins<=v.n&&
    isNum(v.accuracy)&&isNum(v.wilsonLower)&&isNum(v.pairedMomentumBaseline)&&isNum(v.maeAtr)&&
    Math.abs(v.accuracy-v.wins/v.n)<.005&&
    v.wilsonLower>Math.max(.5,v.pairedMomentumBaseline)&&
    v.accuracy>=v.pairedMomentumBaseline+.04&&v.maeAtr<=1.3);
}
export function predictGoldTrainedShadow(args:{
  candles:Bar[];now:number;price:number|null;source:string;
  planSide:GhostSide;sourceReady:boolean;artifact?:Model
}):GhostForecast|null{
  const m=args.artifact??model;
  if(m?.schema!=='qannas-gold-shape-v1'||m.status!=='QUALIFIED'||
    m.source!=='MT5_XAUUSD_MONTHLY_ARCHIVE'||m.training?.origin!=='USER_MT5_TERMINAL'||
    m.training?.nonOverlapping!==true||m.training?.purgedSampleGap<3||
    m.frame!=='M1'||m.horizon!==3||!/^XAUUSD[a-z0-9._-]*$/i.test(m.symbol)||
    !args.source.startsWith('Exness/MT5 · ')||
    args.source!=='Exness/MT5 · '+m.symbol||!args.sourceReady)return null;
  const last60=args.candles.slice(-60);
  if(last60.length!==60||last60.some((c,i)=>!isNum(c.time)||c.time%60000!==0||
    ![c.open,c.high,c.low,c.close].every(isNum)||c.low<=0||
    c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close)||
    c.time+60000>args.now||(i>0&&c.time-last60[i-1].time!==60000)))return null;
  const last=last60.at(-1)!;
  if(args.now-last.time-60000>90000||args.price==null||!isNum(args.price)||args.price<=0)return null;
  const ctx=context(last60);
  if(!ctx||Math.abs(args.price-last.close)>1.25*ctx.a||
    last.high-last.low>3.8*ctx.a)return null;
  const shape=m.patterns?.[ctx.key];
  if(!shape||!certified(shape))return null;
  const offset=shape.path[2][3],side:GhostSide=offset>.09?'BUY':offset<-.09?'SELL':'WAIT';
  if(side==='WAIT'||(args.planSide!=='WAIT'&&args.planSide!==side))return null;
  let previous=last.close;
  const candles:GhostCandle[]=[];
  for(let i=0;i<3;i++){
    const offsets=shape.path[i],open=previous;
    const close=last.close+ctx.a*offsets[3];
    const high=Math.max(open,close,last.close+ctx.a*offsets[1]);
    const low=Math.min(open,close,last.close+ctx.a*offsets[2]);
    const width=ctx.a*.85*Math.sqrt(i+1);
    if(![close,high,low].every(isNum)||low<=0||high/low>1.07)return null;
    candles.push({step:(i+1) as 1|2|3,time:last.time+(i+1)*60000,
      open,close,high,low,
      lowerBand:Math.min(low,close-width),
      upperBand:Math.max(high,close+width)});
    previous=close;
  }
  const evidence=shape.holdout;
  return {ready:true,mode:'CANDLES',source:'GOLD_MT5_OOS_MODEL',
    reason:'نموذج أشكال ذهب مدرّب على MT5: مجموعة أنماط اجتازت اختبارًا زمنيًا مستقلًا؛ مراقبة فقط',
    baseAt:last.time,atr:ctx.a,side,candles,
    range:candles.map(c=>({time:c.time,low:c.lowerBand,high:c.upperBand,step:c.step})),
    validation:{samples:evidence.n,directionHits:evidence.wins,
      maeAtr:evidence.maeAtr,bandHits:0,note:'MT5 XAUUSD matched bucket, purged chronological OOS'}};
}
