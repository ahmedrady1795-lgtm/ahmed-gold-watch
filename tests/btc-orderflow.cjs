const assert=require('node:assert/strict'),fs=require('node:fs'),
 ts=require('typescript'),vm=require('node:vm');
const module_={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/btc-orderflow.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:module_,exports:module_.exports});
const {normalizeCoinbaseTrades:normalize,buildBtcOrderflow:build}=module_.exports;
const now=Date.parse('2026-10-17T12:00:00.000Z');
const rows=Array.from({length:130},(_,i)=>({
 trade_id:80000+i,time:new Date(now-1000-i*750).toISOString(),
 price:String(i<65?100:i<104?101:99),
 size:'0.12',side:i<85?'sell':'buy'
}));
const normal=normalize(rows,now);
assert.equal(normal.length,130);
assert.equal(normal[0].aggressor,'SELL','Coinbase maker buy means aggressive SELL');
assert.equal(normal.at(-1).aggressor,'BUY','Coinbase maker sell means aggressive BUY');
assert.equal(normal.at(-1).price,100);
assert.equal(normalize([{...rows[0],time:new Date(now+7000).toISOString()}],now).length,0,
 'future trade timestamps must not be accepted');
assert.equal(normalize([{...rows[0],price:'-3'}],now).length,0);
assert.equal(normalize([{...rows[0],size:'NaN'}],now).length,0);
assert.equal(normalize([{...rows[0],side:'unknown'}],now).length,0);
assert.equal(normalize([rows[0],rows[0]],now).length,1,'duplicate executions must not inflate volume');
assert.equal(normalize([rows[0],{...rows[0],price:'105'}],now).length,0,
 'trade_id collisions with conflicting price must not be accepted');
assert.equal(normalize(rows,now+13*60000).length,0,'obsolete executions cannot be called live');
const order=build(normal,now);
assert.equal(order.ok,true);
assert.equal(order.status,'LIVE_SAMPLE');
assert.equal(order.profile.poc,100,'highest executed BTC volume belongs to the strongest price bin');
assert.equal(order.profile.binSize,1);
assert.ok(order.profile.val<=order.profile.poc&&order.profile.poc<=order.profile.vah);
assert.ok(order.profile.rows.length>=3);
const expectedBuy=85*.12,expectedSell=45*.12;
assert.ok(Math.abs(order.flow.buyBtc-expectedBuy)<.00001,
 'maker sell is aggressor BUY, not a maker BUY');
assert.ok(Math.abs(order.flow.sellBtc-expectedSell)<.00001);
assert.ok(order.flow.deltaBtc>0);
assert.ok(order.flow.deltaPct>0);
assert.equal(order.actionable,false,'profile cannot approve any trade');
assert.equal(order.venueComplete,false,'Coinbase samples are not global executed volume');
assert.equal(order.coverage.completeSession,false);
assert.equal(order.coverage.completeMinutes,false);
assert.ok(order.footprint.length>0&&order.footprint.length<=3);
assert.ok(order.footprint.every(m=>m.partial===true),'footprint minutes are incomplete observed samples');
assert.ok(order.footprint.every(m=>m.rows.every(b=>Number.isFinite(b.price)&&
 b.buyBtc>=0&&b.sellBtc>=0)),'footprint has only numeric executed buy/sell BTC');
assert.ok(order.profile.volumeBtc>15);
assert.equal(build(normal,now+40000).ok,false,'40-second-old latest trade never remains live');
assert.equal(build(normal.slice(0,4),now).status,'INSUFFICIENT');
assert.equal(build([],now).ok,false);
const panel=fs.readFileSync('components/BtcOrderflowPanel.tsx','utf8'),
 chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8'),
 route=fs.readFileSync('app/api/orderflow/route.ts','utf8'),
 css=fs.readFileSync('app/workspace.css','utf8');
assert.match(route,/api\.exchange\.coinbase\.com\/products\/BTC-USD\/trades\?limit=1000/,
 'trade tape must originate from a real public executed-trades endpoint');
assert.match(route,/inFlight=snapshot\(\)/,'coalesce concurrent server requests');
assert.match(route,/return Response\.json\(\{ok:false/,'source outage fails closed');
assert.match(chart,/BtcOrderflowPanel data=\{orderFlow\}/);
assert.match(chart,/btc-executed-profile-level/);
assert.match(chart,/flowFresh&&orderFlow\?\.profile/);
assert.match(chart,/asset==='GOLD'&&<details className="gold-orderflow-note"/,
 'XAUUSD has no invented centralized futures prints');
assert.match(panel,/data!\.coverage\.seconds/,'disclose finite executed sample coverage');
assert.match(panel,/maker|Maker/,'disclose inverse Coinbase maker semantics');
assert.match(panel,/M1 جزئية/,'partial data never falsely claims completed Footprint');
assert.match(panel,/price===profile\.poc/,'distinguish maximum-volume execution bin');
assert.match(css,/\.btc-orderflow-grid/,'chart displays volume/footprint on mobile');
console.log('PASS: honest Coinbase maker inversion, executed BTC volume profile, footprint sample, stale/dedup and UI guards');
