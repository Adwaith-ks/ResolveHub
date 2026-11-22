import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {query,transaction,initialize} from './db.js';
import {seedDemoData,seedDemoStaff} from './demo.js';
import {issueCustomerJwt, verifyCustomerJwt, issueStaffJwt, verifyStaffJwt} from './customer-jwt.js';
import {scheduleAutomaticClosure} from './closure.js';
import {newToken,digest,requireSecret} from './security.js';
import {createRateLimiter} from './rate-limit.js';
import {deadlines,addBusinessMinutes,businessMinutesBetween,fiveBusinessDays,budgets} from './sla.js';
const app=express();app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:'32kb'}));app.use(cookieParser());
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fail=(status,message)=>Object.assign(new Error(message),{status});
const parse=(schema,obj)=>{const out=schema.safeParse(obj);if(!out.success)throw fail(400,out.error.issues.map(x=>x.message).join('; '));return out.data;};
const id=z.coerce.number().int().positive();
const txt=z.string().trim().min(1).max(10000);
const ticketInput=z.object({subject:z.string().trim().min(3).max(160),description:txt,customer_name:z.string().trim().min(1).max(120),customer_email:z.string().email().max(250),priority:z.enum(['low','medium','high']).default('medium')});
const cookie={httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/'};
const SESSION_MS=7*24*3600*1000;
const loginLimit=createRateLimiter({limit:10,windowMs:15*60*1000});
const publicCreateLimit=createRateLimiter({limit:15,windowMs:60*60*1000});
const publicActionLimit=createRateLimiter({limit:100,windowMs:60*60*1000});
const registerLimit=createRateLimiter({limit:5,windowMs:60*60*1000});
const customerCookie={...cookie,maxAge:SESSION_MS};
const customerSignIn=async(res,customer)=>{const {token,jti}=issueCustomerJwt(customer.id,SESSION_MS);await query('INSERT INTO customer_sessions(token_hash,customer_id,expires_at) VALUES($1,$2,$3)',[digest(jti),customer.id,new Date(Date.now()+SESSION_MS)]);res.cookie('rh_customer',token,customerCookie);return {id:customer.id,name:customer.name,email:customer.email,role:'customer'};};
async function customer(req,res,next){try{const claims=verifyCustomerJwt(req.cookies.rh_customer);if(!claims)throw fail(401,'Customer sign in required');const {rows}=await query('SELECT c.id,c.name,c.email FROM customers c JOIN customer_sessions s ON s.customer_id=c.id WHERE c.id=$1 AND s.token_hash=$2 AND s.expires_at>now()',[claims.sub,digest(claims.jti)]);if(!rows.length)throw fail(401,'Session expired');req.customer=rows[0];next();}catch(error){next(error);}}
const customerRegistration=z.object({name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(250),password:z.string().min(12).max(128)});

async function agent(req,res,next){try{const token=req.cookies.rh_session;if(!token)throw fail(401,'Sign in required');const claims=verifyStaffJwt(token);const hash=claims?digest(claims.jti):digest(token);const {rows}=await query('SELECT a.id,a.name,a.email,a.role FROM sessions s JOIN agents a ON a.id=s.agent_id WHERE s.token_hash=$1 AND s.expires_at>now()',[hash]);if(!rows.length)throw fail(401,'Session expired');req.agent=rows[0];next();}catch(e){next(e);}}
async function customerTicket(req,lock=false,db={query}){const ticketId=parse(id,req.params.id);const bearer=req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];if(!bearer)throw fail(401,'Ticket access token required');const {rows}=await db.query("SELECT * FROM tickets WHERE id=$1 AND customer_token_hash=$2 "+(lock?'FOR UPDATE':''),[ticketId,digest(bearer)]);if(!rows.length)throw fail(404,'Ticket not found');return rows[0];}
const event=async(db,ticket,actor,actorId,type,meta={})=>db.query('INSERT INTO ticket_events(ticket_id,actor_type,actor_id,event_type,metadata) VALUES($1,$2,$3,$4,$5)',[ticket,actor,actorId,type,JSON.stringify(meta)]);
async function details(ticketId,includeInternal=false){const [ticket,msg,events]=await Promise.all([query('SELECT t.*,a.name AS assignee_name FROM tickets t LEFT JOIN agents a ON a.id=t.assignee_id WHERE t.id=$1',[ticketId]),query('SELECT id,ticket_id,actor_type,actor_id,body,is_internal,created_at FROM messages WHERE ticket_id=$1 '+(includeInternal?'':'AND is_internal=false')+' ORDER BY created_at,id',[ticketId]),includeInternal?query('SELECT * FROM ticket_events WHERE ticket_id=$1 ORDER BY created_at,id',[ticketId]):Promise.resolve({rows:[]})]);if(!ticket.rows.length)throw fail(404,'Ticket not found');const t=ticket.rows[0];delete t.customer_token_hash;if(!includeInternal)delete t.remaining_resolution_ms;return {ticket:t,messages:msg.rows,events:events.rows};}
app.get('/api/health',(_req,res)=>res.json({status:'ok'}));
app.get('/api/demo/config',(_req,res)=>res.json({enabled:process.env.DEMO_MODE==='true' && !!process.env.DEMO_AGENT_PASSWORD}));
app.post('/api/auth/register',registerLimit,asyncRoute(async(req,res)=>{const input=parse(customerRegistration,req.body);const email=input.email.toLowerCase();const existing=await query('SELECT 1 FROM agents WHERE email=$1 UNION ALL SELECT 1 FROM customers WHERE email=$1 LIMIT 1',[email]);if(existing.rows.length)throw fail(409,'Account already exists');const hash=await bcrypt.hash(input.password,12);let result;try{result=await query('INSERT INTO customers(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email',[input.name,email,hash]);}catch(err){if(err.code==='23505')throw fail(409,'Account already exists');throw err;}const user=await customerSignIn(res,result.rows[0]);res.status(201).json({user});}));
app.post('/api/auth/login',loginLimit,asyncRoute(async(req,res)=>{const {email,password}=parse(z.object({email:z.string().email(),password:z.string().min(1)}),req.body);const {rows}=await query('SELECT * FROM agents WHERE email=$1',[email.toLowerCase()]);const valid=rows.length&&await bcrypt.compare(password,rows[0].password_hash);if(!valid){const found=await query('SELECT id,name,email,password_hash FROM customers WHERE email=$1',[email.toLowerCase()]);if(!found.rows.length||!await bcrypt.compare(password,found.rows[0].password_hash))throw fail(401,'Invalid credentials');const user=await customerSignIn(res,found.rows[0]);return res.json({user});}const {token,jti}=issueStaffJwt(rows[0].id,rows[0].role,SESSION_MS);await query('INSERT INTO sessions(token_hash,agent_id,expires_at) VALUES($1,$2,$3)',[digest(jti),rows[0].id,new Date(Date.now()+SESSION_MS)]);res.cookie('rh_session',token,{...cookie,maxAge:SESSION_MS});res.json({agent:{id:rows[0].id,email:rows[0].email,name:rows[0].name,role:rows[0].role},user:{id:rows[0].id,email:rows[0].email,name:rows[0].name,role:rows[0].role}});}));
app.post('/api/auth/logout',asyncRoute(async(req,res)=>{if(req.cookies.rh_session){const claims=verifyStaffJwt(req.cookies.rh_session);await query('DELETE FROM sessions WHERE token_hash=$1',[digest(claims?claims.jti:req.cookies.rh_session)]);}const claims=verifyCustomerJwt(req.cookies.rh_customer);if(claims)await query('DELETE FROM customer_sessions WHERE token_hash=$1',[digest(claims.jti)]);res.clearCookie('rh_session',cookie);res.clearCookie('rh_customer',cookie);res.json({ok:true});}));
app.get('/api/auth/me',(req,res,next)=>{if(req.cookies.rh_session)return agent(req,res,()=>res.json({agent:req.agent,user:req.agent}));return customer(req,res,()=>res.json({user:{...req.customer,role:'customer'}}));});

/* Authenticated customer operations: ownership is always checked in SQL. */
app.get('/api/customer/tickets',customer,asyncRoute(async(req,res)=>{
 const {rows}=await query("SELECT id,subject,category,priority,status,created_at,updated_at,first_response_due,resolution_due,resolved_at,closed_at,assignee_id FROM tickets WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 250",[req.customer.id]);
 res.json({tickets:rows});
}));
app.post('/api/customer/tickets',customer,publicCreateLimit,asyncRoute(async(req,res)=>{
 const input=parse(z.object({subject:z.string().trim().min(3).max(160),description:txt,category:z.enum(['general','billing','technical','account','feature']).default('general'),priority:z.enum(['high','medium','low']).default('medium')}),req.body);
 const d=deadlines(input.priority),token=newToken();
 const {rows}=await transaction(async db=>{
  const out=await db.query('INSERT INTO tickets(subject,description,category,customer_name,customer_email,customer_id,customer_token_hash,priority,first_response_due,resolution_due) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[input.subject,input.description,input.category,req.customer.name,req.customer.email,req.customer.id,digest(token),input.priority,d.first_response_due,d.resolution_due]);
  await event(db,out.rows[0].id,'customer',req.customer.id,'created');
  return out;
 });
 res.status(201).json({id:rows[0].id});
}));
async function ownedTicket(req,db=query){const ticketId=parse(id,req.params.id);const {rows}=await (typeof db==='function'?db:db.query.bind(db))('SELECT * FROM tickets WHERE id=$1 AND customer_id=$2',[ticketId,req.customer.id]);if(!rows.length)throw fail(404,'Ticket not found');return rows[0];}
app.get('/api/customer/tickets/:id',customer,asyncRoute(async(req,res)=>{const t=await ownedTicket(req);res.json(await details(t.id,false));}));
app.post('/api/customer/tickets/:id/reply',customer,publicActionLimit,asyncRoute(async(req,res)=>{
 const {body}=parse(z.object({body:txt}),req.body);
 await transaction(async db=>{
  const t=await ownedTicket(req,db);
  const {rows}=await db.query('SELECT * FROM tickets WHERE id=$1 FOR UPDATE',[t.id]);const locked=rows[0];
  if(['closed','resolved'].includes(locked.status))throw fail(409,'Ticket is not active');
  await db.query('INSERT INTO messages(ticket_id,actor_type,actor_id,body) VALUES($1,$2,$3,$4)',[t.id,'customer',req.customer.id,body]);
  if(locked.status==='waiting'){const due=addBusinessMinutes(new Date(),Math.ceil(Number(locked.remaining_resolution_ms||0)/60000));await db.query("UPDATE tickets SET status='in_progress',waiting_since=null,remaining_resolution_ms=null,resolution_due=$2,updated_at=now() WHERE id=$1",[t.id,due]);}
  await event(db,t.id,'customer',req.customer.id,'public_reply');
 });
 res.status(201).json({ok:true});
}));
app.post('/api/customer/tickets/:id/reopen',customer,publicActionLimit,asyncRoute(async(req,res)=>{
 await transaction(async db=>{
  const t=await ownedTicket(req,db);
  const {rows}=await db.query('SELECT * FROM tickets WHERE id=$1 FOR UPDATE',[t.id]);const locked=rows[0];
  if(locked.status!=='resolved'||!locked.resolved_at)throw fail(409,'Only resolved tickets can be reopened');
  if(businessMinutesBetween(locked.resolved_at,new Date())>fiveBusinessDays)throw fail(409,'Reopen window expired');
  const d=deadlines(locked.priority);
  await db.query("UPDATE tickets SET status='in_progress',resolved_at=null,resolution_due=$2,updated_at=now() WHERE id=$1",[t.id,d.resolution_due]);
  await event(db,t.id,'customer',req.customer.id,'reopened');
 });
 res.json({ok:true});
}));

app.get('/api/admin/agents',agent,asyncRoute(async(req,res)=>{
 if(req.agent.role!=='admin')throw fail(403,'Administrator access required');
 const {rows}=await query("SELECT a.id,a.name,a.email,a.role,COUNT(t.id)::integer AS ticket_count FROM agents a LEFT JOIN tickets t ON t.assignee_id=a.id GROUP BY a.id,a.name,a.email,a.role ORDER BY a.role DESC,a.name");
 res.json({agents:rows});
}));
app.get('/api/tickets',agent,asyncRoute(async(req,res)=>{const status=req.query.status,search=String(req.query.search||'').trim().slice(0,100);if(status&&!['open','in_progress','waiting','resolved','closed','all'].includes(status))throw fail(400,'Invalid status');const {rows}=await query("SELECT t.id,t.subject,t.customer_name,t.customer_email,t.priority,t.status,t.assignee_id,a.name AS assignee_name,t.first_response_due,t.resolution_due,t.created_at,t.updated_at FROM tickets t LEFT JOIN agents a ON a.id=t.assignee_id WHERE ($1::text IS NULL OR t.status=$1) AND ($2::text='' OR t.subject ILIKE '%'||$2||'%' OR t.customer_email ILIKE '%'||$2||'%') ORDER BY CASE WHEN t.status IN ('open','in_progress') THEN 0 ELSE 1 END,t.created_at DESC LIMIT 250",[!status||status==='all'?null:status,search]);res.json({tickets:rows});}));
app.get('/api/tickets/:id',agent,asyncRoute(async(req,res)=>res.json(await details(parse(id,req.params.id),true))));
async function createTicket(req,res,actor){const input=parse(ticketInput,req.body);const token=newToken(),d=deadlines(input.priority);const {rows}=await transaction(async db=>{const out=await db.query('INSERT INTO tickets(subject,description,customer_name,customer_email,customer_token_hash,priority,first_response_due,resolution_due) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[input.subject,input.description,input.customer_name,input.customer_email.toLowerCase(),digest(token),input.priority,d.first_response_due,d.resolution_due]);await event(db,out.rows[0].id,actor,req.agent?.id||null,'created');return out;});res.status(201).json({id:rows[0].id,customer_token:token});}
app.post('/api/tickets',agent,asyncRoute((req,res)=>createTicket(req,res,'agent')));
app.post('/api/public/tickets',publicCreateLimit,asyncRoute((req,res)=>createTicket(req,res,'customer')));
app.get('/api/public/tickets/:id',publicActionLimit,asyncRoute(async(req,res)=>{const t=await customerTicket(req);res.json(await details(t.id,false));}));
app.post('/api/tickets/:id/claim',agent,asyncRoute(async(req,res)=>{const ticketId=parse(id,req.params.id);const {rows}=await transaction(async db=>{const out=await db.query("UPDATE tickets SET assignee_id=$1,status='in_progress',updated_at=now() WHERE id=$2 AND assignee_id IS NULL AND status='open' RETURNING id",[req.agent.id,ticketId]);if(out.rows.length)await event(db,ticketId,'agent',req.agent.id,'claimed');return out;});if(!rows.length)throw fail(409,'Ticket already claimed or unavailable');res.json({ok:true});}));
app.patch('/api/tickets/:id',agent,asyncRoute(async(req,res)=>{const ticketId=parse(id,req.params.id);const change=parse(z.object({status:z.enum(['in_progress','waiting','resolved','closed']).optional(),priority:z.enum(['low','medium','high']).optional()}).refine(v=>v.status||v.priority,{message:'No change specified'}),req.body);await transaction(async db=>{const {rows}=await db.query('SELECT * FROM tickets WHERE id=$1 FOR UPDATE',[ticketId]);if(!rows.length)throw fail(404,'Ticket not found');const t=rows[0];if(String(t.assignee_id)!==String(req.agent.id))throw fail(403,'Only the assigned agent can change this ticket');if(t.status==='closed'||t.status==='resolved')throw fail(409,'Reopen before making changes');let nextStatus=change.status||t.status;if(change.status&&!({open:['in_progress','waiting','resolved'],in_progress:['waiting','resolved'],waiting:['in_progress','resolved']}[t.status]||[]).includes(change.status))throw fail(409,'Invalid status transition');const nextPriority=change.priority||t.priority;let due=t.resolution_due,remaining=t.remaining_resolution_ms,waiting=t.waiting_since,resolved=t.resolved_at,closed=t.closed_at;
if(change.priority){if(t.status==='waiting'){due=null;remaining=budgets[change.priority].resolution*60000;}else{due=deadlines(change.priority).resolution_due;remaining=null;}}
if(nextStatus==='waiting'&&t.status!=='waiting'){remaining=Math.max(0,businessMinutesBetween(new Date(),due))*60000;waiting=new Date();due=null;}
if(t.status==='waiting'&&nextStatus==='in_progress'){due=addBusinessMinutes(new Date(),Math.ceil(Number(remaining||0)/60000));remaining=null;waiting=null;}
if(nextStatus==='resolved'){resolved=new Date();waiting=null;remaining=null;}
if(nextStatus==='closed'){closed=new Date();waiting=null;remaining=null;}
await db.query('UPDATE tickets SET status=$1,priority=$2,resolution_due=$3,remaining_resolution_ms=$4,waiting_since=$5,resolved_at=$6,closed_at=$7,updated_at=now() WHERE id=$8',[nextStatus,nextPriority,due,remaining,waiting,resolved,closed,ticketId]);await event(db,ticketId,'agent',req.agent.id,'updated',{status:{from:t.status,to:nextStatus},priority:{from:t.priority,to:nextPriority}});});res.json({ok:true});}));
app.post('/api/tickets/:id/messages',agent,asyncRoute(async(req,res)=>{const ticketId=parse(id,req.params.id),{body,is_internal}=parse(z.object({body:txt,is_internal:z.boolean().default(false)}),req.body);await transaction(async db=>{const {rows}=await db.query('SELECT * FROM tickets WHERE id=$1 FOR UPDATE',[ticketId]);if(!rows.length)throw fail(404,'Ticket not found');const t=rows[0];if(String(t.assignee_id)!==String(req.agent.id))throw fail(403,'Only the assignee can respond');if(['closed','resolved'].includes(t.status))throw fail(409,'Ticket is not active');await db.query('INSERT INTO messages(ticket_id,actor_type,actor_id,body,is_internal) VALUES($1,$2,$3,$4,$5)',[ticketId,'agent',req.agent.id,body,is_internal]);if(!is_internal&&!t.first_response_at)await db.query('UPDATE tickets SET first_response_at=now(),updated_at=now() WHERE id=$1',[ticketId]);await event(db,ticketId,'agent',req.agent.id,is_internal?'internal_note':'public_reply');});res.status(201).json({ok:true});}));
app.post('/api/public/tickets/:id/reply',publicActionLimit,asyncRoute(async(req,res)=>{const {body}=parse(z.object({body:txt}),req.body);await transaction(async db=>{const t=await customerTicket(req,true,db);if(['closed','resolved'].includes(t.status))throw fail(409,'Ticket is not active');await db.query('INSERT INTO messages(ticket_id,actor_type,body) VALUES($1,$2,$3)',[t.id,'customer',body]);if(t.status==='waiting'){const due=addBusinessMinutes(new Date(),Math.ceil(Number(t.remaining_resolution_ms||0)/60000));await db.query("UPDATE tickets SET status='in_progress',waiting_since=null,remaining_resolution_ms=null,resolution_due=$2,updated_at=now() WHERE id=$1",[t.id,due]);}await event(db,t.id,'customer',null,'public_reply');});res.status(201).json({ok:true});}));
app.post('/api/public/tickets/:id/reopen',publicActionLimit,asyncRoute(async(req,res)=>{await transaction(async db=>{const t=await customerTicket(req,true,db);if(t.status!=='resolved'||!t.resolved_at)throw fail(409,'Only recently resolved tickets can be reopened');if(businessMinutesBetween(t.resolved_at,new Date())>fiveBusinessDays)throw fail(409,'Reopen window expired');const d=deadlines(t.priority);await db.query("UPDATE tickets SET status='in_progress',resolved_at=null,closed_at=null,resolution_due=$2,updated_at=now() WHERE id=$1",[t.id,d.resolution_due]);await event(db,t.id,'customer',null,'reopened');});res.json({ok:true});}));
app.use('/api',(_req,res)=>res.status(404).json({error:'Not found'}));
const __dirname=dirname(fileURLToPath(import.meta.url));app.use(express.static(join(__dirname,'../dist')));app.get('*',(_req,res)=>res.sendFile(join(__dirname,'../dist/index.html')));
app.use((err,_req,res,_next)=>{if(!err.status)console.error(err);res.status(err.status||500).json({error:err.status?err.message:'Internal server error'});});
requireSecret();await initialize();await seedDemoStaff();await seedDemoData();app.listen(process.env.PORT||3001,()=>{console.log('ResolveHub API started');scheduleAutomaticClosure();});
