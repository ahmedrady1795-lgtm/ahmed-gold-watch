import {exportEveryM1Research} from '../../../lib/scalp-every-candle';
import {exportBtcEarlyForwardObservations} from '../../../lib/scalp-lead-audit';
export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Public *paper-only* evidence read; never an order, never an MT5 fill. */
export async function GET(){
 try{
  return Response.json({...exportEveryM1Research(),
    earlyObservations:exportBtcEarlyForwardObservations()},{
    headers:{'Cache-Control':'no-store','X-Research-Only':'paper-m1-forward'}});
 }catch{
  return Response.json({ok:false,reason:'scalp research currently unavailable'},{
    status:503,headers:{'Cache-Control':'no-store'}});
 }
}
