export const dynamic='force-dynamic';

export async function POST(){
  return Response.json({
    ok:true,
    configured:true,
    enabled:false,
    sent:false,
    reason:'telegram_trade_alerts_disabled_by_owner'
  },{headers:{'Cache-Control':'private, no-store'}});
}
