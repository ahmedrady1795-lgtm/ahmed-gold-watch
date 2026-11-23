const assert=require('node:assert/strict');
const fs=require('node:fs');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const hero=fs.readFileSync('components/SniperScenarioHero.tsx','utf8');
const styles=fs.readFileSync('app/qannas-scenario-2026.css','utf8');
const layout=fs.readFileSync('app/layout.tsx','utf8');
const page=fs.readFileSync('app/page.tsx','utf8');
const overlay=fs.readFileSync('components/SniperM15HuntOverlay.tsx','utf8');
assert.match(panel,/data-qannas-chart-signal=\{commandState\}/,
 'qualified decision must be shown directly in live M5 chart');
assert.match(panel,/className="sniper-m5-chart-status"/,
 'price-true M5 labels must stay on the original SVG');
assert.doesNotMatch(panel,/sniper-intelligence-drawer/,
 'repeated early-flow and AI fusion deck should be removed');
assert.doesNotMatch(panel,/<SniperM15PreMoveConsole\b/,
 'early-flow big card is no longer the primary navigation');
const chart=panel.indexOf('className="sniper-m15-chart-box"');
const diagnostic=panel.indexOf('className="sniper-m15-diagnostics"');
assert.ok(chart>=0&&diagnostic>chart,
 'main chart must precede optional concise diagnostic panel');
assert.match(panel,/className="sniper-diagnostic-mini"/,
 'M1 M15 and liquidity diagnostics stay accessible without large cards');
assert.match(hero,/data-source-ready=\{connected\}/);
assert.match(hero,/const connected=p\.marketOpen&&p\.fresh&&!p\.providerTransition&&p\.fusion\.ready/);
assert.match(hero,/m1M15Conflict/,'do not hide conflicting closed-candle directions');
assert.match(hero,/sourceMismatch/,'source mismatch must not be disguised as flow');
assert.match(hero,/const trigger=candidate\?p\.preMove\.trigger:null/);
assert.match(hero,/const invalidation=candidate\?p\.preMove\.invalidation:null/);
assert.match(hero,/const liquidity=p\.liquidity\.ready\?/);
assert.match(hero,/OBSERVATION ONLY/);
assert.match(hero,/لا شموع مستقبلية أو أهداف مضمونة/);
assert.doesNotMatch(hero,/Math\.random|fake|placeOrder|submitOrder|broker\.trade|fetch\(/);
assert.match(layout,/import ".\/qannas-scenario-2026\.css";/);
assert.match(styles,/\.sniper-scenario-hero-main/);
assert.match(styles,/\.sniper-scenario-chart-legend/);
assert.match(styles,/\.sniper-intelligence-drawer/);
assert.match(styles,/@media\(max-width:550px\)/);
assert.match(styles,/@media\(prefers-reduced-motion:reduce\)/);
assert.match(page,/modern-workspace compact-sniper/);
assert.match(overlay,/No fabricated candle body or tick/);
console.log('PASS: genuine chart-first 2026 scenario director, readable mobile layout, fresh-source-only levels, no fake orders or future prices');
