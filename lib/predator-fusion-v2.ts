import type {Candle} from './engine';
type Side='BUY'|'SELL'|'WAIT';
const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const mean=(x:number[])=>x.length?x.reduce((a,b)=>a+b,0)/x.length:0;
const atr=(c:Candle[])=>{const x=c.slice(-15),v:number[]=[];for(let i=1;i<x.length;i++)v.push(Math.max(x[i].high-x[i].low,Math.abs(x[i].high-x[i-1].close),Math.abs(x[i].low-x[i-1].close)));return mean(v)||0;};
function slope(c:Candle[],n:number){const x=c.slice(-Math.max(2,n));if(x.length<2)return 0;return (x.at(-1)!.close-x[0].close)/Math.max(1,x.length-1);}
function one(price:number,a:number,seconds:number,signal:number,quality:number){
  const timeScale=Math.sqrt(Math.max(1,seconds)/60),signedMove=a*timeScale*cap(Math.abs(signal),.10,1.25)*Math.sign(signal||1),center=price+signedMove;
  const band=a*timeScale*(.24+(100-quality)/260),edge=cap(Math.abs(signal)*42,0,38),buy=cap(50+Math.sign(signal)*edge,8,92),sell=100-buy;
  const side:Side=Math.abs(signal)<.16?'WAIT':signal>0?'BUY':'SELL';
  return {seconds,side,price:Number(center.toFixed(2)),low:Number((center-band).toFixed(2)),high:Number((center+band).toFixed(2)),buyProbability:Number(buy.toFixed(1)),sellProbability:Number(sell.toFixed(1)),confidence:Math.round(cap(quality*.58+edge*.55-(side==='WAIT'?12:0),0,88))};
}
export function buildPredatorFusionV2(input:{c1:Candle[];c5:Candle[];price:number|null;tick?:any;goldCore?:any;now?:number}){
  const {c1,c5,tick,goldCore}=input,p=Number(input.price),a=Math.max(atr(c1),1e-9);
  if(!Number.isFinite(p)||p<=0||c1.length<40||c5.length<30)return {ok:false,status:'SHADOW_INSUFFICIENT',version:'predator-fusion-v2'};
  const s1=slope(c1,6)/a,s5=slope(c5,5)/Math.max(atr(c5),a),tickSide=tick?.side==='BUY'?1:tick?.side==='SELL'?-1:0;
  const tickStrength=tick?.ok?cap(Number(tick.confidence||tick.score||0)/100,0,1):0;
  const vel=cap(Number(tick?.velocity15s||0)/.7,-1.2,1.2),acc=cap(Number(tick?.acceleration||0)/.12,-1.2,1.2),imb=cap(Number(tick?.bookImbalance||0)/45,-1.2,1.2);
  const coreSide=goldCore?.side==='BUY'?1:goldCore?.side==='SELL'?-1:0,coreStrength=cap(Number(goldCore?.confidence||0)/100,0,1);
  const micro=tickSide*tickStrength*.55+vel*.25+acc*.25+imb*.18;
  const structure=cap(s1,-1.3,1.3)*.32+cap(s5,-1.3,1.3)*.38+coreSide*coreStrength*.30;
  const signal=cap(micro*.58+structure*.72,-1.4,1.4);
  const disagreement=tickSide&&coreSide&&tickSide!==coreSide;
  const regime=goldCore?.regime||((Math.abs(s1)+Math.abs(s5))>1?'TREND':'TRANSITION');
  const quality=cap(48+(tick?.ok?12:0)+(goldCore?.ok?10:0)+Math.min(12,Math.abs(signal)*10)-(disagreement?14:0)-(regime==='TRANSITION'?6:0),28,86);
  const horizons={thirtySeconds:one(p,a,30,signal*1.08,quality),oneMinute:one(p,a,60,signal,quality),threeMinutes:one(p,a,180,signal*.78+s5*.12,quality-2),fiveMinutes:one(p,a,300,signal*.62+s5*.22,quality-4)};
  const vals=Object.values(horizons),side:Side=Math.abs(signal)<.16?'WAIT':signal>0?'BUY':'SELL';
  return {ok:true,status:'SHADOW',version:'predator-fusion-v2',side,confidence:Math.round(mean(vals.map(x=>x.confidence))),uncertainty:Math.round(cap(100-quality+(disagreement?12:0),8,88)),regime,signal:Number(signal.toFixed(3)),horizons,inputs:{tick:!!tick?.ok,priceAction:!!goldCore?.ok,disagreement},promotion:{production:false,reason:'Requires live OOS outcome validation before decision authority'}};
}