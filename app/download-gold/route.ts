import {readFile} from 'node:fs/promises';
import path from 'node:path';

export const runtime='nodejs';
export const dynamic='force-dynamic';

// Serve a real MQL5 attachment, not a browser text preview.
export async function GET(){
  try{
    const filename='AlQannas_Gold_M1_Limit_Demo.mq5';
    const source=await readFile(path.join(process.cwd(),'public','downloads',filename),'utf8');
    return new Response(source,{
      status:200,
      headers:{
        'Content-Type':'application/octet-stream',
        'Content-Disposition':`attachment; filename="${filename}"`,
        'Content-Length':String(Buffer.byteLength(source,'utf8')),
        'Cache-Control':'no-store, max-age=0',
        'X-Content-Type-Options':'nosniff'
      }
    });
  }catch{
    return new Response('MQL5 download currently unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
