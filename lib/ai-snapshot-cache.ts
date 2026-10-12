type SnapshotState={
  payload:any|null;
  at:number;
  generation:number;
};

declare global {
  // eslint-disable-next-line no-var
  var __ahmedAiSnapshot: SnapshotState | undefined;
}

function state():SnapshotState{
  if(!globalThis.__ahmedAiSnapshot){
    globalThis.__ahmedAiSnapshot={payload:null,at:0,generation:0};
  }
  return globalThis.__ahmedAiSnapshot;
}

export function setAiSnapshot(payload:any,at=Date.now()){
  const s=state();
  s.payload=payload;
  s.at=at;
  s.generation+=1;
  return {at:s.at,generation:s.generation};
}

export function getAiSnapshot(now=Date.now()){
  const s=state();
  return {
    payload:s.payload,
    at:s.at,
    ageMs:s.at?Math.max(0,now-s.at):null,
    generation:s.generation
  };
}
