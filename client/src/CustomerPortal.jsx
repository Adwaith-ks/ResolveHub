import React, {useEffect,useState} from 'react';
import './customer.css';

const fmt = value => value ? new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value)) : '—';
const STATUS = {open:'Open',in_progress:'In progress',waiting:'Waiting for your response',resolved:'Resolved',closed:'Closed'};
async function request(path,options={}) {
  const response=await fetch('/api/customer'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Request failed');
  return data;
}
const EMPTY={subject:'',description:'',category:'general',priority:'medium'};
export default function CustomerPortal({user,onLogout}) {
  const [tickets,setTickets]=useState([]);
  const [selected,setSelected]=useState(null);
  const [create,setCreate]=useState(false);
  const [form,setForm]=useState(EMPTY);
  const [attachment,setAttachment]=useState(null);
  const [reply,setReply]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true);
  async function load(){try{setTickets((await request('/tickets')).tickets);setError('');}catch(e){setError(e.message);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  async function open(id){try{setSelected(await request('/tickets/'+id));setError('');}catch(e){setError(e.message);}}
  async function action(fn,done){setBusy(true);setError('');try{await fn();await load();if(selected)await open(selected.ticket.id);setNotice(done);}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function createTicket(e){e.preventDefault();setBusy(true);setError('');try{let attachmentData=null;if(attachment){if(attachment.size>2097152)throw new Error('Attachments must be 2 MB or smaller');if(!['image/jpeg','image/png','application/pdf'].includes(attachment.type))throw new Error('Only PDF, PNG or JPEG files are accepted');const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read attachment'));reader.readAsDataURL(attachment);});attachmentData={name:attachment.name,type:attachment.type,data:encoded};}const result=await request('/tickets',{method:'POST',body:JSON.stringify({...form,attachment:attachmentData})});setCreate(false);setForm(EMPTY);setAttachment(null);setNotice('Ticket #'+result.id+' created successfully');await load();await open(result.id);}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function sendReply(e){e.preventDefault();if(!reply.trim()||!selected)return;await action(async()=>{await request('/tickets/'+selected.ticket.id+'/reply',{method:'POST',body:JSON.stringify({body:reply})});setReply('');},'Reply sent');}
  async function reopen(){if(!selected)return;await action(()=>request('/tickets/'+selected.ticket.id+'/reopen',{method:'POST'}),'Ticket reopened');}
  const update=(field,value)=>setForm(f=>({...f,[field]:value}));
  return <div className="customer-shell">
    <header className="customer-header"><div className="customer-wordmark"><span className="customer-symbol">R</span><span><strong>ResolveHub</strong><small>Customer support portal</small></span></div><div className="customer-identity"><span>{user.name} <small>{user.email}</small></span><button type="button" className="customer-outline" onClick={onLogout}>Sign out</button></div></header>
    <main className="customer-main">
      <div className="customer-heading"><div><p className="customer-eyebrow">CUSTOMER WORKSPACE</p><h1>{selected?'Ticket #'+selected.ticket.id:'Your support tickets'}</h1><p>Raise a request, follow progress, and stay in touch with the team.</p></div><div className="customer-header-actions">{selected&&<button className="customer-outline" onClick={()=>setSelected(null)}>Back to tickets</button>}<button className="customer-primary" onClick={()=>{setSelected(null);setCreate(true);setError('');}}>New ticket</button></div></div>
      {error&&<p role="alert" className="customer-error">{error}</p>}
      {notice&&<p role="status" className="customer-notice">{notice}</p>}
      {selected ? <div className="customer-detail">
        <section className="customer-card"><div className="customer-detail-top"><span className="customer-tag">{STATUS[selected.ticket.status]||selected.ticket.status}</span><span className="customer-tag">{selected.ticket.priority} priority</span></div><h2>{selected.ticket.subject}</h2><p className="customer-description">{selected.ticket.description}</p><dl className="customer-properties"><div><dt>Created</dt><dd>{fmt(selected.ticket.created_at)}</dd></div><div><dt>Resolution due</dt><dd>{fmt(selected.ticket.resolution_due)}</dd></div><div><dt>Resolved</dt><dd>{fmt(selected.ticket.resolved_at)}</dd></div><div><dt>Closed</dt><dd>{fmt(selected.ticket.closed_at)}</dd></div></dl>
        {!!selected.attachments?.length&&<div className="customer-attachments"><h3>Attachments</h3>{selected.attachments.map(file=><a key={file.id} href={'/api/customer/tickets/'+selected.ticket.id+'/attachments/'+file.id} download>{file.filename} ({Math.ceil(file.size_bytes/1024)} KB)</a>)}</div>}
        <h3>Conversation</h3>
        <div className="customer-messages">{selected.messages.length?selected.messages.map(m=><div key={m.id} className={'customer-message '+(m.actor_type==='agent'?'customer-agent-reply':'')}><div><strong>{m.actor_type==='agent'?'Support team':'You'}</strong><time>{fmt(m.created_at)}</time></div><p>{m.body}</p></div>):<p className="customer-muted">No replies yet. The support team will respond here.</p>}</div>
        {!['resolved','closed'].includes(selected.ticket.status)&&<form onSubmit={sendReply} className="customer-reply"><label htmlFor="customer-reply-input">Reply to the support team</label><textarea id="customer-reply-input" required maxLength={10000} value={reply} onChange={e=>setReply(e.target.value)} rows={4} placeholder="Describe what happened or answer the agent's question"/><button type="submit" className="customer-primary" disabled={busy||!reply.trim()}>Send reply</button></form>}
        {selected.ticket.status==='resolved'&&<button disabled={busy} className="customer-outline" onClick={reopen}>Request reopening</button>}
      </section></div> : <section className="customer-card">
        <div className="customer-list-heading"><h2>Requests <span>{tickets.length}</span></h2><button className="customer-outline" onClick={load}>Refresh</button></div>
        {loading?<p className="customer-muted">Loading tickets…</p>:tickets.length?<div className="customer-table-scroll"><table className="customer-table"><thead><tr><th>Ticket</th><th>Priority</th><th>Status</th><th>Created</th></tr></thead><tbody>{tickets.map(t=><tr key={t.id}><td><button className="customer-ticket-link" onClick={()=>open(t.id)}><small>#{t.id}</small><strong>{t.subject}</strong></button></td><td>{t.priority}</td><td><span className="customer-tag">{STATUS[t.status]||t.status}</span></td><td>{fmt(t.created_at)}</td></tr>)}</tbody></table></div>:<div className="customer-empty"><h3>No tickets yet</h3><p>When you submit a support request, it will appear here.</p><button className="customer-primary" onClick={()=>setCreate(true)}>Raise your first ticket</button></div>}
      </section>}
      {create&&<div className="customer-overlay"><section role="dialog" aria-modal="true" aria-label="Create support ticket" className="customer-dialog"><div className="customer-list-heading"><h2>New support ticket</h2><button className="customer-outline" onClick={()=>setCreate(false)} type="button">Close</button></div><form onSubmit={createTicket}>
        <label>Subject<input required minLength={3} maxLength={160} value={form.subject} onChange={e=>update('subject',e.target.value)} placeholder="Brief summary of the issue"/></label>
        <label>Category<select value={form.category} onChange={e=>update('category',e.target.value)}><option value="general">General</option><option value="technical">Technical issue</option><option value="billing">Billing</option><option value="account">Account access</option><option value="feature">Feature request</option></select></label>
        <label>Priority<select value={form.priority} onChange={e=>update('priority',e.target.value)}><option value="high">Critical</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        <label>Description<textarea required minLength={1} maxLength={10000} rows={5} value={form.description} onChange={e=>update('description',e.target.value)} placeholder="Include steps to reproduce the problem and its impact"/></label>
        <label>Attachment (optional)<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={e=>setAttachment(e.target.files?.[0]||null)}/></label><p className="customer-muted">PDF, PNG or JPEG only. Maximum 2 MB. Do not upload secrets or sensitive account credentials.</p>
        <button className="customer-primary" type="submit" disabled={busy}>{busy?'Submitting…':'Submit ticket'}</button>
      </form></section></div>}
    </main>
  </div>;
}
