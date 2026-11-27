const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('public/index.html', 'utf8');
const displayCode = html.split('// The trip ledger stays in its base currency. This quote changes presentation only.')[1]
  .split('async function onCurrencyChange')[0];
const stored = new Map();
const context = {
  S: { trip: { id: 'TEST-HUNGARY', currency: 'HUF', secondaryCurrency: 'EUR' }, me: 'Raf' },
  getCurrency: () => 'HUF',
  getCurrencySymbol: code => ({ HUF: 'Ft', EUR: '€' })[code || 'HUF'],
  fmtLocale: () => 'de-DE',
  localStorage: {
    getItem: key => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, value)
  },
  window: { SplitawayFx: { requestLatestRate: async () => ({ rate: 0.002686, asOf: '2026-11-27' }) } },
  AbortController, Date, Number, JSON, console,
  renderDash() {}, renderExpenses() {}, renderBalances() {},
  goPage() {}, toast() {}, t: key => key
};
vm.createContext(context);
vm.runInContext(html.match(/function fm\(n,currCode\)\{[\s\S]*?\n\}/)[0] + displayCode, context);

(async () => {
  let shown = vm.runInContext('expenseViewAmounts(5893.50)', context);
  assert.match(shown.main, /5\.893,50\s*Ft/);
  assert.equal(shown.secondary, '', 'no approximate amount without a rate');

  await vm.runInContext('loadExpenseViewRate()', context);
  shown = vm.runInContext('expenseViewAmounts(5893.50)', context);
  assert.match(shown.main, /5\.893,50\s*Ft/);
  assert.match(shown.secondary, /^≈ .*€/);

  shown = vm.runInContext('expenseViewAmounts(18615.04,{originalCurrency:"EUR",originalAmount:50})', context);
  assert.match(shown.secondary, /50,00\s*€/);

  await vm.runInContext('toggleExpenseDisplayCurrency()', context);
  shown = vm.runInContext('expenseViewAmounts(18615.04,{originalCurrency:"EUR",originalAmount:50})', context);
  assert.match(shown.main, /50,00\s*€/);
  assert.match(shown.secondary, /18\.615,04\s*Ft/);
  assert.match(vm.runInContext('expenseViewMarkup(-100)', context), /≈ -0,27\s*€/);
  assert.match(vm.runInContext('expenseViewMarkup(100,null,true)', context), /≈ \+0,27\s*€/);
  assert.equal(stored.get('sw_exp_view_TEST-HUNGARY_Raf'), 'EUR');
  console.log('PASS: ledger stays HUF; secondary EUR and display preference switch correctly');
})().catch(error => { console.error(error); process.exitCode = 1; });
