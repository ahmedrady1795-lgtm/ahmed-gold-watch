const assert=require('node:assert/strict'),fs=require('node:fs');
const page=fs.readFileSync('app/page.tsx','utf8');
const map=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const news=fs.readFileSync('components/NewsCommandCenter.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
assert.equal((page.match(/<NewsCommandCenter(?:\s|>)/g)||[]).length,1,
  'the economic calendar should appear exactly once at the top');
assert.doesNotMatch(map,/<NewsCommandCenter|import NewsCommandCenter/,
  'the chart component must not duplicate news API polling');
assert.match(news,/fetch\('\/api\/news/,'news uses independent source');
assert.match(news,/remainingAlerts=alerts\.filter\(e=>e!==highlighted\)/,
  'the featured event should not be repeated below the headline');
assert.match(news,/remainingAlerts\.map\(/,
  'remaining upcoming news is still accessible');

assert.match(map,/evaluateProfessionalMove/,'Predator movement forecast is visible');
assert.match(map,/sniper-pro-move/,'the professional move decision has a separate compact card');
assert.match(css,/\.sniper-pro-move-data/,'professional move card is responsive');
console.log('PASS: one news calendar, zero duplicate news polling and a compact professional movement view');
