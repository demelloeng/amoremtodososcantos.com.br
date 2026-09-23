const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/direct-sales.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/prices.json'), 'utf8'));
const quote = {is_curitiba: false, charged_amount_cents: 1246, real_amount_cents: 1246, delivery_days: 2};
const summary = {destination_cep: '01419100', book_amount_cents: 5990, shipping_amount_cents: 1246,
  real_shipping_amount_cents: 1246, total_amount_cents: 7236, delivery_days: 2, pricing_rule: 'provider_quote'};
const changed = {...summary, book_amount_cents: 6490, shipping_amount_cents: 1500,
  real_shipping_amount_cents: 1600, total_amount_cents: 7990, delivery_days: 3, pricing_rule: 'outside_curitiba'};

function element() {
  return {hidden: false, disabled: false, textContent: '', value: '', dataset: {}, listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; }, fire(type) { this.listeners[type](); },
    setAttribute() {}, removeAttribute() {}, querySelector() { return element(); }};
}
function response(status, data) { return {ok: status >= 200 && status < 300, status, json: async () => data}; }
async function flush() { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); }
async function harness(active = true) {
  const ids = Object.fromEntries([
    'direct-cep', 'direct-card', 'direct-flow', 'direct-coming-soon', 'direct-buy', 'direct-error',
    'direct-loading', 'direct-summary', 'amazon-kindle-unlimited', 'direct-payment-methods',
    'direct-payment-installments', 'direct-quote', 'direct-region', 'direct-book', 'direct-shipping',
    'direct-real', 'direct-real-row', 'direct-days', 'direct-total'
  ].map(id => [id, element()]));
  ids['direct-cep'].value = '01419100'; ids['direct-buy'].disabled = true;
  const pending = [], opened = [], data = structuredClone(config);
  data.direct_sale.status = active ? 'active' : 'coming_soon';
  const fetch = (url, options) => url === '/config/prices.json' ? Promise.resolve(response(200, data)) :
    new Promise(resolve => pending.push({url, body: JSON.parse(options.body), resolve}));
  vm.runInNewContext(source, {document: {getElementById: id => ids[id], querySelectorAll: () => []},
    window: {open: (...args) => opened.push(args)}, fetch, Intl, Error});
  await flush();
  return {ids, pending, opened, flush,
    respond(index, status, payload) { pending[index].resolve(response(status, payload)); }};
}

test('quote stores server summary; checkout sends it and opens stable URL', async () => {
  const h = await harness();
  h.ids['direct-quote'].fire('click');
  assert.equal(h.pending[0].body.destination_cep, '01419100');
  h.respond(0, 200, {ok: true, quote, summary}); await h.flush();
  assert.equal(h.ids['direct-book'].textContent, 'R$ 59,90');
  assert.equal(h.ids['direct-total'].textContent, 'R$ 72,36');
  assert.equal(h.ids['direct-summary'].hidden, false);
  h.ids['direct-buy'].fire('click');
  assert.deepEqual(h.pending[1].body.confirmed_summary, summary);
  h.respond(1, 200, {ok: true, checkout: {url: 'https://example.test/checkout'}, summary}); await h.flush();
  assert.equal(h.opened.length, 1);
  assert.equal(h.opened[0][0], 'https://example.test/checkout');
});

test('changed quote requires a second click and uses updated server values', async () => {
  const h = await harness();
  h.ids['direct-quote'].fire('click'); h.respond(0, 200, {ok: true, quote, summary}); await h.flush();
  h.ids['direct-buy'].fire('click');
  h.respond(1, 409, {ok: false, error: {code: 'QUOTE_CHANGED', message: 'Os valores foram atualizados.'},
    quote: {...quote, charged_amount_cents: 1500, real_amount_cents: 1600, delivery_days: 3}, summary: changed});
  await h.flush();
  assert.equal(h.opened.length, 0);
  assert.equal(h.ids['direct-error'].textContent,
    'Os valores foram atualizados. Confira e clique em Comprar novamente.');
  assert.equal(h.ids['direct-buy'].disabled, false);
  assert.equal(h.ids['direct-book'].textContent, 'R$ 64,90');
  assert.equal(h.ids['direct-shipping'].textContent, 'R$ 15,00');
  assert.equal(h.ids['direct-real'].textContent, 'R$ 16,00');
  assert.equal(h.ids['direct-days'].textContent, '3 dias úteis');
  assert.equal(h.ids['direct-total'].textContent, 'R$ 79,90');
  assert.equal(h.ids['direct-real-row'].hidden, false);
  h.ids['direct-buy'].fire('click');
  assert.deepEqual(h.pending[2].body.confirmed_summary, changed);
  h.respond(2, 200, {ok: true, checkout: {url: 'https://example.test/second'}, summary: changed}); await h.flush();
  assert.equal(h.opened[0][0], 'https://example.test/second');
});

test('CEP edits invalidate quote and stale quote and checkout replies', async () => {
  const h = await harness();
  h.ids['direct-quote'].fire('click');
  h.ids['direct-cep'].value = '80000000'; h.ids['direct-cep'].fire('input');
  h.respond(0, 200, {ok: true, quote, summary}); await h.flush();
  assert.equal(h.ids['direct-summary'].hidden, true);
  assert.equal(h.ids['direct-buy'].disabled, true);
  h.ids['direct-quote'].fire('click');
  h.respond(1, 200, {ok: true, quote, summary: {...summary, destination_cep: '80000000'}}); await h.flush();
  h.ids['direct-buy'].fire('click');
  h.ids['direct-cep'].value = '80000001'; h.ids['direct-cep'].fire('input');
  h.respond(2, 200, {ok: true, checkout: {url: 'https://example.test/stale'}}); await h.flush();
  assert.equal(h.opened.length, 0);
  assert.equal(h.ids['direct-summary'].hidden, true);
  assert.equal(h.ids['direct-buy'].disabled, true);
});

test('coming soon leaves checkout flow unavailable', async () => {
  const h = await harness(false);
  assert.equal(h.ids['direct-flow'].hidden, true);
  h.ids['direct-quote'].fire('click'); h.ids['direct-buy'].fire('click');
  assert.equal(h.pending.length, 0);
  assert.equal(h.opened.length, 0);
});
