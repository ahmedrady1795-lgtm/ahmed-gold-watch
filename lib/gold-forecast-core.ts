import type {Candle} from './engine';
import {indicators} from './engine';

type Side='BUY'|'SELL'|'WAIT';
type Horizon={side:Side;confidence:number;buyProbability:number;sellProbability:number;uncertainty:number;expectedMove:number;low:number|null;high:number|null};
const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const sigmoid=(x:number)=>1/(1+Math.exp(-x));
const mean=(x:number[])=>x.length?x.reduce((a,b)=>a+b,0)/x.length:0;
function closed(c:Candle[],ms:number,now:number){return c.filter(x=>x.time+ms<=now);}
function atr(c:Candle[],n=14){const x=c.slice(-(n+1));if(x.length<3)return 0;const tr:number[]=[];for(let i=1;i<x.length;i++)tr.push(Math.max(x[i].high-x[i].low,Math.abs(x[i].high-x[i-1].close),Math.abs(x[i].low-x[i-1].close)));return mean(tr.slice(-n));}
function features(c:Candle[]){
  const a=atr(c),x=c.slice(-24),last=x.at(-1)!;
  const ret=(n:number)=>x.length>n&&a>0?(last.close-x.at(-(n+1))!.close)/a:0;
  const ranges=x.map(v=>v.high-v.low),base=mean(ranges.slice(-20,-4)),recent=mean(ranges.slice(-4));
  const body=a>0?(last.close-last.open)/a:0,range=Math.max(1e-9,last.high-last.low);
  const upper=(last.high-Math.max(last.open,last.close))/range,lower=(Math.min(last.open,last.close)-last.low)/range;
  const hi=Math.max(...x.slice(-11,-1).map(v=>v.high)),lo=Math.min(...x.slice(-11,-1).map(v=>v.low));
  const breakout=last.close>hi?1:last.close<lo?-1:0;
  const fake=last.high>hi&&last.close<hi?-1:last.low<lo&&last.close>lo?1:0;
  return {a,r1:ret(1),r3:ret(3),r8:ret(8),body,wick:lower-upper,expansion:base>0?recent/base:1,breakout,fake};
}
function horizon(logit:number,confidenceBase:number,price:number,a:number,scale:number):Horizon{
  const p=sigmoid(logit),buy=p*100,sell=(1-p)*100,edge=Math.abs(buy-sell),uncertainty=cap(100-edge);
  const side:Side=edge<10?'WAIT':buy>sell?'BUY':'SELL';
  const confidence=Math.round(cap(confidenceBase*.52+edge*.48-(side==='WAIT'?12:0),0,91));
  const signed=(p-.5)*2,move=a*scale*Math.max(.18,Math.abs(signed));
  const center=price+Math.sign(signed||1)*move;
  return {side,confidence,buyProbability:Number(buy.toFixed(1)),sellProbability:Number(sell.toFixed(1)),uncertainty:Math.round(uncertainty),expectedMove:Number(move.toFixed(3)),low:Number((center-a*scale*.28).toFixed(2)),high:Number((center+a*scale*.28).toFixed(2))};
}
export function buildGoldForecastCore(c1:Candle[],c5:Candle[],c15:Candle[],c60:Candle[],price:number|null,now=Date.now()){
  const a1=closed(c1,60000,now),a5=closed(c5,300000,now),a15=closed(c15,900000,now),h1=closed(c60,3600000,now),p=Number(price);
  if(a1.length<80||a5.length<80||a15.length<80||h1.length<80||!Number.isFinite(p)||p<=0)return {ok:false,status:'INSUFFICIENT_DATA',side:'WAIT' as Side,confidence:0,uncertainty:100};
  const f1=features(a1),f5=features(a5),i1=indicators(a1),i5=indicators(a5),i15=indicators(a15),ih=indicators(h1),a=Math.max(f1.a,1e-9);
  const trend1=(i1.ema20-i1.ema50)/a,trend5=(i5.ema20-i5.ema50)/Math.max(f5.a,1e-9),trend15=(i15.ema20-i15.ema50)/Math.max(Number(i15.atr)||a,1e-9),trendH=(ih.ema20-ih.ema50)/Math.max(Number(ih.atr)||a,1e-9);
  const macro=cap(trend15,-2,2)*.42+cap(trendH,-2,2)*.28;
  const momentum=cap(f1.r1,-2,2)*.22+cap(f1.r3,-2,2)*.32+cap(f1.r8,-2,2)*.18;
  const rejection=cap(f1.wick,-1,1)*.52+f1.fake*.72;
  const expansion=cap(f1.expansion-1,-1,1);
  const breakImpulse=f1.breakout*(.62+.28*Math.max(0,expansion));
  const osc=cap((i1.rsi-50)/25,-1.5,1.5)*.18+cap((i5.rsi-50)/25,-1.5,1.5)*.20;
  const oneLogit=momentum*.74+trend1*.24+trend5*.18+rejection*.40+breakImpulse*.48+osc*.25+macro*.18;
  const fiveLogit=momentum*.24+trend1*.14+trend5*.48+macro*.62+rejection*.18+breakImpulse*.28+osc*.30;
  const regime=f1.expansion>=1.35?'EXPANSION':f1.expansion<=.72?'COMPRESSION':Math.abs(trend15)+Math.abs(trendH)>=1.0?'TREND':'TRANSITION';
  const quality=cap(56+Math.min(16,Math.abs(trend15)*5+Math.abs(trendH)*4)+Math.min(12,Math.abs(momentum)*5)-(regime==='TRANSITION'?7:0),35,88);
  const m1=horizon(oneLogit,quality,p,a,.85),m5=horizon(fiveLogit,quality,p,Math.max(f5.a,a),.72);
  const agree=m1.side!=='WAIT'&&m1.side===m5.side;
  const side:Side=agree?m1.side:m1.confidence>=m5.confidence+12?m1.side:m5.confidence>=m1.confidence+12?m5.side:'WAIT';
  const confidence=side==='WAIT'?Math.round(Math.max(m1.confidence,m5.confidence)*.68):Math.round(cap((m1.confidence*.48+m5.confidence*.52)+(agree?6:0),0,91));
  const uncertainty=Math.round(cap((m1.uncertainty+m5.uncertainty)/2+(m1.side!==m5.side?14:0),0,100));
  const fakeoutRisk=cap((Math.abs(f1.fake)*42)+(f1.expansion<.8?18:0)+(m1.side!==m5.side?20:0),0,100);
  return {ok:true,status:side==='WAIT'?'UNCERTAIN':'FORECAST',side,confidence,uncertainty,regime,fakeoutRisk:Math.round(fakeoutRisk),horizons:{oneMinute:m1,fiveMinute:m5},features:{momentum:Number(momentum.toFixed(3)),trendM1:Number(trend1.toFixed(3)),trendM5:Number(trend5.toFixed(3)),trendM15:Number(trend15.toFixed(3)),trendH1:Number(trendH.toFixed(3)),rejection:Number(rejection.toFixed(3)),expansion:Number(f1.expansion.toFixed(3)),breakout:f1.breakout,fakeout:f1.fake},source:'XAUUSD price-action forecast core v1'};
}