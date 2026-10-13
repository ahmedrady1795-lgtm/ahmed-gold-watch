import {sourceTimestamp} from './client-market-freshness';

// Protect the gold screen from out-of-order REST replies racing a fresh
// websocket tick. This is a PRESENTATION guard only; it cannot make a
// delayed quote or candle valid for trading or target qualification.
type Quote={ok?:boolean;price?:unknown;sourceTime?:unknown;receivedAt?:unknown;mode?:unknown};
export function shouldApplyGoldQuote(
  incoming:Quote|null|undefined,
  current:Quote|null|undefined,
  now:number,
  lastStreamAt=0
):boolean{
  const incomingAt=sourceTimestamp(incoming?.sourceTime);
  const price=Number(incoming?.price);
  if(incoming?.ok!==true||!Number.isFinite(price)||price<=0||
    incomingAt==null||incomingAt>now+2000||incomingAt<now-20*60000)return false;
  const mode=String(incoming?.mode||'');
  if(mode!=='stream'&&current?.mode==='stream'&&lastStreamAt>0&&
    now-lastStreamAt>=0&&now-lastStreamAt<8000)return false;
  const oldAt=sourceTimestamp(current?.sourceTime);
  if(oldAt!=null){
    if(incomingAt<oldAt)return false;
    if(incomingAt===oldAt){
      if(current?.mode==='stream'&&mode!=='stream')return false;
      if(current?.mode==='broker'&&mode==='external')return false;
      if(Number(current?.price)===price&&
        now-Number(current?.receivedAt||0)>=0&&
        now-Number(current?.receivedAt||0)<2500)return false;
    }
  }
  return true;
}
