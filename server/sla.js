// Business calendar: Monday-Friday, 09:30-18:30 Asia/Kolkata; excludes configured holidays.
const IST_OFFSET=330*60*1000;const OPEN=9*60+30,CLOSE=18*60+30,DAY=CLOSE-OPEN;
const holidays=()=>new Set((process.env.HOLIDAYS||'').split(',').map(s=>s.trim()).filter(Boolean));
function local(utc){return new Date(utc.getTime()+IST_OFFSET);}
function dayKey(localDate){return localDate.toISOString().slice(0,10);}
function workday(d){const day=d.getUTCDay();return day!==0&&day!==6&&!holidays().has(dayKey(d));}
function minute(d){return d.getUTCHours()*60+d.getUTCMinutes();}
function atMinute(day,minutes){return new Date(Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate(),Math.floor(minutes/60),minutes%60)-IST_OFFSET);}
export function nextBusinessTime(input){const d=local(new Date(input));d.setUTCSeconds(0,0);for(let i=0;i<370;i++){if(workday(d)){const m=minute(d);if(m<OPEN)return atMinute(d,OPEN);if(m<CLOSE)return new Date(input)>atMinute(d,m)?new Date(input):atMinute(d,m);}d.setUTCDate(d.getUTCDate()+1);d.setUTCHours(0,0,0,0);}throw new Error('No business day found');}
export function addBusinessMinutes(input,minutes){if(minutes<0)throw new Error('minutes must be >= 0');let now=nextBusinessTime(input),left=minutes;while(left>0){const d=local(now),end=atMinute(d,CLOSE),available=(end-now)/60000;if(left<=available)return new Date(now.getTime()+left*60000);left-=available;now=nextBusinessTime(new Date(end.getTime()+1000));}return now;}
export function businessMinutesBetween(start,end){let cur=nextBusinessTime(start),total=0;const stop=new Date(end);while(cur<stop){const d=local(cur),endDay=atMinute(d,CLOSE),next=stop<endDay?stop:endDay;total+=(next-cur)/60000;cur=nextBusinessTime(new Date(endDay.getTime()+1000));}return Math.max(0,total);}
export const budgets={high:{response:120,resolution:540},medium:{response:270,resolution:1620},low:{response:540,resolution:2700}};
export function deadlines(priority,from=new Date()){const b=budgets[priority];if(!b)throw new Error('Invalid priority');return {first_response_due:addBusinessMinutes(from,b.response),resolution_due:addBusinessMinutes(from,b.resolution)};}
export const fiveBusinessDays=2700;
