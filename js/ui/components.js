/* NEXORA shared UI components: badges, toasts, modals, states, small charts. */
(function (NX) {
  'use strict';
  const U = NX.util, t = (k, v) => NX.i18n.t(k, v);
  const ui = {};

  // Multilingual seed text {ru,uk,en} or plain user text.
  ui.txt = (v) => (v && typeof v === 'object') ? (v[NX.i18n.lang] || v.en || v.ru || '') : (v == null ? '' : String(v));

  ui.badge = (instId, size) => {
    const inst = NX.catalog.get(instId); size = size || 'sm';
    if (!inst) return '<span class="ab ' + size + '"><span class="fallback">?</span></span>';
    if (inst.market === 'forex') {
      const f1 = NX.FLAGS[inst.base], f2 = NX.FLAGS[inst.quote];
      if (f1 && f2) return '<span class="ab fx ' + size + '" role="img" aria-label="' + U.esc(inst.symbol) + '"><img src="' + U.assetUrl(f1) + '" alt=""><img src="' + U.assetUrl(f2) + '" alt=""></span>';
    }
    const src = NX.ICONS[inst.id];
    if (src) return '<span class="ab ' + size + '" role="img" aria-label="' + U.esc(inst.name) + '"><img src="' + U.assetUrl(src) + '" alt="" decoding="async"></span>';
    return '<span class="ab ' + size + '"><span class="fallback">' + U.esc(inst.symbol.slice(0, 2)) + '</span></span>';
  };
  ui.logo = (cls) => '<span class="nx-logo ' + (cls || '') + '"><img src="' + U.assetUrl(NX.LOGO) + '" alt="NEXORA"></span>';
  ui.fmtPrice = (instId, v) => { const i = NX.catalog.get(instId); return U.fmt(v, i ? i.decimals : 2); };
  // Quantity with the instrument's precision; a small non-zero amount is never shown as 0.
  ui.fmtQty = (instId, q) => { const i = NX.catalog.get(instId); const d = i ? Math.min(8, U.stepDecimals(i.qtyStep)) : 4; return q && Math.abs(q) < 0.5 * Math.pow(10, -d) ? U.fmtMax(q, 10) : U.fmt(q, d); };
  ui.ccy = (instId) => { const i = NX.catalog.get(instId); return i ? i.quote : 'USD'; };

  /* ---------- Market data source marks ---------- */
  // Badge under a quote: LIVE (provider, time) or SIM.
  // Small marker before a price: green = live price, amber = simulated price on real history.
  ui.liveDot = (id) => !NX.market.isLive(id) ? '' : NX.market.isSim(id) ? '<i class="ldot sim" title="' + t('live.simDemo') + '"></i>' : '<i class="ldot" title="LIVE"></i>';
  ui.sourceBadge = (q) => {
    if (q && q.live && q.live.simulated) {
      return '<span class="pill warn" title="' + t('live.simDemoHint') + '"><span class="dot"></span>' + t('live.simDemo') + '</span> <span class="src-note">' + t('live.simDemoNote', { src: U.esc(q.live.src), time: U.time(q.live.fetchedAt) }) + '</span>';
    }
    if (q && q.live) {
      const closed = q.live.marketOpen === false;
      return '<span class="pill live"><span class="dot live" style="color:#18d27c"></span>LIVE · ' + U.esc(q.live.src) + '</span>' + (q.live.fallback ? ' <span class="pill warn" title="' + t('live.backupHint') + '">' + t('live.backup') + '</span>' : '') +
        ' <span class="src-note">' + t('live.updated', { time: U.time(q.live.fetchedAt) }) + (closed ? ' · ' + t('live.closed') : '') + (q.live.official ? '' : ' · ' + t('live.unofficial')) + '</span>';
    }
    return '<span class="pill warn">' + t('live.sim') + '</span> <span class="src-note">' + t(NX.live && NX.live.enabled() ? 'live.simNote' : 'live.offNote') + '</span>';
  };
  // Page-level pill: how many instruments currently have live prices.
  ui.marketDataPill = () => {
    const n = NX.live ? NX.catalog.all().filter((i) => NX.market.isLive(i.id) && !NX.market.isSim(i.id)).length : 0;
    return n ? '<span class="pill live" title="' + U.esc(NX.live.attribution()) + '"><span class="dot live" style="color:#18d27c"></span>' + t('live.pill', { n }) + '</span>' : '<span class="pill warn"><span class="dot"></span>' + t('demo.simPrices') + '</span>';
  };

  /* ---------- Status pills ---------- */
  const STATUS_CLS = {
    filled: '', completed: '', verified: '', resolved: '', active: '', done: '', closed: 'gray',
    open: 'info', new: 'info', awaiting: 'warn', confirming: 'info', review: 'warn', processing: 'info', pending: 'warn', in_progress: 'violet',
    cancelled: 'gray', rejected: 'bad', expired: 'gray', none: 'gray', blocked: 'bad', lost: 'bad',
    contacted: 'violet', qualified: 'violet', registered: 'info', funded: '', high: 'bad', normal: 'gray', low: 'gray'
  };
  ui.status = (group, value) => '<span class="status ' + (STATUS_CLS[value] != null ? STATUS_CLS[value] : 'gray') + '">' + U.esc(t(group + '.' + value)) + '</span>';
  ui.side = (side) => '<span class="' + (side === 'buy' ? 'up' : 'down') + '" style="font-weight:700">' + t('side.' + side) + '</span>';

  /* ---------- States: loading / empty / error ---------- */
  ui.loading = (rows) => '<div class="skeleton" aria-busy="true" aria-label="' + t('state.loading') + '">' + '<i></i>'.repeat(rows || 4) + '</div>';
  ui.empty = (title, text, icon) => '<div class="state" role="status">' + U.icon(icon || 'empty') + '<b>' + U.esc(title || t('state.empty')) + '</b>' + (text ? '<span>' + U.esc(text) + '</span>' : '') + '</div>';
  ui.error = (e, retryAct) => '<div class="state err" role="alert">' + U.icon('alert') + '<b>' + t('state.error') + '</b><span>' + U.esc(ui.errText(e)) + '</span>' +
    (retryAct ? '<button class="btn sm" data-act="' + retryAct + '">' + t('btn.retry') + '</button>' : '') + '</div>';
  ui.errText = (e) => { const code = (e && e.code) || 'err.unknown'; return NX.i18n.has(code) ? t(code, e.vars) : t('err.unknown'); };

  /* ---------- Toasts ---------- */
  ui.toast = (msg, type, ms) => {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.innerHTML = U.icon(type === 'err' ? 'alert' : type === 'info' ? 'info' : 'check') + '<div>' + msg + '</div><button aria-label="' + t('btn.close') + '">×</button>';
    el.querySelector('svg').style.cssText = 'width:16px;height:16px;flex-shrink:0;margin-top:1px';
    el.querySelector('button').onclick = () => el.remove();
    box.appendChild(el);
    setTimeout(() => el.remove(), ms || 4200);
  };

  /* ---------- Modal ---------- */
  ui.modal = (opts) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal ' + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="mTitle"><header><h3 id="mTitle">' + U.esc(opts.title) + '</h3><button class="icon-btn" data-close aria-label="' + t('btn.close') + '">' + U.icon('x') + '</button></header><div class="mbody">' + (opts.body || '') + '</div>' + (opts.footer ? '<footer>' + opts.footer + '</footer>' : '') + '</div>';
    const prevFocus = document.activeElement;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (prevFocus && prevFocus.focus) prevFocus.focus(); if (opts.onClose) opts.onClose(); };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { // focus trap
        const f = U.$$('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])', back).filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return; const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    const firstInput = back.querySelector('.mbody input,.mbody select,.mbody textarea,footer .btn.primary');
    setTimeout(() => (firstInput || back.querySelector('[data-close]')).focus(), 30);
    if (opts.onMount) opts.onMount(back.querySelector('.modal'), close);
    return { el: back, close };
  };
  ui.confirm = (title, text, okLabel, danger) => new Promise((resolve) => {
    let done = false;
    const m = ui.modal({ title, body: '<p style="margin:0;line-height:1.6;color:#c6d8ea">' + text + '</p>',
      footer: '<button class="btn" data-close>' + t('btn.cancel') + '</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" data-ok>' + U.esc(okLabel || t('btn.confirm')) + '</button>',
      onClose: () => { if (!done) resolve(false); } });
    m.el.querySelector('[data-ok]').onclick = () => { done = true; m.close(); resolve(true); };
  });

  /* ---------- Form helpers ---------- */
  ui.field = (o) => {
    const id = o.id || ('f_' + o.name);
    let control;
    if (o.type === 'select') control = '<select id="' + id + '" name="' + o.name + '"' + (o.required ? ' required' : '') + '>' + o.options.map((op) => '<option value="' + U.esc(op[0]) + '"' + (String(op[0]) === String(o.value) ? ' selected' : '') + '>' + U.esc(op[1]) + '</option>').join('') + '</select>';
    else if (o.type === 'textarea') control = '<textarea id="' + id + '" name="' + o.name + '" maxlength="' + (o.max || 2000) + '"' + (o.required ? ' required' : '') + ' placeholder="' + U.esc(o.placeholder || '') + '">' + U.esc(o.value || '') + '</textarea>';
    else control = '<input id="' + id + '" name="' + o.name + '" type="' + (o.type || 'text') + '" value="' + U.esc(o.value == null ? '' : o.value) + '"' + (o.required ? ' required' : '') + (o.autocomplete ? ' autocomplete="' + o.autocomplete + '"' : '') + (o.step ? ' step="' + o.step + '"' : '') + (o.min != null ? ' min="' + o.min + '"' : '') + (o.inputmode ? ' inputmode="' + o.inputmode + '"' : '') + ' placeholder="' + U.esc(o.placeholder || '') + '">';
    return '<div class="field' + (o.full ? ' full' : '') + '" data-field="' + o.name + '"><label for="' + id + '">' + U.esc(o.label) + '</label>' + control + (o.hint ? '<span class="hint">' + U.esc(o.hint) + '</span>' : '') + '<span class="err" aria-live="polite"></span></div>';
  };
  ui.formData = (form) => { const o = {}; new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v : ''; }); return o; };
  ui.setErrors = (form, errs) => {
    U.$$('.field', form).forEach((f) => { f.classList.remove('invalid'); const e = f.querySelector('.err'); if (e) e.textContent = ''; });
    let first = null;
    Object.keys(errs || {}).forEach((k) => {
      const f = form.querySelector('[data-field="' + k + '"]'); if (!f) return;
      f.classList.add('invalid'); f.querySelector('.err').textContent = errs[k];
      const inp = f.querySelector('input,select,textarea'); if (inp) inp.setAttribute('aria-invalid', 'true');
      if (!first) first = inp;
    });
    if (first) first.focus();
    return !first;
  };
  ui.busy = (btn, on) => { if (!btn) return; btn.disabled = !!on; btn.classList.toggle('loading', !!on); };

  /* ---------- Small charts (SVG) ---------- */
  ui.bars = (items, fmt, color) => {
    const max = Math.max(1, ...items.map((i) => i.v));
    return '<div class="bars">' + items.map((i) => '<div class="b" style="height:' + Math.max(2, i.v / max * 100) + '%;' + (color ? 'background:' + color : '') + '" title="' + U.esc(i.label + ': ' + (fmt ? fmt(i.v) : i.v)) + '"></div>').join('') + '</div>' +
      '<div class="bars-x">' + items.map((i, k) => '<span>' + (k % Math.ceil(items.length / 7) === 0 ? U.esc(i.short || '') : '') + '</span>').join('') + '</div>';
  };
  ui.area = (values, opts) => {
    opts = opts || {};
    if (!values.length) return '';
    const w = 600, h = opts.h || 160, min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
    const pts = values.map((v, i) => [i / Math.max(1, values.length - 1) * w, h - 8 - (v - min) / rng * (h - 16)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    const col = opts.color || (values[values.length - 1] >= values[0] ? '#18d27c' : '#ff5c6c');
    const gid = 'g' + Math.random().toString(36).slice(2, 7);
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px;display:block" aria-hidden="true"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + col + '" stop-opacity=".35"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs><path d="' + line + 'L' + w + ' ' + h + 'L0 ' + h + 'Z" fill="url(#' + gid + ')"/><path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
  };
  ui.spark = (values, up) => {
    if (!values || values.length < 2) return '';
    const w = 70, h = 22, min = Math.min(...values), max = Math.max(...values), r = max - min || 1;
    const d = values.map((v, i) => (i ? 'L' : 'M') + (i / (values.length - 1) * w).toFixed(1) + ' ' + (h - 2 - (v - min) / r * (h - 4)).toFixed(1)).join('');
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="' + (up ? '#18d27c' : '#ff5c6c') + '" stroke-width="1.5"/></svg>';
  };

  // Sortable table header helper: cols = [{key,label,sortable,cls}]
  ui.thead = (cols, sort) => '<thead><tr>' + cols.map((c) => '<th class="' + (c.cls || '') + (c.key && c.sortable !== false ? ' sortable' : '') + '"' + (c.key && c.sortable !== false ? ' data-act="sort" data-key="' + c.key + '" aria-sort="' + (sort && sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '" tabindex="0"' : '') + '>' + U.esc(c.label) + (sort && sort.key === c.key ? '<span class="arr">' + (sort.dir === 'asc' ? '▲' : '▼') + '</span>' : '') + '</th>').join('') + '</tr></thead>';

  ui.staffName = (id, staff) => { const s = (staff || []).find((x) => x.id === id); return s ? s.name : '—'; };

  // Event delegation: one listener per root, actions declared with data-act.
  ui.delegate = (root, handlers, events) => {
    const offs = [];
    (events || ['click']).forEach((ev) => {
      const fn = (e) => {
        const el = e.target.closest('[data-act]');
        if (!el || !root.contains(el)) return;
        const name = el.getAttribute('data-act');
        const h = handlers[ev === 'click' ? name : ev + ':' + name];
        if (h) h(el, e);
      };
      root.addEventListener(ev, fn);
      offs.push(() => root.removeEventListener(ev, fn));
    });
    return () => offs.forEach((f) => f());
  };

  NX.ui = ui;
})(window.NX);
