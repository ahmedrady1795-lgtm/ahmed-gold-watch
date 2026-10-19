const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const module_={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-movement-outlook.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:module_,exports:module_.exports});
const outlook=module_.exports.buildDistantMovementOutlook;
const now=Date.parse('2026-10-19T12:00:00Z'),basePrice=1000;
const frame=(n,period)=>Array.from({length:n},(_,i)=>({
 time:now-(n-i)*period,open:1000,close:1000,
 high:1000.56+Math.sin(i*.5)*.08,
 low:999.44+Math.sin(i*.5)*.08
}));
const m15=frame(120,900000),h1=frame(48,3600000),h4=frame(12,14400000);
m15[21].high=1002.15;m15[49].high=1004.1;m15[78].high=1006.3;
h1[12].high=1003.1;h1[24].high=1005.25;h1[35].high=1008.1;
h4[4].high=1010.25;
m15[25].low=997.85;m15[51].low=995.9;m15[83].low=993.7;
h1[10].low=996.9;h1[23].low=994.8;h1[34].low=991.9;
const input={asset:'GOLD',side:'BUY',price:basePrice,now,
 priceFresh:true,historyFresh:true,marketOpen:true,
 frames:{m15,h1,h4},evidenceStrength:'CONFIRMED',
 invalidation:999,trigger:1001.2
};
const up=outlook(input);
assert.equal(up.side,'BUY');assert.equal(up.strength,'ترجيح فني قوي');
assert.equal(up.actionable,false);assert.equal(up.horizon,'STRUCTURAL');
assert.equal(up.targets.length,3,'choose three distant observed pivots when available');
assert.ok(up.targets.every((t,i)=>t.price>1000&&(i===0||t.price>up.targets[i-1].price)));
assert.ok(up.targets.every(t=>[...m15,...h1,...h4].some(b=>b.high===t.price)),
 'never fabricate a target or use an arithmetic ATR extension');
assert.ok(up.targets[0].distanceAtr>=1.45&&up.targets[2].distanceAtr>=4.4,
 'stages move outward through longer-horizon structural levels');
assert.equal(up.invalidation,999);
assert.equal(up.trigger,1001.2);
const down=outlook({...input,side:'SELL',evidenceStrength:'PARTIAL',trigger:998.5,
 invalidation:1001});
assert.equal(down.side,'SELL');assert.equal(down.targets.length,3);
assert.ok(down.targets.every((t,i)=>t.price<1000&&(i===0||t.price<down.targets[i-1].price)));
assert.ok(down.targets.every(t=>[...m15,...h1,...h4].some(b=>b.low===t.price)));
assert.equal(outlook({...input,side:'WAIT'}).targets.length,0);
assert.equal(outlook({...input,priceFresh:false}).side,'WAIT');
assert.equal(outlook({...input,providerTransition:true}).side,'WAIT');
assert.equal(outlook({...input,marketOpen:false}).targets.length,0);
const absent=outlook({...input,frames:{m15:[],h1:[],h4:[]}});
assert.equal(absent.targets.length,0,'do not invent TP when historical pivots are absent');
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(chart,/buildDistantMovementOutlook/);
assert.match(chart,/movementOutlook\.targets\.length\?movementOutlook\.targets/);
assert.match(chart,/sniper-movement-outlook/);
assert.match(chart,/movementOutlook\.strength/);
assert.match(chart,/statusReady\?m\.displayTargets/,
 'qualified TP prices are preserved rather than overridden by the observation');
console.log('PASS: assertive observed direction, 3 distant TP pivots, no fabricated levels, safety and qualified-trade isolation');
