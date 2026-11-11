"""Extracted MQL entry-fill state checks; no MT5/broker runtime is simulated fully."""
from pathlib import Path
import re,subprocess,tempfile
s=Path(__file__).with_name('AlQannas_FastFollow_DEMO_v3_10_BATCH3.mq5').read_text()
def fn(name):
 m=re.search(r'(?:bool|void) '+name+r'\([^\n]*\)\s*\{',s);assert m
 end=s.index('{',m.start())+1;depth=1
 while depth:depth+=(s[end]=='{')-(s[end]=='}');end+=1
 return s[m.start():end]
head=r'''
#include <vector>
#include <cassert>
#include <iostream>
using ENUM_ORDER_STATE=int;
const int DEAL_ORDER=1,DEAL_POSITION_ID=2,DEAL_ENTRY=3,DEAL_ENTRY_IN=4,DEAL_ENTRY_OUT=5,DEAL_ENTRY_OUT_BY=6;
const int ORDER_STATE=7,ORDER_STATE_CANCELED=8,ORDER_STATE_REJECTED=9,ORDER_STATE_EXPIRED=10,POSITION_IDENTIFIER=11,ORDER_STATE_FILLED=12;
struct Deal{ulong order,position;int entry;};std::vector<Deal> deals;std::vector<int> selection;
struct Pos{ulong id;bool own;};std::vector<Pos> positions;int selectedPosition=0;
ulong g_waitEntryOrder=0,g_waitEntryDeal=0,g_burstStarted=0;int g_burstRemaining=0,g_burstDirection=0;
bool historyAvailable=true,orderAvailable=false;int orderState=0;
long TimeCurrent(){return 10000;}
bool HistorySelect(long,long){selection.clear();if(!historyAvailable)return false;for(int i=0;i<(int)deals.size();i++)selection.push_back(i);return true;}
bool HistorySelectByPosition(ulong p){selection.clear();if(!historyAvailable)return false;for(int i=0;i<(int)deals.size();i++)if(deals[i].position==p)selection.push_back(i);return true;}
int HistoryDealsTotal(){return selection.size();}
ulong HistoryDealGetTicket(int i){return selection[i]+1;}
long HistoryDealGetInteger(ulong d,int p){auto x=deals[d-1];return p==DEAL_ORDER?x.order:p==DEAL_POSITION_ID?x.position:x.entry;}
bool HistoryDealSelect(ulong d){return historyAvailable && d>0 && d<=deals.size();}
bool HistoryOrderSelect(ulong){return orderAvailable;}
long HistoryOrderGetInteger(ulong,int){return orderState;}
int PositionsTotal(){return positions.size();}
bool OwnPositionByIndex(int i){selectedPosition=i;return positions[i].own;}
long PositionGetInteger(int){return positions[selectedPosition].id;}
'''
test=r'''
int main(){
 assert(!EntryFillPending());
 g_waitEntryOrder=11;assert(EntryFillPending());
 deals.push_back({11,101,DEAL_ENTRY_IN});assert(EntryFillPending()); // Filled but position update not visible yet.
 positions.push_back({101,true});assert(!EntryFillPending() && g_waitEntryOrder==0 && g_waitEntryDeal==0);
 positions.clear();deals.push_back({12,102,DEAL_ENTRY_IN});deals.push_back({12,102,DEAL_ENTRY_OUT});
 g_waitEntryOrder=12;g_burstRemaining=2;assert(!EntryFillPending() && g_burstRemaining==0); // Already closed.
 g_waitEntryOrder=13;orderAvailable=true;orderState=ORDER_STATE_FILLED;assert(EntryFillPending()); // Order-state alone cannot prove visible exposure.
 historyAvailable=false;assert(EntryFillPending());historyAvailable=true;
 orderState=ORDER_STATE_REJECTED;g_burstRemaining=2;assert(!EntryFillPending() && g_waitEntryOrder==0 && g_burstRemaining==0);
 orderAvailable=false;g_waitEntryOrder=14;assert(EntryFillPending()); // Unrelated past entries must not clear reservation.
 deals.push_back({14,104,DEAL_ENTRY_IN});positions.push_back({104,false});assert(EntryFillPending()); // Wrong owner cannot clear.
 positions[0].own=true;assert(!EntryFillPending());
 std::cout<<"Entry reservation tests passed: delayed account update, filled/closed, rejected, missing history and owner checks\n";
}
'''
with tempfile.TemporaryDirectory() as td:
 cpp=Path(td)/'fill.cpp';out=Path(td)/'fill';cpp.write_text(head+fn('CancelBurst')+fn('EntryFillPending')+test)
 subprocess.run(['g++','-std=c++17','-Wall','-Wextra',str(cpp),'-o',str(out)],check=True)
 subprocess.run([str(out)],check=True)
