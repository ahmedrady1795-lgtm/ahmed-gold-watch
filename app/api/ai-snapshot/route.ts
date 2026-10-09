import {getAiSnapshot} from '../../../lib/ai-snapshot-cache';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function GET(request:Request){
  const now=Date.now();
  const snap=getAiSnapshot(now);
  if(!snap.payload){
    return Response.json(
      {ok:false,warming:true,message:'AI snapshot is warming up.'},
      {status:503,headers:{'Cache-Control':'no-store','X-AI-Snapshot':'warming'}}
    );
  }
  // The snapshot may be multi-megabyte. When unchanged, ship NO JSON.
  // Clients that already hold this generation still update the age locally.
  const etag='"ai-snapshot-'+snap.generation+'"';
  const headers={
    'Cache-Control':'private, no-store',
    'ETag':etag,
    'X-AI-Snapshot':'hit',
    'X-AI-Snapshot-Age-Ms':String(snap.ageMs??0),
    'X-AI-Snapshot-Generation':String(snap.generation)
  };
  if(request.headers.get('if-none-match')===etag){
    return new Response(null,{status:304,headers:{...headers,'X-AI-Snapshot':'unchanged'}});
  }
  return Response.json(
    {...snap.payload,snapshot:{ageMs:snap.ageMs,generation:snap.generation,servedAt:now}},
    {headers}
  );
}
