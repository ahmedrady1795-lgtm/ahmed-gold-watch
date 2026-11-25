import fs from 'node:fs/promises';
import {validOpeningCall} from '../../../lib/gold-opening-call';

export const dynamic='force-dynamic';
export async function GET(){
 let call=null;
 try{
  const saved=JSON.parse(await fs.readFile('/tmp/qannas-gold-m5-opening.json','utf8'));
  if(validOpeningCall(saved,Date.now()))call=saved;
 }catch{}
 return Response.json({call},{headers:{'Cache-Control':'private, no-store'}});
}
