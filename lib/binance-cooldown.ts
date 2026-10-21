// Honor Binance's official HTTP 429 / 418 Retry-After per shared egress IP.
// Fail quickly instead of amplifying a temporary ban into a longer ban.
export function spotBackoffMs(status:number,retryAfter:string|null,now=Date.now()):number {
  if(status!==418&&status!==429)return 0;
  const raw=String(retryAfter||'').trim();
  const seconds=raw&&/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):null;
  const asDate=raw&&!Number.isFinite(seconds)?Date.parse(raw):NaN;
  const specified=seconds!==null?seconds*1000:
    Number.isFinite(asDate)?asDate-now:NaN;
  const fallback=status===418?10*60*1000:90*1000;
  const wait=Number.isFinite(specified)&&specified>0?specified:fallback;
  return Math.ceil(Math.min(3*24*60*60*1000,Math.max(1000,wait)));
}
