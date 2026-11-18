/* RealCognix OS — data source. Demo mode: the mock data in data.js / data-ops.js. Live mode: the RealCognix API.
   Live screens load from the API and are mapped to the shapes the screens already render; the rest stay on demo data. */
(function () {
  'use strict';
  var RC = window.RC, DEMO = RC.data, CFG = window.RC_CONFIG || {};
  var K = { api: 'rc-api-url', refresh: 'rc-refresh', mode: 'rc-mode' };

  /* Session. The access token lives only in memory (gone on reload, never readable from storage).
     The refresh token is kept in localStorage ("keep me signed in") or sessionStorage so a reload can restore the session.
     Tradeoff: any script running on this origin (XSS) could read it. Rotation with reuse detection limits the damage;
     the stronger option is an httpOnly SameSite cookie set by the API, which needs the UI and API on one site. */
  var S = { access: null, me: null, refreshing: null };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function getRefresh() { return ss(K.refresh) || ls(K.refresh); }
  function setRefresh(t, keep) {
    ss(K.refresh, null); ls(K.refresh, null);
    if (!t) return;
    if (keep === false || (keep == null && ss(K.refresh + '-session') === '1')) { ss(K.refresh, t); ss(K.refresh + '-session', '1'); } else { ls(K.refresh, t); ss(K.refresh + '-session', null); }
  }
  function apiUrl() { return (ls(K.api) || CFG.apiUrl || '').replace(/\/+$/, ''); }

  var L = RC.live = {};
  L.configuredUrl = function () { return (ls(K.api) || CFG.apiUrl || ''); };
  L.on = function () { return ls(K.mode) === 'live' && !!apiUrl(); };
  L.authed = function () { return L.on() ? !!(S.access || getRefresh()) : ls('rc-auth') === '1'; };
  L.me = function () { return S.me; };

  function ApiError(status, body, msg) { var e = new Error(msg || (body && (body.reason || body.error)) || ('HTTP ' + status)); e.status = status; e.body = body; return e; }

  function raw(path, o) {
    o = o || {};
    var h = { accept: 'application/json' };
    if (o.body !== undefined) h['content-type'] = 'application/json';
    if (!o.noAuth && S.access) h.authorization = 'Bearer ' + S.access;
    return fetch((o.base || apiUrl()) + path, { method: o.method || 'GET', headers: h, body: o.body !== undefined ? JSON.stringify(o.body) : undefined })
      .catch(function () { throw ApiError(0, null, 'network'); })
      .then(function (res) {
        if (res.status === 204) return { status: 204, data: null };
        return res.text().then(function (t) { var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { error: t }; } return { status: res.status, data: d, res: res }; });
      });
  }

  /** Authenticated call; on 401 refreshes once and retries. */
  function api(path, o) {
    o = o || {};
    var go = function () {
      return raw(path, o).then(function (r) {
        if (r.status === 401 && !o.noAuth && !o.retried) { o.retried = true; return refresh().then(go); }
        if (r.status >= 400 || r.status === 0) throw ApiError(r.status, r.data);
        return r.data;
      });
    };
    return (S.access || o.noAuth ? Promise.resolve() : refresh()).then(go);
  }
  L.api = api;

  function adopt(d, keep) {
    S.access = d.accessToken;
    setRefresh(d.refreshToken, keep);
    S.me = S.me && S.me.id === d.user.id ? S.me : { id: d.user.id, fullName: d.user.fullName, email: d.user.email, role: d.user.role };
  }

  function refresh() {
    if (S.refreshing) return S.refreshing;
    var t = getRefresh();
    if (!t) return Promise.reject(sessionError());
    S.refreshing = raw('/auth/refresh', { method: 'POST', body: { refreshToken: t }, noAuth: true }).then(function (r) {
      S.refreshing = null;
      if (r.status !== 200) { clearSession(); throw sessionError(); }
      adopt(r.data);
    }, function (e) { S.refreshing = null; throw e; });
    return S.refreshing;
  }
  function sessionError() { var e = new Error('session'); e.session = true; return e; }
  function clearSession() { S.access = null; S.me = null; setRefresh(null); cache = {}; }

  L.login = function (url, email, password, keep) {
    url = String(url || '').trim().replace(/\/+$/, '');
    return raw('/auth/login', { base: url, method: 'POST', body: { email: email, password: password }, noAuth: true }).then(function (r) {
      if (r.status !== 200) throw ApiError(r.status, r.data);
      ls(K.api, url); ls(K.mode, 'live'); ls('rc-auth', '1');
      cache = {};
      adopt(r.data, keep);
      return loadMe();
    });
  };
  L.useDemo = function () { clearSession(); ls(K.mode, 'demo'); ls(K.api, null); ls('rc-auth', '1'); };
  L.logout = function () {
    var t = getRefresh();
    var done = function () { clearSession(); ls(K.mode, null); ls('rc-auth', null); };
    return (t ? raw('/auth/logout', { method: 'POST', body: { refreshToken: t }, noAuth: true }) : Promise.resolve()).then(done, done);
  };
  function loadMe() {
    return api('/v1/me').then(function (me) { S.me = me; paintUser(); return me; });
  }
  var filterFilled = false;
  function ensureSession() {
    return (S.access ? Promise.resolve() : refresh())
      .then(function () { return S.me && S.me.org ? null : loadMe(); })
      .then(function () { if (!filterFilled) return clients().then(function (cl) { filterFilled = true; fillClientFilter(cl); }); });
  }

  /* ---------------- Cache + helpers ---------------- */
  var cache = {};
  function get(path, ttl) {
    ttl = ttl == null ? 30000 : ttl;
    var c = cache[path];
    if (c && Date.now() - c.at < ttl) return Promise.resolve(c.data);
    return api(path).then(function (d) { cache[path] = { at: Date.now(), data: d }; return d; });
  }
  L.invalidate = function (prefix) { Object.keys(cache).forEach(function (k) { if (!prefix || k.indexOf(prefix) === 0) delete cache[k]; }); };

  var LANG = { en: 'English', hi: 'Hindi', kn: 'Kannada', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', mr: 'Marathi', tcy: 'Tulu', bn: 'Bengali', gu: 'Gujarati' };
  var SOURCE = { meta_lead_ads: 'Meta Lead Ads', google_ads: 'Google Ads', website_form: 'Website', microsite: 'Microsite', portal_99acres: '99acres', portal_magicbricks: 'MagicBricks', portal_housing: 'Housing.com', portal_nobroker: 'NoBroker', portal_other: 'Portal', missed_call: 'Missed call', walk_in: 'Walk-in', channel_partner: 'Channel partner', referral: 'Referral', whatsapp_click: 'WhatsApp click', event: 'Event', manual: 'Manual', other: 'Other' };
  var PLATFORM = { meta: 'Meta', google: 'Google', portal: 'Portal', whatsapp: 'WhatsApp', seo: 'SEO', channel_partner: 'Channel partner', event: 'Event', other: 'Other' };
  var CHANNEL = { whatsapp: 'WhatsApp', email: 'Email', sms: 'SMS', call: 'Call', web_chat: 'Web chat', in_person: 'In person' };
  var AGENT = { onboarding: 'Onboarding', market_intel: 'Market Intel', creative: 'Creative', campaign_optimizer: 'Campaign Optimizer', lead_qualifier: 'Lead Qualifier', router: 'Router', follow_up: 'Follow-up', visit_concierge: 'Visit Concierge', reporting: 'Reporting', compliance_guard: 'Compliance Guard' };
  var STATUS = { pending_approval: 'Awaiting approval', no_show: 'No-show', under_construction: 'Live', launched: 'Live', ready_to_move: 'Live', pre_launch: 'Live', sold_out: 'Sold out', visit_scheduled: 'Visit scheduled' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function label(s) { if (s == null) return ''; s = String(s); return STATUS[s] || (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, ' '); }
  function lakh(inr) { return inr == null ? 0 : Math.round(Number(inr) / 1000) / 100; }
  function d(x) { return x ? new Date(x) : null; }
  function hm(t) { return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); }
  function sameDay(a, b) { return a.toDateString() === b.toDateString(); }
  function ago(x) {
    var t = d(x); if (!t || isNaN(t)) return '—';
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return m + ' min ago';
    if (m < 240) return Math.round(m / 60) + ' h ago';
    var now = new Date(), y = new Date(Date.now() - 86400000);
    if (sameDay(t, now)) return 'Today ' + hm(t);
    if (sameDay(t, y)) return 'Yesterday';
    var days = Math.round(m / 1440);
    return days < 14 ? days + ' days ago' : t.getDate() + ' ' + MONTHS[t.getMonth()] + ' ' + t.getFullYear();
  }
  L.ago = ago;
  function stamp(x) { var t = d(x); if (!t) return ''; var now = new Date(); return sameDay(t, now) ? hm(t) : sameDay(t, new Date(Date.now() - 86400000)) ? 'Yesterday ' + hm(t) : t.getDate() + ' ' + MONTHS[t.getMonth()] + ' ' + hm(t); }
  function bhk(arr) { if (!arr || !arr.length) return '—'; return arr.map(function (n) { return String(n).replace(/\.0$/, ''); }).join('/') + ' BHK'; }
  function cfg(types) {
    var b = []; (types || []).forEach(function (t) { var n = String(t.bedrooms).replace(/\.0$/, ''); if (b.indexOf(n) < 0) b.push(n); });
    if (!b.length) return '—';
    return (b.length === 1 ? b[0] : b.slice(0, -1).join(', ') + ' & ' + b[b.length - 1]) + ' BHK';
  }
  function monthYear(x) { var t = d(x); return t ? MONTHS[t.getMonth()] + ' ' + t.getFullYear() : '—'; }
  function short(name) { return String(name || '').split(/\s+/).slice(0, 2).join(' '); }
  function uuidish(s) { return /^[0-9a-f-]{36}$/i.test(String(s)); }

  /* ---------------- Mappers: API rows -> the shapes in data.js ---------------- */
  function mapClient(c) {
    var monthFrac = Math.max(0.1, new Date().getDate() / 30);
    var health = c.status !== 'active' ? 'Pending' : c.target_leads ? (c.leads_mtd >= c.target_leads * monthFrac * 0.8 ? 'On track' : 'At risk') : 'On track';
    return {
      id: c.id, name: c.legal_name, short: c.brand_name || short(c.legal_name), city: c.city || '—', status: label(c.status),
      projects: c.project_count, budget: lakh(c.monthly_budget_inr), leadsMTD: c.leads_mtd, bookings: c.bookings_mtd,
      am: c.account_owner_name || 'Unassigned', since: monthYear(c.created_at),
      rera: c.project_count && c.projects_rera_verified === c.project_count ? 'Verified' : 'Pending', health: health,
      feeModel: c.fee_model ? label(c.fee_model) : null
    };
  }
  function clients() {
    return get('/v1/clients', 60000).then(function (r) { return r.data.map(mapClient); });
  }
  function mapProject(p, i) {
    var types = p.unit_types || [];
    return {
      id: p.id, name: p.name, city: p.city, locality: p.locality || '—', client: p.client_id, config: cfg(types),
      priceRange: [lakh(p.price_min_inr), lakh(p.price_max_inr)], rera: p.rera_number || 'Not registered',
      possession: monthYear(p.possession_date), units: p.units_total, sold: p.units_sold, held: p.units_blocked,
      status: label(p.status), mono: ['', 't', 's', 'a'][i % 4], amenities: p.amenities || [], landAcres: p.land_area_acres,
      unitTypes: types.map(function (t) { return { t: t.name, carpet: t.carpetAreaSqft || 0, sbua: t.superBuiltUpSqft || 0, price: lakh(t.fromPriceInr), facing: t.facings ? label(t.facings).replace(/ /g, '-').replace(/,-/g, ', ') : '—', units: t.units }; })
    };
  }
  function mapLead(l) {
    var due = d(l.sla_due_at), sla = null;
    if (due && !l.first_contact_at && l.stage === 'new') sla = Math.max(0, Math.round(5 - (due - Date.now()) / 60000));
    var budget = l.budget_max_inr || l.budget_min_inr;
    return {
      id: l.id, ref: 'L-' + l.id.slice(-6).toUpperCase(), name: l.full_name || 'Unnamed lead', phone: l.phone_e164 || l.email || '—',
      project: l.project_name || '—', projectId: l.project_id, client: l.client_id, budget: lakh(budget), bhk: bhk(l.bhk_preference),
      source: SOURCE[l.source_kind] || label(l.source_kind), score: l.score, stage: label(l.stage), stageKey: l.stage, owner: l.owner_name || 'Unassigned',
      created: ago(l.created_at), slaMins: sla, nri: !!l.is_nri, lang: LANG[l.preferred_language] || l.preferred_language || '—',
      consent: l.has_consent !== false, purpose: l.persona === 'investor' ? 'Investment' : 'Self use',
      timeline: { immediate: 'Immediately', within_3_months: 'Within 3 months', within_6_months: '3–6 months', within_12_months: '6–12 months', just_exploring: 'Just exploring' }[l.timeline] || 'Not known yet',
      loan: l.loan_need === 'yes' || l.loan_need === 'maybe'
    };
  }
  function eventText(e) {
    var x = e.data || {}, esc = RC.esc;
    switch (e.type) {
      case 'created': return '<b>Lead captured</b>' + (x.source ? ' from ' + esc(SOURCE[x.source] || x.source) : '');
      case 'duplicate_inquiry': return '<b>Repeat enquiry</b> merged into this lead';
      case 'scored': return '<b>Scored ' + esc(x.score) + '</b>' + (x.temperature ? ' (' + esc(x.temperature) + ')' : '') + ' by Lead Qualifier';
      case 'assigned': return '<b>Assigned to ' + esc(x.user || x.userName || 'an executive') + '</b>' + (x.method ? ' · ' + esc(x.method) : '');
      case 'stage_changed': return '<b>Stage changed</b> from ' + esc(label(x.from)) + ' to ' + esc(label(x.to));
      case 'visit_scheduled': return '<b>Site visit scheduled</b>' + (x.when ? ' · ' + esc(x.when) : '');
      case 'message_out': return '<b>Message sent</b>' + (x.channel ? ' on ' + esc(CHANNEL[x.channel] || x.channel) : '');
      case 'message_in': return '<b>Message received</b>' + (x.channel ? ' on ' + esc(CHANNEL[x.channel] || x.channel) : '');
      case 'sla_breach': return '<b>5-minute rule missed</b>, reassigned';
      default: return '<b>' + esc(label(e.type)) + '</b>';
    }
  }
  function mapLeadDetail(r) {
    var l = r.lead, m = mapLead(Object.assign({}, l, { has_consent: (r.consents || []).some(function (c) { return c.state === 'granted'; }), sla_due_at: r.assignment && r.assignment.sla_due_at }));
    m.timelineHtml = (r.timeline || []).map(function (e) {
      return '<div class="tl-item' + (e.actor_type === 'agent' ? ' ai' : '') + '"><div class="tt">' + eventText(e) + '</div><div class="tm">' + RC.esc(stamp(e.occurred_at)) + '</div></div>';
    }).join('') || '<div class="empty">No activity yet</div>';
    m.clientName = l.client_name;
    return m;
  }
  L.leadDetail = function (id) { return get('/v1/leads/' + encodeURIComponent(id), 10000).then(mapLeadDetail); };
  L.setStage = function (id, stageLabel) {
    var key = String(stageLabel).toLowerCase().replace(/[^a-z]+/g, '_');
    return api('/v1/leads/' + encodeURIComponent(id), { method: 'PATCH', body: { stage: key } }).then(function (r) { L.invalidate('/v1/leads'); L.invalidate('/v1/dashboard'); return r; });
  };

  function mapCampaign(c) {
    return {
      id: c.id, name: c.name, channel: PLATFORM[c.platform] || label(c.platform), client: c.client_id, status: label(c.status),
      spend: Number(c.spend_inr) || 0, leads: c.leads, qualPct: c.leads ? Math.round(100 * c.qualified / c.leads) : 0, visits: c.site_visits,
      cpl: c.leads ? c.spend_inr / c.leads : 0, cpv: c.site_visits ? c.spend_inr / c.site_visits : 0, suggestion: ''
    };
  }
  function mapCreative(a) {
    var p = a.payload || {}, v = (p.variants || [])[0] || {}, comp = a.compliance || {};
    var blocked = comp.allowed === false;
    return {
      id: a.id, approvalId: a.id, project: p.projectName || a.title, type: label(p.format || 'creative'), headline: v.headline || a.title,
      body: v.primaryText || v.description || '', check: blocked ? 'Blocked' : 'Passed', reason: (comp.reasons || []).join(' '),
      by: AGENT[a.agent] ? AGENT[a.agent] + ' agent' : 'Creative agent', languages: p.language ? (LANG[p.language] || p.language) : null
    };
  }
  var GO = { creative: '#/campaigns', campaign_budget: '#/campaigns', outbound_message: '#/conversations', client_report: '#/reports', project_publish: '#/projects' };
  function mapApproval(a) {
    var p = a.payload || {}, impact = '';
    if (a.kind === 'outbound_message') impact = (CHANNEL[p.channel] || 'Message') + (p.body ? ': “' + String(p.body).slice(0, 80) + (String(p.body).length > 80 ? '…' : '') + '”' : '');
    else if (a.kind === 'creative') impact = (p.variants || []).length + ' variant' + ((p.variants || []).length === 1 ? '' : 's') + ' · ' + label(p.format || '');
    else if (a.kind === 'client_report') impact = 'Shared with the client once approved';
    else impact = 'Waiting since ' + ago(a.created_at).toLowerCase();
    return { id: a.id, what: RC.esc(a.title), agent: AGENT[a.agent] || label(a.kind), impact: RC.esc(impact), go: a.kind === 'outbound_message' && a.subject_id ? '#/conversations' : (GO[a.kind] || '#/agents'), kind: a.kind, leadId: a.subject_id };
  }
  function mapVisit(v, today0) {
    var t = d(v.scheduled_at), day0 = new Date(t); day0.setHours(0, 0, 0, 0);
    return {
      id: v.id, day: Math.round((day0 - today0) / 86400000), h: t.getHours(), time: hm(t), lead: v.lead_name || 'Lead', project: v.project_name || '—',
      exec: v.host_name || 'Unassigned', status: label(v.status), statusKey: v.status, mode: v.pickup_required ? 'Pickup' : 'Site',
      feedback: v.feedback, interest: v.interest_level, notes: v.notes, at: t
    };
  }
  function mapThreadList(c) {
    return { id: c.lead_id, lead: c.lead_id, name: c.lead_name || 'Lead', channel: CHANNEL[c.channel] || label(c.channel), channelKey: c.channel, project: c.project_name || '—', time: ago(c.last_message_at || c.last_message_created_at).replace(' ago', ''), unread: c.last_direction === 'inbound', msgs: [['in', c.last_body || '', '']], draft: '', template: null, client: c.client_id };
  }
  function fillThread(c, r) {
    c.msgs = r.messages.map(function (m) {
      var meta = [stamp(m.at)];
      if (m.direction === 'outbound') meta.push(m.sender_type === 'user' ? 'sent by a person' : 'auto');
      if (m.template_name) meta.push(m.template_name);
      if (m.status === 'blocked' || m.status === 'failed') meta.push(m.status + (m.blocked_reasons && m.blocked_reasons.length ? ': ' + m.blocked_reasons.join(', ') : ''));
      return [m.direction === 'outbound' ? 'out' : 'in', m.body || (m.subject || ''), meta.join(' · ')];
    });
    if (!c.msgs.length) c.msgs = [['in', '', '']];
    var dr = r.pendingDraft;
    c.draft = dr && dr.payload ? (dr.payload.body || '') : '';
    c.template = dr && dr.payload ? (dr.payload.templateName || null) : null;
    c.draftApprovalId = dr ? dr.id : null;
    var l = r.lead;
    c.leadInfo = { score: l.score, stage: label(l.stage), budget: lakh(l.budget_max_inr || l.budget_min_inr), owner: l.owner_name || 'Unassigned' };
    var granted = (r.consents || []).filter(function (k) { return k.state === 'granted'; }).map(function (k) { return CHANNEL[k.channel] || k.channel; });
    c.consentText = granted.filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ') || 'None recorded';
    c.consentTone = granted.length ? 'ok' : 'warn';
    return c;
  }

  function clientQ() { var c = RC.state.client; return c && c !== 'all' && uuidish(c) ? '?clientId=' + encodeURIComponent(c) : ''; }

  function mapDashboard(x, cl) {
    var k = x.kpis, me = S.me || {}, first = String(me.fullName || '').split(' ')[0];
    var hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    var now = new Date(), month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][now.getMonth()];
    var pct = function (a, b) { return b ? Math.round(100 * (a - b) / b) : null; };
    var dl = pct(k.leadsMtd, k.leadsPrevMonth);
    var sec = k.speedToLeadSeconds, speed = sec == null ? '—' : sec < 60 ? sec + 's' : Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
    var sp = x.spend || {}, spendTxt = RC.lakh(lakh(sp.spendInr)), budTxt = sp.monthlyBudgetInr ? RC.lakh(lakh(sp.monthlyBudgetInr)) : null;
    var stageOrder = ['new', 'contacted', 'qualified', 'visit_scheduled', 'visited', 'negotiation', 'booked', 'nurture', 'lost'];
    var stages = stageOrder.filter(function (s) { return x.leadsByStage[s]; }).map(function (s) { return [label(s), x.leadsByStage[s]]; });
    var totalSrc = x.leadsBySourceMtd.reduce(function (a, r) { return a + r.n; }, 0);
    var attn = [];
    if (k.slaOverdueNow) attn.push(['red', k.slaOverdueNow + ' lead' + (k.slaOverdueNow > 1 ? 's' : '') + ' past the 5-minute call rule', 'Call now or reassign', '#/leads']);
    if (k.approvalsPending) attn.push(['amber', k.approvalsPending + ' approval' + (k.approvalsPending > 1 ? 's' : '') + ' waiting for you', 'AI drafts and changes need a person', '#/agents']);
    if (sp.monthlyBudgetInr && sp.spendInr > sp.monthlyBudgetInr) attn.push(['amber', 'Ad spend is above the monthly budget', spendTxt + ' spent · budget ' + budTxt, '#/campaigns']);
    if (k.siteVisitsThisWeek) attn.push(['teal', k.siteVisitsThisWeek + ' site visit' + (k.siteVisitsThisWeek > 1 ? 's' : '') + ' this week', 'Reminders go out automatically', '#/visits']);
    if (!attn.length) attn.push(['teal', 'Nothing needs attention right now', 'New leads and approvals will show here', '#/leads']);
    var weeks = x.weekly.map(function (w) { var t = new Date(w.week_start + 'T00:00:00'); return MONTHS[t.getMonth()] + ' ' + t.getDate(); });
    return {
      title: greet + (first ? ', ' + RC.esc(first) : ''),
      sub: month + ' ' + now.getFullYear() + ' · ' + (clientQ() ? RC.esc((cl.filter(function (c) { return c.id === RC.state.client; })[0] || {}).name || 'one client') : 'all clients') + ' · updated ' + ago(x.generatedAt).toLowerCase(),
      kpis: [
        ['New leads', RC.n(k.leadsMtd), dl == null ? 'This month' : RC.delta(dl) + ' vs last month'],
        ['Speed to lead', speed, 'Average this month'],
        ['SLA breaches', RC.n(k.slaBreachesMtd), k.slaOverdueNow ? '<span style="color:var(--red-text)">' + k.slaOverdueNow + ' overdue now</span>' : 'None overdue now'],
        ['Site visits this week', RC.n(k.siteVisitsThisWeek), k.siteVisitsCompletedMtd + ' completed this month'],
        ['Bookings', RC.n(k.bookingsMtd), k.bookingsValueMtdInr ? RC.lakh(lakh(k.bookingsValueMtdInr)) + ' this month' : 'This month'],
        ['Spend vs budget', spendTxt, budTxt ? 'Monthly budget ' + budTxt : 'No budget set']
      ],
      chartTitle: 'Leads and site visits', chartSub: 'Weekly, last 8 weeks', chartLegend: ['Leads', 'Site visits'],
      weeks: weeks, series: [{ values: x.weekly.map(function (w) { return w.leads; }) }, { values: x.weekly.map(function (w) { return w.site_visits; }) }],
      stagesTitle: 'Leads by stage', stagesSub: 'All open leads', stages: stages,
      attn: attn,
      sourcesSub: totalSrc ? 'Share of ' + RC.n(totalSrc) + ' leads this month' : 'No leads yet this month',
      sources: x.leadsBySourceMtd.map(function (r) { var p = Math.round(100 * r.n / (totalSrc || 1)); return [SOURCE[r.source_kind] || label(r.source_kind), p, p + '%']; }),
      feed: x.recentAgentRuns.map(function (r) { return { t: AGENT[r.agent] || label(r.agent), m: label(r.status) + (r.subject_type ? ' · ' + label(r.subject_type) : ''), at: stamp(r.started_at) + (r.model ? ' · ' + r.model : '') }; }),
      clients: cl
    };
  }

  /* ---------------- Loaders: one per live screen ---------------- */
  var LOADERS = {
    dashboard: function () {
      return Promise.all([get('/v1/dashboard' + clientQ()), clients()]).then(function (a) { return { clients: a[1], dashboard: mapDashboard(a[0], a[1]) }; });
    },
    clients: function () {
      return Promise.all([clients(), get('/v1/projects')]).then(function (a) { return { clients: a[0], projects: a[1].data.map(mapProject) }; });
    },
    projects: function () {
      return Promise.all([clients(), get('/v1/projects')]).then(function (a) { return { clients: a[0], projects: a[1].data.map(mapProject) }; });
    },
    campaigns: function () {
      return Promise.all([clients(), get('/v1/campaigns'), get('/v1/approvals')]).then(function (a) {
        return { clients: a[0], campaigns: a[1].data.map(mapCampaign), creatives: a[2].data.filter(function (x) { return x.kind === 'creative'; }).map(mapCreative) };
      });
    },
    leads: function () {
      return Promise.all([clients(), get('/v1/leads?limit=200')]).then(function (a) { return { clients: a[0], leads: a[1].data.map(mapLead), leadsTotal: a[1].total }; });
    },
    conversations: function () {
      return Promise.all([clients(), get('/v1/conversations?limit=100')]).then(function (a) {
        var list = a[1].data.map(mapThreadList);
        var sel = RC.state.convSel, cur = list.filter(function (c) { return c.id === sel; })[0] || list[0];
        var ov = { clients: a[0], conversations: list };
        if (!cur) return ov;
        RC.state.convSel = cur.id;
        return get('/v1/conversations/' + encodeURIComponent(cur.id), 10000).then(function (r) { fillThread(cur, r); return ov; });
      });
    },
    visits: function () {
      var t0 = new Date(); t0.setHours(0, 0, 0, 0);
      var from = new Date(t0 - 7 * 86400000).toISOString(), to = new Date(t0.getTime() + 8 * 86400000).toISOString();
      return Promise.all([clients(), get('/v1/site-visits?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to))]).then(function (a) {
        var all = a[1].data.map(function (v) { return mapVisit(v, t0); });
        var week = all.filter(function (v) { return v.day >= 0 && v.day < 7 && v.statusKey !== 'cancelled'; });
        var past = all.filter(function (v) { return v.day < 0 || (v.day === 0 && v.at < new Date()); });
        var done = past.filter(function (v) { return v.statusKey === 'completed'; }).length, noShow = past.filter(function (v) { return v.statusKey === 'no_show'; }).length;
        var days = [], names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (var i = 0; i < 7; i++) { var x = new Date(t0.getTime() + i * 86400000); days.push(names[x.getDay()] + ' ' + x.getDate()); }
        return {
          clients: a[0], visits: all,
          visitDays: days,
          visitStats: { week: week.length, showUp: done + noShow ? Math.round(100 * done / (done + noShow)) + '%' : '—', noShows: noShow, completed: done },
          visitFeedback: all.filter(function (v) { return v.statusKey === 'completed' && (v.feedback || v.notes); }).slice(-5).reverse().map(function (v) {
            var f = v.feedback || {};
            var note = [f.liked && f.liked.length ? 'Liked ' + f.liked.join(', ') : '', f.concerns && f.concerns.length ? 'Concerns: ' + f.concerns.join(', ') : '', v.notes || ''].filter(Boolean).join('. ');
            return { lead: v.lead, project: v.project, rating: label(v.interest || 'warm'), note: RC.esc(note || 'Visit completed') };
          })
        };
      });
    },
    agents: function () {
      return Promise.all([clients(), get('/v1/approvals')]).then(function (a) { return { clients: a[0], approvals: a[1].data.map(mapApproval) }; });
    }
  };
  L.isLiveScreen = function (key) { return !!LOADERS[key]; };

  /* ---------------- Routing in live mode ---------------- */
  var seq = 0;
  function navLabel(key) { var n = ''; RC.nav.forEach(function (g) { g.items.forEach(function (it) { if (it[0] === key) n = it[1]; }); }); return n || 'Dashboard'; }
  L.route = function (r, paint) {
    var my = ++seq, loader = LOADERS[r.key];
    if (!S.access || !S.me || !filterFilled) RC.paintMessage(r, RC.pageHead(navLabel(r.key)) + '<div class="card"><div class="empty">' + RC.icon('refresh') + '<div>Loading…</div></div></div>');
    ensureSession().then(function () {
      if (my !== seq) return;
      if (!loader) { RC.data = DEMO; RC.state.screenLive = false; paint(); return; }
      var slow = setTimeout(function () { if (my === seq) RC.paintMessage(r, RC.pageHead(navLabel(r.key)) + '<div class="card"><div class="empty">' + RC.icon('refresh') + '<div>Loading ' + navLabel(r.key).toLowerCase() + '…</div></div></div>'); }, 150);
      return loader(r.params).then(function (ov) {
        clearTimeout(slow);
        if (my !== seq) return;
        RC.data = Object.assign({}, DEMO, ov);
        RC.state.screenLive = true;
        paint();
      }, function (e) { clearTimeout(slow); throw e; });
    }).catch(function (e) {
      if (my !== seq) return;
      if (e && e.session) { RC.toast('Your session ended. Please sign in again.', { icon: 'lock' }); location.replace('#/login'); return; }
      var msg = e && e.status === 0 ? 'Could not reach the API at ' + RC.esc(apiUrl()) + '.' : e && e.status === 403 ? 'Your role cannot see this page.' : 'The API returned an error' + (e && e.status ? ' (' + e.status + ')' : '') + '.';
      RC.paintMessage(r, RC.pageHead(navLabel(r.key)) + '<div class="note warn"><span class="note-label">COULD NOT LOAD</span>' + msg + ' <button class="btn sm" data-local id="rcRetry" style="margin-left:8px">' + RC.icon('refresh') + '<span>Retry</span></button></div>');
      var b = RC.qs('#rcRetry'); if (b) b.onclick = function () { L.invalidate(); RC.render(); };
    });
  };

  /** Topbar badge: "Demo data" in demo mode, "Demo" on screens that are not wired to the API yet, "Live" otherwise. */
  L.badge = function (key) {
    if (!L.on()) return '<span class="pill outline" title="Sample data. Connect an API on the sign-in screen to use live data.">Demo data</span>';
    return LOADERS[key] ? '<span class="pill ok" title="Loaded from ' + RC.esc(apiUrl()) + '">Live</span>' : '<span class="pill warn" title="This screen has no API endpoint yet and shows sample data">Demo</span>';
  };
  /** Small tag for sample sections inside a live screen. */
  RC.demoTag = function () { return L.on() ? ' <span class="pill outline nodot" title="Sample data">Demo</span>' : ''; };
  L.empty = function (text) { return '<div class="empty">' + RC.esc(text) + '</div>'; };

  /* ---------------- Writes used by live screens ---------------- */
  L.decide = function (id, decision) {
    return api('/v1/approvals/' + encodeURIComponent(id) + '/decision', { method: 'POST', body: { decision: decision } }).then(function (r) {
      L.invalidate('/v1/approvals'); L.invalidate('/v1/dashboard'); return r;
    });
  };
  L.send = function (c, text) {
    return api('/v1/leads/' + encodeURIComponent(c.lead) + '/messages', { method: 'POST', body: { channel: c.channelKey === 'email' ? 'email' : 'whatsapp', body: text, purpose: 'transactional' } }).then(function (r) {
      L.invalidate('/v1/conversations'); return r;
    });
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-approval]');
    if (!el || !L.on()) return;
    e.stopPropagation();
    el.disabled = true;
    var dec = el.getAttribute('data-decision');
    L.decide(el.getAttribute('data-approval'), dec).then(function () {
      RC.toast(dec === 'approved' ? 'Approved' : 'Rejected', { icon: dec === 'approved' ? 'check' : 'x' });
      RC.render();
    }, function (err) {
      el.disabled = false;
      RC.toast(err.status === 403 ? 'Only admins and managers can decide approvals' : err.status === 409 ? 'Already decided by someone else' : 'Could not save the decision', { icon: 'alert' });
      if (err.status === 409) RC.render();
    });
  }, true);

  /* ---------------- Chrome: user menu, client filter, palette ---------------- */
  function paintUser() {
    var b = RC.qs('#avatarBtn');
    if (b && S.me && S.me.fullName) b.innerHTML = '<span class="av sm navy">' + RC.esc(RC.initials(S.me.fullName)) + '</span>';
    var org = RC.qs('#orgBtn .meta');
    if (org && S.me && S.me.org) org.innerHTML = '<b>' + RC.esc(S.me.org.name) + '</b><span>' + RC.esc(S.me.roleName || S.me.role || '') + '</span>';
  }
  function fillClientFilter(cl) {
    var sel = RC.qs('#clientFilter'); if (!sel) return;
    sel.innerHTML = '<option value="all">All clients</option>' + cl.map(function (c) { return '<option value="' + RC.esc(c.id) + '">' + RC.esc(c.short) + '</option>'; }).join('');
    if (!cl.some(function (c) { return c.id === RC.state.client; })) { RC.state.client = 'all'; }
    sel.value = RC.state.client;
  }
  L.userLine = function () { return S.me ? RC.esc(S.me.fullName || '') + ' · ' + RC.esc(S.me.email || '') : ''; };
  L.paletteData = function () {
    var out = { leads: [], projects: [], clients: [] };
    if (!L.on()) return DEMO;
    ['leads', 'projects', 'clients'].forEach(function (k) { if (RC.state.screenLive && RC.data[k] !== DEMO[k]) out[k] = RC.data[k]; });
    return out;
  };
  L.demo = DEMO;
})();
