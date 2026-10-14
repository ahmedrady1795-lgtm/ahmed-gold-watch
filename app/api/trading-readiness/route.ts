import {getRuntimeEnv} from '../../../lib/runtime';
import {getKillSwitch} from '../../../lib/admin-state';
import {getMt5BridgeStatus} from '../../../lib/market-hub';
import {getAiSnapshot} from '../../../lib/ai-snapshot-cache';
import {LIVE_ACK} from '../../../lib/execution-readiness';

export const dynamic='force-dynamic';
export const runtime='nodejs';

// Operational readiness; NEVER arms trading or exposes account IDs/secrets.
export async function GET(){
  const now=Date.now(),env=getRuntimeEnv();
  const [kill,bridge]=await Promise.all([getKillSwitch(),Promise.resolve(getMt5BridgeStatus(now))]);
  const snapshot=getAiSnapshot(now),core=snapshot.payload?.gold;
  const tick=Number(bridge.status?.tickTimeMs||0),account=bridge.status?.account;
  const symbol=String(env.MT5_SYMBOL||'XAUUSDm');
  const accountPinned=Boolean(/^\d{4,20}$/.test(String(env.MT5_EXPECTED_LOGIN||''))&&
    String(account?.login??'')===String(env.MT5_EXPECTED_LOGIN||''));
  const checks={
    brokerTokenConfigured:Boolean(env.MT5_BRIDGE_TOKEN),
    bridgeConnected:Boolean(bridge.connected),
    brokerTickFresh:Boolean(bridge.fresh&&tick>0&&tick<=now+1500&&now-tick<=5000),
    brokerCandlesFresh:Boolean(bridge.candlesFresh),
    symbolVerified:bridge.status?.symbol===symbol,
    brokerAccountPinned:accountPinned,
    brokerBalanceVerified:Number(account?.balance)>0&&Number(account?.equity)>0,
    predatorSnapshotFresh:Boolean(snapshot.payload?.ok&&snapshot.ageMs!=null&&snapshot.ageMs<=90000),
    goldCalibrationReady:core?.coreSummary?.qualityReady===true,
    professionalBreakoutConfirmed:Boolean(core?.professionalMove?.status==='CONFIRMED'&&
      core?.professionalMove?.dataReady===true&&core?.professionalMove?.score>=75&&
      core?.professionalMove?.side===core?.executionQuality?.action),
    aiSignalNotVetoed:Boolean(core?.executionQuality?.action!=='WAIT'&&
      core?.executionQuality?.confidence>=72&&
      core?.executionQuality?.dataQuality>=78&&
      (!Array.isArray(core?.executionQuality?.vetoes)||core.executionQuality.vetoes.length===0)),
    explicitSiteAcknowledgement:env.MT5_LIVE_ACK===LIVE_ACK,
    siteLiveSwitch:Boolean(env.MT5_AUTOTRADE_ENABLED==='true'),
    serverKillSwitchOff:kill.enabled===false,
    bridgeLiveMode:bridge.status?.mode==='live'
  };
  const infrastructureKeys=[
    'brokerTokenConfigured','bridgeConnected','brokerTickFresh','brokerCandlesFresh',
    'symbolVerified','brokerAccountPinned','brokerBalanceVerified'
  ] as const;
  const modelKeys=['predatorSnapshotFresh','goldCalibrationReady','professionalBreakoutConfirmed','aiSignalNotVetoed'] as const;
  const liveKeys=['explicitSiteAcknowledgement','siteLiveSwitch','serverKillSwitchOff','bridgeLiveMode'] as const;
  const blockedBy=Object.entries(checks).filter(([,ready])=>!ready).map(([key])=>key);
  return Response.json({
    ok:true,checkedAt:now,
    state:blockedBy.length?'NOT_READY':'PRECHECK_READY_ONLY',
    liveTradingEnabled:Boolean(checks.siteLiveSwitch&&checks.serverKillSwitchOff),
    liveOrderSent:false,
    infrastructureReady:infrastructureKeys.every(k=>checks[k]),
    aiReadyForBrokerUse:modelKeys.every(k=>checks[k]),
    explicitLiveControlsReady:liveKeys.every(k=>checks[k]),
    checks,blockedBy,bridgeAgeMs:bridge.connected?(bridge as any).bridgeAgeMs??null:null,
    aiAgeMs:snapshot.ageMs??null,
    note:'Even PRECHECK_READY_ONLY does not guarantee an order: every signal must pass /api/execution/signal and local MT5 order_check. Real fills, slippage and profitability cannot be certified remotely.'
  },{headers:{'Cache-Control':'private, no-store'}});
}
