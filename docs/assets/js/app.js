/* RealCognix OS — core: icons, helpers, router, theme, drawer, toast, palette */
(function () {
  'use strict';
  var RC = window.RC = { screens: {}, drawers: {}, state: {} };

  /* ---------------- Icons (hand-drawn, 24 grid, 1.5 stroke) ---------------- */
  var P = function (d) { return '<path d="' + d + '"/>'; };
  var C = function (cx, cy, r) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>'; };
  var ICONS = {
    dashboard: P('M4 4.5h6.5v7H4zM13.5 4.5H20v4h-6.5zM13.5 11.5H20v8h-6.5zM4 14.5h6.5v5H4z'),
    building: P('M4 20V6.5L11 4v16M11 8.5h8.5V20M3 20h18M7 8h1M7 11.5h1M7 15h1M14.5 12h2M14.5 15.5h2'),
    layers: P('M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4'),
    globe: C(12, 12, 8) + P('M4 12h16M12 4c2.4 2.3 3.6 5 3.6 8s-1.2 5.7-3.6 8c-2.4-2.3-3.6-5-3.6-8s1.2-5.7 3.6-8z'),
    megaphone: P('M4 10v4h3l7.5 4V6L7 10H4zM17.5 9.5a3.5 3.5 0 010 5M7 14l1.2 5h2.4l-1-4.4'),
    users: C(9, 8, 3) + P('M3.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5M15.5 5.3a3 3 0 010 5.4M17 14.2c1.8.7 3 2.4 3.4 4.8'),
    chat: P('M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1h-8l-4 3.2V16H5a1 1 0 01-1-1V6a1 1 0 011-1zM8 9.5h8M8 12.5h5'),
    flow: P('M5 4h5v5H5zM14 15h5v5h-5zM7.5 9v3.5a2 2 0 002 2H14M12 12.5l2 2-2 2'),
    calendar: P('M5 6h14v14H5zM5 10h14M9 4v4M15 4v4M8.5 13.5h2M13.5 13.5h2M8.5 16.5h2'),
    filecheck: P('M7 3.5h7l4 4V20.5H7zM14 3.5v4h4M9.5 14l2 2 3.5-4'),
    link: P('M10 14a4 4 0 005.7 0l2.8-2.8a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-2.8 2.8a4 4 0 005.7 5.7l1-1'),
    team: C(12, 8.5, 3.5) + P('M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5'),
    chip: P('M7 7h10v10H7zM10 10h4v4h-4zM10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5'),
    chart: P('M4 20h16M7 16.5v-5M12 16.5V7M17 16.5v-8'),
    sliders: P('M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4'),
    search: C(11, 11, 6.5) + P('M20 20l-4.3-4.3'),
    bell: P('M6 16v-5a6 6 0 0112 0v5l1.5 2h-15zM10 20.5a2 2 0 004 0'),
    sun: C(12, 12, 3.5) + P('M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4'),
    moon: P('M19 14.5A7.5 7.5 0 019.5 5a7.5 7.5 0 109.5 9.5z'),
    monitor: P('M4 5h16v11H4zM9 20h6M12 16v4'),
    chevL: P('M14 6l-6 6 6 6'), chevR: P('M10 6l6 6-6 6'), chevD: P('M6 9.5l6 6 6-6'), chevU: P('M6 14.5l6-6 6 6'),
    plus: P('M12 5v14M5 12h14'), x: P('M6.5 6.5l11 11M17.5 6.5l-11 11'), check: P('M5 12.5l4.5 4.5L19 7'),
    filter: P('M4 6h16M7 12h10M10 18h4'),
    more: P('M6 12h.01M12 12h.01M18 12h.01'),
    download: P('M12 4v11M7 10l5 5 5-5M5 20h14'), upload: P('M12 16V5M7 9.5l5-5 5 5M5 20h14'),
    share: P('M12 14.5V4M8 8l4-4 4 4M6 11.5V20h12v-8.5'),
    phone: P('M6.5 4h3l1.5 4-2 1.5a10 10 0 005 5l1.5-2 4 1.5v3a2 2 0 01-2 2A15.5 15.5 0 014.5 6a2 2 0 012-2z'),
    mail: P('M4 6h16v12H4zM4.5 6.5l7.5 6 7.5-6'),
    whatsapp: P('M5 19.5l1.2-3.7A7.6 7.6 0 1112 19.6a7.7 7.7 0 01-3.5-.9L5 19.5zM9.5 9.2c.3 2.3 2.4 4.5 4.9 5.1l.9-1.2-1.6-.9-.7.6a4 4 0 01-2-2l.6-.7-.8-1.6-1.3.7z'),
    portal: P('M4 5h16v14H4zM4 9h16M8 13h4M8 16h7'),
    clock: C(12, 12, 8) + P('M12 8v4.2l2.6 1.8'),
    pin: P('M12 21s6.5-5.6 6.5-11a6.5 6.5 0 00-13 0c0 5.4 6.5 11 6.5 11z') + C(12, 10, 2.4),
    arrowUR: P('M8 16L16 8M9.5 8H16v6.5'),
    arrowUp: P('M12 18V6M7 11l5-5 5 5'), arrowDown: P('M12 6v12M7 13l5 5 5-5'), arrowR: P('M5 12h14M13 6l6 6-6 6'),
    file: P('M7 3.5h7l4 4V20.5H7zM14 3.5v4h4M9.5 12.5h5M9.5 16h5'),
    eye: P('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z') + C(12, 12, 2.5),
    edit: P('M5 19h3.5L18.5 9 15 5.5 5 15.5zM13 7.5l3.5 3.5'),
    trash: P('M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13'),
    play: P('M8 5.5v13l10-6.5z'), pause: P('M9 5.5v13M15 5.5v13'),
    shield: P('M12 3.5l7 3v5c0 4.4-3 7.8-7 9.5-4-1.7-7-5.1-7-9.5v-5z'),
    shieldCheck: P('M12 3.5l7 3v5c0 4.4-3 7.8-7 9.5-4-1.7-7-5.1-7-9.5v-5zM9 12l2.2 2.2L15.2 10'),
    alert: P('M12 4.5l8.5 15h-17zM12 10.5v4M12 17.2h.01'),
    info: C(12, 12, 8) + P('M12 11v5M12 8h.01'),
    menu: P('M4 7h16M4 12h16M4 17h16'),
    sidebar: P('M4 5h16v14H4zM9.5 5v14'),
    external: P('M14 4h6v6M20 4l-8.5 8.5M18 13.5V20H4V6h6.5'),
    refresh: P('M19.5 11.5a7.5 7.5 0 10-2.2 5.3M19.5 5v6.5H13'),
    logout: P('M10 5H5v14h5M14.5 8l4 4-4 4M18.5 12H9'),
    star: P('M12 4.2l2.3 4.8 5.3.7-3.9 3.6 1 5.2L12 16l-4.7 2.5 1-5.2-3.9-3.6 5.3-.7z'),
    kanban: P('M4.5 5h4v14h-4zM10 5h4v9h-4zM15.5 5h4v11h-4z'),
    list: P('M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01'),
    send: P('M4.5 11.5L20 4.5l-6.5 15.5-2.3-6.2z'),
    car: P('M5 16.5V12l2-5h10l2 5v4.5zM5 16.5V19M19 16.5V19M5 12h14M8 14.3h.01M16 14.3h.01'),
    rupee: P('M7 4.5h10M7 8.5h10M9.5 4.5c3.5 0 5 1.8 5 4s-1.7 4.2-5 4.2H7.5l7 7.3'),
    target: C(12, 12, 8) + C(12, 12, 4) + P('M12 12h.01'),
    image: P('M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.2h.01'),
    copy: P('M8.5 8.5h11v11h-11zM5 15.5V4.5h11'),
    lock: P('M6 11h12v9H6zM9 11V8a3 3 0 016 0v3'),
    grid: P('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'),
    route: C(6, 18, 2) + C(18, 6, 2) + P('M8 18h7.5a3 3 0 000-6h-7a3 3 0 010-6H16'),
    timer: C(12, 13, 7.5) + P('M12 9.5V13l2 1.5M10 3h4'),
    building2: P('M5 20V4.5h9V20M14 9h5v11M3.5 20h17M8 8h3M8 11.5h3M8 15h3'),
    book: P('M5 5.5A1.5 1.5 0 016.5 4H19v14H6.5A1.5 1.5 0 005 19.5zM5 19.5A1.5 1.5 0 006.5 21H19'),
    flag: P('M5.5 21V4.5M5.5 5h12l-2.5 4 2.5 4h-12')
  };
  RC.icon = function (name, cls) {
    return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.info) + '</svg>';
  };
  RC.icons = ICONS;

  /* ---------------- Formatting helpers ---------------- */
  RC.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  RC.n = function (x) { return Number(x).toLocaleString('en-IN'); };
  /* rupees -> "₹4,850" ; lakhs -> "₹82.5 L" ; crore */
  RC.inr = function (x) { return '₹' + Math.round(x).toLocaleString('en-IN'); };
  RC.lakh = function (l) {
    if (l >= 100) return '₹' + (l / 100).toFixed(l >= 1000 ? 1 : 2).replace(/\.?0+$/, '') + ' Cr';
    return '₹' + (Math.round(l * 10) / 10) + ' L';
  };
  RC.initials = function (name) {
    return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  };
  RC.av = function (name, cls) { return '<span class="av ' + (cls || '') + '">' + RC.initials(name) + '</span>'; };
  RC.pill = function (text, tone) { return '<span class="pill ' + (tone || '') + '">' + RC.esc(text) + '</span>'; };
  RC.delta = function (v, opts) {
    opts = opts || {};
    var good = opts.invert ? v < 0 : v > 0;
    var cls = v === 0 ? 'flat' : (good ? 'up' : 'down');
    return '<span class="delta ' + cls + '">' + RC.icon(v >= 0 ? 'arrowUp' : 'arrowDown') + Math.abs(v) + (opts.unit || '%') + '</span>';
  };
  RC.scoreBadge = function (s) {
    var c = s >= 75 ? 'hot' : s >= 50 ? 'warm' : 'cold';
    return '<span class="score ' + c + '" title="AI score">' + s + '</span>';
  };
  RC.statusTone = function (s) {
    var m = {
      Active: 'ok', Live: 'ok', Running: 'ok', Connected: 'ok', Verified: 'ok', Booked: 'ok', Completed: 'ok', Approved: 'ok', Confirmed: 'ok', Paid: 'ok', 'On track': 'ok', Healthy: 'ok', Published: 'ok', Passed: 'ok',
      Onboarding: 'warn', Paused: 'warn', 'Needs review': 'warn', Pending: 'warn', Draft: 'warn', 'Awaiting approval': 'warn', Learning: 'warn', 'At risk': 'warn', Held: 'warn', Rescheduled: 'warn', 'Token received': 'warn', Idle: '', 'Not connected': '',
      Lost: 'bad', Failed: 'bad', Blocked: 'bad', 'No-show': 'bad', Breached: 'bad', Rejected: 'bad', Error: 'bad', Behind: 'bad'
    };
    return m[s] == null ? 'info' : m[s];
  };
  RC.status = function (s) { return RC.pill(s, RC.statusTone(s)); };
  RC.pageHead = function (title, sub, actions) {
    return '<div class="page-head"><div><h1>' + title + '</h1>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>' +
      (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>';
  };
  RC.btn = function (label, opts) {
    opts = opts || {};
    var attrs = '';
    ['toast', 'drawer', 'arg', 'go', 'tone'].forEach(function (k) { if (opts[k] != null) attrs += ' data-' + k + '="' + RC.esc(opts[k]) + '"'; });
    if (opts.id) attrs += ' id="' + opts.id + '"';
    if (opts.local) attrs += ' data-local';
    return '<button class="btn ' + (opts.cls || '') + '"' + attrs + '>' + (opts.icon ? RC.icon(opts.icon) : '') + (label ? '<span>' + label + '</span>' : '') + '</button>';
  };
  RC.kpi = function (label, value, foot) {
    return '<div class="kpi"><div class="k-label">' + label + '</div><div class="k-value">' + value + '</div>' + (foot ? '<div class="k-foot">' + foot + '</div>' : '') + '</div>';
  };
  RC.client = function (id) { return (RC.data.clients.filter(function (c) { return c.id === id; })[0]) || {}; };
  RC.clientFilter = function (arr, key) {
    var c = RC.state.client;
    if (!c || c === 'all') return arr;
    key = key || 'client';
    return arr.filter(function (x) { return x[key] === c; });
  };
  RC.qs = function (sel, root) { return (root || document).querySelector(sel); };
  RC.qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------------- Screen registry + router ---------------- */
  RC.screen = function (key, def) { RC.screens[key] = def; };
  RC.go = function (hash) { if (location.hash === hash) RC.render(); else location.hash = hash; };

  var NAV = [
    { label: 'Overview', items: [['dashboard', 'Dashboard', 'dashboard']] },
    { label: 'Growth', items: [['clients', 'Clients', 'building'], ['projects', 'Projects & Inventory', 'layers'], ['microsites', 'Microsites', 'globe'], ['campaigns', 'Campaigns', 'megaphone']] },
    { label: 'Sales', items: [['leads', 'Leads', 'users', '46', 1], ['conversations', 'Conversations', 'chat', '12'], ['visits', 'Site Visits', 'calendar'], ['bookings', 'Bookings', 'filecheck'], ['automations', 'Automations', 'flow']] },
    { label: 'Network', items: [['partners', 'Channel Partners', 'link'], ['team', 'Team', 'team']] },
    { label: 'Intelligence', items: [['agents', 'AI Agents', 'chip', '7', 1], ['reports', 'Reports', 'chart']] },
    { label: 'Workspace', items: [['settings', 'Settings', 'sliders']] }
  ];
  RC.nav = NAV;

  function buildNav() {
    var html = NAV.map(function (g) {
      return '<div class="sb-group"><div class="sb-label">' + g.label + '</div>' + g.items.map(function (it) {
        return '<a class="sb-link" href="#/' + it[0] + '" data-key="' + it[0] + '" title="' + it[1] + '">' + RC.icon(it[2]) + '<span>' + it[1] + '</span>' +
          (it[3] ? '<em class="count' + (it[4] ? ' hot' : '') + '" style="font-style:normal">' + it[3] + '</em>' : '') + '</a>';
      }).join('') + '</div>';
    }).join('');
    RC.qs('#nav').innerHTML = html;
  }

  function parseHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean).map(decodeURIComponent);
    return { key: parts[0] || '', params: parts.slice(1) };
  }

  RC.render = function () {
    var r = parseHash();
    if (!r.key) {
      var authed = false;
      try { authed = localStorage.getItem('rc-auth') === '1'; } catch (e) {}
      location.replace('#/' + (authed ? 'dashboard' : 'login'));
      return;
    }
    var scr = RC.screens[r.key] || RC.screens.dashboard;
    RC.closeDrawer(true); closePopover(); closePalette();
    document.body.classList.remove('sb-open');
    if (r.key === 'login') {
      document.body.classList.add('is-auth');
      var auth = RC.qs('#auth');
      auth.innerHTML = scr.render(r.params);
      if (scr.mount) scr.mount(auth, r.params);
      document.title = 'Sign in · RealCognix OS';
      return;
    }
    document.body.classList.remove('is-auth');
    var view = RC.qs('#view');
    view.innerHTML = scr.render(r.params);
    if (scr.mount) scr.mount(view, r.params);
    RC.qsa('.sb-link').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-key') === r.key); });
    var navLabel = '';
    NAV.forEach(function (g) { g.items.forEach(function (it) { if (it[0] === r.key) navLabel = it[1]; }); });
    var crumb = scr.crumb ? scr.crumb(r.params) : null;
    RC.qs('#crumbs').innerHTML = crumb ? '<a href="#/' + r.key + '" class="muted">' + navLabel + '</a>' + RC.icon('chevR', 'sm') + '<b>' + RC.esc(crumb) + '</b>' : '<b>' + navLabel + '</b>';
    document.title = (crumb || navLabel || 'Dashboard') + ' · RealCognix OS';
    window.scrollTo(0, 0);
  };

  /* ---------------- Theme ---------------- */
  RC.getThemePref = function () { try { return localStorage.getItem('rc-theme') || 'system'; } catch (e) { return 'system'; } };
  RC.setTheme = function (pref) {
    try { localStorage.setItem('rc-theme', pref); } catch (e) {}
    applyTheme();
  };
  function applyTheme() {
    var pref = RC.getThemePref();
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var b = RC.qs('#themeBtn');
    if (b) { b.innerHTML = RC.icon(dark ? 'sun' : 'moon'); b.title = dark ? 'Switch to light' : 'Switch to dark'; }
    RC.qsa('[data-theme-opt]').forEach(function (el) { el.classList.toggle('active', el.getAttribute('data-theme-opt') === pref); });
  }
  RC.applyTheme = applyTheme;

  /* ---------------- Drawer ---------------- */
  RC.openDrawer = function (o) {
    var d = RC.qs('#drawer');
    d.className = 'drawer' + (o.wide ? ' wide' : '');
    d.innerHTML = '<div class="dr-head"><div style="min-width:0">' + (o.kicker ? '<div class="faint" style="font-size:12px;margin-bottom:2px">' + o.kicker + '</div>' : '') +
      '<h2>' + o.title + '</h2>' + (o.sub ? '<div class="sub">' + o.sub + '</div>' : '') + '</div>' +
      '<div class="row">' + (o.headActions || '') + '<button class="icon-btn" data-close data-local aria-label="Close">' + RC.icon('x') + '</button></div></div>' +
      '<div class="dr-body">' + (o.body || '') + '</div><div class="dr-foot">' + (o.foot || '') + '</div>';
    d.setAttribute('aria-hidden', 'false');
    RC.qs('#scrim').classList.add('open');
    requestAnimationFrame(function () { d.classList.add('open'); });
    if (o.mount) o.mount(d);
  };
  RC.closeDrawer = function (instant) {
    var d = RC.qs('#drawer');
    if (!d) return;
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
    RC.qs('#scrim').classList.remove('open');
  };
  RC.drawer = function (name, fn) { RC.drawers[name] = fn; };

  /* ---------------- Toast ---------------- */
  RC.toast = function (msg, opts) {
    opts = opts || {};
    var wrap = RC.qs('#toasts');
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = RC.icon(opts.icon || 'check') + '<span>' + msg + '</span>' + (opts.undo ? '<button data-local>Undo</button>' : '');
    wrap.appendChild(t);
    var kill = function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 200); };
    if (opts.undo) t.querySelector('button').onclick = function () { kill(); RC.toast('Reverted', { icon: 'refresh' }); };
    setTimeout(kill, opts.ms || 3200);
  };

  /* ---------------- Popover ---------------- */
  var popOwner = null;
  function openPopover(anchor, html, align) {
    var p = RC.qs('#popover');
    if (popOwner === anchor && p.classList.contains('open')) { closePopover(); return; }
    p.innerHTML = html;
    p.classList.add('open');
    var r = anchor.getBoundingClientRect();
    var w = p.offsetWidth;
    var left = align === 'left' ? r.left : r.right - w;
    p.style.left = Math.max(8, Math.min(left, window.innerWidth - w - 8)) + 'px';
    p.style.top = (r.bottom + 6) + 'px';
    popOwner = anchor;
  }
  function closePopover() { var p = RC.qs('#popover'); if (p) p.classList.remove('open'); popOwner = null; }
  RC.openPopover = openPopover; RC.closePopover = closePopover;

  /* ---------------- Command palette ---------------- */
  var palItems = [];
  function buildPalItems() {
    palItems = [];
    NAV.forEach(function (g) { g.items.forEach(function (it) { palItems.push({ t: it[1], s: 'Go to', icon: it[2], go: '#/' + it[0] }); }); });
    (RC.data.leads || []).slice(0, 30).forEach(function (l) { palItems.push({ t: l.name, s: 'Lead · ' + l.project, icon: 'users', go: '#/leads/' + l.id }); });
    (RC.data.projects || []).forEach(function (p) { palItems.push({ t: p.name, s: 'Project · ' + p.city, icon: 'layers', go: '#/projects/' + p.id }); });
    (RC.data.clients || []).forEach(function (c) { palItems.push({ t: c.name, s: 'Client · ' + c.city, icon: 'building', go: '#/clients' }); });
    palItems.push({ t: 'Toggle light / dark theme', s: 'Action', icon: 'moon', action: function () { RC.setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); } });
    palItems.push({ t: 'Add a new client', s: 'Action', icon: 'plus', action: function () { RC.go('#/clients'); setTimeout(function () { RC.drawers.onboard && RC.drawers.onboard(); }, 50); } });
  }
  var palSel = 0, palFiltered = [];
  function openPalette() {
    buildPalItems();
    var pal = RC.qs('#palette');
    pal.innerHTML = '<div class="pal-box" role="dialog" aria-label="Search"><div class="pal-input">' + RC.icon('search') +
      '<input id="palInput" placeholder="Search leads, projects, clients or jump to a page" autocomplete="off"><kbd>esc</kbd></div>' +
      '<div class="pal-list" id="palList"></div><div class="pal-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>↵</kbd> to open</span></div></div>';
    pal.classList.add('open');
    var input = RC.qs('#palInput');
    input.addEventListener('input', function () { palSel = 0; drawPal(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { palSel = Math.min(palSel + 1, palFiltered.length - 1); drawPal(input.value); e.preventDefault(); }
      if (e.key === 'ArrowUp') { palSel = Math.max(palSel - 1, 0); drawPal(input.value); e.preventDefault(); }
      if (e.key === 'Enter' && palFiltered[palSel]) runPal(palFiltered[palSel]);
    });
    palSel = 0; drawPal('');
    setTimeout(function () { input.focus(); }, 10);
  }
  function drawPal(q) {
    q = (q || '').toLowerCase().trim();
    palFiltered = palItems.filter(function (i) { return !q || (i.t + ' ' + i.s).toLowerCase().indexOf(q) > -1; }).slice(0, 12);
    RC.qs('#palList').innerHTML = palFiltered.length ? palFiltered.map(function (i, ix) {
      return '<button class="pop-item' + (ix === palSel ? ' sel' : '') + '" data-local data-pal="' + ix + '">' + RC.icon(i.icon) + '<span style="flex:1">' + RC.esc(i.t) + '</span><span class="faint" style="font-size:12px">' + RC.esc(i.s) + '</span></button>';
    }).join('') : '<div class="empty">No matches for “' + RC.esc(q) + '”</div>';
    RC.qsa('[data-pal]').forEach(function (b) { b.onclick = function () { runPal(palFiltered[+b.getAttribute('data-pal')]); }; });
  }
  function runPal(i) { closePalette(); if (i.action) i.action(); else RC.go(i.go); }
  function closePalette() { var p = RC.qs('#palette'); if (p) p.classList.remove('open'); }
  RC.openPalette = openPalette;

  /* ---------------- Global delegation ---------------- */
  function onClick(e) {
    var el = e.target.closest('[data-close],[data-toast],[data-drawer],[data-go],[data-tab],[data-seg],[data-theme-opt],button,.btn');
    if (!el) { if (!e.target.closest('#popover')) closePopover(); return; }
    if (!el.closest('#popover') && !el.closest('#bellBtn,#avatarBtn,#orgBtn')) closePopover();
    if (el.hasAttribute('data-close')) { RC.closeDrawer(); if (el.getAttribute('data-toast')) RC.toast(el.getAttribute('data-toast')); return; }
    if (el.hasAttribute('data-theme-opt')) { RC.setTheme(el.getAttribute('data-theme-opt')); RC.toast('Appearance set to ' + el.textContent.trim()); return; }
    if (el.hasAttribute('data-tab')) {
      var group = el.closest('[data-tabs]');
      if (group) {
        var key = el.getAttribute('data-tab');
        RC.qsa('[data-tab]', group).forEach(function (t) { if (t.closest('[data-tabs]') === group) t.classList.toggle('active', t === el); });
        RC.qsa('[data-pane]', group).forEach(function (p) { if (p.closest('[data-tabs]') === group) p.classList.toggle('active', p.getAttribute('data-pane') === key); });
      }
      return;
    }
    if (el.hasAttribute('data-seg')) {
      var seg = el.parentElement;
      RC.qsa('button', seg).forEach(function (b) { b.classList.toggle('active', b === el); });
      if (!el.hasAttribute('data-local') && !el.hasAttribute('data-toast')) return;
    }
    if (el.hasAttribute('data-drawer')) {
      var fn = RC.drawers[el.getAttribute('data-drawer')];
      if (fn) { fn(el.getAttribute('data-arg'), el); return; }
    }
    if (el.hasAttribute('data-go')) { RC.go(el.getAttribute('data-go')); return; }
    if (el.hasAttribute('data-toast')) {
      RC.toast(el.getAttribute('data-toast'), { icon: el.getAttribute('data-tone') || 'check' });
      if (el.closest('.drawer') && el.hasAttribute('data-then-close')) RC.closeDrawer();
      return;
    }
    if (el.hasAttribute('data-local') || el.type === 'submit' || el.closest('form[data-local]')) return;
    if (el.tagName === 'BUTTON' || el.classList.contains('btn')) {
      var label = (el.getAttribute('title') || el.textContent || '').trim();
      RC.toast((label || 'Action') + ' — done in the prototype', { icon: 'check' });
    }
  }

  RC.start = function () {
    if (document.documentElement.classList.contains('pre-collapsed')) document.body.classList.add('sb-collapsed');
    buildNav();
    RC.qs('#sbCollapse').innerHTML = RC.icon('sidebar');
    RC.qs('#menuBtn').innerHTML = RC.icon('menu');
    RC.qs('.ic-search').outerHTML = RC.icon('search');
    RC.qs('#bellBtn').innerHTML = RC.icon('bell') + '<span class="dot"></span>';
    var sel = RC.qs('#clientFilter');
    sel.innerHTML = '<option value="all">All clients</option>' + RC.data.clients.map(function (c) { return '<option value="' + c.id + '">' + RC.esc(c.short) + '</option>'; }).join('');
    try { RC.state.client = localStorage.getItem('rc-client') || 'all'; } catch (e) { RC.state.client = 'all'; }
    sel.value = RC.state.client;
    sel.addEventListener('change', function () {
      RC.state.client = sel.value;
      try { localStorage.setItem('rc-client', sel.value); } catch (e) {}
      RC.toast(sel.value === 'all' ? 'Showing all clients' : 'Filtered to ' + RC.client(sel.value).name, { icon: 'filter' });
      RC.render();
    });
    applyTheme();
    if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

    RC.qs('#sbCollapse').onclick = function () {
      document.body.classList.toggle('sb-collapsed');
      try { localStorage.setItem('rc-sb', document.body.classList.contains('sb-collapsed') ? '1' : '0'); } catch (e) {}
    };
    RC.qs('.sb-mark').addEventListener('click', function (e) {
      if (document.body.classList.contains('sb-collapsed')) { e.preventDefault(); document.body.classList.remove('sb-collapsed'); try { localStorage.setItem('rc-sb', '0'); } catch (x) {} }
    });
    RC.qs('#menuBtn').onclick = function () { document.body.classList.toggle('sb-open'); RC.qs('#scrim').classList.toggle('open', document.body.classList.contains('sb-open')); };
    RC.qs('#themeBtn').onclick = function () { RC.setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); };
    RC.qs('#searchBtn').onclick = openPalette;
    RC.qs('#scrim').onclick = function () { RC.closeDrawer(); document.body.classList.remove('sb-open'); };
    RC.qs('#palette').addEventListener('click', function (e) { if (e.target.id === 'palette') closePalette(); });

    RC.qs('#bellBtn').onclick = function (e) {
      var html = '<div class="pop-head">Notifications</div>' + RC.data.notifications.map(function (n) {
        return '<button class="pop-item" data-local data-go="' + n.go + '" style="align-items:flex-start;width:330px">' + RC.icon(n.icon) +
          '<span style="flex:1;white-space:normal"><span style="color:var(--text)">' + n.t + '</span><br><span class="faint" style="font-size:11.5px">' + n.m + '</span></span></button>';
      }).join('') + '<div class="pop-sep"></div><button class="pop-item" data-toast="All notifications marked as read">' + RC.icon('check') + 'Mark all as read</button>';
      openPopover(e.currentTarget, html);
    };
    RC.qs('#avatarBtn').onclick = function (e) {
      openPopover(e.currentTarget, '<div class="pop-head">Arjun Rao · arjun@realcognix.in</div>' +
        '<button class="pop-item" data-go="#/team">' + RC.icon('team') + 'Profile & availability</button>' +
        '<button class="pop-item" data-go="#/settings">' + RC.icon('sliders') + 'Settings</button>' +
        '<button class="pop-item" data-local id="popTheme">' + RC.icon('moon') + 'Toggle theme</button>' +
        '<div class="pop-sep"></div><button class="pop-item" data-local id="popOut">' + RC.icon('logout') + 'Sign out</button>');
      RC.qs('#popTheme').onclick = function () { closePopover(); RC.qs('#themeBtn').click(); };
      RC.qs('#popOut').onclick = function () { closePopover(); try { localStorage.removeItem('rc-auth'); } catch (x) {} RC.go('#/login'); };
    };
    RC.qs('#orgBtn').onclick = function (e) {
      openPopover(e.currentTarget, '<div class="pop-head">Workspaces</div>' +
        '<button class="pop-item" data-toast="You are in RealCognix Agency">' + RC.icon('check') + 'RealCognix Agency</button>' +
        '<button class="pop-item" data-toast="Client portal preview opens read-only for the builder" data-go="#/reports">' + RC.icon('eye') + 'Preview client portal</button>' +
        '<div class="pop-sep"></div><div class="pop-head">+91 90190 88160 · Bengaluru 560064</div>', 'left');
    };

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
      if (e.key === 'Escape') { RC.closeDrawer(); closePopover(); closePalette(); }
    });
    window.addEventListener('hashchange', RC.render);
    RC.render();
  };
})();
