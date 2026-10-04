export type WaveTick={at:number;price:number;bid?:number;ask?:number;bidQty?:number;askQty?:number};
export type WaveLead={
  ok:boolean;side:'BUY'|'SELL'|'WAIT';stage:'WARMING'|'COILED'|'WAVE_FORMING'|'IGNITION';
  score:number;buy:number;sell:number;confidence:number;
  velocity1s:number;velocity3s:number;velocity8s:number;acceleration:number;
  persistence:number;burstRate:number;imbalance:number;spreadBps:number|null;spreadCompression:number;
  samples:number;at:number;reasons:string[];
};

const cap=(n:number,min=0,max=92)=>Math.max(min,Math.min(max,n));
const bps=(a:number,b:number)=>b>0?(a-b)/b*10000:0;
const nearestBefore=(xs:WaveTick[],at:number)=>{for(let i=xs.length-1;i>=0;i--)if(xs[i].at<=at)return xs[i];return xs[0];};

export function computeWaveLead(input:WaveTick[],now=Date.now()):WaveLead{
  const xs=input.filter(x=>now-x.at<=12000&&Number.isFinite(x.price)&&x.price>0).sort((a,b)=>a.at-b.at);
  const empty:WaveLead={ok:false,side:'WAIT',stage:'WARMING',score:0,buy:0,sell:0,confidence:0,velocity1s:0,velocity3s:0,velocity8s:0,acceleration:0,persistence:0,burstRate:0,imbalance:0,spreadBps:null,spreadCompression:0,samples:xs.length,at:now,reasons:[]};
  if(xs.length<5)return empty;
  const last=xs.at(-1)!,p1=nearestBefore(xs,now-1000),p3=nearestBefore(xs,now-3000),p8=nearestBefore(xs,now-8000);
  const v1=bps(last.price,p1?.price||last.price),v3=bps(last.price,p3?.price||last.price),v8=bps(last.price,p8?.price||last.price);
  const acceleration=v1-v3/3;

  const short=xs.filter(x=>now-x.at<=1800);
  let up=0,down=0;
  for(let i=1;i<short.length;i++){const d=short[i].price-short[i-1].price;if(d>0)up++;else if(d<0)down++;}
  const moves=up+down,persistence=moves?Math.round(Math.max(up,down)/moves*100):0;
  const tickSide=up>down?'BUY':down>up?'SELL':'WAIT';

  const n1=xs.filter(x=>now-x.at<=1000).length;
  const prev=xs.filter(x=>now-x.at>1000&&now-x.at<=5000).length;
  const baseline=Math.max(1,prev/4),burstRate=Number((n1/baseline).toFixed(2));

  const bid=Number(last.bid),ask=Number(last.ask),bq=Number(last.bidQty),aq=Number(last.askQty);
  const qtyTotal=(Number.isFinite(bq)?bq:0)+(Number.isFinite(aq)?aq:0);
  const imbalance=qtyTotal>0?((bq-aq)/qtyTotal)*100:0;
  const spreadBps=Number.isFinite(bid)&&Number.isFinite(ask)&&bid>0&&ask>=bid?bps(ask,bid):null;
  const spreads=xs.map(x=>Number.isFinite(Number(x.bid))&&Number.isFinite(Number(x.ask))&&Number(x.bid)>0&&Number(x.ask)>=Number(x.bid)?bps(Number(x.ask),Number(x.bid)):NaN).filter(Number.isFinite);
  const avgSpread=spreads.length?spreads.reduce((a,b)=>a+b,0)/spreads.length:0;
  const spreadCompression=spreadBps!=null&&avgSpread>0?Math.max(-100,Math.min(100,(1-spreadBps/avgSpread)*100)):0;

  const recentPrices=xs.filter(x=>now-x.at<=2500).map(x=>x.price);
  const priorPrices=xs.filter(x=>now-x.at>2500&&now-x.at<=9000).map(x=>x.price);
  const rr=recentPrices.length?Math.max(...recentPrices)-Math.min(...recentPrices):0;
  const pr=priorPrices.length?Math.max(...priorPrices)-Math.min(...priorPrices):0;
  const coiled=pr>0&&rr/pr<=.38;

  let buy=0,sell=0;const reasons:string[]=[];
  const add=(side:'BUY'|'SELL',pts:number,why:string)=>{if(side==='BUY')buy+=pts;else sell+=pts;if(pts>=4)reasons.push(why);};
  const velSide=v1>.12?'BUY':v1<-.12?'SELL':'WAIT';
  if(velSide!=='WAIT')add(velSide,Math.min(25,Math.abs(v1)*9),'سرعة 1s تتسارع '+velSide);
  const accSide=acceleration>.08?'BUY':acceleration<-.08?'SELL':'WAIT';
  if(accSide!=='WAIT')add(accSide,Math.min(22,Math.abs(acceleration)*12),'Acceleration '+accSide);
  if(tickSide!=='WAIT'&&persistence>=58)add(tickSide,Math.min(16,(persistence-50)*.32),'Tick persistence '+persistence+'%');
  const bookSide=imbalance>=10?'BUY':imbalance<=-10?'SELL':'WAIT';
  if(bookSide!=='WAIT')add(bookSide,Math.min(18,Math.abs(imbalance)*.18),'Best-book imbalance '+bookSide);
  if(burstRate>=1.35&&velSide!=='WAIT')add(velSide,Math.min(13,(burstRate-1)*10),'Tick burst x'+burstRate);
  if(spreadCompression>=18&&(velSide!=='WAIT'||bookSide!=='WAIT'))add(velSide!=='WAIT'?velSide:bookSide,8,'Spread compression قبل الحركة');
  if(coiled&&(bookSide!=='WAIT'||accSide!=='WAIT'))add(accSide!=='WAIT'?accSide:bookSide,9,'السوق مضغوط والضغط بدأ يتجه');

  buy=cap(buy);sell=cap(sell);
  const gap=Math.abs(buy-sell),side:'BUY'|'SELL'|'WAIT'=buy-sell>=9?'BUY':sell-buy>=9?'SELL':'WAIT',score=Math.max(buy,sell);
  const precursorCount=[Math.abs(v1)>=.35,Math.abs(acceleration)>=.18,persistence>=62,Math.abs(imbalance)>=18,burstRate>=1.35,spreadCompression>=18,coiled].filter(Boolean).length;
  let stage:WaveLead['stage']='WARMING';
  if(coiled&&score>=30)stage='COILED';
  if(side!=='WAIT'&&score>=46&&precursorCount>=3)stage='WAVE_FORMING';
  if(side!=='WAIT'&&score>=64&&Math.abs(v1)>=.7&&persistence>=62&&burstRate>=1.15)stage='IGNITION';
  const confidence=cap(score*.62+Math.min(100,gap*2)*.18+Math.min(100,precursorCount*14)*.20,0,88);
  return {ok:true,side,stage,score:Math.round(score),buy:Math.round(buy),sell:Math.round(sell),confidence:Math.round(confidence),velocity1s:Number(v1.toFixed(2)),velocity3s:Number(v3.toFixed(2)),velocity8s:Number(v8.toFixed(2)),acceleration:Number(acceleration.toFixed(2)),persistence,burstRate,imbalance:Math.round(imbalance),spreadBps:spreadBps==null?null:Number(spreadBps.toFixed(3)),spreadCompression:Math.round(spreadCompression),samples:xs.length,at:now,reasons:[...new Set(reasons)].slice(0,6)};
}
