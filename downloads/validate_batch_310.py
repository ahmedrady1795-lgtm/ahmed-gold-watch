from pathlib import Path
import re, subprocess
s=Path(__file__).with_name('AlQannas_FastFollow_DEMO_v3_10_BATCH3.mq5').read_text()
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
struct Pos {ulong ticket;long opened;int side;double net;bool own,available;};
Pos positions[8];int positionN=0,selected=-1;
const int POSITION_TYPE=10,POSITION_TIME_MSC=11,POSITION_TICKET=12,POSITION_TYPE_BUY=0;
ulong g_followTicket=0;double g_followNet=0;
int PositionsTotal(){return positionN;}
bool OwnPositionByIndex(int i){selected=i;return positions[i].own;}
long PositionGetInteger(int p){return p==POSITION_TYPE?positions[selected].side:p==POSITION_TIME_MSC?positions[selected].opened:positions[selected].ticket;}
bool PositionSelectByTicket(ulong t){for(int i=0;i<positionN;i++)if(positions[i].ticket==t){selected=i;return true;}return false;}
bool NetForSelected(double &net){net=positions[selected].net;return positions[selected].available;}

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
ulong fakeNow=10000;
ulong GetTickCount64(){return fakeNow;}
int g_burstRemaining=0,g_burstDirection=0;ulong g_burstStarted=0,g_lastEntryAttempt=0;
bool OrderCalcProfit(int side,string,double v,double entry,double at,double &p){p=(at-entry)*v*100*(side==0?1:-1);return true;}
struct MqlTick {double bid,ask;long time_msc;};
long g_times[4096],g_tickTime=0,g_signalSince=0;double g_prices[4096],g_bids[4096],g_asks[4096];double g_fastMove=0,g_slowMove=0,g_efficiency=0;double g_lastEntryMid=0;int g_lastEntryDirection=0; ulong g_lossUntil=0,g_seenDeals[256];int g_seenHead=0;int g_head=-1,g_samples=0,g_signal=0;ulong g_quoteSeen=0;
'''
inputs='\n'.join(re.sub(r'^input ','',l) for l in s.splitlines() if l.startswith('input '))
body='\n'.join(fn(n) for n in ['MsNow','TickSize','PriceUp','PriceDown','MinStops','MinVolume','VolumeStep','FloorVolume','ProfitAt','MoneyDistance','Levels','Observe','ExitDecision','EntryStepOK','CancelBurst','AfterLoss','SeenDeal','CloseOrderPending','CloseSlot','FollowEntryReady','EntryQuoteStillCurrent','EntryPacingReady','RefreshBurst','BurstEntryReady','StartBurst','RememberBurstAcceptance'])
tests=r'''
int main(){
 InpFollowProfitableEntry=true;
 assert(FollowEntryReady(1)); // First entry.
 positionN=1;positions[0]={101,100,0,0.24,true,true};assert(!FollowEntryReady(1));
 positions[0].net=0.25;assert(FollowEntryReady(1));
 positionN=2;positions[1]={102,200,0,-1.0,true,true};assert(!FollowEntryReady(1)); // Older profit cannot hide newest loss.
 assert(g_followTicket==102);positions[1].net=0.3;assert(FollowEntryReady(1));
 positions[1].available=false;assert(!FollowEntryReady(1));
 positions[1].available=true;positions[1].own=false;assert(FollowEntryReady(1) && g_followTicket==101);
 assert(FollowEntryReady(-1)); // Opposite direction is an independent initial entry.
 positions[1]={102,100,0,-1,true,true};assert(!FollowEntryReady(1) && g_followTicket==102); // Same-time tie.
 positions[0]={103,100,0,0.5,true,true};assert(FollowEntryReady(1) && g_followTicket==103); // Enumeration order is irrelevant.
 InpFollowProfitableEntry=false;assert(FollowEntryReady(1));InpFollowProfitableEntry=true;
 MqlTick decision{4000,4000.24,10000},live=decision;
 assert(EntryQuoteStillCurrent(decision,live));
 live.time_msc=10251;assert(!EntryQuoteStillCurrent(decision,live));
 live=decision;live.bid+=0.1;live.ask+=0.1;assert(!EntryQuoteStillCurrent(decision,live));
 live=decision;live.ask+=0.2;assert(!EntryQuoteStillCurrent(decision,live));
 live=decision;live.time_msc=9999;assert(!EntryQuoteStillCurrent(decision,live));
 InpFixedLots=false;
 // Default batch path: three consecutive admissions while predecessor loses.
 InpFollowProfitableEntry=false;
 g_lastEntryDirection=0;g_signal=1;CancelBurst();
 g_lastEntryAttempt=10000;fakeNow=10149;assert(!EntryPacingReady());fakeNow=10150;assert(EntryPacingReady());g_lastEntryAttempt=0;
 int submitted=0;
 for(int i=0;i<3;i++) {
  fakeNow=10000+i*InpEntryIntervalMs;RefreshBurst();
  positions[0].net=-2.88;positionN=1;
  assert(FollowEntryReady(1));
  assert(BurstEntryReady(1,4000));
  StartBurst(1,submitted);RememberBurstAcceptance(1,4000);submitted++;
 }
 assert(submitted==3 && g_burstRemaining==0);
 assert(!BurstEntryReady(1,4000)); // No fourth entry on the unchanged opportunity.
 assert(BurstEntryReady(1,4000.09));
 StartBurst(1,3);assert(g_burstRemaining==0);StartBurst(1,2);assert(g_burstRemaining==1);CancelBurst(); // Capacity respects existing exposure.
 StartBurst(1,0);RememberBurstAcceptance(1,4000);
 g_signal=-1;RefreshBurst();assert(g_burstRemaining==0); // Reversal cancels unfinished batch.
 g_signal=1;StartBurst(1,0);fakeNow+=InpBurstMaxAgeMs+1;RefreshBurst();assert(g_burstRemaining==0);
 StartBurst(1,0);g_signal=0;RefreshBurst();assert(g_burstRemaining==0); // Neutral cancels.
 fakeNow=10000;g_samples=20;g_signal=1;StartBurst(1,0);AfterLoss();
 assert(g_burstRemaining==0 && g_samples==20 && g_lossUntil==10000); // No warm-up pause by default.
 InpLossCooldownMs=2000;
 int cases=0;InpUsePriceTarget=false;
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
 auto reset=[](){g_head=-1;g_samples=0;g_signal=0;g_tickTime=0;g_signalSince=0;};
 reset();
 for(int i=0;i<=32;i++){q={4000+i*0.02,4000.24+i*0.02,10000+i*100};Observe(q);}
 assert(g_signal==1 && g_efficiency>0.99); // Sustained rising quotes can enter.
 reset();int firstStable=-1;
 for(int i=0;i<=40;i++){q={4000+i*0.012,4000.24+i*0.012,10000+i*50};Observe(q);
 if(g_signal==1 && q.time_msc-g_signalSince>=InpSignalStableMs && firstStable<0) firstStable=i*50;}
 assert(firstStable>=InpTrendWindowMs && firstStable<=InpTrendWindowMs+InpSignalStableMs+50);
 std::cout<<"Synthetic sustained-move first stable signal: "<<firstStable<<" ms (not broker latency)\n";
 int before=g_samples;Observe(q);assert(g_samples==before); // Timer creates no samples.
 reset();
 for(int i=0;i<=32;i++){q={4000-i*0.02,4000.24-i*0.02,10000+i*100};Observe(q);}
 assert(g_signal==-1 && g_efficiency>0.99); // Symmetric sell path.
 reset();
 for(int i=0;i<=10;i++){q={4000+i*0.04,4000.24+i*0.04,10000+i*100};Observe(q);}
 for(int i=11;i<=14;i++){double x=4000.4-(i-10)*0.02;q={x,x+0.24,10000+i*100};Observe(q);}
 assert(g_fastMove<0 && g_slowMove>0 && g_signal==0); // Fast reversal against slow rise.
 reset();
 for(int i=0;i<=32;i++){q={4000,4000.24+i*0.03,10000+i*100};Observe(q);}
 assert(g_signal==0); // Ask-only spread expansion cannot generate a buy.
 reset();
 for(int i=0;i<=32;i++){double x=4000+((i%2)?0.5:0)+i*0.01;q={x,x+0.24,10000+i*100};Observe(q);}
 assert(g_efficiency<0.1 && g_signal==0);
 q.time_msc=18000;Observe(q);assert(g_signal==0 && g_samples==1); // Gap forces warm-up.
 reset();
 for(int i=0;i<5000;i++){double x=4000+i*0.003;q={x,x+0.24,10000+i*10};Observe(q);}
 assert(g_samples==4096 && g_signal==1); // Ring wrap preserves valid references.
 InpMaxLossPerTradeUsd=6; q={4000,4000.24,100000};
 assert(Levels(0,q,v,sl,tp));assert(std::abs(v-0.05)<1e-8);
 InpMaxEntryCostFraction=0.60;assert(Levels(0,q,v,sl,tp));assert(std::abs(v-0.08)<1e-8);
 InpMaxEntryCostFraction=0.35;
 InpUsePriceTarget=true;
 for(int side:{0,1}) for(double requested:{0.01,0.05,0.12}){
  InpRequestedLots=InpMaxLots=requested;
  assert(Levels(side,q,v,sl,tp));double entry=side==0?q.ask:q.bid;
  assert(std::abs(std::abs(tp-entry)-0.45)<0.00101);
  double target=0;assert(ProfitAt(side,v,entry,entry+(side==0?0.45:-0.45),target));
  assert(ExitDecision(sl,target,true,target,0,1,1,0,target,true)==3);
  assert(ExitDecision(sl,target-0.1,true,target-0.1,0,1,1,0,target,true)==0);
  assert(ExitDecision(sl,target,true,-0.1,0,1,1,0,target,true)==0);
 }
 brokerStops=1000;assert(!Levels(0,q,v,sl,tp)); // Reject rather than widen a close target.
 brokerStops=0;
 assert(CloseSlot(101)==0);assert(CloseSlot(102)==1);assert(CloseSlot(101)==0);
 g_closeOrders[0]=1001;assert(CloseOrderPending(0));assert(!CloseOrderPending(1));
 activeOrder=true;hasHistory=true;orderState=ORDER_STATE_FILLED;assert(CloseOrderPending(0));
 activeOrder=false;assert(!CloseOrderPending(0));assert(g_closeOrders[0]==0);
 g_closeUnknown[0]=true;assert(CloseOrderPending(0));assert(!CloseOrderPending(1));
 assert(CloseSlot(103)==2);assert(CloseSlot(104)==-1);
 assert(!SeenDeal(123));assert(SeenDeal(123));assert(!SeenDeal(124));
 AfterLoss();assert(g_lossUntil==12000 && g_samples==0 && g_signal==0);
 q.time_msc=100100;Observe(q);assert(g_signal==0 && g_samples==1);
 q.time_msc=100900;q.ask+=0.2;Observe(q);assert(g_signal==0); // Spread-only move.
 assert(ExitDecision(3990,-4,true,-4,0,1,1,0,5.5,false)==2);
 assert(ExitDecision(3990,6,true,6,0,1,1,0,5.5,false)==3);
 assert(ExitDecision(0,0,true,0,0,1,1,0,5.5,false)==1);
 assert(ExitDecision(3990,-1,true,-1,100,1,-1,50,5.5,false)==0);
 g_lastEntryDirection=1;g_lastEntryMid=4000;
 assert(!EntryStepOK(1,4000.01));assert(EntryStepOK(1,4000.09));
 InpFixedLots=true;InpRequestedLots=InpMaxLots=0.12;
 InpUsePriceTarget=true;InpMaxLossPerTradeUsd=6;brokerStops=0;
 for(int side:{0,1}) {
  q={4000,4000.24,100000};assert(Levels(side,q,v,sl,tp));assert(std::abs(v-0.12)<1e-9);
  double entry=side==0?q.ask:q.bid,p=0;OrderCalcProfit(side,_Symbol,v,entry,sl,p);assert(-p<=6.00001);
  q={4000,4000.35,100000};assert(!Levels(side,q,v,sl,tp));assert(std::abs(v-0.12)<1e-9);
  q={4000,4000.24,100000};brokerStops=400;assert(!Levels(side,q,v,sl,tp));assert(std::abs(v-0.12)<1e-9);brokerStops=0;
 }
 InpRequestedLots=0.125;assert(!Levels(0,q,v,sl,tp)); // No silent broker-step rounding.
 InpRequestedLots=0.13;assert(!Levels(0,q,v,sl,tp)); // No silent MaxLots reduction.
 InpRequestedLots=0.12;
 std::cout<<cases<<" risk/rounding scenarios plus trend, reversal, chop, spread, ring-wrap, loss-reset and close-state and price-target invariance, profitable-follow and stale-quote, exact-fixed-volume and three-entry batch state checks passed\n";
}
'''
Path('/tmp/aq_numeric.cpp').write_text(head+inputs+'\n'+body+tests)
subprocess.run(['g++','-std=c++17','-Wall','-Wextra','/tmp/aq_numeric.cpp','-o','/tmp/aq_numeric'],check=True)
subprocess.run(['/tmp/aq_numeric'],check=True)
