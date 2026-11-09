import {readFile} from 'node:fs/promises';
import path from 'node:path';

export const runtime='nodejs';
export const dynamic='force-dynamic';

// Separate moving STOP EA; never change /download-gold or /download-sniper2.
export async function GET() {
  const filename='AlQannas_Candle_Chaser_Gold_M1_Demo.mq5';
  try {
    const source=await readFile(path.join(process.cwd(),'public','downloads',filename),'utf8');
    if(!source.includes('#property version "1.00"') ||
       !source.includes('InpMagic                  = 560179530') ||
       !source.includes('g_trade.BuyStop(') ||
       !source.includes('g_trade.SellStop('))
      return new Response('Candle Chaser download version mismatch',{status:503});
    return new Response(source,{
      status:200,
      headers:{
        'Content-Type':'application/octet-stream',
        'Content-Disposition':'attachment; filename="AlQannas_Candle_Chaser_Gold_M1_Demo.mq5"',
        'Content-Length':String(Buffer.byteLength(source,'utf8')),
        'Cache-Control':'no-store, max-age=0',
        'X-Content-Type-Options':'nosniff'
      }
    });
  } catch {
    return new Response('Candle Chaser temporarily unavailable',
                        {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
