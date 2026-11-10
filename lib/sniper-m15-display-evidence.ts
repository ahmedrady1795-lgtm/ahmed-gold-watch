import type {M15HuntPreview,HuntSide} from './sniper-m15-hunt-preview';
import type {M15HuntProof} from './sniper-m15-hunt-proof';
import type {M1Priority} from './sniper-m1-priority';

/** Read-only visual arbitration of already-observed independent time frames.
 * Never creates a forecast, trades, targets, synthetic bars or a probability.
 * A weak/tied M15 observer cannot win a coin flip against genuine M1 data. */
export type HuntDisplayState='REFERENCE'|'UNCERTAIN'|'CONFLICT'|
  'ALIGNED_WATCH'|'PRELIMINARY_EDGE';
export type HuntDisplayEvidence={
  state:HuntDisplayState;side:HuntSide|'WAIT';reason:string;
  highlighted:boolean;tradeAuthorized:false;
};
export function assessM15HuntDisplay(args:{
  hunt:M15HuntPreview;m1:M1Priority;proof?:M15HuntProof;
  marketOpen:boolean;flowSide?:HuntSide|'WAIT';
}):HuntDisplayEvidence{
  const {hunt:h,m1,proof,marketOpen}=args;
  const out=(state:HuntDisplayState,side:HuntSide|'WAIT',
    reason:string):HuntDisplayEvidence=>({
      state,side,reason,highlighted:side!=='WAIT',tradeAuthorized:false
    });
  if(!h.ready||!marketOpen||h.referenceOnly)
    return out('REFERENCE','WAIT',
      !marketOpen?'السوق مغلق · مساران تاريخيان فقط':
      h.referenceOnly?'بيانات جزئية · مساران مرجعيان فقط':
      'بيانات M15 غير كافية لعرض ترجيح');
  const o=h.observation;
  if(!o||o.quality!=='CLEAR'||o.conflicting||h.preferred==='WAIT')
    return out('UNCERTAIN','WAIT','القراءة متعارضة · مساران مشروطان');
  if(proof?.status==='NO_DEMONSTRATED_EDGE')
    return out('UNCERTAIN','WAIT',
      'الاختبار لا يثبت تفوقًا على الاتجاه السابق · مساران للمراقبة');
  const opposes=(side:HuntSide|'WAIT'|undefined)=>side&&side!=='WAIT'&&
    side!==h.preferred;
  if(m1.ready&&opposes(m1.side))
    return out('CONFLICT','WAIT',
      'تعارض M1 مع M15 · لا مسار مرجح حتى يتفق الإغلاقان');
  if(opposes(args.flowSide))
    return out('CONFLICT','WAIT',
      'تعارض تدفق الأوامر مع M15 · لا ترجيح مع اختلاف المصادر');
  if(!m1.ready||m1.side==='WAIT')
    return out('UNCERTAIN','WAIT',
      'M15 مرصود لكن M1 غير مؤيد · مساران مشروطان');
  if(proof?.status==='FORWARD_EDGE_CANDIDATE')
    return out('PRELIMINARY_EDGE',h.preferred,
      (h.preferred==='BUY'?'↑':'↓')+
      ' ميل متفق عليه M1/M15 · تفوق تاريخي أولي غير مضمون');
  return out('ALIGNED_WATCH',h.preferred,
    (h.preferred==='BUY'?'↑':'↓')+
    ' مراقبة متوافقة M1/M15 · الأداء المستقبلي غير مثبت');
}
