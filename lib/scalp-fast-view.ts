// Fast, honest M1/M5 market observation from the independent scalp data path.
// WATCH is never a broker order, ARMED setup or profit prediction.
type Side='BUY'|'SELL'|'WAIT';
export function readFastScalpView(desk:any,now:number){
  const checkedAt=Number(desk?.checkedAt||0);
  const quoteAt=Number(desk?.quote?.at||0);
  const fresh=Boolean(desk?.asset&&checkedAt>0&&quoteAt>0&&
    now-checkedAt>=0&&now-checkedAt<=12000&&
    now-quoteAt>=0&&now-quoteAt<=12000);
  const result={
    fresh,asset:desk?.asset==='GOLD'?'GOLD':'BTC',side:'WAIT' as Side,
    status:'UNAVAILABLE',horizon:null as number|null,score:null as number|null,
    entry:null as number|null,stop:null as number|null,target:null as number|null,
    reason:'الأسعار أو دورة السكالب متأخرة؛ لا نعرض اتجاهًا قديمًا',
    quoteAt,checkedAt,candleSource:String(desk?.candleSource||'')
  };
  if(!fresh)return result;
  const plans=(Array.isArray(desk?.plans)?desk.plans:[]).filter((p:any)=>
    (p?.side==='BUY'||p?.side==='SELL')&&Number(p?.score)>0
  ).sort((a:any,b:any)=>
    Number(b.status==='ARMED')-Number(a.status==='ARMED')||
    Number(b.horizon===5)-Number(a.horizon===5)||
    Number(b.score||0)-Number(a.score||0)
  );
  const plan=plans[0];
  if(plan){
    const side:Side=plan.side;
    const confirm=desk?.entryConfirmations?.find((x:any)=>x?.horizon===plan.horizon);
    const validEntry=Boolean(plan.status==='ARMED'&&confirm?.state==='ENTRY'&&
      Number.isFinite(Number(confirm.entry))&&Number(confirm.entry)>0&&
      Number.isFinite(Number(confirm.stop))&&Number(confirm.stop)>0&&
      Number(confirm.entry)!==Number(confirm.stop)&&
      Number.isFinite(Number(confirm.targets?.[0]?.price)));
    return {...result,side,status:validEntry?'PAPER_ENTRY':'CONDITIONAL_WATCH',
      horizon:Number(plan.horizon),score:Number(plan.score),
      entry:validEntry?Number(confirm.entry):Number.isFinite(Number(plan.entry))?Number(plan.entry):null,
      stop:Number.isFinite(Number(plan.stop))?Number(plan.stop):null,
      target:Number.isFinite(Number(plan.targets?.[0]?.price))?Number(plan.targets[0].price):null,
      reason:validEntry?'إشارة ورقية استوفت شروط الدخول، ليست أمر وسيط':
        String(plan.blockers?.[0]||confirm?.reason||plan.reason||'مستوى مراقبة فقط')
    };
  }
  const pressure=desk?.liquidity?.available?desk?.liquidity?.pressure:'WAIT';
  const side:Side=pressure==='BUY'||pressure==='SELL'?pressure:'WAIT';
  return {...result,side,status:side==='WAIT'?'NO_SETUP':'PRICE_PRESSURE_ONLY',
    reason:side==='WAIT'?'قراءة السعر محدثة لكن دون اتجاه أو إعداد مؤكد':
      'ميل لحظي من حركة السعر فقط؛ لا توجد صفقة أو هدف معتمد'};
}
