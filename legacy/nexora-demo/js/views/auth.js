/* NEXORA demo access screens: login, registration, password recovery, staff entry.
   Demo only: passwords are validated for format, never sent anywhere and never stored. */
(function (NX) {
  'use strict';
  const U = NX.util, ui = NX.ui, t = (k, v) => NX.i18n.t(k, v);
  let off = null;

  function hero() {
    return '<section class="auth-hero"><div style="display:flex;align-items:center;gap:12px;position:relative;z-index:1">' + ui.logo() + '<div class="nx-wordmark shine">NEXORA<small>TRADING</small></div></div>' +
      '<h1>' + t('auth.heroTitle1') + '<br><span>' + t('auth.heroTitle2') + '</span></h1><p>' + t('auth.heroText') + '</p>' +
      '<div class="feats"><span>Crypto</span><span>Stocks</span><span>Indices</span><span>Forex</span><span>Commodities & Metals</span></div></section>';
  }
  const langSwitch = () => '<div class="lang-inline" role="group" aria-label="' + t('lang.label') + '">' + NX.i18n.langs.map((l) => '<button type="button" data-act="lang" data-lang="' + l + '" class="' + (NX.i18n.lang === l ? 'active' : '') + '">' + l.toUpperCase() + '</button>').join('') + '</div>';
  const pw = (name, label, ac) => '<div class="field" data-field="' + name + '"><label for="f_' + name + '">' + label + '</label><div class="pw"><input id="f_' + name + '" name="' + name + '" type="password" autocomplete="' + ac + '" required minlength="8"><button type="button" data-act="showpw" aria-label="' + t('auth.showPw') + '">' + t('auth.show') + '</button></div><span class="err" aria-live="polite"></span></div>';
  const demoBox = (staff) => '<div class="auth-demo"><b>' + t('auth.demoTitle') + '</b><span class="muted" style="font-size:12px;line-height:1.5">' + t('auth.demoText') + '</span>' +
    '<div class="row"><button type="button" class="btn ' + (staff ? '' : 'primary') + '" data-act="demo" data-role="client">' + t('role.client') + '</button><button type="button" class="btn ' + (staff ? 'primary' : '') + '" data-act="demo" data-role="manager">' + t('role.manager') + '</button><button type="button" class="btn" data-act="demo" data-role="admin">' + t('role.admin') + '</button></div></div>';

  function panel(mode) {
    const head = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span class="pill warn">' + t('demo.badge') + '</span>' + langSwitch() + '</div>';
    if (mode === 'register') return head + '<h2>' + t('auth.registerTitle') + '</h2><p class="lead">' + t('auth.registerLead') + '</p>' +
      '<form class="form" id="authForm" novalidate>' + ui.field({ name: 'name', label: t('f.fullName'), autocomplete: 'name', required: true }) + ui.field({ name: 'email', label: t('f.email'), type: 'email', autocomplete: 'email', required: true }) +
      ui.field({ name: 'country', label: t('f.country'), type: 'select', value: 'UA', options: ['UA', 'PL', 'DE', 'CZ', 'LT', 'LV', 'EE', 'ES', 'IT', 'GB', 'CY', 'AE', 'KZ', 'GE', 'MD'].map((c) => [c, c]) }) +
      pw('password', t('f.password'), 'new-password') + pw('confirm', t('f.confirm'), 'new-password') +
      '<label class="check"><input type="checkbox" name="terms" required> <span>' + t('auth.terms') + '</span></label><span class="err" id="termsErr" style="color:#ff8b95;font-size:11px"></span>' +
      '<button class="btn primary block" type="submit">' + t('auth.createAccount') + '</button></form>' +
      '<div class="auth-links"><span class="muted">' + t('auth.haveAccount') + '</span><button type="button" data-act="go" data-to="/login">' + t('auth.login') + '</button></div>' +
      '<p class="muted" style="font-size:11px;line-height:1.6;margin:0">' + t('auth.privacy') + '</p>';
    if (mode === 'recover') return head + '<h2>' + t('auth.recoverTitle') + '</h2><p class="lead">' + t('auth.recoverLead') + '</p>' +
      '<form class="form" id="authForm" novalidate>' + ui.field({ name: 'email', label: t('f.email'), type: 'email', autocomplete: 'email', required: true }) + '<button class="btn primary block" type="submit">' + t('auth.sendLink') + '</button></form><div id="recoverResult"></div>' +
      '<div class="auth-links"><button type="button" data-act="go" data-to="/login">← ' + t('auth.backToLogin') + '</button></div>';
    if (mode === 'staff') return head + '<h2>' + t('auth.staffTitle') + '</h2><p class="lead">' + t('auth.staffLead') + '</p>' + demoBox(true) +
      '<div class="notice">' + t('auth.staffNote') + '</div><div class="auth-links"><button type="button" data-act="go" data-to="/login">' + t('auth.clientEntry') + '</button></div>';
    return head + '<h2>' + t('auth.loginTitle') + '</h2><p class="lead">' + t('auth.loginLead') + '</p>' + demoBox(false) +
      '<form class="form" id="authForm" novalidate>' + ui.field({ name: 'email', label: t('f.email'), type: 'email', autocomplete: 'email', required: true, value: 'alex.morgan@example.com' }) + pw('password', t('f.password'), 'current-password') +
      '<button class="btn primary block" type="submit">' + t('auth.login') + '</button></form>' +
      '<div class="auth-links"><button type="button" data-act="go" data-to="/recover">' + t('auth.forgot') + '</button><span><span class="muted">' + t('auth.noAccount') + '</span> <button type="button" data-act="go" data-to="/register">' + t('auth.register') + '</button></span></div>' +
      '<div class="auth-links"><button type="button" data-act="go" data-to="/staff-login">' + t('auth.staffEntry') + '</button></div>' +
      '<p class="muted" style="font-size:11px;line-height:1.6;margin:0">' + t('auth.privacy') + '</p>';
  }

  async function startSession(role, clientId) {
    if (role === 'client') NX.store.set('session', { role: 'client', clientId });
    else { const r = await NX.api.auth.staffSession(role); NX.store.set('session', { role, staffId: r.staffId }); }
    NX.go(NX.app.home(role));
  }

  NX.views = NX.views || {};
  NX.views.auth = {
    mount(root, params) {
      const mode = params.mode || 'login';
      root.innerHTML = '<div class="auth"><div class="auth-layout">' + hero() + '<section class="auth-panel" aria-live="polite">' + panel(mode) + '</section></div></div>';
      document.title = t('auth.title.' + mode) + ' · NEXORA';
      const form = root.querySelector('#authForm');
      off = ui.delegate(root, {
        lang: (el) => { NX.i18n.set(el.dataset.lang); NX.store.set('lang', el.dataset.lang); NX.views.auth.mount(root, params); },
        go: (el) => NX.go(el.dataset.to),
        showpw: (el) => { const i = el.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; el.textContent = i.type === 'password' ? t('auth.show') : t('auth.hide'); },
        demo: async (el) => {
          ui.busy(el, true);
          try {
            if (el.dataset.role === 'client') { const r = await NX.api.auth.login('alex.morgan@example.com'); await startSession('client', r.clientId); }
            else await startSession(el.dataset.role);
            ui.toast(t('auth.demoEntered', { role: t('role.' + el.dataset.role) }), 'info');
          } catch (e) { ui.busy(el, false); ui.toast(ui.errText(e), 'err'); }
        }
      });
      if (!form) return;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = ui.formData(form), errs = {};
        const btn = form.querySelector('[type=submit]');
        if (mode !== 'recover' && mode !== 'register' && !U.isEmail(d.email)) errs.email = t('err.email');
        if (mode === 'recover' && !U.isEmail(d.email)) errs.email = t('err.email');
        if (mode === 'login' && (d.password || '').length < 8) errs.password = t('err.passwordShort');
        if (mode === 'register') {
          if ((d.name || '').trim().length < 2) errs.name = t('err.name');
          if (!U.isEmail(d.email)) errs.email = t('err.email');
          if ((d.password || '').length < 8) errs.password = t('err.passwordShort');
          else if (!/[A-Za-zА-Яа-яІіЇїЄє]/.test(d.password) || !/\d/.test(d.password)) errs.password = t('err.passwordWeak');
          if (d.confirm !== d.password) errs.confirm = t('err.passwordMatch');
          const te = root.querySelector('#termsErr'); te.textContent = form.terms.checked ? '' : t('err.terms'); if (!form.terms.checked) errs._terms = 1;
        }
        // Clear password fields right away — they are never kept in memory or storage.
        U.$$('input[type=password],input[name=password],input[name=confirm]', form).forEach((i) => { if (Object.keys(errs).length === 0) i.value = ''; });
        if (!ui.setErrors(form, errs) || errs._terms) return;
        ui.busy(btn, true);
        try {
          if (mode === 'login') {
            const r = await NX.api.auth.login(d.email);
            if (!r.matched) ui.toast(t('auth.unknownEmail'), 'info', 6000);
            await startSession('client', r.clientId);
          } else if (mode === 'register') {
            const r = await NX.api.auth.register({ name: d.name, email: d.email, country: d.country });
            ui.toast(t('auth.registered'), 'info', 6000);
            await startSession('client', r.clientId);
          } else if (mode === 'recover') {
            await NX.api.auth.recover(d.email);
            root.querySelector('#recoverResult').innerHTML = '<div class="notice ok">' + t('auth.recoverSent', { email: U.esc(U.maskEmail(d.email)) }) + '</div>';
            ui.busy(btn, false);
          }
        } catch (e2) {
          ui.busy(btn, false);
          const code = e2.code || '';
          if (code === 'err.emailTaken' || code === 'err.email') ui.setErrors(form, { email: ui.errText(e2) });
          else ui.toast(ui.errText(e2), 'err');
        }
      });
    },
    unmount() { if (off) off(); off = null; }
  };
})(window.NX);
