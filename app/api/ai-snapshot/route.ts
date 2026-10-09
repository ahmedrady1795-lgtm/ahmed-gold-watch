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
  // Include the creation timestamp. Process-local generation counters can
  // repeat after a deployment, but two different snapshots must never share
  // an ETag and trick clients into suppressing a NEW AI result.
  const etag='"ai-snapshot-'+snap.generation+'-'+snap.at+'"';
  const headers={
    'Cache-Control':'private, no-store',
    'ETag':etag,
    'X-AI-Snapshot':'hit',
    'X-AI-Snapshot-Age-Ms':String(snap.ageMs??0),
    'X-AI-Snapshot-Generation':String(snap.generation),
    'X-AI-Snapshot-Created-At':String(snap.at)
  };
  if(request.headers.get('if-none-match')===etag){
    return new Response(null,{status:304,headers:{...headers,'X-AI-Snapshot':'unchanged'}});
  }
  return Response.json(
    {...snap.payload,snapshot:{ageMs:snap.ageMs,generation:snap.generation,servedAt:now}},
    {headers}
  );
}
