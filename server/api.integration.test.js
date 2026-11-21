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
});