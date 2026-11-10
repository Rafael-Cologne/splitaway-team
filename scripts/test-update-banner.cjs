const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('public/index.html', 'utf8');
const start = html.indexOf('function showUpdateBanner(){');
const end = html.indexOf('// Онлайн/офлайн индикатор', start);
assert(start >= 0 && end > start);

const nodes = [];
const document = {
  body: { prepend(node) { nodes.unshift(node); } },
  getElementById(id) { return nodes.find(node => node.id === id) || null; },
  createElement(tag) {
    return {
      tag,
      style: {},
      attributes: {},
      children: [],
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, listener) { this[name] = listener; },
      append(...children) { this.children.push(...children); },
    };
  },
};
let reloads = 0;
const context = { document, t: key => key, location: { reload() { reloads++; } } };
vm.createContext(context);
vm.runInContext(html.slice(start, end), context);
context.showUpdateBanner();
context.showUpdateBanner();
assert.equal(nodes.length, 1, 'only one banner should be shown');
const [message, button] = nodes[0].children;
assert.match(nodes[0].style.cssText, /env\(safe-area-inset-top/);
assert.match(button.style.cssText, /min-height:44px/);
assert.match(message.style.cssText, /flex:1/);
button.click();
assert.equal(reloads, 1);
console.log('PASS: update banner respects iPhone safe area, keeps 44px button, and reloads once');
