//+------------------------------------------------------------------+
//| Al-Qannas Candle Chaser Quick Dollar - DEMO ONLY                  |
//| XAUUSD M1, two-sided BUY STOP / SELL STOP, OCO best-effort.       |
//| Tries to close at +$1 estimated net. LOSS-FREE trading impossible.|
//| NO DAILY LOSS LIMIT by explicit user request.                      |
//| Per-position broker SL, risk-sized lots and trade pacing remain.  |
//+------------------------------------------------------------------+
#property strict
#property version "1.01"
#property description "DEMO ONLY. XAUUSD M1 quick-profit stop-order chaser, NO daily loss stop."
#include <Trade/Trade.mqh>

input bool   InpPauseNewOrders          = false; // Pause opening new STOP orders; still manage positions
input double InpRequestedLots           = 0.10;  // Requested high lot; risk engine may REDUCE it
input double InpMaxLots                 = 0.20;  // Hard lot cap
input double InpProfitTargetUsd         = 1.00;  // Close at estimated net +$1 per position
input double InpBackupTpProfitUsd       = 1.50;  // Broker TP backup; can be further due to min distance
input double InpMaxLossPerTradeUsd      = 6.00;  // Intended per-position worst-case loss (not guaranteed)
input double InpExitBeforeSLUsd         = 5.40;  // Software loss exit after minimum age; broker SL always active
input double InpEstimatedExitFeesUsd    = 0.00;  // Commission still due on EXIT, in USD; adjust for account
input double InpStopOffsetPrice         = 0.22;  // Distance above ASK / below BID for first STOP
input double InpMinBrokerSLBufferPrice  = 0.05;  // Extra space beyond broker stop minimum
input double InpMaxSpreadPrice          = 0.85;  // Max spread, XAUUSD price units, not points
input int    InpMinimumLossHoldSeconds = 20;    // No software loss close in first 20s, but BROKER SL still active
input int    InpMaxHoldSeconds          = 0;     // 0 disables forced time exit
input double InpMinSLDistancePrice     = 1.10;  // Wider gold SL, auto-scale lots to preserve $6 risk
input int    InpRearmDelaySeconds       = 2;     // Avoid instantly opening after a close
input int    InpMaxOrdersPerM1          = 24;    // Total pending order PLACEMENTS in one M1 bar
input int    InpRepriceAfterSeconds     = 6;     // Rebuild old unfilled stop pair after this age
input double InpRepriceWhenMovedPrice   = 0.30;  // Rebuild when quote moved at least this much
input int    InpRetryAfterSeconds       = 2;     // Back off after rejected/cancelled requests
input int    InpDeviationPoints        = 50;    // Max deviation for market close; not a loss limit
input ulong  InpMagic                  = 560179511; // Unique identifier
input bool   InpShowStatus             = true;

CTrade aq;
string g_status = "Starting";
ulong g_lastActionMsc=0;
ulong g_lastFlatMsc=0;
ulong g_lastPlaceMsc=0;
ulong g_lastRebuildMsc=0;
int g_placedThisBar=0;
datetime g_bar=0;
double g_pairMid=0.0;

// No daily profit/loss accounting, no account daily P/L check, and no daily lock.
// This intentionally removes the daily loss limit, NOT per-trade protection.

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

void RemoveOwnPending()
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      if(!OwnOrderByIndex(i)) continue;
      ulong ticket=OrderGetTicket(i);
      ENUM_ORDER_TYPE type=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      if(type!=ORDER_TYPE_BUY_STOP && type!=ORDER_TYPE_SELL_STOP) continue;
      if(!aq.OrderDelete(ticket))
         PrintFormat("AQ delete pending #%I64u failed: %u %s",ticket,
                     aq.ResultRetcode(),aq.ResultRetcodeDescription());
   }
}

// Total open-deal commissions (already charged) plus current floating P/L;
// broker quote already includes the spread in POSITION_PROFIT.
// Exit-side fees are ESTIMATED: slippage and sudden spread widening are unknowable.
double EntryFeesAlreadyCharged(ulong posId)
{
   static ulong cachedId=0;
   static double cachedFees=0.0;
   if(cachedId==posId) return cachedFees;
   datetime now=TimeCurrent();
   if(!HistorySelect(now-2*86400,now+60)) return 0.0;
   double fees=0.0;
   int n=HistoryDealsTotal();
   for(int i=n-1;i>=0;i--)
   {
      ulong deal=HistoryDealGetTicket(i);
      if(deal==0) continue;
      if((ulong)HistoryDealGetInteger(deal,DEAL_POSITION_ID)!=posId) continue;
      ENUM_DEAL_ENTRY entry=(ENUM_DEAL_ENTRY)HistoryDealGetInteger(deal,DEAL_ENTRY);
      if(entry==DEAL_ENTRY_IN || entry==DEAL_ENTRY_INOUT)
      {
         fees+=HistoryDealGetDouble(deal,DEAL_COMMISSION);
         fees+=HistoryDealGetDouble(deal,DEAL_FEE);
      }
   }
   cachedId=posId;
   cachedFees=fees;
   return fees;
}

double EstimatedPositionNet()
{
   double floating=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
   ulong posId=(ulong)PositionGetInteger(POSITION_IDENTIFIER);
   return floating+EntryFeesAlreadyCharged(posId)-MathMax(0.0,InpEstimatedExitFeesUsd);
}

bool ProfitAt(ENUM_ORDER_TYPE side,double lots,double entry,double at,double &out)
{
   return OrderCalcProfit(side,_Symbol,lots,entry,at,out);
}

// Find a TP distance whose theoretical gross payout covers the backup target
// and expected exit commission. It may be widened to broker minimum.
bool MakeBackupTP(ENUM_ORDER_TYPE side,double lots,double entry,double &tp)
{
   double target=MathMax(InpBackupTpProfitUsd,InpProfitTargetUsd+0.25)+MathMax(0.0,InpEstimatedExitFeesUsd);
   double minGap=MathMax(MinStops()+2.0*TickSize(),2.0*TickSize());
   double lo=0.0,hi=MathMax(minGap,0.05);
   double p=0.0;
   for(int n=0;n<24;n++)
   {
      double at=(side==ORDER_TYPE_BUY?entry+hi:entry-hi);
      if(at<=0.0 || !ProfitAt(side,lots,entry,at,p)) return false;
      if(p>=target) break;
      hi*=1.8;
   }
   if(p<target) return false;
   for(int n=0;n<28;n++)
   {
      double mid=(lo+hi)*0.5;
      double at=(side==ORDER_TYPE_BUY?entry+mid:entry-mid);
      if(at<=0.0 || !ProfitAt(side,lots,entry,at,p)) return false;
      if(p>=target) hi=mid;
      else lo=mid;
   }
   double offset=MathMax(hi,minGap);
   tp=(side==ORDER_TYPE_BUY?PriceUp(entry+offset):PriceDown(entry-offset));
   return (tp>0.0);
}

// Work out the LOTS that fit the per-trade SL and broker min stop distance.
// Do not increase loss budget or place an SL-less order to force a fill.
bool CalculateOrder(ENUM_ORDER_TYPE side,double entry,double liveSpread,double &volume,double &sl,double &tp)
{
   double tick=TickSize();
   double gap=MathMax(MathMax(liveSpread+MinStops()+MathMax(0.0,InpMinBrokerSLBufferPrice)+tick,2.0*tick),InpMinSLDistancePrice);
   sl=(side==ORDER_TYPE_BUY?PriceDown(entry-gap):PriceUp(entry+gap));
   if(sl<=0.0) return false;
   double limit=MathMin(InpRequestedLots,InpMaxLots);
   volume=FloorVolume(limit);
   if(volume<=0.0) {g_status="Requested lot below broker minimum"; return false;}

   // Leave room for an exit fee estimate; broker min SL is a hard constraint.
   double availableLoss=InpMaxLossPerTradeUsd-MathMax(0.0,InpEstimatedExitFeesUsd);
   if(availableLoss<=0.0) {g_status="Fees exceed trade loss budget";return false;}

   double loss=0.0;
   while(volume>=MinVolume()-1e-9)
   {
      if(!ProfitAt(side,volume,entry,sl,loss))
      {g_status="OrderCalcProfit failed";return false;}
      if((-loss)<=availableLoss+1e-6) break;
      volume=FloorVolume(volume-VolumeStep());
   }
   if(volume<MinVolume()-1e-9 || volume<=0.0)
   {g_status="Even minimum lot exceeds SL budget";return false;}

   if(!MakeBackupTP(side,volume,entry,tp))
   {g_status="Could not calculate broker backup TP";return false;}
   return true;
}

bool PendingResultOK()
{
   uint r=aq.ResultRetcode();
   return (r==TRADE_RETCODE_PLACED || r==TRADE_RETCODE_DONE);
}


// Prefer broker-side timed expiry so abandoned pending orders do not live forever.
bool PendingLifetime(ENUM_ORDER_TYPE_TIME &lifetime,datetime &until)
{
   long modes=SymbolInfoInteger(_Symbol,SYMBOL_EXPIRATION_MODE);
   datetime now=TimeTradeServer();
   if(now<=0) now=TimeCurrent();
   if((modes & SYMBOL_EXPIRATION_SPECIFIED)==SYMBOL_EXPIRATION_SPECIFIED)
   {
      lifetime=ORDER_TIME_SPECIFIED;
      until=now+120;
      return true;
   }
   if((modes & SYMBOL_EXPIRATION_GTC)==SYMBOL_EXPIRATION_GTC)
   {
      lifetime=ORDER_TIME_GTC;
      until=0;
      return true;
   }
   if((modes & SYMBOL_EXPIRATION_DAY)==SYMBOL_EXPIRATION_DAY)
   {
      lifetime=ORDER_TIME_DAY;
      until=0;
      return true;
   }
   return false;
}

// Two-sided STOP orders mimic the supplied video. The OCO cancellation is
// client-side best effort, not exchange-atomic; BOTH can fill in fast markets.
void PlaceStopPair(const MqlTick &tick)
{
   if(g_placedThisBar+2>InpMaxOrdersPerM1)
   {g_status="Minute order-placement cap (not daily loss cap)";return;}
   double dist=MathMax(InpStopOffsetPrice,MinStops()+2.0*TickSize());
   double buyEntry=PriceUp(tick.ask+dist);
   double sellEntry=PriceDown(tick.bid-dist);
   double buyV=0,buySL=0,buyTP=0,sellV=0,sellSL=0,sellTP=0;
   bool buyOK=CalculateOrder(ORDER_TYPE_BUY,buyEntry,tick.ask-tick.bid,buyV,buySL,buyTP);
   bool sellOK=CalculateOrder(ORDER_TYPE_SELL,sellEntry,tick.ask-tick.bid,sellV,sellSL,sellTP);
   if(!buyOK || !sellOK)
   {
      PrintFormat("AQ no orders: %s. minLot %.3f requested %.3f maxLoss $%.2f spread %.3f",g_status,MinVolume(),InpRequestedLots,InpMaxLossPerTradeUsd,tick.ask-tick.bid);
      return;
   }
   // Limit worst-case combined exposure if both sides fill before cancellation.
   // Identical volumes, both individually risk capped; simultaneous fills can double risk.
   double volume=MathMin(buyV,sellV);
   if(volume<MinVolume()) {g_status="Volume too small for OCO pair";return;}
   if(volume!=buyV && !MakeBackupTP(ORDER_TYPE_BUY,volume,buyEntry,buyTP)) return;
   if(volume!=sellV && !MakeBackupTP(ORDER_TYPE_SELL,volume,sellEntry,sellTP)) return;

   ENUM_ORDER_TYPE_TIME lifetime=ORDER_TIME_GTC;
   datetime expiry=0;
   if(!PendingLifetime(lifetime,expiry))
   {g_status="Broker unsupported pending order expiration";return;}
   bool a=aq.BuyStop(volume,buyEntry,_Symbol,buySL,buyTP,lifetime,expiry,"AQ Chaser BUY STOP");
   bool okA=(a && PendingResultOK());
   if(!okA)
   {
      g_status="BUY STOP rejected: "+aq.ResultRetcodeDescription();
      PrintFormat("AQ %s; code=%u",g_status,aq.ResultRetcode());
      return;
   }
   g_placedThisBar++;
   // It is possible that the BUY stop filled already. Check BEFORE submitting SELL.
   if(PositionCount()>0)
   {
      g_status="BUY triggered; will manage position";
      return;
   }
   bool b=aq.SellStop(volume,sellEntry,_Symbol,sellSL,sellTP,lifetime,expiry,"AQ Chaser SELL STOP");
   bool okB=(b && PendingResultOK());
   if(!okB)
   {
      g_status="SELL STOP rejected: "+aq.ResultRetcodeDescription();
      PrintFormat("AQ %s; code=%u",g_status,aq.ResultRetcode());
      RemoveOwnPending();  // Never leave an unintended one-sided pair after failure
      return;
   }
   g_placedThisBar++;
   g_lastPlaceMsc=MsNow();
   g_pairMid=(tick.ask+tick.bid)*0.5;
   g_status=StringFormat("Two STOPs at %.3f lots; broker SL active",volume);
   PrintFormat("AQ OCO pair %.3f lot | BUY %.3f SL %.3f TP %.3f | SELL %.3f SL %.3f TP %.3f | +$%.2f exit | NO daily cap",
               volume,buyEntry,buySL,buyTP,sellEntry,sellSL,sellTP,InpProfitTargetUsd);
}

void ManagePositions()
{
   int seen=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      if(!OwnPositionByIndex(i)) continue;
      seen++;
      ulong ticket=PositionGetTicket(i);
      double net=EstimatedPositionNet();
      datetime opened=(datetime)PositionGetInteger(POSITION_TIME);
      int age=(int)(TimeCurrent()-opened);
      bool close=false;
      string reason="";
      if(seen>1) {close=true;reason="Extra OCO fill";}
      else if(net>=InpProfitTargetUsd) {close=true;reason="Quick $1 target";}
      else if(net<=-InpExitBeforeSLUsd && age>=InpMinimumLossHoldSeconds) {close=true;reason="Early loss exit after minimum hold";}
      else if(InpMaxHoldSeconds>0 && age>=InpMaxHoldSeconds) {close=true;reason="Optional time limit";}

      if(close)
      {
         if(aq.PositionClose(ticket,InpDeviationPoints))
         {
            uint rc=aq.ResultRetcode();
            if(rc==TRADE_RETCODE_DONE || rc==TRADE_RETCODE_DONE_PARTIAL)
               PrintFormat("AQ exit requested #%I64u net estimate $%.2f age=%ds reason=%s",ticket,net,age,reason);
            else
               PrintFormat("AQ close not filled #%I64u retcode=%u %s",ticket,rc,aq.ResultRetcodeDescription());
         }
         else PrintFormat("AQ close failed #%I64u retcode=%u %s",ticket,aq.ResultRetcode(),aq.ResultRetcodeDescription());
         g_status=reason+StringFormat(" est $%.2f",net);
      }
      else g_status=StringFormat("OPEN #%I64u est net $%.2f age %ds; TP $%.2f",ticket,net,age,InpProfitTargetUsd);
   }
}

void ShowStatus(double spread)
{
   if(!InpShowStatus) return;
   Comment("AL-QANNAS QUICK DOLLAR | DEMO | M1",
           "\nNO DAILY LOSS STOP (user choice)",
           "\nTarget est NET +$",DoubleToString(InpProfitTargetUsd,2),
            " | Min loss hold ",InpMinimumLossHoldSeconds,"s",
           " | Per-trade intended SL $",DoubleToString(InpMaxLossPerTradeUsd,2),
           "\nRequested lots ",DoubleToString(InpRequestedLots,2),
           " (risk-reduced when needed)",
           " | Spread ",DoubleToString(spread,3),
           "\nOpen ",PositionCount()," | Pending ",PendingCount(),
           " | Placed in M1 ",g_placedThisBar,"/",InpMaxOrdersPerM1,
           "\n",g_status);
}

void Pulse()
{
   if(!DemoOnly()) {Comment("DEMO ONLY -- REAL ACCOUNT BLOCKED");return;}
   if(!IsXau() || _Period!=PERIOD_M1)
   {Comment("Attach to an XAUUSD M1 DEMO chart");return;}
   if(AccountInfoString(ACCOUNT_CURRENCY)!="USD")
   {Comment("Requires a USD-denominated DEMO account");return;}

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick) || tick.ask<=tick.bid || tick.bid<=0.0)
   {g_status="No valid quotes";ShowStatus(0);return;}
   double spread=tick.ask-tick.bid;
   datetime bar=iTime(_Symbol,PERIOD_M1,0);
   if(bar!=g_bar && bar>0)
   {g_bar=bar;g_placedThisBar=0;}

   int open=PositionCount();
   if(open>0)
   {
      RemoveOwnPending(); // When one fills, cancel opposite ASAP (non-atomic OCO)
      ManagePositions();
      ShowStatus(spread);
      return;
   }

   if(InpPauseNewOrders)
   {RemoveOwnPending();g_status="Paused (managing existing positions)";ShowStatus(spread);return;}
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED) || !TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ||
      !AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))
   {g_status="Algo Trading / account trading DISABLED";ShowStatus(spread);return;}
   if(spread>InpMaxSpreadPrice)
   {RemoveOwnPending();g_status="WAIT: spread over configured maximum";ShowStatus(spread);return;}
   if((long)(TimeCurrent()-(datetime)tick.time)>8)
   {g_status="WAIT: no fresh ticks";ShowStatus(spread);return;}

   ulong nowMs=MsNow();
   int pending=PendingCount();
   if(pending>0)
   {
      double mid=(tick.ask+tick.bid)*0.5;
      bool aged=(nowMs-g_lastPlaceMsc>=(ulong)MathMax(2,InpRepriceAfterSeconds)*1000);
      bool drift=(MathAbs(mid-g_pairMid)>=InpRepriceWhenMovedPrice);
      if(aged && drift && nowMs-g_lastRebuildMsc>=(ulong)MathMax(2,InpRetryAfterSeconds)*1000)
      {
         RemoveOwnPending();
         g_lastRebuildMsc=nowMs;
         g_lastActionMsc=nowMs;
         g_status="Repositioning STOP orders with candle";
      }
      else g_status="Chasing M1 with BUY STOP / SELL STOP";
      ShowStatus(spread);
      return;
   }

   if(g_lastFlatMsc>0 && nowMs-g_lastFlatMsc<(ulong)MathMax(0,InpRearmDelaySeconds)*1000)
   {g_status="Rearming after exit";ShowStatus(spread);return;}
   if(nowMs-g_lastActionMsc<(ulong)MathMax(1,InpRetryAfterSeconds)*1000)
   {g_status="Broker request cooldown";ShowStatus(spread);return;}
   if(g_placedThisBar+2>InpMaxOrdersPerM1)
   {g_status="Minute order count reached";ShowStatus(spread);return;}

   g_lastActionMsc=nowMs;
   PlaceStopPair(tick);
   ShowStatus(spread);
}

void OnTick() { Pulse(); }
void OnTimer() { Pulse(); }

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type!=TRADE_TRANSACTION_DEAL_ADD) return;
   // A new deal can represent ENTRY or EXIT; inspect history to distinguish.
   if(!HistoryDealSelect(trans.deal)) return;
   if(HistoryDealGetString(trans.deal,DEAL_SYMBOL)!=_Symbol) return;
   if((ulong)HistoryDealGetInteger(trans.deal,DEAL_MAGIC)!=InpMagic) return;
   ENUM_DEAL_ENTRY how=(ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal,DEAL_ENTRY);
   if(how==DEAL_ENTRY_IN || how==DEAL_ENTRY_INOUT)
   {
      RemoveOwnPending();
      g_status="STOP triggered; closing opposite order";
   }
   else if(how==DEAL_ENTRY_OUT || how==DEAL_ENTRY_OUT_BY)
   {
      g_lastFlatMsc=MsNow();
      ENUM_DEAL_REASON reason=(ENUM_DEAL_REASON)HistoryDealGetInteger(trans.deal,DEAL_REASON);
       double realized=HistoryDealGetDouble(trans.deal,DEAL_PROFIT)
                      +HistoryDealGetDouble(trans.deal,DEAL_COMMISSION)
                      +HistoryDealGetDouble(trans.deal,DEAL_SWAP)
                      +HistoryDealGetDouble(trans.deal,DEAL_FEE);
       PrintFormat("AQ EXIT #%I64u cause=%s realized-deal-net=%.2f",
                   trans.deal,EnumToString(reason),realized);
       g_status="Position exited by "+EnumToString(reason);
   }
}

int OnInit()
{
   if(!DemoOnly()) {Print("AQ blocked: REAL account; DEMO only");return INIT_FAILED;}
   if(_Period!=PERIOD_M1 || !IsXau())
   {Print("AQ requires XAUUSD M1 chart");return INIT_FAILED;}
   if(AccountInfoString(ACCOUNT_CURRENCY)!="USD")
   {Print("AQ requires USD demo account");return INIT_FAILED;}
   if(InpRequestedLots<=0 || InpMaxLots<=0 || InpProfitTargetUsd<=0 ||
      InpMaxLossPerTradeUsd<=0 || InpExitBeforeSLUsd<=0 ||
      InpExitBeforeSLUsd>InpMaxLossPerTradeUsd || InpMaxOrdersPerM1<2 ||
      InpMaxSpreadPrice<=0 || InpStopOffsetPrice<=0 || InpMaxHoldSeconds<0 ||
       InpMinimumLossHoldSeconds<0 || InpMinSLDistancePrice<=0)
   {Print("AQ invalid risk/target/order inputs");return INIT_PARAMETERS_INCORRECT;}
   aq.SetExpertMagicNumber(InpMagic);
   aq.SetDeviationInPoints(InpDeviationPoints);
   aq.SetAsyncMode(false);
   aq.SetTypeFillingBySymbol(_Symbol);
   EventSetMillisecondTimer(250);
   Print("AQ Quick Dollar DEMO v1.01 started. Loss software-exit delayed; broker SL always active. NO DAILY LOSS LIMIT.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   RemoveOwnPending();
   Comment("");
}