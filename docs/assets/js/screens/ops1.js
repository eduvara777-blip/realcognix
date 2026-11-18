/* Automations, Site visits, Bookings, Channel partners */
(function () {
  var RC = window.RC;

  /* ---------- Automations ---------- */
  RC.screen('automations', {
    render: function (params) {
      var D = RC.data, cur = D.cadences.filter(function (c) { return c.id === params[0]; })[0] || D.cadences[0];
      var flow = '<div class="flow"><div class="flow-node trigger"><span class="fi">' + RC.icon('flag') + '</span><div><div class="fn-t">Trigger</div><div class="fn-s">' + cur.trigger + '</div></div></div>' +
        cur.steps.map(function (s, i) { return '<div class="flow-link"><span>' + (i ? 'then' : 'when') + '</span></div><div class="flow-node"><span class="fi">' + RC.icon(s[0]) + '</span><div><div class="fn-t">' + s[1] + '</div><div class="fn-s">' + s[2] + '</div></div></div>'; }).join('') +
        '<div class="flow-link"><span>stop when</span></div><div class="flow-node"><span class="fi">' + RC.icon('check') + '</span><div><div class="fn-t">Lead replies, books a visit or opts out</div><div class="fn-s">Consent and DND are checked before every step</div></div></div></div>';
      return RC.pageHead('Automations', 'Follow-up sequences, routing and the 5-minute rule', RC.btn('New sequence', { icon: 'plus', cls: 'primary' })) +
        '<div class="grid g-side"><div class="card"><div class="card-head"><div><h3>' + cur.name + '</h3><div class="sub">' + cur.leads + ' leads in sequence · reply rate ' + cur.reply + '</div></div><div class="row">' + RC.status(cur.status) + RC.btn(cur.status === 'Active' ? 'Pause' : 'Resume', { cls: 'sm', toast: cur.name + (cur.status === 'Active' ? ' paused' : ' resumed') }) + '</div></div><div class="card-body">' + flow + '</div></div>' +
        '<div class="stack"><div class="card"><div class="card-head"><h3>Sequences</h3></div><div class="list">' + D.cadences.map(function (c) {
          return '<div class="list-item click" data-go="#/automations/' + c.id + '"' + (c === cur ? ' style="background:var(--active)"' : '') + '><div class="li-main"><div class="li-title">' + c.name + '</div><div class="li-sub">' + c.leads + ' leads · ' + c.reply + ' reply</div></div>' + RC.status(c.status) + '</div>';
        }).join('') + '</div></div>' +
        '<div class="card"><div class="card-head"><h3>Routing and SLA rules</h3></div><div class="list">' + D.routingRules.map(function (r, i) { return '<div class="list-item"><span class="faint tnum" style="width:14px">' + (i + 1) + '</span><div class="li-main"><div class="li-title">' + r[0] + '</div><div class="li-sub">' + r[1] + '</div></div></div>'; }).join('') + '</div></div></div></div>';
    },
    crumb: function (params) { var c = RC.data.cadences.filter(function (x) { return x.id === params[0]; })[0]; return c ? c.name : null; }
  });

  /* ---------- Site visits ---------- */
  RC.screen('visits', {
    render: function () {
      var D = RC.data, days = ['Wed 18', 'Thu 19', 'Fri 20', 'Sat 21', 'Sun 22', 'Mon 23', 'Tue 24'], hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
      var cal = '<div class="cal"><div class="cal-h"></div>' + days.map(function (d, i) { return '<div class="cal-h' + (i ? '' : ' today') + '">' + d.split(' ')[0] + '<b>' + d.split(' ')[1] + '</b></div>'; }).join('');
      hours.forEach(function (h) {
        cal += '<div class="cal-t">' + (h > 12 ? h - 12 + ' pm' : h + (h === 12 ? ' pm' : ' am')) + '</div>';
        for (var d = 0; d < 7; d++) {
          var ev = D.visits.filter(function (v) { return v.day === d && v.h === h; })[0];
          cal += '<div class="cal-c">' + (ev ? '<div class="cal-ev ' + (ev.status === 'Rescheduled' ? 'a' : ev.mode === 'Video' ? '' : 't') + '" title="' + ev.lead + '"><b>' + ev.lead + '</b><span>' + ev.project.split(' ')[0] + ' · ' + ev.exec.split(' ')[0] + '</span></div>' : '') + '</div>';
        }
      });
      cal += '</div>';
      var today = D.visits.filter(function (v) { return v.day === 0; });
      return RC.pageHead('Site visits', 'This week · 13 booked · reminders and directions go out automatically', RC.btn('Visit check-in QR', { icon: 'grid' }) + RC.btn('Schedule visit', { icon: 'plus', cls: 'primary' })) +
        '<div class="kpis k4">' + RC.kpi('Visits this week', '13') + RC.kpi('Show-up rate', '82%', RC.delta(6)) + RC.kpi('Visit to booking', '13%') + RC.kpi('No-shows', '1', 'Auto follow-up sent') + '</div>' +
        '<div class="grid g-side" style="margin-top:16px"><div class="table-wrap">' + cal + '</div><div class="stack"><div class="card"><div class="card-head"><h3>Today</h3></div><div class="list">' + today.map(function (v) {
          return '<div class="list-item"><div class="li-main"><div class="li-title">' + v.lead + '</div><div class="li-sub">' + v.h + ':00 · ' + v.project + ' · ' + v.exec + '</div></div>' + RC.status(v.status) + '</div>';
        }).join('') + '</div></div><div class="card"><div class="card-head"><h3>Latest feedback</h3></div><div class="list">' + D.visitFeedback.map(function (f) {
          return '<div class="list-item"><div class="li-main"><div class="row between"><span class="li-title">' + f.lead + '</span>' + RC.pill(f.rating, f.rating === 'Hot' ? 'bad' : 'warn') + '</div><div class="li-sub">' + f.project + '</div><div style="font-size:12.5px;margin-top:4px">' + f.note + '</div></div></div>';
        }).join('') + '</div></div></div></div>';
    }
  });

  /* ---------- Bookings ---------- */
  RC.screen('bookings', {
    render: function () {
      var bs = RC.clientFilter(RC.data.bookings), total = bs.reduce(function (a, b) { return a + b.value; }, 0);
      return RC.pageHead('Bookings', 'From token to registration · documents and home loans tracked', RC.btn('Export', { icon: 'download' }) + RC.btn('Record booking', { icon: 'plus', cls: 'primary' })) +
        '<div class="kpis k4">' + RC.kpi('Bookings this month', bs.length) + RC.kpi('Booking value', RC.lakh(total)) + RC.kpi('Tokens received', RC.lakh(bs.reduce(function (a, b) { return a + b.token; }, 0))) + RC.kpi('Loans in process', bs.filter(function (b) { return /process|Applied/.test(b.loan); }).length) + '</div>' +
        '<div class="card" style="margin-top:16px"><div class="table-wrap"><table class="t"><thead><tr><th>Unit</th><th>Buyer</th><th class="num">Value</th><th class="num">Token</th><th>Status</th><th>Home loan</th><th>Documents</th><th>Date</th></tr></thead><tbody>' +
        bs.map(function (b) { return '<tr><td><div class="cell-main">' + b.unit + '</div><div class="cell-sub">' + b.project + '</div></td><td>' + b.buyer + '</td><td class="num">' + RC.lakh(b.value) + '</td><td class="num">' + RC.lakh(b.token) + '</td><td>' + RC.status(b.status) + '</td><td>' + b.loan + '</td><td><div class="row"><div class="meter teal" style="width:80px"><span style="width:' + b.docs + '%"></span></div><span class="faint tnum" style="font-size:12px">' + b.docs + '%</span></div></td><td class="muted">' + b.date + '</td></tr>'; }).join('') +
        '</tbody></table></div></div>';
    }
  });

  /* ---------- Channel partners ---------- */
  RC.screen('partners', {
    render: function () {
      var ps = RC.data.partners;
      return RC.pageHead('Channel partners', 'Registered brokers · lead registration with 90-day ownership · transparent payouts', RC.btn('Partner portal link', { icon: 'link', toast: 'Partner portal link copied' }) + RC.btn('Add partner', { icon: 'plus', cls: 'primary' })) +
        '<div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Partner</th><th>Agent RERA</th><th class="num">Leads</th><th class="num">Visits</th><th class="num">Bookings</th><th class="num">Payout due</th><th>Status</th><th></th></tr></thead><tbody>' +
        ps.map(function (p) { return '<tr><td><div class="cell-main">' + p.name + '</div><div class="cell-sub">' + p.city + '</div></td><td class="mono" style="font-size:12px">' + p.rera + '</td><td class="num">' + p.leads + '</td><td class="num">' + p.visits + '</td><td class="num">' + p.bookings + '</td><td class="num">' + (p.payout ? RC.lakh(p.payout) : '—') + '</td><td>' + RC.status(p.status) + '</td><td class="right">' + (p.payout ? RC.btn('Approve payout', { cls: 'sm', toast: 'Payout of ' + RC.lakh(p.payout) + ' sent for finance approval' }) : '') + '</td></tr>'; }).join('') +
        '</tbody></table></div></div><div class="note" style="margin-top:16px"><span class="note-label">RULE</span>A lead belongs to the partner who registered it first, for 90 days, unless the buyer already exists in the system. Duplicates are flagged before any payout.</div>';
    }
  });
})();
