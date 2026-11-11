// Al-Qannas Fast Follow DEMO v3.10 BATCH3 - experimental, unverified expectancy.
// Up to 3 consecutive market entries per opportunity, exact 0.12 lots by default.
// No profit wait or extra 0.08 move inside a batch. Recheck current signal,
// spread, stop budget, margin, max-position count, fill visibility each request.
// Minimum start-to-start spacing 150ms. Synchronous broker latency may be longer.
// First entry needs bid+ask fast/slow agreement (300/1200ms), efficiency >=0.40,
// signal stability 100ms. Neutral/reversal, expiry or an exit cancels the batch.
// New batch requires a fresh favorable move; no extra cooldown/history reset by default.
// Max 3 concurrent positions and 60 accepted entries per rolling minute.
// Cash exit 3.50 USD / broker SL budget 6 USD PER POSITION; gaps/slippage can exceed.
// 3 x 0.12 increases aggregate exposure: budget 18 USD broker SL across three.
// Spread/fees alone reaching cash exit rejects entry with reason; volume is not reduced.
// TP distance 0.45 XAU price units. No martingale. No daily loss lock.
// Same Magic/instance lock as earlier versions: INSTALL ONLY WHEN FLAT, remove ALL
// older AQ trading EAs, compile F7, attach ONE copy to DEMO USD HEDGING XAU/GOLD M1,
// press Reset. Existing broker levels are not rewritten. Logs: FastFollow_310 CSV.
// Pause NEW entries button preserves exit management; Algo OFF prevents software exits.
// Local C++ adapter tests only: NOT MetaEditor compilation or MT5 back/forward test.
// This does not establish improved accuracy, profitability, broker speed, or seller equivalence.
#property strict
#property version "3.10"
#property description "DEMO Fast Follow: tick entries, profitable follow-through, up to 3 positions. Unverified performance."
#include <Trade/Trade.mqh>
input bool InpPauseNewOrders=false;
input double InpRequestedLots=0.12;
input bool InpFixedLots=true; // Exact requested volume; no automatic downsizing
input double InpMaxLots=0.12;
input int InpMaxPositions=3;
input bool InpUsePriceTarget=true; // Fixed price distance instead of fixed dollar payout
input double InpTargetPriceDistance=0.45; // XAU price units from entry, NOT points
input double InpProfitTargetUsd=5.50; // Used only when InpUsePriceTarget=false
input double InpBackupTpProfitUsd=6.00;
input double InpMaxLossPerTradeUsd=6.00; // Intended broker SL budget, NOT guaranteed loss
input double InpExitBeforeSLUsd=3.50; // Emergency close, no age delay
input double InpEstimatedExitFeesUsd=0.00;
input double InpEstimatedEntryFeesUsd=0.00; // For pre-trade SL budget
input double InpMaxSpreadPrice=0.35; // Absolute XAU quote units, NOT points
input int InpEntryIntervalMs=150; // Minimum request spacing; actual execution depends on broker
input int InpMaxEntriesPerMinute=60;
input int InpSignalWindowMs=300;
input double InpMinMovePrice=0.06;
input int InpSignalStableMs=100;
input bool InpExitOnReversal=false; // Optional; cash loss exit always active
input int InpLossGraceSeconds=20;
input int InpReversalStableMs=600;
input double InpReversalLossUsd=3.00;
input int InpMaxHoldSeconds=0; // 0 = no timed forced exit
input int InpDeviationPoints=50; // Slippage setting, NOT SL money
input ulong InpMagic=560179511; // Same ownership as v2; install when previous trades are flat
input bool InpShowStatus=true;
input double InpMinEntryStepPrice=0.08; // Fresh favorable quote move BETWEEN batches
input double InpMaxEntryCostFraction=0.35; // Used ONLY when InpFixedLots=false
input int InpLossCooldownMs=0; // Optional cooldown; zero keeps quote history after loss
input int InpTrendWindowMs=1200; // Slower confirmation; not a forecast
input double InpMinEfficiency=0.40; // Net displacement / total price travel
input double InpTrendSpreadFactor=0.75; // Slow move must exceed this fraction of spread
input bool InpFollowProfitableEntry=false; // Same-side addition requires latest trade in profit
input double InpFollowMinNetUsd=0.25; // Estimated net of latest same-side position, not basket P/L
input int InpBurstSize=3; // Up to 3 consecutive confirmed entries per signal opportunity
input int InpBurstMaxAgeMs=2000; // Cancel unfinished batch if signal is too old
CTrade aq;
int g_burstRemaining=0,g_burstDirection=0;
ulong g_burstStarted=0;
ulong g_waitEntryOrder=0,g_waitEntryDeal=0;
// Small bounded fee cache removes repeated history scans from the tick path.
ulong g_feeIds[8],g_feeTime[8];
double g_feeEntryVolume[8],g_feeCosts[8];
int g_feeNext=0;
ulong g_followTicket=0;
double g_followNet=0;
int g_lock=INVALID_HANDLE;
ulong g_closeTickets[3],g_closeOrders[3],g_closeNext[3];
bool g_closeUnknown[3];
ulong g_seenDeals[256];
int g_seenHead=0;
ulong g_lossUntil=0;
bool g_userPaused=false;
string g_button="AQ220_PAUSE";
bool TradeReady()
{
 return TerminalInfoInteger(TERMINAL_CONNECTED) && TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) &&
 MQLInfoInteger(MQL_TRADE_ALLOWED) && AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) &&
 AccountInfoInteger(ACCOUNT_TRADE_EXPERT);
}
bool SeenDeal(ulong id)
{
 for(int i=0;i<256;i++) if(g_seenDeals[i]==id) return true;
 g_seenDeals[g_seenHead]=id;g_seenHead=(g_seenHead+1)%256;return false;
}
void CancelBurst()
{
 g_burstRemaining=0;g_burstDirection=0;g_burstStarted=0;
}
void AfterLoss()
{
 CancelBurst();
 g_lossUntil=GetTickCount64()+(ulong)InpLossCooldownMs;
 if(InpLossCooldownMs>0) {g_samples=0;g_head=-1;g_signal=0;g_signalSince=0;}
}
bool CloseOrderPending(int slot)
{
 if(g_closeUnknown[slot]) return true;
 ulong order=g_closeOrders[slot];
 if(order==0) return false;
 if(OrderSelect(order)) return true;
 if(!HistoryOrderSelect(order)) return true;
 ENUM_ORDER_STATE st=(ENUM_ORDER_STATE)HistoryOrderGetInteger(order,ORDER_STATE);
 if(st==ORDER_STATE_FILLED || st==ORDER_STATE_CANCELED || st==ORDER_STATE_REJECTED || st==ORDER_STATE_EXPIRED)
 {g_closeOrders[slot]=0;return false;}
 return true;
}
int CloseSlot(ulong ticket)
{
 for(int i=0;i<3;i++) if(g_closeTickets[i]==ticket) return i;
 for(int i=0;i<3;i++) if(g_closeTickets[i]==0)
 {g_closeTickets[i]=ticket;return i;}
 return -1;
}

string g_status="Starting";
long g_times[4096];
double g_prices[4096],g_bids[4096],g_asks[4096];
double g_fastMove=0,g_slowMove=0,g_efficiency=0;
double g_lastEntryMid=0;
int g_lastEntryDirection=0;
int g_head=-1,g_samples=0,g_signal=0;
long g_tickTime=0,g_signalSince=0;
ulong g_quoteSeen=0,g_lastEntryAttempt=0;
long g_entryTimes[256];
int g_entryHead=0,g_entryN=0;
ulong g_inflight=0;
bool g_uncertain=false;
int g_log=INVALID_HANDLE;

bool DemoOnly()
{
   if(MQLInfoInteger(MQL_TESTER) != 0) return true;
   return ((ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO);
}

bool IsXau()
{
   return (StringFind(_Symbol,"XAU")>=0 || StringFind(_Symbol,"GOLD")>=0);
}

ulong MsNow() { return GetTickCount64(); }

double TickSize()
{
   double t=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   return (t>0.0?t:_Point);
}

double PriceUp(double x)
{
   double t=TickSize();
   return NormalizeDouble(MathCeil((x-1e-10)/t)*t,_Digits);
}

double PriceDown(double x)
{
   double t=TickSize();
   return NormalizeDouble(MathFloor((x+1e-10)/t)*t,_Digits);
}

double MinStops()
{
   return (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*_Point;
}

double MinVolume()
{
   return SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
}

double VolumeStep()
{
   double s=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   return s>0.0?s:0.01;
}

double FloorVolume(double volume)
{
   double lo=MinVolume();
   double hi=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   double s=VolumeStep();
   if(lo<=0.0 || hi<=0.0 || volume+1e-9<lo) return 0.0;
   volume=MathMin(volume,hi);
   double units=MathFloor((volume-lo+1e-9)/s);
   return NormalizeDouble(lo+units*s,8);
}

bool OwnPositionByIndex(int index)
{
   ulong ticket=PositionGetTicket(index);  // selects the position
   if(ticket==0) return false;
   return (PositionGetString(POSITION_SYMBOL)==_Symbol &&
           (ulong)PositionGetInteger(POSITION_MAGIC)==InpMagic);
}

bool OwnOrderByIndex(int index)
{
   ulong ticket=OrderGetTicket(index); // selects the pending order
   if(ticket==0) return false;
   return (OrderGetString(ORDER_SYMBOL)==_Symbol &&
           (ulong)OrderGetInteger(ORDER_MAGIC)==InpMagic);
}

int PositionCount()
{
   int result=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
      if(OwnPositionByIndex(i)) result++;
   return result;
}

int PendingCount()
{
   int result=0;
   for(int i=OrdersTotal()-1;i>=0;i--)
      if(OwnOrderByIndex(i)) result++;
   return result;
}


void Log(string event,ulong ticket,double value,string reason)
{
   PrintFormat("AQ2 %s #%I64u %.2f %s",event,ticket,value,reason);
   if(g_log!=INVALID_HANDLE)
   {
      FileWrite(g_log,TimeToString(TimeCurrent(),TIME_DATE|TIME_SECONDS),event,
                ticket,DoubleToString(value,2),reason);
      FileFlush(g_log);
   }
}
// All money settings are USD because non-USD accounts are rejected.
bool ProfitAt(ENUM_ORDER_TYPE side,double lots,double entry,double at,double &out)
{ return OrderCalcProfit(side,_Symbol,lots,entry,at,out); }

bool MoneyDistance(ENUM_ORDER_TYPE side,double lots,double entry,double money,bool gain,double &distance)
{
   double lo=0,hi=TickSize(),p=0;
   int direction=(side==ORDER_TYPE_BUY?1:-1)*(gain?1:-1);
   for(int i=0;i<40;i++)
   {
      double at=entry+direction*hi;
      if(at<=0 || !ProfitAt(side,lots,entry,at,p)) return false;
      if(MathAbs(p)>=money) break;
      hi*=2;
   }
   if(MathAbs(p)<money) return false;
   for(int i=0;i<40;i++)
   {
      double mid=(hi+lo)/2;
      if(!ProfitAt(side,lots,entry,entry+direction*mid,p)) return false;
      if(MathAbs(p)>=money) hi=mid; else lo=mid;
   }
   distance=hi;
   return true;
}

bool Levels(ENUM_ORDER_TYPE side,const MqlTick &q,double &v,double &sl,double &tp)
{
   double entry=side==ORDER_TYPE_BUY?q.ask:q.bid;
   double budget=InpMaxLossPerTradeUsd-InpEstimatedEntryFeesUsd-InpEstimatedExitFeesUsd;
   double minGap=MinStops()+2*TickSize();
   v=FloorVolume(MathMin(InpRequestedLots,InpMaxLots));
   if(InpFixedLots && MathAbs(v-InpRequestedLots)>0.00000001)
   {g_status="Fixed volume unsupported by broker or exceeds MaxLots";return false;}
   // Fixed mode never reduces the user's volume. Do not open a position which
   // spread/estimated fees alone would already force the software to close.
   while(v>=MinVolume() && v>0)
   {
      double mark=side==ORDER_TYPE_BUY?q.bid:q.ask,cost=0;
      if(!ProfitAt(side,v,entry,mark,cost)) return false;
      cost=MathMax(0.0,-cost)+InpEstimatedEntryFeesUsd+InpEstimatedExitFeesUsd;
      if(InpFixedLots)
      {
         if(cost>=InpExitBeforeSLUsd-0.000001)
         {g_status="Fixed lot: spread/fees already reach cash loss exit";return false;}
         break;
      }
      if(cost<=InpExitBeforeSLUsd*InpMaxEntryCostFraction+0.000001) break;
      v=FloorVolume(v-VolumeStep());
   }
   if(v<MinVolume() || v<=0)
   {g_status="Even minimum lot starts too near loss exit";return false;}
   while(v>=MinVolume() && v>0)
   {
      double d=0,p=0;
      if(!MoneyDistance(side,v,entry,budget,false,d)) return false;
      // Round TOWARD entry: never enlarge calculated risk to fit a price tick.
      sl=side==ORDER_TYPE_BUY?PriceUp(entry-d):PriceDown(entry+d);
      bool legal=side==ORDER_TYPE_BUY?(sl<=q.bid-minGap):(sl>=q.ask+minGap);
      if(legal && sl>0 && ProfitAt(side,v,entry,sl,p) && -p<=budget+0.00001) break;
      if(InpFixedLots) {g_status="Fixed lot cannot fit broker SL distance / cash budget";return false;}
      v=FloorVolume(v-VolumeStep());
   }
   if(v<MinVolume() || v<=0) {g_status="Minimum lot cannot fit SL budget / stops";return false;}
   double d=0;
   if(InpUsePriceTarget)
   {
      tp=side==ORDER_TYPE_BUY?PriceDown(entry+InpTargetPriceDistance):PriceUp(entry-InpTargetPriceDistance);
      bool legal=side==ORDER_TYPE_BUY?(tp>entry && tp>=q.bid+minGap):(tp<entry && tp<=q.ask-minGap);
      if(!legal) {g_status="Requested close TP cannot fit broker stops";return false;}
   }
   else
   {
      double target=MathMax(InpBackupTpProfitUsd,InpProfitTargetUsd)+InpEstimatedEntryFeesUsd+InpEstimatedExitFeesUsd;
      if(!MoneyDistance(side,v,entry,target,true,d)) return false;
      tp=side==ORDER_TYPE_BUY?PriceUp(MathMax(entry+d,q.bid+minGap)):
                              PriceDown(MathMin(entry-d,q.ask-minGap));
   }
   return tp>0;
}

// Experimental directional confirmation; no proprietary/video rules or profitability inferred.
void Observe(const MqlTick &q)
{
   if(q.time_msc<=g_tickTime) return;
   if(g_tickTime>0 && q.time_msc-g_tickTime>3000)
   {g_samples=0;g_head=-1;g_signal=0;g_signalSince=0;}
   g_tickTime=q.time_msc;g_quoteSeen=MsNow();
   int previous=g_head;
   g_head=(g_head+1)%4096;
   g_times[g_head]=q.time_msc;g_prices[g_head]=(q.ask+q.bid)*0.5;
   g_bids[g_head]=q.bid;g_asks[g_head]=q.ask;
   if(g_samples<4096) g_samples++;
   int fast=-1,slow=-1;double travel=0;
   for(int i=1;i<g_samples;i++)
   {
      int j=(g_head-i+4096)%4096, newer=(j+1)%4096;
      travel+=MathAbs(g_prices[newer]-g_prices[j]);
      long age=q.time_msc-g_times[j];
      if(fast<0 && age>=InpSignalWindowMs) fast=j;
      if(age>=InpTrendWindowMs) {slow=j;break;}
   }
   g_fastMove=0;g_slowMove=0;g_efficiency=0;
   int direction=0;
   if(fast>=0 && slow>=0 && q.time_msc-g_times[slow]<=InpTrendWindowMs+1000)
   {
      g_fastMove=g_prices[g_head]-g_prices[fast];
      g_slowMove=g_prices[g_head]-g_prices[slow];
      g_efficiency=travel>0?MathAbs(g_slowMove)/travel:0;
      double slowMinimum=MathMax(2*InpMinMovePrice,(q.ask-q.bid)*InpTrendSpreadFactor);
      double fastBid=q.bid-g_bids[fast],fastAsk=q.ask-g_asks[fast];
      double slowBid=q.bid-g_bids[slow],slowAsk=q.ask-g_asks[slow];
      double eps=TickSize()*0.001;
      double lastStep=previous>=0?g_prices[g_head]-g_prices[previous]:0;
      if(g_efficiency>=InpMinEfficiency)
      {
         if(fastBid+eps>=InpMinMovePrice && fastAsk+eps>=InpMinMovePrice &&
            slowBid+eps>=slowMinimum && slowAsk+eps>=slowMinimum && lastStep>=0) direction=1;
         else if(fastBid-eps<=-InpMinMovePrice && fastAsk-eps<=-InpMinMovePrice &&
            slowBid-eps<=-slowMinimum && slowAsk-eps<=-slowMinimum && lastStep<=0) direction=-1;
      }
   }
   if(direction!=g_signal) {g_signal=direction;g_signalSince=q.time_msc;}
}

void InvalidateFeeCache()
{
   for(int i=0;i<8;i++) g_feeIds[i]=0;
}
bool EntryFees(ulong id,double &inVolume,double &fees)
{
   ulong now=MsNow();
   int slot=-1;
   for(int i=0;i<8;i++) if(g_feeIds[i]==id) {slot=i;break;}
   if(slot>=0 && now-g_feeTime[slot]<1000)
   {inVolume=g_feeEntryVolume[slot];fees=g_feeCosts[slot];return true;}
   if(!HistorySelectByPosition(id)) return false;
   inVolume=0;fees=0;
   for(int i=0;i<HistoryDealsTotal();i++)
   {
      ulong d=HistoryDealGetTicket(i);
      if((ENUM_DEAL_ENTRY)HistoryDealGetInteger(d,DEAL_ENTRY)==DEAL_ENTRY_IN)
      {
         inVolume+=HistoryDealGetDouble(d,DEAL_VOLUME);
         fees+=HistoryDealGetDouble(d,DEAL_COMMISSION)+HistoryDealGetDouble(d,DEAL_FEE);
      }
   }
   if(inVolume<=0) return false; // Do not cache a position before entry history arrives.
   if(slot<0) {slot=g_feeNext;g_feeNext=(g_feeNext+1)%8;}
   g_feeIds[slot]=id;g_feeTime[slot]=now;g_feeEntryVolume[slot]=inVolume;g_feeCosts[slot]=fees;
   return true;
}
bool NetForSelected(double &net)
{
   ulong id=(ulong)PositionGetInteger(POSITION_IDENTIFIER);
   double floating=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
   double currentVolume=PositionGetDouble(POSITION_VOLUME),inVolume=0,fees=0;
   if(!EntryFees(id,inVolume,fees)) return false;
   net=floating+fees*MathMin(1.0,currentVolume/inVolume)-InpEstimatedExitFeesUsd;
   return true;
}

// Abort a stale decision if the local quote changes substantially while broker
// levels/margin are being calculated. This does not cap actual market slippage.
bool EntryQuoteStillCurrent(const MqlTick &decision,const MqlTick &live)
{
   if(live.bid<=0 || live.ask<live.bid || live.time_msc<decision.time_msc ||
      live.time_msc-decision.time_msc>250 || live.ask-live.bid>InpMaxSpreadPrice) return false;
   double limit=MathMax(TickSize(),InpMinMovePrice*0.5);
   return MathAbs(live.ask-decision.ask)<=limit && MathAbs(live.bid-decision.bid)<=limit;
}

// The newest SAME-SIDE position is the anchor. An older winner must not hide
// a newer loser. Opposite-side trades are independent (hedging demo account).
bool FollowEntryReady(int direction)
{
   g_followTicket=0;g_followNet=0;
   if(!InpFollowProfitableEntry) return true;
   long latest=-1;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      if(!OwnPositionByIndex(i)) continue;
      int side=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?1:-1;
      if(side!=direction) continue;
      long opened=PositionGetInteger(POSITION_TIME_MSC);
      ulong ticket=(ulong)PositionGetInteger(POSITION_TICKET);
      if(opened>latest || (opened==latest && ticket>g_followTicket))
      {latest=opened;g_followTicket=ticket;}
   }
   if(g_followTicket==0) return true; // First entry in this direction.
   if(!PositionSelectByTicket(g_followTicket)) return false; // Recheck on next pulse.
   if(!NetForSelected(g_followNet)) return false;
   return g_followNet>=InpFollowMinNetUsd;
}

bool ServerAccepted()
{
   uint r=aq.ResultRetcode();
   return r==TRADE_RETCODE_DONE || r==TRADE_RETCODE_DONE_PARTIAL || r==TRADE_RETCODE_PLACED;
}
void TrackRequest()
{
   if(aq.ResultRetcode()==TRADE_RETCODE_PLACED || aq.ResultRetcode()==TRADE_RETCODE_DONE_PARTIAL)
   {
      g_inflight=aq.ResultOrder();
      if(g_inflight==0) {g_uncertain=true;Log("UNCERTAIN",0,0,"Accepted request without order id; inspect account before reload");}
   }
   if(aq.ResultRetcode()==TRADE_RETCODE_TIMEOUT || aq.ResultRetcode()==TRADE_RETCODE_CONNECTION)
   {g_uncertain=true;Log("UNCERTAIN",aq.ResultOrder(),0,"Entry paused: inspect account then reload EA");}
}
bool InFlight()
{
   if(g_inflight==0) return false;
   if(OrderSelect(g_inflight)) return true;
   if(HistoryOrderSelect(g_inflight))
   {
      ENUM_ORDER_STATE s=(ENUM_ORDER_STATE)HistoryOrderGetInteger(g_inflight,ORDER_STATE);
      if(s==ORDER_STATE_FILLED || s==ORDER_STATE_CANCELED || s==ORDER_STATE_REJECTED || s==ORDER_STATE_EXPIRED)
      {g_inflight=0;return false;}
   }
   return true; // Unknown outcome: do not duplicate a possibly accepted request.
}

// Kept separate so the exact exit policy can be tested without a broker.
int ExitDecision(double sl,double raw,bool haveNet,double net,long age,int side,int signal,long signalAge,double target,bool priceMode)
{
   if(sl<=0) return 1;
   if(raw<=-InpExitBeforeSLUsd || (haveNet && net<=-InpExitBeforeSLUsd)) return 2;
   if(haveNet && net>0 && target>0 && (priceMode?raw:net)>=target) return 3;
   if(InpMaxHoldSeconds>0 && age>=((long)InpMaxHoldSeconds)*1000) return 4;
   if(InpExitOnReversal && haveNet && age>=((long)InpLossGraceSeconds)*1000 &&
      signal==-side && signalAge>=InpReversalStableMs && net<=-InpReversalLossUsd) return 5;
   return 0;
}
bool EntryStepOK(int direction,double mid)
{
   if(g_lastEntryDirection==0 || direction!=g_lastEntryDirection) return true;
   return direction*(mid-g_lastEntryMid)>=InpMinEntryStepPrice-0.0000001;
}

bool EntryPacingReady()
{
 return MsNow()-g_lastEntryAttempt>=(ulong)InpEntryIntervalMs;
}
void RefreshBurst()
{
 if(g_burstRemaining>0 && (g_signal!=g_burstDirection || MsNow()-g_burstStarted>(ulong)InpBurstMaxAgeMs)) CancelBurst();
}
bool BurstEntryReady(int direction,double mid)
{
 if(g_burstRemaining>0) return direction==g_burstDirection;
 return EntryStepOK(direction,mid); // Fresh favorable movement only between batches.
}
void StartBurst(int direction,int openCount)
{
 if(g_burstRemaining>0) return;
 g_burstRemaining=(int)MathMax(0,MathMin(InpBurstSize,InpMaxPositions-openCount));
 if(g_burstRemaining==0) {CancelBurst();return;}
 g_burstDirection=direction;g_burstStarted=MsNow();
}
void RememberBurstAcceptance(int direction,double mid)
{
 g_lastEntryDirection=direction;g_lastEntryMid=mid;
 if(g_burstRemaining>0) g_burstRemaining--;
}
// A broker acceptance is not a licence to count a position before it appears.
// Wait for the most recent accepted entry to be visible (or already closed),
// then send the next request. Never wait for its profit in default batch mode.
bool EntryFillPending()
{
 if(g_waitEntryOrder==0) return false;
 if(g_waitEntryDeal==0 && HistorySelect(TimeCurrent()-300,TimeCurrent()))
 {
   for(int i=HistoryDealsTotal()-1;i>=0;i--)
   {
     ulong d=HistoryDealGetTicket(i);
     if((ulong)HistoryDealGetInteger(d,DEAL_ORDER)==g_waitEntryOrder &&
        HistoryDealGetInteger(d,DEAL_ENTRY)==DEAL_ENTRY_IN)
     {g_waitEntryDeal=d;break;}
   }
 }
 if(g_waitEntryDeal==0 || !HistoryDealSelect(g_waitEntryDeal))
 {
   if(HistoryOrderSelect(g_waitEntryOrder))
   {
     ENUM_ORDER_STATE st=(ENUM_ORDER_STATE)HistoryOrderGetInteger(g_waitEntryOrder,ORDER_STATE);
     if(st==ORDER_STATE_CANCELED || st==ORDER_STATE_REJECTED || st==ORDER_STATE_EXPIRED)
     {g_waitEntryOrder=0;g_waitEntryDeal=0;CancelBurst();return false;}
   }
   return true;
 }
 ulong id=(ulong)HistoryDealGetInteger(g_waitEntryDeal,DEAL_POSITION_ID);
 for(int i=PositionsTotal()-1;i>=0;i--)
 {
   if(OwnPositionByIndex(i) && (ulong)PositionGetInteger(POSITION_IDENTIFIER)==id)
   {g_waitEntryOrder=0;g_waitEntryDeal=0;return false;}
 }
 if(HistorySelectByPosition(id))
 {
   for(int i=0;i<HistoryDealsTotal();i++)
   {
     ulong d=HistoryDealGetTicket(i);
     long e=HistoryDealGetInteger(d,DEAL_ENTRY);
     if(e==DEAL_ENTRY_OUT || e==DEAL_ENTRY_OUT_BY)
     {g_waitEntryOrder=0;g_waitEntryDeal=0;CancelBurst();return false;}
   }
 }
 return true;
}

bool Manage(const MqlTick &q)
{
 bool closing=false;
 for(int k=0;k<3;k++)
 {
   if(g_closeTickets[k]==0) continue;
   if(!PositionSelectByTicket(g_closeTickets[k]))
   {g_closeTickets[k]=0;g_closeOrders[k]=0;g_closeNext[k]=0;g_closeUnknown[k]=false;}
   else closing=true; // A requested exit stays latched even if price recovers.
 }
 // Snapshot tickets: a synchronous close can change position enumeration.
 ulong tickets[]; int count=0;
 for(int i=PositionsTotal()-1;i>=0;i--)
   if(OwnPositionByIndex(i)) {ArrayResize(tickets,count+1);tickets[count++]=(ulong)PositionGetInteger(POSITION_TICKET);}
 for(int i=0;i<count;i++)
 {
   ulong ticket=tickets[i];
   if(!PositionSelectByTicket(ticket)) continue;
   long age=q.time_msc-PositionGetInteger(POSITION_TIME_MSC);
   int side=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?1:-1;
   double raw=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
   double sl=PositionGetDouble(POSITION_SL),net=0;
   bool haveNet=NetForSelected(net);
   double target=InpProfitTargetUsd;
   if(InpUsePriceTarget)
   {
      double entry=PositionGetDouble(POSITION_PRICE_OPEN),volume=PositionGetDouble(POSITION_VOLUME);
      if(!ProfitAt(side==1?ORDER_TYPE_BUY:ORDER_TYPE_SELL,volume,entry,entry+side*InpTargetPriceDistance,target)) target=0;
   }
   int decision=ExitDecision(sl,raw,haveNet,net,age,side,g_signal,q.time_msc-g_signalSince,target,InpUsePriceTarget);
   int slot=-1;
   for(int k=0;k<3;k++) if(g_closeTickets[k]==ticket) slot=k;
   if(decision==0 && slot<0) continue;
   closing=true;
   if(slot<0) slot=CloseSlot(ticket);
   if(slot<0 || !TradeReady()) continue;
   if(CloseOrderPending(slot) || MsNow()<g_closeNext[slot]) continue;
   g_closeNext[slot]=MsNow()+250;
   bool ok=aq.PositionClose(ticket,(ulong)InpDeviationPoints);
   uint rc=aq.ResultRetcode();
   if(rc==TRADE_RETCODE_PLACED || rc==TRADE_RETCODE_DONE_PARTIAL)
   {g_closeOrders[slot]=aq.ResultOrder();if(g_closeOrders[slot]==0) g_closeUnknown[slot]=true;}
   if(rc==TRADE_RETCODE_TIMEOUT || rc==TRADE_RETCODE_CONNECTION || rc==TRADE_RETCODE_CLOSE_ORDER_EXIST)
      g_closeUnknown[slot]=true; // Never duplicate a close with an unknown outcome.
   if(rc==TRADE_RETCODE_FROZEN || rc==TRADE_RETCODE_TOO_MANY_REQUESTS) g_closeNext[slot]=MsNow()+1000;
   string event=ok && ServerAccepted()?"CLOSE_ACCEPTED":"CLOSE_FAILED";
   if(rc==TRADE_RETCODE_POSITION_CLOSED) event="CLOSE_ALREADY_DONE";
   Log(event,ticket,haveNet?net:raw,"decision="+IntegerToString(decision)+
       " retcode="+IntegerToString((int)rc)+" order="+IntegerToString((long)aq.ResultOrder())+
       " | "+aq.ResultRetcodeDescription());
   if(g_closeUnknown[slot]) Log("CLOSE_UNCERTAIN",ticket,0,"Inspect account before reload; broker SL remains");
 }
 return closing;
}

int RecentEntries(long now)
{
   int n=0;
   for(int i=0;i<g_entryN;i++) if(now-g_entryTimes[i]<60000) n++;
   return n;
}
void RememberEntry(long now)
{
   g_entryTimes[g_entryHead]=now;g_entryHead=(g_entryHead+1)%256;
   if(g_entryN<256) g_entryN++;
}
void RestoreEntryTimes()
{
   if(!HistorySelect(TimeCurrent()-60,TimeCurrent())) return;
   // Count orders rather than partial-fill deals.
   ulong lastOrder=0;
   for(int i=0;i<HistoryDealsTotal();i++)
   {
      ulong d=HistoryDealGetTicket(i);
      if(HistoryDealGetString(d,DEAL_SYMBOL)!=_Symbol ||
         (ulong)HistoryDealGetInteger(d,DEAL_MAGIC)!=InpMagic ||
         HistoryDealGetInteger(d,DEAL_ENTRY)!=DEAL_ENTRY_IN) continue;
      ulong order=(ulong)HistoryDealGetInteger(d,DEAL_ORDER);
      if(order!=lastOrder) RememberEntry(HistoryDealGetInteger(d,DEAL_TIME_MSC));
      lastOrder=order;
   }
}
void CancelLegacyPending()
{
   // Same magic preserves management of v1 positions while retiring its STOP pair.
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      if(!OwnOrderByIndex(i)) continue;
      ENUM_ORDER_TYPE t=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      if(t!=ORDER_TYPE_BUY_STOP && t!=ORDER_TYPE_SELL_STOP &&
         t!=ORDER_TYPE_BUY_LIMIT && t!=ORDER_TYPE_SELL_LIMIT) continue;
      ulong ticket=(ulong)OrderGetInteger(ORDER_TICKET);
      bool ok=aq.OrderDelete(ticket);
      if(!ok || !ServerAccepted()) Log("CANCEL_FAILED",ticket,0,aq.ResultRetcodeDescription());
   }
}
void Pulse()
{
   MqlTick q;
   if(!SymbolInfoTick(_Symbol,q) || q.bid<=0 || q.ask<q.bid) return;
   Observe(q);RefreshBurst();
   bool closing=Manage(q);
   if(closing) CancelBurst(); // Exits precede spread, pause and entry restrictions.
   double spread=q.ask-q.bid;
   if(!TradeReady()) g_status="WARNING: Algo/connection unavailable - software exits cannot run";
   else if(closing) g_status="Exit pending: see Experts log; entries paused";
   else if(InFlight()) g_status="Waiting for server order outcome";
   else if(EntryFillPending()) g_status="Waiting for last entry fill confirmation";
   else if(g_uncertain) g_status="Uncertain request: inspect account then reload EA";
   else if(InpPauseNewOrders || g_userPaused) g_status="Paused: managing existing trades";
   else if(!TerminalInfoInteger(TERMINAL_CONNECTED) || !TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ||
           !MQLInfoInteger(MQL_TRADE_ALLOWED) || !AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) ||
           !AccountInfoInteger(ACCOUNT_TRADE_EXPERT)) g_status="Check connection / Algo Trading";
   else if(MsNow()<g_lossUntil) g_status="Loss cooldown: collecting a fresh signal";
   else if(PendingCount()>0) {CancelLegacyPending();g_status="Clearing old outstanding orders";}
   else if(PositionCount()>=InpMaxPositions) g_status="Managing open positions";
   else if(spread>InpMaxSpreadPrice) g_status="Spread exceeds entry setting";
   else if(g_quoteSeen==0 || MsNow()-g_quoteSeen>2000 || TimeCurrent()-q.time>2) g_status="Waiting for fresh quotes";
   else if(RecentEntries(q.time_msc)>=InpMaxEntriesPerMinute) g_status="Rolling minute entry cap";
   else if(g_signal==0 || q.time_msc-g_signalSince<InpSignalStableMs) g_status="Waiting for fast/slow direction agreement";
   else if(!FollowEntryReady(g_signal)) g_status="Follow entry: waiting for newest same-side trade profit";
   else if(!BurstEntryReady(g_signal,(q.ask+q.bid)*0.5)) g_status="Waiting for fresh entry movement";
   else if(!EntryPacingReady()) g_status="Entry pacing";
   else
   {
      ENUM_ORDER_TYPE side=g_signal>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL;
      double v=0,sl=0,tp=0,margin=0,entry=side==ORDER_TYPE_BUY?q.ask:q.bid;
      g_status="Calculating broker levels";
      if(Levels(side,q,v,sl,tp))
      {
         if(!OrderCalcMargin(side,_Symbol,v,entry,margin) || margin>AccountInfoDouble(ACCOUNT_MARGIN_FREE))
            g_status="Insufficient margin";
         else
         {
            MqlTick live;
            if(!SymbolInfoTick(_Symbol,live) || !EntryQuoteStillCurrent(q,live))
            {g_status="Quote moved during preparation; re-evaluating next event";return;}
            StartBurst(g_signal,PositionCount());
            g_lastEntryAttempt=MsNow();
            ulong requestStarted=MsNow();
            bool ok=aq.PositionOpen(_Symbol,side,v,entry,sl,tp,"AQ3 Fast Follow DEMO");
            ulong requestMs=MsNow()-requestStarted;
            TrackRequest();
            if(ok && ServerAccepted())
            {
               RememberEntry(q.time_msc);
               g_waitEntryOrder=aq.ResultOrder();g_waitEntryDeal=aq.ResultDeal();
               if(g_waitEntryOrder==0) g_uncertain=true;
               RememberBurstAcceptance(g_signal,(q.ask+q.bid)*0.5);
               g_status="Entry accepted; checking execution";
               Log("ENTRY_ACCEPTED",aq.ResultOrder(),v,(g_signal>0?"BUY":"SELL")+
                   " batch_remaining="+IntegerToString(g_burstRemaining)+
                   " request_ms="+IntegerToString((long)requestMs)+
                   " bid="+DoubleToString(q.bid,_Digits)+" ask="+DoubleToString(q.ask,_Digits)+
                   " fast="+DoubleToString(g_fastMove,4)+" slow="+DoubleToString(g_slowMove,4)+
                   " efficiency="+DoubleToString(g_efficiency,3)+
                   " follow_ticket="+IntegerToString((long)g_followTicket)+
                   " follow_net="+DoubleToString(g_followNet,2)+
                   " quote_ms="+IntegerToString(q.time_msc)+
                   " sl="+DoubleToString(sl,_Digits)+" tp="+DoubleToString(tp,_Digits));
            }
            else {g_status="Entry rejected: "+aq.ResultRetcodeDescription();Log("ENTRY_FAILED",0,v,g_status);}
         }
      }
   }
   if(InpShowStatus)
      Comment("AL-QANNAS FAST FOLLOW v3.10 | DEMO ONLY\n",g_status,
              "\nOpen ",PositionCount(),"/",InpMaxPositions," | Spread ",DoubleToString(spread,3),
              "\nTarget ",(InpUsePriceTarget?DoubleToString(InpTargetPriceDistance,3)+" price units":DoubleToString(InpProfitTargetUsd,2)+" USD")," | SL budget/trade $",DoubleToString(InpMaxLossPerTradeUsd,2),
              "\nCash exit -$",DoubleToString(InpExitBeforeSLUsd,2)," | Requested lot ",DoubleToString(InpRequestedLots,2),
              "\nFast/slow ",DoubleToString(g_fastMove,3)," / ",DoubleToString(g_slowMove,3),
              " | Efficiency ",DoubleToString(g_efficiency,2),
              "\nBatch remaining ",g_burstRemaining," | Wait-profit ",(InpFollowProfitableEntry?"ON":"OFF")," | Anchor #",g_followTicket,
              " net $",DoubleToString(g_followNet,2),
              "\nLots mode ",(InpFixedLots?"FIXED":"ADAPTIVE")," | No daily loss lock | Experimental");
}
void OnTick(){Pulse();}
void OnTimer(){Pulse();}
void OnTradeTransaction(const MqlTradeTransaction &t,const MqlTradeRequest &r,const MqlTradeResult &res)
{
   if(t.type!=TRADE_TRANSACTION_DEAL_ADD || !HistoryDealSelect(t.deal)) return;
   if(HistoryDealGetString(t.deal,DEAL_SYMBOL)!=_Symbol ||
      (ulong)HistoryDealGetInteger(t.deal,DEAL_MAGIC)!=InpMagic) return;
   if(SeenDeal(t.deal)) return;
   InvalidateFeeCache();
   double pnl=HistoryDealGetDouble(t.deal,DEAL_PROFIT)+HistoryDealGetDouble(t.deal,DEAL_COMMISSION)+
              HistoryDealGetDouble(t.deal,DEAL_SWAP)+HistoryDealGetDouble(t.deal,DEAL_FEE);
   long entryKind=HistoryDealGetInteger(t.deal,DEAL_ENTRY);
   if((entryKind==DEAL_ENTRY_OUT || entryKind==DEAL_ENTRY_OUT_BY || entryKind==DEAL_ENTRY_INOUT) && pnl<0) AfterLoss();
   Log("DEAL",t.deal,pnl,"position="+IntegerToString(HistoryDealGetInteger(t.deal,DEAL_POSITION_ID))+" "+"entry="+IntegerToString((int)HistoryDealGetInteger(t.deal,DEAL_ENTRY))+
       " reason="+IntegerToString((int)HistoryDealGetInteger(t.deal,DEAL_REASON))+
       " fill="+DoubleToString(HistoryDealGetDouble(t.deal,DEAL_PRICE),_Digits)+
       " volume="+DoubleToString(HistoryDealGetDouble(t.deal,DEAL_VOLUME),2)+
       " deal_ms="+IntegerToString(HistoryDealGetInteger(t.deal,DEAL_TIME_MSC)));
}
int OnInit()
{
   if(!DemoOnly() || AccountInfoString(ACCOUNT_CURRENCY)!="USD" || !IsXau() || _Period!=PERIOD_M1 ||
      AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
   {Print("AQ2 requires DEMO USD HEDGING, XAU/GOLD M1 (including broker suffix)");return INIT_FAILED;}
   if(InpBurstSize<1 || InpBurstSize>3 || InpBurstMaxAgeMs<300 || InpBurstMaxAgeMs>10000 || (InpFixedLots && InpRequestedLots>InpMaxLots) || InpFollowMinNetUsd<=0 || InpTrendWindowMs<=InpSignalWindowMs || InpTrendWindowMs>10000 ||
      InpMinEfficiency<=0 || InpMinEfficiency>1 || InpTrendSpreadFactor<0 || InpLossCooldownMs<0 || InpLossCooldownMs>60000 || InpRequestedLots<=0 || InpMaxLots<=0 || InpMaxPositions<1 || InpMaxPositions>3 ||
      InpTargetPriceDistance<TickSize() || InpProfitTargetUsd<=0 || InpBackupTpProfitUsd<InpProfitTargetUsd ||
      InpMaxLossPerTradeUsd<=0 || InpExitBeforeSLUsd<=0 || InpExitBeforeSLUsd>InpMaxLossPerTradeUsd ||
      InpEstimatedExitFeesUsd<0 || InpEstimatedEntryFeesUsd<0 ||
      InpMaxLossPerTradeUsd<=InpEstimatedEntryFeesUsd+InpEstimatedExitFeesUsd ||
      InpMinEntryStepPrice<0 || InpMaxEntryCostFraction<=0 || InpMaxEntryCostFraction>=1 ||
      InpMaxSpreadPrice<=0 || InpEntryIntervalMs<100 || InpMaxEntriesPerMinute<1 || InpMaxEntriesPerMinute>120 ||
      InpSignalWindowMs<100 || InpSignalWindowMs>2000 || InpMinMovePrice<=0 || InpSignalStableMs<0 ||
      InpLossGraceSeconds<0 || InpReversalStableMs<0 || InpReversalLossUsd<=0 || InpMaxHoldSeconds<0 || InpDeviationPoints<0)
      return INIT_PARAMETERS_INCORRECT;
   // Exclusive file handle: prevents two v2.20+ instances in this terminal.
   // Older EAs do not use this lock and MUST be removed manually while flat.
   string lockName="AQ220_"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+"_"+_Symbol+"_"+IntegerToString((long)InpMagic)+".lock";
   g_lock=FileOpen(lockName,FILE_READ|FILE_WRITE|FILE_BIN);
   if(g_lock==INVALID_HANDLE) {Print("AQ220: another instance or lock file error");return INIT_FAILED;}
   aq.SetExpertMagicNumber(InpMagic);aq.SetDeviationInPoints(InpDeviationPoints);
   aq.SetAsyncMode(false);aq.SetTypeFillingBySymbol(_Symbol);
   RestoreEntryTimes();CancelLegacyPending();
   g_log=FileOpen("AlQannas_FastFollow_310_"+_Symbol+"_"+IntegerToString((long)InpMagic)+".csv",
                  FILE_READ|FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_SHARE_READ,',');
   if(g_log!=INVALID_HANDLE) {FileSeek(g_log,0,SEEK_END);}
   if(!EventSetMillisecondTimer(50)) return INIT_FAILED;
   ObjectCreate(0,g_button,OBJ_BUTTON,0,0,0);
   ObjectSetInteger(0,g_button,OBJPROP_XDISTANCE,10);
   ObjectSetInteger(0,g_button,OBJPROP_YDISTANCE,160);
   ObjectSetInteger(0,g_button,OBJPROP_XSIZE,210);
   ObjectSetInteger(0,g_button,OBJPROP_YSIZE,26);
   ObjectSetString(0,g_button,OBJPROP_TEXT,"Pause NEW entries only");
   Log("START",0,0,"v3.10 BATCH3 FIXED LOTS DEFAULT: fast=300ms slow=1200ms hold=100ms request spacing=150ms; TP 0.45 / cash exit 3.50 / broker SL 6; DEMO unverified");
   return INIT_SUCCEEDED;
}
void OnChartEvent(const int id,const long &lparam,const double &dparam,const string &sparam)
{
 if(id==CHARTEVENT_OBJECT_CLICK && sparam==g_button)
 {
   g_userPaused=!g_userPaused;
   ObjectSetInteger(0,g_button,OBJPROP_STATE,false);
   ObjectSetString(0,g_button,OBJPROP_TEXT,g_userPaused?"Resume NEW entries":"Pause NEW entries only");
 }
}
void OnDeinit(const int reason)
{
   EventKillTimer();
   if(g_lock!=INVALID_HANDLE) {FileClose(g_lock);ObjectDelete(0,g_button);}
   if(g_log!=INVALID_HANDLE) FileClose(g_log);
   Comment(""); // Existing broker SL/TP remain; software exits require the EA online.
}
