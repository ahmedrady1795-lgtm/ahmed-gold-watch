//+------------------------------------------------------------------+
//| QannasBtcDemoTrader.mq5 - separately authorized DEMO-only trader |
//| Attach on SECOND BTCUSDm chart (keep read-only feed on first).    |
//| No LIVE accounts; separate MARKET opt-in; broker stops required. |
//+------------------------------------------------------------------+
#property strict
#property version "1.03"
#property description "BTCUSDm DEMO LIMIT or separately opted-in MARKET EA. OFF by default."
#property description "Rejects real accounts even if enabled; broker SL/TP required."

#include <Trade/Trade.mqh>
CTrade trade;

input string SiteURL="https://ahmed-gold-watch-free.onrender.com";
input string BridgeToken="";
input long   ExpectedDemoLogin=0;
input bool   EnableDemoOrders=false;
input string DemoConfirmation="";  // type EXACTLY: I_ENABLE_DEMO_ONLY_V1
// Market execution requires TWO additional, explicitly configured inputs.
// Compile v1.03, verify the DEMO account, then opt in. Default remains LIMIT.
input bool   UseDemoMarketEntries=false;
input string DemoMarketConfirmation=""; // I_ENABLE_DEMO_MARKET_ONLY_V1
input int    MaxMarketEntriesPerM1=2;
input double MaxRiskPerTradePct=0.05;
input double MaxDailyLossPct=0.50;
input int    MaxFilledTradesPerDay=360;
input int    MaxFilledTradesPerMinute=4;
input int    MaxPositionHoldSeconds=30;
input int    LocalPendingLifetimeSeconds=11;
input ulong  TradeMagic=56017952026;

// Broker-side expiration and strategy-side expiry are NOT identical.
// Exness demo rejected 4-15s broker expiration with retcode 10022.
// Ask broker for a 3-minute bounded expiry; locally CANCEL LIMIT at 11s.
// Never fall back to an unbounded GTC or market entry.
const int BROKER_PENDING_EXPIRY_SECONDS=180;

datetime lastRequestAt=0;
datetime lastLogAt=0;
bool started=false;

string Key(const string suffix)
  {
   return StringFormat("QBTCD_%I64d_%I64u_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),TradeMagic,suffix);
  }
bool LocalAccountSafe()
  {
   if(_Symbol!="BTCUSDm")return false;
   if(ExpectedDemoLogin<=0 ||
      AccountInfoInteger(ACCOUNT_LOGIN)!=ExpectedDemoLogin)return false;
   if(AccountInfoInteger(ACCOUNT_TRADE_MODE)!=ACCOUNT_TRADE_MODE_DEMO)
      return false;
   if(StringFind(SiteURL,"https://")!=0 || StringLen(BridgeToken)<32)
      return false;
   if(MaxRiskPerTradePct<=0||MaxRiskPerTradePct>0.05||
      MaxDailyLossPct<=0||MaxDailyLossPct>0.50||
      MaxFilledTradesPerDay<1||MaxFilledTradesPerDay>360||
      MaxFilledTradesPerMinute<1||MaxFilledTradesPerMinute>4||
      MaxPositionHoldSeconds<15||MaxPositionHoldSeconds>30||
      LocalPendingLifetimeSeconds<5||LocalPendingLifetimeSeconds>15||
      MaxMarketEntriesPerM1<1||MaxMarketEntriesPerM1>2)
      return false;
   return true;
  }
bool TerminalCanTrade()
  {
   return (bool)TerminalInfoInteger(TERMINAL_CONNECTED) &&
          (bool)TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) &&
          (bool)MQLInfoInteger(MQL_TRADE_ALLOWED) &&
          (bool)AccountInfoInteger(ACCOUNT_TRADE_ALLOWED);
  }
void Note(const string message)
  {
   const datetime now=TimeLocal();
   if(now-lastLogAt>=25){Print("Qannas BTC DEMO: ",message);lastLogAt=now;}
  }
int OnInit()
  {
   if(!LocalAccountSafe())
     {
      Print("Qannas BTC DEMO: REFUSED account/symbol/token/risk limits. No orders.");
      return INIT_PARAMETERS_INCORRECT;
     }
   trade.SetExpertMagicNumber(TradeMagic);
   trade.SetAsyncMode(false);
   trade.SetTypeFillingBySymbol(_Symbol);
   if(!EventSetTimer(3))return INIT_FAILED;
   started=true;
   Print("Qannas BTC DEMO: initialized on verified DEMO account; orders ",
         EnableDemoOrders?"requested (gates still apply)":"OFF / observation only");
   Print("Qannas BTC DEMO: entry mode=",
      UseDemoMarketEntries?"MARKET (requires separate opt-in)":"LIMIT");
   PrintFormat("Qannas BTC DEMO: expiry policy broker=%d sec, local cancellation=%d sec, allowed expiry modes=%I64d",
      BROKER_PENDING_EXPIRY_SECONDS,LocalPendingLifetimeSeconds,
      SymbolInfoInteger(_Symbol,SYMBOL_EXPIRATION_MODE));
   return INIT_SUCCEEDED;
  }
bool OwnPending(const ulong ticket)
  {
   if(!OrderSelect(ticket))return false;
   if(OrderGetString(ORDER_SYMBOL)!=_Symbol)return false;
   if((ulong)OrderGetInteger(ORDER_MAGIC)!=TradeMagic)return false;
   const ENUM_ORDER_TYPE kind=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
   return kind==ORDER_TYPE_BUY_LIMIT||kind==ORDER_TYPE_SELL_LIMIT;
  }
void CancelOwnedPending()
  {
   for(int i=OrdersTotal()-1;i>=0;i--)
     {
      const ulong ticket=OrderGetTicket(i);
      if(!OwnPending(ticket))continue;
      if(!LocalAccountSafe() || !TerminalCanTrade())continue;
      if(!trade.OrderDelete(ticket))
         Note(StringFormat("cannot cancel demo pending order: %u",
                           trade.ResultRetcode()));
     }
  }
// Delete pending LIMIT orders using the broker order's persistent setup
// timestamp, so cleanup survives MT5 terminal/EA restarts. Broker expiry is
// a 3-minute worst-case backstop if the VPS loses connectivity before delete.
void CancelStaleOwnedPending()
  {
   if(!LocalAccountSafe()||!TerminalCanTrade())return;
   const datetime now=TimeTradeServer();
   if(now<=0)return;
   for(int i=OrdersTotal()-1;i>=0;i--)
     {
      const ulong ticket=OrderGetTicket(i);
      if(!OwnPending(ticket))continue;
      const datetime setup=(datetime)OrderGetInteger(ORDER_TIME_SETUP);
      // Unknown setup time is suspicious; fail closed and cancel the order.
      if(setup>0 && now-setup<LocalPendingLifetimeSeconds && setup<=now)
         continue;
      if(trade.OrderDelete(ticket) &&
         trade.ResultRetcode()==TRADE_RETCODE_DONE)
         PrintFormat("Qannas BTC DEMO: locally expired pending LIMIT %I64u after %d seconds",
                     ticket,LocalPendingLifetimeSeconds);
      else
         Note(StringFormat("could not cancel expired LIMIT ticket=%I64u retcode=%u",
                           ticket,trade.ResultRetcode()));
     }
  }

int SymbolExposure()
  {
   int n=0;
   for(int i=0;i<PositionsTotal();i++)
     {
      const ulong ticket=PositionGetTicket(i);
      if(ticket>0&&PositionGetString(POSITION_SYMBOL)==_Symbol)n++;
     }
   for(int i=0;i<OrdersTotal();i++)
     {
      const ulong ticket=OrderGetTicket(i);
      if(ticket>0&&OrderGetString(ORDER_SYMBOL)==_Symbol)n++;
     }
   return n;
  }
void ManageOwnOpenPositions()
  {
   if(!LocalAccountSafe()||!TerminalCanTrade())return;
   const datetime now=TimeTradeServer();
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      const ulong ticket=PositionGetTicket(i);
      if(ticket==0||PositionGetString(POSITION_SYMBOL)!=_Symbol||
         (ulong)PositionGetInteger(POSITION_MAGIC)!=TradeMagic)continue;
      const datetime opened=(datetime)PositionGetInteger(POSITION_TIME);
      const double sl=PositionGetDouble(POSITION_SL);
      const double tp=PositionGetDouble(POSITION_TP);
      // Never leave a known unprotected demo position without intervention.
      if(sl<=0||tp<=0||now-opened>=MaxPositionHoldSeconds)
        {
         if(!trade.PositionClose(ticket))
            Note(StringFormat("demo close failed, retcode=%u",
                              trade.ResultRetcode()));
         else
            Print("Qannas BTC DEMO: closed own position (time or missing SL/TP).");
        }
     }
  }
bool HistoryLimits()
  {
   // Persistent per-account starting equity prevents an open loss or another
   // EA's loss from being ignored just because no deal has closed yet.
   const long utcDay=(long)TimeGMT()/86400;
   const string equityKey=Key("EQ"+IntegerToString((int)utcDay));
   const double currentEquity=AccountInfoDouble(ACCOUNT_EQUITY);
   if(currentEquity<=0)return false;
   if(!GlobalVariableCheck(equityKey))
      GlobalVariableSet(equityKey,currentEquity);
   const double startEquity=GlobalVariableGet(equityKey);
   if(startEquity<=0||
      currentEquity<=startEquity*(1.0-MaxDailyLossPct/100.0))
      return false;
   const datetime now=TimeTradeServer();
   const datetime start=now-(now%86400);
   if(!HistorySelect(start,now))return false; // fail closed
   int entries=0;
   int entriesLastMinute=0;
   double pnl=0;
   for(int i=0;i<HistoryDealsTotal();i++)
     {
      const ulong ticket=HistoryDealGetTicket(i);
      if(ticket==0||HistoryDealGetString(ticket,DEAL_SYMBOL)!=_Symbol||
         (ulong)HistoryDealGetInteger(ticket,DEAL_MAGIC)!=TradeMagic)continue;
      const ENUM_DEAL_ENTRY entry=(ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket,DEAL_ENTRY);
      if(entry==DEAL_ENTRY_IN||entry==DEAL_ENTRY_INOUT)
        {
         entries++;
         if((datetime)HistoryDealGetInteger(ticket,DEAL_TIME)>=now-60)
            entriesLastMinute++;
        }
      pnl+=HistoryDealGetDouble(ticket,DEAL_PROFIT)+
           HistoryDealGetDouble(ticket,DEAL_COMMISSION)+
           HistoryDealGetDouble(ticket,DEAL_SWAP);
     }
   if(entries>=MaxFilledTradesPerDay||
      entriesLastMinute>=MaxFilledTradesPerMinute)return false;
   const double balance=AccountInfoDouble(ACCOUNT_BALANCE);
   if(balance<=0||pnl<=-balance*MaxDailyLossPct/100.0)return false;
   return true;
  }
bool LocalClosedBarMatches(const long candleAtMs)
  {
   MqlRates bars[];
   if(CopyRates(_Symbol,PERIOD_M1,1,2,bars)!=2)return false;
   return ((long)bars[1].time*1000)==candleAtMs;
  }
double ChooseLot(const ENUM_ORDER_TYPE side,double entry,double stop)
  {
   const double minLot=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   const double maxLot=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   const double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   if(minLot<=0||maxLot<minLot||step<=0)return 0;
   double lossAtMin=0;
   const ENUM_ORDER_TYPE calc=side==ORDER_TYPE_BUY_LIMIT?
      ORDER_TYPE_BUY:ORDER_TYPE_SELL;
   if(!OrderCalcProfit(calc,_Symbol,minLot,entry,stop,lossAtMin)||
      !MathIsValidNumber(lossAtMin)||lossAtMin>=0)return 0;
   const double equity=AccountInfoDouble(ACCOUNT_EQUITY);
   const double budget=equity*MaxRiskPerTradePct/100.0;
   if(budget<=0||-lossAtMin>budget)return 0;
   const double rawLots=MathMin(maxLot,minLot*budget/(-lossAtMin));
   double vol=MathFloor((rawLots+1e-9)/step)*step;
   vol=NormalizeDouble(vol,8);
   if(vol<minLot||vol>maxLot)return 0;
   double actualLoss=0;
   if(!OrderCalcProfit(calc,_Symbol,vol,entry,stop,actualLoss)||
      !MathIsValidNumber(actualLoss)||-actualLoss>budget)return 0;
   double margin=0;
   if(!OrderCalcMargin(calc,_Symbol,vol,entry,margin)||
      margin<=0||margin>AccountInfoDouble(ACCOUNT_MARGIN_FREE)*.5)return 0;
   return vol;
  }
// Broker-only demo market entry uses the LOCAL quote to set both protective
// prices, not the server's stale candidate entry. Cost/slippage are estimated;
// realized fills and stops can still slip beyond the planned loss.
double ChooseDemoMarketLot(const bool buy,const double entry,
                           const double stop,const double slipAllowance)
  {
   const ENUM_ORDER_TYPE type=buy?ORDER_TYPE_BUY:ORDER_TYPE_SELL;
   const double minLot=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   const double maxLot=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   const double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   if(minLot<=0||maxLot<minLot||step<=0)return 0;
   const double worstEntry=buy?entry+slipAllowance:entry-slipAllowance;
   const double worstStop=buy?stop-slipAllowance:stop+slipAllowance;
   double atMin=0;
   if(worstEntry<=0||worstStop<=0||
      !OrderCalcProfit(type,_Symbol,minLot,worstEntry,worstStop,atMin)||
      !MathIsValidNumber(atMin)||atMin>=0)return 0;
   // Hold back 20% of the stated stop-risk budget for fee/slippage uncertainty.
   const double budget=AccountInfoDouble(ACCOUNT_EQUITY)*
                       MaxRiskPerTradePct/100.0*.80;
   if(budget<=0||-atMin>budget)return 0;
   const double lotsRaw=MathMin(maxLot,minLot*budget/(-atMin));
   const double lots=NormalizeDouble(MathFloor((lotsRaw+1e-9)/step)*step,8);
   if(lots<minLot||lots>maxLot)return 0;
   double loss=0,margin=0;
   if(!OrderCalcProfit(type,_Symbol,lots,worstEntry,worstStop,loss)||
      !MathIsValidNumber(loss)||-loss>budget)return 0;
   if(!OrderCalcMargin(type,_Symbol,lots,worstEntry,margin)||
      margin<=0||margin>AccountInfoDouble(ACCOUNT_MARGIN_FREE)*.5)return 0;
   return lots;
  }
bool MarketFilledLimitForM1(const long candleAtMs)
  {
   // A second independent limit beyond the 4 fills/rolling minute safeguard.
   const datetime from=(datetime)(candleAtMs/1000+60);
   const datetime until=TimeTradeServer();
   if(until<from||!HistorySelect(from,until))return false;
   int count=0;
   for(int i=0;i<HistoryDealsTotal();i++)
     {
      const ulong ticket=HistoryDealGetTicket(i);
      if(ticket==0||HistoryDealGetString(ticket,DEAL_SYMBOL)!=_Symbol||
        (ulong)HistoryDealGetInteger(ticket,DEAL_MAGIC)!=TradeMagic)continue;
      const ENUM_DEAL_ENTRY e=(ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket,DEAL_ENTRY);
      if(e==DEAL_ENTRY_IN||e==DEAL_ENTRY_INOUT)count++;
     }
   return count<MaxMarketEntriesPerM1;
  }
bool ValidateAndPlaceMarket(const string wire)
  {
   string parts[];
   string raw=wire;
   StringTrimLeft(raw);StringTrimRight(raw);
   if(StringSplit(raw,'|',parts)!=11||parts[0]!="QBTCM1")return false;
   if(parts[1]!="BUY_MARKET"&&parts[1]!="SELL_MARKET")return false;
   if(parts[2]!=_Symbol)return false;
   const bool buy=parts[1]=="BUY_MARKET";
   const long candleAt=StringToInteger(parts[3]);
   const long expiresAt=StringToInteger(parts[4]);
   const double riskDist=StringToDouble(parts[5]);
   const double rewardDist=StringToDouble(parts[6]);
   const double serverBid=StringToDouble(parts[7]);
   const double serverAsk=StringToDouble(parts[8]);
   const double serverAtr=StringToDouble(parts[9]);
   const long signalTick=StringToInteger(parts[10]);
   const long nowMs=(long)TimeGMT()*1000;
   if(candleAt<=0||nowMs-candleAt<60000||nowMs-candleAt>119000||
      signalTick<=0||signalTick>nowMs||nowMs-signalTick>6000||
      expiresAt<=nowMs+1500||expiresAt>nowMs+12000||
      !LocalClosedBarMatches(candleAt))return false;
   if(!MathIsValidNumber(riskDist)||!MathIsValidNumber(rewardDist)||
      !MathIsValidNumber(serverBid)||!MathIsValidNumber(serverAsk)||
      !MathIsValidNumber(serverAtr)||
      riskDist<=0||rewardDist<=0||serverBid<=0||
      serverAsk<=serverBid||serverAtr<=0||
      riskDist>1.4*serverAtr||rewardDist>2.25*serverAtr||
      rewardDist<1.4*riskDist)return false;
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))return false;
   const long tickAge=nowMs-tick.time_msc;
   if(tickAge<0||tickAge>3000||tick.bid<=0||tick.ask<=tick.bid)return false;
   const double spread=tick.ask-tick.bid;
   const double mid=(tick.ask+tick.bid)/2.0;
   if(spread<=0||mid<=0||spread/mid>0.0004||
      serverAsk-serverBid<=0)return false;
   // A quote that moved too far after the server observation is NOT a new
   // opportunity. Do not chase: request another broker-verified candidate.
   const double tolerance=MathMax(.4*spread,.15*serverAtr);
   if(MathAbs(tick.bid-serverBid)>tolerance||
      MathAbs(tick.ask-serverAsk)>tolerance)return false;
   if(rewardDist<2.4*spread)return false;
   const long modes=SymbolInfoInteger(_Symbol,SYMBOL_ORDER_MODE);
   if((modes&SYMBOL_ORDER_MARKET)==0 ||
      (modes&SYMBOL_ORDER_SL)==0 ||
      (modes&SYMBOL_ORDER_TP)==0 ||
      SymbolInfoInteger(_Symbol,SYMBOL_TRADE_MODE)!=SYMBOL_TRADE_MODE_FULL)
      return false;
   if(PositionsTotal()>0||OrdersTotal()>0||!HistoryLimits()||
      !MarketFilledLimitForM1(candleAt))return false;
   const string signalKey=Key("LASTMARKET");
   const string cooldownKey=Key("COOL");
   if(GlobalVariableCheck(signalKey)&&
      GlobalVariableGet(signalKey)>=signalTick)return false;
   if(GlobalVariableCheck(cooldownKey)&&
      TimeGMT()-GlobalVariableGet(cooldownKey)<10)return false;
   const double point=SymbolInfoDouble(_Symbol,SYMBOL_POINT);
   const double tickSize=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   const int digits=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   if(point<=0||tickSize<=0)return false;
   const double minDist=MathMax(point,
      MathMax((double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL),
              (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL))*point);
   const double entry=buy?tick.ask:tick.bid;
   // Round protective levels to the actual instrument tick-size grid.
   const double sl=buy?
      NormalizeDouble(MathFloor((entry-riskDist)/tickSize)*tickSize,digits):
      NormalizeDouble(MathCeil((entry+riskDist)/tickSize)*tickSize,digits);
   const double tp=buy?
      NormalizeDouble(MathCeil((entry+rewardDist)/tickSize)*tickSize,digits):
      NormalizeDouble(MathFloor((entry-rewardDist)/tickSize)*tickSize,digits);
   const double stopRisk=MathAbs(entry-sl),targetGain=MathAbs(entry-tp);
   if(sl<=0||tp<=0||stopRisk<=minDist||
      stopRisk>1.5*serverAtr||targetGain>2.4*serverAtr||
      targetGain<1.4*stopRisk||targetGain<2.4*spread)return false;
   if(buy)
     {
      if(sl>=tick.bid-minDist||tp<=tick.bid+minDist)return false;
     }
   else
     {
      if(sl<=tick.ask+minDist||tp>=tick.ask-minDist)return false;
     }
   const double slipAllowance=MathMax(point,MathMin(.5*spread,.15*serverAtr));
   const double lots=ChooseDemoMarketLot(buy,entry,sl,slipAllowance);
   if(lots<=0)
     {
      Note("demo MARKET blocked: broker min lot or buffered loss exceeds 0.05% risk");
      return false;
     }
   trade.SetDeviationInPoints((ulong)MathMax(1.0,MathFloor(slipAllowance/point)));
   // No pending-order fallback and no naked trade: SL and TP in the REQUEST.
   const bool sent=buy?
      trade.Buy(lots,_Symbol,entry,sl,tp,"QB-DEMO-MKT"):
      trade.Sell(lots,_Symbol,entry,sl,tp,"QB-DEMO-MKT");
   const uint retcode=trade.ResultRetcode();
   if(!sent||(retcode!=TRADE_RETCODE_DONE&&retcode!=TRADE_RETCODE_DONE_PARTIAL))
     {
      PrintFormat("Qannas BTC DEMO MARKET: NOT FILLED retcode=%u",retcode);
      return false;
     }
   GlobalVariableSet(signalKey,(double)signalTick);
   GlobalVariableSet(cooldownKey,(double)TimeGMT());
   PrintFormat("Qannas BTC DEMO MARKET: broker executed %s lots=%.8f entry=%.*f SL=%.*f TP=%.*f retcode=%u deal=%I64u",
               parts[1],lots,digits,entry,digits,sl,digits,tp,retcode,trade.ResultDeal());
   // Verify a broker SL/TP was created; the existing position manager
   // attempts immediate closure if protective levels are missing.
   ManageOwnOpenPositions();
   return true;
  }

bool ValidateAndPlace(const string wire)
  {
   string parts[];
   string text=wire;
   StringTrimLeft(text);StringTrimRight(text);
   if(StringSplit(text,'|',parts)!=12||parts[0]!="QBTC1")return false;
   if(parts[1]!="BUY_LIMIT"&&parts[1]!="SELL_LIMIT")return false;
   if(parts[2]!=_Symbol)return false;
   const long candleAt=StringToInteger(parts[3]);
   const long expiresAt=StringToInteger(parts[4]);
   const double entry=StringToDouble(parts[5]);
   const double sl=StringToDouble(parts[6]);
   const double tp=StringToDouble(parts[7]);
   const double serverBid=StringToDouble(parts[8]);
   const double serverAsk=StringToDouble(parts[9]);
   const double serverAtr=StringToDouble(parts[10]);
   const long signalTick=StringToInteger(parts[11]);
   const long nowMs=(long)TimeGMT()*1000;
   if(candleAt<=0||nowMs-candleAt<60000||
      nowMs-candleAt>119000||
      signalTick<=0||nowMs-signalTick<0||nowMs-signalTick>8000||
      expiresAt<=nowMs+3000||
      expiresAt>nowMs+20000||!LocalClosedBarMatches(candleAt))return false;
   if(!MathIsValidNumber(entry)||!MathIsValidNumber(sl)||
      !MathIsValidNumber(tp)||!MathIsValidNumber(serverBid)||
      !MathIsValidNumber(serverAsk)||!MathIsValidNumber(serverAtr)||
      entry<=0||sl<=0||tp<=0||serverBid<=0||
      serverAsk<=serverBid||serverAtr<=0)return false;
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))return false;
   const long tickAge=nowMs-tick.time_msc;
   if(tickAge<0||tickAge>4000||tick.ask<=tick.bid||
      tick.bid<=0)return false;
   const double spread=tick.ask-tick.bid;
   const double mid=(tick.ask+tick.bid)/2.0;
   if(spread<=0||spread/mid>0.0004)return false;
   if(MathAbs(tick.bid-serverBid)>MathMin(2.5*spread,.25*serverAtr)||
      MathAbs(tick.ask-serverAsk)>MathMin(2.5*spread,.25*serverAtr))
      return false;
   const double point=SymbolInfoDouble(_Symbol,SYMBOL_POINT);
   const int digits=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   if(point<=0)return false;
   const double minDist=MathMax(point,
       (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*point);
   if(MathAbs(entry-NormalizeDouble(entry,digits))>point*.25||
      MathAbs(sl-NormalizeDouble(sl,digits))>point*.25||
      MathAbs(tp-NormalizeDouble(tp,digits))>point*.25)return false;
   const bool buy=parts[1]=="BUY_LIMIT";
   const double risk=MathAbs(entry-sl);
   const double reward=MathAbs(tp-entry);
   if(risk<=minDist||reward<1.4*risk||
      risk>1.5*serverAtr||reward>2.25*serverAtr||
      reward<2.4*spread)return false;
   if(buy)
     {
      if(entry>=tick.ask-minDist||sl>=entry-minDist||
         tp<=entry+minDist)return false;
     }
   else
     {
      if(entry<=tick.bid+minDist||sl<=entry+minDist||
         tp>=entry-minDist)return false;
     }
   const long orderModes=SymbolInfoInteger(_Symbol,SYMBOL_ORDER_MODE);
   const long expirationModes=SymbolInfoInteger(_Symbol,SYMBOL_EXPIRATION_MODE);
   if((orderModes & SYMBOL_ORDER_LIMIT)==0 ||
      (orderModes & SYMBOL_ORDER_SL)==0 ||
      (orderModes & SYMBOL_ORDER_TP)==0 ||
      (expirationModes & SYMBOL_EXPIRATION_SPECIFIED)==0)return false;
   if(SymbolInfoInteger(_Symbol,SYMBOL_TRADE_MODE)!=SYMBOL_TRADE_MODE_FULL)
      return false;
   if(SymbolExposure()>0||!HistoryLimits())return false;
   const string signalKey=Key("LAST");
   // Deduplicate the broker tick setup, not the whole M1 candle.
   if(GlobalVariableCheck(signalKey)&&GlobalVariableGet(signalKey)>=signalTick)
      return false;
   const string cooldownKey=Key("COOL");
   if(GlobalVariableCheck(cooldownKey)&&
      TimeGMT()-GlobalVariableGet(cooldownKey)<10)return false;
   const ENUM_ORDER_TYPE type=buy?ORDER_TYPE_BUY_LIMIT:ORDER_TYPE_SELL_LIMIT;
   const double vol=ChooseLot(type,entry,sl);
   if(vol<=0){Note("broker minimum lot exceeds 0.05% risk, or no free margin");return false;}
   // Previous 4-15 second broker expiry failed on Exness demo with
   // TRADE_RETCODE_INVALID_EXPIRATION (10022). Preserve the server signal's
   // <=20-second freshness validation ABOVE, but do not send that tiny TTL
   // as a broker expiration timestamp. Cancel locally on every timer tick
   // after LocalPendingLifetimeSeconds and use a bounded broker fallback.
   const datetime brokerNow=TimeTradeServer();
   if(brokerNow<=0)return false;
   const datetime expiry=brokerNow+BROKER_PENDING_EXPIRY_SECONDS;
   if(expiry<=brokerNow)return false;
   bool ok=buy?trade.BuyLimit(vol,entry,_Symbol,sl,tp,
               ORDER_TIME_SPECIFIED,expiry,"QB-DEMO-BTC"):
               trade.SellLimit(vol,entry,_Symbol,sl,tp,
               ORDER_TIME_SPECIFIED,expiry,"QB-DEMO-BTC");
   const uint retcode=trade.ResultRetcode();
   if(!ok||(retcode!=TRADE_RETCODE_PLACED&&retcode!=TRADE_RETCODE_DONE))
     {
      PrintFormat("Qannas BTC DEMO: pending LIMIT REJECTED retcode=%u expiryModes=%I64d brokerAt=%s expiryAt=%s",
                  retcode,expirationModes,
                  TimeToString(brokerNow,TIME_DATE|TIME_SECONDS),
                  TimeToString(expiry,TIME_DATE|TIME_SECONDS));
      if(retcode==TRADE_RETCODE_INVALID_EXPIRATION)
         Print("Qannas BTC DEMO: broker still rejects even 180-second specified expiry; no GTC/market fallback.");
      return false;
     }
   GlobalVariableSet(signalKey,(double)signalTick);
   GlobalVariableSet(cooldownKey,(double)TimeGMT());
   PrintFormat("Qannas BTC DEMO: broker pending %s lot=%.8f entry=%.*f SL=%.*f TP=%.*f",
               parts[1],vol,digits,entry,digits,sl,digits,tp);
   return true;
  }
void OnTimer()
  {
   // Broker demo-account check runs on every poll, not only initialization.
   if(!LocalAccountSafe())return;
   ManageOwnOpenPositions();
   CancelStaleOwnedPending();
   if(!EnableDemoOrders||DemoConfirmation!="I_ENABLE_DEMO_ONLY_V1")
     {
      CancelOwnedPending();
      Note("demo trading OFF. Requires user opt-in and exact confirmation.");
      return;
     }
   if(UseDemoMarketEntries&&
      DemoMarketConfirmation!="I_ENABLE_DEMO_MARKET_ONLY_V1")
     {
      Note("MARKET test remains OFF; explicit DEMO MARKET confirmation required.");
      return;
     }
   if(!TerminalCanTrade())
     {
      Note("Algo Trading disabled or terminal disconnected");
      return;
     }
   const datetime now=TimeLocal();
   if(now-lastRequestAt<3)return;
   lastRequestAt=now;
   if(SymbolExposure()>0)return; // owned/unowned position OR pending blocks new entry
   if(!HistoryLimits()){Note("minute/day trade count or loss stop");return;}
   const string headers="Authorization: Bearer "+BridgeToken+"\r\n";
   char request[],response[];
   string responseHeaders="";
   const string url=SiteURL+
      (UseDemoMarketEntries?"/api/mt5/btc-demo-market-signal":
                            "/api/mt5/btc-demo-signal");
   ResetLastError();
   const int http=WebRequest("GET",url,headers,4000,request,response,responseHeaders);
   if(http!=200)
     {
      Note(StringFormat("demo signal unavailable HTTP=%d error=%d",http,GetLastError()));
      return;
     }
   const string wire=CharArrayToString(response,0,ArraySize(response),CP_UTF8);
   if(UseDemoMarketEntries)
     {
      if(StringFind(wire,"QBTCM1|WAIT|")==0)
        {
         Note("server MARKET WAIT: "+StringSubstr(wire,12,80));
         return;
        }
      ValidateAndPlaceMarket(wire);
     }
   else
     {
      if(StringFind(wire,"QBTC1|WAIT|")==0)
        {
         Note("server WAIT: "+StringSubstr(wire,11,80));
         return;
        }
      ValidateAndPlace(wire);
     }
  }
void OnDeinit(const int reason)
  {
   EventKillTimer();
   // Pending orders must not remain unmanaged when the EA is removed.
   CancelOwnedPending();
   Print("Qannas BTC DEMO: stopped. Existing demo positions retain broker SL/TP.");
  }
// DEMO only: never trade real accounts; MARKET requires independent opt-in.
