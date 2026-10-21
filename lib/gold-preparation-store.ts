import fs from 'node:fs/promises';
import {emptyGoldLeadLedger,safeGoldLeadLedger,goldLeadScore} from './gold-preparation-lead';
const paths=['/data/qannas-gold-preparation-v1.json','/tmp/qannas-gold-preparation-v1.json'];
export async function readGoldPreparationStore(now:number){
 let ledger=emptyGoldLeadLedger();
 for(const path of paths)try{
  const text=await fs.readFile(path,'utf8');
  if(text.length<6e6){ledger=safeGoldLeadLedger(JSON.parse(text),now);break;}
 }catch{}
 let observation:any=null;
 try{
  const text=await fs.readFile('/tmp/gold-preparation-observation.json','utf8');
  if(text.length<5000)observation=JSON.parse(text);
 }catch{}
 const fresh=observation?.checkedAt<=now+2000&&now-observation.checkedAt<45000;
 return {ledger,view:{...goldLeadScore(ledger),
  status:fresh?'OBSERVING':'STALE_OR_STARTING',
  observation:fresh?observation:{ready:false,reason:'انتظار تغذية التحضير الحديثة'}}};
}
