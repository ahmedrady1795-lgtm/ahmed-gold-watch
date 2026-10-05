"""Ahmed Gold Watch -> MetaTrader 5 execution bridge.
Fail-closed by design. LIVE trading requires BOTH the site and this bridge to be enabled.
Use only on Windows/VPS with MetaTrader 5 installed and the intended account configured.
"""
from __future__ import annotations
import json, math, os, sys, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
import requests
from dotenv import load_dotenv
import MetaTrader5 as mt5

load_dotenv()
SITE_URL=os.getenv('SITE_URL','').rstrip('/')
TOKEN=os.getenv('MT5_BRIDGE_TOKEN','')
SYMBOL=os.getenv('MT5_SYMBOL','XAUUSDm')
LIVE=os.getenv('LIVE_TRADING','false').lower()=='true'
RISK_PCT=min(0.5,max(0.05,float(os.getenv('RISK_PER_TRADE_PCT','0.25'))))
MAX_DAILY_LOSS_PCT=min(1.5,max(0.25,float(os.getenv('MAX_DAILY_LOSS_PCT','1.0'))))
MAX_WEEKLY_LOSS_PCT=min(4.0,max(0.5,float(os.getenv('MAX_WEEKLY_LOSS_PCT','2.5'))))
MAX_DRAWDOWN_PCT=min(8.0,max(1.0,float(os.getenv('MAX_DRAWDOWN_PCT','3.0'))))
MAX_CONSECUTIVE_LOSSES=max(2,min(6,int(os.getenv('MAX_CONSECUTIVE_LOSSES','3'))))
MIN_MARGIN_LEVEL=max(100.0,float(os.getenv('MIN_MARGIN_LEVEL','300')))
MAX_OPEN=max(1,min(2,int(os.getenv('MAX_OPEN_POSITIONS','1'))))
MAX_SPREAD_POINTS=max(1,int(os.getenv('MAX_SPREAD_POINTS','100')))
MAX_SIGNAL_SLIPPAGE_POINTS=max(10,int(os.getenv('MAX_SIGNAL_SLIPPAGE_POINTS','150')))
MAX_TICK_AGE_MS=max(1000,int(os.getenv('MAX_TICK_AGE_MS','5000')))
MAX_PRECHECK_LATENCY_MS=max(250,int(os.getenv('MAX_PRECHECK_LATENCY_MS','1500')))
POLL=max(3,int(os.getenv('POLL_SECONDS','5')))
COOLDOWN=max(60,int(os.getenv('COOLDOWN_SECONDS','600')))
ATTEMPT_COOLDOWN=max(20,int(os.getenv('ATTEMPT_COOLDOWN_SECONDS','90')))
CANDLE_PUSH_SECONDS=max(10,int(os.getenv('MT5_CANDLE_PUSH_SECONDS','15')))
CANDLE_COUNT=max(240,min(500,int(os.getenv('MT5_CANDLE_COUNT','300'))))
MAGIC=int(os.getenv('MT5_MAGIC','5601795'))
SCALP_DEMO=os.getenv('SCALP_DEMO_MODE','false').lower()=='true'
SCALP_DEMO_POLL=max(0.5,float(os.getenv('SCALP_DEMO_POLL_SECONDS','1.0')))
SCALP_QUICK_MAX_HOLD=max(5,min(30,float(os.getenv('SCALP_QUICK_MAX_HOLD_SECONDS','12'))))
SCALP_QUICK_MIN_CONF=max(50,min(88,float(os.getenv('SCALP_QUICK_MIN_CONFIDENCE','66'))))
SCALP_QUICK_TP_SPREAD_MULT=max(1.4,min(4.0,float(os.getenv('SCALP_QUICK_TP_SPREAD_MULT','2.2'))))
SCALP_QUICK_SL_SPREAD_MULT=max(1.1,min(3.0,float(os.getenv('SCALP_QUICK_SL_SPREAD_MULT','1.6'))))
SCALP_QUICK_LOCK_TRIGGER=max(1.0,min(3.0,float(os.getenv('SCALP_QUICK_LOCK_TRIGGER','1.35'))))
SCALP_QUICK_GIVEBACK=max(0.35,min(1.5,float(os.getenv('SCALP_QUICK_GIVEBACK_SPREAD','0.65'))))
STATE=Path(__file__).with_name('.state.json')
KILL_SWITCH=Path(os.getenv('KILL_SWITCH_FILE',str(Path(__file__).with_name('KILL_SWITCH'))))

def log(*x): print(datetime.now().strftime('%Y-%m-%d %H:%M:%S'),*x,flush=True)
def state_read():
    try:
        x=json.loads(STATE.read_text('utf-8'));return x if isinstance(x,dict) else {}
    except:return {'last_signal':'','last_trade_at':0,'last_attempt_signal':'','last_attempt_at':0,'peak_equity':0,'last_quality':{},'last_candles_push_at':0,'demo_position':None,'demo_stats':{'trades':0,'wins':0,'losses':0,'net_points':0.0,'gross_win_points':0.0,'gross_loss_points':0.0,'profit_factor':0.0,'loss_streak':0}}
def state_write(s): STATE.write_text(json.dumps(s,ensure_ascii=False,indent=2),'utf-8')
def init_mt5():
    if mt5.terminal_info() is not None:return True
    path=os.getenv('MT5_TERMINAL_PATH') or None;login=os.getenv('MT5_LOGIN');password=os.getenv('MT5_PASSWORD');server=os.getenv('MT5_SERVER');kw={}
    if path:kw['path']=path
    if login:kw['login']=int(login)
    if password:kw['password']=password
    if server:kw['server']=server
    ok=mt5.initialize(**kw)
    if not ok:log('MT5 initialize failed',mt5.last_error())
    return ok

def auth_headers():return {'Authorization':'Bearer '+TOKEN}

def closed_rates(timeframe,count=CANDLE_COUNT):
    rates=mt5.copy_rates_from_pos(SYMBOL,timeframe,1,count) # start_pos=1 excludes the still-forming bar
    if rates is None:return []
    return [{'time':int(r['time'])*1000,'open':float(r['open']),'high':float(r['high']),'low':float(r['low']),'close':float(r['close']),'tickVolume':float(r['tick_volume']),'realVolume':float(r['real_volume']),'spread':float(r['spread'])} for r in rates]

def order_book_snapshot():
    try:
        if not mt5.market_book_add(SYMBOL):return {'available':False,'reason':'market_book_add_failed','bids':[],'asks':[]}
        rows=mt5.market_book_get(SYMBOL) or []
        buy_types={getattr(mt5,'BOOK_TYPE_BUY',2),getattr(mt5,'BOOK_TYPE_BUY_MARKET',4)}
        sell_types={getattr(mt5,'BOOK_TYPE_SELL',1),getattr(mt5,'BOOK_TYPE_SELL_MARKET',3)}
        bids=[];asks=[]
        for row in rows:
            price=float(getattr(row,'price',0) or 0);vol=float(getattr(row,'volume_dbl',0) or getattr(row,'volume',0) or 0);typ=int(getattr(row,'type',0) or 0)
            if price<=0 or vol<=0:continue
            item={'price':price,'volume':vol}
            if typ in buy_types:bids.append(item)
            elif typ in sell_types:asks.append(item)
        bids=sorted(bids,key=lambda x:x['price'],reverse=True)[:10];asks=sorted(asks,key=lambda x:x['price'])[:10]
        return {'available':bool(bids or asks),'reason':None if (bids or asks) else 'empty_book','bids':bids,'asks':asks}
    except Exception as e:return {'available':False,'reason':str(e)[:120],'bids':[],'asks':[]}
    finally:
        try:mt5.market_book_release(SYMBOL)
        except Exception:pass

def push_status(s):
    info=symbol_ready();tick=mt5.symbol_info_tick(SYMBOL) if info else None;account=mt5.account_info()
    if not info or tick is None or account is None:return False
    now=time.time();payload={'symbol':SYMBOL,'tickTimeMs':int(getattr(tick,'time_msc',0) or int(time.time()*1000)),'bid':float(tick.bid),'ask':float(tick.ask),'last':float(getattr(tick,'last',0) or 0) or None,'mode':'live' if LIVE else 'dry-run','lastQuality':s.get('last_quality',{}),'microstructure':{'orderBook':order_book_snapshot(),'tickFlags':int(getattr(tick,'flags',0) or 0),'tickVolume':float(getattr(tick,'volume_real',0) or getattr(tick,'volume',0) or 0)},'account':{'login':int(getattr(account,'login',0) or 0),'balance':float(getattr(account,'balance',0) or 0),'equity':float(getattr(account,'equity',0) or 0),'marginLevel':float(getattr(account,'margin_level',0) or 0)}}
    if now-float(s.get('last_candles_push_at',0) or 0)>=CANDLE_PUSH_SECONDS:
        candles={'c1':closed_rates(mt5.TIMEFRAME_M1),'c5':closed_rates(mt5.TIMEFRAME_M5),'c15':closed_rates(mt5.TIMEFRAME_M15),'c60':closed_rates(mt5.TIMEFRAME_H1)}
        if len(candles['c1'])>=80 and all(len(candles[k])>=220 for k in ('c5','c15','c60')):
            payload['candles']=candles;s['last_candles_push_at']=now
        else:log('MT5 candle snapshot incomplete', {k:len(v) for k,v in candles.items()})
    started=time.perf_counter();r=requests.post(SITE_URL+'/api/mt5/status',headers={**auth_headers(),'Content-Type':'application/json'},json=payload,timeout=15);latency=(time.perf_counter()-started)*1000
    if r.ok:s['last_status_latency_ms']=round(latency,1);return True
    log('MT5 status push rejected',r.status_code,r.text[:160]);return False

def site_signal():
    started=time.perf_counter();r=requests.get(SITE_URL+'/api/execution/signal',headers=auth_headers(),timeout=15);latency_ms=(time.perf_counter()-started)*1000
    r.raise_for_status();j=r.json();j['_site_latency_ms']=latency_ms;return j

def scalp_demo_signal():
    started=time.perf_counter();r=requests.get(SITE_URL+'/api/mt5/scalp-demo',headers=auth_headers(),timeout=6);latency_ms=(time.perf_counter()-started)*1000
    r.raise_for_status();j=r.json();j['_site_latency_ms']=latency_ms;return j

def journal_demo(event,pos,reason='',extra=None):
    try:
        payload={'id':f'scalp-demo:{event}:{int(time.time()*1000)}','kind':'scalp-demo','signalId':str(pos.get('id','')),'side':str(pos.get('side','')).lower(),'entry':pos.get('entry'),'sl':pos.get('sl'),'tp':pos.get('tp'),'score':pos.get('confidence'),'status':event,'source':'mt5-bridge-demo','metadata':{'reason':reason,'openedAt':pos.get('opened_at'),'closedAt':pos.get('closed_at'),'exit':pos.get('exit'),'pnlPoints':pos.get('pnl_points'),'latencyMs':pos.get('latency_ms'),**(extra or {})}}
        requests.post(SITE_URL+'/api/journal',headers={**auth_headers(),'Content-Type':'application/json'},json=payload,timeout=5)
    except Exception as e:log('demo journal failed',repr(e))

def scalp_demo_step(s):
    if LIVE or not SCALP_DEMO:return s
    info=symbol_ready();tick=mt5.symbol_info_tick(SYMBOL) if info else None
    if not info or tick is None:return s
    data=scalp_demo_signal()
    if not data.get('ok') or not data.get('demoOnly'):return s
    ambush=data.get('ambush') or {}
    pos=s.get('demo_position')
    now=time.time();bid=float(tick.bid);ask=float(tick.ask);point=float(info.point or 1)
    spread_points=max(0.0,(ask-bid)/point if point else 0.0)

    if pos:
        side=pos.get('side');entry=float(pos['entry']);exit_px=bid if side=='BUY' else ask
        pnl=(exit_px-entry)/point*(1 if side=='BUY' else -1)
        pos['best_points']=max(float(pos.get('best_points',-10**9)),pnl)
        pos['worst_points']=min(float(pos.get('worst_points',10**9)),pnl)

        hit_tp=exit_px>=float(pos['tp']) if side=='BUY' else exit_px<=float(pos['tp'])
        hit_sl=exit_px<=float(pos['sl']) if side=='BUY' else exit_px>=float(pos['sl'])
        timed=now-float(pos.get('opened_at',now))>=float(pos.get('max_hold_seconds',SCALP_QUICK_MAX_HOLD))

        live_side=str(ambush.get('side','WAIT'))
        live_active=bool(ambush.get('active'))
        live_conf=float(ambush.get('confidence',0) or 0)
        opposite=live_active and live_side in ('BUY','SELL') and live_side!=side
        weak=not live_active or live_side=='WAIT' or live_conf<max(42.0,float(pos.get('entry_confidence',SCALP_QUICK_MIN_CONF))*.70)
        pos['weak_polls']=int(pos.get('weak_polls',0))+1 if weak else 0

        lock_trigger=max(float(pos.get('spread_points',spread_points))*SCALP_QUICK_LOCK_TRIGGER,float(pos.get('tp_points',0))*0.45)
        giveback=max(3.0,float(pos.get('spread_points',spread_points))*SCALP_QUICK_GIVEBACK)
        profit_lock=bool(float(pos.get('best_points',0))>=lock_trigger and pnl>0 and float(pos.get('best_points',0))-pnl>=giveback)
        weak_exit=bool(pos.get('weak_polls',0)>=2 and now-float(pos.get('opened_at',now))>=2.0)
        fast_loss_cut=bool(pnl<0 and pos.get('weak_polls',0)>=1 and abs(pnl)>=max(3.0,spread_points*.55))

        if hit_tp or hit_sl or profit_lock or opposite or fast_loss_cut or weak_exit or timed:
            reason='TP' if hit_tp else 'SL' if hit_sl else 'PROFIT_LOCK' if profit_lock else 'FLOW_FLIP' if opposite else 'FAST_LOSS_CUT' if fast_loss_cut else 'WEAK_FLOW' if weak_exit else 'TIME'
            pos.update({'closed_at':now,'exit':exit_px,'pnl_points':round(pnl,1),'close_reason':reason})
            st=s.get('demo_stats') or {}
            st['trades']=int(st.get('trades',0))+1
            if pnl>0:
                st['wins']=int(st.get('wins',0))+1
                st['gross_win_points']=round(float(st.get('gross_win_points',0))+pnl,1)
                st['loss_streak']=0
            else:
                st['losses']=int(st.get('losses',0))+1
                st['gross_loss_points']=round(float(st.get('gross_loss_points',0))+abs(pnl),1)
                st['loss_streak']=int(st.get('loss_streak',0))+1
            st['net_points']=round(float(st.get('net_points',0))+pnl,1)
            gw=float(st.get('gross_win_points',0));gl=float(st.get('gross_loss_points',0))
            st['profit_factor']=round(gw/gl,2) if gl>0 else (9.99 if gw>0 else 0.0)
            st['win_rate']=round(float(st.get('wins',0))/max(1,int(st.get('trades',0)))*100,1)
            s['demo_stats']=st
            log('SCALP DEMO EXIT',side,reason,'entry',entry,'exit',exit_px,'pnl_pts',round(pnl,1),'best',round(float(pos.get('best_points',0)),1),'worst',round(float(pos.get('worst_points',0)),1),'stats',st)
            journal_demo('closed',pos,reason,{'stats':st,'bestPoints':pos.get('best_points'),'worstPoints':pos.get('worst_points')})
            s['demo_position']=None
        return s

    plan=ambush.get('plan') or data.get('plan')
    if not ambush.get('active') or not plan:return s
    if int(plan.get('expiresAt',0) or 0)<int(time.time()*1000):return s
    side=str(plan.get('side',ambush.get('side','WAIT')))
    confidence=float(ambush.get('confidence',0) or 0)
    st=s.get('demo_stats') or {}
    dynamic_min_conf=SCALP_QUICK_MIN_CONF+min(10.0,float(st.get('loss_streak',0))*2.5)
    if side not in ('BUY','SELL') or confidence<dynamic_min_conf:return s
    if spread_points<=0 or spread_points>MAX_SPREAD_POINTS:return s

    entry=ask if side=='BUY' else bid
    ref=float(plan.get('entry',entry));sl_ref=float(plan.get('sl',entry));tp_ref=float(plan.get('tp',entry))
    plan_sl_points=abs(ref-sl_ref)/point if point else 0.0
    plan_tp_points=abs(tp_ref-ref)/point if point else 0.0

    # Quick-capture profile: target must clear current spread/cost, but is capped so we exit before momentum fades.
    tp_points=max(spread_points*SCALP_QUICK_TP_SPREAD_MULT,min(plan_tp_points if plan_tp_points>0 else spread_points*3.0,spread_points*3.2))
    sl_points=max(spread_points*SCALP_QUICK_SL_SPREAD_MULT,min(plan_sl_points if plan_sl_points>0 else spread_points*2.0,tp_points*.92))
    tp_points=max(3.0,tp_points);sl_points=max(3.0,sl_points)

    pos={
        'id':plan.get('id'),'side':side,'entry':entry,
        'sl':entry-sl_points*point if side=='BUY' else entry+sl_points*point,
        'tp':entry+tp_points*point if side=='BUY' else entry-tp_points*point,
        'opened_at':now,'max_hold_seconds':min(SCALP_QUICK_MAX_HOLD,float(plan.get('maxHoldSeconds',SCALP_QUICK_MAX_HOLD) or SCALP_QUICK_MAX_HOLD)),
        'confidence':confidence,'entry_confidence':confidence,'latency_ms':round(float(data.get('_site_latency_ms',0)),1),
        'spread_points':round(spread_points,1),'tp_points':round(tp_points,1),'sl_points':round(sl_points,1),
        'best_points':-spread_points,'worst_points':-spread_points,'weak_polls':0
    }
    s['demo_position']=pos
    log('SCALP DEMO ENTRY',side,'entry',entry,'sl',pos['sl'],'tp',pos['tp'],'tp_pts',round(tp_points,1),'sl_pts',round(sl_points,1),'spread_pts',round(spread_points,1),'hold',pos['max_hold_seconds'],'confidence',confidence,'latency_ms',pos['latency_ms'])
    journal_demo('opened',pos,'QUICK_CAPTURE_ENTRY',{'ambush':ambush,'dynamicMinConfidence':dynamic_min_conf})
    return s

def journal_execution(signal,ok,message,s):
    try:
        payload={'id':f'execution:{signal.get("id","unknown")}:{int(time.time()*1000)}','kind':'execution','signalId':str(signal.get('id','')),'side':signal.get('sideCode'),'entry':signal.get('entry'),'sl':signal.get('sl'),'tp':signal.get('tp'),'score':signal.get('score'),'status':'accepted' if ok else 'rejected','source':'mt5-bridge','metadata':{'live':LIVE,'mode':signal.get('mode','standard'),'eventName':signal.get('eventName'),'message':str(message)[:1200],'quality':s.get('last_quality',{})}}
        requests.post(SITE_URL+'/api/journal',headers={**auth_headers(),'Content-Type':'application/json'},json=payload,timeout=8)
    except Exception as e:log('journal push failed',repr(e))

def symbol_ready():
    info=mt5.symbol_info(SYMBOL)
    if info is None:return None
    if not info.visible and not mt5.symbol_select(SYMBOL,True):return None
    return mt5.symbol_info(SYMBOL)

def period_deals(start,now):
    return [d for d in (mt5.history_deals_get(start,now) or []) if int(getattr(d,'magic',0) or 0)==MAGIC]
def pnl_of(deals):
    return sum(float(getattr(d,'profit',0) or 0)+float(getattr(d,'commission',0) or 0)+float(getattr(d,'swap',0) or 0)+float(getattr(d,'fee',0) or 0) for d in deals)
def realized_today():
    now=datetime.now(timezone.utc);start=datetime(now.year,now.month,now.day,tzinfo=timezone.utc);return pnl_of(period_deals(start,now))
def realized_week():
    now=datetime.now(timezone.utc);return pnl_of(period_deals(now-timedelta(days=7),now))
def consecutive_losses():
    now=datetime.now(timezone.utc);deals=period_deals(now-timedelta(days=14),now);outs=[]
    out_const=getattr(mt5,'DEAL_ENTRY_OUT',1);out_by=getattr(mt5,'DEAL_ENTRY_OUT_BY',3)
    for d in deals:
        if int(getattr(d,'entry',-1)) not in (out_const,out_by):continue
        p=float(getattr(d,'profit',0) or 0)+float(getattr(d,'commission',0) or 0)+float(getattr(d,'swap',0) or 0)+float(getattr(d,'fee',0) or 0);outs.append((int(getattr(d,'time_msc',0) or 0),p))
    losses=0
    for _,p in sorted(outs,reverse=True):
        if p<0:losses+=1
        elif p>0:break
    return losses

def update_peak(account,s):
    equity=float(account.equity);peak=max(float(s.get('peak_equity',0) or 0),equity);s['peak_equity']=peak;dd=100*(peak-equity)/peak if peak>0 else 0;return dd

def risk_guard(account,s):
    if KILL_SWITCH.exists():return False,'local KILL_SWITCH file is present',0
    daily=realized_today();weekly=realized_week();equity=max(1.0,float(account.equity));balance=max(1.0,float(account.balance));
    if daily<=-(balance*MAX_DAILY_LOSS_PCT/100):return False,f'daily loss kill switch: {daily:.2f}',0
    if weekly<=-(balance*MAX_WEEKLY_LOSS_PCT/100):return False,f'weekly loss kill switch: {weekly:.2f}',0
    losses=consecutive_losses()
    if losses>=MAX_CONSECUTIVE_LOSSES:return False,f'consecutive-loss kill switch: {losses}',losses
    dd=update_peak(account,s)
    if dd>=MAX_DRAWDOWN_PCT:return False,f'equity drawdown kill switch: {dd:.2f}%',losses
    margin=float(getattr(account,'margin_level',0) or 0)
    if margin>0 and margin<MIN_MARGIN_LEVEL:return False,f'margin level too low: {margin:.1f}%',losses
    return True,f'daily={daily:.2f}, weekly={weekly:.2f}, dd={dd:.2f}%',losses

def normalize_volume(info,v):
    step=max(1e-8,float(info.volume_step or .01));min_v=float(info.volume_min or step);max_v=float(info.volume_max or v)
    if v+1e-12<min_v:return None
    capped=min(max_v,float(v));normalized=round(math.floor((capped+1e-12)/step)*step,8)
    return normalized if normalized+1e-12>=min_v else None
def size_for_risk(account,info,order_type,entry,sl,risk_pct):
    risk_cash=float(account.equity)*risk_pct/100;loss=mt5.order_calc_profit(order_type,SYMBOL,1.0,entry,sl)
    if loss is None or abs(loss)<1e-9:return None
    raw=risk_cash/abs(float(loss));volume=normalize_volume(info,raw)
    if volume is None:return None # never round a too-small risk size UP to broker minimum
    actual=mt5.order_calc_profit(order_type,SYMBOL,volume,entry,sl)
    if actual is None or abs(float(actual))>risk_cash*1.02:return None
    return volume
def broker_spread(info,tick):return (tick.ask-tick.bid)/float(info.point) if info.point else 10**9

def send(signal,s):
    info=symbol_ready();tick=mt5.symbol_info_tick(SYMBOL) if info else None;account=mt5.account_info()
    if not info or tick is None or account is None:return False,'MT5 data unavailable',s
    allowed,risk_status,loss_streak=risk_guard(account,s)
    if not allowed:return False,risk_status,s
    positions=mt5.positions_get(symbol=SYMBOL) or []
    if len(positions)>=MAX_OPEN:return False,'max open positions reached',s
    spread_pts=broker_spread(info,tick)
    if spread_pts>MAX_SPREAD_POINTS:return False,f'broker spread too wide: {spread_pts:.1f} points',s
    tick_msc=int(getattr(tick,'time_msc',0) or 0);tick_age=max(0,int(time.time()*1000)-tick_msc) if tick_msc else 0
    if tick_age and tick_age>MAX_TICK_AGE_MS:return False,f'stale broker tick: {tick_age}ms',s
    buy=signal.get('sideCode')=='buy';order_type=mt5.ORDER_TYPE_BUY if buy else mt5.ORDER_TYPE_SELL;entry=float(tick.ask if buy else tick.bid);ref=float(signal['entry']);point=float(info.point or 0)
    source_slippage_pts=abs(entry-ref)/point if point else 10**9
    if source_slippage_pts>MAX_SIGNAL_SLIPPAGE_POINTS:return False,f'pre-trade slippage too large: {source_slippage_pts:.1f} points',s
    sl_dist=abs(ref-float(signal['sl']));tp_dist=abs(float(signal['tp'])-ref)
    if sl_dist<=0 or tp_dist/sl_dist<1.75:return False,'invalid risk/reward',s
    sl=entry-sl_dist if buy else entry+sl_dist;tp=entry+tp_dist if buy else entry-tp_dist
    news_mode=signal.get('mode')=='news';effective_risk=RISK_PCT*(0.5 if news_mode else 1.0)*(0.5 if loss_streak>=2 else 1.0);volume=size_for_risk(account,info,order_type,entry,sl,effective_risk)
    if volume is None or volume<float(info.volume_min):return False,'risk size below broker minimum or calc failed',s
    request={'action':mt5.TRADE_ACTION_DEAL,'symbol':SYMBOL,'volume':volume,'type':order_type,'price':entry,'sl':sl,'tp':tp,'deviation':30,'magic':MAGIC,'comment':'AhmedGoldWatch','type_time':mt5.ORDER_TIME_GTC}
    fillings=[getattr(mt5,'ORDER_FILLING_IOC',1),getattr(mt5,'ORDER_FILLING_RETURN',2),getattr(mt5,'ORDER_FILLING_FOK',0)];last=''
    for filling in fillings:
        request['type_filling']=filling;t0=time.perf_counter();check=mt5.order_check(request);check_ms=(time.perf_counter()-t0)*1000
        if check_ms>MAX_PRECHECK_LATENCY_MS:return False,f'order_check latency too high: {check_ms:.0f}ms',s
        if check is None:last='order_check failed';continue
        if getattr(check,'retcode',-1) not in (0,getattr(mt5,'TRADE_RETCODE_DONE',10009)):last=f'order_check retcode={getattr(check,"retcode",None)}';continue
        quality={'at':int(time.time()*1000),'siteLatencyMs':round(float(signal.get('_site_latency_ms',0)),1),'tickAgeMs':tick_age,'spreadPoints':round(spread_pts,1),'sourceSlippagePoints':round(source_slippage_pts,1),'orderCheckMs':round(check_ms,1),'riskPct':round(effective_risk,3),'lossStreak':loss_streak,'mode':'news' if news_mode else 'standard'}
        if not LIVE:
            s['last_quality']=quality;return True,f'DRY RUN: {"BUY" if buy else "SELL"} {volume} {SYMBOL} entry={entry} sl={sl} tp={tp} | quality={quality}',s
        t1=time.perf_counter();result=mt5.order_send(request);send_ms=(time.perf_counter()-t1)*1000;quality['orderSendMs']=round(send_ms,1)
        if result and result.retcode==mt5.TRADE_RETCODE_DONE:
            fill=float(getattr(result,'price',entry) or entry);quality['fillSlippagePoints']=round(abs(fill-entry)/point,1) if point else None;s['last_quality']=quality
            return True,f'order sent ticket={result.order} deal={result.deal} fill={fill} quality={quality}',s
        last=f'order_send retcode={getattr(result,"retcode",None)} last_error={mt5.last_error()}'
    return False,last or 'no valid filling mode',s

def main():
    if not SITE_URL.startswith('https://') or not TOKEN:sys.exit('Set SITE_URL=https://... and MT5_BRIDGE_TOKEN in .env')
    log('bridge starting','LIVE' if LIVE else 'DRY RUN','symbol',SYMBOL,'risk',RISK_PCT,'%','scalp_demo',SCALP_DEMO and not LIVE)
    failures=0
    while True:
        try:
            if not init_mt5():raise RuntimeError('MT5 not connected')
            s=state_read();push_status(s)
            if SCALP_DEMO and not LIVE:
                s=scalp_demo_step(s);state_write(s)
                failures=0;time.sleep(SCALP_DEMO_POLL);continue
            state_write(s)
            data=site_signal()
            failures=0
            if not data.get('ok'):raise RuntimeError(str(data))
            if not data.get('allowed') or not data.get('signal'):time.sleep(POLL);continue
            now_ms=int(time.time()*1000)
            if now_ms>int(data.get('expiresAt',0) or 0):log('expired site signal rejected');time.sleep(POLL);continue
            sig=dict(data['signal']);sig['_site_latency_ms']=data.get('_site_latency_ms',0);sid=str(sig.get('id',''));s=state_read();now=time.time()
            if not sid or sid==s.get('last_signal') or now-float(s.get('last_trade_at',0))<COOLDOWN:time.sleep(POLL);continue
            if sid==s.get('last_attempt_signal') and now-float(s.get('last_attempt_at',0) or 0)<ATTEMPT_COOLDOWN:time.sleep(POLL);continue
            s['last_attempt_signal']=sid;s['last_attempt_at']=now;state_write(s)
            side='BUY' if sig.get('sideCode')=='buy' else 'SELL';mode=str(sig.get('mode','standard')).upper();score=sig.get('score','—')
            ok,msg,s=send(sig,s);log(msg);state_write(s);journal_execution(sig,ok,msg,s)
            if ok:
                s['last_signal']=sid;s['last_trade_at']=now;state_write(s)
        except KeyboardInterrupt:break
        except Exception as e:
            failures+=1;log('watchdog error',repr(e),'failures',failures)
            try:mt5.shutdown()
            except:pass
            time.sleep(min(60,2**min(failures,5)))
    mt5.shutdown()
if __name__=='__main__':main()
