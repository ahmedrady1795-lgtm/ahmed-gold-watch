/** Public XAU perpetual execution streams. No private credentials, no orders.
 * Socket state is process-local, bounded, and stopped when no reader is active. */
export type GoldStreamVenue='bybit'|'okx';
export type GoldStreamPrint={id:string;at:number;price:number;qty:number;buy:boolean};
export function parseGoldStream(venue:GoldStreamVenue,msg:any,now:number):GoldStreamPrint[]{
 const by=venue==='bybit';
 if(by?msg?.topic!=='publicTrade.XAUUSDT':
   msg?.arg?.channel!=='trades'||msg?.arg?.instId!=='XAU-USDT-SWAP')return [];
 const out:GoldStreamPrint[]=[];
 for(const x of Array.isArray(msg.data)?msg.data:[]){
   if(by?(x.s!=='XAUUSDT'||x.BT===true||x.RPI===true||(x.S!=='Buy'&&x.S!=='Sell')):
     (x.instId!=='XAU-USDT-SWAP'||(x.side!=='buy'&&x.side!=='sell')))continue;
   const id=by?x.i:x.tradeId,at=Number(by?x.T:x.ts),price=Number(by?x.p:x.px),qty=Number(by?x.v:x.sz);
   if(typeof id!=='string'||!id||!Number.isSafeInteger(at)||at<=0||at>now||now-at>30000||
      !Number.isFinite(price)||price<=0||!Number.isFinite(qty)||qty<=0)continue;
   out.push({id,at,price,qty,buy:by?x.S==='Buy':x.side==='buy'});
 }
 return out;
}
export function retainGoldStream(rows:Map<string,GoldStreamPrint>,incoming:readonly GoldStreamPrint[],now:number){
 for(const [id,p] of rows)if(p.at>now||now-p.at>60000)rows.delete(id);
 for(const p of incoming)if(p.at<=now&&now-p.at<=60000&&!rows.has(p.id))rows.set(p.id,p);
 while(rows.size>5000)rows.delete(rows.keys().next().value!);
}
type Slot={ws:WebSocket|null;rows:Map<string,GoldStreamPrint>;lastUse:number;lastMessage:number;retryAt:number;failures:number;timer:ReturnType<typeof setInterval>|null;status:string;openedAt:number};
const make=():Slot=>({ws:null,rows:new Map(),lastUse:0,lastMessage:0,retryAt:0,failures:0,timer:null,status:'IDLE',openedAt:0});
const slots={bybit:make(),okx:make()};
function stop(s:Slot,reason:string,retry:boolean){
 const ws=s.ws;s.ws=null;if(s.timer)clearInterval(s.timer);s.timer=null;
 s.rows.clear();s.status=reason;
 if(retry){s.failures=Math.min(s.failures+1,5);s.retryAt=Date.now()+Math.min(60000,2000*2**s.failures);}
 try{ws?.close();}catch{}
}
function start(venue:GoldStreamVenue,s:Slot,now:number){
 if(s.ws||now<s.retryAt||typeof WebSocket==='undefined')return;
 const by=venue==='bybit';
 let ws:WebSocket;
 try{ws=new WebSocket(by?'wss://stream.bybit.com/v5/public/linear':'wss://ws.okx.com:8443/ws/v5/public');}
 catch{stop(s,'CONNECT_FAILED',true);return;}
 s.ws=ws;s.status='CONNECTING';s.openedAt=now;s.lastMessage=now;
 ws.addEventListener('open',()=>{
   if(s.ws!==ws)return;
   s.status='SUBSCRIBING';s.lastMessage=Date.now();
   try{ws.send(JSON.stringify(by?{op:'subscribe',args:['publicTrade.XAUUSDT']}:
     {op:'subscribe',args:[{channel:'trades',instId:'XAU-USDT-SWAP'}]}));}catch{stop(s,'SUBSCRIBE_FAILED',true);}
 });
 ws.addEventListener('message',event=>{
   if(s.ws!==ws||typeof event.data!=='string'||event.data.length>1000000)return;
   const at=Date.now();s.lastMessage=at;if(event.data==='pong')return;
   try{
     const msg=JSON.parse(event.data);
     if(msg.event==='error'||msg.success===false){stop(s,'SUBSCRIBE_REJECTED',true);return;}
     const rows=parseGoldStream(venue,msg,at);
     if(rows.length){retainGoldStream(s.rows,rows,at);s.status='LIVE';s.failures=0;}
   }catch{}
 });
 ws.addEventListener('error',()=>{if(s.ws===ws)stop(s,'SOCKET_ERROR',true);});
 ws.addEventListener('close',()=>{if(s.ws===ws)stop(s,'CLOSED',true);});
 s.timer=setInterval(()=>{
   if(s.ws!==ws)return;
   const at=Date.now();
   if(at-s.lastUse>120000){stop(s,'IDLE',false);return;}
   if(ws.readyState!==1&&at-s.openedAt>15000||at-s.lastMessage>40000){stop(s,'TIMEOUT',true);return;}
   if(ws.readyState===1)try{ws.send(by?JSON.stringify({op:'ping'}):'ping');}catch{stop(s,'PING_FAILED',true);}
 },15000);
}
export function goldStreamSnapshot(venue:GoldStreamVenue,now=Date.now()){
 const s=slots[venue];s.lastUse=now;start(venue,s,now);retainGoldStream(s.rows,[],now);
 const rows=[...s.rows.values()].sort((a,b)=>a.at-b.at);
 const last=rows.at(-1)?.at??0;
 return {status:s.status,rows,tradeAt:last,ageMs:last?now-last:null,usable:s.ws?.readyState===1&&last>0&&now-last<=10000};
}
