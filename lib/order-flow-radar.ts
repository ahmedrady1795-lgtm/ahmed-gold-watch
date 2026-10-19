// Coinbase BTC-USD only. Experimental evidence, never a calibrated probability.
import {inspectL2Book,assessL2Persistence,
 type L2BookSample,type OrderFlowMicroEvidence} from './order-flow-microstructure';
export type RadarSide='BUY'|'SELL'|'WAIT';
export type RadarView={phase:'WARMUP'|'OFFLINE'|'WATCH'|'PREPARE'|'CONFIRMED'|'INVALIDATED'|'EXPIRED';side:RadarSide;delta:number;imbalance:number;confirm:number|null;invalidate:number|null;since:number;replenishments:number;micro?:OrderFlowMicroEvidence};
type Trade={id:number;at:number;price:number;size:number;buy:boolean};
export class OrderFlowRadar {
  bids=new Map<number,number>(); asks=new Map<number,number>();
  bookSamples:L2BookSample[]=[];
  trades:Trade[]=[]; replenishments:{at:number;side:string}[]=[];
  snapshotAt=0; heartbeatAt=0; bookAt=0; lastId=0; lastMatchAt=0; broken=false;
  // Missing matches invalidate delta, not the L2 socket. Recover after a
  // clean 30s trade window; never issue signals during the quarantine.
  quarantineUntil=0; gapCount=0;
  quarantine(now:number){
    this.quarantineUntil=Math.max(this.quarantineUntil,now+30000);
    this.gapCount++;this.trades=[];this.replenishments=[];
    this.candidate='WAIT';
    this.view={...this.view,phase:'OFFLINE',side:'WAIT',confirm:null,
      invalidate:null,since:now};
  }
  candidate:RadarSide='WAIT'; candidateAt=0;
  view:RadarView={phase:'WARMUP',side:'WAIT',delta:0,imbalance:0,confirm:null,invalidate:null,since:0,replenishments:0};
  ingest(m:any,now=Date.now()){
    if(m.product_id!=='BTC-USD')return;
    if(m.type==='snapshot'){
      this.bids.clear();this.asks.clear();
      for(const [rows,book] of [[m.bids,this.bids],[m.asks,this.asks]] as const)
        for(const row of rows||[]){const p=Number(row[0]),s=Number(row[1]);if(p>0&&s>0&&Number.isFinite(p+s))book.set(p,s);}
      this.snapshotAt=now;this.bookAt=now;this.bookSamples=[];
    }
    if(m.type==='heartbeat'){
      const at=Date.parse(m.time); if(!Number.isFinite(at)||Math.abs(now-at)>5000){this.broken=true;return;}
      this.heartbeatAt=now;
      // Heartbeat can precede matching trades; allow brief delivery grace.
      const heartbeatId=Number(m.last_trade_id);
      if(this.lastId&&Number.isSafeInteger(heartbeatId)&&heartbeatId>this.lastId&&
         now-this.lastMatchAt>2500)this.quarantine(now);
    }
    if(m.type==='last_match'){this.lastId=Number(m.trade_id)||0;this.lastMatchAt=now;return;}
    if(m.type==='match'){
      const id=Number(m.trade_id),at=Date.parse(m.time),price=Number(m.price),size=Number(m.size);
      if(!Number.isSafeInteger(id)||!Number.isFinite(at+price+size)||price<=0||size<=0||!['buy','sell'].includes(m.side)){this.broken=true;return;}
      if(id<=this.lastId)return;
      if(this.lastId&&id!==this.lastId+1)this.quarantine(now);
      this.lastId=id;this.lastMatchAt=now;
      if(Math.abs(now-at)>5000){this.broken=true;return;}
      this.trades.push({id,at,price,size,buy:m.side==='sell'}); // feed side is maker
      this.trades=this.trades.filter(t=>now-t.at<=30000).slice(-20000);
    }
    if(m.type==='l2update'&&this.snapshotAt){
      const at=Date.parse(m.time);if(!Number.isFinite(at)||Math.abs(now-at)>5000){this.broken=true;return;}
      for(const [side,p0,s0] of m.changes||[]){
        const p=Number(p0),s=Number(s0),book=side==='buy'?this.bids:this.asks;
        if(!['buy','sell'].includes(side)||!Number.isFinite(p+s)||p<=0||s<0){this.broken=true;continue;}
        const old=book.get(p)||0;
        // A size increase following a fill at this exact price is a possible refill,
        // not proof of an iceberg or of the identity of the participant.
        if(s>old&&this.trades.some(t=>now-t.at<=1000&&t.price===p&&t.buy===(side==='sell')))
          this.replenishments.push({at:now,side});
        if(s===0)book.delete(p);else book.set(p,s);
      }
      this.bookAt=now;
      this.replenishments=this.replenishments.filter(r=>now-r.at<=30000).slice(-1000);
    }
  }
  evaluate(now=Date.now()):RadarView{
    const rows=this.trades.filter(t=>now-t.at<=30000),last=rows.at(-1);
    // Persist only one bounded L2 snapshot each second; no fabricated
    // intervening observations if the socket was disconnected.
    if(!this.broken&&this.snapshotAt&&this.bookAt&&now-this.bookAt<=4000&&
      (!this.bookSamples.length||now-this.bookSamples.at(-1)!.at>=950)){
      const sample=inspectL2Book({
        bids:[...this.bids.entries()],asks:[...this.asks.entries()],at:now
      });
      if(sample)this.bookSamples=[...this.bookSamples.filter(x=>now-x.at<=15000),
        sample].slice(-16);
    }
    const micro=assessL2Persistence({snapshots:this.bookSamples,now,
      executed:rows.map(t=>({at:t.at,price:t.price,size:t.size,
        aggressor:(t.buy?'BUY':'SELL') as 'BUY'|'SELL'}))});

    if(this.broken||now<this.quarantineUntil||!this.heartbeatAt||now-this.heartbeatAt>5000||!this.bookAt||now-this.bookAt>10000||!last||now-last.at>5000){
      this.candidate='WAIT';this.view={...this.view,phase:'OFFLINE',side:'WAIT',confirm:null,invalidate:null,since:now,micro:{...micro,ready:false,status:'STALE'}};return this.view;
    }
    if(now-this.snapshotAt<30000||rows.length<20){this.view={...this.view,phase:'WARMUP',side:'WAIT',micro};return this.view;}
    const bids=[...this.bids].sort((a,b)=>b[0]-a[0]),asks=[...this.asks].sort((a,b)=>a[0]-b[0]);
    const bid=bids[0]?.[0],ask=asks[0]?.[0];
    if(!bid||!ask||bid>=ask){this.broken=true;return this.evaluate(now);}
    const mid=(bid+ask)/2;
    const depth=(a:number[][])=>a.filter(r=>Math.abs(r[0]-mid)/mid<=.001).reduce((s,r)=>s+r[0]*r[1],0);
    const b=depth(bids),a=depth(asks),imbalance=b+a?(b-a)/(b+a)*100:0;
    const total=rows.reduce((s,t)=>s+t.size,0),delta=rows.reduce((s,t)=>s+(t.buy?1:-1)*t.size,0)/total*100;
    const change=(last.price-rows[0].price)/rows[0].price*10000;
    const side:RadarSide=delta<=-30&&Math.abs(change)<2&&imbalance>10?'BUY':delta>=30&&Math.abs(change)<2&&imbalance< -10?'SELL':'WAIT';
    const counts=this.replenishments.filter(r=>now-r.at<=30000&&r.side===(side==='BUY'?'buy':'sell')).length;
    let v={...this.view,delta,imbalance,replenishments:side==='WAIT'?0:counts,micro};
    if(v.phase==='PREPARE'||v.phase==='CONFIRMED'){
      const buy=v.side==='BUY';
      if(buy?last.price<=v.invalidate!:last.price>=v.invalidate!)v={...v,phase:'INVALIDATED',since:now};
      else if(now-v.since>120000)v={...v,phase:'EXPIRED',since:now};
      else if(v.phase==='PREPARE'){
        const recent=rows.filter(t=>now-t.at<=5000),volume=recent.reduce((s,t)=>s+t.size,0);
        const d=volume?recent.reduce((s,t)=>s+(t.buy?1:-1)*t.size,0)/volume:0;
        if(recent.length>=5&&(buy?last.price>v.confirm!&&d>.2:last.price<v.confirm!&&d<-.2))v={...v,phase:'CONFIRMED'};
      }
    }else if((v.phase==='INVALIDATED'||v.phase==='EXPIRED')&&now-v.since<10000){/* show terminal state */}
    else{
      if(side!==this.candidate){this.candidate=side;this.candidateAt=now;}
      v={...v,phase:'WATCH',side:'WAIT',confirm:null,invalidate:null};
      if(side!=='WAIT'&&now-this.candidateAt>=5000&&counts>=2){
        const low=Math.min(...rows.map(t=>t.price)),high=Math.max(...rows.map(t=>t.price)),pad=Math.max(ask-bid,mid*.0001);
        v={...v,phase:'PREPARE',side,confirm:side==='BUY'?high+pad:low-pad,invalidate:side==='BUY'?low-pad:high+pad,since:now};
      }
    }
    this.view=v;return v;
  }
}
