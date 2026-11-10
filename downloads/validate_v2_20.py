from pathlib import Path
import re, subprocess
s=Path(__file__).with_name('AlQannas_Video_Chaser_DEMO_v2_20.mq5').read_text()
def fn(name):
 m=re.search(r'(?:bool|double|void|ulong|int) '+name+r'\([^\n]*\)\s*\{',s)
 assert m,name
 start=m.start(); pos=s.index('{',m.start()); depth=1; end=pos+1
 while depth:
  depth+=(s[end]=='{')-(s[end]=='}');end+=1
 return s[start:end]
head=r'''
#include <cmath>
#include <algorithm>
#include <cassert>
#include <string>
#include <iostream>
using std::string;
using ENUM_ORDER_TYPE=int;
using ENUM_ORDER_STATE=int;
const int ORDER_STATE_FILLED=1,ORDER_STATE_CANCELED=2,ORDER_STATE_REJECTED=3,ORDER_STATE_EXPIRED=4,ORDER_STATE=9;
ulong g_closeTickets[3]={},g_closeOrders[3]={},g_closeNext[3]={};bool g_closeUnknown[3]={};
bool activeOrder=false,hasHistory=false;int orderState=0;
bool OrderSelect(ulong){return activeOrder;}
bool HistoryOrderSelect(ulong){return hasHistory;}
long HistoryOrderGetInteger(ulong,int){return orderState;}

const int ORDER_TYPE_BUY=0,ORDER_TYPE_SELL=1;
const int SYMBOL_TRADE_TICK_SIZE=1,SYMBOL_TRADE_STOPS_LEVEL=2,SYMBOL_VOLUME_MIN=3,SYMBOL_VOLUME_MAX=4,SYMBOL_VOLUME_STEP=5;
string _Symbol="XAUUSD",g_status;
double _Point=0.001,brokerStops=0; int _Digits=3;
double SymbolInfoDouble(string,int p){return p==1?0.001:p==3?0.01:p==4?100:0.01;}
long SymbolInfoInteger(string,int){return (long)brokerStops;}
double NormalizeDouble(double p,int d){double x=std::pow(10,d);return std::round(p*x)/x;}
double MathMax(double a,double b){return std::max(a,b);} double MathMin(double a,double b){return std::min(a,b);}
double MathAbs(double a){return std::abs(a);} double MathFloor(double a){return std::floor(a);} double MathCeil(double a){return std::ceil(a);}
ulong GetTickCount64(){return 10000;}
bool OrderCalcProfit(int side,string,double v,double entry,double at,double &p){p=(at-entry)*v*100*(side==0?1:-1);return true;}
struct MqlTick {double bid,ask;long time_msc;};
long g_times[512],g_tickTime=0,g_signalSince=0;double g_prices[512],g_bids[512],g_asks[512];double g_lastEntryMid=0;int g_lastEntryDirection=0; ulong g_lossUntil=0,g_seenDeals[256];int g_seenHead=0;int g_head=-1,g_samples=0,g_signal=0;ulong g_quoteSeen=0;
'''
inputs='\n'.join(re.sub(r'^input ','',l) for l in s.splitlines() if l.startswith('input '))
body='\n'.join(fn(n) for n in ['MsNow','TickSize','PriceUp','PriceDown','MinStops','MinVolume','VolumeStep','FloorVolume','ProfitAt','MoneyDistance','Levels','Observe','ExitDecision','EntryStepOK','AfterLoss','SeenDeal','CloseOrderPending','CloseSlot'])
tests=r'''
int main(){
 int cases=0;
 for(double spread: {0.08,0.35,0.85,2.0}) for(double stops:{0.,50.,250.,1000.})
 for(double budget:{0.1,1.,6.,50.}) for(double lots:{0.01,0.12,0.20}) for(int side:{0,1}){
  brokerStops=stops; InpMaxLossPerTradeUsd=budget;InpRequestedLots=lots;InpMaxLots=lots;
  MqlTick q{4000.,4000.+spread,100000};double v=0,sl=0,tp=0,p=0;
  if(Levels(side,q,v,sl,tp)){
   double entry=side==0?q.ask:q.bid;
   OrderCalcProfit(side,_Symbol,v,entry,sl,p);
   assert(-p<=budget+1e-5);assert(p<0);assert(v<=lots+1e-8);assert(v>=0.01);
   assert(side==0?sl<=q.bid-MinStops()-0.002+1e-8:sl>=q.ask+MinStops()+0.002-1e-8);
   OrderCalcProfit(side,_Symbol,v,entry,tp,p);assert(p>=InpBackupTpProfitUsd-1e-6);
  }cases++;
 }
 InpMaxLossPerTradeUsd=50;InpRequestedLots=InpMaxLots=0.12;brokerStops=0;
 double v,sl,tp;MqlTick q{4000,4000.2,10000};assert(Levels(0,q,v,sl,tp));
 assert(std::abs((q.ask-sl)-50./(v*100))<0.002); // Regression: SL must use the requested budget.
 Observe(q);assert(g_signal==0);
 q.time_msc=10800;q.bid+=0.1;q.ask+=0.1;Observe(q);assert(g_signal==1);
 int before=g_samples;Observe(q);assert(g_samples==before); // Timer cannot fabricate ticks.
 q.time_msc=11600;q.bid-=0.3;q.ask-=0.3;Observe(q);assert(g_signal==-1);
 q.time_msc=16000;Observe(q);assert(g_signal==0 && g_samples==1); // Reconnect needs fresh warm-up.
 assert(CloseSlot(101)==0);assert(CloseSlot(102)==1);assert(CloseSlot(101)==0);
 g_closeOrders[0]=1001;assert(CloseOrderPending(0));assert(!CloseOrderPending(1));
 activeOrder=true;hasHistory=true;orderState=ORDER_STATE_FILLED;assert(CloseOrderPending(0));
 activeOrder=false;assert(!CloseOrderPending(0));assert(g_closeOrders[0]==0);
 g_closeUnknown[0]=true;assert(CloseOrderPending(0));assert(!CloseOrderPending(1));
 assert(CloseSlot(103)==2);assert(CloseSlot(104)==-1);
 assert(!SeenDeal(123));assert(SeenDeal(123));assert(!SeenDeal(124));
 AfterLoss();assert(g_lossUntil==12000 && g_samples==0 && g_signal==0);
 q.time_msc=16100;Observe(q);assert(g_signal==0 && g_samples==1);
 q.time_msc=16900;q.ask+=0.2;Observe(q);assert(g_signal==0); // Spread-only move.
 assert(ExitDecision(3990,-4,true,-4,0,1,1,0)==2);
 assert(ExitDecision(3990,6,true,6,0,1,1,0)==3);
 assert(ExitDecision(0,0,true,0,0,1,1,0)==1);
 assert(ExitDecision(3990,-1,true,-1,100,1,-1,50)==0);
 g_lastEntryDirection=1;g_lastEntryMid=4000;
 assert(!EntryStepOK(1,4000.01));assert(EntryStepOK(1,4000.09));
 std::cout<<cases<<" risk/rounding scenarios and signal regression checks passed\n";
}
'''
Path('/tmp/aq_numeric.cpp').write_text(head+inputs+'\n'+body+tests)
subprocess.run(['g++','-std=c++17','-Wall','-Wextra','/tmp/aq_numeric.cpp','-o','/tmp/aq_numeric'],check=True)
subprocess.run(['/tmp/aq_numeric'],check=True)
