import type {PreMovePressure} from './pre-move-pressure';
import type {M15HuntPreview} from './sniper-m15-hunt-preview';
import type {M1Priority} from './sniper-m1-priority';
import type {LiquidityMagnetView} from './sniper-liquidity-magnets';
import type {FlowProfileDecision} from './flow-profile-decision';

export type FusionSide='BUY'|'SELL'|'WAIT';
export type LocalFusion={
  ready:boolean;side:FusionSide;
  phase:'OFFLINE'|'DISAGREEMENT'|'EARLY_CANDIDATE'|'M15_CONFLUENCE'|'WATCH';
  buyVotes:number;sellVotes:number;agreement:number;
  m1:'BUY'|'SELL'|'WAIT';m15:'BUY'|'SELL'|'WAIT';
  early:'BUY'|'SELL'|'WAIT';flow:'BUY'|'SELL'|'WAIT';flowQuality:FlowProfileDecision['quality'];reasons:string[];
  liquidityHint:string;confidenceIsProbability:false;tradeAuthorized:false;
};
/**
 * Lightweight independent CLOSED-CANDLE ensemble when the external ML and
 * Neural services are unavailable/rate limited. It must never pretend to
 * replace a neural model, turn historical fit into a 90% hit-rate or
 * authorize broker execution. A conflict between both strong frames is WAIT.
 */
export function fuseLocalSniper(input:{
  preMove:PreMovePressure;hunt:M15HuntPreview;m1:M1Priority;
  liquidity:LiquidityMagnetView;marketOpen:boolean;
  fresh:boolean;m15Fresh?:boolean;providerTransition:boolean;flowProfile?:FlowProfileDecision|null
}):LocalFusion{
  const {preMove:p,hunt:h,m1,liquidity:l}=input;
  const live=input.marketOpen&&input.fresh&&!input.providerTransition;
  const early: FusionSide=live&&p.ok&&
    (p.stage==='ARMED'||p.stage==='BUILDING')?p.side:'WAIT';
  const m15:FusionSide=live&&input.m15Fresh!==false&&h.ready&&!h.referenceOnly&&
    h.observation?.quality==='CLEAR'&&!h.observation.conflicting?
    h.preferred:'WAIT';
  const m1Side:FusionSide=live&&m1.ready&&m1.side!=='WAIT'?
    m1.side:'WAIT';
  let buyVotes=0,sellVotes=0;
  const reasons:string[]=[];
  const add=(side:FusionSide,weight:number,description:string)=>{
    if(side==='WAIT')return;
    if(side==='BUY')buyVotes+=weight;else sellVotes+=weight;
    reasons.push((side==='BUY'?'↑ ':'↓ ')+description);
  };
  add(early,4,'ضغط M1/M5 قبل الكسر');
  add(m15,3,'هيكل M15 من إغلاق موثوق');
  add(m1Side,1,'ميل M1 المغلق');
  const flow: FusionSide=live&&input.flowProfile?.ready?
    input.flowProfile.side:'WAIT';
  add(flow,5,input.flowProfile?.quality==='EXECUTED_SAMPLE'?
    'توزيع حجم الصفقات المنفذة حسب السعر مع دلتا التنفيذ':
    'نشاط تحديثات أسعار الوسيط مع عمقه المعلن (استرشادي)');
  const conflict=early!=='WAIT'&&m15!=='WAIT'&&early!==m15;
  // Valid independent order flow is a primary direction family, but cannot
  // overrule contradictory price structure to create a new trade signal.
  const flowConflict=flow!=='WAIT'&&(
    (early!=='WAIT'&&flow!==early)||(m15!=='WAIT'&&flow!==m15));
  const side:FusionSide=!live||conflict||flowConflict?'WAIT':
    flow!=='WAIT'&&(early===flow||m15===flow||m1Side===flow)?flow:
    early!=='WAIT'&&(m15===early||m1Side===early)?early:
    m15!=='WAIT'&&m1Side===m15?m15:'WAIT';
  const counted=buyVotes+sellVotes;
  const agreement=counted>0?Math.round(Math.max(buyVotes,sellVotes)/counted*100):0;
  const phase:LocalFusion['phase']=!live?'OFFLINE':
    (conflict||flowConflict)?'DISAGREEMENT':
    side!=='WAIT'&&early!=='WAIT'?'EARLY_CANDIDATE':
    side!=='WAIT'?'M15_CONFLUENCE':'WATCH';
  const liquidityHint=!l.ready?'مستويات السيولة غير متاحة':
    l.sweep==='HIGH_RECLAIMED_DOWN'?'رفض قمة M15 مغلقة':
    l.sweep==='LOW_RECLAIMED_UP'?'استرداد قاع M15 مغلق':
    l.above&&l.below?'مستويان متكرران فوق وتحت السعر':
    l.above?'تجمع قمم متكرر أعلى السعر':
    l.below?'تجمع قيعان متكرر أسفل السعر':
      'لا تجمع سعري متكرر مثبت';
  return {ready:live,side,phase,buyVotes,sellVotes,agreement,
    m1:m1Side,m15,early,flow,flowQuality:input.flowProfile?.quality||'UNAVAILABLE',reasons,liquidityHint,
    confidenceIsProbability:false,tradeAuthorized:false};
}
