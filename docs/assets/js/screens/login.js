(function () {
  var RC = window.RC;
  RC.screen('login', {
    render: function () {
      var api = RC.live.configuredUrl();
      return '<div class="auth-form"><div class="inner">' +
        '<img class="logo logo-light" src="assets/img/RealCognix_Primary_FullColour.svg" alt="RealCognix">' +
        '<img class="logo logo-dark" src="assets/img/RealCognix_Primary_Reverse.svg" alt="RealCognix">' +
        '<h1>Sign in to RealCognix OS</h1><p class="lead">Marketing and sales for real estate, from first ad to registered sale.</p>' +
        '<form class="stack" id="loginForm" data-local style="gap:14px">' +
        '<div class="note warn" id="loginErr" role="alert" style="display:none"></div>' +
        '<div class="field"><label for="em">Work email</label><input class="input" id="em" type="email" value="' + (api ? '' : 'arjun@realcognix.in') + '" autocomplete="username" required></div>' +
        '<div class="field"><label for="pw">Password</label><input class="input" id="pw" type="password" value="' + (api ? '' : 'prototype') + '" autocomplete="current-password" required></div>' +
        '<div class="field"><label for="apiUrl">API URL <span class="faint">(optional)</span></label><input class="input" id="apiUrl" type="url" placeholder="Leave empty to use demo data" value="' + RC.esc(api) + '" autocomplete="off"><span class="hint">Your RealCognix API, e.g. http://localhost:4000. Empty = demo data.</span></div>' +
        '<label class="check"><input type="checkbox" id="keep" checked> <span>Keep me signed in on this device</span></label>' +
        '<button class="btn primary lg block" type="submit" id="signIn">Sign in</button>' +
        '<button class="btn lg block" type="button" data-local id="otpBtn">' + RC.icon('phone') + '<span>Sign in with a one-time code</span></button>' +
        '</form><p class="faint" id="loginFoot" style="font-size:12px;margin-top:22px">' + (api ? 'Signing in to ' + RC.esc(api) + '.' : 'Prototype: any details work. No data leaves your browser.') + '</p></div></div>' +
        '<div class="auth-side"><div class="quote">“Every lead answered in under a minute, every site visit tracked, every rupee of ad spend tied to a booking.”</div>' +
        '<div class="auth-metrics"><div><b>3m 40s</b><span>Average speed to lead</span></div><div><b>₹4,850</b><span>Cost per site visit</span></div><div><b>27</b><span>Bookings this month</span></div></div>' +
        '<div class="auth-foot"><span>RealCognix · Real Intelligence, Real Growth</span><span>+91 90190 88160</span><span>Bengaluru 560064</span></div></div>';
    },
    mount: function (root) {
      var err = RC.qs('#loginErr', root), btn = RC.qs('#signIn', root), api = RC.qs('#apiUrl', root);
      function showErr(html) { err.innerHTML = html; err.style.display = html ? '' : 'none'; }
      api.addEventListener('input', function () {
        var v = api.value.trim();
        RC.qs('#loginFoot', root).textContent = v ? 'Signing in to ' + v + '.' : 'Prototype: any details work. No data leaves your browser.';
      });
      RC.qs('#loginForm', root).addEventListener('submit', function (e) {
        e.preventDefault();
        showErr('');
        var url = api.value.trim();
        if (!url) {
          RC.live.useDemo();
          RC.buildNav();
          RC.go('#/dashboard');
          setTimeout(function () { RC.toast('Welcome back, Arjun'); }, 80);
          return;
        }
        if (!/^https?:\/\//i.test(url)) { showErr('The API URL must start with http:// or https://'); return; }
        btn.disabled = true; btn.innerHTML = '<span>Signing in…</span>';
        RC.live.login(url, RC.qs('#em', root).value.trim(), RC.qs('#pw', root).value, RC.qs('#keep', root).checked).then(function (me) {
          RC.buildNav();
          RC.go('#/dashboard');
          setTimeout(function () { RC.toast('Welcome back, ' + RC.esc(String(me.fullName || '').split(' ')[0] || 'there')); }, 80);
        }, function (x) {
          btn.disabled = false; btn.innerHTML = '<span>Sign in</span>';
          var b = x.body || {};
          var mins = b.retryAfter ? Math.ceil(b.retryAfter / 60) : null;
          showErr(x.status === 401 ? 'Email or password is incorrect.' :
            x.status === 429 ? 'Too many attempts. Try again' + (mins ? ' in ' + mins + ' minute' + (mins > 1 ? 's' : '') : ' later') + '.' :
            x.status === 403 ? 'This account is disabled. Ask your admin.' :
            x.status === 409 ? 'This email is in more than one workspace. Ask your admin which to use.' :
            x.status === 400 && b.error === 'password_login_disabled' ? 'This workspace signs in through your company identity provider.' :
            x.status === 0 ? 'Cannot reach the API at ' + RC.esc(url) + '. Check the address and that it allows this site (CORS).' :
            'Sign-in failed (' + RC.esc(String(x.status)) + ').');
        });
      });
      RC.qs('#otpBtn', root).onclick = function () {
        if (api.value.trim()) RC.toast('One-time codes are not available yet. Use your password.', { icon: 'info' });
        else RC.toast('Code sent to +91 90190 •••60', { icon: 'phone' });
      };
    }
  });
})();
