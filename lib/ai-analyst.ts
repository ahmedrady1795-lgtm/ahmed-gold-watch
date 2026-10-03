import type {Candle,Rules} from './engine';

type Asset='GOLD'|'BTC';
type RawAction='BUY'|'SELL'|'WAIT';
type HistoryPoint={at:number;action:RawAction;confidence:number};
const history=new Map<Asset,HistoryPoint[]>();

const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
const finite=(v:any)=>Number.isFinite(Number(v));
const closes=(c:Candle[])=>c.map(x=>x.close);

function atrProxy(c:Candle[],n=14){
  const x=c.slice(-(n+1));if(x.length<3)return NaN;
  const tr:number[]=[];
  for(let i=1;i<x.length;i++)tr.push(Math.max(x[i].high-x[i].low,Math.abs(x[i].high-x[i-1].close),Math.abs(x[i].low-x[i-1].close)));
  return tr.length?tr.reduce((a,b)=>a+b,0)/tr.length:NaN;
}
function efficiency(c:Candle[],n=20){
  const x=closes(c.slice(-(n+1)));if(x.length<3)return 0;
  const net=Math.abs(x.at(-1)!-x[0]);let path=0;for(let i=1;i<x.length;i++)path+=Math.abs(x[i]-x[i-1]);
  return path>0?Math.min(1,net/path):0;
}
function normalizedSlope(c:Candle[],n=12){
  const x=c.slice(-n);if(x.length<4)return 0;
  const atr=atrProxy(c);if(!finite(atr)||atr<=0)return 0;
  return (x.at(-1)!.close-x[0].close)/((x.length-1)*atr);
}
function rangePosition(c:Candle[],n=20){
  const x=c.slice(-n);if(!x.length)return .5;
  const hi=Math.max(...x.map(v=>v.high)),lo=Math.min(...x.map(v=>v.low)),p=x.at(-1)!.close;
  return hi>lo?Math.max(0,Math.min(1,(p-lo)/(hi-lo))):.5;
}
function freshScore(c:Candle[],ms:number,now:number){
  const last=c.filter(x=>x.time+ms<=now).at(-1);if(!last)return 0;
  const age=Math.max(0,now-(last.time+ms));
  if(age<=ms*1.5)return 100;
  if(age<=ms*3)return 75;
  if(age<=ms*6)return 45;
  return 0;
}
function dataQuality(c1:Candle[],c5:Candle[],c15:Candle[],c60:Candle[],now:number){
  const sizes=[c1.length>=80?100:c1.length/80*100,c5.length>=220?100:c5.length/220*100,c15.length>=220?100:c15.length/220*100,c60.length>=220?100:c60.length/220*100];
  const sizeScore=sizes.reduce((a,b)=>a+b,0)/4;
  const fresh=[freshScore(c1,60000,now),freshScore(c5,300000,now),freshScore(c15,900000,now),freshScore(c60,3600000,now)];
  const freshness=fresh[0]*.45+fresh[1]*.25+fresh[2]*.18+fresh[3]*.12;
  return {score:clamp(sizeScore*.35+freshness*.65),freshness:clamp(freshness),frameFreshness:{m1:fresh[0],m5:fresh[1],m15:fresh[2],h1:fresh[3]}};
}
function mtf(c1:Candle[],c5:Candle[],c15:Candle[],c60:Candle[]){
  const vals=[normalizedSlope(c1),normalizedSlope(c5),normalizedSlope(c15),normalizedSlope(c60)];
  const up=vals.filter(v=>v>.025).length,down=vals.filter(v=>v<-.025).length,flat=4-up-down;
  const side=up>down?'BUY':down>up?'SELL':'WAIT';
  const consensus=Math.max(up,down)/4;
  return {side:side as RawAction,consensus,up,down,flat,slopes:{m1:vals[0],m5:vals[1],m15:vals[2],h1:vals[3]}};
}
function structure(c5:Candle[]){
  const pos=rangePosition(c5,20),s=normalizedSlope(c5,10),eff=efficiency(c5,20);
  const side:RawAction=pos>=.68&&s>0?'BUY':pos<=.32&&s<0?'SELL':'WAIT';
  const strength=clamp(Math.abs(pos-.5)*120+Math.min(1,Math.abs(s))*25+eff*25);
  return {side,strength,rangePosition:Math.round(pos*100),efficiency:clamp(eff*100)};
}
function trendAlign(a:any){
  const f=a?.frames;if(!f)return 0;
  const up=[f.m5,f.m15,f.h1].filter((x:any)=>x?.ema20>x?.ema50).length;
  const down=[f.m5,f.m15,f.h1].filter((x:any)=>x?.ema20<x?.ema50).length;
  return Math.max(up,down)/3;
}
function reasons(a:any,mt:any,st:any){
  const out:string[]=[];const f=a?.frames,m=a?.metrics;
  if(a?.regime?.label)out.push('Regime: '+a.regime.label);
  if(m&&finite(m.adx))out.push('ADX M5 '+Number(m.adx).toFixed(1));
  if(m&&finite(m.rsi))out.push('RSI M5 '+Number(m.rsi).toFixed(1));
  if(m&&finite(m.macdHist))out.push('MACD '+(Number(m.macdHist)>0?'صاعد':'هابط'));
  if(f?.h1)out.push('H1 '+(f.h1.ema20>f.h1.ema50?'EMA صاعد':'EMA هابط'));
  out.push('MTF '+mt.up+'↑ / '+mt.down+'↓');
  out.push('Structure '+st.side+' · '+st.strength+'/100');
  return out.slice(0,7);
}
function pushHistory(asset:Asset,action:RawAction,confidence:number,now:number){
  const old=(history.get(asset)||[]).filter(x=>now-x.at<=60000);
  old.push({at:now,action,confidence});
  const next=old.slice(-4);history.set(asset,next);return next;
}
function stabilityOf(points:HistoryPoint[],side:RawAction){
  if(side==='WAIT'||!points.length)return 0;
  const same=points.filter(x=>x.action===side).length;
  const recent=[...points].slice(-3).reverse();
  const stop=recent.findIndex(x=>x.action!==side);
  const run=stop===-1?recent.length:stop;
  return clamp((same/points.length)*55+Math.min(3,run)/3*45);
}

export function aiDecision(asset:Asset,analysis:any,candles:{c1:Candle[];c5:Candle[];c15:Candle[];c60:Candle[]},price:number|null,sources:{quote:string;candles:string},now:number,rules:Rules){
  const {c1,c5,c15,c60}=candles;
  const long=Number(analysis?.score?.long||0),short=Number(analysis?.score?.short||0),best=Math.max(long,short),margin=Math.abs(long-short);
  const alignment=trendAlign(analysis),regimeConfidence=Number(analysis?.regime?.confidence||0),vol=Number(analysis?.metrics?.volatility||1);
  const dq=dataQuality(c1,c5,c15,c60,now),multi=mtf(c1,c5,c15,c60),st=structure(c5);
  const direction:RawAction=long>short?'BUY':short>long?'SELL':'WAIT';
  const directionAgreement=(direction!=='WAIT'&&multi.side===direction?14:multi.side==='WAIT'?0:-12)+(direction!=='WAIT'&&st.side===direction?8:0);
  const volatilityPenalty=vol>2.1?20:vol>1.7?12:vol>1.4?6:0;
  const confidence=clamp(best*.38+margin*.16+regimeConfidence*.12+multi.consensus*100*.14+alignment*100*.08+dq.score*.12+directionAgreement-volatilityPenalty);
  const confluence=clamp(best*.52+regimeConfidence*.12+multi.consensus*100*.13+st.strength*.09+dq.score*.14-volatilityPenalty);
  const uncertainty=clamp(100-(confidence*.72+dq.score*.18+multi.consensus*100*.10));
  const threshold=Math.max(Number(analysis?.score?.threshold||rules.minScore),rules.minScore);
  const minConfidence=asset==='BTC'?72:74;
  const sig=analysis?.signal||null;
  const sigSide:RawAction=sig?.sideCode==='buy'?'BUY':sig?.sideCode==='sell'?'SELL':'WAIT';
  const vetoes:string[]=[];
  if(analysis?.state==='stop')vetoes.push(String(analysis?.reason||'المحرك متوقف'));
  if(!sig)vetoes.push(String(analysis?.reason||'التوافق غير مكتمل'));
  if(best<threshold)vetoes.push('Score أقل من الحد');
  if(confidence<minConfidence)vetoes.push('ثقة النموذج أقل من الحد');
  if(dq.score<78)vetoes.push('جودة/حداثة البيانات غير كافية');
  if(vol>rules.spike)vetoes.push('التذبذب أعلى من الحد');
  if(sigSide!=='WAIT'&&multi.side!=='WAIT'&&multi.side!==sigSide)vetoes.push('تعارض اتجاه الأطر الزمنية');
  const rawQualified=Boolean(sig&&analysis?.state==='setup'&&confidence>=minConfidence&&dq.score>=78&&vol<=rules.spike&&(multi.side==='WAIT'||multi.side===sigSide));
  const rawAction:RawAction=rawQualified?sigSide:'WAIT';
  const points=pushHistory(asset,rawAction,confidence,now);
  const stability=stabilityOf(points,rawAction);
  const isNews=sig?.mode==='news';
  const stableEnough=isNews?rawQualified:rawQualified&&stability>=62&&points.filter(x=>x.action===rawAction).length>=2;
  const action:RawAction=stableEnough?rawAction:'WAIT';
  if(rawQualified&&!stableEnough)vetoes.push('الإشارة مرشحة لكن تحتاج تأكيدًا زمنيًا إضافيًا');
  const bias=direction==='BUY'?'BULLISH':direction==='SELL'?'BEARISH':'NEUTRAL';
  const quality=confidence>=84&&dq.score>=90&&uncertainty<=22?'A':confidence>=76&&dq.score>=82&&uncertainty<=32?'B':confidence>=68?'C':'D';
  const trade=sig?{side:sig.sideCode,entry:sig.entry,sl:sig.sl,tp:sig.tp,rr:sig.rr,score:sig.score,mode:sig.mode||'standard'}:null;
  return {
    asset,model:'Quant Ensemble v2',action,bias,quality,confidence,uncertainty,confluenceScore:confluence,stability,dataQuality:dq.score,freshness:dq.freshness,
    longScore:long,shortScore:short,threshold,price:finite(price)?Number(price):null,source:sources.quote,candleSource:sources.candles,updatedAt:now,
    regime:analysis?.regime||null,state:analysis?.state||'stop',title:analysis?.title||'WAIT',
    ensemble:{mtf:multi,structure:st,technicalMargin:margin,volatility:Number.isFinite(vol)?Number(vol.toFixed(2)):null},
    reasons:reasons(analysis,multi,st),vetoes:[...new Set(vetoes)].slice(0,6),
    trade:action==='WAIT'?null:trade,candidateTrade:trade,
    note:'Confidence وConfluence تقديرات جودة إشارة وليستا احتمال نجاح أو ضمان ربح.'
  };
}
