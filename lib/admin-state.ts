import {getRuntimeEnv} from './runtime';
let memoryOverride:boolean|null=null;
let memoryUpdatedAt=Date.now();
export async function getKillSwitch(){
  const env=getRuntimeEnv();
  const base=String(env.KILL_SWITCH_ENABLED??'true').toLowerCase()!=='false';
  const enabled=memoryOverride??base;
  return {enabled,updatedAt:memoryUpdatedAt,updatedBy:memoryOverride==null?'environment':'runtime',mode:'vercel-memory' as const};
}
export async function setKillSwitch(enabled:boolean,actor:string){memoryOverride=enabled;memoryUpdatedAt=Date.now();return {enabled,updatedAt:memoryUpdatedAt,updatedBy:actor.slice(0,180),mode:'vercel-memory' as const};}
