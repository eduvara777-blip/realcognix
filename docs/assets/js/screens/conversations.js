(function () {
  var RC = window.RC;
  var sel = 'v1';
  var chIcon = { WhatsApp: 'whatsapp', Email: 'mail', Portal: 'portal' };
  function conv(id) { return RC.data.conversations.filter(function (c) { return c.id === id; })[0]; }
  function thread(c) {
    var l = RC.data.leads.filter(function (x) { return x.id === c.lead; })[0] || {};
    var msgs = c.msgs.map(function (m) { return '<div class="msg ' + (m[0] === 'out' ? 'out' : '') + '">' + RC.esc(m[1]) + '<div class="mm">' + RC.esc(m[2]) + '</div></div>'; }).join('');
    return '<div class="ib-thread"><div class="ib-thead"><div><b>' + c.name + '</b><div class="faint" style="font-size:12px">' + c.channel + ' · ' + c.project + '</div></div><div class="row">' + RC.btn('', { icon: 'phone', cls: 'sm', toast: 'Calling ' + c.name }) + RC.btn('Open lead', { cls: 'sm', drawer: 'lead', arg: c.lead }) + '</div></div>' +
      '<div class="ib-msgs"><span class="msg-day">Today</span>' + msgs + '</div>' +
      '<div class="composer"><div class="draft"><div class="dh"><span>' + RC.icon('chip', 'sm') + ' AI draft · Follow-up agent' + (c.template ? ' · approved template ' + c.template : ' · inside 24-hour window') + '</span><button class="btn sm ghost" data-local id="regen">Rewrite</button></div><p id="draftText">' + RC.esc(c.draft) + '</p></div>' +
      '<div class="row"><input class="input" id="reply" placeholder="Write a reply, or send the draft"><button class="btn" data-local id="useDraft">Edit draft</button><button class="btn primary" data-local id="sendBtn">' + RC.icon('send') + '<span>Send</span></button></div></div></div>' +
      '<div class="ib-side"><div class="block-title">Lead</div><dl class="kv" style="grid-template-columns:90px 1fr"><dt>Score</dt><dd>' + RC.scoreBadge(l.score || 60) + '</dd><dt>Stage</dt><dd>' + RC.status(l.stage || 'Contacted') + '</dd><dt>Budget</dt><dd>' + (l.budget ? RC.lakh(l.budget) : '—') + '</dd><dt>Owner</dt><dd>' + (l.owner || '—') + '</dd><dt>Consent</dt><dd>' + RC.pill('WhatsApp, call', 'ok') + '</dd></dl>' +
      '<div class="block-title">Quick replies</div><div class="stack" style="gap:6px">' + ['Share brochure', 'Share price list', 'Send location', 'Offer visit slots'].map(function (t) { return '<button class="btn sm" data-toast="' + t + ' sent">' + t + '</button>'; }).join('') + '</div>' +
      '<div class="note warn" style="margin-top:16px"><span class="note-label">GUARDRAIL</span>No messages between 9 pm and 9 am. Outside the 24-hour window only approved templates can be sent.</div></div>';
  }
  RC.screen('conversations', {
    render: function () {
      var cs = RC.data.conversations;
      return RC.pageHead('Conversations', 'WhatsApp, email and portal enquiries in one inbox · AI drafts, people send', '<div class="seg"><button class="active" data-seg>All</button><button data-seg data-toast="Showing WhatsApp">WhatsApp</button><button data-seg data-toast="Showing email">Email</button><button data-seg data-toast="Showing portals">Portals</button></div>') +
        '<div class="inbox"><div class="ib-list">' + cs.map(function (c) {
          return '<div class="ib-item' + (c.id === sel ? ' active' : '') + (c.unread ? ' unread' : '') + '" data-cv="' + c.id + '">' + RC.av(c.name, 'sm') + '<div style="min-width:0"><div class="ib-top"><span class="ib-name">' + c.name + '</span><span class="ib-time">' + c.time + '</span></div><div class="ib-prev">' + RC.icon(chIcon[c.channel], 'sm') + ' ' + RC.esc(c.msgs[c.msgs.length - 1][1]) + '</div></div></div>';
        }).join('') + '</div><div id="thread" style="display:contents">' + thread(conv(sel)) + '</div></div>';
    },
    mount: function (root) {
      function wire() {
        var c = conv(sel);
        RC.qs('#useDraft').onclick = function () { RC.qs('#reply').value = c.draft; RC.qs('#reply').focus(); };
        RC.qs('#regen').onclick = function () { RC.toast('Draft rewritten in a warmer tone', { icon: 'refresh' }); };
        RC.qs('#sendBtn').onclick = function () {
          var txt = RC.qs('#reply').value.trim() || c.draft;
          c.msgs.push(['out', txt, 'Just now · sent by Arjun']); c.unread = false; RC.render();
          RC.toast('Sent on ' + c.channel);
        };
      }
      RC.qsa('.ib-item', root).forEach(function (it) { it.onclick = function () { sel = it.getAttribute('data-cv'); conv(sel).unread = false; RC.render(); }; });
      wire();
    }
  });
})();
