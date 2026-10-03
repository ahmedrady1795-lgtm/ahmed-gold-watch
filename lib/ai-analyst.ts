import type {Rules} from './engine';

const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
function trendAlign(a:any){
  const f=a?.frames;if(!f)return 0;
  const up=[f.m5,f.m15,f.h1].filter((x:any)=>x?.ema20>x?.ema50).length;
  const down=[f.m5,f.m15,f.h1].filter((x:any)=>x?.ema20<x?.ema50).length;
  return Math.max(up,down)/3;
}
function reasons(a:any){
  const out:string[]=[];const f=a?.frames,m=a?.metrics;
  if(a?.regime?.label)out.push('Regime: '+a.regime.label);
  if(m&&Number.isFinite(m.adx))out.push('ADX M5 '+m.adx.toFixed(1));
  if(m&&Number.isFinite(m.rsi))out.push('RSI M5 '+m.rsi.toFixed(1));
  if(m&&Number.isFinite(m.macdHist))out.push('MACD '+(m.macdHist>0?'صاعد':'هابط'));
  if(f?.h1)out.push('H1 '+(f.h1.ema20>f.h1.ema50?'EMA صاعد':'EMA هابط'));
  if(a?.levels?.sweep&&a.levels.sweep!=='لا يوجد سحب ظاهر في آخر شمعة M5')out.push(a.levels.sweep);
  return out.slice(0,6);
}
export function aiDecision(asset:'GOLD'|'BTC',analysis:any,price:number|null,source:string,now:number,rules:Rules){
  const long=Number(analysis?.score?.long||0),short=Number(analysis?.score?.short||0),best=Math.max(long,short);
  const alignment=trendAlign(analysis);
  const regimeConfidence=Number(analysis?.regime?.confidence||0);
  const vol=Number(analysis?.metrics?.volatility||1);
  const volatilityPenalty=vol>1.8?12:vol>1.4?6:0;
  const confluence=clamp(best*.68+regimeConfidence*.14+alignment*18-volatilityPenalty);
  const sig=analysis?.signal||null;
  const action=sig?.sideCode==='buy'?'BUY':sig?.sideCode==='sell'?'SELL':'WAIT';
  const threshold=Math.max(Number(analysis?.score?.threshold||rules.minScore),rules.minScore);
  const vetoes:string[]=[];
  if(!sig)vetoes.push(String(analysis?.reason||'التوافق غير مكتمل'));
  if(best<threshold)vetoes.push('Score أقل من الحد');
  if(vol>rules.spike)vetoes.push('التذبذب أعلى من الحد');
  return {
    asset,action,confluenceScore:confluence,longScore:long,shortScore:short,threshold,
    price:Number.isFinite(Number(price))?Number(price):null,source,updatedAt:now,
    regime:analysis?.regime||null,state:analysis?.state||'stop',title:analysis?.title||'WAIT',
    reasons:reasons(analysis),vetoes:[...new Set(vetoes)].slice(0,4),
    trade:sig?{side:sig.sideCode,entry:sig.entry,sl:sig.sl,tp:sig.tp,rr:sig.rr,score:sig.score,mode:sig.mode||'standard'}:null,
    note:'Confluence score وليس احتمال نجاح أو ضمان ربح.'
  };
}
