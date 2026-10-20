const assert=require('node:assert/strict'),fs=require('node:fs'),
 ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-m15-reactions.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});
const {buildM15ReactionMap}=mod.exports;
const now=Date.parse('2026-10-20T05:15:00Z');
const scenario=(bars)=>({ready:true,bars,reason:'test',
 sourceBars:100,archiveYears:0,origin:'RECENT_M15',
 touches:[],stopped:false,atr:1});
const bar=(step,open,high,low,close)=>({step,open,high,low,close,source:'HISTORICAL_ANALOGUE'});
const bullish=[bar(1,100,100.5,99.75,100.1),
 bar(2,100.1,100.6,99.1,99.5),
 bar(3,99.5,100.9,99.3,100.5),
 bar(4,100.5,101.1,100.1,100.8),
 bar(5,100.8,101.4,100.5,101.1)];
const zones={ready:true,phase:'',reason:'',context:null,events:[],zones:[{
 kind:'DEMAND',low:99,high:99.4,label:'طلب M15',source:'قاع M15 مغلق',
 confirmedAt:now-900000
}]};
const common={scenario:scenario(bullish),liquidity:zones,
 side:'BUY',anchor:100,now,stop:98.3};
const a=buildM15ReactionMap(common);
assert.equal(a.bands.length,1);
assert.equal(a.bands[0].price,99.2);
assert.equal(a.marks.length,1,'only one labelled rebound to avoid clutter');
assert.equal(a.marks[0].step,2);
assert.equal(a.marks[0].kind,'ZONE_TOUCH');
assert.equal(a.marks[0].price,99.1,'price is actually in simulated wick and real zone');
assert.equal(a.marks[0].invalidation,99);
assert.match(a.marks[0].detail,/افتراضي/);
assert.equal(buildM15ReactionMap({...common,liquidity:{...zones,ready:false}}).marks.length,0);
assert.equal(buildM15ReactionMap({...common,scenario:{...common.scenario,ready:false}}).marks.length,0);
assert.equal(buildM15ReactionMap({...common,side:'WAIT'}).marks.length,0);
assert.equal(buildM15ReactionMap({...common,stop:99.25}).marks.length,0,
 'no rebound if historical zone has been passed through stop');
const future={...zones,zones:[{...zones.zones[0],confirmedAt:now+900000}]};
assert.equal(buildM15ReactionMap({...common,liquidity:future}).bands.length,0);
const supply={...zones,zones:[{kind:'SUPPLY',low:101.4,high:102.1,
 label:'عرض M15',source:'قمة M15 مغلقة',confirmedAt:now-900000}]};
const bearish=[bar(1,100.4,101.1,100,100.8),
 bar(2,100.8,102,100.5,101.5),
 bar(3,101.5,101.7,99.9,100.3),
 bar(4,100.3,100.4,99.6,99.9)];
const down=buildM15ReactionMap({scenario:scenario(bearish),
 liquidity:supply,side:'SELL',anchor:100.4,stop:103,now});
assert.equal(down.bands[0].kind,'SUPPLY');
assert.equal(down.marks.length,1);
assert.equal(down.marks[0].price,102);
assert.equal(down.marks[0].direction,'DOWN');
const noTouch=buildM15ReactionMap({...common,scenario:scenario([
 bar(1,100,100.3,99.9,100.2),bar(2,100.2,100.8,100.1,100.6),
 bar(3,100.6,101.1,100.3,100.9),bar(4,100.9,101.4,100.6,101.1)
])});
assert.equal(noTouch.bands.length,1,'verified zone is still available as conditional reference');
assert.equal(noTouch.marks.length,0,'do not invent a simulated zone hit');
const pivot=buildM15ReactionMap({...common,liquidity:{...zones,zones:[]},
 scenario:scenario([
 bar(1,100,100.8,99.9,100.5),
 bar(2,100.5,101.1,100.3,100.9),
 bar(3,100.9,101,99.8,100.1),
 bar(4,100.1,100.8,100,100.7),
 bar(5,100.7,101.3,100.5,100.9),
 bar(6,100.9,101.6,100.8,101.4)
 ])});
assert.equal(pivot.bands.length,0);
assert.equal(pivot.marks.length,1);
assert.equal(pivot.marks[0].kind,'PATTERN_TURN');
assert.equal(pivot.marks[0].invalidation,null,'hypothetical pivot is not verified demand');
const component=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(component,/const reactions=buildM15ReactionMap/);
assert.match(component,/marks:aligned\.reactions\.marks\.filter/,
 'reaction markers show only when frozen projected candles match the live anchor');
assert.match(component,/className="sniper-m15-reaction-band"/);
assert.match(component,/className="sniper-m15-reaction-mark"/);
assert.match(component,/className="sniper-m15-rail-turn"/);
assert.match(component,/mark\.price/);
assert.match(component,/z\.invalidation/);
assert.match(component,/projected\.ready&&reactionMap\.marks/);
assert.doesNotMatch(component,/setTimeout\([^]*?setFrozen/);
assert.match(component,/const projectedStride=\(end-split-8\)\/48;/,
 'classic 48-slot forecast uses fixed historical 15-minute spacing');
assert.match(component,/const realCandleWidth=clamp\(actualStride\*\.60/,
 'real M15 width stays based on observed historical geometry');
assert.match(component,/const futureCandleWidth=clamp\(projectedStride\*\.62,1\.5,3\.1\);/,
 'classic right pane uses historical narrow solid candles');
assert.match(component,/realCandleWidth,false,'real'\+b\.time/,
 'historical OHLC is rendered at its original width');
assert.match(component,/futureCandleWidth,true,'future'\+i/,
 'future illustration is drawn as continuous full OHLC candles');
assert.doesNotMatch(component,/const projectedSlots=Math\.max\(14/,
 'do not zoom up four forecast bars after a stop');
assert.match(component,/stable\?\.scenario\.stopped/,
 'display hypothetical early stop transparently instead of only showing distant TPs');
assert.match(component,/const drawnZones=liquidity\.zones\.filter/,
 'overlapping real liquidity rectangles should not paint opaque red blobs');
assert.match(component,/compactM15ZoneAnnotations\(drawnZones/,
 'only drawn price zones contribute visible historical labels');
assert.match(component,/Math\.abs\(x\.exactY-z\.exactY\)<13/,
 'do not print conditional zone price twice near a plotted reaction point');
console.log('PASS: frozen source-true rebound bands, mirrored BUY/SELL projected touches, expiry/stop/future guards, no invented hits');
