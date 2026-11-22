import {query,transaction} from './db.js';
import {businessMinutesBetween,fiveBusinessDays} from './sla.js';

/**
 * Close tickets after five full working days waiting for the customer.
 * The conditional update makes multiple running workers safe.
 */
export async function closeExpiredWaitingTickets(now=new Date()){
  const {rows}=await query("SELECT id,waiting_since FROM tickets WHERE status='waiting' AND waiting_since IS NOT NULL");
  let count=0;
  for(const ticket of rows){
    if(businessMinutesBetween(ticket.waiting_since,now) < fiveBusinessDays)continue;
    const closed=await transaction(async db=>{
      const {rows:updated}=await db.query(
        "UPDATE tickets SET status='closed',closed_at=$2,updated_at=$2,waiting_since=null,remaining_resolution_ms=null WHERE id=$1 AND status='waiting' AND waiting_since IS NOT NULL AND waiting_since<=$2 RETURNING id",
        [ticket.id,now]
      );
      if(!updated.length)return false;
      await db.query('INSERT INTO ticket_events(ticket_id,actor_type,actor_id,event_type,metadata) VALUES($1,$2,$3,$4,$5)',[ticket.id,'system',null,'auto_closed',JSON.stringify({reason:'five_working_days_without_customer_reply'})]);
      return true;
    });
    if(closed)count++;
  }
  return count;
}
export function scheduleAutomaticClosure(){
  const run=()=>closeExpiredWaitingTickets().catch(error=>console.error('Automatic closure check failed',error));
  void run();
  const timer=setInterval(run,15*60*1000);
  timer.unref?.();
}
