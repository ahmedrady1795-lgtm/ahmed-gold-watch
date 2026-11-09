//+------------------------------------------------------------------+
//| AL-QANNAS CANDLE CHASER v1.02 - EXNESS DEMO ONLY                  |
//| Inspired by the visible MT5 video: trailing BUY STOP/SELL STOP  |
//| pending orders which become actual BUY/SELL deals on activation. |
//| Separate from Gold LIMIT and Sniper 2.0 EAs; no profit guarantee.|
//+------------------------------------------------------------------+
#property strict
#property version "1.05"
#property description "Candle Chaser 1.05: broker-cost-aware volume and truthful WAIT logs. DEMO ONLY."
#include <Trade/Trade.mqh>

input bool   InpManualPause             = false;  // Pause NEW orders, manage existing trades
input double InpLots                    = 0.02;   // Maximum DEMO lot, never increased
input bool   InpAutoReduceLots          = true;   // If 0.02 cost is too high, try smaller broker lot
input double InpArmDistancePrice        = 0.20;   // Follow M1 with BUY STOP above ASK / SELL STOP below BID
input double InpRepriceStepPrice        = 0.12;   // Move pending stops after quote moves by this much
input int    InpRepriceCooldownSec      = 3;      // Minimum interval between moving one pending order
input double InpMaxSpreadPrice          = 0.85;   // Never chase an excessive bid/ask spread
input double InpCloseNetProfitUsd       = 1.25;   // Ask for immediate exit at this ESTIMATED net profit
input double InpBrokerTargetNetUsd      = 1.65;   // Attach broker TP as backup
input double InpMaxLossUsd             = 1.25;   // Intended per-position SL budget, not a fill guarantee
input double InpCostReserveUsd         = 0.20;   // Conservative estimated fees, excludes unknown slippage
input int    InpMaxHoldSec             = 150;    // Allow up to 2.5 min for a winning movement
input int    InpLocalLossGraceSec       = 18;     // Don't panic-close initial floating spread loss
input double InpMaxEntryCostToLossRatio = 0.70;   // Allow up to 70% of stop budget incl fees (remaining buffer)
input int    InpMaxFillsPerM1          = 20;     // Allows repeated entries per M1; one open at a time
input int    InpMaxPendingAgeSec       = 50;     // Replace stale pending stops
input bool   InpCancelOnNewBar         = true;   // Follow the new M1 instead of stale previous levels
input bool   InpEnableDailyStop        = true;   // Optional cumulative day limit; user controlled
input double InpDailyStopUsd           = 40.00;  // Used only if enabled
input double InpMinDirectionScorePrice  = 0.18;   // Completed M1 plus current bid pressure
input double InpM5ConflictBodyPrice    = 1.50;   // Avoid strong opposite completed M5 candle
input double InpMaxEntryCostToWinRatio  = 0.70;   // (spread + reserve) / intended profit
input int    InpLossCooldownSec        = 15;     // Short pause after losing broker exit
input int    InpFrozenRetrySec         = 5;      // Slow down retcode 10029 retries
input ulong  InpMagic                  = 560179530; // Different from all previous Al-Qannas EAs
input bool   InpShowStatus             = true;

CTrade g_trade;
datetime g_barTime=0;
datetime g_dayStarted=0;
datetime g_lastBuyReprice=0;
datetime g_lastSellReprice=0;
datetime g_lastCancelAttempt=0;
datetime g_lastCloseAttempt=0;
datetime g_lastBracketBuild=0;
datetime g_lastLossDealAt=0;
bool     g_rearmOnNextPulse=false; // Priority rearm as soon as position closes
int      g_fillsThisBar=0;
int      g_requestsThisBar=0;
int      g_totalFills=0;
int      g_totalCloses=0;
string   g_status="Starting";
string   g_lastFillKey="";
string   g_dayLockKey="";
bool     g_dayLocked=false;
double   g_candleFirstBid=0.0;
double   g_candleHigh=0.0;
double   g_candleLow=0.0;
int      g_lastPulseSecond=-1;

bool IsDemo()
{
   return (ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE)==ACCOUNT_TRADE_MODE_DEMO;
}
datetime Clock(){return TimeCurrent();}
double Unit()
{
   double step=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   return (step>0?step:_Point);
}
double RoundToTick(double price,int direction)
{
   double step=Unit();
   if(direction>0)return NormalizeDouble(MathCeil(price/step-1e-8)*step,_Digits);
   if(direction<0)return NormalizeDouble(MathFloor(price/step+1e-8)*step,_Digits);
   return NormalizeDouble(MathRound(price/step)*step,_Digits);
}
double StopLevel()
{
   return MathMax(Unit(),(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*_Point+Unit());
}
double FreezeLevel()
{
   return (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL)*_Point+Unit();
}
bool CurrentQuote(MqlTick &tick)
{
   return (SymbolInfoTick(_Symbol,tick) && tick.bid>0 && tick.ask>tick.bid &&
           Clock()-(datetime)tick.time<=5);
}
bool OwnSelectedPosition()
{
   return PositionGetString(POSITION_SYMBOL)==_Symbol &&
          (ulong)PositionGetInteger(POSITION_MAGIC)==InpMagic;
}
bool OwnSelectedOrder()
{
   if(OrderGetString(ORDER_SYMBOL)!=_Symbol ||
      (ulong)OrderGetInteger(ORDER_MAGIC)!=InpMagic)return false;
   ENUM_ORDER_TYPE t=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
   return t==ORDER_TYPE_BUY_STOP || t==ORDER_TYPE_SELL_STOP;
}
int PositionCount()
{
   int n=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket!=0 && PositionSelectByTicket(ticket) && OwnSelectedPosition())n++;
   }
   return n;
}
int PendingCount()
{
   int n=0;
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket!=0 && OrderSelect(ticket) && OwnSelectedOrder())n++;
   }
   return n;
}
ulong StopTicket(int direction)
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket) || !OwnSelectedOrder())continue;
      ENUM_ORDER_TYPE t=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      if((direction>0 && t==ORDER_TYPE_BUY_STOP) ||
         (direction<0 && t==ORDER_TYPE_SELL_STOP))return ticket;
   }
   return 0;
}
bool BrokerTradeReady()
{
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))
   {g_status="Enable terminal Algo Trading";return false;}
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED))
   {g_status="Enable EA Algo Trading on chart";return false;}
   if(!AccountInfoInteger(ACCOUNT_TRADE_EXPERT))
   {g_status="Broker disables EA trading";return false;}
   if((ENUM_SYMBOL_TRADE_MODE)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_MODE)!=SYMBOL_TRADE_MODE_FULL)
   {g_status="Symbol not fully tradeable";return false;}
   return true;
}
bool ProperLot()
{
   double min=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double max=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   if(step<=0 || InpLots<min-1e-9 || InpLots>max+1e-9)return false;
   double steps=InpLots/step;
   return MathAbs(steps-MathRound(steps))<1e-6;
}
bool MoneyPerPriceUnit(int direction,double entry,double volume,double &cash)
{
   double profit=0.0;
   ENUM_ORDER_TYPE t=(direction>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL);
   double next=(direction>0?entry+1.0:entry-1.0);
   if(next<=0 || !OrderCalcProfit(t,_Symbol,volume,entry,next,profit))return false;
   cash=MathAbs(profit);
   return cash>0;
}
// Return an SL and TP prevalidated against price tick, broker minimum distance
// and intended dollar risk. Some market slippage/freeze can still overrun.
bool ProtectedPrices(int direction,double entry,double volume,double &sl,double &tp)
{
   double cash=0;
   if(!MoneyPerPriceUnit(direction,entry,volume,cash))
   {g_status="OrderCalcProfit unavailable";return false;}
   double budget=InpMaxLossUsd-InpCostReserveUsd;
   double minDist=StopLevel();
   double slDistance=budget/cash;
   if(slDistance<minDist+Unit())
   {g_status="Lot/risk incompatible with broker minimum SL";return false;}
   double tpDistance=MathMax(minDist+2*Unit(),
             (InpBrokerTargetNetUsd+InpCostReserveUsd)/cash);
   sl=(direction>0?RoundToTick(entry-slDistance,1):
                   RoundToTick(entry+slDistance,-1));
   tp=(direction>0?RoundToTick(entry+tpDistance,1):
                   RoundToTick(entry-tpDistance,-1));
   if(sl<=0 || tp<=0 || MathAbs(entry-sl)<minDist ||
      MathAbs(tp-entry)<minDist)return false;
   double worst=0;
   ENUM_ORDER_TYPE t=(direction>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL);
   if(!OrderCalcProfit(t,_Symbol,volume,entry,sl,worst))return false;
   if(-worst+InpCostReserveUsd>InpMaxLossUsd+0.01)return false;
   return true;
}
bool Expiration(ENUM_ORDER_TYPE_TIME &lifetime,datetime &until)
{
   int f=(int)SymbolInfoInteger(_Symbol,SYMBOL_EXPIRATION_MODE);
   lifetime=ORDER_TIME_GTC;until=0;
   if((f&SYMBOL_EXPIRATION_GTC)==SYMBOL_EXPIRATION_GTC)return true;
   if((f&SYMBOL_EXPIRATION_DAY)==SYMBOL_EXPIRATION_DAY)
   {lifetime=ORDER_TIME_DAY;return true;}
   if((f&SYMBOL_EXPIRATION_SPECIFIED)==SYMBOL_EXPIRATION_SPECIFIED)
   {lifetime=ORDER_TIME_SPECIFIED;until=Clock()+3600;return true;}
   g_status="Broker does not support pending STOP expiry";
   return false;
}
bool StopIsFrozen(ulong ticket,const MqlTick &tick)
{
   if(!OrderSelect(ticket))return false;
   ENUM_ORDER_TYPE t=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
   double entry=OrderGetDouble(ORDER_PRICE_OPEN);
   double quote=(t==ORDER_TYPE_BUY_STOP?tick.ask:tick.bid);
   return MathAbs(entry-quote)<=FreezeLevel();
}
bool TryCancel(ulong ticket,string reason)
{
   if(!BrokerTradeReady() || !OrderSelect(ticket) || !OwnSelectedOrder())return false;
   datetime now=Clock();
   if(now-g_lastCancelAttempt<InpFrozenRetrySec)return false;
   MqlTick tick;
   if(CurrentQuote(tick) && StopIsFrozen(ticket,tick))
   {g_status="Broker freeze: pending cancel deferred";return false;}
   bool ok=g_trade.OrderDelete(ticket);
   uint rc=g_trade.ResultRetcode();
   if(ok && rc==TRADE_RETCODE_DONE)
   {
      // Successful cancels must not throttle the opposite pending stop.
      g_lastCancelAttempt=0;
      PrintFormat("AQ_CHASER CANCEL #%I64u reason=%s",ticket,reason);
      return true;
   }
   g_lastCancelAttempt=now; // Only broker refusals use retry cooldown.
   g_status="Cancel retry: "+g_trade.ResultRetcodeDescription();
   PrintFormat("AQ_CHASER CANCEL rejected #%I64u rc=%u reason=%s",ticket,rc,reason);
   return false;
}
void CancelAllPending(string reason)
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket) || !OwnSelectedOrder())continue;
      TryCancel(ticket,reason);
   }
}
bool DayProfit(double &sum)
{
   sum=0;
   MqlDateTime date;TimeToStruct(Clock(),date);
   date.hour=0;date.min=0;date.sec=0;
   datetime start=StructToTime(date);
   if(!HistorySelect(start,Clock()+1))return false;
   for(int i=0;i<HistoryDealsTotal();i++)
   {
      ulong id=HistoryDealGetTicket(i);
      if(id==0)continue;
      if(HistoryDealGetString(id,DEAL_SYMBOL)!=_Symbol ||
         (ulong)HistoryDealGetInteger(id,DEAL_MAGIC)!=InpMagic)continue;
      sum+=HistoryDealGetDouble(id,DEAL_PROFIT)
          +HistoryDealGetDouble(id,DEAL_COMMISSION)
          +HistoryDealGetDouble(id,DEAL_SWAP)
          +HistoryDealGetDouble(id,DEAL_FEE);
   }
   return true;
}
double FloatingProfit()
{
   double profit=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket) || !OwnSelectedPosition())continue;
      profit+=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
   }
   return profit;
}
void RefreshTradingDay()
{
   MqlDateTime d;TimeToStruct(Clock(),d);
   d.hour=0;d.min=0;d.sec=0;
   datetime today=StructToTime(d);
   if(today==g_dayStarted)return;
   g_dayStarted=today;
   g_dayLockKey="AQChaser_Day_"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+
                "_"+_Symbol+"_"+IntegerToString((long)InpMagic)+
                "_"+IntegerToString((long)today);
   g_dayLocked=(InpEnableDailyStop && GlobalVariableCheck(g_dayLockKey));
}
int FillsOnBar(datetime bar)
{
   if(bar<=0 || !HistorySelect(bar,Clock()+1))return 0;
   int total=0;
   for(int i=0;i<HistoryDealsTotal();i++)
   {
      ulong id=HistoryDealGetTicket(i);
      if(id==0 || HistoryDealGetString(id,DEAL_SYMBOL)!=_Symbol ||
         (ulong)HistoryDealGetInteger(id,DEAL_MAGIC)!=InpMagic)continue;
      if((ENUM_DEAL_ENTRY)HistoryDealGetInteger(id,DEAL_ENTRY)==DEAL_ENTRY_IN)
         total++;
   }
   return total;
}
bool RiskStop()
{
   if(!InpEnableDailyStop)return false;
   double closed=0;
   if(!DayProfit(closed)){g_status="Daily history unavailable";return true;}
   if(closed+FloatingProfit()<=-InpDailyStopUsd)
   {
      g_dayLocked=true;
      GlobalVariableSet(g_dayLockKey,1);
   }
   return g_dayLocked;
}
void ManagePositions()
{
   datetime now=Clock();
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket) || !OwnSelectedPosition())continue;
      double net=PositionGetDouble(POSITION_PROFIT)
                +PositionGetDouble(POSITION_SWAP)-InpCostReserveUsd;
      int age=(int)(now-(datetime)PositionGetInteger(POSITION_TIME));
      string reason="";
      if(g_dayLocked)reason="DAY_LOCK";
      else if(net>=InpCloseNetProfitUsd)reason="FAST_NET_PROFIT";
      else if(net<=-InpMaxLossUsd && age>=InpLocalLossGraceSec)
         reason="LOSS_AFTER_GRACE";
      else if(age>=InpMaxHoldSec)reason="MAX_HOLD";
      // During the initial grace, EA doesn't close for floating loss.
      // Broker SL/TP remain active and CAN still fill before grace ends.
      if(reason=="")continue;
      if(now-g_lastCloseAttempt<InpFrozenRetrySec)continue;
      if(!BrokerTradeReady())return;
      g_lastCloseAttempt=now;
      bool done=g_trade.PositionClose(ticket);
      uint rc=g_trade.ResultRetcode();
      if(done && (rc==TRADE_RETCODE_DONE || rc==TRADE_RETCODE_DONE_PARTIAL))
      {
         // A fully closed position should be followed by a fresh STOP chase
         // at the next tick (or the 1-second timer), in the SAME M1 candle.
         // Partial close is not a fresh-entry signal.
         if(rc==TRADE_RETCODE_DONE)
         {
            g_rearmOnNextPulse=true;
            g_lastPulseSecond=-1;
         }
         PrintFormat("AQ_CHASER CLOSE #%I64u net_est=%.2f age=%d reason=%s next=REARM_AFTER_FULL_CLOSE",
                     ticket,net,age,reason);
      }
      else if(rc!=TRADE_RETCODE_POSITION_CLOSED)
      {
         g_status="Close retry: "+g_trade.ResultRetcodeDescription();
         PrintFormat("AQ_CHASER CLOSE refused #%I64u rc=%u reason=%s",
                     ticket,rc,reason);
      }
   }
}
bool PlaceStop(int direction,double level,double volume)
{
   double sl,tp;
   if(!ProtectedPrices(direction,level,volume,sl,tp))return false;
   ENUM_ORDER_TYPE_TIME life;datetime until;
   if(!Expiration(life,until))return false;
   bool ok=(direction>0
      ?g_trade.BuyStop(volume,level,_Symbol,sl,tp,life,until,"CHASER BUY STOP")
      :g_trade.SellStop(volume,level,_Symbol,sl,tp,life,until,"CHASER SELL STOP"));
   uint rc=g_trade.ResultRetcode();
   g_requestsThisBar++;
   if(!ok || (rc!=TRADE_RETCODE_PLACED && rc!=TRADE_RETCODE_DONE))
   {
      g_status="STOP rejected: "+g_trade.ResultRetcodeDescription();
      PrintFormat("AQ_CHASER %s STOP rejected price=%.*f rc=%u %s",
                  direction>0?"BUY":"SELL",_Digits,level,rc,
                  g_trade.ResultRetcodeDescription());
      return false;
   }
   PrintFormat("AQ_CHASER %s STOP PLACED #%I64u price=%.*f lot=%.2f SL=%.*f TP=%.*f",
               direction>0?"BUY":"SELL",g_trade.ResultOrder(),_Digits,level,
               volume,_Digits,sl,_Digits,tp);
   g_status="Moving STOP bracket active";
   if(direction>0)g_lastBuyReprice=Clock();else g_lastSellReprice=Clock();
   return true;
}
bool FollowStop(int direction,ulong ticket,double desired,const MqlTick &tick)
{
   if(!OrderSelect(ticket) || !OwnSelectedOrder())return false;
   double previous=OrderGetDouble(ORDER_PRICE_OPEN);
   datetime now=Clock();
   datetime last=(direction>0?g_lastBuyReprice:g_lastSellReprice);
   if(MathAbs(previous-desired)<InpRepriceStepPrice-Unit()*0.5 ||
      now-last<InpRepriceCooldownSec)return false;
   // One-way ratchet: a BUY STOP may be lowered after price retraces,
   // never raised as price rallies toward its trigger; a SELL STOP may
   // be raised after a bounce, never lowered as price falls toward it.
   // Old bidirectional repricing chased breakouts away from the current
   // market and amplified reversal entries observed in the demo video.
   if(direction>0 && desired>=previous-Unit()*0.5)return false;
   if(direction<0 && desired<=previous+Unit()*0.5)return false;
   if(StopIsFrozen(ticket,tick))return false;
   // Reprice protects the exact volume of the broker's existing order.
   double existingVolume=OrderGetDouble(ORDER_VOLUME_CURRENT);
   double sl,tp;
   if(existingVolume<=0 ||
      !ProtectedPrices(direction,desired,existingVolume,sl,tp))
      return false;
   ENUM_ORDER_TYPE_TIME lifetime=(ENUM_ORDER_TYPE_TIME)OrderGetInteger(ORDER_TYPE_TIME);
   datetime expiry=(datetime)OrderGetInteger(ORDER_TIME_EXPIRATION);
   bool sent=g_trade.OrderModify(ticket,desired,sl,tp,lifetime,expiry);
   uint rc=g_trade.ResultRetcode();
   if(direction>0)g_lastBuyReprice=now;else g_lastSellReprice=now;
   if(sent && rc==TRADE_RETCODE_DONE)
   {
      PrintFormat("AQ_CHASER %s STOP FOLLOW #%I64u old=%.*f new=%.*f",
                  direction>0?"BUY":"SELL",ticket,_Digits,previous,_Digits,desired);
      return true;
   }
   g_status="Reprice delayed: "+g_trade.ResultRetcodeDescription();
   return false;
}
// Use completed Exness M1/M5 bars plus the latest broker quote.
// A trend candidate is not a guaranteed pre-candle prediction.
int ConfirmedChaseDirection(const MqlTick &tick)
{
   MqlRates m1[],m5[];
   // CopyRates writes the oldest bar first in non-series arrays.
   if(CopyRates(_Symbol,PERIOD_M1,1,3,m1)!=3 ||
      CopyRates(_Symbol,PERIOD_M5,1,2,m5)!=2)
   {g_status="WAIT: closed M1/M5 candles missing";return 0;}
   double body=m1[2].close-m1[2].open;
   double continuation=m1[2].close-m1[1].close;
   double live=tick.bid-m1[2].close;
   double score=0.60*body+0.25*continuation+0.15*live;
   if(!MathIsValidNumber(score) ||
      MathAbs(score)<InpMinDirectionScorePrice)
   {g_status="WAIT: weak M1 directional pressure";return 0;}
   double m5Body=m5[1].close-m5[1].open;
   if(score*m5Body<0.0 &&
      MathAbs(m5Body)>=InpM5ConflictBodyPrice)
   {g_status="WAIT: strong opposite completed M5 candle";return 0;}
   return (score>0.0?1:-1);
}

// A wide spread can make a +1.25 USD take unreachable after costs.
// OrderCalcProfit uses the current Exness symbol contract, not a guessed lot.
bool EntryCostsAllow(const MqlTick &tick)
{
   double pnl=0.0;
   if(!OrderCalcProfit(ORDER_TYPE_BUY,_Symbol,InpLots,
                       tick.ask,tick.bid,pnl) ||
      !MathIsValidNumber(pnl))
   {g_status="WAIT: broker cost model unavailable";return false;}
   double initialCost=MathMax(0.0,-pnl)+InpCostReserveUsd;
   if(initialCost>=InpCloseNetProfitUsd*InpMaxEntryCostToWinRatio ||
      initialCost>=InpMaxLossUsd*InpMaxEntryCostToLossRatio)
   {
      // A large opening spread would eat the SL budget before price moves.
      // A time grace cannot override broker-side stop execution.
      g_status="WAIT: spread+fees too costly for profit or stop budget";
      return false;
   }
   return true;
}
void FollowBracket()
{
   MqlTick tick;
   if(!CurrentQuote(tick))
   {g_status="Waiting for live XAU Bid/Ask";return;}
   if(tick.ask-tick.bid>InpMaxSpreadPrice)
   {g_status="Spread too wide for chase";return;}
   if(!EntryCostsAllow(tick))
   {
      CancelAllPending("COST_TOO_HIGH");
      return;
   }
   if(g_lastLossDealAt>0 && Clock()-g_lastLossDealAt<InpLossCooldownSec)
   {
      CancelAllPending("LOSS_COOLDOWN");
      g_status="WAIT: loss reentry cooldown";
      return;
   }
   if(PositionCount()>0)
   {
      CancelAllPending("POSITION_FILLED");
      return;
   }
   if(g_fillsThisBar>=InpMaxFillsPerM1)
   {CancelAllPending("M1_FILL_LIMIT");g_status="M1 fill quota complete";return;}
   if(!BrokerTradeReady())return;
   double distance=MathMax(InpArmDistancePrice,StopLevel()+Unit());
   double buy=RoundToTick(tick.ask+distance,1);
   double sell=RoundToTick(tick.bid-distance,-1);
   if(buy<=tick.ask || sell<=0 || sell>=tick.bid)return;
   // The old both-sided bracket repeatedly bought and sold noise.
   // Only one pending STOP may exist, with M1 direction and M5 conflict check.
   const int direction=ConfirmedChaseDirection(tick);
   if(direction==0)
   {
      CancelAllPending("NO_CONFIRMED_DIRECTION");
      return;
   }
   const int opposite=-direction;
   ulong oppositeTicket=StopTicket(opposite);
   if(oppositeTicket!=0)
   {
      TryCancel(oppositeTicket,"SIDE_CONFLICT");
      if(StopTicket(opposite)!=0)return; // frozen order cannot coexist with new side
   }
   double desired=(direction>0?buy:sell);
   ulong active=StopTicket(direction);
   if(active!=0)
      FollowStop(direction,active,desired,tick);
   else if(PositionCount()==0 && Clock()-g_lastBracketBuild>=1)
   {
      g_lastBracketBuild=Clock();
      PlaceStop(direction,desired);
   }
   if(StopTicket(direction)!=0)
      g_rearmOnNextPulse=false;
}
void ExpireStaleStops()
{
   datetime now=Clock();
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket) || !OwnSelectedOrder())continue;
      int age=(int)(now-(datetime)OrderGetInteger(ORDER_TIME_SETUP));
      if(age>=InpMaxPendingAgeSec)TryCancel(ticket,"PENDING_AGE");
   }
}
void ShowStatus()
{
   if(!InpShowStatus)return;
   Comment("AL-QANNAS CANDLE CHASER | GOLD DEMO M1",
           "\nDIRECTIONAL STOP follows M1/M5 and ASK/BID.",
           "\nLot ",DoubleToString(InpLots,2),
           " | Pending ",PendingCount()," | Open ",PositionCount(),
           "\nM1 fills ",g_fillsThisBar,"/",InpMaxFillsPerM1,
           " | Total fills ",g_totalFills," | closed deals ",g_totalCloses,
           "\nNet floating est ",DoubleToString(FloatingProfit()-InpCostReserveUsd,2),
           " | ",(InpManualPause?"PAUSED":g_dayLocked?"DAY STOP":"ACTIVE"),
           "\n",g_status);
}
void Pulse()
{
   if(!IsDemo())return;
   RefreshTradingDay();
   datetime now=Clock();
   datetime candle=iTime(_Symbol,PERIOD_M1,0);
   if(candle!=0 && candle!=g_barTime)
   {
      g_barTime=candle;
      g_fillsThisBar=FillsOnBar(candle);
      g_requestsThisBar=0;
      g_lastPulseSecond=-1;
      if(InpCancelOnNewBar)CancelAllPending("NEW_M1");
   }
   ManagePositions(); // Check profits on EACH tick, even during throttle.
   int second=(int)(now%2147483600);
   // Deal-close event may arrive in the very same second: bypass the usual
   // one-second bracket refresh throttle ONCE on the next tick/timer cycle.
   // Do not spin on every tick if the broker cannot accept a STOP bracket.
   bool priorityRearm=g_rearmOnNextPulse;
   g_rearmOnNextPulse=false;
   if(second==g_lastPulseSecond && !priorityRearm)return;
   g_lastPulseSecond=second;
   if(RiskStop())
   {
      CancelAllPending("DAILY_STOP");
      g_status="Optional day stop triggered";
      ShowStatus();return;
   }
   if(InpManualPause)
   {
      CancelAllPending("MANUAL_PAUSE");
      g_status="Manual pause: no new STOPs";
      ShowStatus();return;
   }
   ExpireStaleStops();
   FollowBracket();
   ShowStatus();
}
int OnInit()
{
   if(_Period!=PERIOD_M1){Alert("Candle Chaser requires GOLD M1");return INIT_FAILED;}
   string sym=_Symbol;StringToUpper(sym);
   if(StringFind(sym,"XAU")<0 && StringFind(sym,"GOLD")<0)
   {Alert("Use GOLD / XAUUSD M1");return INIT_FAILED;}
   if(!IsDemo()){Alert("Candle Chaser blocks real-money trading");return INIT_FAILED;}
   if(AccountInfoString(ACCOUNT_CURRENCY)!="USD")
   {Alert("Candle Chaser requires a USD demo account");return INIT_FAILED;}
   if(!ProperLot() || InpArmDistancePrice<=0 || InpRepriceStepPrice<=0 ||
      InpRepriceCooldownSec<1 || InpRepriceCooldownSec>120 ||
      InpMaxSpreadPrice<=0 || InpCloseNetProfitUsd<=0 ||
      InpBrokerTargetNetUsd<InpCloseNetProfitUsd ||
      InpCostReserveUsd<0 || InpMaxLossUsd<=InpCostReserveUsd ||
      InpMaxHoldSec<5 || InpMaxFillsPerM1<1 || InpMaxFillsPerM1>60 ||
      InpMaxPendingAgeSec<5 || InpDailyStopUsd<=0 || InpFrozenRetrySec<1 ||
       InpMinDirectionScorePrice<=0 || InpM5ConflictBodyPrice<0 ||
       InpMaxEntryCostToWinRatio<=0 || InpMaxEntryCostToWinRatio>1.0 ||
       InpLossCooldownSec<0 || InpLossCooldownSec>90 ||
       InpLocalLossGraceSec<0 || InpLocalLossGraceSec>60 ||
       InpMaxHoldSec<=InpLocalLossGraceSec ||
       InpMaxEntryCostToLossRatio<=0 ||
       InpMaxEntryCostToLossRatio>0.85)
   {Alert("Candle Chaser invalid Inputs: review lots, stop, target, timing.");return INIT_PARAMETERS_INCORRECT;}
   int allowed=(int)SymbolInfoInteger(_Symbol,SYMBOL_ORDER_MODE);
   if((allowed&SYMBOL_ORDER_STOP)!=SYMBOL_ORDER_STOP)
   {Alert("Symbol does not permit BUY STOP / SELL STOP");return INIT_FAILED;}
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(30);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_trade.SetAsyncMode(false);
   RefreshTradingDay();
   PrintFormat("AQ_CHASER START v1.05 DEMO ADAPTIVE_VOLUME symbol=%s lot=%.2f arm=%.3f follow=%.3f netClose=%.2f maxLoss=%.2f",
               _Symbol,InpLots,InpArmDistancePrice,InpRepriceStepPrice,
               InpCloseNetProfitUsd,InpMaxLossUsd);
   EventSetTimer(1);
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason)
{
   EventKillTimer();
   CancelAllPending("EA_DETACH");
   Comment("");
}
void OnTick(){Pulse();}
void OnTimer(){Pulse();}
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type!=TRADE_TRANSACTION_DEAL_ADD || trans.deal==0)return;
   if(!HistoryDealSelect(trans.deal))return;
   if(HistoryDealGetString(trans.deal,DEAL_SYMBOL)!=_Symbol ||
      (ulong)HistoryDealGetInteger(trans.deal,DEAL_MAGIC)!=InpMagic)return;
   ENUM_DEAL_ENTRY entry=(ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal,DEAL_ENTRY);
   if(entry==DEAL_ENTRY_IN)
   {
      g_fillsThisBar++;
      g_totalFills++;
      g_status="STOP triggered into a live position";
      // Opposite pending STOP is OCO-like: promptly request cancel on fill.
      // Broker freezes or simultaneous spikes can still execute both orders.
      CancelAllPending("DEAL_FILLED_CANCEL_OPPOSITE");
   }
   else if(entry==DEAL_ENTRY_OUT || entry==DEAL_ENTRY_INOUT)
   {
      g_totalCloses++;
      const double closingNet=HistoryDealGetDouble(trans.deal,DEAL_PROFIT)+
          HistoryDealGetDouble(trans.deal,DEAL_COMMISSION)+
          HistoryDealGetDouble(trans.deal,DEAL_SWAP)+
          HistoryDealGetDouble(trans.deal,DEAL_FEE);
      if(closingNet<0.0)
      {
         g_lastLossDealAt=Clock();
         CancelAllPending("AFTER_LOSS");
         PrintFormat("AQ_CHASER loss cooldown %d sec after net %.2f",
                     InpLossCooldownSec,closingNet);
      }
      // This also catches server-side SL/TP fills and close confirmations.
      // PositionCount() in FollowBracket prevents overlapping fresh entries.
      g_rearmOnNextPulse=true;
      g_lastPulseSecond=-1;
      g_lastBracketBuild=0;
      PrintFormat("AQ_CHASER exit deal=%I64u; next confirmed signal after any loss cooldown",trans.deal);
   }
   double profit=HistoryDealGetDouble(trans.deal,DEAL_PROFIT)
                +HistoryDealGetDouble(trans.deal,DEAL_COMMISSION)
                +HistoryDealGetDouble(trans.deal,DEAL_SWAP)
                +HistoryDealGetDouble(trans.deal,DEAL_FEE);
   int file=FileOpen("AlQannas_Candle_Chaser_Deals.csv",
         FILE_READ|FILE_WRITE|FILE_CSV|FILE_SHARE_READ,';');
   if(file!=INVALID_HANDLE)
   {
      FileSeek(file,0,SEEK_END);
      FileWrite(file,TimeToString((datetime)HistoryDealGetInteger(trans.deal,DEAL_TIME),
                   TIME_DATE|TIME_SECONDS),
                (long)trans.deal,(int)entry,
                DoubleToString(HistoryDealGetDouble(trans.deal,DEAL_VOLUME),2),
                DoubleToString(HistoryDealGetDouble(trans.deal,DEAL_PRICE),_Digits),
                DoubleToString(profit,2));
      FileClose(file);
   }
   const ENUM_DEAL_REASON brokerReason=
      (ENUM_DEAL_REASON)HistoryDealGetInteger(trans.deal,DEAL_REASON);
   PrintFormat("AQ_CHASER DEAL %I64u entry=%d net=%.2f brokerReason=%s",
               trans.deal,(int)entry,profit,EnumToString(brokerReason));
}
