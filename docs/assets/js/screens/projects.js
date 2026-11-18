(function () {
  var RC = window.RC;
  function proj(id) { return RC.data.projects.filter(function (p) { return p.id === id; })[0]; }
  function range(p) { return RC.lakh(p.priceRange[0]) + ' – ' + RC.lakh(p.priceRange[1]); }

  function list() {
    var ps = RC.clientFilter(RC.data.projects);
    return RC.pageHead('Projects & Inventory', ps.length + ' projects · live inventory synced with the sales team', RC.btn('Import from brochure (AI)', { icon: 'upload', drawer: 'import' }) + RC.btn('New project', { icon: 'plus', cls: 'primary', toast: 'New project form opened' })) +
      (ps.length ? '' : '<div class="card"><div class="empty">No projects yet</div></div>') +
      '<div class="grid g-3">' + ps.map(function (p) {
        var avail = p.units - p.sold - p.held;
        return '<div class="card proj-card" data-go="#/projects/' + RC.esc(p.id) + '"><div class="pc-top"><span class="mono-block ' + p.mono + '">' + RC.initials(p.name) + '</span><div style="flex:1;min-width:0"><div class="row between"><b>' + RC.esc(p.name) + '</b>' + RC.status(p.status) + '</div><div class="muted" style="font-size:12.5px;margin-top:2px">' + RC.esc(p.locality) + ', ' + RC.esc(p.city) + ' · ' + RC.esc(RC.client(p.client).short) + '</div><div class="muted" style="font-size:12.5px;margin-top:6px">' + p.config + ' · ' + range(p) + '</div>' +
          '<div class="meter teal" style="margin-top:10px"><span style="width:' + (p.units ? Math.round(100 * p.sold / p.units) : 0) + '%"></span></div></div></div>' +
          '<div class="pc-stats"><div><small>Available</small><b>' + avail + '</b></div><div><small>Booked</small><b>' + p.sold + '</b></div><div><small>Possession</small><b>' + p.possession + '</b></div></div></div>';
      }).join('') + '</div>';
  }

  function inventory(p) {
    var floors = 14, rows = '';
    var s = p.id.length * 31;
    for (var f = floors; f >= 1; f--) {
      rows += '<div class="inv-row"><span class="inv-fl">' + f + '</span>';
      for (var u = 1; u <= 8; u++) {
        s = (s * 9301 + 49297) % 233280; var r = s / 233280;
        var cls = r < p.sold / p.units ? 'bk' : r < (p.sold + p.held) / p.units ? 'hd' : 'ok';
        var code = String.fromCharCode(64 + Math.ceil(u / 4)) + '-' + f + (u < 10 ? '0' : '') + u;
        rows += '<button class="unit ' + cls + '" data-local data-toast="' + code + ' · ' + (cls === 'ok' ? 'available, hold for 48 h?' : cls === 'hd' ? 'held for a buyer until tomorrow 6 pm' : 'booked') + '" title="' + code + '">' + code + '</button>';
      }
      rows += '</div>';
    }
    return '<div class="row between mb-16"><div class="inv-legend"><span><i style="background:var(--inv-available);border-color:var(--inv-available-b)"></i>Available</span><span><i style="background:var(--inv-held);border-color:var(--inv-held-b)"></i>Held</span><span><i style="background:var(--inv-booked);border-color:var(--inv-booked-b)"></i>Booked</span></div><div class="seg"><button class="active" data-seg>Tower A–B</button><button data-seg data-toast="Showing Tower C">Tower C</button></div></div><div class="inv">' + rows + '</div>';
  }

  function detail(p) {
    var c = RC.client(p.client), avail = p.units - p.sold - p.held, live = !!p.unitTypes, demo = RC.demoTag();
    var ut = p.unitTypes || RC.data.unitTypes;
    return RC.pageHead(RC.esc(p.name), RC.esc(p.locality) + ', ' + RC.esc(p.city) + ' · ' + RC.esc(c.name), RC.btn('Microsite', { icon: 'globe', go: '#/microsites/' + p.id }) + RC.btn('Share price list', { icon: 'whatsapp', toast: 'Price list ready to share on WhatsApp' }) + RC.btn('Edit', { icon: 'edit', cls: 'primary' })) +
      '<div class="kpis k5">' + RC.kpi('Units', p.units) + RC.kpi('Available', avail) + RC.kpi('Held', p.held) + RC.kpi('Booked', p.sold, (p.units ? Math.round(100 * p.sold / p.units) : 0) + '% sold') + RC.kpi('Price range', range(p)) + '</div>' +
      '<div data-tabs style="margin-top:20px"><div class="tabs">' + ['Overview', 'Unit types', 'Inventory', 'Price list', 'Media', 'Documents'].map(function (t, i) { return '<button class="tab' + (i ? '' : ' active') + '" data-tab="' + i + '">' + t + (live && i > 1 ? demo : '') + '</button>'; }).join('') + '</div>' +
      '<div data-pane="0" class="active"><div class="grid g-main"><div class="card"><div class="card-body"><dl class="kv"><dt>Configuration</dt><dd>' + p.config + '</dd><dt>RERA number</dt><dd class="mono">' + RC.esc(p.rera) + '</dd><dt>Possession (RERA)</dt><dd>' + p.possession + '</dd>' +
      (live
        ? '<dt>Land area</dt><dd>' + (p.landAcres ? p.landAcres + ' acres' : '—') + '</dd><dt>Amenities</dt><dd>' + (RC.esc(p.amenities.join(', ')) || '—') + '</dd>'
        : '<dt>Land area</dt><dd>3.2 acres · 78% open space</dd><dt>Approved banks</dt><dd>SBI, HDFC, ICICI, Canara</dd><dt>Amenities</dt><dd>Clubhouse, pool, co-working lounge, EV charging, rainwater harvesting</dd><dt>Nearby</dt><dd>School 1.2 km · Hospital 2.4 km · Bus stand 3 km</dd>') + '</dl></div></div>' +
      '<div class="note ai"><span class="note-label">MARKET INTEL AGENT' + demo + '</span>Seven launches within 3 km price at ₹6,900 to ₹8,400 per sq ft. This project sits at ₹8,050, mid-market, with the best open space. Lead with “78% open space” and the RERA possession date, which two competitors miss.</div></div></div>' +
      '<div data-pane="1"><div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Unit type</th><th class="num">Carpet (sq ft)</th><th class="num">Super built-up</th><th>Facing</th><th class="num">Units</th><th class="num">From</th></tr></thead><tbody>' + (ut.length ? '' : '<tr><td colspan="6"><div class="empty">No unit types yet</div></td></tr>') + ut.map(function (u) { return '<tr><td class="cell-main">' + RC.esc(u.t) + '</td><td class="num">' + RC.n(u.carpet) + '</td><td class="num">' + RC.n(u.sbua) + '</td><td>' + u.facing + '</td><td class="num">' + u.units + '</td><td class="num">' + (u.price ? RC.lakh(u.price) : '—') + '</td></tr>'; }).join('') + '</tbody></table></div></div></div>' +
      '<div data-pane="2"><div class="card"><div class="card-body">' + inventory(p) + '</div></div></div>' +
      '<div data-pane="3"><div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Component</th><th class="num">2 BHK Classic</th><th class="num">3 BHK Signature</th></tr></thead><tbody>' +
      [['Base price (₹8,050 / sq ft)', '₹59.4 L', '₹92.0 L'], ['Floor rise (from 5th)', '₹1.2 L', '₹1.6 L'], ['Car park (covered)', '₹3.5 L', '₹3.5 L'], ['Club and infra charges', '₹2.4 L', '₹3.1 L'], ['GST 5%', '₹3.3 L', '₹5.0 L'], ['All-in price', '₹69.8 L', '₹1.05 Cr']].map(function (r, i, a) { return '<tr><td class="' + (i === a.length - 1 ? 'cell-main' : '') + '">' + r[0] + '</td><td class="num">' + r[1] + '</td><td class="num">' + r[2] + '</td></tr>'; }).join('') + '</tbody></table></div><div class="card-foot"><span class="faint" style="font-size:12px">Stamp duty and registration extra as per state rules. Version 4 · 1 Nov 2026</span>' + RC.btn('Download PDF', { cls: 'sm', icon: 'download' }) + '</div></div></div>' +
      '<div data-pane="4"><div class="grid g-4">' + ['Elevation · day', 'Elevation · dusk', 'Clubhouse', 'Sample flat living', 'Master plan', 'Walkthrough video', 'Drone · site progress', 'Location map'].map(function (m, i) { return '<div class="card"><div style="aspect-ratio:4/3;background:var(--surface-2);display:grid;place-items:center;border-radius:var(--r-lg) var(--r-lg) 0 0;color:var(--faint)">' + RC.icon(i === 5 || i === 6 ? 'play' : 'image', 'lg') + '</div><div class="card-body" style="padding:10px 12px;font-size:12.5px">' + m + '</div></div>'; }).join('') + '</div></div>' +
      '<div data-pane="5"><div class="card"><div class="list">' + [['RERA registration certificate', 'Verified'], ['Commencement certificate', 'Verified'], ['Approved building plan', 'Verified'], ['Title report', 'Verified'], ['Bank approval letters (4)', 'Verified'], ['Agreement for sale (draft)', 'Needs review']].map(function (d) { return '<div class="list-item">' + RC.icon('file') + '<div class="li-main"><div class="li-title">' + d[0] + '</div></div>' + RC.status(d[1]) + '</div>'; }).join('') + '</div></div></div></div>';
  }

  RC.screen('projects', {
    render: function (params) { var p = params[0] && proj(params[0]); return p ? detail(p) : list(); },
    crumb: function (params) { var p = params[0] && proj(params[0]); return p ? p.name : null; }
  });

  RC.drawer('import', function () {
    RC.openDrawer({ kicker: 'Onboarding agent', title: 'Import from brochure', sub: 'Sahyog_Greens_Brochure.pdf · PriceList_Nov26.xlsx', wide: true,
      body: '<div class="note ai"><span class="note-label">REVIEW BEFORE SAVING</span>I read 24 pages and 1 sheet. 6 unit types and 180 units found. Two fields need you: possession date differs between brochure (2028) and RERA (March 2029), and the clubhouse size is missing.</div>' +
        '<div class="block-title">Extracted fields</div><div class="card"><div class="table-wrap"><table class="t compact"><thead><tr><th>Field</th><th>Value</th><th>Confidence</th></tr></thead><tbody>' +
        [['Project name', 'Sahyog Greens', 'Passed'], ['Location', 'Wakad, Pune', 'Passed'], ['RERA number', 'P52100079112', 'Passed'], ['Possession', 'March 2029 (RERA)', 'Needs review'], ['Unit types', '2 BHK (3), 3 BHK (3)', 'Passed'], ['Price range', '₹82 L – ₹1.34 Cr', 'Passed'], ['Clubhouse size', 'Not found', 'Needs review']].map(function (r) { return '<tr><td>' + r[0] + '</td><td class="cell-main">' + r[1] + '</td><td>' + RC.status(r[2]) + '</td></tr>'; }).join('') + '</tbody></table></div></div>',
      foot: RC.btn('Discard', { local: true, cls: 'ghost' }).replace('data-local', 'data-close data-local') + RC.btn('Save project', { cls: 'primary' }).replace('<button', '<button data-close data-toast="Sahyog Greens saved as draft"') });
  });
})();
