//+------------------------------------------------------------------+
//| Al-Qannas Gold Read-Only MT5 -> Render Bridge                    |
//| Attach to a SEPARATE XAUUSDm H1 chart, NOT the trading EA chart. |
//| Publishes Exness bid/ask, closed candles and available DOM only. |
//| This EA NEVER PLACES OR CLOSES TRADES.                          |
//+------------------------------------------------------------------+
#property strict
#property version "1.00"
#property description "READ ONLY. MT5 Gold market feed to the existing Al-Qannas Render endpoint."
input string InpSiteUrl = "https://ahmed-gold-watch-free.onrender.com";
input string InpBridgeToken = ""; // Must equal Render MT5_BRIDGE_TOKEN. Never share it.
input int InpTickPushSeconds = 2;
input int InpCandlePushSeconds = 15;
input int InpRequestTimeoutMs = 5000;
input int InpCandleCount = 300;
input bool InpUseOrderBook = true;
input bool InpShowStatus = true;

datetime g_lastCandleSent = 0;
datetime g_lastTickSent = 0;
datetime g_lastWarn = 0;
string   g_state = "Waiting for connection";
bool     g_haveBook = false;
int      g_success = 0;
int      g_failed = 0;

bool ValidGold()
{
   string sym = _Symbol;
   StringToUpper(sym);
   return StringFind(sym,"XAUUSD")==0;
}
bool IsDemoOrTester()
{
   if(MQLInfoInteger(MQL_TESTER) != 0) return false; // WebRequest unavailable in tester.
   return ((ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE)==ACCOUNT_TRADE_MODE_DEMO);
}
string Price(double price){return DoubleToString(price,(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS));}
string Number(double v,int digits=4){return DoubleToString(v,digits);}
string ServerUrl()
{
   string url=InpSiteUrl;
   while(StringLen(url)>0 && StringSubstr(url,StringLen(url)-1,1)=="/")
      url=StringSubstr(url,0,StringLen(url)-1);
   return url+"/api/mt5/status";
}

string CandleJson(ENUM_TIMEFRAMES timeframe, int count, int &len)
{
   MqlRates rates[];
   // start_pos 1: closed bars only. MT5 copied physical array is oldest -> newest.
   int loaded=CopyRates(_Symbol,timeframe,1,count,rates);
   len=loaded;
   if(loaded<0)return "[]";
   string out="[";
   for(int i=0;i<loaded;i++)
   {
      if(i>0)out+=",";
      out+="{\"time\":"+IntegerToString((long)rates[i].time*1000)
          +",\"open\":"+Price(rates[i].open)
          +",\"high\":"+Price(rates[i].high)
          +",\"low\":"+Price(rates[i].low)
          +",\"close\":"+Price(rates[i].close)
          +",\"tickVolume\":"+IntegerToString((long)rates[i].tick_volume)
          +",\"realVolume\":"+IntegerToString((long)rates[i].real_volume)
          +",\"spread\":"+IntegerToString((long)rates[i].spread)+"}";
   }
   return out+"]";
}

string BookJson()
{
   string bids="[", asks="[";
   int nb=0,na=0;
   if(g_haveBook)
   {
      MqlBookInfo rows[];
      int n=0;
      if(MarketBookGet(_Symbol,rows))
      {
         n=ArraySize(rows);
         for(int i=0;i<n;i++)
         {
            double px=rows[i].price;
            double vol=rows[i].volume_real;
            if(vol<=0)vol=(double)rows[i].volume;
            if(px<=0 || vol<=0)continue;
            if(rows[i].type==BOOK_TYPE_BUY && nb<10)
            {
               if(nb>0)bids+=",";
               bids+="{\"price\":"+Price(px)+",\"volume\":"+Number(vol,4)+"}";
               nb++;
            }
            if(rows[i].type==BOOK_TYPE_SELL && na<10)
            {
               if(na>0)asks+=",";
               asks+="{\"price\":"+Price(px)+",\"volume\":"+Number(vol,4)+"}";
               na++;
            }
         }
      }
   }
   bids+="]";asks+="]";
   return "{\"available\":"+string((nb>0 && na>0)?"true":"false")
         +",\"reason\":"+string((nb>0 && na>0)?"null":"\"order_book_unavailable\"")
         +",\"bids\":"+bids+",\"asks\":"+asks+"}";
}

void Show()
{
   if(!InpShowStatus)return;
   Comment("AL-QANNAS GOLD READ-ONLY BRIDGE",
           "\n"+_Symbol+" -> Render",
           "\n"+g_state,
           "\nOK: "+IntegerToString(g_success)+" | Errors: "+IntegerToString(g_failed),
           "\nNo broker orders. Separate chart from gold EA.");
}

void Pulse()
{
   if(!IsDemoOrTester() || !ValidGold())return;
   datetime now=TimeLocal();
   if(now-g_lastTickSent<InpTickPushSeconds){Show();return;}
   g_lastTickSent=now;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick) || tick.bid<=0 || tick.ask<tick.bid || tick.time_msc<=0)
   {
      g_state="No valid Exness quote";Show();return;
   }
   if((long)(TimeCurrent()-(datetime)tick.time)>8)
   {
      g_state="Stale quote; market closed?";Show();return;
   }
   bool includeCandles=(g_lastCandleSent==0 || now-g_lastCandleSent>=InpCandlePushSeconds);
   string candleField="";
   if(includeCandles)
   {
      int n1=0,n5=0,n15=0,n60=0;
      string c1=CandleJson(PERIOD_M1,InpCandleCount,n1);
      string c5=CandleJson(PERIOD_M5,InpCandleCount,n5);
      string c15=CandleJson(PERIOD_M15,InpCandleCount,n15);
      string c60=CandleJson(PERIOD_H1,InpCandleCount,n60);
      if(n1>=80 && n5>=220 && n15>=220 && n60>=220)
      {
         candleField=",\"candles\":{\"c1\":"+c1+",\"c5\":"+c5
                    +",\"c15\":"+c15+",\"c60\":"+c60+"}";
      }
      else if(now-g_lastWarn>=30)
      {
         g_lastWarn=now;
         PrintFormat("AQ Gold Bridge: waiting for history M1=%d M5=%d M15=%d H1=%d",
                     n1,n5,n15,n60);
      }
   }
   string last=(tick.last>0.0 ? Price(tick.last) : "null");
   string body="{\"symbol\":\""+_Symbol+"\""
     +",\"tickTimeMs\":"+IntegerToString((long)tick.time_msc)
     +",\"bid\":"+Price(tick.bid)
     +",\"ask\":"+Price(tick.ask)
     +",\"last\":"+last
     +",\"mode\":\"dry-run\""
     +",\"account\":{\"login\":"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))
     +",\"balance\":"+Number(AccountInfoDouble(ACCOUNT_BALANCE),2)
     +",\"equity\":"+Number(AccountInfoDouble(ACCOUNT_EQUITY),2)
     +",\"marginLevel\":"+Number(AccountInfoDouble(ACCOUNT_MARGIN_LEVEL),2)+"}"
     +",\"microstructure\":{\"tickFlags\":"+IntegerToString((long)tick.flags)
     +",\"tickVolume\":"+Number(tick.volume_real,4)
     +",\"orderBook\":"+BookJson()+"}"
     +candleField+"}";
   char requestBody[],response[];
   int n=StringToCharArray(body,requestBody,0,WHOLE_ARRAY,CP_UTF8);
   if(n<=1)return;
   ArrayResize(requestBody,n-1); // Exclude terminating null byte.
   string responseHeaders="";
   string headers="Content-Type: application/json\r\nAuthorization: Bearer "+InpBridgeToken+"\r\n";
   ResetLastError();
   int status=WebRequest("POST",ServerUrl(),headers,InpRequestTimeoutMs,requestBody,response,responseHeaders);
   if(status==200)
   {
      g_success++;g_state="Connected: HTTP 200";
      if(candleField!="")g_lastCandleSent=now;
      if(g_success==1 || g_success%30==0)
         PrintFormat("AQ Gold Bridge: connected HTTP 200, pushes=%d candles=%s",
                     g_success,(candleField!=""?"yes":"no"));
   }
   else
   {
      g_failed++;
      int err=GetLastError();
      g_state="HTTP "+IntegerToString(status)+" / MT5 err "+IntegerToString(err);
      if(g_failed<=5 || g_failed%15==0)
         PrintFormat("AQ Gold Bridge: POST failed HTTP=%d MT5=%d body=%s",
                     status,err,CharArrayToString(response,0,MathMin(ArraySize(response),240),CP_UTF8));
   }
   Show();
}

int OnInit()
{
   if(!ValidGold())
   {
      Alert("Attach Al-Qannas bridge to an XAUUSDm chart only.");
      return INIT_FAILED;
   }
   if(!IsDemoOrTester())
   {
      Alert("This bridge is configured for a DEMO account only.");
      return INIT_FAILED;
   }
   if(StringFind(InpSiteUrl,"https://")!=0 ||
      StringLen(InpBridgeToken)<16 || InpTickPushSeconds<1 || InpTickPushSeconds>10 ||
      InpCandlePushSeconds<10 || InpCandlePushSeconds>120 ||
      InpRequestTimeoutMs<500 || InpRequestTimeoutMs>15000 ||
      InpCandleCount<240 || InpCandleCount>400)
   {
      Alert("Invalid URL / bridge token / interval. Configure Inputs and retry.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(InpUseOrderBook)
      g_haveBook=MarketBookAdd(_Symbol);
   EventSetTimer(1);
   Print("Al-Qannas Gold READ ONLY bridge initialized on ",_Symbol,
         " -> ",ServerUrl()," (token not logged)");
   Show();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   if(g_haveBook)MarketBookRelease(_Symbol);
   Comment("");
}

void OnTimer(){Pulse();}
void OnTick(){} // Network only on timer, never interferes with trading EA tick processing.
