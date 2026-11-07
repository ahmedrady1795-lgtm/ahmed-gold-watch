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
from limit_scalper import build_limit_plan
from pending_guard import pending_cancel_reason

load_dotenv()
SITE_URL=os.getenv('SITE_URL','').rstrip('/')
TOKEN=os.getenv('MT5_BRIDGE_TOKEN','')
SYMBOL=os.getenv('MT5_SYMBOL','XAUUSDm')
LIVE=os.getenv('LIVE_TRADING','false').lower()=='true'
LIVE_ACK=os.getenv('MT5_LIVE_ACK','')
EXPECTED_LOGIN=os.getenv('MT5_EXPECTED_LOGIN','').strip()
LIVE_ACK_REQUIRED='I_ACCEPT_LIVE_MT5_RISK_V1'
# These local ceilings must never be looser than the policy advertised by the site.
RISK_PCT=min(0.15,max(0.0,float(os.getenv('RISK_PER_TRADE_PCT','0.10'))))
MAX_DAILY_LOSS_PCT=min(0.5,max(0.0,float(os.getenv('MAX_DAILY_LOSS_PCT','0.5'))))
MAX_WEEKLY_LOSS_PCT=min(1.5,max(0.0,float(os.getenv('MAX_WEEKLY_LOSS_PCT','1.5'))))
MAX_DRAWDOWN_PCT=min(3.0,max(0.0,float(os.getenv('MAX_DRAWDOWN_PCT','3.0'))))
MAX_CONSECUTIVE_LOSSES=max(1,min(2,int(os.getenv('MAX_CONSECUTIVE_LOSSES','2'))))
MIN_MARGIN_LEVEL=max(100.0,float(os.getenv('MIN_MARGIN_LEVEL','300')))
MAX_OPEN=1 # one symbol position maximum, including orders from other EAs
MAX_SPREAD_POINTS=max(1,int(os.getenv('MAX_SPREAD_POINTS','100')))
MAX_SIGNAL_SLIPPAGE_POINTS=max(10,int(os.getenv('MAX_SIGNAL_SLIPPAGE_POINTS','150')))
MAX_TICK_AGE_MS=max(1000,int(os.getenv('MAX_TICK_AGE_MS','5000')))
MAX_PRECHECK_LATENCY_MS=max(250,int(os.getenv('MAX_PRECHECK_LATENCY_MS','1500')))
# Pending LIMIT only; never turn a non-marketable retest into a market DEAL.
MT5_LIMIT_EXPIRY_SECONDS=max(15,min(45,int(os.getenv('MT5_LIMIT_EXPIRY_SECONDS','30'))))
MT5_COMMISSION_ROUNDTRIP_PRICE=max(0.0,float(os.getenv('MT5_COMMISSION_ROUNDTRIP_PRICE','0')))
POLL=max(3,int(os.getenv('POLL_SECONDS','5')))
COOLDOWN=max(60,int(os.getenv('COOLDOWN_SECONDS','600')))
ATTEMPT_COOLDOWN=max(20,int(os.getenv('ATTEMPT_COOLDOWN_SECONDS','90')))
CANDLE_PUSH_SECONDS=max(10,int(os.getenv('MT5_CANDLE_PUSH_SECONDS','15')))
CANDLE_COUNT=max(240,min(500,int(os.getenv('MT5_CANDLE_COUNT','300'))))
MAGIC=int(os.getenv('MT5_MAGIC','5601795'))
SCALP_DEMO=os.getenv('SCALP_DEMO_MODE','false').lower()=='true'
SCALP_DEMO_POLL=max(0.5,float(os.getenv('SCALP_DEMO_POLL_SECONDS','1.0')))
SCALP_QUICK_MAX_HOLD=max(5,min(30,float(os.getenv('SCALP_QUICK_MAX_HOLD_SECONDS','30'))))
SCALP_QUICK_MIN_CONF=max(50,min(88,float(os.getenv('SCALP_QUICK_MIN_CONFIDENCE','66'))))
SCALP_QUICK_TP_SPREAD_MULT=max(1.4,min(4.0,float(os.getenv('SCALP_QUICK_TP_SPREAD_MULT','2.2'))))
SCALP_QUICK_SL_SPREAD_MULT=max(1.1,min(3.0,float(os.getenv('SCALP_QUICK_SL_SPREAD_MULT','1.6'))))
SCALP_QUICK_LOCK_TRIGGER=max(1.0,min(3.0,float(os.getenv('SCALP_QUICK_LOCK_TRIGGER','1.35'))))
SCALP_QUICK_GIVEBACK=max(0.35,min(1.5,float(os.getenv('SCALP_QUICK_GIVEBACK_SPREAD','0.65'))))
STATE=Path(__file__).with_name('.state.json')
KILL_SWITCH=Path(os.getenv('KILL_SWITCH_FILE',str(Path(__file__).with_name('KILL_SWITCH'))))

def log(*x): print(datetime.now().strftime('%Y-%m-%d %H:%M:%S'),*x,flush=True)
def empty_state():
    return {'last_signal':'','last_trade_at':0,'last_attempt_signal':'','last_attempt_at':0,'peak_equity':0,'last_quality':{},'last_candles_push_at':0,'demo_position':None,'demo_pending':None,'demo_stats':{'trades':0,'wins':0,'losses':0,'net_points':0.0,'gross_win_points':0.0,'gross_loss_points':0.0,'profit_factor':0.0,'loss_streak':0}}
def state_read():
    try:
        x=json.loads(STATE.read_text('utf-8'))
        if not isinstance(x,dict):raise ValueError('invalid state object')
        return x
    except FileNotFoundError:return empty_state()
    except Exception as e:
        # Corrupt local state must not silently reset the live duplicate-order guard.
        if LIVE:raise RuntimeError('Live state unreadable; manual intervention required') from e
        return empty_state()
def state_write(s):
    tmp=STATE.with_suffix('.tmp')
    tmp.write_text(json.dumps(s,ensure_ascii=False,indent=2),'utf-8')
    os.replace(tmp,STATE)
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

# MarketBookAdd is a persistent MT5 terminal subscription. Subscribe ONCE,
# let the broker stream warm up, then read successive snapshots. Immediate
# add/get/release cycles repeatedly discard some brokers' books.
BOOK_SUBSCRIBED_SYMBOL=None
BOOK_MISSING_READS=0

def close_market_book():
    global BOOK_SUBSCRIBED_SYMBOL,BOOK_MISSING_READS
    if BOOK_SUBSCRIBED_SYMBOL:
        try:mt5.market_book_release(BOOK_SUBSCRIBED_SYMBOL)
        except Exception:pass
    BOOK_SUBSCRIBED_SYMBOL=None
    BOOK_MISSING_READS=0

def order_book_snapshot():
    global BOOK_SUBSCRIBED_SYMBOL,BOOK_MISSING_READS
    try:
        if BOOK_SUBSCRIBED_SYMBOL!=SYMBOL:
            close_market_book()
            if not mt5.market_book_add(SYMBOL):
                return {'available':False,'reason':'market_book_add_failed','bids':[],'asks':[]}
            BOOK_SUBSCRIBED_SYMBOL=SYMBOL
        rows=mt5.market_book_get(SYMBOL)
        if not rows:
            BOOK_MISSING_READS+=1
            if BOOK_MISSING_READS>=3:close_market_book()
            return {'available':False,'reason':'broker_book_warming_or_empty','bids':[],'asks':[]}
        BOOK_MISSING_READS=0
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
        # Only a two-sided, timestamped broker book is valid evidence.
        # Some OTC gold symbols do not publish market depth at all.
        available=bool(len(bids)>=2 and len(asks)>=2 and bids[0]['price']<asks[0]['price'])
        return {'available':available,'reason':None if available else 'no_valid_two_sided_broker_book',
                'capturedAt':int(time.time()*1000),'symbol':SYMBOL,
                'bids':bids if available else [],'asks':asks if available else []}
    except Exception as e:
        close_market_book()
        return {'available':False,'reason':str(e)[:120],'bids':[],'asks':[]}

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

    if s.get('demo_pending') and not pos:
        pending=s['demo_pending']
        requested=str(pending.get('side','WAIT'))
        entry=float(pending.get('entry',0))
        started_msc=int(pending.get('last_tick_msc',0) or 0)
        current_msc=int(getattr(tick,'time_msc',0) or 0)
        expires=float(pending.get('expires_at',0) or 0)
        if (now>=expires or KILL_SWITCH.exists() or
            ambush.get('side')!=requested or not ambush.get('active') or
            spread_points>MAX_SPREAD_POINTS or current_msc<started_msc or
            (current_msc-started_msc)>5000):

            log('SCALP DEMO LIMIT EXPIRED/CANCELED',pending.get('id'))
            s['demo_pending']=None
            return s
        if current_msc==started_msc:
            # An unchanged quote is not new evidence of a limit touch.
            return s
        px=ask if requested=='BUY' else bid
        last=float(pending['last_executable'])
        touched=(last>entry>=px) if requested=='BUY' else (last<entry<=px)
        if not touched:
            pending['last_executable']=px
            pending['last_tick_msc']=current_msc
            return s
        risk=float(pending['sl_points'])*point
        if abs(px-entry)>risk*.35:
            log('SCALP DEMO LIMIT GAP UNKNOWN',pending.get('id'))
            s['demo_pending']=None;return s
        pos={k:v for k,v in pending.items() if k not in
             ('expires_at','last_executable','last_tick_msc','order_type')}
        pos['entry']=entry
        pos['sl']=entry-float(pos['sl_points'])*point if requested=='BUY' else entry+float(pos['sl_points'])*point
        pos['tp']=entry+float(pos['tp_points'])*point if requested=='BUY' else entry-float(pos['tp_points'])*point
        pos['opened_at']=now
        pos['best_points']=-spread_points;pos['worst_points']=-spread_points
        pos['weak_polls']=0
        s['demo_pending']=None;s['demo_position']=pos
        log('SCALP DEMO LIMIT FILLED',requested,'entry',entry,'ref quote',px)
        journal_demo('opened',pos,'LIMIT_TOUCH_ONLY',{'orderType':pending.get('order_type')})
        return s

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

    # The Ambush entry is a ZONE object, not a market-fill price.
    # A limit is derived from the observed zone midpoint, only if that
    # fixed level is on the non-marketable side of the broker bid/ask.
    zone=plan.get('entry')
    if not isinstance(zone,dict) or not zone.get('ready'):return s
    try:
        low=float(zone['zoneLow']);high=float(zone['zoneHigh'])
    except (ValueError,TypeError,KeyError):return s
    if not all(math.isfinite(v) for v in (low,high)) or low<=0 or high<low:return s
    entry=round((low+high)/2,int(info.digits))
    min_gap=max(point,float(getattr(info,'trade_stops_level',0) or 0)*point)
    if side=='BUY' and not entry<=ask-min_gap:return s
    if side=='SELL' and not entry>=bid+min_gap:return s
    ref=entry
    plan_sl_points=spread_points*2.0
    plan_tp_points=spread_points*3.0

    # Quick-capture profile: target must clear current spread/cost, but is capped so we exit before momentum fades.
    tp_points=max(spread_points*SCALP_QUICK_TP_SPREAD_MULT,min(plan_tp_points if plan_tp_points>0 else spread_points*3.0,spread_points*3.2))
    sl_points=max(spread_points*SCALP_QUICK_SL_SPREAD_MULT,min(plan_sl_points if plan_sl_points>0 else spread_points*2.0,tp_points*.92))
    tp_points=max(3.0,tp_points);sl_points=max(3.0,sl_points)

    ttl_ms=int(plan.get('expiresAt',0) or 0)
    expires_at=min(now+30,ttl_ms/1000 if ttl_ms>0 else now+30)
    if expires_at-now<3 or KILL_SWITCH.exists():return s
    pending={
        'id':plan.get('id') or 'ambush:'+side+':'+str(int(now*1000)),
        'side':side,'entry':entry,
        'order_type':'BUY_LIMIT' if side=='BUY' else 'SELL_LIMIT',
        'expires_at':expires_at,'last_executable':ask if side=='BUY' else bid,
        'last_tick_msc':int(getattr(tick,'time_msc',0) or 0),
        'sl_points':round(sl_points,2),'tp_points':round(tp_points,2),
        'max_hold_seconds':min(SCALP_QUICK_MAX_HOLD,float(plan.get('maxHoldSeconds',SCALP_QUICK_MAX_HOLD) or SCALP_QUICK_MAX_HOLD)),
        'confidence':confidence,'entry_confidence':confidence,
        'latency_ms':round(float(data.get('_site_latency_ms',0)),1),
        'spread_points':round(spread_points,1)
    }
    s['demo_pending']=pending
    log('SCALP DEMO LIMIT PENDING',side,'price',entry,'expires',round(expires_at-now,1),
        'spread_pts',round(spread_points,1))
    journal_demo('pending',pending,'LIMIT_WAIT',{'dynamicMinConfidence':dynamic_min_conf})
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
    deals=mt5.history_deals_get(start,now)
    if deals is None:
        if LIVE:raise RuntimeError('MT5 deal history unavailable; loss limits cannot be checked')
        return []
    return [d for d in deals if int(getattr(d,'magic',0) or 0)==MAGIC]
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
    if LIVE and int(getattr(account,'login',0) or 0)!=int(EXPECTED_LOGIN or 0):
        return False,'broker login mismatch',0
    if LIVE and (not getattr(account,'trade_allowed',False) or not getattr(account,'trade_expert',False)):
        return False,'MT5 account or Expert Advisor trading disabled',0
    positions=mt5.positions_get()
    if positions is None:return False,'unable to inspect open positions',0
    floating=min(0.0,sum(float(getattr(p,'profit',0) or 0)+float(getattr(p,'swap',0) or 0) for p in positions))
    daily=realized_today()+floating;weekly=realized_week()+floating
    equity=max(1.0,float(account.equity));balance=max(1.0,float(account.balance));
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
    if LIVE and (LIVE_ACK!=LIVE_ACK_REQUIRED or not EXPECTED_LOGIN.isdigit()):
        return False,'live activation acknowledgement/login missing',s
    side_code=str(signal.get('sideCode','')).lower()
    if side_code not in ('buy','sell'):return False,'invalid signal side',s
    if not all(math.isfinite(float(signal.get(k,0))) and float(signal.get(k,0))>0 for k in ('entry','sl','tp')):
        return False,'invalid signal prices',s
    if not getattr(info,'trade_mode',0)==getattr(mt5,'SYMBOL_TRADE_MODE_FULL',4):
        return False,'symbol is not in full trading mode',s
    allowed,risk_status,loss_streak=risk_guard(account,s)
    if not allowed:return False,risk_status,s
    positions=mt5.positions_get(symbol=SYMBOL)
    pending_orders=mt5.orders_get(symbol=SYMBOL)
    if positions is None or pending_orders is None:
        return False,'cannot verify existing positions and pending orders',s
    if len(positions)+len(pending_orders)>=MAX_OPEN:
        return False,'max open positions/pending orders reached',s
    spread_pts=broker_spread(info,tick)
    if spread_pts>MAX_SPREAD_POINTS:return False,f'broker spread too wide: {spread_pts:.1f} points',s
    tick_msc=int(getattr(tick,'time_msc',0) or 0)
    tick_age=int(time.time()*1000)-tick_msc if tick_msc else 10**9
    if tick_age<0 or tick_age>MAX_TICK_AGE_MS:return False,f'stale or future broker tick: {tick_age}ms',s
    buy=signal.get('sideCode')=='buy'
    order_type=mt5.ORDER_TYPE_BUY if buy else mt5.ORDER_TYPE_SELL # risk calculation only
    pending_type=mt5.ORDER_TYPE_BUY_LIMIT if buy else mt5.ORDER_TYPE_SELL_LIMIT
    ref=float(signal['entry']);point=float(info.point or 0)
    entry=ref # exact frozen LIMIT price, never the current Ask or Bid
    source_slippage_pts=abs((float(tick.ask) if buy else float(tick.bid))-ref)/point if point else 10**9
    if source_slippage_pts>MAX_SIGNAL_SLIPPAGE_POINTS:return False,f'pre-trade slippage too large: {source_slippage_pts:.1f} points',s
    sl_dist=abs(ref-float(signal['sl']));tp_dist=abs(float(signal['tp'])-ref)
    if not (sl_dist>0 and tp_dist>0) or tp_dist/sl_dist<2.0:
        return False,'risk/reward below server minimum 2.0',s
    if buy and not (float(signal['sl'])<ref<float(signal['tp'])):
        return False,'BUY stop/target geometry invalid',s
    if not buy and not (float(signal['tp'])<ref<float(signal['sl'])):
        return False,'SELL stop/target geometry invalid',s
    # Broker must accept a non-marketable pending LIMIT at the original
    # authorized level. No fallback order / price chasing is allowed.
    expiration_ms=int(signal.get('_expires_at_ms',0) or 0)
    seconds_left=(expiration_ms-int(time.time()*1000))//1000
    expire_seconds=min(MT5_LIMIT_EXPIRY_SECONDS,seconds_left)
    if expire_seconds<15:return False,'limit signal expires too soon',s
    spread_price=float(tick.ask)-float(tick.bid)
    limit=build_limit_plan(
        side='BUY' if buy else 'SELL',bid=float(tick.bid),ask=float(tick.ask),
        proposed_entry=ref,stop_distance=sl_dist,target_distance=tp_dist,
        point=point,digits=int(info.digits),stops_level_points=int(info.trade_stops_level),
        commission_roundtrip_price=MT5_COMMISSION_ROUNDTRIP_PRICE,
        slippage_buffer_price=max(point,spread_price*.25),
        min_net_r=1.25,expiration_seconds=expire_seconds)
    if limit is None:return False,'pending LIMIT geometry, stop distance, or cost not viable',s
    sl=limit.sl;tp=limit.tp;entry=limit.entry
    news_mode=signal.get('mode')=='news'
    effective_risk=min(RISK_PCT,0.10 if news_mode else 0.15)*(0.5 if loss_streak>=1 else 1.0)
    if effective_risk<=0:return False,'risk budget is disabled',s
    volume=size_for_risk(account,info,order_type,entry,sl,effective_risk)
    if volume is None or volume<float(info.volume_min):return False,'risk size below broker minimum or calc failed',s
    # The future live-capable bridge submits ONLY a pending LIMIT. RETURN is
    # the required pending filling mode; no IOC/FOK market fallback.
    request={'action':mt5.TRADE_ACTION_PENDING,'symbol':SYMBOL,
             'volume':volume,'type':pending_type,'price':entry,'sl':sl,'tp':tp,
             'magic':MAGIC,'comment':'Qannas-LIMIT','type_time':mt5.ORDER_TIME_SPECIFIED,
             'expiration':int(time.time())+expire_seconds,
             'type_filling':mt5.ORDER_FILLING_RETURN}
    t0=time.perf_counter();check=mt5.order_check(request)
    check_ms=(time.perf_counter()-t0)*1000
    if check_ms>MAX_PRECHECK_LATENCY_MS:
        return False,f'order_check latency too high: {check_ms:.0f}ms',s
    if check is None or getattr(check,'retcode',-1) not in (0,getattr(mt5,'TRADE_RETCODE_DONE',10009)):
        return False,'pending limit order_check refused by broker',s
    quality={'at':int(time.time()*1000),'orderType':'BUY_LIMIT' if buy else 'SELL_LIMIT',
             'siteLatencyMs':round(float(signal.get('_site_latency_ms',0)),1),
             'tickAgeMs':tick_age,'spreadPoints':round(spread_pts,1),
             'sourceSlippagePoints':round(source_slippage_pts,1),
             'orderCheckMs':round(check_ms,1),
             'riskPct':round(effective_risk,3),'lossStreak':loss_streak,
             'mode':'news' if news_mode else 'standard',
             'expirationSeconds':expire_seconds}
    if not LIVE:
        s['last_quality']=quality
        return True,f'DRY RUN PENDING LIMIT: {"BUY" if buy else "SELL"} {volume} {SYMBOL} entry={entry} sl={sl} tp={tp} expires={expire_seconds}s | quality={quality}',s
    # Recheck market and pending count before placement; do not reprice.
    fresh_tick=mt5.symbol_info_tick(SYMBOL)
    if fresh_tick is None:return False,'quote vanished before order_send',s
    latest_age=int(time.time()*1000)-int(getattr(fresh_tick,'time_msc',0) or 0)
    fresh_spread=broker_spread(info,fresh_tick)
    if latest_age<0 or latest_age>MAX_TICK_AGE_MS or fresh_spread>MAX_SPREAD_POINTS:
        return False,'quote/spread deteriorated after order_check',s
    latest_orders=mt5.orders_get(symbol=SYMBOL)
    latest_positions=mt5.positions_get(symbol=SYMBOL)
    if latest_orders is None or latest_positions is None:
        return False,'unable to recheck pending/positions before order',s
    if len(latest_orders)+len(latest_positions)>=MAX_OPEN:
        return False,'position or pending order appeared before placement',s
    if (buy and entry>float(fresh_tick.bid)-max(point,int(info.trade_stops_level)*point)) or (
        not buy and entry<float(fresh_tick.ask)+max(point,int(info.trade_stops_level)*point)):
        return False,'limit no longer pending-side; do not convert to market',s
    if expiration_ms-int(time.time()*1000)<5000:
        return False,'pending limit expired before order_send',s
    t1=time.perf_counter();result=mt5.order_send(request)
    quality['orderSendMs']=round((time.perf_counter()-t1)*1000,1)
    if result and result.retcode==getattr(mt5,'TRADE_RETCODE_PLACED',10008):
        quality['orderTicket']=getattr(result,'order',None)
        s['last_quality']=quality
        return True,f'LIMIT PENDING placed ticket={result.order} at {entry}; not a filled trade',s
    return False,f'pending LIMIT rejected retcode={getattr(result,"retcode",None)}',s

def reconcile_pending_orders(data,s):
    """Cancel only this bridge's own still-pending LIMITs when approval is lost.

    Never touch another EA's orders. Broker-side expiry is still a backup;
    a canceled signal / kill switch should not wait for that expiry.
    """
    if not LIVE:return
    account=mt5.account_info()
    if account is None or int(getattr(account,'login',0) or 0)!=int(EXPECTED_LOGIN or 0):
        raise RuntimeError('cannot reconcile pending limits: pinned broker account unavailable')
    orders=mt5.orders_get(symbol=SYMBOL)
    if orders is None:raise RuntimeError('cannot inspect broker pending orders')
    owned=[order for order in orders
           if int(getattr(order,'magic',0) or 0)==MAGIC
           and int(getattr(order,'type',-1)) in (mt5.ORDER_TYPE_BUY_LIMIT,mt5.ORDER_TYPE_SELL_LIMIT)]
    if not owned:return
    info=symbol_ready()
    tick=mt5.symbol_info_tick(SYMBOL) if info else None
    tick_msc=int(getattr(tick,'time_msc',0) or 0) if tick else 0
    age_ms=int(time.time()*1000)-tick_msc if tick_msc else None
    spread_pts=broker_spread(info,tick) if info and tick else None
    reason=pending_cancel_reason(
        response=data,last_signal_id=s.get('last_signal',''),
        local_kill=KILL_SWITCH.exists(),broker_symbol=SYMBOL,
        tick_age_ms=age_ms,spread_points=spread_pts,
        max_tick_age_ms=MAX_TICK_AGE_MS,max_spread_points=MAX_SPREAD_POINTS,
        now_ms=int(time.time()*1000))
    if reason is None:return
    for order in owned:
        # REMOVE only, never a market close or a replacement entry.
        request={'action':mt5.TRADE_ACTION_REMOVE,'order':int(order.ticket),
                 'symbol':SYMBOL,'magic':MAGIC}
        result=mt5.order_send(request)
        if result is None or int(getattr(result,'retcode',-1))!=int(getattr(mt5,'TRADE_RETCODE_DONE',10009)):
            raise RuntimeError(f'pending LIMIT cancellation failed: ticket={order.ticket} reason={reason} retcode={getattr(result,"retcode",None)}')
        log('PENDING LIMIT CANCELED',int(order.ticket),'reason',reason)


def main():
    if not SITE_URL.startswith('https://') or not TOKEN:sys.exit('Set SITE_URL=https://... and MT5_BRIDGE_TOKEN in .env')
    if LIVE and (LIVE_ACK!=LIVE_ACK_REQUIRED or not EXPECTED_LOGIN.isdigit()):
        sys.exit('LIVE mode requires MT5_LIVE_ACK and MT5_EXPECTED_LOGIN on broker and site')
    if LIVE and RISK_PCT<=0:sys.exit('LIVE risk budget is zero')
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
            reconcile_pending_orders(data,s)
            if not data.get('allowed') or not data.get('signal'):time.sleep(POLL);continue
            now_ms=int(time.time()*1000)
            issued_at=int(data.get('issuedAt',0) or 0);expires_at=int(data.get('expiresAt',0) or 0)
            if issued_at<=0 or now_ms-issued_at<-2000 or now_ms-issued_at>45000 or now_ms>expires_at or expires_at-issued_at>45000:
                log('expired/stale/future site signal rejected');time.sleep(POLL);continue
            sig=dict(data['signal']);sig['_site_latency_ms']=data.get('_site_latency_ms',0);sig['_expires_at_ms']=expires_at;sid=str(sig.get('id',''));s=state_read();now=time.time()
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
            if LIVE:
                try:reconcile_pending_orders(None,s)
                except Exception as cancel_error:
                    log('CRITICAL: cannot revoke pending LIMIT while disconnected',repr(cancel_error))
            close_market_book()
            try:mt5.shutdown()
            except:pass
            time.sleep(min(60,2**min(failures,5)))
    close_market_book()
    mt5.shutdown()
if __name__=='__main__':main()
