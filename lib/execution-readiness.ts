// Strict server-side preflight for optional LIVE Exness orders.
// Preview decisions are not broker acknowledgements. No order is sent here.
export const LIVE_ACK='I_ACCEPT_LIVE_MT5_RISK_V1';
export type ExecutionReadiness={
  allowed:boolean;demoReady:boolean;blockedBy:string[];coreCheckedAt:number|null;
  brokerAccountVerified:boolean;brokerFeedVerified:boolean;aiCoreVerified:boolean;
};
const valid=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const eq=(a:unknown,b:unknown)=>String(a??'')===String(b??'');
export function assessExecutionReadiness(input:{
  now:number;enabled:boolean;killEnabled:boolean;tokenConfigured:boolean;
  ack:string|undefined;expectedLogin:string|undefined;expectedSymbol:string;
  mt5:any;quote:any;market:any;analysis:any;aiSnapshot:any;maxSpread:number;
}):ExecutionReadiness{
  const v=input,blocked:string[]=[];
  const add=(bad:boolean,code:string)=>{if(bad)blocked.push(code);};
  const bridge=v.mt5?.status,login=String(bridge?.account?.login??''),expected=String(v.expectedLogin??'').trim();
  const linked=Boolean(v.mt5?.connected&&v.mt5?.fresh&&v.mt5?.candlesFresh&&
    bridge?.symbol===v.expectedSymbol&&String(v.market?.priceSource||'').startsWith('Exness/MT5'));
  const accountOk=Boolean(/^\d{4,20}$/.test(expected)&&eq(login,expected)&&
    valid(Number(bridge?.account?.equity))&&valid(Number(bridge?.account?.balance)));
  const brokerQuote=Boolean(v.quote?.ok&&v.quote.status==='live'&&
    String(v.quote.source||'').startsWith('Exness/MT5')&&
    v.quote.brokerSymbol===v.expectedSymbol&&
    valid(Number(v.quote.bid))&&valid(Number(v.quote.ask))&&Number(v.quote.ask)>=Number(v.quote.bid));
  const priceMatch=brokerQuote&&bridge&&
    Math.abs(Number(bridge.bid)-Number(v.quote.bid))<=.02&&
    Math.abs(Number(bridge.ask)-Number(v.quote.ask))<=.02;
  const spreadOk=priceMatch&&Number.isFinite(Number(v.quote.spread))&&Number(v.quote.spread)>=0&&
    Number(v.quote.spread)<=v.maxSpread;
  const quoteAt=Number(v.quote?.sourceTime),quoteFresh=quoteAt>0&&quoteAt<=v.now+1500&&v.now-quoteAt<=5000;
  const core=v.aiSnapshot?.gold?.executionQuality;
  const at=Number(v.aiSnapshot?.checkedAt||0),age=v.now-at;
  const side=String(v.analysis?.signal?.sideCode||'')==='buy'?'BUY':
    String(v.analysis?.signal?.sideCode||'')==='sell'?'SELL':'WAIT';
  const aiOk=Boolean(at>0&&age>=0&&age<=90000&&core&&
    core.action===side&&side!=='WAIT'&&
    Number(core.confidence)>=72&&Number(core.dataQuality)>=78&&
    Number(core.uncertainty)<=38&&
    ['A+','A','B'].includes(String(core.quality))&&
    (!Array.isArray(core.vetoes)||core.vetoes.length===0));
  const highNews=Array.isArray(v.market?.events)&&v.market.events.some((e:any)=>
    Number(e.importance)>=3&&Number.isFinite(Number(e.time))&&
    Number(e.time)-v.now>=-300000&&Number(e.time)-v.now<=600000);
  add(!v.tokenConfigured,'bridge_token_missing');
  add(!v.enabled,'server_live_disabled');
  add(v.killEnabled,'kill_switch_on');
  add(v.ack!==LIVE_ACK,'explicit_live_ack_missing');
  add(!accountOk,'account_identity_unverified');
  add(!linked,'broker_candles_or_heartbeat_stale');
  add(bridge?.mode!=='live','bridge_not_in_live_mode');
  add(!brokerQuote||!priceMatch||!quoteFresh,'broker_quote_unverified');
  add(!spreadOk,'broker_spread_out_of_policy');
  add(!v.market?.newsReady,'economic_calendar_unavailable');
  add(Boolean(highNews),'major_news_blackout');
  add(!v.analysis?.signal||v.analysis?.state!=='setup','strategy_not_qualified');
  add(!aiOk,'predator_core_not_qualified_or_stale');
  add(v.analysis?.regime?.key==='shock'||v.analysis?.regime?.key==='unknown'||!v.analysis?.regime,
    'market_regime_unqualified');
  return {
    allowed:blocked.length===0,
    demoReady:linked&&brokerQuote&&quoteFresh&&accountOk,
    blockedBy:blocked,coreCheckedAt:at||null,
    brokerAccountVerified:accountOk,brokerFeedVerified:linked&&brokerQuote&&quoteFresh,aiCoreVerified:aiOk
  };
}
