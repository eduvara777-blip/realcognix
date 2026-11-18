(function () {
  var RC = window.RC;
  RC.screen('dashboard', {
    render: function () {
      var D = RC.data, C = RC.charts;
      var weeks = ['Sep 28', 'Oct 5', 'Oct 12', 'Oct 19', 'Oct 26', 'Nov 2', 'Nov 9', 'Nov 16'];
      var attn = [
        ['red', '3 hot leads not called in 5 minutes', 'Nandi Skyline · reassigning to Karthik S.', '#/leads'],
        ['amber', '5 approvals waiting for you', '4 creatives, 1 budget shift', '#/agents'],
        ['amber', 'Chamundi View cost per lead up 22%', 'Optimizer suggests narrowing to 15 km', '#/campaigns'],
        ['teal', 'Sahyog Ventures onboarding: RERA check pending', 'Step 3 of 5 · Meera P.', '#/clients'],
        ['teal', '9 visit reminders go out at 6 pm', 'For tomorrow’s site visits', '#/visits']
      ];
      var feed = D.runlog.slice(0, 6).map(function (r) {
        return '<div class="feed-item"><span class="feed-ic">' + RC.icon('chip') + '</span><div><div class="ft"><b>' + r[1] + '</b> · ' + RC.esc(r[2]) + '</div><div class="fm">' + r[0] + ' · ' + r[3] + '</div></div></div>';
      }).join('');
      return RC.pageHead('Good morning, Arjun', 'November 2026 · all clients · updated 2 min ago',
          RC.btn('Last 30 days', { icon: 'calendar', local: true, toast: 'Date range: last 30 days' }) + RC.btn('Add client', { icon: 'plus', cls: 'primary', drawer: 'onboard' })) +
        '<div class="kpis">' +
        RC.kpi('New leads', '1,284', RC.delta(18) + ' vs Oct') +
        RC.kpi('Speed to lead', '3m 40s', RC.delta(-41, { invert: true }) + ' faster') +
        RC.kpi('Site visits', '212', RC.delta(12) + ' vs Oct') +
        RC.kpi('Bookings', '27', RC.delta(8) + ' vs Oct') +
        RC.kpi('Cost per site visit', '₹4,850', RC.delta(-9, { invert: true })) +
        RC.kpi('Pipeline value', '₹96.4 Cr', 'Qualified and above') + '</div>' +
        '<div class="grid g-main" style="margin-top:16px">' +
        '<div class="card"><div class="card-head"><div><h3>Leads and site visits</h3><div class="sub">Weekly, all clients</div></div><div class="legend"><span><i style="background:var(--c1)"></i>Leads</span><span><i style="background:var(--c2)"></i>Site visits × 5</span></div></div>' +
        '<div class="card-body">' + C.line(weeks, [{ values: [244, 270, 262, 305, 296, 330, 326, 352] }, { values: [150, 170, 160, 205, 200, 240, 245, 285] }]) + '</div></div>' +
        '<div class="card"><div class="card-head"><div><h3>Funnel this month</h3><div class="sub">Stage-to-stage conversion</div></div></div><div class="card-body">' +
        C.funnel([['Leads', 1284], ['Qualified', 642], ['Site visits', 212], ['Negotiation', 61], ['Bookings', 27]]) + '</div></div></div>' +
        '<div class="grid g-3" style="margin-top:16px">' +
        '<div class="card"><div class="card-head"><h3>Needs attention</h3></div><div class="list">' + attn.map(function (a) {
          return '<div class="list-item click" data-go="' + a[3] + '"><span class="attn-ic ' + a[0] + '"></span><div class="li-main"><div class="li-title">' + a[1] + '</div><div class="li-sub">' + a[2] + '</div></div>' + RC.icon('chevR', 'sm') + '</div>';
        }).join('') + '</div></div>' +
        '<div class="card"><div class="card-head"><div><h3>Leads by source</h3><div class="sub">Share of 1,284 leads</div></div></div><div class="card-body">' +
        C.hbars([['Meta', 41, '41%'], ['Google', 22, '22%'], ['99acres', 12, '12%'], ['MagicBricks', 9, '9%'], ['Housing.com', 6, '6%'], ['Website', 6, '6%'], ['Channel partners', 4, '4%']]) + '</div></div>' +
        '<div class="card"><div class="card-head"><h3>AI agent activity</h3>' + RC.btn('All agents', { cls: 'ghost sm', go: '#/agents' }) + '</div>' + feed + '</div></div>' +
        '<div class="section-title">Clients</div><div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Client</th><th>City</th><th class="num">Leads MTD</th><th class="num">Bookings</th><th>Account manager</th><th>Health</th></tr></thead><tbody>' +
        D.clients.filter(function (c) { return c.status === 'Active'; }).map(function (c) {
          return '<tr class="click" data-go="#/reports/' + c.id + '"><td class="cell-main">' + c.name + '</td><td>' + c.city + '</td><td class="num">' + RC.n(c.leadsMTD) + '</td><td class="num">' + c.bookings + '</td><td>' + c.am + '</td><td>' + RC.status(c.health) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    },
    mount: function (root) {
      RC.qsa('tr[data-go]', root).forEach(function (tr) { tr.onclick = function () { RC.go(tr.getAttribute('data-go')); }; });
    }
  });
})();
