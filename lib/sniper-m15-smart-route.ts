import type {WatchPriceMap,WatchPrice} from './sniper-m15-watch-prices';

export type MovementSide='BUY'|'SELL'|'WAIT';
export type ConditionalMovementRoute={
  ready:true; key:string; side:'BUY'|'SELL'; anchor:number; issuedAt:number;
  targets:readonly {price:number;source:'M15'|'H1';key:string}[];
  trigger:number|null; invalidation:number|null;
  evidence:'M1+M15'|'M1+PREMOVE'|'M1+M15+PREMOVE';
  certainty:'WATCH_ONLY'; timeBased:false; source:string;
};
export type MovementRouteResult=
 | ConditionalMovementRoute
 | {ready:false;reason:string};

export type MovementRouteInput={
  now:number; source:string; sourceReady:boolean;
  anchor:number|null; issuedAt:number|null;
  m1Ready:boolean; m1Side:MovementSide; m15Side:MovementSide;
  preMoveReady:boolean; preMoveSide:MovementSide;
  watch:WatchPriceMap; trigger:number|null; invalidation:number|null;
};

const finite=(p:number|null):p is number=>
  p!==null&&Number.isFinite(p)&&p>0;

/**
 * Constructs a non-timed conditional movement sketch using only authentic
 * levels confirmed before issuance. Never creates synthetic candle bodies.
 * A route is a research hypothesis, not a trade or calibrated probability.
 */
export function buildConditionalMovementRoute(p:MovementRouteInput):MovementRouteResult{
  const wait=(reason:string):MovementRouteResult=>({ready:false,reason});
  if(!p.sourceReady||!p.watch.ready||!p.source||!finite(p.anchor))
    return wait('السعر أو مصدر السيولة غير جاهز');
  if(!p.m1Ready||p.m1Side==='WAIT'||p.issuedAt==null||
    !Number.isFinite(p.issuedAt)||p.issuedAt>p.now||
    p.now-p.issuedAt>=60000)
    return wait('لا يوجد ترجيح دقيقة مغلقة وحديثة');
  const side=p.m1Side;
  if(p.m15Side!=='WAIT'&&p.m15Side!==side)
    return wait('اتجاه M15 يعارض الدقيقة');
  if(p.preMoveReady&&p.preMoveSide!=='WAIT'&&p.preMoveSide!==side)
    return wait('ضغط M1/M5 يعارض الدقيقة');
  const frameAgrees=p.m15Side===side;
  const pressureAgrees=p.preMoveReady&&p.preMoveSide===side;
  if(!frameAgrees&&!pressureAgrees)
    return wait('لا يوجد تأكيد مستقل للاتجاه');
  const directional=(v:number)=>side==='BUY'?v>p.anchor!:v<p.anchor!;
  const minGap=Math.max(0.01,(p.watch.atr??0)*0.12);
  const historical=(side==='BUY'?p.watch.upper:p.watch.lower)
    .filter((level:WatchPrice)=>Number.isFinite(level.price)&&
      directional(level.price))
    .sort((a,b)=>Math.abs(a.price-p.anchor!)-Math.abs(b.price-p.anchor!));
  const chosen:WatchPrice[]=[];
  for(const level of historical){
    if(chosen.length>=2)break;
    if(chosen.every(t=>Math.abs(t.price-level.price)>minGap))
      chosen.push(level);
  }
  if(!chosen.length)return wait('لا توجد سيولة تاريخية في الاتجاه المرجح');
  const first=chosen[0].price;
  // Never use a trigger beyond the first observed destination or behind entry.
  const trigger=finite(p.trigger)&&directional(p.trigger)&&
    (side==='BUY'?p.trigger<first:p.trigger>first)?p.trigger:null;
  const invalidation=finite(p.invalidation)&&
    (side==='BUY'?p.invalidation<p.anchor:p.invalidation>p.anchor)?
    p.invalidation:null;
  const evidence=frameAgrees&&pressureAgrees?'M1+M15+PREMOVE':
    frameAgrees?'M1+M15':'M1+PREMOVE';
  return {
    ready:true,key:[p.source,p.issuedAt,side].join('|'),
    source:p.source,side,issuedAt:p.issuedAt,anchor:p.anchor,
    targets:chosen.map(t=>({price:t.price,key:t.key,source:t.source})),
    trigger,invalidation,evidence,
    certainty:'WATCH_ONLY',timeBased:false
  };
}
