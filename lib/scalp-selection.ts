// Pure, conservative selection for GOLD M5 BREAKOUT paper setups.
// A strong momentum score does not justify paying up at the candle extreme.
// We publish a near-boundary retest entry and invalidate BEYOND the real
// confirmed breakout candle, not merely below a synthetic volatility band.
export type BreakoutSide='BUY'|'SELL';
export type GoldM5BreakoutCheck={
  side:BreakoutSide;boundary:number;open:number;high:number;low:number;close:number;
  atr1:number;roundTripCost:number
};
export function selectGoldM5Breakout(x:GoldM5BreakoutCheck){
  const dir=x.side==='BUY'?1:-1;
  const range=x.high-x.low;
  const valid=[x.boundary,x.open,x.high,x.low,x.close,x.atr1,x.roundTripCost]
    .every(Number.isFinite)&&x.atr1>0&&range>0&&x.low>0&&
    x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close)&&x.roundTripCost>=0;
  if(!valid)return {entry:null,stop:null,blockers:['بيانات شمعة الاختراق غير صالحة'],wickRatio:null,extensionAtr:null};
  const boundaryBuffer=Math.max(x.atr1*.08,x.roundTripCost*.12,.02);
  const stopBuffer=Math.max(x.atr1*.10,x.roundTripCost*.16,.02);
  const entry=x.boundary+dir*boundaryBuffer;
  const stop=dir===1?Math.min(x.low,x.boundary)-stopBuffer:Math.max(x.high,x.boundary)+stopBuffer;
  const wick=dir===1?x.high-x.close:x.close-x.low;
  const wickRatio=wick/range,extensionAtr=dir*(x.close-x.boundary)/x.atr1;
  const blockers:string[]=[];
  if(extensionAtr<.05)blockers.push('جودة اختراق M5: الإغلاق خارج النطاق غير حاسم');
  if(extensionAtr>1.05)blockers.push('جودة اختراق M5: شمعة ممتدة؛ الدخول فقط بعد إعداد جديد');
  if(wickRatio>.34)blockers.push('جودة اختراق M5: ذيل رفض كبير عند القمة أو القاع');
  if(dir*(entry-stop)<=0)blockers.push('جودة اختراق M5: الوقف لا يقع خلف بنية الشمعة');
  return {entry,stop,blockers,wickRatio,extensionAtr};
}
