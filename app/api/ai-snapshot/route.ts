import {getAiSnapshot} from '../../../lib/ai-snapshot-cache';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function GET(){
  const now=Date.now();
  const snap=getAiSnapshot(now);
  if(!snap.payload){
    return Response.json(
      {ok:false,warming:true,message:'AI snapshot is warming up.'},
      {status:503,headers:{'Cache-Control':'no-store','X-AI-Snapshot':'warming'}}
    );
  }
  return Response.json(
    {...snap.payload,snapshot:{ageMs:snap.ageMs,generation:snap.generation,servedAt:now}},
    {headers:{
      'Cache-Control':'no-store',
      'X-AI-Snapshot':'hit',
      'X-AI-Snapshot-Age-Ms':String(snap.ageMs??0),
      'X-AI-Snapshot-Generation':String(snap.generation)
    }}
  );
}
