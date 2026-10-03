import {getRuntimeEnv} from './runtime';
export type TelegramAlertLevel='watch'|'entry'|'warning'|'cancel'|'system';
export type TelegramAlert={level:TelegramAlertLevel;title:string;body:string;key:string;force?:boolean};
type MonitorState={lastSignal:string|null;lastMt5Fresh:boolean|null};
type TGGlobal=typeof globalThis & {__goldTgSent?:Map<string,number>;__goldTgState?:MonitorState};
const g=()=>globalThis as TGGlobal;
const sent=()=>g().__goldTgSent??(g().__goldTgSent=new Map<string,number>());
const monitor=()=>g().__goldTgState??(g().__goldTgState={lastSignal:null,lastMt5Fresh:null});
const DEFAULT_TELEGRAM_CHAT_ID='5785693664';
const flag=(v:unknown,def=true)=>v==null?def:String(v).toLowerCase()!=='false';
const cooldownMs=(level:TelegramAlertLevel)=>level==='watch'?180000:level==='warning'?90000:level==='system'?60000:45000;
export function telegramStatus(){const r=getRuntimeEnv(),token=String(r.TELEGRAM_BOT_TOKEN||'').trim(),chatId=String(r.TELEGRAM_CHAT_ID||DEFAULT_TELEGRAM_CHAT_ID).trim(),enabled=flag(r.TELEGRAM_ALERTS_ENABLED,true);return{configured:Boolean(token&&chatId),enabled,watch:flag(r.TELEGRAM_SEND_WATCH,true),entry:flag(r.TELEGRAM_SEND_ENTRY,true),warning:flag(r.TELEGRAM_SEND_WARNING,true),cancel:flag(r.TELEGRAM_SEND_CANCEL,true),threadConfigured:Boolean(String(r.TELEGRAM_THREAD_ID||'').trim()),durableDedupe:false};}
function levelEnabled(level:TelegramAlertLevel){const s=telegramStatus();if(!s.configured||!s.enabled)return false;if(level==='watch')return s.watch;if(level==='entry')return s.entry;if(level==='warning')return s.warning;if(level==='cancel')return s.cancel;return true;}
export async function sendTelegramText(text:string,opts:{silent?:boolean}={}){const r=getRuntimeEnv(),token=String(r.TELEGRAM_BOT_TOKEN||'').trim(),chatId=String(r.TELEGRAM_CHAT_ID||DEFAULT_TELEGRAM_CHAT_ID).trim();if(!token||!chatId||!flag(r.TELEGRAM_ALERTS_ENABLED,true))return{ok:false,skipped:true,reason:'not_configured'} as const;const body:any={chat_id:chatId,text:String(text).slice(0,4090),disable_web_page_preview:true,disable_notification:Boolean(opts.silent)};const thread=Number(r.TELEGRAM_THREAD_ID);if(Number.isInteger(thread)&&thread>0)body.message_thread_id=thread;const res=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});const j:any=await res.json().catch(()=>({}));if(!res.ok||j?.ok!==true)throw new Error(String(j?.description||`Telegram HTTP ${res.status}`));return{ok:true,messageId:j?.result?.message_id??null} as const;}
export async function sendTelegramAlert(alert:TelegramAlert){if(!levelEnabled(alert.level))return{ok:false,skipped:true,reason:'disabled'} as const;const now=Date.now(),dedupe=`${alert.level}:${alert.key}`,cooldown=cooldownMs(alert.level),map=sent(),last=map.get(dedupe)||0;if(!alert.force&&now-last<cooldown)return{ok:false,skipped:true,reason:'cooldown'} as const;const icon=alert.level==='entry'?'🟢':alert.level==='watch'?'🟡':alert.level==='cancel'?'🔴':'⚠️',label=alert.level==='entry'?'دخول':alert.level==='watch'?'مراقبة':alert.level==='cancel'?'إلغاء':alert.level==='warning'?'تحذير':'نظام',text=`${icon} مرصد الذهب — ${label}
${alert.title}
${alert.body}

${new Date(now).toLocaleString('ar-AE',{timeZone:'Asia/Dubai'})}`;const result=await sendTelegramText(text,{silent:alert.level==='watch'});if(result.ok)map.set(dedupe,now);return result;}
export async function getTelegramMonitorState(){return monitor();}
export async function setTelegramMonitorState(next:Partial<MonitorState>){g().__goldTgState={...monitor(),...next};return monitor();}
