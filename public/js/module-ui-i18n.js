// Static translations for service screens. The catalogue contains interface copy only;
// user-entered values and messages are never sent to a translation service at runtime.
(function () {
  'use strict';
  const data = window.ST_MODULE_UI_LOCALES;
  if (!data || !Array.isArray(data.ru)) return;
  const codes = ['ru', 'en', 'de', 'fr', 'it', 'es', 'pt', 'pl', 'el', 'tr'];
  const locales = { ru:'ru-RU', en:'en-GB', de:'de-DE', fr:'fr-FR', it:'it-IT', es:'es-ES', pt:'pt-PT', pl:'pl-PL', el:'el-GR', tr:'tr-TR' };
  const index = new Map();
  data.ru.forEach((phrase, i) => index.set(phrase, i));
  const current = () => typeof getLang === 'function' ? getLang() : 'ru';
  function translate(value) {
    const lang = current();
    if (lang === 'ru' || !codes.includes(lang)) return value;
    const source = String(value);
    const prefix = source.match(/^\s*/)[0], suffix = source.match(/\s*$/)[0];
    const phrase = source.trim().replace(/\s+/g, ' ');
    const i = index.get(phrase);
    if (i === undefined) return value;
    const result = data[lang]?.[i];
    return result ? prefix + result + suffix : value;
  }
  const skip = element => !element || element.closest('script,style,[contenteditable],[translate="no"],.ai-me,#pg-app,#pg-ob,#pg-hub');
  function localize(root) {
    if (current() === 'ru' || !root) return;
    const visit = element => {
      if (!element || skip(element)) return;
      for (const attr of ['placeholder', 'title', 'aria-label']) {
        const before = element.getAttribute?.(attr);
        if (before) {
          const after = translate(before);
          if (after !== before) element.setAttribute(attr, after);
        }
      }
      for (const child of element.childNodes || []) {
        if (child.nodeType === 3) {
          if (/[А-Яа-яЁё]/.test(child.nodeValue || '')) child.nodeValue = translate(child.nodeValue);
        } else if (child.nodeType === 1) visit(child);
      }
    };
    if (root.nodeType === 3) {
      if (!skip(root.parentElement)) root.nodeValue = translate(root.nodeValue);
    } else if (root.nodeType === 1) visit(root);
  }
  function start() {
    localize(document.body);
    new MutationObserver(records => {
      if (current() === 'ru') return;
      for (const record of records) {
        if (record.type === 'attributes') localize(record.target);
        for (const node of record.addedNodes) localize(node);
      }
    }).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['placeholder','title','aria-label'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
  window.STModuleUI = { translate, localize, locale: () => locales[current()] || 'en-GB' };
})();
