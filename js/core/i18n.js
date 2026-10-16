/* NEXORA i18n: key-based dictionary (EN / RU / UK). Dictionary lives in i18n-dict.js. */
(function (NX) {
  'use strict';
  const LANGS = ['ru', 'uk', 'en'];
  const I = { lang: 'ru', langs: LANGS, dict: {} };

  I.t = (key, vars) => {
    const row = I.dict[key];
    let s = row ? (row[I.lang] != null ? row[I.lang] : row.en) : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  };
  I.has = (key) => !!I.dict[key];
  I.add = (rows) => { Object.keys(rows).forEach((k) => { const r = rows[k]; I.dict[k] = { en: r[0], ru: r[1], uk: r[2] }; }); };
  I.set = (lang) => {
    if (LANGS.indexOf(lang) < 0) lang = 'ru';
    I.lang = lang;
    document.documentElement.lang = lang;
    I.apply(document);
  };
  // Static markup translation: data-i18n="key", data-i18n-ph="key" (placeholder), data-i18n-title, data-i18n-aria.
  I.apply = (root) => {
    (root || document).querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = I.t(el.getAttribute('data-i18n')); });
    (root || document).querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', I.t(el.getAttribute('data-i18n-ph'))); });
    (root || document).querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', I.t(el.getAttribute('data-i18n-title'))); });
    (root || document).querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', I.t(el.getAttribute('data-i18n-aria'))); });
  };
  I.detect = () => {
    const n = (navigator.language || 'ru').slice(0, 2).toLowerCase();
    return n === 'uk' ? 'uk' : n === 'en' ? 'en' : 'ru';
  };

  NX.i18n = I;
  NX.t = I.t;
})(window.NX);
