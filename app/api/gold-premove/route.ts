import {getMt5FastSignal} from '../../../lib/market-hub';
import {updateGoldMarketLead} from '../../../lib/market-lead-ai';

export const dynamic='force-dynamic';

export async function GET(){
  const now=Date.now();
  const lead=updateGoldMarketLead(getMt5FastSignal(now),now);
  const compatStage=lead.armed?'PRE_MOVE'
    :lead.stage==='RELEASED'?'MOVE_STARTED'
    :lead.stage==='BUILDING'?'WATCH'
    :lead.stage==='REJECTED'?'WAIT'
    :lead.stage==='OFFLINE'?'NO_DOM'
    :'WAIT';

  return Response.json({
    ...lead,
    lead:Boolean(lead.armed),
    stage:compatStage,
    source:lead.source,
    metrics:lead.metrics,
    checkedAt:now
  },{headers:{'Cache-Control':'no-store, no-cache, must-revalidate'}});
}
