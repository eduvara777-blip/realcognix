(function () {
  var RC = window.RC;
  var STAGES = ['New', 'Contacted', 'Qualified', 'Visit scheduled', 'Visited', 'Negotiation', 'Booked', 'Lost'];
  var view = 'table', q = '', src = 'all';
  function lead(id) { return RC.data.leads.filter(function (l) { return l.id === id; })[0]; }
  function filtered() {
    return RC.clientFilter(RC.data.leads).filter(function (l) {
      return (!q || (l.name + ' ' + l.project + ' ' + (l.ref || l.id)).toLowerCase().indexOf(q) > -1) && (src === 'all' || l.source === src);
    });
  }
  function sla(l) {
    if (l.slaMins == null) return '<span class="faint">—</span>';
    return l.slaMins >= 5 ? RC.pill('Overdue ' + l.slaMins + 'm', 'bad') : RC.pill((5 - l.slaMins) + 'm left', 'warn');
  }
  function money(l) { return l.budget ? RC.lakh(l.budget) : '—'; }
  function table(ls) {
    return '<div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Lead</th><th>Project</th><th class="num">Score</th><th>Stage</th><th>Source</th><th class="num">Budget</th><th>Owner</th><th>Call due</th><th>Created</th></tr></thead><tbody>' +
      (ls.length ? '' : '<tr><td colspan="9"><div class="empty">No leads match</div></td></tr>') +
      ls.map(function (l) {
        return '<tr class="click" data-drawer="lead" data-arg="' + RC.esc(l.id) + '"><td><div class="cell-main">' + RC.esc(l.name) + (l.nri ? ' ' + RC.pill('NRI', 'info nodot') : '') + '</div><div class="cell-sub">' + RC.esc(l.phone) + ' · ' + l.bhk + '</div></td><td>' + RC.esc(l.project) + '</td><td class="num">' + RC.scoreBadge(l.score) + '</td><td>' + RC.status(l.stage) + '</td><td>' + RC.esc(l.source) + '</td><td class="num">' + money(l) + '</td><td><span class="row">' + RC.av(l.owner, 'sm') + RC.esc(l.owner) + '</span></td><td>' + sla(l) + '</td><td class="muted">' + l.created + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  function kanban(ls) {
    return '<div class="kanban">' + STAGES.map(function (s) {
      var col = ls.filter(function (l) { return l.stage === s; });
      return '<div class="kb-col" data-stage="' + s + '"><div class="kb-head"><span>' + s + '</span><span class="muted">' + col.length + '</span></div><div class="kb-cards">' + col.map(function (l) {
        return '<div class="kb-card" draggable="true" data-id="' + RC.esc(l.id) + '"><div class="kc-top"><span class="kc-name">' + RC.esc(l.name) + '</span>' + RC.scoreBadge(l.score) + '</div><div class="kc-sub">' + RC.esc(l.project) + ' · ' + l.bhk + ' · ' + money(l) + '</div><div class="kc-foot"><span>' + RC.esc(l.source) + '</span>' + RC.av(l.owner, 'sm') + '</div></div>';
      }).join('') + '</div></div>';
    }).join('') + '</div>';
  }
  function body() { var ls = filtered(); return view === 'table' ? table(ls) : kanban(ls); }

  RC.screen('leads', {
    render: function () {
      var all = RC.clientFilter(RC.data.leads);
      var hot = all.filter(function (l) { return l.score >= 75; }).length, overdue = all.filter(function (l) { return l.slaMins >= 5; }).length;
      var sources = ['all'].concat(RC.data.leads.map(function (l) { return l.source; }).filter(function (s, i, a) { return a.indexOf(s) === i; }));
      return RC.pageHead('Leads', all.length + ' lead' + (all.length === 1 ? '' : 's') + ' shown · ' + hot + ' hot · ' + overdue + ' past the 5-minute call rule', RC.btn('Import CSV', { icon: 'upload' }) + RC.btn('Add lead', { icon: 'plus', cls: 'primary' })) +
        '<div class="toolbar"><div class="input-wrap">' + RC.icon('search') + '<input class="input" id="leadQ" placeholder="Search name, project or ID" value="' + RC.esc(q) + '"></div>' +
        '<select class="select inline" id="leadSrc">' + sources.map(function (s) { return '<option value="' + RC.esc(s) + '"' + (s === src ? ' selected' : '') + '>' + (s === 'all' ? 'All sources' : RC.esc(s)) + '</option>'; }).join('') + '</select>' +
        '<div class="tb-spacer" style="flex:1"></div><div class="seg" id="leadView"><button data-seg data-local data-v="table" class="' + (view === 'table' ? 'active' : '') + '">' + RC.icon('list') + ' Table</button><button data-seg data-local data-v="kanban" class="' + (view === 'kanban' ? 'active' : '') + '">' + RC.icon('kanban') + ' Pipeline</button></div></div>' +
        '<div id="leadBody">' + body() + '</div>';
    },
    mount: function (root, params) {
      function redraw() { var b = RC.qs('#leadBody'); if (!b) return; b.innerHTML = body(); wire(); }
      RC.state.leadsRedraw = redraw;
      function wire() {
        var dragId = null;
        RC.qsa('.kb-card', root).forEach(function (c) {
          c.addEventListener('click', function () { RC.drawers.lead(c.getAttribute('data-id')); });
          c.addEventListener('dragstart', function () { dragId = c.getAttribute('data-id'); });
        });
        RC.qsa('.kb-col', root).forEach(function (col) {
          col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('drop'); });
          col.addEventListener('dragleave', function () { col.classList.remove('drop'); });
          col.addEventListener('drop', function (e) {
            e.preventDefault(); var l = lead(dragId); if (!l) { redraw(); return; }
            var to = col.getAttribute('data-stage'), from = l.stage;
            if (to === from) { redraw(); return; }
            l.stage = to;
            if (RC.live.on()) {
              RC.live.setStage(l.id, to).then(function () { RC.toast(RC.esc(l.name) + ' moved to ' + to); }, function () { l.stage = from; redraw(); RC.toast('Could not move ' + RC.esc(l.name), { icon: 'alert' }); });
            } else RC.toast(RC.esc(l.name) + ' moved to ' + l.stage, { undo: true });
            redraw();
          });
        });
      }
      RC.qs('#leadQ').addEventListener('input', function (e) { q = e.target.value.toLowerCase(); redraw(); });
      RC.qs('#leadSrc').addEventListener('change', function (e) { src = e.target.value; redraw(); });
      RC.qsa('#leadView button').forEach(function (b) { b.addEventListener('click', function () { view = b.getAttribute('data-v'); redraw(); }); });
      wire();
      if (params[0] && lead(params[0])) setTimeout(function () { RC.drawers.lead(params[0]); }, 30);
    }
  });

  RC.drawer('lead', function (id) {
    if (RC.live.on()) {
      RC.live.leadDetail(id).then(openLead, function () { RC.toast('Could not load this lead', { icon: 'alert' }); });
      return;
    }
    var l = lead(id); if (l) openLead(l);
  });
  function openLead(l) {
    if (l.ref) RC.state.convSel = l.id;
    var tl = l.timelineHtml || RC.data.leadTimeline.map(function (t) {
      var s = t.t.replace('{source}', l.source).replace('{score}', l.score).replace('{owner}', l.owner).replace('{lang}', l.lang);
      return '<div class="tl-item ' + t.cls + '"><div class="tt">' + s + '</div><div class="tm">' + t.m.replace('{created}', l.created) + '</div></div>';
    }).join('');
    var nba = l.score >= 75 ? 'Call now and offer a site visit this Saturday at 11 am. Mention the 3 BHK Signature on a higher floor, which fits the budget.' : l.score >= 50 ? 'Send the floor plan on WhatsApp and ask one question: self use or investment?' : 'Keep in the monthly nurture. Re-score if they reply.';
    RC.openDrawer({ kicker: RC.esc((l.ref || l.id) + ' · ' + l.source), title: RC.esc(l.name), sub: RC.esc(l.project + ' · ' + (l.clientName || RC.client(l.client).name || '—')),
      headActions: RC.btn('', { icon: 'phone', cls: 'sm', toast: 'Calling ' + l.phone + ' via click-to-call' }) + RC.btn('', { icon: 'whatsapp', cls: 'sm', go: '#/conversations' }),
      body: '<div class="row" style="gap:16px;margin-bottom:16px">' + RC.scoreBadge(l.score) + RC.status(l.stage) + '<span class="row muted" style="font-size:12.5px">' + RC.av(l.owner, 'sm') + RC.esc(l.owner) + '</span>' + (l.consent ? RC.pill('Consent recorded', 'ok') : RC.pill('No consent: calls only', 'warn')) + '</div>' +
        '<div class="note ai"><span class="note-label">AI SUMMARY</span>' + l.bhk + ' for ' + l.purpose.toLowerCase() + ', budget around ' + money(l) + ', buying ' + l.timeline.toLowerCase() + '. Prefers ' + l.lang + '. ' + (l.loan ? 'Needs a home loan.' : 'Self-funded.') + (l.nri ? ' NRI: contact in their evening.' : '') + '</div>' +
        '<div class="note" style="margin-top:10px"><span class="note-label">NEXT BEST ACTION</span>' + nba + '</div>' +
        '<div class="block-title">Details</div><dl class="kv"><dt>Phone</dt><dd>' + RC.esc(l.phone) + '</dd><dt>Budget</dt><dd>' + money(l) + '</dd><dt>Looking for</dt><dd>' + l.bhk + '</dd><dt>Purpose</dt><dd>' + l.purpose + '</dd><dt>Timeline</dt><dd>' + l.timeline + '</dd><dt>Language</dt><dd>' + l.lang + '</dd><dt>Home loan</dt><dd>' + (l.loan ? 'Yes' : 'No') + '</dd></dl>' +
        '<div class="block-title">Timeline</div><div class="tl">' + tl + '</div>',
      foot: '<select class="select inline" id="ldStage">' + STAGES.concat(STAGES.indexOf(l.stage) < 0 ? [l.stage] : []).map(function (s) { return '<option' + (s === l.stage ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' + RC.btn('Schedule site visit', { cls: 'primary', icon: 'calendar', toast: 'Visit slots sent to ' + l.name.split(' ')[0] + ' on WhatsApp' }),
      mount: function (d) {
        RC.qs('#ldStage', d).addEventListener('change', function (e) {
          var to = e.target.value, from = l.stage;
          l.stage = to;
          if (!RC.live.on()) { RC.toast('Stage set to ' + l.stage); return; }
          RC.live.setStage(l.id, to).then(function () {
            var row = lead(l.id); if (row) row.stage = to;
            if (RC.state.leadsRedraw && location.hash.indexOf('#/leads') === 0) RC.state.leadsRedraw();
            RC.toast('Stage set to ' + to);
          },
            function () { l.stage = from; e.target.value = from; RC.toast('Could not change the stage', { icon: 'alert' }); });
        });
      }
    });
  }
})();
