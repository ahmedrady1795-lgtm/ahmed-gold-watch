import type {Event} from './engine';

type Side='BUY'|'SELL'|'WAIT';
type Asset='GOLD'|'BTC';

export type NewsIntelligence={
  ok:boolean;asset:Asset;checkedAt:number;side:Side;confidence:number;risk:number;
  phase:'CALM'|'PRE_EVENT'|'RELEASED'|'POST_EVENT';event:any|null;
  surprise:number|null;directional:boolean;weight:number;reasons:string[];
};

const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
function num(v:any){
  const s=String(v??'').trim().replace(/,/g,'');
  const m=s.match(/^(-?\d+(?:\.\d+)?)\s*([KMB%]?)$/i);if(!m)return null;
  const x=Number(m[1]);if(!Number.isFinite(x))return null;
  const u=m[2].toUpperCase();return x*(u==='K'?1e3:u==='M'?1e6:u==='B'?1e9:1);
}
function family(name:string){
  if(/CPI|PCE|PPI|inflation|price index|average hourly|earnings/i.test(name))return 'inflation';
  if(/nonfarm|payroll|employment change|unemployment|jobless|claims|JOLTS|job openings|employment situation/i.test(name))return 'labor';
  if(/FOMC|fed funds|interest rate|rate decision|Powell|Fed Chair|minutes/i.test(name))return 'fed';
  if(/GDP|retail sales|ISM|PMI|consumer confidence|durable goods|industrial production/i.test(name))return 'growth';
  return 'other';
}
function goldDirection(name:string,surprise:number):Side{
  const f=family(name);
  if(f==='inflation'||f==='growth')return surprise>0?'SELL':surprise<0?'BUY':'WAIT';
  if(f==='labor'){
    if(/unemployment|jobless|claims/i.test(name))return surprise>0?'BUY':surprise<0?'SELL':'WAIT';
    return surprise>0?'SELL':surprise<0?'BUY':'WAIT';
  }
  return 'WAIT';
}
function btcDirection(name:string,surprise:number):Side{
  const g=goldDirection(name,surprise);
  return g;
}
function eventScore(e:Event,now:number){
  const mins=(e.time-now)/60000,imp=Math.max(1,Math.min(3,Number(e.importance)||1));
  const proximity=mins>=0?cap(100-Math.max(0,mins)*2.2):cap(100-Math.abs(mins)*1.8);
  return imp*35+proximity*.65;
}
export function buildNewsIntelligence(asset:Asset,events:Event[],now=Date.now()):NewsIntelligence{
  const relevant=(events||[]).filter(e=>Number.isFinite(e.time)&&e.time>=now-2*3600000&&e.time<=now+6*3600000).sort((a,b)=>eventScore(b,now)-eventScore(a,now));
  const e=relevant[0]||null;
  if(!e)return {ok:true,asset,checkedAt:now,side:'WAIT',confidence:0,risk:8,phase:'CALM',event:null,surprise:null,directional:false,weight:0,reasons:['لا يوجد خبر USD قوي قريب من نافذة الحركة.']};
  const mins=(e.time-now)/60000,importance=Math.max(1,Math.min(3,Number(e.importance)||1));
  const actual=num(e.actual),forecast=num(e.forecast),previous=num(e.previous);
  const released=mins<=0,hasSurprise=released&&actual!=null&&forecast!=null;
  let phase:NewsIntelligence['phase']=mins>0?'PRE_EVENT':Math.abs(mins)<=30?'RELEASED':'POST_EVENT';
  const proximity=mins>0?cap(100-mins*2.5):cap(100-Math.abs(mins)*1.7);
  const risk=cap(importance*24+proximity*.45+(mins>0&&mins<=20?18:0),0,96);
  let surprise:number|null=null,side:Side='WAIT',confidence=0,directional=false,weight=0;
  const reasons:string[]=[];
  if(hasSurprise){
    const scale=Math.max(1,Math.abs(forecast!),Math.abs(previous??forecast!));
    surprise=(actual!-forecast!)/scale*100;
    side=asset==='GOLD'?goldDirection(e.name,surprise):btcDirection(e.name,surprise);
    directional=side!=='WAIT';
    const mag=Math.min(1.6,Math.abs(surprise)/12);
    confidence=directional?Math.round(cap(42+importance*9+mag*15+proximity*.10,0,88)):0;
    weight=directional?Math.min(.18,.06+importance*.025+confidence/1000):0;
    reasons.push(`${e.name}: Actual ${e.actual||'—'} مقابل Forecast ${e.forecast||'—'}.`);
    if(directional)reasons.push(`مفاجأة الخبر تميل إلى ${side==='BUY'?'الشراء':'البيع'}، لكن يلزم تأكيد السيولة والسعر.`);
    else reasons.push('نوع الخبر أو نتيجته لا يعطي اتجاهًا آليًا موثوقًا؛ سيُستخدم كعامل مخاطرة فقط.');
  }else{
    const preDelta=forecast!=null&&previous!=null?(forecast-previous)/Math.max(1,Math.abs(previous)):0;
    if(mins>0&&Math.abs(preDelta)>.002&&family(e.name)!=='fed'){
      side=asset==='GOLD'?goldDirection(e.name,preDelta):btcDirection(e.name,preDelta);
      confidence=side==='WAIT'?0:Math.round(cap(28+importance*6+Math.min(12,Math.abs(preDelta)*100),0,52));
      directional=side!=='WAIT';weight=directional?Math.min(.07,.025+importance*.012):0;
    }
    reasons.push(`${e.name} خلال ${mins>0?Math.ceil(mins)+' دقيقة':'وقت الإصدار'} · تأثير ${importance}/3.`);
    reasons.push('قبل صدور Actual، تأثير الخبر على الاتجاه محدود ويُرفع وزن المخاطرة بدل تخمين النتيجة.');
  }
  if(family(e.name)==='fed'&&!hasSurprise){side='WAIT';confidence=0;directional=false;weight=0;reasons.push('حدث فدرالي نصّي/قرار: الاتجاه لا يُستنتج من الاسم وحده؛ ينتظر رد فعل السعر والسيولة.');}
  return {ok:true,asset,checkedAt:now,side,confidence,risk,phase,event:{id:e.id,name:e.name,time:e.time,importance,actual:e.actual,forecast:e.forecast,previous:e.previous,source:e.source},surprise:surprise==null?null:Number(surprise.toFixed(3)),directional,weight:Number(weight.toFixed(3)),reasons};
}
