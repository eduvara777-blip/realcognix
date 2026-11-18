(function () {
  var RC = window.RC;
  /* Sample model (demo mode). Live mode supplies the same shape as RC.data.dashboard (see live.js). */
  function demoModel(D) {
    return {
      title: 'Good morning, Arjun', sub: 'November 2026 · all clients · updated 2 min ago',
      kpis: [
        ['New leads', '1,284', RC.delta(18) + ' vs Oct'], ['Speed to lead', '3m 40s', RC.delta(-41, { invert: true }) + ' faster'],
        ['Site visits', '212', RC.delta(12) + ' vs Oct'], ['Bookings', '27', RC.delta(8) + ' vs Oct'],
        ['Cost per site visit', '₹4,850', RC.delta(-9, { invert: true })], ['Pipeline value', '₹96.4 Cr', 'Qualified and above']
      ],
      chartTitle: 'Leads and site visits', chartSub: 'Weekly, all clients', chartLegend: ['Leads', 'Site visits × 5'],
      weeks: ['Sep 28', 'Oct 5', 'Oct 12', 'Oct 19', 'Oct 26', 'Nov 2', 'Nov 9', 'Nov 16'],
      series: [{ values: [244, 270, 262, 305, 296, 330, 326, 352] }, { values: [150, 170, 160, 205, 200, 240, 245, 285] }],
      funnel: [['Leads', 1284], ['Qualified', 642], ['Site visits', 212], ['Negotiation', 61], ['Bookings', 27]],
      attn: [
        ['red', '3 hot leads not called in 5 minutes', 'Nandi Skyline · reassigning to Karthik S.', '#/leads'],
        ['amber', '5 approvals waiting for you', '4 creatives, 1 budget shift', '#/agents'],
        ['amber', 'Chamundi View cost per lead up 22%', 'Optimizer suggests narrowing to 15 km', '#/campaigns'],
        ['teal', 'Sahyog Ventures onboarding: RERA check pending', 'Step 3 of 5 · Meera P.', '#/clients'],
        ['teal', '9 visit reminders go out at 6 pm', 'For tomorrow’s site visits', '#/visits']
      ],
      sourcesSub: 'Share of 1,284 leads',
      sources: [['Meta', 41, '41%'], ['Google', 22, '22%'], ['99acres', 12, '12%'], ['MagicBricks', 9, '9%'], ['Housing.com', 6, '6%'], ['Website', 6, '6%'], ['Channel partners', 4, '4%']],
      feed: D.runlog.slice(0, 6).map(function (r) { return { t: r[1], m: RC.esc(r[2]), at: r[0] + ' · ' + r[3] }; }),
      clients: D.clients
    };
  }
  RC.screen('dashboard', {
    render: function () {
      var D = RC.data, C = RC.charts, m = D.dashboard || demoModel(D);
      var feed = m.feed.length ? m.feed.map(function (r) {
        return '<div class="feed-item"><span class="feed-ic">' + RC.icon('chip') + '</span><div><div class="ft"><b>' + r.t + '</b> · ' + r.m + '</div><div class="fm">' + r.at + '</div></div></div>';
      }).join('') : '<div class="empty">No agent runs yet</div>';
      var active = m.clients.filter(function (c) { return c.status === 'Active'; });
      return RC.pageHead(m.title, m.sub,
          RC.btn('Last 30 days', { icon: 'calendar', local: true, toast: 'Date range: last 30 days' }) + RC.btn('Add client', { icon: 'plus', cls: 'primary', drawer: 'onboard' })) +
        '<div class="kpis">' + m.kpis.map(function (k) { return RC.kpi(k[0], k[1], k[2]); }).join('') + '</div>' +
        '<div class="grid g-main" style="margin-top:16px">' +
        '<div class="card"><div class="card-head"><div><h3>' + m.chartTitle + '</h3><div class="sub">' + m.chartSub + '</div></div><div class="legend"><span><i style="background:var(--c1)"></i>' + m.chartLegend[0] + '</span><span><i style="background:var(--c2)"></i>' + m.chartLegend[1] + '</span></div></div>' +
        '<div class="card-body">' + C.line(m.weeks, m.series) + '</div></div>' +
        (m.funnel
          ? '<div class="card"><div class="card-head"><div><h3>Funnel this month</h3><div class="sub">Stage-to-stage conversion</div></div></div><div class="card-body">' + C.funnel(m.funnel) + '</div></div>'
          : '<div class="card"><div class="card-head"><div><h3>' + m.stagesTitle + '</h3><div class="sub">' + m.stagesSub + '</div></div></div><div class="card-body">' + (m.stages.length ? C.hbars(m.stages) : '<div class="empty">No leads yet</div>') + '</div></div>') +
        '</div>' +
        '<div class="grid g-3" style="margin-top:16px">' +
        '<div class="card"><div class="card-head"><h3>Needs attention</h3></div><div class="list">' + m.attn.map(function (a) {
          return '<div class="list-item click" data-go="' + a[3] + '"><span class="attn-ic ' + a[0] + '"></span><div class="li-main"><div class="li-title">' + a[1] + '</div><div class="li-sub">' + a[2] + '</div></div>' + RC.icon('chevR', 'sm') + '</div>';
        }).join('') + '</div></div>' +
        '<div class="card"><div class="card-head"><div><h3>Leads by source</h3><div class="sub">' + m.sourcesSub + '</div></div></div><div class="card-body">' +
        (m.sources.length ? C.hbars(m.sources) : '<div class="empty">No leads yet this month</div>') + '</div></div>' +
        '<div class="card"><div class="card-head"><h3>AI agent activity</h3>' + RC.btn('All agents', { cls: 'ghost sm', go: '#/agents' }) + '</div>' + feed + '</div></div>' +
        '<div class="section-title">Clients</div><div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Client</th><th>City</th><th class="num">Leads MTD</th><th class="num">Bookings</th><th>Account manager</th><th>Health</th></tr></thead><tbody>' +
        (active.length ? active.map(function (c) {
          return '<tr class="click" data-go="#/reports/' + RC.esc(c.id) + '"><td class="cell-main">' + RC.esc(c.name) + '</td><td>' + RC.esc(c.city) + '</td><td class="num">' + RC.n(c.leadsMTD) + '</td><td class="num">' + c.bookings + '</td><td>' + RC.esc(c.am) + '</td><td>' + RC.status(c.health) + '</td></tr>';
        }).join('') : '<tr><td colspan="6"><div class="empty">No active clients yet</div></td></tr>') + '</tbody></table></div></div>';
    },
    mount: function (root) {
      RC.qsa('tr[data-go]', root).forEach(function (tr) { tr.onclick = function () { RC.go(tr.getAttribute('data-go')); }; });
    }
  });
})();
