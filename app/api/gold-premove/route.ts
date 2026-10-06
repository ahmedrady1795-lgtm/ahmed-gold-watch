import {getMt5BridgeStatus,getMt5FastSignal} from '../../../lib/market-hub';

export const dynamic='force-dynamic';

const sideSign=(side:any)=>side==='BUY'?1:side==='SELL'?-1:0;
const aligned=(value:number,threshold:number,sign:number)=>sign>0?value>=threshold:sign<0?value<=-threshold:false;

export async function GET(){
  const now=Date.now();
  const bridge=getMt5BridgeStatus(now);
  const fast:any=getMt5FastSignal(now);
  const status:any=bridge.status;
  const book:any=status?.microstructure?.orderBook;
  const bids=Array.isArray(book?.bids)?book.bids:[];
  const asks=Array.isArray(book?.asks)?book.asks:[];
  const domAvailable=Boolean(bridge.fresh&&bids.length&&asks.length&&fast?.ok);

  if(!domAvailable){
    return Response.json({
      ok:true,
      available:false,
      lead:false,
      side:'WAIT',
      stage:'NO_DOM',
      score:0,
      confidence:0,
      source:'Exness/MT5 DOM radar',
      checkedAt:now,
      reason:'رادار السيولة المبكر ينتظر DOM مباشر وحديث؛ سيولة Biquote المستقرة مستمرة بشكل منفصل.'
    },{headers:{'Cache-Control':'no-store, no-cache, must-revalidate'}});
  }

  const side=fast.side==='BUY'||fast.side==='SELL'?fast.side:'WAIT';
  const sign=sideSign(side);
  const imbalance=Number(fast.bookImbalance||0);
  const pressureChange=Number(fast.pressureChange||0);
  const replenish=Number(fast.replenishDelta||0);
  const acceleration=Number(fast.acceleration||0);
  const velocity05s=Number(fast.velocity05s||0);
  const velocity15s=Number(fast.velocity15s||0);
  const persistence=Number(fast.persistence||0);

  const depthEvidence=[
    aligned(imbalance,10,sign),
    aligned(pressureChange,5,sign),
    aligned(replenish,7,sign)
  ].filter(Boolean).length;
  const motionEvidence=[
    aligned(acceleration,.018,sign),
    persistence>=58
  ].filter(Boolean).length;
  const priceStillQuiet=Math.abs(velocity15s)<=.45&&Math.abs(velocity05s)<=.35;
  const earlyLead=Boolean(
    side!=='WAIT'&&priceStillQuiet&&depthEvidence>=2&&motionEvidence>=1&&
    Number(fast.score||0)>=55&&Number(fast.confidence||0)>=50
  );
  const moveStarted=Boolean(side!=='WAIT'&&(String(fast.stage)==='IGNITION'||Math.abs(velocity05s)>=.35));
  const watch=Boolean(side!=='WAIT'&&!earlyLead&&!moveStarted&&depthEvidence>=1);
  const stage=earlyLead?'PRE_MOVE':moveStarted?'MOVE_STARTED':watch?'WATCH':'WAIT';
  const score=Math.round(Math.max(0,Math.min(92,
    Number(fast.score||0)+depthEvidence*3+motionEvidence*2+(priceStillQuiet?4:0)-(moveStarted?5:0)
  )));
  const confidence=Math.round(Math.max(0,Math.min(90,
    Number(fast.confidence||0)*.72+score*.28+(earlyLead?4:0)
  )));

  const evidence:string[]=[];
  if(aligned(imbalance,10,sign))evidence.push(side==='BUY'?'تفوق واضح في عمق الـBid':'تفوق واضح في عمق الـAsk');
  if(aligned(pressureChange,5,sign))evidence.push('ضغط دفتر الأوامر يتحرك قبل السعر');
  if(aligned(replenish,7,sign))evidence.push(side==='BUY'?'إعادة تعبئة Bid أسرع':'إعادة تعبئة Ask أسرع');
  if(aligned(acceleration,.018,sign))evidence.push('تسارع مبكر في اتجاه الإشارة');
  if(persistence>=58)evidence.push('استمرارية ticks تؤيد الاتجاه');

  const reason=earlyLead
    ?('إنذار مبكر محتمل قبل الحركة: '+evidence.slice(0,3).join(' · '))
    :moveStarted
      ?'الحركة السعرية بدأت بالفعل؛ الرادار لم يعد يعتبرها إشارة قبلية.'
      :watch
        ?('ضغط سيولة قيد البناء: '+evidence.slice(0,2).join(' · '))
        :'لا يوجد اختلال DOM كافٍ يسبق حركة السعر حاليًا.';

  return Response.json({
    ok:true,
    available:true,
    lead:earlyLead,
    side,
    stage,
    score,
    confidence,
    source:'Exness/MT5 DOM radar',
    checkedAt:now,
    sourceTime:Number(fast.at||0),
    ageMs:Math.max(0,now-Number(fast.receivedAt||now)),
    price:Number(fast.price||0),
    priceStillQuiet,
    evidenceCount:depthEvidence+motionEvidence,
    reason,
    metrics:{
      bookImbalance:Number(imbalance.toFixed(1)),
      pressureChange:Number(pressureChange.toFixed(1)),
      replenishDelta:Number(replenish.toFixed(1)),
      acceleration:Number(acceleration.toFixed(4)),
      velocity05s:Number(velocity05s.toFixed(4)),
      velocity15s:Number(velocity15s.toFixed(4)),
      persistence:Math.round(persistence)
    }
  },{headers:{'Cache-Control':'no-store, no-cache, must-revalidate'}});
}
