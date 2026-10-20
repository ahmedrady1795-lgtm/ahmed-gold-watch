import type {M15Bar,M15Side} from './sniper-m15-scenario';
/** Read-only M15 price-action bias. Observes momentum + slope + BOS from CLOSED
 * bars and never upgrades a paper trade, ML confidence or entry instruction. */
export type M15Bias={side:M15Side;votes:number;label:string;actionable:false};
export function observedM15Bias(bars:readonly M15Bar[]):M15Bias{
 const none=(label:string):M15Bias=>({side:'WAIT',votes:0,label,actionable:false});
 const xs=bars.slice(-26);
 if(xs.length<26||xs.some((b,i)=>!Number.isFinite(b.close)||
    b.low<=0||b.high<Math.max(b.open,b.close)||
    b.low>Math.min(b.open,b.close)||
    (i>0&&b.time-xs[i-1].time!==900000)))
   return none('M15 غير مكتمل');
 const rng=xs.slice(1).map((b,i)=>Math.max(b.high-b.low,
    Math.abs(b.high-xs[i].close),Math.abs(b.low-xs[i].close)));
 const atr=rng.slice(-14).reduce((s,x)=>s+x,0)/14;
 if(!Number.isFinite(atr)||atr<=0)return none('حركة غير كافية');
 const last=xs.at(-1)!;
 const sma=(n:number)=>xs.slice(-n).reduce((s,b)=>s+b.close,0)/n;
 const slope=sma(5)-sma(18);
 const impulse=last.close-xs.at(-5)!.close;
 const previous=xs.slice(-13,-1);
 const bosUp=last.close>Math.max(...previous.map(b=>b.high));
 const bosDown=last.close<Math.min(...previous.map(b=>b.low));
 const upside=Number(slope>atr*.30)+Number(impulse>atr*.70)+Number(bosUp);
 const downside=Number(slope<-atr*.30)+Number(impulse<-atr*.70)+Number(bosDown);
 if(upside>=2&&downside===0)return {side:'BUY',votes:upside,label:'ميل M15 صاعد',actionable:false};
 if(downside>=2&&upside===0)return {side:'SELL',votes:downside,label:'ميل M15 هابط',actionable:false};
 return none('توازن M15');
}

/** Read-only structural fallback; neutral M15 is not a veto on a fresh H1/H4
 * observation. This does not change any execution or confidence threshold. */
export function m15ObservationSide(local:M15Side,structural:{
 active:boolean;side:M15Side;agreement:number
}):M15Side{
 if(local!=='WAIT')return local;
 return structural.active&&structural.agreement>=2?structural.side:'WAIT';
}
