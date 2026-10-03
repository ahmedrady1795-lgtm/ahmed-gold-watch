import type {Candle,Rules} from './engine';

type Asset='GOLD'|'BTC';
type RawAction='BUY'|'SELL'|'WAIT';
type HistoryPoint={at:number;action:RawAction;confidence:number};
type LivePulse={price?:number|null;delta?:number;deltaPct?:number;momentum?:number;direction?:'UP'|'DOWN'|'FLAT';source?:string;sourceTime?:number}|null;
const history=new Map<Asset,HistoryPoint[]>();

const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
const finite=(v:any)=>Number.isFinite(Number(v));
const closes=(c:Candle[])=>c.map(x=>x.close);

function atrProxy(c:Candle[],n=14){
  const x=c.slice(-(n+1));if(x.length<3)return NaN;
  const tr:number[]=[];for(let i=1;i<x.length;i++)tr.push(Math.max(x[i].high-x[i].low,Math.abs(x[i].high-x[i-1].close),Math.abs(x[i].low-x[i-1].close)));
  return tr.length?tr.reduce((a,b)=>a+b,0)/tr.length:NaN;
}
function efficiency(c:Candle[],n=20){
  const x=closes(c.slice(-(n+1)));if(x.length<3)return 0;
  const net=Math.abs(x.at(-1)!-x[0]);let path=0;for(let i=1;i<x.length;i++)path+=Math.abs(x[i]-x[i-1]);
  return path>0?Math.min(1,net/path):0;
}
function normalizedSlope(c:Candle[],n=12){
  const x=c.slice(-n);if(x.length<4)return 0;const atr=atrProxy(c);if(!finite(atr)||atr<=0)return 0;
  return (x.at(-1)!.close-x[0].close)/((x.length-1)*atr);
}
function rangePosition(c:Candle[],n=20){
  const x=c.slice(-n);if(!x.length)return .5;const hi=Math.max(...x.map(v=>v.high)),lo=Math.min(...x.map(v=>v.low)),p=x.at(-1)!.close;
  return hi>lo?Math.max(0,Math.min(1,(p-lo)/(hi-lo))):.5;
}
function freshScore(c:Candle[],ms:number,now:number){
  const last=c.filter(x=>x.time+ms<=now).at(-1);if(!last)return 0;const age=Math.max(0,now-(last.time+ms));
  if(age<=ms*1.5)return 100;if(age<=ms*3)return 75;if(age<=ms*6)return 45;return 0;
}
function dataQuality(c1:Candle[],c5:Candle[],c15:Candle[],c60:Candle[],now:number){
  const sizes=[c1.length>=80?100:c1.length/80*100,c5.length>=220?100:c5.length/220*100,c15.length>=220?100:c15.length/220*100,c60.length>=220?100:c60.length/220*100];
  const sizeScore=sizes.reduce((a,b)=>a+b,0)/4,fresh=[freshScore(c1,60000,now),freshScore(c5,300000,now),freshScore(c15,900000,now),freshScore(c60,3600000,now)];
  const freshness=fresh[0]*.45+fresh[1]*.25+fresh[2]*.18+fresh[3]*.12;
  return {score:clamp(sizeScore*.35+freshness*.65),freshness:clamp(freshness),frameFreshness:{m1:fresh[0],m5:fresh[1],m15:fresh[2],h1:fresh[3]}};
}
function mtf(c1:Candle[],c5:Candle[],c15:Candle[],c60:Candle[]){
  const vals=[normalizedSlope(c1),normalizedSlope(c5),normalizedSlope(c15),normalizedSlope(c60)],up=vals.filter(v=>v>.025).length,down=vals.filter(v=>v<-.025).length,flat=4-up-down;
  const side=up>down?'BUY':down>up?'SELL':'WAIT',consensus=Math.max(up,down)/4;
  return {side:side as RawAction,consensus,up,down,flat,slopes:{m1:vals[0],m5:vals[1],m15:vals[2],h1:vals[3]}};
}
function structure(c5:Candle[]){
  const pos=rangePosition(c5,20),s=normalizedSlope(c5,10),eff=efficiency(c5,20),side:RawAction=pos>=.68&&s>0?'BUY':pos<=.32&&s<0?'SELL':'WAIT';
  return {side,strength:clamp(Math.abs(pos-.5)*120+Math.min(1,Math.abs(s))*25+eff*25),rangePosition:Math.round(pos*100),efficiency:clamp(eff*100)};
}
function trendAlign(a:any){
  const f=a?.frames;if(!f)return 0;const up=[f.m5,f.m15,f.h1].filter((x:any)=>x?.ema20>x?.ema50).length,down=[f.m5,f.m15,f.h1].filter((x:any)=>x?.ema20<x?.ema50).length;
  return Math.max(up,down)/3;
}
function reasons(a:any,mt:any,st:any,hunter:any){
  const out:string[]=[];const f=a?.frames,m=a?.metrics;
  if(a?.regime?.label)out.push('Regime: '+a.regime.label);
  if(m&&finite(m.adx))out.push('ADX M5 '+Number(m.adx).toFixed(1));
  if(m&&finite(m.rsi))out.push('RSI M5 '+Number(m.rsi).toFixed(1));
  if(m&&finite(m.macdHist))out.push('MACD '+(Number(m.macdHist)>0?'صاعد':'هابط'));
  if(f?.h1)out.push('H1 '+(f.h1.ema20>f.h1.ema50?'EMA صاعد':'EMA هابط'));
  out.push('MTF '+mt.up+'↑ / '+mt.down+'↓');out.push('Structure '+st.side+' · '+st.strength+'/100');
  if(hunter?.mode)out.push('Hunter '+hunter.mode+' · '+hunter.score+'/100');
  return out.slice(0,8);
}
function frameVote(i:any,last:any){
  if(!i||!finite(last))return {buy:0,sell:0,bias:'WAIT',strength:0};
  let buy=0,sell=0;
  if(i.ema20>i.ema50)buy+=16;else sell+=16;
  if(last>i.ema200)buy+=14;else sell+=14;
  if(i.macdHist>0)buy+=14;else if(i.macdHist<0)sell+=14;
  if(i.rsi>=52&&i.rsi<=72)buy+=10;else if(i.rsi<=48&&i.rsi>=28)sell+=10;
  if(i.adx>=18){if(i.plusDI>i.minusDI)buy+=16;else if(i.minusDI>i.plusDI)sell+=16;}
  if(i.stochK>i.stochD&&i.stochK<88)buy+=10;else if(i.stochK<i.stochD&&i.stochK>12)sell+=10;
  if(last>i.bbMid)buy+=10;else if(last<i.bbMid)sell+=10;
  const best=Math.max(buy,sell),bias=buy-sell>=8?'BUY':sell-buy>=8?'SELL':'WAIT';
  return {buy:clamp(buy),sell:clamp(sell),bias,strength:clamp(best),adx:Number(i.adx?.toFixed?.(1)??i.adx),rsi:Number(i.rsi?.toFixed?.(1)??i.rsi),macdHist:Number(i.macdHist?.toFixed?.(4)??i.macdHist),volatility:Number(i.volatility?.toFixed?.(2)??i.volatility)};
}
function indicatorMatrix(a:any,candles:{c1:Candle[];c5:Candle[];c15:Candle[];c60:Candle[]}){
  const f=a?.frames||{},rows={
    m1:frameVote(f.m1,candles.c1.at(-1)?.close),
    m5:frameVote(f.m5,candles.c5.at(-1)?.close),
    m15:frameVote(f.m15,candles.c15.at(-1)?.close),
    h1:frameVote(f.h1,candles.c60.at(-1)?.close)
  };
  const weights:any={m1:.2,m5:.35,m15:.25,h1:.2};
  const buy=clamp(Object.entries(rows).reduce((s,[k,v]:any)=>s+v.buy*weights[k],0));
  const sell=clamp(Object.entries(rows).reduce((s,[k,v]:any)=>s+v.sell*weights[k],0));
  return {rows,buy,sell,bias:buy-sell>=8?'BUY':sell-buy>=8?'SELL':'WAIT',gap:Math.abs(buy-sell)};
}
function pushHistory(asset:Asset,action:RawAction,confidence:number,now:number){
  const old=(history.get(asset)||[]).filter(x=>now-x.at<=90000);old.push({at:now,action,confidence});const next=old.slice(-6);history.set(asset,next);return next;
}
function stabilityOf(points:HistoryPoint[],side:RawAction){
  if(side==='WAIT'||!points.length)return 0;const same=points.filter(x=>x.action===side).length,recent=[...points].slice(-4).reverse(),stop=recent.findIndex(x=>x.action!==side),run=stop===-1?recent.length:stop;
  return clamp((same/points.length)*50+Math.min(4,run)/4*50);
}
function breakout(c:Candle[],side:'BUY'|'SELL',n=12){
  const x=c.slice(-(n+1));if(x.length<n+1)return false;const last=x.at(-1)!,prior=x.slice(0,-1),hi=Math.max(...prior.map(v=>v.high)),lo=Math.min(...prior.map(v=>v.low));
  return side==='BUY'?last.close>hi:last.close<lo;
}
function bodyStrength(c:Candle[]){
  const x=c.at(-1);if(!x)return 0;const range=Math.max(1e-9,x.high-x.low);return Math.abs(x.close-x.open)/range;
}
function hunterPlan(asset:Asset,analysis:any,candles:{c1:Candle[];c5:Candle[];c15:Candle[];c60:Candle[]},price:number|null,dq:any,pulse:LivePulse){
  const {c1,c5,c15,c60}=candles,f=analysis?.frames||{},i1=f.m1||{},i5=f.m5||{},i15=f.m15||{},h1=f.h1||{},regime=analysis?.regime?.key||'unknown';
  if(dq.score<72||!finite(i1.atr)||!finite(i5.atr)||Number(i1.atr)<=0||Number(i5.atr)<=0)return {status:'WAIT',side:'WAIT' as RawAction,mode:'DATA_GUARD',score:0,threshold:100,gap:0,reason:'Hunter متوقف لأن جودة أو حداثة البيانات غير كافية.',trade:null};
  const p=finite(price)?Number(price):c1.at(-1)?.close||0,pos1=rangePosition(c1,20),pos5=rangePosition(c5,20),eff1=efficiency(c1,16),eff5=efficiency(c5,20),body=bodyStrength(c1);
  const liveMom=Number(pulse?.momentum||0),liveDir=pulse?.direction||'FLAT',vol=Number(i5.volatility||1);
  const sideScore=(side:'BUY'|'SELL',mode:'TREND'|'BREAKOUT'|'PULLBACK'|'REVERSAL')=>{
    const up=side==='BUY',slope1=normalizedSlope(c1,10),slope5=normalizedSlope(c5,12),slope15=normalizedSlope(c15,10),ema1=up?i1.ema20>i1.ema50:i1.ema20<i1.ema50,ema5=up?i5.ema20>i5.ema50:i5.ema20<i5.ema50,emaH=up?h1.ema20>h1.ema50:h1.ema20<h1.ema50,di1=up?i1.plusDI>i1.minusDI:i1.minusDI>i1.plusDI,di5=up?i5.plusDI>i5.minusDI:i5.minusDI>i5.plusDI,mac1=up?i1.macdHist>0:i1.macdHist<0,mac5=up?i5.macdHist>0:i5.macdHist<0,pulseOk=up?liveDir==='UP':liveDir==='DOWN';
    if(mode==='TREND'){
      let z=0;z+=(up?slope1>0:slope1<0)?8:0;z+=(up?slope5>0:slope5<0)?10:0;z+=(up?slope15>0:slope15<0)?8:0;z+=ema1?8:0;z+=ema5?12:0;z+=emaH?10:0;z+=di1&&Number(i1.adx)>=17?8:0;z+=di5&&Number(i5.adx)>=18?10:0;z+=mac1?7:0;z+=mac5?7:0;z+=(eff5>=.28?5:0);z+=pulseOk?Math.min(7,Math.round(liveMom/12)):0;return clamp(z);
    }
    if(mode==='BREAKOUT'){
      let z=0;z+=(up?pos1>=.72:pos1<=.28)?10:0;z+=(up?pos5>=.62:pos5<=.38)?8:0;z+=breakout(c1,side,10)?18:0;z+=breakout(c5,side,8)?12:0;z+=mac1?9:0;z+=di1&&Number(i1.adx)>=16?10:0;z+=mac5?7:0;z+=di5?7:0;z+=body>=.55?7:0;z+=pulseOk?Math.min(12,4+Math.round(liveMom/10)):0;return clamp(z);
    }
    if(mode==='PULLBACK'){
      let z=0;
      const near1=Math.abs(p-Number(i1.ema20))/Number(i1.atr)<=.65,near5=Math.abs(p-Number(i5.ema20))/Number(i5.atr)<=.85;
      const rsiOk=up?Number(i1.rsi)>=42&&Number(i1.rsi)<=64:Number(i1.rsi)<=58&&Number(i1.rsi)>=36;
      const stochTurn=up?i1.stochK>i1.stochD&&i1.stochK<=60:i1.stochK<i1.stochD&&i1.stochK>=40;
      z+=ema5?14:0;z+=emaH?12:0;z+=(up?i15.ema20>i15.ema50:i15.ema20<i15.ema50)?10:0;
      z+=near1?14:0;z+=near5?10:0;z+=rsiOk?10:0;z+=stochTurn?10:0;z+=mac1?7:0;z+=di5&&Number(i5.adx)>=18?8:0;z+=eff5>=.24?5:0;z+=pulseOk?Math.min(8,3+Math.round(liveMom/14)):0;
      return clamp(z);
    }
    let z=0;const extreme=up?pos1<=.22:pos1>=.78,rsi=Number(i1.rsi),stochTurn=up?i1.stochK>i1.stochD&&i1.stochK<=35:i1.stochK<i1.stochD&&i1.stochK>=65,bb=up?c1.at(-1)!.low<=i1.bbLower:c1.at(-1)!.high>=i1.bbUpper,reversalBody=up?c1.at(-1)!.close>c1.at(-1)!.open:c1.at(-1)!.close<c1.at(-1)!.open;
    z+=(regime==='range'?15:0);z+=extreme?20:0;z+=(up?rsi<=42:rsi>=58)?15:0;z+=stochTurn?15:0;z+=bb?12:0;z+=reversalBody&&body>=.45?10:0;z+=di1?5:0;z+=pulseOk?Math.min(8,Math.round(liveMom/12)):0;return clamp(z);
  };
  const modes=(['TREND','BREAKOUT','PULLBACK','REVERSAL'] as const).map(mode=>{const buy=sideScore('BUY',mode),sell=sideScore('SELL',mode);return {mode,buy,sell,side:(buy>=sell?'BUY':'SELL') as RawAction,score:Math.max(buy,sell),gap:Math.abs(buy-sell)};});
  const best=modes.sort((a,b)=>b.score-a.score)[0],baseThreshold=best.mode==='TREND'?70:best.mode==='BREAKOUT'?68:best.mode==='PULLBACK'?67:72;
  let threshold=baseThreshold+(vol>1.55?4:0)+(dq.score<82?4:0)-(dq.score>=92?2:0)-(liveMom>=45?3:0);
  if(best.mode==='TREND'&&regime==='range')threshold+=5;if(best.mode==='PULLBACK'&&regime==='range')threshold+=4;if(best.mode==='REVERSAL'&&regime!=='range')threshold+=5;threshold=Math.max(64,Math.min(82,threshold));
  const minGap=best.mode==='BREAKOUT'&&liveMom>=45?7:9,qualified=best.score>=threshold&&best.gap>=minGap&&vol<=2.25;
  const watch=best.score>=threshold-8&&best.gap>=6;
  let trade:any=null;
  if((qualified||watch)&&p>0){
    const atr1=Number(i1.atr),atr5=Number(i5.atr),anchor=best.mode==='TREND'?Math.min(atr5*.5,atr1*2):atr1,recent=c1.slice(-8),buy=best.side==='BUY',swing=buy?Math.min(...recent.map(x=>x.low)):Math.max(...recent.map(x=>x.high)),minRisk=.7*anchor,maxRisk=1.4*anchor,raw=Math.abs(p-swing),risk=Math.max(minRisk,Math.min(maxRisk,raw)),dir=buy?1:-1,rr=best.mode==='TREND'?1.7:best.mode==='BREAKOUT'?1.55:1.35;
    trade={mode:'hunter-'+best.mode.toLowerCase(),side:buy?'buy':'sell',entry:p,sl:p-dir*risk,tp:p+dir*rr*risk,rr,score:best.score,validForSeconds:best.mode==='BREAKOUT'?75:best.mode==='REVERSAL'?120:150};
  }
  return {status:qualified?'STRIKE':watch?'WATCH':'WAIT',side:best.side,mode:best.mode,score:best.score,threshold,gap:best.gap,regime,liveMomentum:liveMom,metrics:{positionM1:Math.round(pos1*100),positionM5:Math.round(pos5*100),efficiencyM1:clamp(eff1*100),efficiencyM5:clamp(eff5*100),body:clamp(body*100),volatility:Number(vol.toFixed(2))},scores:modes,reason:qualified?`Hunter وجد ${best.mode} ${best.side} بقوة ${best.score}/100 مقابل حد ${threshold} وفارق ${best.gap}.`:watch?`فرصة تحت المراقبة: ${best.mode} ${best.side} ${best.score}/100؛ تحتاج دفعة إضافية قبل الدخول.`:`أفضل نمط ${best.mode} ${best.side} ${best.score}/100؛ لم يصل بعد لحد الهجوم ${threshold}.`,trade};
}

export function aiDecision(asset:Asset,analysis:any,candles:{c1:Candle[];c5:Candle[];c15:Candle[];c60:Candle[]},price:number|null,sources:{quote:string;candles:string},now:number,rules:Rules,pulse:LivePulse=null){
  const {c1,c5,c15,c60}=candles,long=Number(analysis?.score?.long||0),short=Number(analysis?.score?.short||0),best=Math.max(long,short),margin=Math.abs(long-short),alignment=trendAlign(analysis),regimeConfidence=Number(analysis?.regime?.confidence||0),vol=Number(analysis?.metrics?.volatility||1);
  const dq=dataQuality(c1,c5,c15,c60,now),multi=mtf(c1,c5,c15,c60),st=structure(c5),matrix=indicatorMatrix(analysis,candles),hunter=hunterPlan(asset,analysis,candles,price,dq,pulse);
  const direction:RawAction=long>short?'BUY':short>long?'SELL':'WAIT',directionAgreement=(direction!=='WAIT'&&multi.side===direction?14:multi.side==='WAIT'?0:-12)+(direction!=='WAIT'&&st.side===direction?8:0),volatilityPenalty=vol>2.1?20:vol>1.7?12:vol>1.4?6:0;
  const baseConfidence=clamp(best*.38+margin*.16+regimeConfidence*.12+multi.consensus*100*.14+alignment*100*.08+dq.score*.12+directionAgreement-volatilityPenalty),hunterConfidence=clamp(hunter.score*.72+dq.score*.16+Math.min(100,Number(pulse?.momentum||0))*.12-volatilityPenalty),confidence=Math.max(baseConfidence,hunter.status==='STRIKE'?hunterConfidence:0);
  const fusionBuy=clamp(long*.28+matrix.buy*.42+(hunter.side==='BUY'?hunter.score*.20:0)+dq.score*.10);
  const fusionSell=clamp(short*.28+matrix.sell*.42+(hunter.side==='SELL'?hunter.score*.20:0)+dq.score*.10);
  const fusionSide:RawAction=fusionBuy-fusionSell>=6?'BUY':fusionSell-fusionBuy>=6?'SELL':'WAIT';
  const confluence=clamp(Math.max(best*.42+regimeConfidence*.10+multi.consensus*100*.10+st.strength*.08+dq.score*.10+Math.max(matrix.buy,matrix.sell)*.20-volatilityPenalty,hunter.score*.62+dq.score*.10+Math.min(100,Number(pulse?.momentum||0))*.08+Math.max(matrix.buy,matrix.sell)*.20));
  const uncertainty=clamp(100-(confidence*.72+dq.score*.18+Math.max(multi.consensus*100,hunter.score)*.10)),threshold=Math.max(Number(analysis?.score?.threshold||rules.minScore),rules.minScore),minConfidence=asset==='BTC'?64:66;
  const sig=analysis?.signal||null,sigSide:RawAction=sig?.sideCode==='buy'?'BUY':sig?.sideCode==='sell'?'SELL':'WAIT';
  const fusionGap=Math.abs(fusionBuy-fusionSell);
  const standardConflict=Boolean(sig&&fusionSide!=='WAIT'&&fusionSide!==sigSide&&fusionGap>=10);
  const hunterConflict=Boolean(hunter.status==='STRIKE'&&fusionSide!=='WAIT'&&fusionSide!==hunter.side&&fusionGap>=8);
  const standardQualified=Boolean(sig&&analysis?.state==='setup'&&baseConfidence>=minConfidence&&dq.score>=72&&vol<=rules.spike&&(multi.side==='WAIT'||multi.side===sigSide)&&!standardConflict);
  const hunterQualified=Boolean(hunter.status==='STRIKE'&&hunter.trade&&dq.score>=78&&!hunterConflict);
  const rawAction:RawAction=standardQualified?sigSide:hunterQualified?hunter.side:'WAIT',chosenTrade=standardQualified&&sig?{side:sig.sideCode,entry:sig.entry,sl:sig.sl,tp:sig.tp,rr:sig.rr,score:sig.score,mode:sig.mode||'standard'}:hunterQualified?hunter.trade:null;
  const vetoes:string[]=[];
  if(standardConflict)vetoes.push(`Conflict Gate: Standard ${sigSide} يعارض Fusion ${fusionSide} بفارق ${fusionGap}`);
  if(hunterConflict)vetoes.push(`Conflict Gate: Hunter ${hunter.side} يعارض Fusion ${fusionSide} بفارق ${fusionGap}`);
  if(!standardQualified&&!hunterQualified){if(analysis?.state==='stop')vetoes.push(String(analysis?.reason||'المحرك القياسي متوقف'));if(best<threshold)vetoes.push('Standard score أقل من الحد');if(hunter.score<hunter.threshold)vetoes.push('Hunter لم يصل لحد الهجوم');if(dq.score<72)vetoes.push('جودة/حداثة البيانات غير كافية');if(vol>rules.spike)vetoes.push('التذبذب أعلى من الحد الآمن');}
  const points=pushHistory(asset,rawAction,confidence,now),stability=stabilityOf(points,rawAction),isNews=sig?.mode==='news',pulseConfirm=rawAction==='BUY'?pulse?.direction==='UP':rawAction==='SELL'?pulse?.direction==='DOWN':false,fastStrike=hunterQualified&&hunter.score>=84&&dq.score>=90&&Boolean(pulseConfirm)&&Number(pulse?.momentum||0)>=35;
  const stableEnough=isNews?standardQualified:rawAction!=='WAIT'&&(fastStrike||(stability>=46&&points.filter(x=>x.action===rawAction).length>=2)),action:RawAction=stableEnough?rawAction:'WAIT';
  if(rawAction!=='WAIT'&&!stableEnough)vetoes.push('فرصة قوية مرصودة؛ ينتظر Hunter تأكيدًا زمنيًا قصيرًا');
  const bias=(hunter.status!=='WAIT'?hunter.side:direction)==='BUY'?'BULLISH':(hunter.status!=='WAIT'?hunter.side:direction)==='SELL'?'BEARISH':'NEUTRAL',quality=confidence>=86&&dq.score>=90&&uncertainty<=22?'A+':confidence>=80&&dq.score>=86?'A':confidence>=72?'B':confidence>=64?'C':'D';
  return {
    asset,model:'Quant Predator v5 · Multi-Strategy Fusion',action,bias,quality,confidence,uncertainty,confluenceScore:confluence,stability,dataQuality:dq.score,freshness:dq.freshness,longScore:long,shortScore:short,threshold,price:finite(price)?Number(price):null,source:sources.quote,candleSource:sources.candles,updatedAt:now,regime:analysis?.regime||null,state:analysis?.state||'stop',title:action!=='WAIT'?`HUNTER STRIKE · ${action}`:hunter.status==='WATCH'?`HUNTER WATCH · ${hunter.mode} ${hunter.side}`:analysis?.title||'WAIT',
    ensemble:{mtf:multi,structure:st,technicalMargin:margin,volatility:Number.isFinite(vol)?Number(vol.toFixed(2)):null},indicatorMatrix:matrix,fusion:{buy:fusionBuy,sell:fusionSell,side:fusionSide,gap:Math.abs(fusionBuy-fusionSell)},phase:(standardConflict||hunterConflict)?'CONFLICT':hunter.status==='STRIKE'?'ATTACK':hunter.status==='WATCH'?'STALK':hunter.score>=hunter.threshold-12?'SCAN':'WAIT',hunter,reasons:reasons(analysis,multi,st,hunter),vetoes:[...new Set(vetoes)].slice(0,7),trade:action==='WAIT'?null:chosenTrade,candidateTrade:chosenTrade||hunter.trade||null,
    note:'Hunter Score وConfidence مقاييس جودة/توافق وليستا احتمال نجاح أو ضمان ربح.'
  };
}
