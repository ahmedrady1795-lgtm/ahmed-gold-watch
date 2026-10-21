// Deployment connectivity diagnostic only. No secrets, no trade execution.
const hosts=['https://data-api.binance.vision','https://api-gcp.binance.com',
  'https://api1.binance.com','https://api.binance.com'];
const probes=await Promise.allSettled(hosts.map(async host=>{
  const controller=AbortSignal.timeout(5500);
  const result=await fetch(host+'/api/v3/ticker/24hr?symbol=BTCUSDT',
    {signal:controller,headers:{Accept:'application/json'}});
  if(!result.ok)throw Error('HTTP '+result.status);
  const j=await result.json();
  const v=Number(j?.quoteVolume),t=String(j?.symbol);
  if(t!=='BTCUSDT'||!Number.isFinite(v)||v<=0)throw Error('Invalid ticker data');
  return {host,status:'OK',quoteVolumeValid:true};
}));
for(let i=0;i<hosts.length;i++){
  const p=probes[i];
  console.log('SPOT-BINANCE-GATEWAY '+JSON.stringify(p.status==='fulfilled'?
    p.value:{host:hosts[i],status:'UNAVAILABLE',reason:String(p.reason).slice(0,110)}));
}
console.log('SPOT-BINANCE-GATEWAY diagnostic complete (nonblocking for build).');
