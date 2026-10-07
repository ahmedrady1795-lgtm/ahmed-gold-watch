import {promises as fs} from 'node:fs';
import path from 'node:path';

type Side='BUY'|'SELL'|'WAIT';
type Weights={
  learning:number;structure:number;accumulation:number;liquidity:number;motion:number;behavior:number;scalp:number;stateGraph:number;wave:number;
};
type Thresholds={
  minLearningConfidence:number;minLearningSamples:number;structurePathConfidence:number;strongMoveReadiness:number;modelConflictPenalty:number;
};
type FeatureRecipe={
  id:string;
  kind:'AGREEMENT'|'CONTRADICTION'|'BURST'|'REGIME'|'ABLATION';
  sources:string[];
  weight:number;
  enabled:boolean;
};
export type EvolutionPolicy={
  id:string;generation:number;createdAt:number;fitness:number;reason:string;regime:string;
  weights:Weights;thresholds:Thresholds;features:FeatureRecipe[];disabledComponents:string[];
};
type CandidateRow={id:string;fitness:number;createdAt:number;promoted:boolean;codePath:string;generation:number;regime:string;variant:string};
type EvolutionStore={
  version:number;asset:string;generation:number;active:EvolutionPolicy;champion:EvolutionPolicy;
  championByRegime:Record<string,EvolutionPolicy>;
  previous:EvolutionPolicy|null;lastPromotionAt:number;lastEvalAt:number;lastResolved:number;
  candidates:CandidateRow[];
  failureFocus:Record<string,number>;
  recentAutopsy:{at:number;issues:string[];focus:string[]}|null;
  history:{at:number;action:string;from?:string;to?:string;fitness?:number;reason:string}[];
};
export type EvolutionStatus={
  ok:boolean;asset:string;generation:number;active:EvolutionPolicy;champion:EvolutionPolicy;
  promoted:boolean;rolledBack:boolean;candidate:EvolutionPolicy|null;
  tournament:{generated:number;winner:string|null;winnerFitness:number|null;variants:string[]};
  permissions:{candidateCode:boolean;developmentSourceWrite:boolean;featureSynthesis:boolean;multiCandidate:boolean;ablation:boolean;failureAutopsy:boolean;regimeChampions:boolean;autoPromotion:boolean;autoRollback:boolean;walkForwardGuard:boolean;driftKillSwitch:boolean;productionSourceWrite:boolean;executionCodeWrite:boolean};
  performance:{directional:number;posterior:number;oosN:number;oosAccuracy:number|null;coverage:number|null;drift:string;promotionReady:boolean;killSwitch:boolean};
  samples:number;selfReliability:number;storage:string;codePath:string|null;developmentPath:string|null;reason:string;regime:string;
};
export type AutopsyResult={ok:boolean;asset:string;issues:string[];focus:string[];storedAt:string};

const ROOT=process.env.PREDATOR_EVOLUTION_DIR||'/data/evolution';
const FALLBACK='/tmp/evolution';
const cap=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const round=(n:number,d=2)=>Number(n.toFixed(d));

function performanceSnapshot(v:any){
  const g=v?.global||{};
  const hits=Number(g?.hits||0),fails=Number(g?.fails||0),directional=hits+fails;
  const posterior=Number.isFinite(Number(g?.posteriorAccuracy))?Number(g.posteriorAccuracy):50;
  const wf=v?.walkForward||{};
  const oosN=Number(wf?.oos?.n||0);
  const oosAccuracy=Number.isFinite(Number(wf?.oos?.accuracy))?Number(wf.oos.accuracy):null;
  const coverage=Number.isFinite(Number(wf?.oos?.coverage))?Number(wf.oos.coverage):null;
  const drift=String(wf?.drift?.status||'COLLECTING');
  const promotionReady=Boolean(
    directional>=30&&posterior>=52&&
    (oosN<10||(oosAccuracy!=null&&oosAccuracy>=50))&&
    drift!=='DEGRADING'
  );
  const killSwitch=Boolean(
    directional>=25&&(
      posterior<44||
      (oosN>=10&&oosAccuracy!=null&&oosAccuracy<44)||
      (drift==='DEGRADING'&&oosN>=15&&oosAccuracy!=null&&oosAccuracy<48)
    )
  );
  return {directional,posterior,oosN,oosAccuracy,coverage,drift,promotionReady,killSwitch};
}


function regimeOf(stateGraph:any){
  const s=String(stateGraph?.current||'TRANSITION');
  if(/BREAKOUT|IMPULSE/.test(s))return 'EXPANSION';
  if(/ACCUMULATION|DISTRIBUTION|COMPRESSION/.test(s))return 'COMPRESSION';
  if(/EXHAUSTION|PULLBACK/.test(s))return 'REVERSAL';
  if(/RANGE/.test(s))return 'RANGE';
  return 'TRANSITION';
}
function basePolicy(asset:string,regime='TRANSITION'):EvolutionPolicy{
  return {
    id:'genesis-'+asset.toLowerCase(),generation:0,createdAt:Date.now(),fitness:50,reason:'baseline',regime,
    weights:{learning:1,structure:1,accumulation:1,liquidity:1,motion:1,behavior:1,scalp:1,stateGraph:1,wave:1},
    thresholds:{minLearningConfidence:48,minLearningSamples:10,structurePathConfidence:48,strongMoveReadiness:60,modelConflictPenalty:8},
    features:[],disabledComponents:[]
  };
}
function normalizePolicy(p:any,asset:string,regime:string):EvolutionPolicy{
  const b=basePolicy(asset,regime);
  return {
    ...b,...p,regime:p?.regime||regime,
    weights:{...b.weights,...(p?.weights||{})},
    thresholds:{...b.thresholds,...(p?.thresholds||{})},
    features:Array.isArray(p?.features)?p.features:[],
    disabledComponents:Array.isArray(p?.disabledComponents)?p.disabledComponents:[]
  };
}
function safeName(s:string){return s.replace(/[^a-zA-Z0-9_-]/g,'_');}
async function ensureDir(root:string){
  await fs.mkdir(root,{recursive:true});
  await fs.mkdir(path.join(root,'candidates'),{recursive:true});
  await fs.mkdir(path.join(root,'champions'),{recursive:true});
  await fs.mkdir(path.join(root,'autopsy'),{recursive:true});
  await fs.mkdir(path.join(root,'development'),{recursive:true});
}
async function resolveRoot(){try{await ensureDir(ROOT);return ROOT;}catch{await ensureDir(FALLBACK);return FALLBACK;}}
async function load(asset:string,stateGraph:any){
  const root=await resolveRoot(),file=path.join(root,'evolution-'+asset.toLowerCase()+'.json'),regime=regimeOf(stateGraph);
  try{
    const j=JSON.parse(await fs.readFile(file,'utf8'));
    if(j?.version>=1&&j?.active&&j?.champion){
      const active=normalizePolicy(j.active,asset,regime),champion=normalizePolicy(j.champion,asset,regime);
      const champions:Record<string,EvolutionPolicy>={};
      for(const [k,v] of Object.entries(j.championByRegime||{}))champions[k]=normalizePolicy(v,asset,k);
      const store:EvolutionStore={version:2,asset,generation:Number(j.generation||0),active,champion,championByRegime:champions,previous:j.previous?normalizePolicy(j.previous,asset,regime):null,lastPromotionAt:Number(j.lastPromotionAt||0),lastEvalAt:Number(j.lastEvalAt||0),lastResolved:Number(j.lastResolved||0),candidates:Array.isArray(j.candidates)?j.candidates:[],failureFocus:j.failureFocus||{},recentAutopsy:j.recentAutopsy||null,history:Array.isArray(j.history)?j.history:[]};
      return {root,file,store,regime};
    }
  }catch{}
  const p=basePolicy(asset,regime);
  const store:EvolutionStore={version:2,asset,generation:0,active:p,champion:p,championByRegime:{[regime]:p},previous:null,lastPromotionAt:0,lastEvalAt:0,lastResolved:0,candidates:[],failureFocus:{},recentAutopsy:null,history:[]};
  await fs.writeFile(file,JSON.stringify(store,null,2));
  return {root,file,store,regime};
}
const saveQueues=new Map<string,Promise<void>>();
async function save(file:string,store:EvolutionStore){
  const snapshot=JSON.stringify(store,null,2);
  const prev=saveQueues.get(file)||Promise.resolve();
  const next=prev.catch(()=>{}).then(async()=>{
    const tmp=file+'.'+process.pid+'.'+Date.now()+'.'+Math.random().toString(36).slice(2)+'.tmp';
    await fs.writeFile(tmp,snapshot);
    await fs.rename(tmp,file);
  });
  saveQueues.set(file,next);
  try{await next;}finally{if(saveQueues.get(file)===next)saveQueues.delete(file);}
}

function reliability(learning:any,name:string){
  const r=learning?.componentReliability?.[name];if(!r)return 50;
  const n1=Number(r.samples1||0),n5=Number(r.samples5||0);if(n1+n5<6)return 50;
  return Number(r.h1||50)*.4+Number(r.h5||50)*.6;
}
function componentSamples(learning:any,name:string){
  const r=learning?.componentReliability?.[name];return Number(r?.samples1||0)+Number(r?.samples5||0);
}
function synthesizeFeatures(asset:string,learning:any,stateGraph:any,focus:Record<string,number>):FeatureRecipe[]{
  const out:FeatureRecipe[]=[];
  const rel=(n:string)=>reliability(learning,n);
  const pairs=[['liquidity','motion'],['structure','accumulation'],['stateGraph','behavior'],['scalp','m1']];
  for(const [a,b] of pairs){
    const score=(rel(a)+rel(b))/2;
    if(score>=55)out.push({id:'agree-'+a+'-'+b,kind:'AGREEMENT',sources:[a,b],weight:round(cap(1+(score-55)/100,.95,1.18)),enabled:true});
  }
  if(learning?.strongMoveMemory?.side&&learning.strongMoveMemory.side!=='WAIT'){
    out.push({id:'burst-memory',kind:'BURST',sources:['learning','accumulation','stateGraph'],weight:1.12,enabled:true});
  }
  if(Number(stateGraph?.sequenceMatches||0)>=8){
    out.push({id:'regime-sequence',kind:'REGIME',sources:['stateGraph','structure'],weight:round(cap(1+Number(stateGraph?.nextSideProbability||50)/500,1,1.18)),enabled:true});
  }
  const focusEntries=Object.entries(focus).sort((a,b)=>b[1]-a[1]).slice(0,2);
  for(const [name,count] of focusEntries){
    if(count>=3)out.push({id:'autopsy-'+name,kind:'CONTRADICTION',sources:[name],weight:.88,enabled:true});
  }
  if(asset!=='BTC')out.push({id:'no-central-book',kind:'ABLATION',sources:['liquidity'],weight:0,enabled:false});
  return out.slice(0,8);
}
function disabledFromReliability(asset:string,learning:any){
  const names=['structure','accumulation','liquidity','motion','behavior','scalp','stateGraph'];
  const out:string[]=[];
  for(const n of names){
    if(asset!=='BTC'&&n==='liquidity')continue;
    if(componentSamples(learning,n)>=24&&reliability(learning,n)<=40)out.push(n);
  }
  return out.slice(0,2);
}
function featureMultiplier(features:FeatureRecipe[],name:string){
  let m=1;
  for(const f of features){
    if(!f.enabled||!f.sources.includes(name))continue;
    m*=f.weight;
  }
  return cap(m,.72,1.28);
}
function mutate(asset:string,active:EvolutionPolicy,learning:any,stateGraph:any,focus:Record<string,number>,now:number,jump=1,variant='balanced'):EvolutionPolicy{
  const rel=(name:string)=>reliability(learning,name),jumpPower=Math.max(1,Math.min(3,jump)),features=synthesizeFeatures(asset,learning,stateGraph,focus),disabled=disabledFromReliability(asset,learning);
  const adjust=(name:keyof Weights,current:number)=>{
    const r=rel(name==='stateGraph'?'stateGraph':name),sampleScale=Math.min(1,componentSamples(learning,name)/45),target=1+(r-50)/100*.5*sampleScale;
    let blend=Math.min(.55,.30+.10*(jumpPower-1));
    if(variant==='explorer')blend=Math.min(.62,blend+.08);
    if(variant==='conservative')blend=Math.max(.22,blend-.08);
    let v=current*(1-blend)+target*blend;
    v*=featureMultiplier(features,name);
    if(disabled.includes(name))v=.52;
    if(variant==='state-heavy'&&name==='stateGraph')v*=1.08;
    if(variant==='micro-heavy'&&['liquidity','motion','wave'].includes(name))v*=1.07;
    return round(cap(v,.50,1.34));
  };
  const self=Number(learning?.selfCalibration?.reliability||50),matches=Number(stateGraph?.sequenceMatches||0),sgProb=Number(stateGraph?.nextSideProbability||0);
  const w:Weights={
    learning:round(cap((active.weights.learning*.70+(1+(self-50)/100*.35)*.30)*featureMultiplier(features,'learning'),.72,1.30)),
    structure:adjust('structure',active.weights.structure),
    accumulation:adjust('accumulation',active.weights.accumulation),
    liquidity:asset==='BTC'?adjust('liquidity',active.weights.liquidity):.5,
    motion:adjust('motion',active.weights.motion),
    behavior:adjust('behavior',active.weights.behavior),
    scalp:adjust('scalp',active.weights.scalp),
    stateGraph:round(cap((active.weights.stateGraph*.70+(matches>=8?(1+(sgProb-50)/100*.30):1)*.30)*featureMultiplier(features,'stateGraph'),.58,1.32)),
    wave:adjust('wave',active.weights.wave)
  };
  if(variant==='ablation'&&disabled.length===0){
    const ranked=['structure','accumulation','liquidity','motion','behavior','scalp','stateGraph'].filter(n=>asset==='BTC'||n!=='liquidity').sort((a,b)=>reliability(learning,a)-reliability(learning,b));
    const weakest=ranked[0] as keyof Weights|undefined;if(weakest)w[weakest]=.55;
  }
  const conflictBoost=Number(focus.modelConflict||0)+Number(focus.pathConflict||0);
  const t:Thresholds={
    minLearningConfidence:Math.round(cap(active.thresholds.minLearningConfidence+(self<45?2:self>58?-1:0)+(variant==='conservative'?2:0),44,60)),
    minLearningSamples:Math.round(cap(active.thresholds.minLearningSamples+(self<45?2:self>60?-1:0)+(variant==='explorer'?-1:0),8,28)),
    structurePathConfidence:Math.round(cap(active.thresholds.structurePathConfidence+(rel('structure')<47?2:rel('structure')>58?-1:0)+Math.min(4,conflictBoost),44,66)),
    strongMoveReadiness:Math.round(cap(active.thresholds.strongMoveReadiness+(self<45?3:self>60?-1:0)+(Number(focus.strongMoveFalse||0)>=3?4:0),56,76)),
    modelConflictPenalty:Math.round(cap(8+(65-self)*.16+(matches<5?2:0)+Math.min(5,conflictBoost),6,16))
  };
  const generation=active.generation+jumpPower,regime=regimeOf(stateGraph);
  return {id:'g'+generation+'-'+asset.toLowerCase()+'-'+variant+'-'+now,generation,createdAt:now,fitness:0,reason:'self-generated '+variant+' candidate',regime,weights:w,thresholds:t,features,disabledComponents:disabled};
}
function fitness(policy:EvolutionPolicy,learning:any,stateGraph:any){
  const self=Number(learning?.selfCalibration?.reliability||50),samples=Number(learning?.selfCalibration?.samples1||0)+Number(learning?.selfCalibration?.samples5||0);
  const compNames=['structure','accumulation','liquidity','motion','behavior','scalp','stateGraph'];
  let relScore=0,relWeight=0;
  for(const n of compNames){
    if(n==='liquidity'&&learning?.asset!=='BTC')continue;
    const r=reliability(learning,n),w=Number((policy.weights as any)[n]||1);relScore+=r*w;relWeight+=w;
  }
  const component=relWeight?relScore/relWeight:50,sgSamples=Number(stateGraph?.sequenceMatches||0),sgProb=Number(stateGraph?.nextSideProbability||0);
  const graph=sgSamples>=5?cap(50+(sgProb-50)*Math.min(1,sgSamples/20),35,72):48;
  const drift=Object.values(policy.weights).reduce((s,v)=>s+Math.abs(Number(v)-1),0),thresholdDrift=Math.abs(policy.thresholds.minLearningConfidence-48)/10+Math.abs(policy.thresholds.structurePathConfidence-48)/12+Math.abs(policy.thresholds.strongMoveReadiness-60)/12;
  const sampleConfidence=Math.min(1,samples/60),featureBonus=Math.min(3,policy.features.filter(f=>f.enabled).length*.35),ablationPenalty=policy.disabledComponents.length*.45;
  return round((self*.42+component*.36+graph*.22)*(.72+.28*sampleConfidence)-drift*1.45-thresholdDrift*.75+featureBonus-ablationPenalty);
}
function codeFor(asset:string,p:EvolutionPolicy){
  return `// Auto-generated by Predator Self-Evolution Lab.
// Asset: ${asset}
// Regime: ${p.regime}
// Generation: ${p.generation}
// Fitness: ${p.fitness}
// Development-only candidate generated by the self-evolution lab.
// Never imported into production automatically.
// No order execution, secrets, or production source mutation.
export const policy = ${JSON.stringify({id:p.id,generation:p.generation,regime:p.regime,weights:p.weights,thresholds:p.thresholds,features:p.features,disabledComponents:p.disabledComponents},null,2)} as const;
export default policy;
`;
}
async function writeCandidate(root:string,asset:string,p:EvolutionPolicy,champion=false){
  const name=champion?'champion-'+asset.toLowerCase()+'-'+p.regime.toLowerCase()+'.ts':'candidate-'+safeName(p.id)+'.ts';
  const file=path.join(root,champion?'champions':'candidates',name);await fs.writeFile(file,codeFor(asset,p));return file;
}

async function writeDevelopmentExperiment(root:string,asset:string,p:EvolutionPolicy,performance:any,reason:string){
  const devDir=path.join(root,'development');
  const name='experiment-'+safeName(p.id)+'.ts';
  const file=path.join(devDir,name);
  const body=`// AUTOGENERATED DEVELOPMENT EXPERIMENT — NOT PRODUCTION CODE.
// Asset: ${asset}
// Created: ${new Date(p.createdAt).toISOString()}
// Reason: ${reason}
// Real-market guard: ${JSON.stringify(performance)}
// This file can be evaluated in shadow/tournament mode only.
${codeFor(asset,p)}
`;
  await fs.writeFile(file,body);
  await fs.writeFile(path.join(devDir,asset.toLowerCase()+'-latest.json'),JSON.stringify({
    asset,updatedAt:Date.now(),candidate:p,performance,reason,experimentPath:file
  },null,2));
  return file;
}


export async function evolveAnalysisPolicy(args:{asset:string;learning:any;stateGraph:any;performance?:any;now?:number}):Promise<EvolutionStatus>{
  const now=args.now||Date.now(),{root,file,store,regime}=await load(args.asset,args.stateGraph);
  const performance=performanceSnapshot(args.performance);
  const resolved=Number(args.learning?.totals?.resolved1||0)+Number(args.learning?.totals?.resolved5||0),self=Number(args.learning?.selfCalibration?.reliability||50),samples=Number(args.learning?.selfCalibration?.samples1||0)+Number(args.learning?.selfCalibration?.samples5||0);
  const previousEvalAt=Number(store.lastEvalAt||0),regimeChampion=store.championByRegime[regime]||store.champion;
  const activeFitness=fitness(store.active,args.learning,args.stateGraph);store.active.fitness=activeFitness;store.lastEvalAt=now;
  regimeChampion.fitness=fitness(regimeChampion,args.learning,args.stateGraph);store.champion.fitness=fitness(store.champion,args.learning,args.stateGraph);

  let rolledBack=false,promoted=false,candidate:EvolutionPolicy|null=null,reason='monitoring',developmentPath:string|null=null;
  const rollbackReady=Boolean(store.previous&&samples>=18&&((self<40)||(activeFitness+5<regimeChampion.fitness)||performance.killSwitch));
  if(rollbackReady){
    const from=store.active.id;store.active=regimeChampion;rolledBack=true;reason='automatic rollback to regime champion';
    store.history.push({at:now,action:'ROLLBACK',from,to:store.active.id,fitness:activeFitness,reason});
  }

  const newOutcomes=Math.max(0,resolved-store.lastResolved),cooldown=now-store.lastPromotionAt>=30*60*1000,sgMatches=Number(args.stateGraph?.sequenceMatches||0);
  const jump=samples>=55&&self>=64&&sgMatches>=12?3:samples>=32&&self>=58&&sgMatches>=8?2:1,requiredNewOutcomes=jump===3?14:jump===2?10:8;
  const canEvolve=samples>=20&&(newOutcomes>=requiredNewOutcomes||!previousEvalAt||now-previousEvalAt>=30*60*1000);
  const variants=['balanced','state-heavy','micro-heavy','conservative','ablation'];
  let winner:EvolutionPolicy|null=null;
  if(!rolledBack&&canEvolve){
    const generated:EvolutionPolicy[]=[];
    for(const variant of variants){
      const p=mutate(args.asset,store.active,args.learning,args.stateGraph,store.failureFocus,now,jump,variant);p.fitness=fitness(p,args.learning,args.stateGraph);
      const codePath=await writeCandidate(root,args.asset,p,false);
      store.candidates.push({id:p.id,fitness:p.fitness,createdAt:now,promoted:false,codePath,generation:p.generation,regime:p.regime,variant});generated.push(p);
    }
    generated.sort((a,b)=>b.fitness-a.fitness);winner=generated[0]||null;candidate=winner;
    const minGain=(samples<40?3.5:2.0)+(jump-1)*1.25,minSelf=jump===3?64:jump===2?58:43;
    developmentPath=winner?await writeDevelopmentExperiment(root,args.asset,winner,performance,'shadow tournament candidate'):null;
    if(winner&&cooldown&&winner.fitness>=store.active.fitness+minGain&&self>=minSelf&&performance.promotionReady&&!performance.killSwitch){
      const from=store.active.id;store.previous=store.active;store.active=winner;store.generation=winner.generation;store.lastPromotionAt=now;promoted=true;
      reason=jump>1?('tournament winner jump x'+jump+' promoted after live Walk-Forward gate'):'tournament winner promoted after live Walk-Forward gate';
      const row=store.candidates.find(x=>x.id===winner!.id);if(row)row.promoted=true;
      const oldRegime=store.championByRegime[regime];
      if(!oldRegime||winner.fitness>=fitness(oldRegime,args.learning,args.stateGraph)){store.championByRegime[regime]=winner;await writeCandidate(root,args.asset,winner,true);}
      if(winner.fitness>=store.champion.fitness)store.champion=winner;
      store.history.push({at:now,action:'PROMOTE',from,to:winner.id,fitness:winner.fitness,reason});
    }else{
      reason=performance.killSwitch?'performance kill-switch: candidates remain shadow':!performance.promotionReady?'live Walk-Forward gate not passed; candidates remain shadow':'5-candidate tournament stayed in shadow';
      if(winner)store.history.push({at:now,action:'SHADOW',to:winner.id,fitness:winner.fitness,reason});
    }
    store.lastResolved=resolved;
  }

  store.candidates=store.candidates.slice(-60);store.history=store.history.slice(-160);await save(file,store);
  return {
    ok:true,asset:args.asset,generation:store.generation,active:store.active,champion:store.champion,promoted,rolledBack,candidate,samples,selfReliability:self,storage:file,
    codePath:candidate?path.join(root,'candidates','candidate-'+safeName(candidate.id)+'.ts'):null,developmentPath,reason,regime,performance,
    tournament:{generated:canEvolve?variants.length:0,winner:winner?.id||null,winnerFitness:winner?.fitness??null,variants:canEvolve?variants:[]},
    permissions:{candidateCode:true,developmentSourceWrite:true,featureSynthesis:true,multiCandidate:true,ablation:true,failureAutopsy:true,regimeChampions:true,autoPromotion:true,autoRollback:true,walkForwardGuard:true,driftKillSwitch:true,productionSourceWrite:false,executionCodeWrite:false}
  };
}

export async function recordEvolutionAutopsy(args:{asset:string;hunt:any;learning:any;stateGraph:any;master:any;now?:number}):Promise<AutopsyResult>{
  const now=args.now||Date.now(),{root,file,store}=await load(args.asset,args.stateGraph),issues:string[]=[],focus:string[]=[];
  if(store.recentAutopsy&&Math.floor(Number(store.recentAutopsy.at||0)/60000)===Math.floor(now/60000)){
    return {ok:true,asset:args.asset,issues:store.recentAutopsy.issues||[],focus:store.recentAutopsy.focus||[],storedAt:path.join(root,'autopsy',args.asset.toLowerCase()+'.jsonl')};
  }
  const side=args.hunt?.side as Side,pathSide=args.hunt?.path?.shortSide as Side,learned=args.learning?.side as Side,graph=args.stateGraph?.nextSide as Side,strong=args.hunt?.strongMove?.side as Side;
  if(side&&pathSide&&side!=='WAIT'&&pathSide!=='WAIT'&&side!==pathSide){issues.push('hunt/path contradiction');focus.push('pathConflict');}
  if(side&&learned&&side!=='WAIT'&&learned!=='WAIT'&&side!==learned){issues.push('hunt/learning contradiction');focus.push('modelConflict');}
  if(side&&graph&&side!=='WAIT'&&graph!=='WAIT'&&side!==graph){issues.push('hunt/stateGraph contradiction');focus.push('stateGraph');}
  if(strong&&learned&&strong!=='WAIT'&&learned!=='WAIT'&&strong!==learned){issues.push('strong-move disagrees with learned memory');focus.push('strongMoveFalse');}
  if(args.master?.state==='CONFLICT'){issues.push('master conflict');focus.push('modelConflict');}
  const quality=Number(args.hunt?.quality||0);if(quality<25&&side!=='WAIT'){issues.push('direction emitted with low quality');focus.push('confidenceCalibration');}
  for(const k of focus)store.failureFocus[k]=Number(store.failureFocus[k]||0)+1;
  if(issues.length===0){
    for(const k of Object.keys(store.failureFocus))store.failureFocus[k]=Math.max(0,Number(store.failureFocus[k]||0)-.15);
  }
  store.recentAutopsy={at:now,issues,focus};store.history.push({at:now,action:'AUTOPSY',reason:issues.length?issues.join(' | '):'clean cycle'});store.history=store.history.slice(-160);
  await save(file,store);
  const outFile=path.join(root,'autopsy',args.asset.toLowerCase()+'.jsonl');
  await fs.appendFile(outFile,JSON.stringify({at:now,asset:args.asset,issues,focus,side,pathSide,learned,graph,strong,quality})+'\n').catch(()=>{});
  return {ok:true,asset:args.asset,issues,focus,storedAt:outFile};
}
