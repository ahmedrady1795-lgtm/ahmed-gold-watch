/** Refresh at the candle boundary, not one minute after the tab was opened.
 * Retry delayed closes at a bounded rate; never extend a watch's validity. */
export function chartRefreshDelay(chart:any,now:number):number{
  const minute=Math.floor(now/60000)*60000;
  const btcClose=Number(chart?.bitcoin?.chartCandles?.at(-1)?.time||0)+60000;
  const goldClose=Number(chart?.gold?.chartCandles?.at(-1)?.time||0)+60000;
  const day=new Date(now).getUTCDay(),hour=new Date(now).getUTCHours();
  const goldOpen=day!==6&&!(day===0&&hour<22)&&!(day===5&&hour>=21)&&hour!==21;
  const caughtUp=btcClose===minute&&(!goldOpen||goldClose===minute);
  const boundary=minute+60000+1500-now;
  return caughtUp?boundary:Math.min(10000,boundary);
}
