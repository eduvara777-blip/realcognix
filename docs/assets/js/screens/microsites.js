(function () {
  var RC = window.RC;
  function proj(id) { return RC.data.projects.filter(function (p) { return p.id === id; })[0]; }
  var stats = { 'p-tidewater': [18420, 4.1], 'p-baywalk': [6210, 3.2], 'p-skyline': [26800, 3.6], 'p-orchard': [7400, 2.9], 'p-chamundi': [9120, 2.4], 'p-arcadia': [11050, 3.3], 'p-sahyog': [0, 0] };

  function list() {
    var ps = RC.clientFilter(RC.data.projects);
    return RC.pageHead('Microsites', 'One fast, RERA-compliant page per project, with consent built into every form', RC.btn('New microsite', { icon: 'plus', cls: 'primary', toast: 'Pick a project to start' })) +
      '<div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Microsite</th><th>Address</th><th class="num">Visitors (30 days)</th><th class="num">Form conversion</th><th>Status</th><th></th></tr></thead><tbody>' +
      ps.map(function (p) { var s = stats[p.id] || [0, 0]; var slug = p.name.toLowerCase().replace(/[^a-z]+/g, '-'); return '<tr class="click" data-go="#/microsites/' + p.id + '"><td class="cell-main">' + p.name + '</td><td class="muted">' + slug + '.realcognix.in</td><td class="num">' + RC.n(s[0]) + '</td><td class="num">' + (s[1] ? s[1] + '%' : '—') + '</td><td>' + RC.status(p.status === 'Live' ? 'Published' : 'Draft') + '</td><td class="right">' + RC.icon('chevR', 'sm') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  }

  function plate() {
    return '<div class="ms-plate"><svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><rect width="400" height="300" fill="#11203B"/><g fill="none" stroke="#B7C2D2" stroke-width="1" opacity=".5"><rect x="70" y="90" width="80" height="210"/><rect x="170" y="50" width="90" height="250"/><rect x="280" y="120" width="70" height="180"/></g><g fill="#14A394" opacity=".85"><rect x="170" y="50" width="90" height="6"/></g><g stroke="#B7C2D2" opacity=".25">' +
      Array.apply(null, Array(18)).map(function (_, i) { return '<line x1="170" x2="260" y1="' + (70 + i * 13) + '" y2="' + (70 + i * 13) + '"/>'; }).join('') + '</g></svg></div>';
  }
  function fp(rooms) { return '<svg viewBox="0 0 200 130"><rect x="10" y="10" width="180" height="110"/>' + rooms + '</svg>'; }

  function preview(p) {
    var slug = p.name.toLowerCase().replace(/[^a-z]+/g, '-');
    var days = ['Sat 21', 'Sun 22', 'Mon 23', 'Tue 24'], times = ['10:00', '11:30', '15:00', '17:00'];
    return RC.pageHead(p.name + ' microsite', 'Live preview · what buyers see', '<div class="seg" id="msDev"><button class="active" data-seg data-local>Desktop</button><button data-seg data-local>Mobile</button></div>' + RC.btn('Publish changes', { icon: 'upload', cls: 'primary', toast: 'Published · RERA footer verified' })) +
      '<div class="ms-frame"><div class="ms-bar"><span class="dots"><i></i><i></i><i></i></span><span class="url">' + RC.icon('lock', 'sm') + ' ' + slug + '.realcognix.in</span></div>' +
      '<div class="ms" id="msBody"><div class="ms-nav"><span class="brand">' + p.name + '</span><nav><span>Homes</span><span>Location</span><span>Price</span><span>Visit</span></nav><button class="ms-btn" data-local data-toast="Opening WhatsApp chat">' + RC.icon('whatsapp') + 'WhatsApp</button></div>' +
      '<div class="ms-hero"><div><div class="eyebrow">' + p.locality + ', ' + p.city + ' · ' + p.config + '</div><h2>Homes that look out, not in.</h2><p>' + p.config + ' residences on 3.2 acres with 78% open space. RERA registered, possession ' + p.possession + '.</p><div class="row" style="margin-top:22px"><button class="ms-btn" data-local onclick="document.getElementById(\'msVisit\').scrollIntoView({behavior:\'smooth\'})">Book a site visit</button><button class="ms-btn line" data-local data-toast="Brochure sent on WhatsApp">Get brochure</button></div></div>' + plate() + '</div>' +
      '<div class="ms-facts"><div><small>Starting price</small><b>' + RC.lakh(p.priceRange[0]) + ' all-in</b></div><div><small>Configuration</small><b>' + p.config + '</b></div><div><small>Possession</small><b>' + p.possession + '</b></div><div><small>Homes</small><b>' + p.units + '</b></div></div>' +
      '<div class="ms-sec"><h3>Floor plans</h3><div class="ms-plans">' +
      '<div class="ms-plan">' + fp('<line x1="90" y1="10" x2="90" y2="120"/><line x1="10" y1="70" x2="90" y2="70"/><line x1="140" y1="10" x2="140" y2="70"/>') + '<b>2 BHK Classic</b><div style="font-size:13px;color:var(--ms-muted)">812 sq ft carpet · from ₹68 L</div></div>' +
      '<div class="ms-plan">' + fp('<line x1="70" y1="10" x2="70" y2="120"/><line x1="130" y1="10" x2="130" y2="120"/><line x1="10" y1="65" x2="70" y2="65"/><line x1="130" y1="65" x2="190" y2="65"/>') + '<b>3 BHK Signature</b><div style="font-size:13px;color:var(--ms-muted)">1,148 sq ft carpet · from ₹1.04 Cr</div></div>' +
      '<div class="ms-plan">' + fp('<line x1="60" y1="10" x2="60" y2="120"/><line x1="120" y1="10" x2="120" y2="80"/><line x1="10" y1="60" x2="60" y2="60"/><line x1="120" y1="80" x2="190" y2="80"/>') + '<b>3 BHK Sky Deck</b><div style="font-size:13px;color:var(--ms-muted)">1,296 sq ft carpet · from ₹1.42 Cr</div></div></div></div>' +
      '<div class="ms-sec"><div class="ms-two"><div><h3>EMI calculator</h3><div class="ms-emi"><div class="row between"><span>Home price</span><b id="emiP">₹1.04 Cr</b></div><input type="range" id="emiPrice" min="60" max="150" value="104"><div class="row between" style="margin-top:10px"><span>Down payment</span><b id="emiD">20%</b></div><input type="range" id="emiDown" min="10" max="50" value="20"><div class="row between" style="margin-top:10px"><span>Tenure</span><b id="emiT">20 years</b></div><input type="range" id="emiTen" min="5" max="30" value="20"><div style="margin-top:16px;font-size:12px;color:var(--ms-muted)">Monthly EMI at 8.5%</div><div class="out" id="emiOut">—</div></div></div>' +
      '<div id="msVisit"><h3>Book a site visit</h3><div class="stack" style="gap:12px"><input class="input" placeholder="Your name"><input class="input" placeholder="Mobile number (+91)"><div><div style="font-size:12px;color:var(--ms-muted);margin-bottom:6px">Day</div><div class="slot-grid" id="msDays">' + days.map(function (d, i) { return '<button class="slot' + (i ? '' : ' active') + '" data-local>' + d + '</button>'; }).join('') + '</div></div><div><div style="font-size:12px;color:var(--ms-muted);margin-bottom:6px">Time</div><div class="slot-grid" id="msTimes">' + times.map(function (t, i) { return '<button class="slot' + (i === 1 ? ' active' : '') + '" data-local' + (i === 2 ? ' disabled' : '') + '>' + t + '</button>'; }).join('') + '</div></div>' +
      '<label class="check" style="font-size:12px;color:var(--ms-muted)"><input type="checkbox" id="msConsent"> <span>I agree to be contacted by ' + RC.client(p.client).name + ' and RealCognix on call, WhatsApp and email about this project. I can withdraw consent any time. (DPDP Act, 2023)</span></label><button class="ms-btn" id="msSubmit" data-local>Confirm visit</button></div></div></div></div>' +
      '<div class="ms-foot"><span>RERA: ' + p.rera + ' · rera.karnataka.gov.in</span><span>Images are artist’s impressions. Prices exclude stamp duty and registration.</span></div></div></div>';
  }

  RC.screen('microsites', {
    render: function (params) { var p = params[0] && proj(params[0]); return p ? preview(p) : list(); },
    crumb: function (params) { var p = params[0] && proj(params[0]); return p ? p.name : null; },
    mount: function (root, params) {
      RC.qsa('tr[data-go]', root).forEach(function (tr) { tr.onclick = function () { RC.go(tr.getAttribute('data-go')); }; });
      if (!params[0]) return;
      var seg = RC.qs('#msDev'); if (seg) RC.qsa('button', seg).forEach(function (b, i) { b.addEventListener('click', function () { RC.qs('#msBody').classList.toggle('mobile', i === 1); }); });
      function emi() {
        var P = +RC.qs('#emiPrice').value, d = +RC.qs('#emiDown').value, n = +RC.qs('#emiTen').value * 12, r = 0.085 / 12;
        var loan = P * 100000 * (1 - d / 100), e = loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
        RC.qs('#emiP').textContent = RC.lakh(P); RC.qs('#emiD').textContent = d + '%'; RC.qs('#emiT').textContent = (n / 12) + ' years';
        RC.qs('#emiOut').textContent = RC.inr(e) + ' / month';
      }
      ['#emiPrice', '#emiDown', '#emiTen'].forEach(function (s) { RC.qs(s).addEventListener('input', emi); }); emi();
      ['#msDays', '#msTimes'].forEach(function (s) { RC.qsa('.slot', RC.qs(s)).forEach(function (b) { b.addEventListener('click', function () { if (b.disabled) return; RC.qsa('.slot', RC.qs(s)).forEach(function (x) { x.classList.toggle('active', x === b); }); }); }); });
      RC.qs('#msSubmit').addEventListener('click', function () {
        if (!RC.qs('#msConsent').checked) { RC.toast('Please tick the consent box to continue', { icon: 'info' }); return; }
        RC.toast('Visit booked · confirmation sent on WhatsApp');
      });
    }
  });
})();
