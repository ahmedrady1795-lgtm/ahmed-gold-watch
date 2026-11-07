//+------------------------------------------------------------------+
//| QannasReadOnlyBridge.mq5 - MT5 -> existing Render Qannas (demo)   |
//| Does NOT place, modify, or close any trade.                       |
//| Source: ahmed-gold-watch / render-free integration proposal       |
//+------------------------------------------------------------------+
#property strict
#property version "1.00"
#property description "Read-only Exness MT5 tick and closed-candle uploader for Qannas"
#property description "NO orders. No execution. Attach to the GOLD demo chart only."

input string QannasSiteURL="https://ahmed-gold-watch-free.onrender.com";
input string QannasBridgeToken="";
input string QannasSymbol="XAUUSDm";
input int    QannasPollSeconds=5;
input int    QannasCandlesIntervalSeconds=30;
input bool   QannasUploadCandles=true;

datetime lastCandleSent=0;
int failures=0;

string Price(const double value,const int decimals)
  {
   return DoubleToString(value,decimals);
  }

string ClosedBarsJSON(const ENUM_TIMEFRAMES tf,const int count,const int digits)
  {
   MqlRates bars[];
   const int copied=CopyRates(QannasSymbol,tf,1,count,bars);
   if(copied<count)
      return "[]"; // Do not fabricate missing broker candles.
   string json="[";
   for(int i=0;i<copied;i++)
     {
      if(i>0)json+=",";
      const long at=(long)bars[i].time*1000;
      json+=StringFormat("{\"time\":%I64d,\"open\":%s,\"high\":%s,\"low\":%s,\"close\":%s,\"tickVolume\":%I64d}",
         at,Price(bars[i].open,digits),Price(bars[i].high,digits),
         Price(bars[i].low,digits),Price(bars[i].close,digits),(long)bars[i].tick_volume);
     }
   return json+"]";
  }

int OnInit()
  {
   if(QannasSymbol!=_Symbol)
     {
      Print("Qannas read-only: attach to chart matching QannasSymbol.");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(StringFind(QannasSiteURL,"https://")!=0 || StringLen(QannasBridgeToken)<32)
     {
      Print("Qannas read-only: HTTPS server and a 32+ character private bridge token are required.");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(QannasPollSeconds<3 || QannasPollSeconds>60 ||
      QannasCandlesIntervalSeconds<15 || QannasCandlesIntervalSeconds>300)
      return INIT_PARAMETERS_INCORRECT;
   if(!EventSetTimer(QannasPollSeconds))
      return INIT_FAILED;
   Print("Qannas read-only bridge started on ",QannasSymbol,". No broker trade instructions exist.");
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

void OnTimer()
  {
   MqlTick tick;
   if(!SymbolInfoTick(QannasSymbol,tick) ||
      tick.time_msc<=0 || tick.bid<=0 || tick.ask<tick.bid)
     {
      if(failures<5)Print("Qannas read-only: no valid broker tick.");
      failures++;
      return;
     }
   const long nowTick=tick.time_msc;
   const int digits=(int)SymbolInfoInteger(QannasSymbol,SYMBOL_DIGITS);
   string json=StringFormat("{\"symbol\":\"%s\",\"tickTimeMs\":%I64d,\"bid\":%s,\"ask\":%s,\"mode\":\"dry-run\",\"microstructure\":{\"tickVolume\":%I64d,\"tickFlags\":%d}",
      QannasSymbol,nowTick,Price(tick.bid,digits),Price(tick.ask,digits),
      (long)tick.volume,(int)tick.flags);

   const datetime now=TimeLocal();
   const bool sendCandles=QannasUploadCandles &&
                         (lastCandleSent==0 || now-lastCandleSent>=QannasCandlesIntervalSeconds);
   if(sendCandles)
     {
      json+=",\"candles\":{\"c1\":"+ClosedBarsJSON(PERIOD_M1,240,digits)+
            ",\"c5\":"+ClosedBarsJSON(PERIOD_M5,240,digits)+
            ",\"c15\":"+ClosedBarsJSON(PERIOD_M15,240,digits)+
            ",\"c60\":"+ClosedBarsJSON(PERIOD_H1,240,digits)+"}";
     }
   json+="}";

   uchar utf8[];
   const int count=StringToCharArray(json,utf8,0,StringLen(json),CP_UTF8);
   if(count<=0)
     {
      Print("Qannas read-only: cannot encode JSON");
      return;
     }
   char post[];
   ArrayResize(post,count);
   for(int i=0;i<count;i++)post[i]=(char)utf8[i];
   char result[];
   string resultHeaders="";
   const string headers="Content-Type: application/json\r\nAuthorization: Bearer "+
                        QannasBridgeToken+"\r\n";
   const string url=QannasSiteURL+"/api/mt5/status";
   ResetLastError();
   const int http=WebRequest("POST",url,headers,6000,post,result,resultHeaders);
   if(http==200)
     {
      if(sendCandles)lastCandleSent=now;
      if(failures>0)Print("Qannas read-only: status sync restored.");
      failures=0;
      return;
     }
   failures++;
   if(failures<=5 || failures%12==0)
      PrintFormat("Qannas read-only: status sync failed HTTP=%d MQL_error=%d (check Render bridge token and allowed URL)",
                  http,GetLastError());
  }
// NO OrderSend / CTrade / TRADE_ACTION_* calls intentionally.
