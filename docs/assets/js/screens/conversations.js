(function () {
  var RC = window.RC;
  var chIcon = { WhatsApp: 'whatsapp', Email: 'mail', Portal: 'portal' };
  RC.state.convSel = 'v1';
  function conv(id) { return RC.data.conversations.filter(function (c) { return c.id === id; })[0]; }
  function current() { return conv(RC.state.convSel) || RC.data.conversations[0]; }
  function thread(c) {
    var l = c.leadInfo || RC.data.leads.filter(function (x) { return x.id === c.lead; })[0] || {};
    var msgs = c.msgs.filter(function (m) { return m[1]; }).map(function (m) { return '<div class="msg ' + (m[0] === 'out' ? 'out' : '') + '">' + RC.esc(m[1]) + '<div class="mm">' + RC.esc(m[2]) + '</div></div>'; }).join('');
    return '<div class="ib-thread"><div class="ib-thead"><div><b>' + RC.esc(c.name) + '</b><div class="faint" style="font-size:12px">' + c.channel + ' · ' + RC.esc(c.project) + '</div></div><div class="row">' + RC.btn('', { icon: 'phone', cls: 'sm', toast: 'Calling ' + RC.esc(c.name) }) + RC.btn('Open lead', { cls: 'sm', drawer: 'lead', arg: c.lead }) + '</div></div>' +
      '<div class="ib-msgs">' + (c.leadInfo ? '' : '<span class="msg-day">Today</span>') + (msgs || '<div class="empty">No messages yet</div>') + '</div>' +
      '<div class="composer"><div class="draft"><div class="dh"><span>' + RC.icon('chip', 'sm') + ' AI draft · Follow-up agent' + (c.template ? ' · approved template ' + RC.esc(c.template) : ' · inside 24-hour window') + '</span><button class="btn sm ghost" data-local id="regen">Rewrite</button></div><p id="draftText">' + (c.draft ? RC.esc(c.draft) : '<span class="faint">No AI draft waiting for this thread.</span>') + '</p></div>' +
      '<div class="row"><input class="input" id="reply" placeholder="Write a reply, or send the draft"><button class="btn" data-local id="useDraft">Edit draft</button><button class="btn primary" data-local id="sendBtn">' + RC.icon('send') + '<span>Send</span></button></div></div></div>' +
      '<div class="ib-side"><div class="block-title">Lead</div><dl class="kv" style="grid-template-columns:90px 1fr"><dt>Score</dt><dd>' + RC.scoreBadge(l.score == null ? 60 : l.score) + '</dd><dt>Stage</dt><dd>' + RC.status(l.stage || 'Contacted') + '</dd><dt>Budget</dt><dd>' + (l.budget ? RC.lakh(l.budget) : '—') + '</dd><dt>Owner</dt><dd>' + RC.esc(l.owner || '—') + '</dd><dt>Consent</dt><dd>' + RC.pill(c.consentText || 'WhatsApp, call', c.consentTone || 'ok') + '</dd></dl>' +
      '<div class="block-title">Quick replies' + RC.demoTag() + '</div><div class="stack" style="gap:6px">' + ['Share brochure', 'Share price list', 'Send location', 'Offer visit slots'].map(function (t) { return '<button class="btn sm" data-toast="' + t + ' sent">' + t + '</button>'; }).join('') + '</div>' +
      '<div class="note warn" style="margin-top:16px"><span class="note-label">GUARDRAIL</span>No messages between 9 pm and 9 am. Outside the 24-hour window only approved templates can be sent.</div></div>';
  }
  RC.screen('conversations', {
    render: function () {
      var cs = RC.data.conversations, cur = current();
      return RC.pageHead('Conversations', 'WhatsApp, email and portal enquiries in one inbox · AI drafts, people send', '<div class="seg"><button class="active" data-seg>All</button><button data-seg data-toast="Showing WhatsApp">WhatsApp</button><button data-seg data-toast="Showing email">Email</button><button data-seg data-toast="Showing portals">Portals</button></div>') +
        (cur ? '<div class="inbox"><div class="ib-list">' + cs.map(function (c) {
          var last = c.msgs[c.msgs.length - 1];
          return '<div class="ib-item' + (c === cur ? ' active' : '') + (c.unread ? ' unread' : '') + '" data-cv="' + RC.esc(c.id) + '">' + RC.av(c.name, 'sm') + '<div style="min-width:0"><div class="ib-top"><span class="ib-name">' + RC.esc(c.name) + '</span><span class="ib-time">' + RC.esc(c.time) + '</span></div><div class="ib-prev">' + RC.icon(chIcon[c.channel] || 'chat', 'sm') + ' ' + RC.esc(last ? last[1] : '') + '</div></div></div>';
        }).join('') + '</div><div id="thread" style="display:contents">' + thread(cur) + '</div></div>'
          : '<div class="card"><div class="empty">' + RC.icon('chat') + '<div>No conversations yet. Messages from leads on WhatsApp and email show up here.</div></div></div>');
    },
    mount: function (root) {
      var c = current();
      if (!c) return;
      RC.qs('#useDraft').onclick = function () { RC.qs('#reply').value = c.draft; RC.qs('#reply').focus(); };
      RC.qs('#regen').onclick = function () { RC.toast('Draft rewritten in a warmer tone', { icon: 'refresh' }); };
      RC.qs('#sendBtn').onclick = function () {
        var txt = RC.qs('#reply').value.trim() || c.draft;
        if (!txt) { RC.toast('Write a reply first', { icon: 'info' }); return; }
        if (!RC.live.on()) {
          c.msgs.push(['out', txt, 'Just now · sent by Arjun']); c.unread = false; RC.render();
          RC.toast('Sent on ' + c.channel);
          return;
        }
        var b = RC.qs('#sendBtn'); b.disabled = true;
        RC.live.send(c, txt).then(function (r) {
          RC.toast(r.status === 'sent' ? 'Sent on ' + c.channel : r.status === 'blocked' ? 'Held by the compliance guard' : 'Queued: sends when allowed', { icon: r.status === 'blocked' ? 'alert' : 'check' });
          RC.render();
        }, function (e) {
          b.disabled = false;
          var reasons = e.body && e.body.reasons ? ': ' + RC.esc(e.body.reasons.join(', ')) : '';
          RC.toast((e.status === 422 ? 'Blocked by the compliance guard' : 'Could not send') + reasons, { icon: 'alert' });
        });
      };
      RC.qsa('.ib-item', root).forEach(function (it) {
        it.onclick = function () { RC.state.convSel = it.getAttribute('data-cv'); var x = conv(RC.state.convSel); if (x) x.unread = false; RC.render(); };
      });
    }
  });
})();
