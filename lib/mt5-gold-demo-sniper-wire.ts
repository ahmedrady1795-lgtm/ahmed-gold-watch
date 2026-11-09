// Demo-only signal adapter for the EXISTING gold Ambush analysis.
// No market order is executed here; only the local Exness DEMO EA can place
// a protected pending STOP. Never use paper ledger events as real fills.
export type GoldDemoSniperDecision=
 |{ready:false;reason:string}
 |{ready:true;side:'BUY'|'SELL';symbol:'XAUUSDm';issuedAt:number;
   expiresAt:number;bid:number;ask:number;confidence:number};

const wait=(reason:string):GoldDemoSniperDecision=>({ready:false,reason});
const finite=(x:unknown)=>Number.isFinite(Number(x))?Number(x):NaN;

export function decideGoldDemoSniperSignal(body:any,now:number,brokerSymbol:string):GoldDemoSniperDecision{
  if(brokerSymbol!=='XAUUSDm')return wait('BROKER_SYMBOL_MISMATCH');
  if(!body||body.ok!==true||body.demoOnly!==true||
     body.authority!=='AMBUSH'||body.liveOrderAllowed!==false)
    return wait('SNIPER_DEMO_AUTHORITY_MISSING');
  if(body.ready!==true)return wait('BROKER_FEED_NOT_READY');

  const issuedAt=finite(body.checkedAt),expiresAt=finite(body.expiresAt);
  if(issuedAt<=0||issuedAt>now+1000||issuedAt<now-2000||
     expiresAt<=now+400||expiresAt>issuedAt+2500)
    return wait('SNIPER_SIGNAL_STALE');
  const quote=body.quote;
  const bid=finite(quote?.bid),ask=finite(quote?.ask);
  if(!String(quote?.source||'').startsWith('Exness/MT5')||
     !Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<=bid)
    return wait('NOT_VERIFIED_EXNESS_QUOTE');
  const ambush=body.ambush,plan=ambush?.plan,trade=ambush?.trade;
  const side=String(ambush?.side||'WAIT');
  if(ambush?.active!==true||!['BUY','SELL'].includes(side)||
     plan?.authority!=='AMBUSH'||plan?.status!=='EXECUTE'||
     plan?.entry?.ready!==true||plan?.invalidation?.cancel===true||
     trade?.authority!=='AMBUSH')
    return wait('AMBUSH_NOT_EXECUTABLE');
  if(plan.side!==side||String(trade.side).toUpperCase()!==side)
    return wait('AMBUSH_SIDE_CONFLICT');
  const entry=finite(trade.entry),sl=finite(trade.sl),tp=finite(trade.tp);
  const conf=finite(ambush.confidence);
  if(!Number.isFinite(conf)||conf<55||conf>100||
     ![entry,sl,tp].every(x=>Number.isFinite(x)&&x>0)||
     !(side==='BUY'?sl<entry&&entry<tp:tp<entry&&entry<sl))
    return wait('SNIPER_GEOMETRY_OR_CONFIDENCE');
  if(Math.abs(entry-(bid+ask)/2)>Math.max(.35,2*(ask-bid)))
    return wait('SNIPER_PRICE_NOT_CURRENT');
  return {ready:true,side:side as 'BUY'|'SELL',symbol:'XAUUSDm',
    issuedAt,expiresAt,bid,ask,confidence:Math.round(conf)};
}

export function goldDemoSniperWire(d:GoldDemoSniperDecision){
  if(!d.ready)return 'QGOLD1|WAIT|'+d.reason+'\n';
  return ['QGOLD1',d.side,d.symbol,d.issuedAt,d.expiresAt,
    d.bid.toFixed(3),d.ask.toFixed(3),d.confidence].join('|')+'\n';
}
