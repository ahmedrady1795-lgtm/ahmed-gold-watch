// Presentation-only, closed-candle explanation. Never starts an order or approves a trade.
export type DecisionSide='BUY'|'SELL'|'WAIT';
type Bar={time:number;open:number;high:number;low:number;close:number};
const finite=(x:unknown):number|null=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const round=(x:number)=>Number(x.toFixed(2));
const asSide=(s:unknown):DecisionSide=>s==='BUY'||s==='SELL'?s:'WAIT';

export function explainFrameConflict(side:DecisionSide,context:DecisionSide,contextReady:boolean){
  if(!contextReady)return 'قراءة آخر 4 ساعات غير مكتملة؛ لا نستخدمها لتأكيد اتجاه الدخول.';
  const contextLabel=context==='BUY'?'ميل شرائي':context==='SELL'?'ميل بيعي':'توازن / تذبذب';
  const decisionLabel=side==='BUY'?'ميل شرائي':side==='SELL'?'ميل بيعي':'غير محسوم';
  const explanation=side==='WAIT'?
    'الاتجاه العام غير محسوم بسبب عدم اكتمال توافق الفريمات أو شروط القناص.':
    context==='WAIT'?'ميل الأربع ساعات محلي ومحايد ولا يمنح تأكيدًا لاتجاه القناص.':
    side!==context?'الاتجاهان متعارضان؛ ننتظر توافقًا جديدًا بدل الجمع بينهما كإشارة.':
    'الاتجاهان متفقان مبدئيًا، لكن الدخول لا يزال يحتاج تأكيد الشموع وشروط المخاطرة.';
  return 'آخر 4 ساعات: '+contextLabel+'؛ قرار القناص: '+decisionLabel+'. '+explanation+
    ' تحليل 4 ساعات مبني على 240 شمعة M1، ويختلف عن مؤشر شمعة H4.';
}

export function buildBreakoutGuide(input:{
  frames:any;now:number;side:DecisionSide;price:number|null;sourceReady:boolean;invalidation?:number|null;
}){
  const data=new Map<number,Bar>();
  for(const c of Array.isArray(input.frames?.m5)?input.frames.m5:[]){
    const t=finite(c?.time),open=finite(c?.open),high=finite(c?.high),
      low=finite(c?.low),close=finite(c?.close);
    if(t==null||t<=0||t%300000!==0||t+300000>input.now||
      open==null||high==null||low==null||close==null||low<=0||
      high<Math.max(open,close)||low>Math.min(open,close))continue;
    data.set(t,{time:t,open,high,low,close});
  }
  const rows=[...data.values()].sort((a,b)=>a.time-b.time).slice(-40);
  const empty={ready:false,side:input.side,above:null as number|null,below:null as number|null,
    trigger:null as number|null,confirmed:false,confirmedAt:null as number|null,
    invalidation:null as number|null,reason:'مستويات الكسر تنتظر شموع M5 مغلقة وحديثة'};
  if(!input.sourceReady||rows.length<16)return empty;
  const end=rows.at(-1)!;
  if(input.now-(end.time+300000)>13*60000||input.now<end.time+300000||
     rows.slice(-16).some((r,i,a)=>i>0&&r.time-a[i-1].time!==300000))return empty;
  // The last two completed bars are *excluded* from breakout reference highs/lows.
  const basis=rows.slice(-14,-2),lastTwo=rows.slice(-2);
  const avgRange=basis.reduce((s,c)=>s+c.high-c.low,0)/basis.length;
  if(!Number.isFinite(avgRange)||avgRange<=0)return empty;
  const buffer=avgRange*.08,above=round(Math.max(...basis.map(c=>c.high))+buffer),
    below=round(Math.min(...basis.map(c=>c.low))-buffer);
  const side=asSide(input.side);
  const trigger=side==='BUY'?above:side==='SELL'?below:null;
  const confirmed=side==='BUY'?lastTwo.every(c=>c.close>above):
    side==='SELL'?lastTwo.every(c=>c.close<below):false;
  const stop=finite(input.invalidation),price=finite(input.price);
  const invalidation=stop!=null&&stop>0&&price!=null&&
    (side==='BUY'&&stop<price||side==='SELL'&&stop>price)?stop:null;
  const reason=side==='BUY'?('انتظار إغلاق شمعتي M5 متتاليتين فوق '+above):
    side==='SELL'?('انتظار إغلاق شمعتي M5 متتاليتين تحت '+below):
    ('الاتجاه غير محسوم: كسر شراء فوق '+above+' أو كسر بيع تحت '+below+
      ' بشمعتين M5 مغلقتين، ثم توافق الفريمات');
  return {ready:true,side,above,below,trigger,confirmed,
    confirmedAt:confirmed?end.time+300000:null,invalidation,
    reason:confirmed?'الكسر السعري بشمعتين M5 تحقق، لكن هذا ليس دخولًا: يلزم توافق M15/H1 وباقي الشروط.':
      reason+'، ثم توافق M15/H1 وبقية شروط المخاطرة.'};
}

// Stable, chart-local label lanes; the original market-price line never moves.
export function layoutPriceLanes<T extends {key:string;y:number}>(entries:T[],top:number,bottom:number,gap=20){
  if(bottom<top)return [] as Array<T&{labelY:number}>;
  const valid=entries.filter(e=>Number.isFinite(e.y)&&e.y>=top&&e.y<=bottom)
    .sort((a,b)=>a.y-b.y||a.key.localeCompare(b.key));
  if(!valid.length)return [] as Array<T&{labelY:number}>;
  const step=Math.min(gap,(bottom-top)/Math.max(1,valid.length-1));
  const labels=valid.map((entry,i)=>({...entry,labelY:Math.min(bottom,Math.max(top,entry.y)),
    }));
  for(let i=1;i<labels.length;i++)labels[i].labelY=Math.max(labels[i].labelY,labels[i-1].labelY+step);
  if(labels.at(-1)!.labelY>bottom){
    labels[labels.length-1].labelY=bottom;
    for(let i=labels.length-2;i>=0;i--)labels[i].labelY=Math.min(labels[i].labelY,labels[i+1].labelY-step);
  }
  return labels;
}
