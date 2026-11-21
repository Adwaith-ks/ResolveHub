import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STATUS = { open: 'Open', in_progress: 'In progress', waiting: 'Waiting on customer', resolved: 'Resolved', closed: 'Closed' };
const PRIORITIES = ['low', 'medium', 'high'];
const FILTERS = [
  ['all', 'All tickets', 'inbox'], ['mine', 'Assigned to me', 'user'],
  ['open', 'Unassigned', 'layers'], ['in_progress', 'In progress', 'clock'],
  ['waiting', 'Waiting on customer', 'pause'], ['resolved', 'Resolved', 'check']
];
const EMPTY_TICKET = { subject: '', description: '', customer_name: '', customer_email: '', priority: 'medium' };
const clock = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
const date = (value) => value ? clock.format(new Date(value)) : '—';
const todayInIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dayInIST = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const overdue = (ticket) => !!ticket.resolution_due && ['open', 'in_progress'].includes(ticket.status) && new Date(ticket.resolution_due).getTime() < Date.now();

async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    credentials: 'same-origin', ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed. Please try again.');
  return data;
}

function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></>,
    inbox: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 13h5l2 3h4l2-3h5"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    pause: <><path d="M9 6v12M15 6v12"/></>,
    check: <path d="m5 12 5 5L20 7"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    close: <path d="M6 6l12 12M18 6 6 18"/>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    logout: <><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/><path d="m15 16 4-4-4-4M8 12h11"/></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2 6"/><path d="M20 4v7h-7"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
    alert: <><path d="M12 3 2.5 20h19L12 3z"/><path d="M12 9v5M12 17h.01"/></>
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.inbox}</svg>;
}

function Brand() {
  return <div className="brand"><span className="brand-icon"><Icon name="layers" size={18}/></span><span>ResolveHub<small>Support operations</small></span></div>;
}
function Button({ children, variant = 'primary', className = '', ...props }) {
  return <button type="button" className={'button button-' + variant + ' ' + className} {...props}>{children}</button>;
}
function Badge({ kind, value }) {
  const label = kind === 'status' ? (STATUS[value] || value) : value;
  return <span className={'badge badge-' + kind + '-' + value}><span className="badge-dot"/>{label}</span>;
}
function Modal({ title, label, children, onClose, narrow = false }) {
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="overlay overlay-centered" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={'modal ' + (narrow ? 'modal-narrow' : '')} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-heading"><div>{label && <span className="section-label">{label}</span>}<h2>{title}</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></div>
      {children}
    </section>
  </div>;
}
function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const response = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      onLogin(response.agent);
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }
  return <div className="login-page">
    <div className="login-header"><Brand/><span>AGENT PORTAL</span></div>
    <div className="login-layout">
      <section className="login-intro"><span className="section-label">RESOLVEHUB / SERVICE DESK</span><h1>Support, organized.</h1><p>Bring your queue, conversations, ownership, and SLA commitments into a single focused workspace.</p><div className="intro-divider"/><div className="intro-detail"><Icon name="check" size={18}/> Ticket workflows built for accountable teams</div></section>
      <form className="login-card" onSubmit={submit}>
        <h2>Sign in</h2><p>Use your support agent account to continue.</p>
        <label>Email address<input autoComplete="username" required type="email" placeholder="agent@company.com" value={email} onChange={e => setEmail(e.target.value)}/></label>
        <label>Password<input autoComplete="current-password" required type="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)}/></label>
        {error && <div className="inline-error" role="alert">{error}</div>}
        <Button type="submit" disabled={busy} className="full-width">{busy ? 'Signing in…' : 'Sign in to ResolveHub'}</Button>
      </form>
    </div>
    <footer className="login-footer">ResolveHub · Support operations</footer>
  </div>;
}

function TicketForm({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_TICKET);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api('/tickets', { method: 'POST', body: JSON.stringify(form) });
      await onCreated(result);
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }
  return <Modal title="Create ticket" label="NEW REQUEST" onClose={onClose}>
    <form className="ticket-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="span-two">Subject<input autoFocus minLength={3} maxLength={160} required value={form.subject} placeholder="Briefly describe the issue" onChange={e => change('subject', e.target.value)}/></label>
        <label>Customer name<input required maxLength={120} value={form.customer_name} placeholder="Full name" onChange={e => change('customer_name', e.target.value)}/></label>
        <label>Email address<input required type="email" maxLength={250} value={form.customer_email} placeholder="name@company.com" onChange={e => change('customer_email', e.target.value)}/></label>
        <label>Priority<select value={form.priority} onChange={e => change('priority', e.target.value)}>{PRIORITIES.map(item => <option value={item} key={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
        <label className="span-two">Description<textarea required rows={5} value={form.description} placeholder="Include relevant details and expected outcome" onChange={e => change('description', e.target.value)}/></label>
      </div>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div className="modal-footer"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}><Icon name="plus" size={16}/>{busy ? 'Creating…' : 'Create ticket'}</Button></div>
    </form>
  </Modal>;
}

function TicketDetail({ data, agent, onClose, onChanged, notify }) {
  const ticket = data.ticket;
  const [tab, setTab] = useState('conversation');
  const [body, setBody] = useState('');
  const [privateNote, setPrivateNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const assigned = String(ticket.assignee_id) === String(agent.id);
  const active = !['resolved', 'closed'].includes(ticket.status);
  const eligible = assigned && active;
  async function mutate(action, success) {
    setBusy(true);
    try { await action(); await onChanged(ticket.id); notify(success); }
    catch (error) { notify(error.message, true); }
    finally { setBusy(false); }
  }
  const change = (patch) => mutate(() => api('/tickets/' + ticket.id, { method: 'PATCH', body: JSON.stringify(patch) }), 'Ticket updated');
  async function submit(event) {
    event.preventDefault(); if (!body.trim()) return;
    await mutate(async () => { await api('/tickets/' + ticket.id + '/messages', { method: 'POST', body: JSON.stringify({ body, is_internal: privateNote }) }); setBody(''); }, privateNote ? 'Internal note added' : 'Public reply sent');
  }
  return <>
    <div className="overlay detail-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="detail-panel" role="dialog" aria-modal="true" aria-label={'Ticket ' + ticket.id + ' details'}>
        <div className="detail-top"><span>Tickets <Icon name="chevron" size={14}/> <strong>#{ticket.id}</strong></span><button className="icon-button" aria-label="Close ticket details" onClick={onClose}><Icon name="close"/></button></div>
        <div className="detail-scroll">
          <section className="conversation-pane">
            <div className="ticket-summary">
              <div className="badge-row"><Badge kind="priority" value={ticket.priority}/><Badge kind="status" value={ticket.status}/>{overdue(ticket) && <span className="breach">Resolution overdue</span>}</div>
              <h2>{ticket.subject}</h2><p className="ticket-description">{ticket.description}</p>
              <div className="requester"><div className="avatar">{ticket.customer_name?.slice(0, 1).toUpperCase()}</div><div><strong>{ticket.customer_name}</strong><span>{ticket.customer_email}</span></div></div>
            </div>
            <div className="detail-tabs" role="tablist"><button role="tab" aria-selected={tab === 'conversation'} className={tab === 'conversation' ? 'tab-current' : ''} onClick={() => setTab('conversation')}>Conversation <span>{data.messages.length}</span></button><button role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'tab-current' : ''} onClick={() => setTab('activity')}>Activity <span>{data.events.length}</span></button></div>
            {tab === 'conversation' ? <div className="messages">{data.messages.length ? data.messages.map(entry => <article className={'message ' + (entry.is_internal ? 'message-private' : '')} key={entry.id}><div className="message-head"><strong>{entry.actor_type === 'agent' ? 'Support agent' : 'Customer'}</strong><time>{date(entry.created_at)}</time></div>{entry.is_internal && <span className="private-tag"><Icon name="lock" size={12}/> Internal note · Team only</span>}<p>{entry.body}</p></article>) : <div className="mini-empty"><Icon name="inbox" size={22}/><strong>No messages yet</strong><span>Customer conversations and team notes appear here.</span></div>}</div> :
              <div className="timeline">{data.events.length ? data.events.map(entry => <div className="timeline-item" key={entry.id}><span className="timeline-point"/><div><strong>{entry.event_type?.replaceAll('_', ' ')}</strong><p>{entry.actor_type} · {date(entry.created_at)}</p></div></div>) : <div className="mini-empty">No activity recorded yet.</div>}</div>}
          </section>
          <aside className="properties-pane">
            <h3>Ticket properties</h3>
            <div className="property"><span>Ticket ID</span><strong>#{ticket.id}</strong></div>
            <div className="property"><span>Assignee</span><strong>{ticket.assignee_name || 'Unassigned'}</strong></div>
            <div className="property"><span>Created</span><strong>{date(ticket.created_at)}</strong></div>
            <div className="property"><span>First response SLA</span><strong>{ticket.first_response_at ? 'Responded · ' + date(ticket.first_response_at) : date(ticket.first_response_due)}</strong></div>
            <div className="property"><span>Resolution SLA</span><strong>{ticket.status === 'waiting' ? 'Paused — waiting for customer' : date(ticket.resolution_due)}</strong></div>
            <div className="property"><span>Current priority</span><Badge kind="priority" value={ticket.priority}/></div>
            {active && !ticket.assignee_id && <Button disabled={busy} className="full-width" onClick={() => mutate(() => api('/tickets/' + ticket.id + '/claim', { method: 'POST' }), 'Ticket claimed')}>Claim ticket</Button>}
            {eligible && <div className="ticket-actions"><h3>Manage ticket</h3><label>Priority<select disabled={busy} value={ticket.priority} onChange={e => change({ priority: e.target.value })}>{PRIORITIES.map(item => <option value={item} key={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label><label>Status<select disabled={busy} value={ticket.status} onChange={e => e.target.value === 'resolved' ? setConfirm(true) : change({ status: e.target.value })}>{[...new Set([ticket.status, ...({ open: ['in_progress', 'waiting', 'resolved'], in_progress: ['waiting', 'resolved'], waiting: ['in_progress', 'resolved'] }[ticket.status] || [])])].map(item => <option key={item} value={item}>{STATUS[item]}</option>)}</select></label></div>}
          </aside>
        </div>
        {eligible && <form className="composer" onSubmit={submit}>
          <div className="composer-heading"><strong>{privateNote ? 'Internal note' : 'Public reply'}</strong><label className="switch-label"><input type="checkbox" checked={privateNote} onChange={e => setPrivateNote(e.target.checked)}/> Internal note</label></div>
          <textarea required rows={3} maxLength={10000} placeholder={privateNote ? 'Write a private note for your team…' : 'Write a reply visible to the customer…'} value={body} onChange={e => setBody(e.target.value)}/>
          <div className="composer-footer"><span>{privateNote ? 'Only support staff can view this note.' : 'Customer can view this reply.'}</span><Button type="submit" disabled={!body.trim() || busy}><Icon name="send" size={15}/>{busy ? 'Sending…' : 'Send'}</Button></div>
        </form>}
      </aside>
    </div>
    {confirm && <Modal title="Resolve this ticket?" label="CONFIRM ACTION" narrow onClose={() => setConfirm(false)}><p className="confirm-copy">This will mark ticket #{ticket.id} as resolved. The customer can request reopening when eligible.</p><div className="modal-footer"><Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button><Button disabled={busy} onClick={() => { setConfirm(false); change({ status: 'resolved' }); }}>Resolve ticket</Button></div></Modal>}
  </>;
}

function Dashboard({ agent, onLogout }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [priority, setPriority] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [openForm, setOpenForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [customerToken, setCustomerToken] = useState('');
  const [notice, setNotice] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [loadError, setLoadError] = useState('');
  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    setLoadError('');
    try { setTickets((await api('/tickets')).tickets); }
    catch (error) { setLoadError(error.message); }
    finally { if (!silent) setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { const timer = setInterval(() => { void refresh(true); }, 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { setPage(0); }, [filter, search, priority]);
  const notify = (message, isError = false) => setNotice({ message, isError });
  const count = key => key === 'all' ? tickets.length : key === 'mine' ? tickets.filter(t => String(t.assignee_id) === String(agent.id)).length : key === 'open' ? tickets.filter(t => t.status === 'open' && !t.assignee_id).length : tickets.filter(t => t.status === key).length;
  const filtered = useMemo(() => tickets.filter(t => {
    const matchQueue = filter === 'all' || (filter === 'mine' ? String(t.assignee_id) === String(agent.id) : filter === 'open' ? t.status === 'open' && !t.assignee_id : t.status === filter);
    const matchPriority = priority === 'all' || t.priority === priority;
    const matchSearch = [t.subject, t.customer_name, t.customer_email, String(t.id)].join(' ').toLowerCase().includes(search.toLowerCase());
    return matchQueue && matchPriority && matchSearch;
  }), [tickets, filter, priority, search, agent.id]);
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => setPage(current => Math.min(current, pages - 1)), [pages]);
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const metrics = [
    ['Open tickets', tickets.filter(t => ['open', 'in_progress'].includes(t.status)).length, 'Awaiting resolution'],
    ['Assigned to me', count('mine'), 'Current ownership'],
    ['Overdue', tickets.filter(overdue).length, 'Resolution deadline passed'],
    ['Waiting on customer', count('waiting'), 'Pending customer reply'],
    ['Resolved today', tickets.filter(t => t.status === 'resolved' && t.resolved_at && dayInIST(t.resolved_at) === todayInIST()).length, 'Completed today · IST']
  ];
  const heading = FILTERS.find(item => item[0] === filter)?.[1] || 'All tickets';
  async function openTicket(id) { try { setDetail(await api('/tickets/' + id)); } catch (error) { notify(error.message, true); } }
  async function changed(id) { await refresh(); setDetail(await api('/tickets/' + id)); }
  async function created(result) { setOpenForm(false); setCustomerToken(result.customer_token); await refresh(); notify('Ticket created'); }
  async function logout() { try { await api('/auth/logout', { method: 'POST' }); onLogout(); } catch (error) { notify(error.message, true); } }
  return <div className="app-shell">
    <aside className={'sidebar ' + (mobileNav ? 'mobile-open' : '')}>
      <Brand/><p className="side-heading">WORKSPACE</p>
      <nav aria-label="Ticket queues">{FILTERS.map(([key, title, icon]) => <button type="button" title={title} key={key} className={'nav-item ' + (filter === key ? 'nav-current' : '')} onClick={() => { setFilter(key); setMobileNav(false); }}><Icon name={icon} size={17}/><span className="nav-text">{title}</span><small>{count(key)}</small></button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-profile"><span className="avatar">{agent.name?.slice(0, 1).toUpperCase()}</span><div><strong>{agent.name}</strong><small>Support agent</small></div><button className="icon-button" title="Sign out" aria-label="Sign out" onClick={logout}><Icon name="logout" size={18}/></button></div></div>
    </aside>
    <div className="main-area">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Toggle navigation" onClick={() => setMobileNav(value => !value)}><Icon name="menu"/></button><span>Workspace</span><Icon name="chevron" size={14}/><strong>{heading}</strong></div><span className="topbar-account">{agent.email}</span></header>
      <main className="content">
        <div className="page-title"><div><h1>Support overview</h1><p>Manage requests, prioritize work, and track service commitments.</p></div><Button onClick={() => setOpenForm(true)}><Icon name="plus" size={17}/>New ticket</Button></div>
        <div className="metrics">{metrics.map(([name, value, caption]) => <div className="metric" key={name}><span>{name}</span><strong>{value}</strong><small>{caption}</small></div>)}</div>
        <section className="board"><div className="board-heading"><div><h2>{heading} <span>{filtered.length}</span></h2><p>Tickets in the selected queue</p></div><Button variant="secondary" disabled={loading} onClick={refresh}><Icon name="refresh" size={16}/>Refresh</Button></div>
          <div className="board-toolbar"><div className="quick-filters">{[['all', 'All'], ['mine', 'Mine'], ['open', 'Unassigned'], ['waiting', 'Waiting'], ['resolved', 'Resolved']].map(([key, label]) => <button className={filter === key ? 'quick-current' : ''} key={key} onClick={() => setFilter(key)}>{label}</button>)}</div><div className="toolbar-actions"><label className="priority-filter">Priority<select aria-label="Filter priority" value={priority} onChange={e => setPriority(e.target.value)}><option value="all">All</option>{PRIORITIES.map(item => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label><label className="search-field"><Icon name="search" size={17}/><input aria-label="Search tickets" placeholder="Search tickets" value={search} onChange={e => setSearch(e.target.value)}/></label></div></div>
          {loadError && <div className="inline-error board-error" role="alert">{loadError} <Button variant="secondary" onClick={refresh}>Retry</Button></div>}
          <div className="table-wrap"><table className="ticket-table"><thead><tr><th>Ticket</th><th>Customer</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Resolution SLA</th><th>Created</th></tr></thead><tbody>{!loading && visible.map(ticket => <tr key={ticket.id} tabIndex={0} onClick={() => openTicket(ticket.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTicket(ticket.id); } }}><td><span className="ticket-code">#{ticket.id}</span><strong className="ticket-subject">{ticket.subject}</strong></td><td><strong className="customer-name">{ticket.customer_name}</strong><small>{ticket.customer_email}</small></td><td><Badge kind="priority" value={ticket.priority}/></td><td><Badge kind="status" value={ticket.status}/></td><td>{ticket.assignee_name || <span className="muted">Unassigned</span>}</td><td>{ticket.status === 'waiting' ? <span className="muted">Paused</span> : ['resolved', 'closed'].includes(ticket.status) ? <span className="muted">Completed</span> : <span className={overdue(ticket) ? 'sla-overdue' : ''}>{overdue(ticket) ? 'Overdue' : date(ticket.resolution_due)}</span>}</td><td className="date-cell">{date(ticket.created_at)}</td></tr>)}</tbody></table>
            {loading && <div className="table-loading" role="status" aria-label="Loading tickets">{Array.from({ length: 5 }, (_, i) => <div className="skeleton" key={i}><span/><span/><span/><span/></div>)}</div>}
            {!loading && !visible.length && <div className="table-empty"><div className="empty-icon"><Icon name="inbox" size={24}/></div><h3>{search || priority !== 'all' ? 'No matching tickets' : 'This queue is clear'}</h3><p>{search || priority !== 'all' ? 'Try changing your filters or search terms.' : 'Tickets will appear here when requests are created.'}</p>{!search && priority === 'all' && <Button variant="secondary" onClick={() => setOpenForm(true)}><Icon name="plus" size={16}/>Create ticket</Button>}</div>}
          </div>
          <div className="table-footer"><span>Showing <strong>{filtered.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, filtered.length)}</strong> of {filtered.length} loaded tickets</span><div className="pagination"><button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</button><span>Page {page + 1} of {pages}</span><button disabled={page === pages - 1} onClick={() => setPage(p => Math.min(pages - 1, p + 1))}>Next</button></div><span>Times shown in IST</span></div>
        </section>
      </main>
    </div>
    {detail && <TicketDetail key={detail.ticket.id} data={detail} agent={agent} onClose={() => setDetail(null)} onChanged={changed} notify={notify}/>}
    {openForm && <TicketForm onClose={() => setOpenForm(false)} onCreated={created}/>}
    {customerToken && <Modal title="Customer access token" label="TICKET CREATED" narrow onClose={() => setCustomerToken('')}><p className="token-help">Copy this token now. The customer needs it to access their ticket through the customer API. It will not be shown again.</p><code className="token-code">{customerToken}</code><div className="modal-footer"><Button variant="secondary" onClick={() => navigator.clipboard?.writeText(customerToken).then(() => notify('Token copied')).catch(() => notify('Copy unavailable. Select the token manually.', true))}><Icon name="copy" size={16}/>Copy token</Button><Button onClick={() => setCustomerToken('')}>Done</Button></div></Modal>}
    {notice && <div className={'toast ' + (notice.isError ? 'toast-error' : '')} role="status">{notice.message}</div>}
  </div>;
}

function App() {
  const [agent, setAgent] = useState(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => { api('/auth/me').then(response => setAgent(response.agent)).catch(() => {}).finally(() => setChecking(false)); }, []);
  if (checking) return <div className="boot-loading"><span className="brand-icon"><Icon name="layers"/></span><p>Loading workspace…</p></div>;
  return agent ? <Dashboard agent={agent} onLogout={() => setAgent(null)}/> : <Login onLogin={setAgent}/>;
}

createRoot(document.getElementById('root')).render(<App/>);
