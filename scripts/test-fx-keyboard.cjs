const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(tag, document) { this.tagName = tag; this.document = document; this.style = {}; this.dataset = {}; this.children = []; this.events = new Map(); this.value = ''; }
  append(...children) { for (const child of children) { this.children.push(child); child.parent = this; } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(type, handler) { this.events.set(type, handler); }
  focus() { this.document.activeElement = this; this.events.get('focus')?.(); }
  select() { this.selected = true; }
  querySelectorAll(selector) { return selector === '.ov.open' ? [] : []; }
}
const listeners = new Map();
const viewport = {
  height: 900, offsetTop: 0,
  addEventListener(type, handler) { listeners.set(type, handler); },
  removeEventListener(type) { listeners.delete(type); }
};
const document = {
  activeElement: null, createElement(tag) { return new Element(tag, this); },
  createTextNode(value) { return { textContent: value }; },
  getElementById(id) { return walk(this.body).find(element => element.id === id) || null; },
  querySelector() { return null; }, addEventListener() {}, removeEventListener() {}
};
document.body = new Element('body', document);
function walk(element) { return [element, ...(element.children || []).flatMap(walk)]; }
const window = { visualViewport: viewport, innerHeight: 900,
  addEventListener(type, handler) { listeners.set('window:' + type, handler); },
  removeEventListener(type) { listeners.delete('window:' + type); }
};
const saved = new Map();
const context = { window, document, location: { hostname: 'localhost', protocol: 'https:' },
  localStorage: { getItem(key) { return saved.get(key) || null; }, setItem(key, value) { saved.set(key, value); } },
  getLang() { return 'ru'; }, getCurrency() { return 'EUR'; },
  CURRENCIES: ['EUR', 'USD', 'GBP', 'CNY', 'JPY', 'RUB', 'IDR'].map(code => ({ code })),
  Intl, Number, BigInt, AbortController, setTimeout, clearTimeout, MutationObserver: class { observe() {} },
  fetch: async url => new Response('KEY,TIME_PERIOD,OBS_VALUE\nEXR.D.CNY.EUR.SP00.A,2026-10-12,' +
    (url.includes('D.IDR.') ? '20004.87' : '7.4832') + '\n', { headers: { 'content-type': 'text/csv' } }) };
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/js/fx-calculator.js', 'utf8'), context);
window.SplitawayFx.openCalculator();
const modal = document.getElementById('fx-calculator-modal');
const amount = document.getElementById('fx-amount');
const close = walk(modal).find(element => element.textContent === 'Закрыть');
assert.ok(modal && amount && close);
assert.equal(document.activeElement, amount);
assert.equal(amount.selected, true);
assert.equal(walk(modal).filter(element => element.textContent === 'Калькулятор валют').length, 1);
assert.equal(amount.inputMode, 'decimal');
assert.equal(document.getElementById('fx-keypad'), null);
assert.equal(close.style.display, 'none', 'Close is hidden as soon as the amount gets focus');
const selectors = walk(modal).filter(element => element.tagName === 'select');
assert.equal(selectors.length, 2);
assert.equal(selectors[0].value, 'CNY');
assert.equal(selectors[1].value, 'EUR');
selectors[0].value = 'RUB';
selectors[0].events.get('change')();
assert.deepEqual(JSON.parse(saved.get('sw_fx_last_pair')), { source: 'RUB', target: 'EUR' });
amount.focus();
viewport.height = 450;
listeners.get('resize')();
assert.equal(close.style.display, 'none');
assert.equal(modal.style.height, '450px');
const notice = walk(modal).find(element => typeof element.textContent === 'string' && element.textContent.startsWith('Справочный курс'));
assert.ok(notice);
assert.equal(notice.style.display, '', 'rate note stays visible while the native keyboard is open');
assert.match(amount.parent.parent.parent.style.cssText, /overflow:visible/);
selectors[0].events.get('pointerdown')();
viewport.height = 900;
listeners.get('resize')();
assert.ok(document.getElementById('fx-calculator-modal'),
  'tapping a currency selector must not close the calculator when the keyboard hides');
selectors[0].value = 'USD';
selectors[0].events.get('change')();
assert.deepEqual(JSON.parse(saved.get('sw_fx_last_pair')), { source: 'USD', target: 'EUR' });
amount.focus();
viewport.height = 450;
listeners.get('resize')();
selectors[1].events.get('pointerdown')();
viewport.height = 900;
listeners.get('resize')();
assert.ok(document.getElementById('fx-calculator-modal'), 'target currency selector keeps the dialog open');
selectors[1].value = 'JPY';
selectors[1].events.get('change')();
assert.deepEqual(JSON.parse(saved.get('sw_fx_last_pair')), { source: 'USD', target: 'JPY' });
const firstSwap = walk(modal).find(element => element.title === 'Поменять валюты местами');
amount.focus();
viewport.height = 450;
listeners.get('resize')();
firstSwap.events.get('pointerdown')();
viewport.height = 900;
listeners.get('resize')();
assert.ok(document.getElementById('fx-calculator-modal'), 'swap button keeps the dialog open');
firstSwap.events.get('click')();
assert.deepEqual(JSON.parse(saved.get('sw_fx_last_pair')), { source: 'JPY', target: 'USD' });
amount.focus();
viewport.height = 450;
listeners.get('resize')();
viewport.height = 900;
listeners.get('resize')();
assert.equal(document.getElementById('fx-calculator-modal'), null,
  'one Android Back/IME dismissal must close the whole calculator');
window.SplitawayFx.openCalculator();
const reopened = document.getElementById('fx-calculator-modal');
const reopenedSelectors = walk(reopened).filter(element => element.tagName === 'select');
assert.equal(reopenedSelectors[0].value, 'JPY');
assert.equal(reopenedSelectors[1].value, 'USD');
const swap = walk(reopened).find(element => element.title === 'Поменять валюты местами');
assert.ok(swap);
swap.events.get('click')();
assert.deepEqual(JSON.parse(saved.get('sw_fx_last_pair')), { source: 'USD', target: 'JPY' });
const manual = walk(reopened).find(element => element.type === 'radio' && element.checked !== true);
const manualRate = walk(reopened).find(element => element.tagName === 'input' && element !== document.getElementById('fx-amount') && element.inputMode === 'decimal');
manual.checked = true;
manual.events.get('change')();
assert.equal(manualRate.readOnly, false);
assert.equal(document.activeElement, manualRate);
assert.equal(walk(reopened).find(element => element.textContent === 'Закрыть').style.display, 'none');
const auto = walk(reopened).find(element => element.type === 'radio' && element !== manual);
const currentAmount = document.getElementById('fx-amount');
const result = walk(reopened).find(element => element.tagName === 'strong');
async function checkRateDisplay() {
  assert.equal(result.style.textAlign, 'center', 'converted amount is centered without resizing the dialog');
  manual.checked = false; auto.checked = true;
  reopenedSelectors[0].value = 'CNY'; reopenedSelectors[1].value = 'EUR';
  currentAmount.value = '120'; currentAmount.events.get('input')();
  auto.events.get('change')();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(manualRate.value, '0,13', 'reference rate is shown with two decimals');
  assert.match(result.textContent, /16,04/, 'conversion still uses the precise reference rate');
  assert.notEqual(result.textContent, new Intl.NumberFormat('ru', { style: 'currency', currency: 'EUR' }).format(15.6));
  reopenedSelectors[0].value = 'IDR';
  currentAmount.value = '10000'; currentAmount.events.get('input')();
  reopenedSelectors[0].events.get('change')();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(manualRate.value, '< 0,01', 'a small rate is not misrepresented as zero');
  assert.match(result.textContent, /0,50/, 'small-rate conversion also retains precision');
  reopenedSelectors[0].value = 'CNY'; currentAmount.value = '120';
  manual.checked = true; auto.checked = false; manual.events.get('change')();
  manualRate.value = '0.133632670515'; manualRate.events.get('input')();
  currentAmount.events.get('input')();
  assert.equal(manualRate.value, '0.133632670515', 'manual rates retain the precision entered by the user');
  assert.match(result.textContent, /16,04/, 'manual-rate conversion still works');
  console.log('PASS: keyboard/back, currency selection, centered result, two-decimal display with precise conversion');
}
checkRateDisplay().catch(error => { console.error(error); process.exitCode = 1; });
