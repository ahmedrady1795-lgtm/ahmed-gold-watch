'use client';

import SniperM15Panel from './SniperM15Panel';

// Only the actively displayed M5 sniper enters the client bundle.
// The older, unmounted forecast illustration remains in its own module for
// regression research; no heavy legacy chart imports on first dashboard load.
export default function SniperChartEntry(props:Parameters<typeof SniperM15Panel>[0]){
  return <SniperM15Panel {...props}/>;
}
