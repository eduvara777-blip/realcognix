(function () {
  var RC = window.RC;
  RC.screen('clients', {
    render: function () {
      var D = RC.data, n = function (st) { return D.clients.filter(function (c) { return c.status === st; }).length; };
      return RC.pageHead('Clients', D.clients.length + ' real estate compan' + (D.clients.length === 1 ? 'y' : 'ies') + ' · ' + n('Active') + ' active, ' + n('Onboarding') + ' onboarding', RC.btn('Export', { icon: 'download' }) + RC.btn('Add client', { icon: 'plus', cls: 'primary', drawer: 'onboard' })) +
        (D.clients.length ? '' : '<div class="card"><div class="empty">No clients yet</div></div>') +
        '<div class="grid g-3">' + D.clients.map(function (c, i) {
          return '<div class="card proj-card" data-drawer="client" data-arg="' + RC.esc(c.id) + '"><div class="pc-top"><span class="mono-block ' + ['', 't', 's', 'a'][i % 4] + '">' + RC.initials(c.name) + '</span><div style="flex:1;min-width:0"><div class="row between"><b>' + RC.esc(c.name) + '</b>' + RC.status(c.status) + '</div><div class="muted" style="font-size:12.5px;margin-top:2px">' + RC.esc(c.city) + ' · ' + c.projects + ' project' + (c.projects === 1 ? '' : 's') + ' · since ' + c.since + '</div><div class="row" style="margin-top:8px;font-size:12px">' + RC.av(c.am, 'sm') + '<span class="muted">' + RC.esc(c.am) + '</span><span class="dot-sep"></span><span class="muted">RERA ' + c.rera.toLowerCase() + '</span></div></div></div>' +
            '<div class="pc-stats"><div><small>Monthly budget</small><b>' + RC.lakh(c.budget) + '</b></div><div><small>Leads MTD</small><b>' + RC.n(c.leadsMTD) + '</b></div><div><small>Bookings</small><b>' + c.bookings + '</b></div></div></div>';
        }).join('') + '</div>';
    }
  });

  RC.drawer('client', function (id) {
    var c = RC.client(id), projects = RC.data.projects.filter(function (p) { return p.client === id; });
    RC.openDrawer({ kicker: 'Client', title: RC.esc(c.name), sub: RC.esc(c.city) + ' · ' + c.status,
      body: '<dl class="kv"><dt>Account manager</dt><dd>' + RC.esc(c.am) + '</dd><dt>Client since</dt><dd>' + c.since + '</dd><dt>RERA status</dt><dd>' + RC.status(c.rera) + '</dd><dt>Monthly ad budget</dt><dd>' + RC.lakh(c.budget) + '</dd><dt>Fee model</dt><dd>' + (c.feeModel ? RC.esc(c.feeModel) : 'Retainer + per-booking success fee') + '</dd></dl>' +
        '<div class="block-title">Projects</div><div class="card"><div class="list">' + (projects.map(function (p) { return '<div class="list-item click" data-go="#/projects/' + RC.esc(p.id) + '"><div class="li-main"><div class="li-title">' + RC.esc(p.name) + '</div><div class="li-sub">' + RC.esc(p.locality) + ' · ' + p.config + '</div></div>' + RC.status(p.status) + '</div>'; }).join('') || '<div class="empty">No projects yet</div>') + '</div></div>',
      foot: RC.btn('Open report', { go: '#/reports/' + id }) + RC.btn('Client portal', { cls: 'primary', icon: 'external', toast: 'Client portal link copied' }) });
  });

  var STEPS = ['Company & KYC', 'Agreement & scope', 'RERA verification', 'Targets', 'Review & invite'];
  RC.drawer('onboard', function () {
    var cur = 0;
    function body() {
      var panes = [
        '<div class="form-grid"><div class="field full"><label>Company legal name</label><input class="input" value="Sahyog Ventures Infra Pvt Ltd"></div><div class="field"><label>GSTIN</label><input class="input mono" value="27AAKCS4410M1Z2"></div><div class="field"><label>PAN</label><input class="input mono" value="AAKCS4410M"></div><div class="field"><label>City</label><input class="input" value="Pune"></div><div class="field"><label>Primary contact</label><input class="input" value="Sameer Deshpande · Director"></div><div class="field full"><label>Brochures and price lists</label><div class="banner">' + RC.icon('upload') + '<span style="flex:1">Sahyog_Greens_Brochure.pdf, PriceList_Nov26.xlsx</span>' + RC.pill('2 files', 'ok') + '</div><span class="hint">The Onboarding agent reads these and drafts the project for your review.</span></div></div>',
        '<div class="stack"><div class="field"><label>Services</label><div class="row wrap">' + ['Performance ads', 'Portal listings', 'Microsite', 'WhatsApp follow-up', 'Pre-sales calling', 'Channel partners', 'Reporting'].map(function (s, i) { return '<button class="chip' + (i < 5 || i === 6 ? ' active' : '') + '" data-local onclick="this.classList.toggle(\'active\')">' + s + '</button>'; }).join('') + '</div></div><div class="form-grid"><div class="field"><label>Monthly retainer</label><input class="input" value="₹1,50,000"></div><div class="field"><label>Success fee per booking</label><input class="input" value="0.75% of agreement value"></div><div class="field"><label>Monthly ad budget</label><input class="input" value="₹4,50,000"></div><div class="field"><label>Term</label><select class="select"><option>6 months</option><option>12 months</option></select></div></div><label class="check"><input type="checkbox" checked> <span>Agreement sent for e-sign to sameer@sahyogventures.in</span></label></div>',
        '<div class="stack"><div class="field"><label>Project RERA number</label><input class="input mono" value="P52100079112"></div><div class="note ai"><span class="note-label">ONBOARDING AGENT</span>Found on MahaRERA: <b>Sahyog Greens</b>, Wakad, promoter Sahyog Ventures Infra Pvt Ltd, completion March 2029, 180 units. Matches the brochure. One gap: the brochure says “ready in 2028”, which conflicts with RERA. Ads will use the RERA date.</div><label class="check"><input type="checkbox" checked> <span>RERA number and QR will appear on every ad, microsite and brochure</span></label></div>',
        '<div class="form-grid"><div class="field"><label>Site visits per month</label><input class="input" value="45"></div><div class="field"><label>Bookings per month</label><input class="input" value="5"></div><div class="field"><label>Target cost per site visit</label><input class="input" value="₹5,000"></div><div class="field"><label>Speed to lead</label><input class="input" value="Under 5 minutes"></div><div class="field full"><label>Buyer focus</label><input class="input" value="IT professionals in Hinjewadi and Wakad, 28–40, first home"></div></div>',
        '<div class="stack"><dl class="kv"><dt>Company</dt><dd>Sahyog Ventures Infra Pvt Ltd</dd><dt>Project</dt><dd>Sahyog Greens · RERA P52100079112</dd><dt>Scope</dt><dd>Ads, portals, microsite, WhatsApp, calling, reporting</dd><dt>Targets</dt><dd>45 visits, 5 bookings a month, ₹5,000 per visit</dd><dt>Account manager</dt><dd>Meera P.</dd></dl><div class="field"><label>Invite to client portal</label><input class="input" value="sameer@sahyogventures.in"></div></div>'
      ];
      return '<div class="steps">' + STEPS.map(function (s, i) { return '<div class="step ' + (i < cur ? 'done' : i === cur ? 'cur' : '') + '"><span class="bar"></span>' + (i + 1) + '. ' + s + '</div>'; }).join('') + '</div>' + panes[cur];
    }
    function draw(d) {
      RC.qs('.dr-body', d).innerHTML = body();
      RC.qs('.dr-foot', d).innerHTML = (cur ? RC.btn('Back', { local: true, id: 'obBack' }) : '<span></span>') + RC.btn(cur === 4 ? 'Create client and send invite' : 'Continue', { cls: 'primary', local: true, id: 'obNext' });
      var b = RC.qs('#obBack'); if (b) b.onclick = function () { cur--; draw(d); };
      RC.qs('#obNext').onclick = function () { if (cur === 4) { RC.closeDrawer(); RC.toast('Sahyog Ventures added · invite sent'); return; } cur++; draw(d); };
    }
    RC.openDrawer({ kicker: 'New client', title: 'Onboard a real estate company', wide: true, body: '', foot: '', mount: draw });
  });
})();
