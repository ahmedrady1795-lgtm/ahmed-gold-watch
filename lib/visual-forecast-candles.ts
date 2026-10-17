/** Display-only short-range M1-style candles. Distant TP/H1/H4 levels NEVER set
 * invented future OHLC. Only evidence-gated first 3 candles may be historical
 * shadow forecasts; the rest are bounded and explicitly illustrative.
 */
type Bar={time:number;open:number;high:number;low:number;close:number};
type Ghost={mode:'OFF'|'RANGE'|'CANDLES';atr:number|null;side:'BUY'|'SELL'|'WAIT';
 candles:Array<Bar>};
export type VisualFutureBar=Bar&{step:number;validatedShape:boolean;scenarioShape:boolean};
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
const median=(a:number[])=>{
 const s=a.filter(x=>Number.isFinite(x)&&x>=0).sort((x,y)=>x-y),n=s.length;
 return n?(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2):0;
};
export function buildVisualFuture(input:{
 candles:Bar[];forecast:Ghost;side:'BUY'|'SELL'|'WAIT';count?:number;
 scenarioPath?:Array<{price:number;key?:string}>;
}):VisualFutureBar[]{
 const last=input.candles.at(-1),g=input.forecast,a=g?.atr;
 if(!last||g.mode==='OFF'||a==null||!Number.isFinite(a)||a<=0||
    !Number.isFinite(last.close)||last.close<=0)return [];
 const certified=g.mode==='CANDLES'&&g.candles.length===3;
 // A distant server WATCH is not a directional candle predictor.
 const sign=certified?(g.side==='BUY'?1:g.side==='SELL'?-1:0):0;
 const count=clamp(Math.floor(input.count??10),3,12);
 const recent=input.candles.slice(-20);
 const wUp=clamp(median(recent.map(c=>c.high-Math.max(c.open,c.close))),a*.08,a*.42);
 const wDown=clamp(median(recent.map(c=>Math.min(c.open,c.close)-c.low)),a*.08,a*.42);
 const bodies=clamp(median(recent.map(c=>Math.abs(c.close-c.open))),a*.08,a*.38);
 const trend=[.31,.44,-.24,.35,-.31,.42,.29,-.28,.38,-.23,.33,-.21];
 const flat=[.30,-.27,.23,-.33,.30,-.27,.24,-.30,.26,-.23,.27,-.25];
 const out:VisualFutureBar[]=[];
 let previous=last.close;
 for(let i=0;i<count;i++){
   if(certified&&i<3){
     const c=g.candles[i];
     if(![c.open,c.high,c.low,c.close].every(Number.isFinite)||
       c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close))return [];
     out.push({...c,step:i+1,validatedShape:true,scenarioShape:false});
     previous=c.close;continue;
   }
   const open=previous,rhythm=sign?trend:flat;
   const size=clamp(Math.abs(rhythm[i])*a*.63+
     bodies*(.09+.10*Math.abs(Math.sin(i*1.25))),a*.06,a*.36);
   const pullback=sign?0:-(open-last.close)*.24;
   const delta=clamp((sign||1)*Math.sign(rhythm[i])*size+pullback,-a*.42,a*.42);
   const close=Math.max(last.close*.01,clamp(open+delta,last.close-a*2.4,last.close+a*2.4));
   const high=Math.max(open,close)+wUp*(.82+.35*Math.abs(Math.sin(i*1.34)));
   const low=Math.max(last.close*.005,Math.min(open,close)-wDown*(.82+.35*Math.abs(Math.cos(i*1.21))));
   out.push({time:last.time+(i+1)*60000,open,high,low,close,
     step:i+1,validatedShape:false,scenarioShape:false});
   previous=close;
 }
 return out;
}
