//+------------------------------------------------------------------+
//| Al-Qannas Gold M1 Limit EA - EXNESS DEMO ONLY                    |
//| Real pending LIMIT orders on MT5 demo; never trades real money.  |
//| Local MT5 analysis (tick pressure + approximate tick-vol POC).   |
//| This EA does NOT call the Al-Qannas website/AI.                  |
//+------------------------------------------------------------------+
#property strict
#property version   "1.15"
#property description "Al-Qannas Gold M1 Limit v1.15: Live bid/ask validation and pending order lifecycle. DEMO ONLY."
#include <Trade/Trade.mqh>

enum ENUM_AQ_ENTRY_STYLE
{
   AQ_FAST=0,           // More signals, less confirmation
   AQ_BALANCED=1,       // M1 + M5 directional agreement
   AQ_PRECISION=2       // Stronger consensus, fewer entries
};
enum ENUM_AQ_DIRECTION
{
   AQ_BOTH=0,
   AQ_BUYS_ONLY=1,
   AQ_SELLS_ONLY=2
};
input bool   InpManualPause          = false;  // Manually pause NEW entries; existing positions still managed
input ENUM_AQ_DIRECTION InpTradeDirection=AQ_BOTH; // Both / BUY only / SELL only
input bool   InpEnableDailyStop      = false;  // User decides whether daily loss auto-lock is enabled
input ENUM_AQ_ENTRY_STYLE InpEntryStyle = AQ_BALANCED; // Change entry strictness in Inputs
input double InpLots                 = 0.05;   // Set volume yourself; broker min/max/step applies
input double InpTakeNetUsd           = 6.00;   // Hard broker TP estimated net USD (NOT first tiny profit)
input double InpMaxLossUsd           = 3.00;   // Intended max loss USD (broker SL/fast moves can overrun)
input double InpTrailArmUsd          = 2.25;   // At this peak, attempt to lock +$1.50 net
input double InpTrailStartUsd        = 3.00;   // Start trailing best net profit from this peak
input double InpTrailGivebackUsd     = 0.80;   // Max giveback from peak, once trailing
input double InpProfitLockUsd        = 1.50;   // Minimum targeted protected net profit (not guaranteed)
input double InpMinSignalScore       = 0.45;   // Entry confidence threshold (higher = fewer entries)
input double InpMinM5Alignment       = 0.12;   // Minimum agreement from last CLOSED M5 candles
input int    InpMinTickConfirm       = 8;      // Minimum price-change ticks before first M1 signal
input double InpMaxSpreadRangeRatio  = 0.35;   // Spread cannot dominate recent M1 range
input double InpMaxLiveCandleRange   = 2.20;   // Skip live M1 spikes over mean range
input double InpEntryPullbackRange   = 0.025;  // Small pending LIMIT pullback as fraction of M1 range
input double InpMaxLimitDistancePrice = 0.70;  // MAX XAUUSD price distance from current executable quote
input int    InpMaxPendingAgeSec     = 75;     // Pending order maximum age in seconds
input bool   InpCancelOnNewBar       = false;  // OFF: don't remove valid pending limits on new M1 bars
input bool   InpCancelOnPriceDrift   = false;  // OFF: do NOT cancel a LIMIT just because quote moved
input double InpCancelDistancePrice  = 3.00;   // Separate XAU price distance to cancel if enabled
input int    InpFrozenCancelRetrySec = 10;     // Cooldown after broker refuses to cancel as frozen
input bool   InpCancelOnFlowFlip     = false;  // Optional: turning ON may cancel valid pullback LIMIT fills
input double InpM5ConflictScore      = 0.80;   // Skip strong M5 trend conflicts
input double InpDailyStopUsd         = 40.00;  // Used only when InpEnableDailyStop=true
input double InpCostReserveUsd       = 0.20;   // Estimated round-trip costs per trade
input int    InpMaxHoldSeconds       = 180;    // Allow more time for winning moves without endless holding
input int    InpMaxConcurrent       = 4;      // Open positions + pending orders
input int    InpMaxEntriesPerM1      = 4;      // Pending LIMIT attempts per minute
input int    InpMinOrderSpacingSec   = 10;     // Don't spam the trade server
input int    InpFrozenRetrySeconds   = 5;      // Back off failed broker-frozen position closes
input double InpMaxSpreadPrice       = 0.80;   // XAU price units (not points)
input ulong  InpMagic                = 560179505;
input bool   InpShowChartStatus      = true;

CTrade    g_trade;
datetime  g_barStart = 0;
datetime  g_dayStart = 0;
datetime  g_lastOrderAt = 0;
datetime  g_lastCloseAttempt = 0;
int       g_ordersThisBar = 0;
int       g_upTicks = 0;
int       g_downTicks = 0;
double    g_previousMid = 0.0;
double    g_referenceM1Range = 0.0;
int       g_recentTickDirections[32];
int       g_recentTickCount = 0;
int       g_recentTickIndex = 0;
bool      g_dayLocked = false;
string    g_lockKey = "";
string    g_status = "Ready";

// All calls to submit a new order fail closed outside an MT5 DEMO account.
bool DemoAccount()
{
   if(MQLInfoInteger(MQL_TESTER) != 0)
      return true; // Strategy Tester is sandboxed, even if login is live.
   return ((ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO);
}

datetime ServerNow()
{
   datetime v = TimeTradeServer();
   if(v <= 0) v = TimeCurrent();
   return v;
}

datetime StartOfDay(datetime when)
{
   MqlDateTime t;
   TimeToStruct(when,t);
   t.hour = 0;
   t.min = 0;
   t.sec = 0;
   return StructToTime(t);
}

bool ExactVolume()
{
   double minvol = SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double maxvol = SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   if(step <= 0 || InpLots < minvol-0.00000001 || InpLots > maxvol+0.00000001) return false;
   return MathAbs(InpLots/step-MathRound(InpLots/step)) < 0.000001;
}

double TickSize()
{
   double s = SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   return (s > 0 ? s : _Point);
}

double PriceRound(double v,int mode)
{
   double step = TickSize();
   double q = v/step;
   if(mode < 0) q=MathFloor(q+0.000000001);
   else if(mode > 0) q=MathCeil(q-0.000000001);
   else q=MathRound(q);
   return NormalizeDouble(q*step,(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS));
}

double MinimumDistance()
{
   int stops=(int)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL);
   return MathMax((stops+3)*_Point,2.0*TickSize());
}

void ReadDay()
{
   datetime today = StartOfDay(ServerNow());
   if(g_dayStart == today) return;
   g_dayStart = today;
   g_dayLocked = false;
   g_lockKey="AQG_"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+
             "_"+IntegerToString((long)InpMagic)+"_"+IntegerToString((long)today);
   // A stored old day-lock is ignored when the user disables the daily stop.
   if(InpEnableDailyStop && GlobalVariableCheck(g_lockKey)) g_dayLocked = true;
   PrintFormat("Al-Qannas: day=%I64d user daily stop=%s locked=%s",
               (long)today,(InpEnableDailyStop?"ON":"OFF"),(g_dayLocked?"YES":"NO"));
}

bool ClosedProfitToday(double &result)
{
   result=0.0;
   if(!HistorySelect(g_dayStart,ServerNow()+1)) return false;
   for(int i=0;i<HistoryDealsTotal();i++)
   {
      ulong ticket=HistoryDealGetTicket(i);
      if(ticket==0) continue;
      if((ulong)HistoryDealGetInteger(ticket,DEAL_MAGIC)!=InpMagic) continue;
      if(HistoryDealGetString(ticket,DEAL_SYMBOL)!=_Symbol) continue;
      result += HistoryDealGetDouble(ticket,DEAL_PROFIT)
              + HistoryDealGetDouble(ticket,DEAL_COMMISSION)
              + HistoryDealGetDouble(ticket,DEAL_SWAP)
              + HistoryDealGetDouble(ticket,DEAL_FEE);
   }
   return true;
}

bool OwnPosition()
{
   return PositionGetString(POSITION_SYMBOL)==_Symbol &&
          (ulong)PositionGetInteger(POSITION_MAGIC)==InpMagic;
}

bool OwnLimitOrder()
{
   ENUM_ORDER_TYPE type=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
   return OrderGetString(ORDER_SYMBOL)==_Symbol &&
          (ulong)OrderGetInteger(ORDER_MAGIC)==InpMagic &&
          (type==ORDER_TYPE_BUY_LIMIT || type==ORDER_TYPE_SELL_LIMIT);
}

int CountActive()
{
   int n=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket!=0 && PositionSelectByTicket(ticket) && OwnPosition()) n++;
   }
   for(int j=OrdersTotal()-1;j>=0;j--)
   {
      ulong ticket=OrderGetTicket(j);
      if(ticket!=0 && OrderSelect(ticket) && OwnLimitOrder()) n++;
   }
   return n;
}

double FloatingEstimate()
{
   double net=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket) || !OwnPosition()) continue;
      net += PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP)-InpCostReserveUsd;
   }
   return net;
}

string CancelRetryKey(ulong ticket)
{
   return "AQCancel_"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+"_"
         +IntegerToString((long)InpMagic)+"_"+IntegerToString((long)ticket);
}

bool CancelPendingIfPossible(ulong ticket,string reason)
{
   if(!OrderSelect(ticket) || !OwnLimitOrder())return false;
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ||
      !MQLInfoInteger(MQL_TRADE_ALLOWED))return false;
   string key=CancelRetryKey(ticket);
   datetime now=ServerNow();
   if(GlobalVariableCheck(key) &&
      now-(datetime)GlobalVariableGet(key)<InpFrozenCancelRetrySec)return false;

   // Broker freeze-level restricts pending order deletion near its price.
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick) || tick.ask<=tick.bid)return false;
   ENUM_ORDER_TYPE type=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
   double entry=OrderGetDouble(ORDER_PRICE_OPEN);
   double quote=(type==ORDER_TYPE_BUY_LIMIT?tick.ask:tick.bid);
   double freeze=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL)*_Point;
   if(freeze>0 && MathAbs(quote-entry)<=freeze+TickSize())
   {
      GlobalVariableSet(key,(double)now);
      return false;
   }
   bool sent=g_trade.OrderDelete(ticket);
   uint rc=g_trade.ResultRetcode();
   if(sent && rc==TRADE_RETCODE_DONE)
   {
      GlobalVariableDel(key);
      PrintFormat("Al-Qannas pending LIMIT canceled #%I64u reason=%s",ticket,reason);
      return true;
   }
   if(rc==TRADE_RETCODE_FROZEN || rc==TRADE_RETCODE_INVALID)
   {
      GlobalVariableSet(key,(double)now);
      PrintFormat("Al-Qannas pending cancel deferred #%I64u code=%u retry in %d s",
                  ticket,rc,InpFrozenCancelRetrySec);
   }
   else if(rc!=TRADE_RETCODE_ORDER_CHANGED)
   {
      PrintFormat("Al-Qannas pending cancel rejected #%I64u retcode=%u %s",
                  ticket,rc,g_trade.ResultRetcodeDescription());
   }
   return false;
}

void RemoveOwnLimits(bool all=false)
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket) || !OwnLimitOrder())continue;
      datetime created=(datetime)OrderGetInteger(ORDER_TIME_SETUP);
      if(!all && created>=g_barStart && ServerNow()<g_barStart+60)continue;
      CancelPendingIfPossible(ticket,all?"USER/DAY/REMOVE":"NEW_M1_BAR");
   }
}

string PeakKey(ulong ticket)
{
   return "AQPeak_"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+"_"
          +IntegerToString((long)InpMagic)+"_"+IntegerToString((long)ticket);
}

void ProtectProfitAtBroker(ulong ticket,int side,double entry,double currentSl,
                           double currentTp,double volume,double swap,double protectedNet)
{
   // Only MOVE SL in the profitable direction. Existing original SL stays in place
   // if broker minimum stop/freeze distance prevents a profitable modification.
   if(protectedNet<=0) return;
   ENUM_ORDER_TYPE type=(side>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL);
   double usdPerPrice=0;
   if(!OrderCalcProfit(type,_Symbol,volume,entry,entry+(side>0?1.0:-1.0),usdPerPrice))return;
   usdPerPrice=MathAbs(usdPerPrice);
   if(usdPerPrice<=0)return;
   double move=(protectedNet+InpCostReserveUsd-swap)/usdPerPrice;
   if(move<=0)return;
   double proposed=PriceRound(entry+(side>0?move:-move),(side>0?-1:1));
   double minimum=MathMax((double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL),
                          (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL))*_Point
                          +2.0*TickSize();
   MqlTick t;
   if(!SymbolInfoTick(_Symbol,t))return;
   // Do not flood the trade server with modifications for each tick.
   double minimumTightening=MathMax(2.0*TickSize(),0.25/usdPerPrice);
   if(side>0)
   {
      if(proposed>=t.bid-minimum || proposed<=entry ||
         proposed<=currentSl+minimumTightening)return;
   }
   else
   {
      if(proposed<=t.ask+minimum || proposed>=entry ||
         (currentSl>0 && proposed>=currentSl-minimumTightening))return;
   }
   string modifyKey="AQMod_"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+"_"+
                    IntegerToString((long)InpMagic)+"_"+IntegerToString((long)ticket);
   datetime lastAttempt=(GlobalVariableCheck(modifyKey)?(datetime)GlobalVariableGet(modifyKey):0);
   if(ServerNow()-lastAttempt<2)return;
   GlobalVariableSet(modifyKey,(double)ServerNow()); // Also rate-limit rejections.
   bool requested=g_trade.PositionModify(ticket,proposed,currentTp);
   uint rc=g_trade.ResultRetcode();
   if(requested && rc==TRADE_RETCODE_DONE)
      PrintFormat("Al-Qannas PROFIT SL LOCK #%I64u SL=%.*f protected_est=%.2f",
                  ticket,_Digits,proposed,protectedNet);
}

void ManagePositions(bool forceClose=false)
{
   datetime now=ServerNow();
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket) || !OwnPosition())continue;
      int side=((ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?1:-1);
      double net=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP)-InpCostReserveUsd;
      double peak=0.0;
      string key=PeakKey(ticket);
      if(GlobalVariableCheck(key))peak=GlobalVariableGet(key);
      if(net>peak)
      {
         peak=net;
         GlobalVariableSet(key,peak); // High-water mark persists if EA restarts.
      }

      // New exit policy: do not close at the first +$0.70.
      // At peak +$2.25, try to lock at least +$1.50 using broker stop levels.
      // From +$3.00 peak onward, preserve peak minus $0.80.
      double protectedNet=0.0;
      if(peak>=InpTrailArmUsd)protectedNet=InpProfitLockUsd;
      if(peak>=InpTrailStartUsd)
         protectedNet=MathMax(protectedNet,peak-InpTrailGivebackUsd);
      if(protectedNet>0)
         ProtectProfitAtBroker(ticket,side,PositionGetDouble(POSITION_PRICE_OPEN),
                               PositionGetDouble(POSITION_SL),
                               PositionGetDouble(POSITION_TP),
                               PositionGetDouble(POSITION_VOLUME),
                               PositionGetDouble(POSITION_SWAP),protectedNet);

      string closeRetryKey="AQCloseFrozen_"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))
                           +"_"+IntegerToString((long)InpMagic)+"_"+IntegerToString((long)ticket);
      int age=(int)(now-(datetime)PositionGetInteger(POSITION_TIME));
      bool hardProfit=(net>=InpTakeNetUsd);
      // A gap below the profit floor must ALSO exit; never require net>0.
      bool trailingExit=(protectedNet>0 && net<=protectedNet);
      bool lossStop=(net<=-InpMaxLossUsd);
      bool timeStop=(age>=InpMaxHoldSeconds);
      if(!forceClose && !hardProfit && !trailingExit && !lossStop && !timeStop)continue;
      // Broker frozen restriction (10029) is not solvable by spamming Close().
      // Original broker SL/TP remains active while waiting to retry.
      if(GlobalVariableCheck(closeRetryKey) &&
         now-(datetime)GlobalVariableGet(closeRetryKey)<InpFrozenRetrySeconds)continue;
      if(now-g_lastCloseAttempt<2 && !forceClose && !lossStop)continue;
      g_lastCloseAttempt=now;
      bool sent=g_trade.PositionClose(ticket);
      uint rc=g_trade.ResultRetcode();
      if(sent && (rc==TRADE_RETCODE_DONE || rc==TRADE_RETCODE_DONE_PARTIAL))
      {
         PrintFormat("Al-Qannas CLOSE #%I64u net_est=%.2f peak=%.2f age=%d reason=%s",
           ticket,net,peak,age,
           forceClose?"DAY_LOCK":hardProfit?"HARD_TP":lossStop?"LOSS_STOP":
           trailingExit?"PROFIT_TRAIL":"MAX_HOLD");
         GlobalVariableDel(key);
         GlobalVariableDel(closeRetryKey);
      }
      else if(rc==TRADE_RETCODE_POSITION_CLOSED)
      {
         // MT5 already closed it in the background; not an unresolved failure.
         GlobalVariableDel(key);
         GlobalVariableDel(closeRetryKey);
      }
      else if(rc==TRADE_RETCODE_FROZEN)
      {
         GlobalVariableSet(closeRetryKey,(double)now);
         PrintFormat("Al-Qannas CLOSE frozen #%I64u: retry in %d sec; broker SL remains",
                     ticket,InpFrozenRetrySeconds);
      }
      else
         PrintFormat("Al-Qannas CLOSE failed #%I64u retcode=%u %s",
            ticket,rc,g_trade.ResultRetcodeDescription());
   }
}
void UpdateTickPressure()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick) || tick.ask<=tick.bid || tick.bid<=0)return;
   double mid=(tick.bid+tick.ask)*0.5;
   if(g_previousMid>0.0)
   {
      int direction=0;
      if(mid>g_previousMid+_Point*0.25)direction=1;
      if(mid<g_previousMid-_Point*0.25)direction=-1;
      if(direction!=0)
      {
         if(direction>0)g_upTicks++;
         else g_downTicks++;
         // Only the last 32 changing ticks affect the short-term entry signal.
         // Cumulative M1 tick counts can conceal sudden reversals.
         g_recentTickDirections[g_recentTickIndex]=direction;
         g_recentTickIndex=(g_recentTickIndex+1)%32;
         if(g_recentTickCount<32)g_recentTickCount++;
      }
   }
   g_previousMid=mid;
}

double RecentTickFlow()
{
   if(g_recentTickCount<=0)return 0.0;
   double sum=0.0;
   for(int i=0;i<g_recentTickCount;i++)
      sum+=(double)g_recentTickDirections[i];
   return sum/(double)g_recentTickCount;
}

int LocalSignal()
{
   // All historic input candles are CLOSED (shift 1), so no M5 look-ahead.
   // The live M1 bar and recent bid/ask ticks only confirm current direction.
   // This is heuristic MT5 analysis, not exchange order flow or Render AI.
   MqlRates bars[],m5[],live[];
   ArraySetAsSeries(bars,true);
   ArraySetAsSeries(m5,true);
   ArraySetAsSeries(live,true);
   int n=CopyRates(_Symbol,PERIOD_M1,1,24,bars);
   int n5=CopyRates(_Symbol,PERIOD_M5,1,12,m5);
   if(n<16 || n5<8 || CopyRates(_Symbol,PERIOD_M1,0,1,live)!=1)
   {
      g_status="Waiting for closed M1/M5 history";
      return 0;
   }
   double low=bars[0].low,high=bars[0].high,avgRange=0.0;
   for(int i=0;i<n;i++)
   {
      low=MathMin(low,bars[i].low);
      high=MathMax(high,bars[i].high);
      avgRange+=MathMax(_Point,bars[i].high-bars[i].low);
   }
   avgRange=MathMax(_Point,avgRange/n);
   g_referenceM1Range=avgRange; // Shared with pending-LIMIT pullback placement.

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick) || tick.ask<=tick.bid || tick.bid<=0)return 0;
   double spread=tick.ask-tick.bid;
   if(spread/avgRange>InpMaxSpreadRangeRatio)
   {
      g_status="Spread large relative to M1 range";
      return 0;
   }
   double liveRange=MathMax(live[0].high,tick.ask)-MathMin(live[0].low,tick.bid);
   if(liveRange>avgRange*InpMaxLiveCandleRange)
   {
      g_status="Live M1 spike / stretched candle";
      return 0;
   }
   if(g_recentTickCount<InpMinTickConfirm)
   {
      g_status="Collecting recent ticks";
      return 0;
   }
   double flow=RecentTickFlow();
   double avgM5=0.0;
   for(int i=0;i<n5;i++)
      avgM5+=MathMax(_Point,m5[i].high-m5[i].low);
   avgM5=MathMax(_Point,avgM5/n5);
   double m5trend=(m5[0].close-m5[3].close)/avgM5;
   double m5LastBody=(m5[0].close-m5[0].open)/avgM5;
   double m1momentum=(bars[0].close-bars[3].close)/avgRange;
   double m1body=(bars[0].close-bars[0].open)/avgRange;
   double m1WickReject=(MathMin(bars[0].open,bars[0].close)-bars[0].low
                        -bars[0].high+MathMax(bars[0].open,bars[0].close))/avgRange;
   double mid=(tick.bid+tick.ask)*0.5;
   double liveBody=(mid-live[0].open)/avgRange;

   // Approximate price-volume concentration using M1 tick volumes. Not real
   // exchange traded volume or a volume-profile/order-book feed.
   double poc=(low+high)*0.5;
   if(high-low>TickSize())
   {
      double hist[12];
      ArrayInitialize(hist,0.0);
      for(int i=0;i<n;i++)
      {
         double typical=(bars[i].high+bars[i].low+bars[i].close)/3.0;
         int k=(int)MathFloor((typical-low)/(high-low)*12.0);
         if(k<0)k=0;
         if(k>11)k=11;
         hist[k]+(double)bars[i].tick_volume;
      }
      int best=0;
      for(int i=1;i<12;i++)if(hist[i]>hist[best])best=i;
      poc=low+(best+0.5)*(high-low)/12.0;
   }

   // Weight closed M5 trend, closed M1 structure and the most recent ticks.
   double score=0.52*m5trend+0.18*m5LastBody+0.30*m1momentum+
                0.36*m1body+0.28*flow+0.26*liveBody+
                0.13*m1WickReject+0.10*(mid-poc)/avgRange;
   if(!MathIsValidNumber(score))
   {
      g_status="Invalid directional score";
      return 0;
   }
   double threshold=InpMinSignalScore;
   if(InpEntryStyle==AQ_FAST)threshold*=0.70;
   if(InpEntryStyle==AQ_PRECISION)threshold*=1.40;
   if(MathAbs(score)<threshold)
   {
      g_status="Direction confidence too low";
      return 0;
   }
   int side=(score>0.0?1:-1);
   double dirM5=side*(0.80*m5trend+0.20*m5LastBody);
   double dirM1=side*(0.70*m1momentum+0.30*m1body);
   double dirFlow=side*flow;
   double dirLive=side*liveBody;

   // Do not buy a one-minute rebound against a sustained M5 selloff, or
   // sell a one-minute dip against a sustained M5 rally.
   if(dirM5<=-InpM5ConflictScore)
   {
      g_status="Strong opposite M5 trend";
      return 0;
   }
   if(InpEntryStyle>=AQ_BALANCED &&
      (dirM5<InpMinM5Alignment || dirM1<=0.0 || dirFlow<-0.18 ||
       dirLive<-0.25))
   {
      g_status="M1 / M5 / tick trend mismatch";
      return 0;
   }
   if(InpEntryStyle==AQ_PRECISION &&
      (dirFlow<0.12 || dirLive<-0.02 || dirM1<0.12 ||
       dirM5<InpMinM5Alignment*1.70))
   {
      g_status="Precision entry not yet confirmed";
      return 0;
   }
   // The score is diagnostic only; only a successful broker LIMIT order
   // is an actual trade. No prediction accuracy is implied.
   g_status=StringFormat("Directional %s score=%.2f m5=%.2f flow=%.2f",
                         side>0?"BUY":"SELL",score,dirM5,dirFlow);
   return side;
}
void CancelStaleLimits()
{
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ||
      !MQLInfoInteger(MQL_TRADE_ALLOWED))return;
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick) || tick.bid<=0 || tick.ask<=tick.bid)return;
   datetime now=ServerNow();
   double flow=RecentTickFlow();
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket) || !OwnLimitOrder())continue;
      ENUM_ORDER_TYPE type=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      int side=(type==ORDER_TYPE_BUY_LIMIT?1:-1);
      double price=OrderGetDouble(ORDER_PRICE_OPEN);
      double distance=(side>0?tick.ask-price:price-tick.bid);
      int age=(int)(now-(datetime)OrderGetInteger(ORDER_TIME_SETUP));
      bool tooOld=(age>=InpMaxPendingAgeSec);
      bool priceDrift=(InpCancelOnPriceDrift &&
                       distance>InpCancelDistancePrice+TickSize()*0.5);
      bool flowFlip=(InpCancelOnFlowFlip && g_recentTickCount>=8 &&
                     side*flow< -0.60);
      if(!tooOld && !priceDrift && !flowFlip)continue;
      string reason=tooOld?"PENDING_AGE":priceDrift?"PRICE_DRIFT":"TICK_FLOW_FLIP";
      CancelPendingIfPossible(ticket,reason);
   }
}

bool PriceCashPerOne(int side,double entry,double &usd)
{
   double pnl=0.0;
   ENUM_ORDER_TYPE type=(side>0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL);
   double target=entry+(side>0 ? 1.0 : -1.0);
   if(!OrderCalcProfit(type,_Symbol,InpLots,entry,target,pnl)) return false;
   usd=MathAbs(pnl);
   return (usd>0.00001);
}

bool PlaceLimit(int side)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick)) return false;
   double spread=tick.ask-tick.bid;
   if(spread<=0 || spread>InpMaxSpreadPrice) { g_status="Spread too wide";return false; }
   if(ServerNow()-(datetime)tick.time>3) { g_status="Quote stale";return false; }
   // Wait for a modest pullback rather than placing a limit on the quote edge.
   double gap=MathMax(2.0*TickSize(),
                      MathMax(spread*0.20,InpEntryPullbackRange*g_referenceM1Range));
   double minDist=MinimumDistance();
   gap=MathMax(gap,minDist-spread+2.0*TickSize());
   double entry=(side>0 ? PriceRound(tick.bid-gap,-1) : PriceRound(tick.ask+gap,1));
   if(entry<=0) return false;
   // A LIMIT never chases an unreachable level. The distance is measured from
   // ASK for BUY LIMIT and BID for SELL LIMIT, i.e. executable-side quotes.
   // Keep the broker minimum stop distance; SKIP if it requires a distant order.
   double quoteDistance=(side>0?tick.ask-entry:entry-tick.bid);
   if(quoteDistance>InpMaxLimitDistancePrice+TickSize()*0.5)
   {
      g_status=StringFormat("LIMIT too far: %.3f > max %.3f",
                            quoteDistance,InpMaxLimitDistancePrice);
      return false;
   }
   if(side>0 && tick.ask-entry<minDist-1e-7) return false;
   if(side<0 && entry-tick.bid<minDist-1e-7) return false;

   double usdPerOne=0;
   if(!PriceCashPerOne(side,entry,usdPerOne)) {g_status="OrderCalcProfit failed";return false;}
   double budget=InpMaxLossUsd-InpCostReserveUsd;
   if(budget<=0) return false;
   double stopDist=budget/usdPerOne;
   if(stopDist<minDist+TickSize()) {g_status="Lot + $ loss limit cannot meet broker minimum SL distance";return false;}
   double tpDist=MathMax(minDist+TickSize(),(InpTakeNetUsd+InpCostReserveUsd)/usdPerOne);
   double sl=(side>0 ? PriceRound(entry-stopDist,1) : PriceRound(entry+stopDist,-1));
   double tp=(side>0 ? PriceRound(entry+tpDist,1) : PriceRound(entry-tpDist,-1));
   if(sl<=0 || tp<=0 || MathAbs(entry-sl)<minDist || MathAbs(tp-entry)<minDist) return false;
   double worst=0.0;
   ENUM_ORDER_TYPE type=(side>0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL);
   if(!OrderCalcProfit(type,_Symbol,InpLots,entry,sl,worst)) return false;
   if(-worst+InpCostReserveUsd>InpMaxLossUsd+0.01) return false;

   // Broker-side SPECIFIED expiration of just a few seconds often returns
   // TRADE_RETCODE_INVALID_EXPIRATION (10022). Prefer broker-supported GTC;
   // this EA explicitly removes all pending limits from the previous M1 bar
   // and on EA removal, regardless of broker expiration mode.
   datetime now=ServerNow();
   if(now >= g_barStart+52) return false; // No entry at very end of M1 candle.
   int flags=(int)SymbolInfoInteger(_Symbol,SYMBOL_EXPIRATION_MODE);
   ENUM_ORDER_TYPE_TIME lifetime=ORDER_TIME_GTC;
   datetime until=0;
   if((flags & SYMBOL_EXPIRATION_GTC)==SYMBOL_EXPIRATION_GTC)
   {
      lifetime=ORDER_TIME_GTC;
   }
   else if((flags & SYMBOL_EXPIRATION_DAY)==SYMBOL_EXPIRATION_DAY)
   {
      lifetime=ORDER_TIME_DAY;
   }
   else if((flags & SYMBOL_EXPIRATION_SPECIFIED)==SYMBOL_EXPIRATION_SPECIFIED)
   {
      // Specify a non-immediate broker expiration; still cancel at next M1 bar.
      lifetime=ORDER_TIME_SPECIFIED;
      until=now+3600;
   }
   else
   {
      g_status="No supported safe pending-order expiration mode";
      return false;
   }

   // Limit retry rate even if the broker/client REJECTS the request.
   g_lastOrderAt=ServerNow();
   bool ok=false;
   if(side>0)
      ok=g_trade.BuyLimit(InpLots,entry,_Symbol,sl,tp,lifetime,until,"AQ Gold demo BUY LIMIT");
   else
      ok=g_trade.SellLimit(InpLots,entry,_Symbol,sl,tp,lifetime,until,"AQ Gold demo SELL LIMIT");
   uint ret=g_trade.ResultRetcode();
   if(!ok || (ret!=TRADE_RETCODE_PLACED && ret!=TRADE_RETCODE_DONE))
   {
      g_status="Limit rejected: "+g_trade.ResultRetcodeDescription();
      PrintFormat("Al-Qannas LIMIT rejected %s %.3f retcode=%u expiration_mode=%d expiry_flags=%d %s",
         (side>0?"BUY":"SELL"),entry,ret,(int)lifetime,flags,g_trade.ResultRetcodeDescription());
      return false;
   }
   g_ordersThisBar++;
   g_lastOrderAt=now;
   g_status="LIMIT placed";
   PrintFormat("Al-Qannas %s LIMIT placed #%I64u lot=%.2f bid=%.*f ask=%.*f entry=%.*f distance=%.3f SL=%.*f TP=%.*f BUY fills on ASK / SELL fills on BID",
      (side>0?"BUY":"SELL"),g_trade.ResultOrder(),InpLots,
      _Digits,tick.bid,_Digits,tick.ask,_Digits,entry,quoteDistance,_Digits,sl,_Digits,tp);
   return true;
}

void DisplayStatus(double closed,double floating,int active)
{
   if(!InpShowChartStatus) return;
   Comment("AL-QANNAS GOLD | DEMO LIMIT | M1",
           "\nLot ",DoubleToString(InpLots,2)," | Pending+open: ",active,"/",InpMaxConcurrent,
           "\nDaily closed USD: ",DoubleToString(closed,2),
           " | Floating est: ",DoubleToString(floating,2),
           "\nPlaced this candle: ",g_ordersThisBar,"/",InpMaxEntriesPerM1,
           " | ",g_dayLocked?"DAY LOCK":(InpManualPause?"MANUAL PAUSE":"ACTIVE")," | ",g_status);
}

void Pulse()
{
   if(!DemoAccount()) {Comment("AL-QANNAS: REAL ACCOUNT BLOCKED");return;}
   if(_Period!=PERIOD_M1) return;
   ReadDay();
   datetime bar=iTime(_Symbol,PERIOD_M1,0);
   if(bar>0 && bar!=g_barStart)
   {
      g_barStart=bar;
      g_ordersThisBar=0;
      g_upTicks=0;
      g_downTicks=0;
      g_recentTickCount=0;
      g_recentTickIndex=0;
      if(InpCancelOnNewBar)
         RemoveOwnLimits(false); // Optional: expires previous candle's unfilled orders.
   }

   double closed=0.0;
   bool historyOK=ClosedProfitToday(closed);
   double floating=FloatingEstimate();
   if(!historyOK) {g_status="History unavailable - no new entry";}
   if(InpEnableDailyStop && historyOK && !g_dayLocked && closed+floating<=-InpDailyStopUsd)
   {
      g_dayLocked=true;
      GlobalVariableSet(g_lockKey,1.0);
      g_status="Daily loss lock";
      PrintFormat("Al-Qannas daily stop triggered: closed=%.2f floating=%.2f",closed,floating);
   }
   if(g_dayLocked) RemoveOwnLimits(true);
   ManagePositions(g_dayLocked);
   if(!g_dayLocked)CancelStaleLimits(); // TTL and optional drift/flow cancellation only.
   int active=CountActive();
   DisplayStatus(closed,floating,active);
   if(!historyOK || g_dayLocked || g_barStart<=0 || !ExactVolume()) return;
   if(InpManualPause)
   {
      RemoveOwnLimits(true); // Avoid filling an old LIMIT while manually paused.
      g_status="Manual NEW ENTRY pause from Expert Inputs";
      DisplayStatus(closed,floating,CountActive());
      return;
   }
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))
   {
      g_status="Enable Algo Trading in terminal (Ctrl+O > Expert Advisors)";
      DisplayStatus(closed,floating,active);
      return;
   }
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED))
   {
      g_status="Allow Algo Trading for THIS EA (F7 > Common)";
      DisplayStatus(closed,floating,active);
      return;
   }
   if(!AccountInfoInteger(ACCOUNT_TRADE_EXPERT))
   {
      g_status="Broker/account prohibits automated trading";
      DisplayStatus(closed,floating,active);
      return;
   }
   if((ENUM_SYMBOL_TRADE_MODE)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_MODE)!=SYMBOL_TRADE_MODE_FULL) return;
   if(ServerNow()-g_lastOrderAt<InpMinOrderSpacingSec) return;
   if(g_ordersThisBar>=InpMaxEntriesPerM1) return;
   int slots=(int)InpMaxConcurrent;
   if((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
      slots=1; // Netting accounts cannot independently manage four positions.
   if(active>=slots) return;
   int side=LocalSignal();
   if(side>0 && InpTradeDirection==AQ_SELLS_ONLY)side=0;
   if(side<0 && InpTradeDirection==AQ_BUYS_ONLY)side=0;
   if(side!=0) PlaceLimit(side);
}

int OnInit()
{
   if(_Period!=PERIOD_M1) {Alert("Al-Qannas Gold EA requires M1 chart");return INIT_FAILED;}
   string symbol=_Symbol;
   StringToUpper(symbol);
   if(StringFind(symbol,"XAU")<0 && StringFind(symbol,"GOLD")<0)
   {
      Alert("Al-Qannas Gold EA requires XAU/GOLD symbol");return INIT_FAILED;
   }
   if(!DemoAccount()) {Alert("Al-Qannas Gold EA refuses REAL accounts");return INIT_FAILED;}
   if(AccountInfoString(ACCOUNT_CURRENCY)!="USD")
   {
      Alert("Al-Qannas Gold EA dollar thresholds require a USD account");return INIT_FAILED;
   }
   if(!ExactVolume() ||
      (int)InpEntryStyle<0 || (int)InpEntryStyle>2 ||
      (int)InpTradeDirection<0 || (int)InpTradeDirection>2 ||
      InpTakeNetUsd<=0 || InpMaxLossUsd<=InpCostReserveUsd ||
      InpTrailArmUsd<=0 || InpTrailStartUsd<=InpTrailArmUsd ||
      InpTrailGivebackUsd<=0 || InpTrailGivebackUsd>=InpTrailStartUsd ||
      InpProfitLockUsd<=0 || InpProfitLockUsd>=InpTrailArmUsd ||
      InpMinSignalScore<0 || InpM5ConflictScore<0 || InpMinM5Alignment<0 ||
      InpMinTickConfirm<0 || InpMaxSpreadRangeRatio<=0 ||
      InpMaxLiveCandleRange<=0 || InpEntryPullbackRange<0 ||
      InpEntryPullbackRange>1 || InpMaxLimitDistancePrice<=2.0*TickSize() ||
      InpMaxPendingAgeSec<2 || InpCancelDistancePrice<=0 ||
      InpFrozenCancelRetrySec<1 || InpDailyStopUsd<=0 ||
      (InpEnableDailyStop && InpDailyStopUsd<=InpMaxLossUsd) ||
      InpMaxHoldSeconds<1 || InpMaxConcurrent<1 || InpMaxConcurrent>20 ||
      InpMaxEntriesPerM1<1 || InpMaxEntriesPerM1>30 ||
      InpMinOrderSpacingSec<1 || InpFrozenRetrySeconds<1 || InpMaxSpreadPrice<=0)
   {
      Alert("Al-Qannas invalid Expert Inputs. Check risk, volume step, and entry settings.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(((int)SymbolInfoInteger(_Symbol,SYMBOL_ORDER_MODE) & SYMBOL_ORDER_LIMIT)!=SYMBOL_ORDER_LIMIT)
   {
      Alert("Exness gold symbol does not allow LIMIT orders");return INIT_FAILED;
   }
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(30);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_trade.SetAsyncMode(false);
   ReadDay();
   EventSetTimer(1);
   PrintFormat("Al-Qannas Gold DEMO v1.15: %s lot=%.2f hardTP=%.2f stop=%.2f arm=%.2f trail=%.2f giveback=%.2f daily=%.2f",
       _Symbol,InpLots,InpTakeNetUsd,InpMaxLossUsd,InpTrailArmUsd,InpTrailStartUsd,InpTrailGivebackUsd,InpDailyStopUsd);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   RemoveOwnLimits(true); // Avoid leaving unfilled GTC orders after EA removal.
   Comment("");
}
void OnTick() {UpdateTickPressure();Pulse();}
void OnTimer(){Pulse();}
