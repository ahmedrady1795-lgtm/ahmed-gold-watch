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
  // A previous generation is historical data, not a live market assessment.
  // Do not return 304 indefinitely: that would mask a stalled background loop.
  if(snap.ageMs!=null&&snap.ageMs>90000){
    return Response.json(
      {ok:false,warming:true,stale:true,ageMs:snap.ageMs,
        message:'آخر تحليل آلي متأخر؛ بانتظار دورة جديدة مؤكدة.'},
      {status:503,headers:{'Cache-Control':'no-store','Retry-After':'5',
        'X-AI-Snapshot':'expired','X-AI-Snapshot-Age-Ms':String(snap.ageMs)}}
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
