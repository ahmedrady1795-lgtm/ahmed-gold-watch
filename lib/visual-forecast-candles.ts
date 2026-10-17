/**
 * Illustrative OHLC continuation for the main chart. The first three bars may
 * come from an evidence-gated M1 shadow; all later bars are schematic only.
 * Never feed these prices into alerts, execution, target scoring, or backtests.
 */
type RealBar={time:number;open:number;high:number;low:number;close:number};
type GhostLike={mode:'OFF'|'RANGE'|'CANDLES';atr:number|null;side:'BUY'|'SELL'|'WAIT';
  candles:Array<{time:number;open:number;high:number;low:number;close:number}>};
export type VisualFutureBar={time:number;open:number;high:number;low:number;close:number;
  step:number;validatedShape:boolean;scenarioShape:boolean};
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
export function buildVisualFuture(input:{
  candles:RealBar[];forecast:GhostLike;side:'BUY'|'SELL'|'WAIT';
  count?:number;scenarioPath?:Array<{price:number;key?:string}>;
}):VisualFutureBar[]{
  const {candles,forecast}=input;
  const last=candles.at(-1),a=forecast?.atr;
  // The independent ghost safety gate must have accepted fresh, contiguous M1
  // data before even a neutral illustration is allowed.
  if(!last||forecast.mode==='OFF'||a==null||!Number.isFinite(a)||a<=0||
      !Number.isFinite(last.close)||last.close<=0)return [];
  const scenarioPath=(input.scenarioPath??[]).map(p=>p.price);
  const scenario= scenarioPath.length>=2&&scenarioPath.every(p=>Number.isFinite(p)&&p>0)&&
    input.side!=='WAIT'&&Math.abs(scenarioPath[0]-last.close)<=Math.max(a*3,last.close*.0005);
  const count=clamp(Math.floor(input.count??(scenario?30:16)),3,36);
  const certified=forecast.mode==='CANDLES'&&forecast.candles.length===3;
  // In unqualified conditions do NOT infer a trading signal from weak motion.
  // A server-observed side is only an illustration, never OHLC evidence.
  const side=certified?forecast.side:input.side;
  const sign=side==='BUY'?1:side==='SELL'?-1:0;
  const historical=candles.slice(-20);
  const wickUp=historical.map(c=>c.high-Math.max(c.open,c.close)).filter(Number.isFinite);
  const wickDown=historical.map(c=>Math.min(c.open,c.close)-c.low).filter(Number.isFinite);
  const median=(arr:number[])=>{
    const s=arr.sort((x,y)=>x-y),n=s.length;
    return n?(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2):a*.18;
  };
  const upper=clamp(median(wickUp),a*.09,a*.40);
  const lower=clamp(median(wickDown),a*.09,a*.40);
  const rhythm=[.36,.30,-.19,.43,.28,-.21,.32,.23,-.17,.46,.27,-.26,.35,.25,-.15,.31,.22,-.19,.36,.17];
  let prior=last.close;
  const out:VisualFutureBar[]=[];
  // Where the server already has authoritative target waypoints, illustrate
  // the conditional price route with more candle bodies. The horizontal axis
  // is a scenario-stage axis, NOT a time prediction. No fabricated ETA.
  const waypointPrice=(f:number)=>{
    if(!scenario)return null;
    const legs=scenarioPath.length-1,position=clamp(f,0,1)*legs;
    const seg=Math.min(legs-1,Math.floor(position)),raw=position-seg;
    const ease=raw*raw*(3-2*raw);
    return scenarioPath[seg]+(scenarioPath[seg+1]-scenarioPath[seg])*ease;
  };
  for(let i=0;i<count;i++){
    if(certified&&!scenario&&i<3){
      const c=forecast.candles[i];
      out.push({...c,step:i+1,validatedShape:true,scenarioShape:false});
      prior=c.close;
      continue;
    }
    const open=prior;
    // Directional bias only shapes a what-if path; amplitude is limited to
    // observed M1 volatility and does NOT imply a TP arrival time.
    const drift=sign?
      sign*a*rhythm[i]+a*.065*Math.sin(i*1.83):
      a*(.29*Math.sin((i+1)*1.67)-.19*Math.sin((i+1)*.71))-
      (open-last.close)*.22;
    const target=waypointPrice((i+1)/count);
    const prevWaypoint=waypointPrice(i/count);
    const legMove=target==null||prevWaypoint==null?0:target-prevWaypoint;
    const wiggle=scenario?
      Math.min(a*.42,Math.abs(legMove)*.6)*Math.sin((i+1)*2.15):
      0;
    const delta=scenario?(i===count-1?target!-open:
      legMove+wiggle-(i?Math.min(a*.42,Math.abs(legMove)*.6)*Math.sin(i*2.15):0)):
      clamp(drift,-a*.48,a*.48);
    const close=Math.max(last.close*.0001,open+delta);
    const high=Math.max(open,close)+upper*(.8+.33*Math.abs(Math.sin(i*1.41)));
    const low=Math.max(last.close*.00001,Math.min(open,close)-lower*(.8+.33*Math.abs(Math.cos(i*1.19))));
    out.push({time:last.time+(i+1)*60000,open,high,low,close,step:i+1,
      validatedShape:false,scenarioShape:Boolean(scenario)});
    prior=close;
  }
  return out;
}
