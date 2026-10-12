// Deterministic closed OHLC tests with real-looking structural swing highs.
function history(now,period,count,side='BUY'){
  const rows=Array.from({length:count},(_,i)=>{
    const middle=99.25+Math.sin(i*.31)*.25;
    const open=middle-.03,close=middle+.03;
    return {time:now-(count-i)*period,open,close,low:middle-.37,high:middle+.38};
  });
  const peaks=[
    {distance:8,price:side==='BUY'?101.8:97.7},
    {distance:22,price:side==='BUY'?103.25:96.6},
    {distance:42,price:side==='BUY'?104.8:95.5},
  ];
  for(const row of peaks){
    const i=count-row.distance;
    if(i>=2&&i<count-2){
      if(side==='BUY')rows[i].high=row.price;
      else rows[i].low=row.price;
    }
  }
  return rows;
}
function frames(now){
  return {
    m5:history(now,5*60000,110),
    m15:history(now,15*60000,130),
    h1:history(now,60*60000,120)
  };
}
module.exports={frames,history};
