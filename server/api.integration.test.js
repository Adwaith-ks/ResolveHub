import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {randomBytes} from 'node:crypto';

const database=process.env.TEST_DATABASE_URL;
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}

test('database-backed agent and customer ticket lifecycle',{skip:!database,timeout:45000},async t=>{
 const port=await freePort();
 const seedEmail='ci-agent@example.test',seedPassword='ci-test-password-12345';
 const child=spawn(process.execPath,['server/index.js'],{
  cwd:process.cwd(),env:{...process.env,DATABASE_URL:database,PORT:String(port),SESSION_SECRET:randomBytes(32).toString('hex'),SEED_AGENT_EMAIL:seedEmail,SEED_AGENT_PASSWORD:seedPassword,NODE_ENV:'test'},
  stdio:['ignore','pipe','pipe']
 });
 let logs='';child.stdout.on('data',d=>logs+=d.toString());child.stderr.on('data',d=>logs+=d.toString());
 t.after(async()=>{if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);if(child.exitCode===null)child.kill('SIGKILL');}});
 const base='http://127.0.0.1:'+port;
 let ready=false;
 for(let i=0;i<100;i++){if(child.exitCode!==null)break;try{const res=await fetch(base+'/api/health');if(res.ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 assert.equal(ready,true,'Server could not start: '+logs);
 async function request(path,{method='GET',body,token,cookie}={}){
  const headers={};if(body!==undefined)headers['Content-Type']='application/json';
  if(token)headers.Authorization='Bearer '+token;if(cookie)headers.Cookie=cookie;
  const res=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')};
 }
 const unauth=await request('/api/tickets');assert.equal(unauth.status,401);
 const badLogin=await request('/api/auth/login',{method:'POST',body:{email:seedEmail,password:'wrong'}});assert.equal(badLogin.status,401);
 const login=await request('/api/auth/login',{method:'POST',body:{email:seedEmail,password:seedPassword}});
 assert.equal(login.status,200);assert.ok(login.cookie?.includes('rh_session='));
 const cookie=login.cookie.split(';')[0];
 const customerEmail='example-'+randomBytes(5).toString('hex')+'@example.test';
 const created=await request('/api/public/tickets',{method:'POST',body:{subject:'Printer access issue',description:'Can no longer print documents.',customer_name:'Test Customer',customer_email:customerEmail,priority:'high'}});
 assert.equal(created.status,201);assert.ok(created.data.customer_token);
 const ticketId=created.data.id,token=created.data.customer_token;
 const wrong=await request('/api/public/tickets/'+ticketId,{token:'bad-token'});assert.equal(wrong.status,404);
 const retrieved=await request('/api/public/tickets/'+ticketId,{token});assert.equal(retrieved.status,200);
 const claim=await request('/api/tickets/'+ticketId+'/claim',{method:'POST',cookie});assert.equal(claim.status,200);
 const again=await request('/api/tickets/'+ticketId+'/claim',{method:'POST',cookie});assert.equal(again.status,409);
 const note=await request('/api/tickets/'+ticketId+'/messages',{method:'POST',cookie,body:{body:'Private troubleshooting steps',is_internal:true}});assert.equal(note.status,201);
 const reply=await request('/api/tickets/'+ticketId+'/messages',{method:'POST',cookie,body:{body:'We are looking into it.',is_internal:false}});assert.equal(reply.status,201);
 const customerView=await request('/api/public/tickets/'+ticketId,{token});
 assert.equal(customerView.data.messages.length,1);assert.equal(customerView.data.messages[0].body,'We are looking into it.');
 assert.equal('customer_token_hash' in customerView.data.ticket,false);
 const wait=await request('/api/tickets/'+ticketId,{method:'PATCH',cookie,body:{status:'waiting'}});assert.equal(wait.status,200);
 const customerReply=await request('/api/public/tickets/'+ticketId+'/reply',{method:'POST',token,body:{body:'I have tried again.'}});assert.equal(customerReply.status,201);
 const resumed=await request('/api/tickets/'+ticketId,{cookie});assert.equal(resumed.data.ticket.status,'in_progress');
 assert.equal(resumed.data.messages.length,3);
 const resolved=await request('/api/tickets/'+ticketId,{method:'PATCH',cookie,body:{status:'resolved'}});assert.equal(resolved.status,200);
 const reopen=await request('/api/public/tickets/'+ticketId+'/reopen',{method:'POST',token});assert.equal(reopen.status,200);
 const final=await request('/api/tickets/'+ticketId,{cookie});assert.equal(final.data.ticket.status,'in_progress');

 // Registered customers can authenticate and access only their own tickets.
 const unique=randomBytes(6).toString('hex');
 const customerAccount={name:'Portal Customer',email:'portal-'+unique+'@example.test',password:'customer-strong-password-12345'};
 const registration=await request('/api/auth/register',{method:'POST',body:customerAccount});
 assert.equal(registration.status,201);
 assert.equal(registration.data.user.role,'customer');
 const customerCookie=registration.cookie.split(';')[0];
 const customerMe=await request('/api/auth/me',{cookie:customerCookie});
 assert.equal(customerMe.status,200);
 assert.equal(customerMe.data.user.email,customerAccount.email);
 const duplicate=await request('/api/auth/register',{method:'POST',body:customerAccount});
 assert.equal(duplicate.status,409);
 const newTicket=await request('/api/customer/tickets',{method:'POST',cookie:customerCookie,body:{subject:'Cannot reach my account',description:'My dashboard produces an error after login',priority:'high',category:'technical'}});
 assert.equal(newTicket.status,201);
 const customerTicketId=newTicket.data.id;
 const list=await request('/api/customer/tickets',{cookie:customerCookie});
 assert.equal(list.status,200);
 assert.ok(list.data.tickets.some(x=>String(x.id)===String(customerTicketId)));
 const otherAccount={name:'Another Customer',email:'other-'+unique+'@example.test',password:'other-strong-password-12345'};
 const otherRegistration=await request('/api/auth/register',{method:'POST',body:otherAccount});
 assert.equal(otherRegistration.status,201);
 const otherCookie=otherRegistration.cookie.split(';')[0];
 const forbidden=await request('/api/customer/tickets/'+customerTicketId,{cookie:otherCookie});
 assert.equal(forbidden.status,404);
 const noCreate=await request('/api/customer/tickets',{method:'POST',body:{subject:'Unauthorized',description:'Unauthorized customer request'}});
 assert.equal(noCreate.status,401);
 const staffClaim=await request('/api/tickets/'+customerTicketId+'/claim',{method:'POST',cookie});
 assert.equal(staffClaim.status,200);
 const secretNote=await request('/api/tickets/'+customerTicketId+'/messages',{method:'POST',cookie,body:{body:'STAFF ONLY - account detail',is_internal:true}});
 assert.equal(secretNote.status,201);
 const safeDetail=await request('/api/customer/tickets/'+customerTicketId,{cookie:customerCookie});
 assert.equal(safeDetail.status,200);
 assert.equal(safeDetail.data.messages.some(x=>x.body.includes('STAFF ONLY')),false);
 const staffReply=await request('/api/tickets/'+customerTicketId+'/messages',{method:'POST',cookie,body:{body:'We are investigating',is_internal:false}});
 assert.equal(staffReply.status,201);
 const visibleDetail=await request('/api/customer/tickets/'+customerTicketId,{cookie:customerCookie});
 assert.equal(visibleDetail.data.messages.length,1);
 const customerResponse=await request('/api/customer/tickets/'+customerTicketId+'/reply',{method:'POST',cookie:customerCookie,body:{body:'Thanks, understood'}});
 assert.equal(customerResponse.status,201);
 const portalLogout=await request('/api/auth/logout',{method:'POST',cookie:customerCookie});
 assert.equal(portalLogout.status,200);
 const expired=await request('/api/customer/tickets',{cookie:customerCookie});
 assert.equal(expired.status,401);
 const customerLogin=await request('/api/auth/login',{method:'POST',body:{email:customerAccount.email,password:customerAccount.password}});
 assert.equal(customerLogin.status,200);
 assert.equal(customerLogin.data.user.role,'customer');
});