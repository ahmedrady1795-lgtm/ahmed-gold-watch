//+------------------------------------------------------------------+
//| Al-Qannas Gold M1 Limit EA - EXNESS DEMO ONLY                    |
//| Real pending LIMIT orders on MT5 demo; never trades real money.  |
//| Local MT5 analysis (tick pressure + approximate tick-vol POC).   |
//| This EA does NOT call the Al-Qannas website/AI.                  |
//+------------------------------------------------------------------+
#property strict
#property version   "1.11"
#property description "Al-Qannas Gold M1 Limit v1.11: +$1.50 lock, $3 loss. DEMO ONLY."
#include <Trade/Trade.mqh>

input double InpLots                 = 0.05;   // Fixed exact volume
input double InpTakeNetUsd           = 6.00;   // Hard broker TP estimated net USD (NOT first tiny profit)
input double InpMaxLossUsd           = 3.00;   // Intended max loss USD (broker SL/fast moves can overrun)
input double InpTrailArmUsd          = 2.25;   // At this peak, attempt to lock +$1.50 net
input double InpTrailStartUsd        = 3.00;   // Start trailing best net profit from this peak
input double InpTrailGivebackUsd     = 0.80;   // Max giveback from peak, once trailing
input double InpProfitLockUsd        = 1.50;   // Minimum targeted protected net profit (not guaranteed)
input double InpMinSignalScore       = 0.28;   // Skip ambiguous near-zero prediction scores
input double InpM5ConflictScore      = 0.80;   // Skip strong M5 trend conflicts
input double InpDailyStopUsd         = 40.00;  // Stop new entries on daily net loss
input double InpCostReserveUsd       = 0.20;   // Estimated round-trip costs per trade
input int    InpMaxHoldSeconds       = 180;    // Allow more time for winning moves without endless holding
input int    InpMaxConcurrent       = 4;      // Open positions + pending orders
input int    InpMaxEntriesPerM1      = 4;      // Pending LIMIT attempts per minute
input int    InpMinOrderSpacingSec   = 10;     // Don't spam the trade server
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
   if(GlobalVariableCheck(g_lockKey)) g_dayLocked = true;
   Print("Al-Qannas: new server trading day. Locked=",g_dayLocked);
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

void RemoveOwnLimits(bool all=false)
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket) || !OwnLimitOrder()) continue;
      datetime created=(datetime)OrderGetInteger(ORDER_TIME_SETUP);
      if(!all && created >= g_barStart && ServerNow() < g_barStart+60) continue;
      if(!g_trade.OrderDelete(ticket))
         PrintFormat("Al-Qannas pending delete failure #%I64u code=%u",ticket,g_trade.ResultRetcode());
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

      int age=(int)(now-(datetime)PositionGetInteger(POSITION_TIME));
      bool hardProfit=(net>=InpTakeNetUsd);
      // A gap below the profit floor must ALSO exit; never require net>0.
      bool trailingExit=(protectedNet>0 && net<=protectedNet);
      bool lossStop=(net<=-InpMaxLossUsd);
      bool timeStop=(age>=InpMaxHoldSeconds);
      if(!forceClose && !hardProfit && !trailingExit && !lossStop && !timeStop)continue;
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
      }
      else
         PrintFormat("Al-Qannas CLOSE failed #%I64u retcode=%u %s",
            ticket,rc,g_trade.ResultRetcodeDescription());
   }
}
void UpdateTickPressure()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick) || tick.ask<=tick.bid || tick.bid<=0) return;
   double mid=(tick.bid+tick.ask)*0.5;
   if(g_previousMid>0)
   {
      if(mid>g_previousMid+_Point*0.25) g_upTicks++;
      if(mid<g_previousMid-_Point*0.25) g_downTicks++;
   }
   g_previousMid=mid;
}

int LocalSignal()
{
   // Every M1 candle is evaluated. Predict from CLOSED M1 + CLOSED M5 candles,
   // short-term tick pressure, and approximate tick-volume distribution by price.
   // This is NOT real exchange order flow or AI sourced from the Render site.
   MqlRates bars[],m5[];
   ArraySetAsSeries(bars,true);
   ArraySetAsSeries(m5,true);
   int n=CopyRates(_Symbol,PERIOD_M1,1,24,bars);
   int n5=CopyRates(_Symbol,PERIOD_M5,1,12,m5);
   if(n<8 || n5<5)return 0;
   double low=bars[0].low,high=bars[0].high,avgRange=0.0;
   for(int i=0;i<n;i++)
   {
      low=MathMin(low,bars[i].low);
      high=MathMax(high,bars[i].high);
      avgRange+=MathMax(_Point,bars[i].high-bars[i].low);
   }
   avgRange=MathMax(_Point,avgRange/n);

   // Rough "volume by price" using tick counts of closed candles. Not true POC.
   double poc=(high+low)*0.5;
   if(high-low>TickSize())
   {
      double hist[12];
      ArrayInitialize(hist,0.0);
      for(int j=0;j<n;j++)
      {
         double typical=(bars[j].high+bars[j].low+bars[j].close)/3.0;
         int k=(int)MathFloor((typical-low)/(high-low)*12.0);
         k=(int)MathMax(0,MathMin(11,k));
         hist[k]+=(double)bars[j].tick_volume;
      }
      int best=0;
      for(int j=1;j<12;j++)if(hist[j]>hist[best])best=j;
      poc=low+(best+0.5)*(high-low)/12.0;
   }
   double m5range=0;
   for(int i=0;i<n5;i++)
      m5range+=MathMax(_Point,m5[i].high-m5[i].low);
   m5range=MathMax(_Point,m5range/n5);

   double momentum=(bars[0].close-bars[3].close)/avgRange;
   double body=(bars[0].close-bars[0].open)/avgRange;
   double trend5=(m5[0].close-m5[3].close)/m5range;
   double upperWick=bars[0].high-MathMax(bars[0].open,bars[0].close);
   double lowerWick=MathMin(bars[0].open,bars[0].close)-bars[0].low;
   double rejection=(lowerWick-upperWick)/avgRange;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick) || tick.ask<=tick.bid)return 0;
   double mid=(tick.ask+tick.bid)*0.5;
   double flow=(g_upTicks-g_downTicks)/(double)MathMax(1,g_upTicks+g_downTicks);
   double score=0.42*momentum+0.52*body+0.35*flow+
                0.55*trend5+0.16*(mid-poc)/avgRange+0.20*rejection;
   if(!MathIsValidNumber(score) || MathAbs(score)<InpMinSignalScore)
   {
      g_status="M1 signal ambiguous";
      return 0;
   }
   // Strong opposing M5 trend is an important warning against buying/selling
   // merely because of a noisy one-minute candle.
   if(MathAbs(trend5)>=InpM5ConflictScore && score*trend5<0)
   {
      g_status="Conflicting M5 trend";
      return 0;
   }
   return (score>0?1:-1);
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
   double gap=MathMax(2.0*TickSize(),spread*0.20);
   double minDist=MinimumDistance();
   gap=MathMax(gap,minDist-spread+2.0*TickSize());
   double entry=(side>0 ? PriceRound(tick.bid-gap,-1) : PriceRound(tick.ask+gap,1));
   if(entry<=0) return false;
   if(side>0 && tick.ask-entry<minDist-1e-7) return false;
   if(side<0 && entry-tick.bid<minDist-1e-7) return false;

   double usdPerOne=0;
   if(!PriceCashPerOne(side,entry,usdPerOne)) {g_status="OrderCalcProfit failed";return false;}
   double budget=InpMaxLossUsd-InpCostReserveUsd;
   if(budget<=0) return false;
   double stopDist=budget/usdPerOne;
   if(stopDist<minDist+TickSize()) {g_status="0.05 lot exceeds $ loss budget";return false;}
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
   PrintFormat("Al-Qannas %s LIMIT lot=%.2f entry=%.*f SL=%.*f TP=%.*f ticket=%I64u",
      (side>0?"BUY":"SELL"),InpLots,_Digits,entry,_Digits,sl,_Digits,tp,g_trade.ResultOrder());
   return true;
}

void DisplayStatus(double closed,double floating,int active)
{
   if(!InpShowChartStatus) return;
   Comment("AL-QANNAS GOLD | DEMO LIMIT | M1",
           "\nLot 0.05 | Pending+open: ",active,"/",InpMaxConcurrent,
           "\nDaily closed USD: ",DoubleToString(closed,2),
           " | Floating est: ",DoubleToString(floating,2),
           "\nPlaced this candle: ",g_ordersThisBar,"/",InpMaxEntriesPerM1,
           " | ",g_dayLocked?"LOCKED":"ACTIVE"," | ",g_status);
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
      RemoveOwnLimits(false); // Expire the prior candle's unfilled orders.
   }

   double closed=0.0;
   bool historyOK=ClosedProfitToday(closed);
   double floating=FloatingEstimate();
   if(!historyOK) {g_status="History unavailable - no new entry";}
   if(historyOK && !g_dayLocked && closed+floating<=-InpDailyStopUsd)
   {
      g_dayLocked=true;
      GlobalVariableSet(g_lockKey,1.0);
      g_status="Daily loss lock";
      PrintFormat("Al-Qannas daily stop triggered: closed=%.2f floating=%.2f",closed,floating);
   }
   if(g_dayLocked) RemoveOwnLimits(true);
   ManagePositions(g_dayLocked);
   int active=CountActive();
   DisplayStatus(closed,floating,active);
   if(!historyOK || g_dayLocked || g_barStart<=0 || !ExactVolume()) return;
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
   if(MathAbs(InpLots-0.05)>0.000001 || !ExactVolume() ||
      InpTakeNetUsd<=InpTrailStartUsd || InpMaxLossUsd<=InpCostReserveUsd ||
      InpTrailArmUsd<=0 || InpTrailStartUsd<=InpTrailArmUsd ||
      InpTrailGivebackUsd<=0 || InpTrailGivebackUsd>=InpTrailStartUsd ||
      InpProfitLockUsd<=0 || InpProfitLockUsd>=InpTrailArmUsd ||
      InpMinSignalScore<0 || InpM5ConflictScore<=0 ||
      InpDailyStopUsd<=InpMaxLossUsd || InpMaxHoldSeconds<30 ||
      InpMaxConcurrent<1 || InpMaxConcurrent>4 ||
      InpMaxEntriesPerM1<1 || InpMaxEntriesPerM1>4 ||
      InpMinOrderSpacingSec<2 || InpMaxSpreadPrice<=0)
   {
      Alert("Al-Qannas invalid setup; exact lot 0.05 / valid risk settings required");return INIT_PARAMETERS_INCORRECT;
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
   PrintFormat("Al-Qannas Gold DEMO v1.11: %s lot=%.2f hardTP=%.2f stop=%.2f arm=%.2f trail=%.2f giveback=%.2f daily=%.2f",
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
