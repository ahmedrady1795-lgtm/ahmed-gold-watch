// FX universe PRE-FLIGHT, not fake real-time FX quotes and never an order.
// Trading suitability depends on fresh broker bid/ask, volatility and actual
// account commission/slippage; none may be inferred from USD gold or BTC.
export type FxSymbol='EURUSD'|'USDJPY'|'GBPUSD'|'USDCAD'|'AUDUSD'|'EURGBP'|'EURAUD'|'USDCHF'|'NZDUSD';
export const FX_WATCHLIST:ReadonlyArray<{
 symbol:FxSymbol;pipSize:number;priority:'FIRST'|'SECOND';label:string
}>=[
 {symbol:'EURUSD',pipSize:.0001,priority:'FIRST',label:'سيولة مرتفعة غالبًا؛ أول زوج للاختبار'},
 {symbol:'USDJPY',pipSize:.01,priority:'FIRST',label:'اختبر تأثير الأخبار والفروق الزمنية'},
 {symbol:'GBPUSD',pipSize:.0001,priority:'FIRST',label:'حركة أسرع غالبًا؛ يلزم انضباط السبريد'},
 {symbol:'USDCAD',pipSize:.0001,priority:'SECOND',label:'حساسية للأخبار الأمريكية والكندية'},
 {symbol:'AUDUSD',pipSize:.0001,priority:'SECOND',label:'اختبر سيولة الجلسة المناسبة'},
 {symbol:'EURGBP',pipSize:.0001,priority:'SECOND',label:'حركة أهدأ غالبًا؛ قارن التكلفة بالهدف'},
 {symbol:'EURAUD',pipSize:.0001,priority:'SECOND',label:'فارق أوسع محتمل؛ لا دخول دون قياس'},
 {symbol:'USDCHF',pipSize:.0001,priority:'SECOND',label:'زوج رئيسي؛ راقب أثر الأخبار وتغير السبريد'},
 {symbol:'NZDUSD',pipSize:.0001,priority:'SECOND',label:'ساعات سيولة متفاوتة؛ اختبار تكلفة M1 وM5 مطلوب'}
];
export type FxBrokerObservation={
  bid:number;ask:number;quoteAt:number;m1Atr:number;m5Atr:number;
  commissionRoundTripBps:number;slippageRoundTripBps:number;
};
export function screenFxQuote(symbol:string,now:number,obs?:Partial<FxBrokerObservation>){
  const pair=FX_WATCHLIST.find(p=>p.symbol===symbol);
  if(!pair)return {symbol,status:'NOT_SUPPORTED',eligible:false,reason:'الرمز غير موجود في قائمة التقييم'};
  const common={symbol,pipSize:pair.pipSize,priority:pair.priority,eligible:false};
  if(!obs||obs.bid==null||obs.ask==null||obs.quoteAt==null)
    return {...common,status:'BROKER_FEED_REQUIRED',reason:'بانتظار أسعار BID/ASK حقيقية ومحدثة من حساب MT5 لنفس الزوج'};
  const bid=Number(obs.bid),ask=Number(obs.ask),quoteAt=Number(obs.quoteAt);
  const m1Atr=Number(obs.m1Atr),m5Atr=Number(obs.m5Atr);
  const commissionRoundTripBps=obs.commissionRoundTripBps,
    slippageRoundTripBps=obs.slippageRoundTripBps;
  if(![bid,ask,quoteAt,m1Atr,m5Atr].every(Number.isFinite)||
     !Number.isFinite(now)||bid<=0||ask<bid||m1Atr<=0||m5Atr<=0||
     quoteAt>now+2000||now-quoteAt>10000||now-quoteAt<0)
    return {...common,status:'STALE_OR_BAD_DATA',reason:'سعر أو شموع غير صحيحة أو تغذية قديمة؛ التداول ممنوع'};
  if(commissionRoundTripBps==null||slippageRoundTripBps==null||
     ![commissionRoundTripBps,slippageRoundTripBps].every(v=>
       typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100))
    return {...common,status:'EXECUTION_COST_REQUIRED',
      spreadPips:Number(((ask-bid)/pair.pipSize).toFixed(2)),
      reason:'تحتاج عمولة وانزلاق الوسيط الفعليين؛ لا نفترض تكلفة صفر'};
  const mid=(bid+ask)/2,spread=ask-bid;
  const drag=spread+mid*(Number(commissionRoundTripBps)+Number(slippageRoundTripBps))/10000;
  const ratio1=drag/m1Atr,ratio5=drag/m5Atr;
  const spreadPips=Number((spread/pair.pipSize).toFixed(2));
  const totalCostPips=Number((drag/pair.pipSize).toFixed(2));
  const result={...common,spreadPips,totalCostPips,
    costToM1Atr:Number(ratio1.toFixed(3)),costToM5Atr:Number(ratio5.toFixed(3))};
  if(ratio5>.30)return {...result,status:'COST_BLOCKED',reason:'تكلفة التنفيذ كبيرة جدًا أمام حركة خمس دقائق'};
  if(ratio1>.25)return {...result,status:'M5_WATCH_ONLY',reason:'فريم الدقيقة غير اقتصادي؛ يمكن اختبار M5 تاريخيًا فقط'};
  return {...result,status:'PAPER_RESEARCH_ONLY',
    reason:'التكلفة قابلة للفحص؛ لازال يلزم اختبار اتجاه مستقل وتأكيد وقف/هدف قبل أي دخول ورقي'};
}
