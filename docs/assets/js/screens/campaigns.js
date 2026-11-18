(function () {
  var RC = window.RC;
  RC.screen('campaigns', {
    render: function () {
      var cs = RC.clientFilter(RC.data.campaigns), cr = RC.data.creatives;
      var spend = cs.reduce(function (a, c) { return a + c.spend; }, 0), leads = cs.reduce(function (a, c) { return a + c.leads; }, 0), visits = cs.reduce(function (a, c) { return a + c.visits; }, 0);
      return RC.pageHead('Campaigns', 'Meta, Google, YouTube, portals and WhatsApp in one place · judged on cost per site visit', RC.btn('Sync now', { icon: 'refresh', toast: 'Synced Meta and Google · 2 min ago' }) + RC.btn('New campaign', { icon: 'plus', cls: 'primary' })) +
        '<div class="kpis k4">' + RC.kpi('Spend this month', RC.lakh(spend / 100000)) + RC.kpi('Leads', RC.n(leads)) + RC.kpi('Cost per lead', RC.inr(spend / (leads || 1))) + RC.kpi('Cost per site visit', RC.inr(spend / (visits || 1)), visits + ' visits') + '</div>' +
        '<div data-tabs style="margin-top:20px"><div class="tabs"><button class="tab active" data-tab="a">Campaigns <span class="count">' + cs.length + '</span></button><button class="tab" data-tab="b">Creative approvals <span class="count">' + cr.length + '</span></button></div>' +
        '<div data-pane="a" class="active"><div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Campaign</th><th>Channel</th><th>Status</th><th class="num">Spend</th><th class="num">Leads</th><th class="num">CPL</th><th class="num">Qualified</th><th class="num">Visits</th><th class="num">Cost / visit</th><th>AI suggestion</th></tr></thead><tbody>' +
        cs.map(function (c) {
          return '<tr><td><div class="cell-main">' + RC.esc(c.name) + '</div><div class="cell-sub">' + RC.client(c.client).short + '</div></td><td>' + c.channel + '</td><td>' + RC.status(c.status) + '</td><td class="num">' + RC.inr(c.spend) + '</td><td class="num">' + c.leads + '</td><td class="num">' + RC.inr(c.cpl) + '</td><td class="num">' + c.qualPct + '%</td><td class="num">' + c.visits + '</td><td class="num">' + RC.inr(c.cpv) + '</td><td>' +
            (c.suggestion ? '<button class="suggest" data-toast="Sent for your approval in AI Agents" title="' + RC.esc(c.suggestion) + '"><b>AI</b>' + RC.esc(c.suggestion) + '</button>' : '<span class="faint">—</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>' +
        '<p class="faint" style="font-size:12px;margin-top:10px">Housing ads run under Meta’s special ad category, so targeting by age, gender and narrow postcodes is limited. Budget changes always wait for your approval.</p></div>' +
        '<div data-pane="b"><div class="grid g-2">' + cr.map(function (c) {
          var blocked = c.check === 'Blocked';
          return '<div class="card"><div class="card-head"><div><h3>' + c.project + '</h3><div class="sub">' + c.type + ' · ' + c.by + '</div></div>' + RC.status(blocked ? 'Blocked' : 'Awaiting approval') + '</div><div class="card-body"><div style="font-family:var(--font-display);font-size:16px;margin-bottom:6px">' + RC.esc(c.headline) + '</div><div class="muted">' + RC.esc(c.body) + '</div>' +
            '<div class="note ' + (blocked ? 'warn' : 'ai') + '" style="margin-top:12px"><span class="note-label">COMPLIANCE GUARD</span>' + (blocked ? RC.esc(c.reason) : 'RERA number present, price matches the price list, no prohibited claims.') + '</div></div>' +
            '<div class="card-foot"><span class="faint" style="font-size:12px">Languages: English, Kannada, Hindi</span><div class="row">' + RC.btn('Edit', { cls: 'sm ghost', icon: 'edit' }) + (blocked ? RC.btn('Rewrite with AI', { cls: 'sm', toast: 'Creative agent is rewriting without the claim' }) : RC.btn('Approve', { cls: 'sm primary', toast: 'Approved · scheduled to go live at 6 pm' })) + '</div></div></div>';
        }).join('') + '</div></div></div>';
    }
  });
})();
