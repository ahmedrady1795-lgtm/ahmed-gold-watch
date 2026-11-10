// INSTALL: remove v2.00 only when its positions/orders are flat. Attach this EA to one XAU M1 demo chart.
// Inputs: click Reset. Do NOT load v2.00 QuickDollar/VideoApprox presets; they restore old loss settings.
// Same magic as v2.00: if installed with open old trades, NEW cash exits immediately apply to them;
// existing broker SL/TP are not rewritten. This is why a flat migration is required.
// LOCAL VALIDATION: extracted C++ adapter tests: 384 modeled risk cases, signal,
// cash exits, loss reset, deal dedup and per-ticket close-order state. NOT MT5 runtime tests.
// v2.20: loss reset + 2s cooldown, latched per-ticket exits, pause-entry button,
// duplicate-instance lock (v2.20 only, within terminal), numeric request logging.
// Unknown close outcomes pause entries and that ticket's retries until reconciled/reloaded.
// This version does not establish improved strategy accuracy or profitable expectancy.
// No MetaEditor/EX5 in this environment. Compile F7 and forward-test on DEMO. No profit guarantee.
// Al-Qannas Video Chaser v2.20: behavioral approximation, NOT original video algorithm.
// DEMO USD HEDGING ONLY. Local MT5 EA; no Render, DLL or WebRequest required.
// Derived from the user's QuickDollar v1.00 utility functions.
#property strict
#property version "2.20"
#property description "DEMO: up to 3 independent tick-momentum scalps; video-inspired, unverified performance."
#include <Trade/Trade.mqh>
input bool InpPauseNewOrders=false;
input double InpRequestedLots=0.12;
input double InpMaxLots=0.12;
input int InpMaxPositions=3;
input double InpProfitTargetUsd=5.50; // Experimental target from visible video payout range
input double InpBackupTpProfitUsd=6.00;
input double InpMaxLossPerTradeUsd=6.00; // Intended broker SL budget, NOT guaranteed loss
input double InpExitBeforeSLUsd=3.50; // Emergency close, no age delay
input double InpEstimatedExitFeesUsd=0.00;
input double InpEstimatedEntryFeesUsd=0.00; // For pre-trade SL budget
input double InpMaxSpreadPrice=0.35; // Absolute XAU quote units, NOT points
input int InpEntryIntervalMs=750;
input int InpMaxEntriesPerMinute=60;
input int InpSignalWindowMs=800;
input double InpMinMovePrice=0.06;
input int InpSignalStableMs=200;
input bool InpExitOnReversal=false; // Optional; cash loss exit always active
input int InpLossGraceSeconds=20;
input int InpReversalStableMs=600;
input double InpReversalLossUsd=3.00;
input int InpMaxHoldSeconds=0; // 0 = no timed forced exit
input int InpDeviationPoints=50; // Slippage setting, NOT SL money
input ulong InpMagic=560179511; // Same ownership as v2; install when previous trades are flat
input bool InpShowStatus=true;
input double InpMinEntryStepPrice=0.08; // Require a new favorable quote move before same-side repeat
input double InpMaxEntryCostFraction=0.60; // Downsize lot if spread/estimated fees consume loss allowance
input int InpLossCooldownMs=2000; // Fresh signal required after any losing exit
CTrade aq;
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
void AfterLoss()
{
 g_lossUntil=GetTickCount64()+(ulong)InpLossCooldownMs;
 g_samples=0;g_head=-1;g_signal=0;g_signalSince=0;
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
long g_times[512];
double g_prices[512],g_bids[512],g_asks[512];
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
   // Never open a position already near its software loss exit because of spread.
   // Reduce volume instead of expanding the loss threshold or forcing a fill.
   while(v>=MinVolume() && v>0)
   {
      double mark=side==ORDER_TYPE_BUY?q.bid:q.ask,cost=0;
      if(!ProfitAt(side,v,entry,mark,cost)) return false;
      cost=MathMax(0.0,-cost)+InpEstimatedEntryFeesUsd+InpEstimatedExitFeesUsd;
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
      v=FloorVolume(v-VolumeStep());
   }
   if(v<MinVolume() || v<=0) {g_status="Minimum lot cannot fit SL budget / stops";return false;}
   double d=0;
   double target=MathMax(InpBackupTpProfitUsd,InpProfitTargetUsd)+InpEstimatedEntryFeesUsd+InpEstimatedExitFeesUsd;
   if(!MoneyDistance(side,v,entry,target,true,d)) return false;
   tp=side==ORDER_TYPE_BUY?PriceUp(MathMax(entry+d,q.bid+minGap)):
                           PriceDown(MathMin(entry-d,q.ask-minGap));
   return tp>0;
}

// A tick-based momentum estimate is an IMPLEMENTATION CHOICE, not inferred AI.
void Observe(const MqlTick &q)
{
   if(q.time_msc<=g_tickTime) return;
   if(g_tickTime>0 && q.time_msc-g_tickTime>3000)
   {g_samples=0;g_head=-1;g_signal=0;g_signalSince=0;}
   g_tickTime=q.time_msc;g_quoteSeen=MsNow();
   g_head=(g_head+1)%512;
   g_times[g_head]=q.time_msc;g_prices[g_head]=(q.ask+q.bid)*0.5;
   g_bids[g_head]=q.bid;g_asks[g_head]=q.ask;
   if(g_samples<512) g_samples++;
   int ref=-1;
   for(int i=1;i<g_samples;i++)
   {
      int j=(g_head-i+512)%512;
      if(q.time_msc-g_times[j]>=InpSignalWindowMs) {ref=j;break;}
   }
   int direction=0;
   if(ref>=0)
   {
      double move=g_prices[g_head]-g_prices[ref];
      double bidMove=q.bid-g_bids[ref],askMove=q.ask-g_asks[ref];
      // A spread expansion/contraction alone must not look like directional momentum.
      if(move>=InpMinMovePrice && bidMove>=InpMinMovePrice && askMove>=InpMinMovePrice) direction=1;
      else if(move<=-InpMinMovePrice && bidMove<=-InpMinMovePrice && askMove<=-InpMinMovePrice) direction=-1;
   }
   if(direction!=g_signal)
   {g_signal=direction;g_signalSince=q.time_msc;}
}

bool NetForSelected(double &net)
{
   ulong id=(ulong)PositionGetInteger(POSITION_IDENTIFIER);
   double floating=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
   double currentVolume=PositionGetDouble(POSITION_VOLUME),inVolume=0,fees=0;
   if(!HistorySelectByPosition(id)) return false;
   for(int i=0;i<HistoryDealsTotal();i++)
   {
      ulong d=HistoryDealGetTicket(i);
      if((ENUM_DEAL_ENTRY)HistoryDealGetInteger(d,DEAL_ENTRY)==DEAL_ENTRY_IN)
      {
         fees+=HistoryDealGetDouble(d,DEAL_COMMISSION)+HistoryDealGetDouble(d,DEAL_FEE);
         inVolume+=HistoryDealGetDouble(d,DEAL_VOLUME);
      }
   }
   if(inVolume<=0) return false;
   // Allocate entry fees to the remaining volume after a partial close.
   net=floating+fees*MathMin(1.0,currentVolume/inVolume)-InpEstimatedExitFeesUsd;
   return true;
}

bool ServerAccepted()
{
   uint r=aq.ResultRetcode();
   return r==TRADE_RETCODE_DONE || r==TRADE_RETCODE_DONE_PARTIAL || r==TRADE_RETCODE_PLACED;
}
void TrackRequest()
{
   if(aq.ResultRetcode()==TRADE_RETCODE_PLACED || aq.ResultRetcode()==TRADE_RETCODE_DONE_PARTIAL)
      g_inflight=aq.ResultOrder();
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
int ExitDecision(double sl,double raw,bool haveNet,double net,long age,int side,int signal,long signalAge)
{
   if(sl<=0) return 1;
   if(raw<=-InpExitBeforeSLUsd || (haveNet && net<=-InpExitBeforeSLUsd)) return 2;
   if(haveNet && net>=InpProfitTargetUsd) return 3;
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
   int decision=ExitDecision(sl,raw,haveNet,net,age,side,g_signal,q.time_msc-g_signalSince);
   int slot=-1;
   for(int k=0;k<3;k++) if(g_closeTickets[k]==ticket) slot=k;
   if(decision==0 && slot<0) continue;
   closing=true;
   if(slot<0) slot=CloseSlot(ticket);
   if(slot<0 || !TradeReady()) continue;
   if(CloseOrderPending(slot) || MsNow()<g_closeNext[slot]) continue;
   g_closeNext[slot]=MsNow()+500;
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
   Observe(q);
   bool closing=Manage(q); // Exits precede spread, pause and entry restrictions.
   double spread=q.ask-q.bid;
   if(!TradeReady()) g_status="WARNING: Algo/connection unavailable - software exits cannot run";
   else if(closing) g_status="Exit pending: see Experts log; entries paused";
   else if(InFlight()) g_status="Waiting for server order outcome";
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
   else if(g_signal==0 || q.time_msc-g_signalSince<InpSignalStableMs) g_status="Waiting for tick movement";
   else if(!EntryStepOK(g_signal,(q.ask+q.bid)*0.5)) g_status="Waiting for fresh entry movement";
   else if(MsNow()-g_lastEntryAttempt<(ulong)InpEntryIntervalMs) g_status="Entry pacing";
   else
   {
      g_lastEntryAttempt=MsNow();
      ENUM_ORDER_TYPE side=g_signal>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL;
      double v=0,sl=0,tp=0,margin=0,entry=side==ORDER_TYPE_BUY?q.ask:q.bid;
      g_status="Calculating broker levels";
      if(Levels(side,q,v,sl,tp))
      {
         if(!OrderCalcMargin(side,_Symbol,v,entry,margin) || margin>AccountInfoDouble(ACCOUNT_MARGIN_FREE))
            g_status="Insufficient margin";
         else
         {
            bool ok=aq.PositionOpen(_Symbol,side,v,entry,sl,tp,"AQ2 Video Chaser DEMO");
            TrackRequest();
            if(ok && ServerAccepted())
            {
               RememberEntry(q.time_msc);
               g_lastEntryMid=(q.ask+q.bid)*0.5;g_lastEntryDirection=g_signal;
               g_status="Entry accepted; checking execution";
               Log("ENTRY_ACCEPTED",aq.ResultOrder(),v,(g_signal>0?"BUY":"SELL"));
            }
            else {g_status="Entry rejected: "+aq.ResultRetcodeDescription();Log("ENTRY_FAILED",0,v,g_status);}
         }
      }
   }
   if(InpShowStatus)
      Comment("AL-QANNAS VIDEO CHASER v2.20 | DEMO ONLY\n",g_status,
              "\nOpen ",PositionCount(),"/",InpMaxPositions," | Spread ",DoubleToString(spread,3),
              "\nTarget $",DoubleToString(InpProfitTargetUsd,2)," | SL budget/trade $",DoubleToString(InpMaxLossPerTradeUsd,2),
              "\nCash exit -$",DoubleToString(InpExitBeforeSLUsd,2)," | Requested lot ",DoubleToString(InpRequestedLots,2),
              "\nCost-adjusted lots | No daily loss lock | Experimental");
}
void OnTick(){Pulse();}
void OnTimer(){Pulse();}
void OnTradeTransaction(const MqlTradeTransaction &t,const MqlTradeRequest &r,const MqlTradeResult &res)
{
   if(t.type!=TRADE_TRANSACTION_DEAL_ADD || !HistoryDealSelect(t.deal)) return;
   if(HistoryDealGetString(t.deal,DEAL_SYMBOL)!=_Symbol ||
      (ulong)HistoryDealGetInteger(t.deal,DEAL_MAGIC)!=InpMagic) return;
   if(SeenDeal(t.deal)) return;
   double pnl=HistoryDealGetDouble(t.deal,DEAL_PROFIT)+HistoryDealGetDouble(t.deal,DEAL_COMMISSION)+
              HistoryDealGetDouble(t.deal,DEAL_SWAP)+HistoryDealGetDouble(t.deal,DEAL_FEE);
   long entryKind=HistoryDealGetInteger(t.deal,DEAL_ENTRY);
   if((entryKind==DEAL_ENTRY_OUT || entryKind==DEAL_ENTRY_OUT_BY || entryKind==DEAL_ENTRY_INOUT) && pnl<0) AfterLoss();
   Log("DEAL",t.deal,pnl,"position="+IntegerToString(HistoryDealGetInteger(t.deal,DEAL_POSITION_ID))+" "+"entry="+IntegerToString((int)HistoryDealGetInteger(t.deal,DEAL_ENTRY))+
       " reason="+IntegerToString((int)HistoryDealGetInteger(t.deal,DEAL_REASON)));
}
int OnInit()
{
   if(!DemoOnly() || AccountInfoString(ACCOUNT_CURRENCY)!="USD" || !IsXau() || _Period!=PERIOD_M1 ||
      AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
   {Print("AQ2 requires DEMO USD HEDGING, XAU/GOLD M1 (including broker suffix)");return INIT_FAILED;}
   if(InpLossCooldownMs<0 || InpLossCooldownMs>60000 || InpRequestedLots<=0 || InpMaxLots<=0 || InpMaxPositions<1 || InpMaxPositions>3 ||
      InpProfitTargetUsd<=0 || InpBackupTpProfitUsd<InpProfitTargetUsd ||
      InpMaxLossPerTradeUsd<=0 || InpExitBeforeSLUsd<=0 || InpExitBeforeSLUsd>InpMaxLossPerTradeUsd ||
      InpEstimatedExitFeesUsd<0 || InpEstimatedEntryFeesUsd<0 ||
      InpMaxLossPerTradeUsd<=InpEstimatedEntryFeesUsd+InpEstimatedExitFeesUsd ||
      InpMinEntryStepPrice<0 || InpMaxEntryCostFraction<=0 || InpMaxEntryCostFraction>=1 ||
      InpMaxSpreadPrice<=0 || InpEntryIntervalMs<250 || InpMaxEntriesPerMinute<1 || InpMaxEntriesPerMinute>120 ||
      InpSignalWindowMs<100 || InpSignalWindowMs>2000 || InpMinMovePrice<=0 || InpSignalStableMs<0 ||
      InpLossGraceSeconds<0 || InpReversalStableMs<0 || InpReversalLossUsd<=0 || InpMaxHoldSeconds<0 || InpDeviationPoints<0)
      return INIT_PARAMETERS_INCORRECT;
   // Exclusive file handle: prevents two v2.20 instances in this terminal.
   // Older EAs do not use this lock and MUST be removed manually while flat.
   string lockName="AQ220_"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+"_"+_Symbol+"_"+IntegerToString((long)InpMagic)+".lock";
   g_lock=FileOpen(lockName,FILE_READ|FILE_WRITE|FILE_BIN);
   if(g_lock==INVALID_HANDLE) {Print("AQ220: another instance or lock file error");return INIT_FAILED;}
   aq.SetExpertMagicNumber(InpMagic);aq.SetDeviationInPoints(InpDeviationPoints);
   aq.SetAsyncMode(false);aq.SetTypeFillingBySymbol(_Symbol);
   RestoreEntryTimes();CancelLegacyPending();
   g_log=FileOpen("AlQannas_Video_Chaser_"+_Symbol+"_"+IntegerToString((long)InpMagic)+".csv",
                  FILE_READ|FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_SHARE_READ,',');
   if(g_log!=INVALID_HANDLE) {FileSeek(g_log,0,SEEK_END);}
   if(!EventSetMillisecondTimer(100)) return INIT_FAILED;
   ObjectCreate(0,g_button,OBJ_BUTTON,0,0,0);
   ObjectSetInteger(0,g_button,OBJPROP_XDISTANCE,10);
   ObjectSetInteger(0,g_button,OBJPROP_YDISTANCE,130);
   ObjectSetInteger(0,g_button,OBJPROP_XSIZE,210);
   ObjectSetInteger(0,g_button,OBJPROP_YSIZE,26);
   ObjectSetString(0,g_button,OBJPROP_TEXT,"Pause NEW entries only");
   Log("START",0,0,"v2.20: target 5.50 / software loss 3.50 / broker SL 6 defaults; performance unverified");
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
