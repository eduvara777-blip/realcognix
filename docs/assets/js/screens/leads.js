(function () {
  var RC = window.RC;
  var STAGES = ['New', 'Contacted', 'Qualified', 'Visit scheduled', 'Visited', 'Negotiation', 'Booked', 'Lost'];
  var view = 'table', q = '', src = 'all';
  function lead(id) { return RC.data.leads.filter(function (l) { return l.id === id; })[0]; }
  function filtered() {
    return RC.clientFilter(RC.data.leads).filter(function (l) {
      return (!q || (l.name + ' ' + l.project + ' ' + l.id).toLowerCase().indexOf(q) > -1) && (src === 'all' || l.source === src);
    });
  }
  function sla(l) {
    if (l.slaMins == null) return '<span class="faint">—</span>';
    return l.slaMins >= 5 ? RC.pill('Overdue ' + l.slaMins + 'm', 'bad') : RC.pill((5 - l.slaMins) + 'm left', 'warn');
  }
  function table(ls) {
    return '<div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Lead</th><th>Project</th><th class="num">Score</th><th>Stage</th><th>Source</th><th class="num">Budget</th><th>Owner</th><th>Call due</th><th>Created</th></tr></thead><tbody>' +
      ls.map(function (l) {
        return '<tr class="click" data-drawer="lead" data-arg="' + l.id + '"><td><div class="cell-main">' + RC.esc(l.name) + (l.nri ? ' ' + RC.pill('NRI', 'info nodot') : '') + '</div><div class="cell-sub">' + l.phone + ' · ' + l.bhk + '</div></td><td>' + l.project + '</td><td class="num">' + RC.scoreBadge(l.score) + '</td><td>' + RC.status(l.stage) + '</td><td>' + l.source + '</td><td class="num">' + RC.lakh(l.budget) + '</td><td><span class="row">' + RC.av(l.owner, 'sm') + l.owner + '</span></td><td>' + sla(l) + '</td><td class="muted">' + l.created + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  function kanban(ls) {
    return '<div class="kanban">' + STAGES.map(function (s) {
      var col = ls.filter(function (l) { return l.stage === s; });
      return '<div class="kb-col" data-stage="' + s + '"><div class="kb-head"><span>' + s + '</span><span class="muted">' + col.length + '</span></div><div class="kb-cards">' + col.map(function (l) {
        return '<div class="kb-card" draggable="true" data-id="' + l.id + '"><div class="kc-top"><span class="kc-name">' + RC.esc(l.name) + '</span>' + RC.scoreBadge(l.score) + '</div><div class="kc-sub">' + l.project + ' · ' + l.bhk + ' · ' + RC.lakh(l.budget) + '</div><div class="kc-foot"><span>' + l.source + '</span>' + RC.av(l.owner, 'sm') + '</div></div>';
      }).join('') + '</div></div>';
    }).join('') + '</div>';
  }
  function body() { var ls = filtered(); return view === 'table' ? table(ls) : kanban(ls); }

  RC.screen('leads', {
    render: function () {
      var all = RC.clientFilter(RC.data.leads);
      var hot = all.filter(function (l) { return l.score >= 75; }).length, overdue = all.filter(function (l) { return l.slaMins >= 5; }).length;
      var sources = ['all'].concat(RC.data.leads.map(function (l) { return l.source; }).filter(function (s, i, a) { return a.indexOf(s) === i; }));
      return RC.pageHead('Leads', all.length + ' leads shown · ' + hot + ' hot · ' + overdue + ' past the 5-minute call rule', RC.btn('Import CSV', { icon: 'upload' }) + RC.btn('Add lead', { icon: 'plus', cls: 'primary' })) +
        '<div class="toolbar"><div class="input-wrap">' + RC.icon('search') + '<input class="input" id="leadQ" placeholder="Search name, project or ID" value="' + RC.esc(q) + '"></div>' +
        '<select class="select inline" id="leadSrc">' + sources.map(function (s) { return '<option value="' + s + '"' + (s === src ? ' selected' : '') + '>' + (s === 'all' ? 'All sources' : s) + '</option>'; }).join('') + '</select>' +
        '<div class="tb-spacer" style="flex:1"></div><div class="seg" id="leadView"><button data-seg data-local data-v="table" class="' + (view === 'table' ? 'active' : '') + '">' + RC.icon('list') + ' Table</button><button data-seg data-local data-v="kanban" class="' + (view === 'kanban' ? 'active' : '') + '">' + RC.icon('kanban') + ' Pipeline</button></div></div>' +
        '<div id="leadBody">' + body() + '</div>';
    },
    mount: function (root, params) {
      function redraw() { RC.qs('#leadBody').innerHTML = body(); wire(); }
      function wire() {
        var dragId = null;
        RC.qsa('.kb-card', root).forEach(function (c) {
          c.addEventListener('click', function () { RC.drawers.lead(c.getAttribute('data-id')); });
          c.addEventListener('dragstart', function () { dragId = c.getAttribute('data-id'); });
        });
        RC.qsa('.kb-col', root).forEach(function (col) {
          col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('drop'); });
          col.addEventListener('dragleave', function () { col.classList.remove('drop'); });
          col.addEventListener('drop', function (e) { e.preventDefault(); var l = lead(dragId); if (l) { l.stage = col.getAttribute('data-stage'); RC.toast(l.name + ' moved to ' + l.stage, { undo: true }); } redraw(); });
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
    var l = lead(id); if (!l) return;
    var tl = RC.data.leadTimeline.map(function (t) {
      var s = t.t.replace('{source}', l.source).replace('{score}', l.score).replace('{owner}', l.owner).replace('{lang}', l.lang);
      return '<div class="tl-item ' + t.cls + '"><div class="tt">' + s + '</div><div class="tm">' + t.m.replace('{created}', l.created) + '</div></div>';
    }).join('');
    var nba = l.score >= 75 ? 'Call now and offer a site visit this Saturday at 11 am. Mention the 3 BHK Signature on a higher floor, which fits the budget.' : l.score >= 50 ? 'Send the floor plan on WhatsApp and ask one question: self use or investment?' : 'Keep in the monthly nurture. Re-score if they reply.';
    RC.openDrawer({ kicker: l.id + ' · ' + l.source, title: RC.esc(l.name), sub: l.project + ' · ' + RC.client(l.client).name,
      headActions: RC.btn('', { icon: 'phone', cls: 'sm', toast: 'Calling ' + l.phone + ' via click-to-call' }) + RC.btn('', { icon: 'whatsapp', cls: 'sm', go: '#/conversations' }),
      body: '<div class="row" style="gap:16px;margin-bottom:16px">' + RC.scoreBadge(l.score) + RC.status(l.stage) + '<span class="row muted" style="font-size:12.5px">' + RC.av(l.owner, 'sm') + l.owner + '</span>' + (l.consent ? RC.pill('Consent recorded', 'ok') : RC.pill('No consent: calls only', 'warn')) + '</div>' +
        '<div class="note ai"><span class="note-label">AI SUMMARY</span>' + l.bhk + ' for ' + l.purpose.toLowerCase() + ', budget around ' + RC.lakh(l.budget) + ', buying ' + l.timeline.toLowerCase() + '. Prefers ' + l.lang + '. ' + (l.loan ? 'Needs a home loan.' : 'Self-funded.') + (l.nri ? ' NRI: contact in their evening.' : '') + '</div>' +
        '<div class="note" style="margin-top:10px"><span class="note-label">NEXT BEST ACTION</span>' + nba + '</div>' +
        '<div class="block-title">Details</div><dl class="kv"><dt>Phone</dt><dd>' + l.phone + '</dd><dt>Budget</dt><dd>' + RC.lakh(l.budget) + '</dd><dt>Looking for</dt><dd>' + l.bhk + '</dd><dt>Purpose</dt><dd>' + l.purpose + '</dd><dt>Timeline</dt><dd>' + l.timeline + '</dd><dt>Language</dt><dd>' + l.lang + '</dd><dt>Home loan</dt><dd>' + (l.loan ? 'Yes' : 'No') + '</dd></dl>' +
        '<div class="block-title">Timeline</div><div class="tl">' + tl + '</div>',
      foot: '<select class="select inline" id="ldStage">' + STAGES.map(function (s) { return '<option' + (s === l.stage ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' + RC.btn('Schedule site visit', { cls: 'primary', icon: 'calendar', toast: 'Visit slots sent to ' + l.name.split(' ')[0] + ' on WhatsApp' }),
      mount: function (d) { RC.qs('#ldStage', d).addEventListener('change', function (e) { l.stage = e.target.value; RC.toast('Stage set to ' + l.stage); }); }
    });
  });
})();
