(function () {
  var RC = window.RC;
  RC.screen('login', {
    render: function () {
      return '<div class="auth-form"><div class="inner">' +
        '<img class="logo logo-light" src="assets/img/RealCognix_Primary_FullColour.svg" alt="RealCognix">' +
        '<img class="logo logo-dark" src="assets/img/RealCognix_Primary_Reverse.svg" alt="RealCognix">' +
        '<h1>Sign in to RealCognix OS</h1><p class="lead">Marketing and sales for real estate, from first ad to registered sale.</p>' +
        '<form class="stack" id="loginForm" data-local style="gap:14px">' +
        '<div class="field"><label for="em">Work email</label><input class="input" id="em" type="email" value="arjun@realcognix.in" autocomplete="username"></div>' +
        '<div class="field"><label for="pw">Password</label><input class="input" id="pw" type="password" value="prototype" autocomplete="current-password"></div>' +
        '<label class="check"><input type="checkbox" checked> <span>Keep me signed in on this device</span></label>' +
        '<button class="btn primary lg block" type="submit">Sign in</button>' +
        '<button class="btn lg block" type="button" data-local id="otpBtn">' + RC.icon('phone') + '<span>Sign in with a one-time code</span></button>' +
        '</form><p class="faint" style="font-size:12px;margin-top:22px">Prototype: any details work. No data leaves your browser.</p></div></div>' +
        '<div class="auth-side"><div class="quote">“Every lead answered in under a minute, every site visit tracked, every rupee of ad spend tied to a booking.”</div>' +
        '<div class="auth-metrics"><div><b>3m 40s</b><span>Average speed to lead</span></div><div><b>₹4,850</b><span>Cost per site visit</span></div><div><b>27</b><span>Bookings this month</span></div></div>' +
        '<div class="auth-foot"><span>RealCognix · Real Intelligence, Real Growth</span><span>+91 90190 88160</span><span>Bengaluru 560064</span></div></div>';
    },
    mount: function (root) {
      RC.qs('#loginForm', root).addEventListener('submit', function (e) {
        e.preventDefault();
        try { localStorage.setItem('rc-auth', '1'); } catch (x) {}
        RC.go('#/dashboard');
        setTimeout(function () { RC.toast('Welcome back, Arjun'); }, 80);
      });
      RC.qs('#otpBtn', root).onclick = function () { RC.toast('Code sent to +91 90190 •••60', { icon: 'phone' }); };
    }
  });
})();
