//+------------------------------------------------------------------+
//| QannasBtcDemoTrader.mq5 - separately authorized DEMO-only trader |
//| Attach on SECOND BTCUSDm chart (keep read-only feed on first).    |
//| No live accounts, no market entries, no DLLs, no unprotected risk.|
//+------------------------------------------------------------------+
#property strict
#property version "1.00"
#property description "BTCUSDm pending LIMIT demo-only EA. OFF by default."
#property description "Rejects real accounts even if enabled; broker SL/TP required."

#include <Trade/Trade.mqh>
CTrade trade;

input string SiteURL="https://ahmed-gold-watch-free.onrender.com";
input string BridgeToken="";
input long   ExpectedDemoLogin=0;
input bool   EnableDemoOrders=false;
input string DemoConfirmation="";  // type EXACTLY: I_ENABLE_DEMO_ONLY_V1
input double MaxRiskPerTradePct=0.10;
input double MaxDailyLossPct=0.50;
input int    MaxFilledTradesPerDay=3;
input int    MaxPositionHoldSeconds=120;
input ulong  TradeMagic=56017952026;

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
   if(MaxRiskPerTradePct<=0||MaxRiskPerTradePct>0.10||
      MaxDailyLossPct<=0||MaxDailyLossPct>0.50||
      MaxFilledTradesPerDay<1||MaxFilledTradesPerDay>3||
      MaxPositionHoldSeconds<15||MaxPositionHoldSeconds>120)
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
   const datetime now=TimeTradeServer();
   const datetime start=now-(now%86400);
   if(!HistorySelect(start,now))return false; // fail closed
   int entries=0;
   double pnl=0;
   for(int i=0;i<HistoryDealsTotal();i++)
     {
      const ulong ticket=HistoryDealGetTicket(i);
      if(ticket==0||HistoryDealGetString(ticket,DEAL_SYMBOL)!=_Symbol||
         (ulong)HistoryDealGetInteger(ticket,DEAL_MAGIC)!=TradeMagic)continue;
      const ENUM_DEAL_ENTRY entry=(ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket,DEAL_ENTRY);
      if(entry==DEAL_ENTRY_IN||entry==DEAL_ENTRY_INOUT)entries++;
      pnl+=HistoryDealGetDouble(ticket,DEAL_PROFIT)+
           HistoryDealGetDouble(ticket,DEAL_COMMISSION)+
           HistoryDealGetDouble(ticket,DEAL_SWAP);
     }
   if(entries>=MaxFilledTradesPerDay)return false;
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
bool ValidateAndPlace(const string wire)
  {
   string parts[];
   string text=wire;
   StringTrimLeft(text);StringTrimRight(text);
   if(StringSplit(text,'|',parts)!=11||parts[0]!="QBTC1")return false;
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
   const long nowMs=(long)TimeGMT()*1000;
   if(candleAt<=0||nowMs-candleAt<60000||
      nowMs-candleAt>105000||expiresAt<=nowMs+3000||
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
      (expirationModes & SYMBOL_EXP_TIME_SPECIFIED)==0)return false;
   if(SymbolInfoInteger(_Symbol,SYMBOL_TRADE_MODE)!=SYMBOL_TRADE_MODE_FULL)
      return false;
   if(SymbolExposure()>0||!HistoryLimits())return false;
   const string signalKey=Key("LAST");
   if(GlobalVariableCheck(signalKey)&&GlobalVariableGet(signalKey)>=candleAt)
      return false;
   const string cooldownKey=Key("COOL");
   if(GlobalVariableCheck(cooldownKey)&&
      TimeGMT()-GlobalVariableGet(cooldownKey)<120)return false;
   const ENUM_ORDER_TYPE type=buy?ORDER_TYPE_BUY_LIMIT:ORDER_TYPE_SELL_LIMIT;
   const double vol=ChooseLot(type,entry,sl);
   if(vol<=0){Note("broker minimum lot exceeds 0.10% risk, or no free margin");return false;}
   // Broker-expiring pending LIMIT: never convert rejected LIMIT to a DEAL.
   const datetime expiry=TimeTradeServer()+
      (int)MathMin(15,MathMax(4,(expiresAt-nowMs)/1000));
   if(expiry<=TimeTradeServer())return false;
   bool ok=buy?trade.BuyLimit(vol,entry,_Symbol,sl,tp,
               ORDER_TIME_SPECIFIED,expiry,"QB-DEMO-BTC"):
               trade.SellLimit(vol,entry,_Symbol,sl,tp,
               ORDER_TIME_SPECIFIED,expiry,"QB-DEMO-BTC");
   const uint retcode=trade.ResultRetcode();
   if(!ok||(retcode!=TRADE_RETCODE_PLACED&&retcode!=TRADE_RETCODE_DONE))
     {
      Note(StringFormat("pending LIMIT rejected by broker, retcode=%u",retcode));
      return false;
     }
   GlobalVariableSet(signalKey,(double)candleAt);
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
   if(!EnableDemoOrders||DemoConfirmation!="I_ENABLE_DEMO_ONLY_V1")
     {
      CancelOwnedPending();
      Note("demo trading OFF. Requires user opt-in and exact confirmation.");
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
   if(!HistoryLimits()){Note("daily trade/loss cap");return;}
   const string headers="Authorization: Bearer "+BridgeToken+"\r\n";
   char request[],response[];
   string responseHeaders="";
   const string url=SiteURL+"/api/mt5/btc-demo-signal";
   ResetLastError();
   const int http=WebRequest("GET",url,headers,4000,request,response,responseHeaders);
   if(http!=200)
     {
      Note(StringFormat("demo signal unavailable HTTP=%d error=%d",http,GetLastError()));
      return;
     }
   const string wire=CharArrayToString(response,0,ArraySize(response),CP_UTF8);
   if(StringFind(wire,"QBTC1|WAIT|")==0)return;
   ValidateAndPlace(wire);
  }
void OnDeinit(const int reason)
  {
   EventKillTimer();
   // Pending orders must not remain unmanaged when the EA is removed.
   CancelOwnedPending();
   Print("Qannas BTC DEMO: stopped. Existing demo positions retain broker SL/TP.");
  }
// Does not import DLLs, place market entries, or trade live accounts.
