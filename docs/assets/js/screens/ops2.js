/* Team, AI agents, Reports, Settings */
(function () {
  var RC = window.RC;

  RC.screen('team', {
    render: function () {
      var t = RC.data.team, ranked = t.slice().sort(function (a, b) { return b.bookings - a.bookings || b.visits - a.visits; });
      return RC.pageHead('Team', t.length + ' people · languages and territories drive lead routing', RC.btn('Invite member', { icon: 'plus', cls: 'primary' })) +
        '<div class="grid g-side"><div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Member</th><th>Languages</th><th>Territory</th><th class="num">Active leads</th><th class="num">5-min SLA</th><th class="num">Calls today</th><th>Status</th></tr></thead><tbody>' +
        t.map(function (m) { return '<tr><td><span class="row">' + RC.av(m.name) + '<span><div class="cell-main">' + m.name + '</div><div class="cell-sub">' + m.role + '</div></span></span></td><td>' + m.langs + '</td><td>' + m.territory + '</td><td class="num">' + m.active + '</td><td class="num">' + (m.sla < 90 ? '<span style="color:var(--amber-text)">' + m.sla + '%</span>' : m.sla + '%') + '</td><td class="num">' + m.calls + '</td><td>' + RC.pill(m.status, m.status === 'Available' ? 'ok' : m.status === 'Off shift' ? '' : 'info') + '</td></tr>'; }).join('') +
        '</tbody></table></div></div><div class="card"><div class="card-head"><div><h3>Leaderboard</h3><div class="sub">November · bookings, then visits</div></div></div><div class="list">' +
        ranked.map(function (m, i) { return '<div class="list-item"><span class="num faint" style="width:16px">' + (i + 1) + '</span>' + RC.av(m.name, 'sm') + '<div class="li-main"><div class="li-title">' + m.name + '</div><div class="li-sub">' + m.visits + ' visits</div></div><b class="num">' + m.bookings + '</b></div>'; }).join('') + '</div></div></div>';
    }
  });

  RC.screen('agents', {
    render: function () {
      var D = RC.data, models = ['Llama 3.1 8B · Ollama', 'Llama 3.1 70B · Groq', 'Gemini Flash · free tier', 'Rules · no LLM', 'Rules + Llama 3.1 8B', 'Any OpenAI-compatible · LiteLLM'];
      return RC.pageHead('AI agents', 'Ten agents do the groundwork. Anything that spends money or reaches buyers waits for a person.', RC.btn('Run log', { icon: 'list', local: true, id: 'toLog' })) +
        '<div class="section-title" style="margin-top:0">Waiting for your approval <span class="faint" style="font-size:12px">' + D.approvals.length + '</span></div><div class="card"><div class="list">' + (D.approvals.length ? '' : '<div class="empty">Nothing is waiting for approval</div>') + D.approvals.map(function (a) {
          var acts = a.id
            ? '<button class="btn sm" data-local data-approval="' + RC.esc(a.id) + '" data-decision="rejected"><span>Reject</span></button><button class="btn sm primary" data-local data-approval="' + RC.esc(a.id) + '" data-decision="approved"><span>Approve</span></button>'
            : RC.btn('Reject', { cls: 'sm', toast: 'Rejected · agent notified', tone: 'x' }) + RC.btn('Approve', { cls: 'sm primary', toast: 'Approved: ' + a.what });
          return '<div class="list-item"><span class="attn-ic amber"></span><div class="li-main"><div class="li-title">' + a.what + '</div><div class="li-sub">' + a.agent + ' · ' + a.impact + '</div></div><div class="row">' + RC.btn('Review', { cls: 'sm ghost', go: a.go }) + acts + '</div></div>';
        }).join('') + '</div></div>' +
        '<div class="section-title">Agents' + RC.demoTag() + '</div><div class="grid g-3">' + D.agents.map(function (a) {
          return '<div class="card int-card"><div class="row between"><span class="row"><span class="int-logo">' + RC.icon(a.icon) + '</span><b>' + a.name + '</b></span>' + RC.status(a.status) + '</div><div class="muted" style="font-size:12.5px;min-height:38px">' + a.job + '</div>' +
            '<div class="row between" style="font-size:12px"><span class="faint">' + a.runs + ' runs today' + (a.pending ? ' · ' + a.pending + ' pending' : '') + '</span></div>' +
            '<select class="select" data-agent="' + a.name + '">' + models.map(function (m) { return '<option' + (m === a.model ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></div>';
        }).join('') + '</div>' +
        '<div class="section-title" id="runlog">Run log' + RC.demoTag() + '</div><div class="card"><div class="table-wrap"><table class="t compact"><thead><tr><th>Time</th><th>Agent</th><th>What it did</th><th>Model</th><th class="num">Took</th></tr></thead><tbody>' +
        D.runlog.map(function (r) { return '<tr><td class="mono" style="font-size:12px">' + r[0] + '</td><td>' + r[1] + '</td><td class="cell-main" style="white-space:normal">' + RC.esc(r[2]) + '</td><td class="muted">' + r[3] + '</td><td class="num">' + r[4] + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    },
    mount: function (root) {
      RC.qsa('select[data-agent]', root).forEach(function (s) { s.addEventListener('change', function () { RC.toast(s.getAttribute('data-agent') + ' now uses ' + s.value, { icon: 'refresh' }); }); });
      RC.qs('#toLog').onclick = function () { RC.qs('#runlog').scrollIntoView({ behavior: 'smooth' }); };
    }
  });

  RC.screen('reports', {
    render: function (params) {
      var D = RC.data, id = params[0] && D.reports[params[0]] ? params[0] : (D.reports[RC.state.client] ? RC.state.client : 'ccd'), r = D.reports[id], c = RC.client(id);
      var wk = ['Sep 28', 'Oct 5', 'Oct 12', 'Oct 19', 'Oct 26', 'Nov 2', 'Nov 9', 'Nov 16'];
      return RC.pageHead('Weekly report', c.name + ' · week ending 16 Nov 2026', '<select class="select inline" id="repClient">' + Object.keys(D.reports).map(function (k) { return '<option value="' + k + '"' + (k === id ? ' selected' : '') + '>' + RC.client(k).name + '</option>'; }).join('') + '</select>' + RC.btn('Export PDF', { icon: 'download' }) + RC.btn('Share with client', { icon: 'share', cls: 'primary', toast: 'Report shared to the client portal' })) +
        '<div class="kpis">' + RC.kpi('Spend (month)', RC.lakh(r.spend)) + RC.kpi('Leads', RC.n(r.leads)) + RC.kpi('Cost per lead', RC.inr(r.cpl)) + RC.kpi('Qualified', r.qual + '%') + RC.kpi('Site visits', r.visits, RC.inr(r.cpv) + ' each') + RC.kpi('Bookings', r.bookings, 'Return ' + r.roas + '× spend') + '</div>' +
        '<div class="note ai" style="margin-top:16px"><span class="note-label">REPORTING AGENT · SUMMARY</span>' + r.summary + '</div>' +
        '<div class="grid g-2" style="margin-top:16px"><div class="card"><div class="card-head"><div><h3>Leads per week</h3><div class="sub">Last 8 weeks</div></div></div><div class="card-body">' + RC.charts.bars(wk, [{ values: r.weeks }]) + '</div></div>' +
        '<div class="card"><div class="card-head"><div><h3>Site visits per week</h3><div class="sub">Last 8 weeks</div></div></div><div class="card-body">' + RC.charts.line(wk, [{ values: r.visitsW }]) + '</div></div></div>' +
        '<div class="section-title">Where buyers came from</div><div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Channel</th><th class="num">Share of leads</th><th class="num">Share of visits</th><th class="num">Share of bookings</th></tr></thead><tbody>' +
        D.attribution.map(function (a) { return '<tr><td class="cell-main">' + a[0] + '</td><td class="num">' + a[1] + '%</td><td class="num">' + a[2] + '%</td><td class="num">' + a[3] + '%</td></tr>'; }).join('') + '</tbody></table></div><div class="card-foot"><span class="faint" style="font-size:12px">First-touch attribution, matched on phone number across ads, portals and walk-ins.</span></div></div>';
    },
    mount: function (root) { RC.qs('#repClient').addEventListener('change', function (e) { RC.go('#/reports/' + e.target.value); }); },
    crumb: function (params) { return params[0] && RC.data.reports[params[0]] ? RC.client(params[0]).short : null; }
  });

  RC.screen('settings', {
    render: function () {
      var D = RC.data, pref = RC.getThemePref();
      return RC.pageHead('Settings', 'Workspace, integrations, compliance and appearance') +
        '<div data-tabs><div class="tabs"><button class="tab active" data-tab="i">Integrations</button><button class="tab" data-tab="c">Compliance</button><button class="tab" data-tab="w">Workspace</button><button class="tab" data-tab="a">Appearance</button></div>' +
        '<div data-pane="i" class="active">' + D.integrations.map(function (g) {
          return '<div class="section-title" style="margin-top:8px">' + g.group + '</div><div class="grid g-4">' + g.items.map(function (it) {
            return '<div class="card int-card"><div class="row between"><span class="int-logo">' + RC.initials(it[0]) + '</span>' + RC.status(it[2] ? 'Connected' : 'Not connected') + '</div><div><b>' + it[0] + '</b><div class="muted" style="font-size:12px">' + it[1] + '</div></div>' + RC.btn(it[2] ? 'Configure' : 'Connect', { cls: 'sm' + (it[2] ? '' : ' primary'), toast: it[2] ? it[0] + ' settings opened' : it[0] + ' connection started' }) + '</div>';
          }).join('') + '</div>';
        }).join('') + '<p class="faint" style="font-size:12px;margin-top:16px">Every vendor sits behind an adapter. Swapping a model or a messaging provider is a settings change, not a rebuild.</p></div>' +
        '<div data-pane="c"><div class="card"><div class="list">' +
        [['Show RERA number and QR on every ad, page and brochure', true], ['Record consent with every form lead (DPDP Act, 2023)', true], ['Check DND before calls and SMS', true], ['Quiet hours: no messages or calls 9 pm to 9 am buyer time', true], ['Block assured-return and “guaranteed” claims in creatives', true], ['Auto-delete leads 24 months after last contact', false]].map(function (s) {
          return '<div class="list-item" style="align-items:center"><div class="li-main"><div class="li-title">' + s[0] + '</div></div><label class="switch"><input type="checkbox"' + (s[1] ? ' checked' : '') + '><span></span></label></div>';
        }).join('') + '</div></div><div class="field" style="margin-top:16px"><label>Consent text shown on forms</label><textarea class="input">I agree to be contacted by the developer and RealCognix on call, WhatsApp and email about this project. I can withdraw consent any time by replying STOP.</textarea></div></div>' +
        '<div data-pane="w"><div class="card"><div class="card-body"><div class="form-grid"><div class="field"><label>Company</label><input class="input" value="RealCognix"></div><div class="field"><label>Tagline</label><input class="input" value="Real Intelligence, Real Growth"></div><div class="field"><label>Phone</label><input class="input" value="+91 90190 88160"></div><div class="field"><label>Address</label><input class="input" value="Bengaluru 560064"></div><div class="field"><label>Time zone</label><select class="select"><option>Asia/Kolkata (IST)</option></select></div><div class="field"><label>Currency</label><select class="select"><option>Indian rupee (₹, lakh and crore)</option></select></div></div></div><div class="card-foot"><span></span>' + RC.btn('Save', { cls: 'primary', toast: 'Workspace saved' }) + '</div></div></div>' +
        '<div data-pane="a"><div class="card"><div class="card-body"><div class="label" style="margin-bottom:8px">Theme</div><div class="seg"><button data-theme-opt="light" class="' + (pref === 'light' ? 'active' : '') + '">Light</button><button data-theme-opt="dark" class="' + (pref === 'dark' ? 'active' : '') + '">Dark</button><button data-theme-opt="system" class="' + (pref === 'system' ? 'active' : '') + '">System</button></div></div></div></div></div>';
    }
  });
})();
