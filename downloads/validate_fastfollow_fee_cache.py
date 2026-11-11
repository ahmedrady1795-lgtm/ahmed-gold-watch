"""Tests real MQL cache functions in a C++ adapter, not MetaEditor or a market backtest."""
from pathlib import Path
import re, subprocess, tempfile
source=Path(__file__).with_name('AlQannas_FastFollow_DEMO_v3_00.mq5').read_text()
def function(name):
    m=re.search(r'(?:bool|void|ulong) '+name+r'\([^\n]*\)\s*\{',source)
    assert m, name
    end=source.index('{',m.start())+1; depth=1
    while depth:
        depth+=(source[end]=='{')-(source[end]=='}');end+=1
    return source[m.start():end]
head=r'''
#include <cassert>
#include <cmath>
#include <iostream>
#include <map>
#include <vector>
using ENUM_DEAL_ENTRY=int;
const int DEAL_ENTRY_IN=1,DEAL_ENTRY=2,DEAL_VOLUME=3,DEAL_COMMISSION=4,DEAL_FEE=5;
const int POSITION_IDENTIFIER=6,POSITION_PROFIT=7,POSITION_SWAP=8,POSITION_VOLUME=9;
struct Deal {int entry;double volume,commission,fee;};
std::map<ulong,std::vector<Deal>> histories;
ulong selectedHistory=0,positionId=11,fakeNow=10000;
int scans=0;bool historyAvailable=true;
double positionProfit=2,positionSwap=-0.1,positionVolume=0.05,InpEstimatedExitFeesUsd=0;
ulong g_feeIds[8]={},g_feeTime[8]={};double g_feeEntryVolume[8]={},g_feeCosts[8]={};int g_feeNext=0;
ulong GetTickCount64(){return fakeNow;}
bool HistorySelectByPosition(ulong id){scans++;selectedHistory=id;return historyAvailable;}
int HistoryDealsTotal(){return histories[selectedHistory].size();}
ulong HistoryDealGetTicket(int i){return i+1;}
long HistoryDealGetInteger(ulong d,int){return histories[selectedHistory][d-1].entry;}
double HistoryDealGetDouble(ulong d,int p){auto x=histories[selectedHistory][d-1];return p==DEAL_VOLUME?x.volume:p==DEAL_COMMISSION?x.commission:x.fee;}
long PositionGetInteger(int){return positionId;}
double PositionGetDouble(int p){return p==POSITION_PROFIT?positionProfit:p==POSITION_SWAP?positionSwap:positionVolume;}
double MathMin(double a,double b){return a<b?a:b;}
'''
body='\n'.join(function(n) for n in ['MsNow','InvalidateFeeCache','EntryFees','NetForSelected'])
test=r'''
int main(){
 histories[11]={{1,0.1,-0.2,-0.1},{0,0.05,-99,-99}};double net=0;
 assert(NetForSelected(net) && std::abs(net-1.75)<1e-9 && scans==1);
 positionProfit=3; // Live floating P/L must never be cached.
 for(int i=0;i<1000;i++)assert(NetForSelected(net) && std::abs(net-2.75)<1e-9);
 assert(scans==1);
 fakeNow+=999;assert(NetForSelected(net) && scans==1);
 histories[11][0].commission=-0.5;fakeNow++;
 assert(NetForSelected(net) && std::abs(net-2.6)<1e-9 && scans==2);
 InvalidateFeeCache();assert(NetForSelected(net) && scans==3);
 positionId=12;historyAvailable=false;
 assert(!NetForSelected(net));historyAvailable=true;
 assert(!NetForSelected(net)); // No entry history: do not fabricate net profit.
 histories[12]={{1,0.05,-0.1,0}};assert(NetForSelected(net));
 histories[12].push_back({1,0.05,-0.1,0});positionVolume=0.1;InvalidateFeeCache();
 assert(NetForSelected(net) && std::abs(net-2.7)<1e-9); // New fill invalidates volume/fees.
 double volume,fees;
 for(ulong i=100;i<109;i++){histories[i]={{1,0.01,0,0}};assert(EntryFees(i,volume,fees));}
 int before=scans;assert(EntryFees(100,volume,fees) && scans==before+1); // Bounded eviction.
 std::cout<<"Fee cache: live P/L, partial fee allocation, expiry, transaction invalidation, missing history and eviction passed; 1000 repeated reads used one history scan\n";
}
'''
with tempfile.TemporaryDirectory() as td:
    cpp=Path(td)/'cache.cpp';out=Path(td)/'cache_test';cpp.write_text(head+body+test)
    subprocess.run(['g++','-std=c++17','-Wall','-Wextra',str(cpp),'-o',str(out)],check=True)
    subprocess.run([str(out)],check=True)
