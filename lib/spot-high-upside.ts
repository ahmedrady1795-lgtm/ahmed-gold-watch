import type {Candle,Candidate} from './spot-radar';

/** A curated thematic watchlist, not a claim that every ticker is still
 * listed. Binance live exchangeInfo must confirm each specific Spot pair. */
const MEME_BASES=[
  'DOGE','SHIB','PEPE','BONK','FLOKI','WIF','BOME','POPCAT','MOG',
  'BRETT','TURBO','NEIRO','MEW','PONKE','GOAT','PNUT','ACT',
  'TRUMP','MELANIA','FARTCOIN','1MBABYDOGE','1000CHEEMS',
  '1000SATS','PENGU','MEME','DOGS','CAT','NOT','TOSHI','BABYDOGE',
  'SPX','DEGEN','GIGA','PUMP','MOODENG','AI16Z','CHILLGUY','BAN',
  'PEOPLE','SLERF','MYRO','WEN','CATUSDT','COQ','PONK','SUNDOG'
];
const MEGA_BASES=new Set(['BTC','ETH','BNB','SOL','XRP','TRX','ADA','LTC','LINK','DOT','BCH','XLM','AVAX']);
const MEMES=new Set(MEME_BASES);
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const sum=(a:number[])=>a.reduce((x,y)=>x+y,0);
export const memeSpotSymbols=()=>MEME_BASES.filter(x=>!x.endsWith('USDT')).map(x=>x+'USDT');

export type UpsideFocus={
  group:'MEME'|'HIGH_BETA'|'MEGA';
  boost:number;
  hourlyRangePct:number;
  recentActivityRatio:number;
  reason:string;
};
/** Never infer market capitalization or ownership from price. Classify
 * curated meme tickers as meme; all others are just non-meme volatile pairs. */
export function marketGroup(symbol:string):UpsideFocus['group']{
  if(!symbol.endsWith('USDT'))return 'HIGH_BETA';
  const base=symbol.slice(0,-4);
  return MEMES.has(base)?'MEME':MEGA_BASES.has(base)?'MEGA':'HIGH_BETA';
}
export function highUpsideFocus(coin:Candidate,hourly:Candle[]):UpsideFocus|null{
  const h=hourly.slice(-56),n=h.length;
  if(n<48)return null;
  if(h.some((x,i)=>!Number.isFinite(x.high)||!Number.isFinite(x.low)||
    x.low<=0||x.high<x.low||(i>0&&x.time-h[i-1].time!==3600000)))return null;
  const group=marketGroup(coin.symbol);
  const recent=h.slice(-24),prior=h.slice(-48,-24);
  const hourlyRangePct=recent.reduce((total,c,i)=>{
    const prev=i?recent[i-1].close:prior.at(-1)!.close;
    const tr=Math.max(c.high-c.low,Math.abs(c.high-prev),Math.abs(c.low-prev));
    return total+tr/c.close*100;
  },0)/24;
  const totalRecent=sum(recent.map(c=>c.quoteVolume));
  const totalPrior=sum(prior.map(c=>c.quoteVolume));
  if(totalPrior<=0||totalRecent<=0)return null;
  const recentActivityRatio=totalRecent/totalPrior;
  // Zero premium for already exhausted movement, low-liquidity or
  // unverified taker participation; hype alone never upgrades a candidate.
  const actionable=coin.volume24h>=1500000&&!coin.trapRisk&&
    coin.change24h<12&&coin.change15m<=5&&
    coin.buyShare>=.52&&recentActivityRatio>=.95;
  const volatility=clamp((hourlyRangePct-.5)/2.8,0,1);
  const activity=clamp((recentActivityRatio-.95)/1.2,0,1);
  const bonus=group==='MEME'?15:group==='HIGH_BETA'?6:0;
  const boost=actionable?Math.round((volatility*.65+activity*.35)*bonus):0;
  const reason=group==='MEME'?'ميم كوين · حركة نشطة':
    group==='HIGH_BETA'?'عملة متقلبة · نشاط سعر وسيولة':'عملة كبيرة · حركة أقل';
  return {group,boost,hourlyRangePct,recentActivityRatio,reason};
}
