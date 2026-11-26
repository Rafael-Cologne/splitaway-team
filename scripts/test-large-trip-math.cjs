const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('public/index.html', 'utf8');
const between = (start, end) => html.slice(html.indexOf(`function ${start}(`), html.indexOf(`function ${end}(`, html.indexOf(`function ${start}(`)));
const cents = amount => Math.round(amount * 100);
let cases = 0;

for (const count of [1, 2, 3, 4, 5, 10, 20, 30]) {
  const names = Array.from({ length: count }, (_, i) => `Person ${i + 1}`);
  const expenses = [];
  const contributions = names.map(name => ({ member: name, amount: 100 }));
  for (let i = 0; i < 120; i++) {
    const participants = names.filter((_, j) => (j + i) % 4 !== 0);
    if (!participants.length) participants.push(names[0]);
    expenses.push({
      amount: (i * 137 + 101) / 100,
      paidBy: i % 5 === 0 ? '_treasury' : names[(i * 7) % count],
      fromTreasury: i % 5 === 0,
      participants
    });
  }
  expenses.push({ amount: 1.01, paidBy: names[0], fromTreasury: false, participants: names });
  if (count >= 2) expenses.push({ amount: 7.03, paidBy: names[1], fromTreasury: false, participants: names.slice(0, 2), splits: { [names[0]]: 3.52, [names[1]]: 3.51 } });
  if (count >= 4) {
    expenses.push({ amount: 17.17, paidBy: names[2], fromTreasury: false, participants: names.slice(0, 4), pairReps: { [[names[2], names[3]].join('\x1f')]: names[2] } });
    expenses.push({ amount: 4.01, paidBy: '_treasury', fromTreasury: true, participants: names.slice(0, 2), splits: { [names[0]]: 2, [names[1]]: 2.01 } });
  }
  const groups = count >= 4 ? [{ type: 'couple', members: names.slice(2, 4) }] : [];
  const state = { members: names.map(name => ({ name })), groups, expenses, settledDebts: [], treasury: { contributions } };
  const context = { S: state, groupOf: name => groups.find(group => group.members.includes(name)) };
  vm.createContext(context);
  vm.runInContext(between('pairRepEntryForExp', 'balCents'), context);
  vm.runInContext(between('balCents', 'buildGroupedDebts'), context);
  vm.runInContext(between('calcTreasuryStats', 'renderTreasury'), context);

  const privateExpenses = expenses.filter(e => !e.fromTreasury);
  const cashExpenses = expenses.filter(e => e.fromTreasury);
  const total = expenses.reduce((sum, e) => sum + cents(e.amount), 0);
  assert.equal(total, privateExpenses.reduce((s, e) => s + cents(e.amount), 0) + cashExpenses.reduce((s, e) => s + cents(e.amount), 0));
  for (const expense of expenses) {
    const shares = context.expenseSharesCents(expense);
    assert.equal(Object.values(shares).reduce((sum, value) => sum + value, 0), cents(expense.amount), `${count} people: expense shares`);
  }
  const personal = context.calcBal();
  assert.equal(Object.values(personal).reduce((sum, value) => sum + cents(value), 0), 0, `${count} people: personal zero sum`);
  const payments = context.simplify(personal);
  assert.equal(payments.reduce((sum, payment) => sum + cents(payment.amount), 0), Object.values(personal).reduce((sum, value) => sum + Math.max(0, cents(value)), 0), `${count} people: settlements`);
  const afterPayments = { ...personal };
  for (const payment of payments) {
    afterPayments[payment.from] += payment.amount;
    afterPayments[payment.to] -= payment.amount;
  }
  assert(Object.values(afterPayments).every(value => cents(value) === 0), `${count} people: no residual debt`);

  const cash = context.calcTreasuryStats();
  const contributed = Object.values(cash).reduce((sum, row) => sum + cents(row.contributed), 0);
  const spent = Object.values(cash).reduce((sum, row) => sum + cents(row.spent), 0);
  const remaining = Object.values(cash).reduce((sum, row) => sum + cents(row.remaining), 0);
  assert.equal(contributed, count * 10000);
  assert.equal(spent, cashExpenses.reduce((sum, expense) => sum + cents(expense.amount), 0), `${count} people: cash spending`);
  assert.equal(remaining, contributed - spent, `${count} people: cash remaining`);
  assert.equal(Object.values(context.calcExpenseShares()).reduce((sum, value) => sum + cents(value), 0), total, `${count} people: statistics shares`);
  cases++;
}
console.log(`PASS: ${cases} trip sizes, 1–30 people, 960+ expenses, cent-perfect shares, debts, settlements and cash`);
