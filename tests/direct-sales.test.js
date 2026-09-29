const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/direct-sales.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/prices.json'), 'utf8'));
const quote = {is_curitiba: false, charged_amount_cents: 1246, real_amount_cents: 1246, delivery_days: 2};

function makeSummary(quantity = 1, overrides = {}) {
  return {destination_cep: '01419100', quantity, unit_price_cents: 5990,
    subtotal_cents: 5990 * quantity, shipping_amount_cents: 1246, real_shipping_amount_cents: 1246,
    total_amount_cents: 5990 * quantity + 1246, delivery_days: 2, pricing_rule: 'provider_quote',
    provider_id: 'superfrete', service_id: '31', service_name: 'LOGGI', ...overrides};
}
const summary = makeSummary();
const changed = makeSummary(1, {unit_price_cents: 6490, subtotal_cents: 6490, shipping_amount_cents: 1500,
  real_shipping_amount_cents: 1600, total_amount_cents: 7990, delivery_days: 3, pricing_rule: 'outside_curitiba'});
const order = {order_id: 'ord-1', quantity: 1, payment_status: 'PENDING', reservation_status: 'RESERVED',
  fulfillment_status: 'PENDING_PAYMENT', checkout_state: 'CHECKOUT_KNOWN', checkout_url: 'https://example.test/checkout'};

const IDS = [
  'direct-cep', 'direct-card', 'direct-flow', 'direct-coming-soon', 'direct-buy', 'direct-error',
  'direct-loading', 'direct-summary', 'amazon-kindle-unlimited', 'direct-payment-methods',
  'direct-payment-installments', 'direct-quote', 'direct-region', 'direct-unit', 'direct-quantity-summary',
  'direct-subtotal', 'direct-shipping', 'direct-real', 'direct-real-row', 'direct-days', 'direct-total',
  'checkout-return', 'direct-quantity', 'direct-quantity-minus', 'direct-quantity-plus',
  'direct-quantity-contact', 'direct-availability', 'direct-order-status', 'direct-active-offer'
];

function element() {
  return {hidden: false, disabled: false, textContent: '', value: '', dataset: {}, listeners: {},
    attributes: {},
    getBoundingClientRect() { return {top: 0, bottom: 200}; },
    addEventListener(type, fn) { this.listeners[type] = fn; }, fire(type) { this.listeners[type](); },
    setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute() {},
    querySelector() { return element(); }};
}
function response(status, data) { return {ok: status >= 200 && status < 300, status, json: async () => data}; }
async function flush() { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); }

function storage(initial = {}) {
  const data = {...initial};
  return {data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }};
}

async function harness(active = true, options = {}) {
  const ids = Object.fromEntries(IDS.map(id => [id, element()]));
  ids['direct-cep'].value = '01419100'; ids['direct-buy'].disabled = true;
  ids['direct-card'].hidden = true; ids['direct-flow'].hidden = true; ids['checkout-return'].hidden = true;
  const pending = [], opened = [], popupWindows = [], requests = [], commerceEvents = [], observers = [], data = structuredClone(config);
  data.direct_sale.status = options.status || (active ? 'active' : 'coming_soon');
  let uuidCounter = 0;
  const session = options.session || storage();
  const local = storage();
  const fetch = (url, init = {}) => {
    requests.push({url, init});
    if (url === '/config/prices.json') return Promise.resolve(response(200, data));
    if (url.endsWith('/v1/prices')) {
      return options.inventory ? Promise.resolve(response(200, {ok: true, inventory_status: options.inventory}))
        : Promise.reject(new Error('offline'));
    }
    return new Promise((resolve, reject) => pending.push({url, init, body: init.body ? JSON.parse(init.body) : null, resolve, reject}));
  };
  const window = {
    location: {search: options.search || ''},
    innerHeight: 800,
    sessionStorage: session,
    localStorage: local,
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(item => item !== fn); },
    dispatchEvent: event => { if (event.type === 'fissura:commerce') commerceEvents.push(event.detail); },
    open: (...args) => {
      opened.push(args);
      if (options.blockPopup) return null;
      const popup = {location: 'about:blank', opener: {}, closed: false,
        document: {title: '', body: {textContent: ''}}, close() { this.closed = true; }};
      popupWindows.push(popup);
      return popup;
    }
  };
  const crypto = {randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`};
  function CustomEvent(type, init = {}) { this.type = type; this.detail = init.detail; }
  function IntersectionObserver(callback) {
    this.observe = target => observers.push({callback, target, observer: this});
    this.disconnect = () => {};
  }
  vm.runInNewContext(source, {document: {getElementById: id => ids[id], querySelectorAll: () => []},
    window, fetch, Intl, Error, URLSearchParams, JSON, crypto, encodeURIComponent, CustomEvent,
    IntersectionObserver: options.noIntersectionObserver ? undefined : IntersectionObserver});
  await flush();
  const api = pending.filter(item => !item.url.endsWith('/v1/prices'));
  return {ids, pending, opened, popupWindows, requests, session, local, flush, commerceEvents, observers,
    respond(index, status, payload) { pending[index].resolve(response(status, payload)); },
    reject(index, error) { pending[index].reject(error); }};
}

async function quoted(h, quantity = 1, payload = makeSummary(quantity)) {
  for (let i = 1; i < quantity; i++) h.ids['direct-quantity-plus'].fire('click');
  h.ids['direct-quote'].fire('click');
  const index = h.pending.length - 1;
  h.respond(index, 200, {ok: true, quote, summary: payload}); await h.flush();
  return index;
}

// --- markup ----------------------------------------------------------------

test('markup exposes accessible quantity controls, contact and status regions', () => {
  for (const id of ['direct-quantity', 'direct-quantity-minus', 'direct-quantity-plus',
    'direct-quantity-contact', 'direct-unit', 'direct-quantity-summary', 'direct-subtotal',
    'direct-availability', 'direct-order-status']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(html, /aria-label="Diminuir quantidade"/);
  assert.match(html, /aria-label="Aumentar quantidade"/);
  assert.match(html, /mailto:marcos@demelloeng\.com\.br/);
  assert.doesNotMatch(html, /desconto/i);
  assert.equal((html.match(/class="voice"/g) || []).length, 6);
  assert.match(html, /data-analytics-event="click_amazon"/);
  assert.match(html, /<script src="assets\/analytics\.js" defer><\/script>/);
  assert.match(html, /flim/i);
  assert.match(html, /styles\.css\?v=/);
});

test('direct purchase is its own block and keeps Skoob as its review channel', () => {
  const directAt = html.indexOf('<div class="card-group card-group--direct">');
  const alternativesAt = html.indexOf('Prefere comprar por outra plataforma?');
  const retailers = html.slice(alternativesAt, html.indexOf('</section>', alternativesAt));
  const direct = html.slice(directAt, html.indexOf('</article>', directAt));
  const directText = direct.replace(/<[^>]+>/g, '');
  assert.ok(directAt > 0 && alternativesAt > directAt, 'direct offer must precede retailer alternatives in DOM order');
  for (const channel of ['amazon', 'uiclap', 'clube_autores']) {
    assert.match(retailers, new RegExp(`data-price-channel="${channel}"`), channel);
  }
  assert.doesNotMatch(retailers, /id="direct-card"|skoob\.com/i);
  assert.match(direct, /id="direct-card"/);
  assert.doesNotMatch(direct, /skoob\.com/i);
  for (const approved of ['AGORA DÁ PRA COMPRAR DIRETO COMIGO.', 'O livro já está aqui — impresso, esperando autógrafo e endereço.',
    'Nada de esperar produzir o exemplar: confirmou o pagamento, eu preparo e posto até o próximo dia útil.',
    'R$ 49,99 + frete', 'Autografado + marca-páginas', 'CALCULAR FRETE']) {
    assert.ok(directText.includes(approved), approved);
  }
  assert.ok(html.indexOf('skoob.com.br/pt/book/122687117') > html.indexOf('</article>', directAt));
});

test('hidden and coming soon states keep retailer alternatives usable', async () => {
  const hidden = await harness(false, {status: 'hidden'});
  assert.equal(hidden.ids['direct-card'].hidden, true);

  const coming = await harness(false, {status: 'coming_soon'});
  assert.equal(coming.ids['direct-card'].hidden, false);
  assert.equal(coming.ids['direct-coming-soon'].hidden, false);
  assert.equal(coming.ids['direct-active-offer'].hidden, true);
  assert.equal(coming.ids['direct-payment-methods'].hidden, true);
  assert.equal(coming.ids['direct-payment-installments'].hidden, true);
  assert.equal(coming.ids['direct-flow'].hidden, true);
  assert.equal(coming.opened.length, 0);

  const active = await harness(true, {status: 'active'});
  assert.equal(active.ids['direct-card'].hidden, false);
  assert.equal(active.ids['direct-coming-soon'].hidden, true);
  assert.equal(active.ids['direct-active-offer'].hidden, false);
  assert.equal(active.ids['direct-payment-methods'].hidden, false);
  assert.equal(active.ids['direct-payment-installments'].hidden, false);
  assert.equal(active.ids['direct-flow'].hidden, false);
  assert.match(active.ids['direct-payment-methods'].textContent, /Pix ou cartão/);
  assert.match(active.ids['direct-payment-installments'].textContent, /até 2x/);
  for (const url of ['https://www.amazon.com.br/dp/B0HB7PR45H', 'https://loja.uiclap.com/titulo/ua200325',
    'https://clubedeautores.com.br/livro/amor-em-todos-os-cantos-2']) assert.ok(html.includes(url));
});

test('home names the work canonically and drops unavailable content', () => {
  assert.match(html, /PERGUNTAS SOBRE AMOR EM TODOS OS CANTOS/);
  assert.match(html, /<summary>Por que “Amor em todos os cantos”\?<\/summary>/);
  assert.match(html, /<summary>Por que Fissura\?<\/summary><p>Fissura é o subtítulo/);
  assert.match(html, /IDEIAS E CONCEITOS DA OBRA/);
  assert.doesNotMatch(html, /<p>Fissura está disponível|PERGUNTAS SOBRE FISSURA|ATRAVESSAM FISSURA|Em Fissura,/);
  assert.doesNotMatch(html, /voices-nav/);
});

test('home preserves the approved author bio and pending manifesto', () => {
  for (const copy of [
    'LER O MANIFESTO DE AMOR',
    'EM BREVE',
    'Marcos de Mello Silva é engenheiro civil, autor paranaense e escritor de primeira viagem — expressão que, no caso dele, envolve mais cidades, planilhas e crises existenciais do que seria recomendável.',
    'Sua escrita combina oralidade, humor, memória afetiva, música brasileira, cultura pop e uma atenção quase técnica aos pequenos desastres da vida adulta. Entre suas principais referências estão Manuel Bandeira, Clarice Lispector, Guimarães Rosa, Jô Soares e Paulo Gustavo, além de artistas que transformam sentimento, ritmo e palavra em formas de observar o Brasil.',
    'Quando não está tentando fazer a realidade caber em algum projeto, Marcos escreve sobre pessoas que também descobriram que a vida raramente respeita planta, cronograma ou memorial descritivo.',
    'Amor em todos os cantos — Fissura é seu primeiro romance.',
    'Amor em todos os cantos nasceu de uma ferida.'
  ]) assert.ok(html.includes(copy), copy);

  assert.match(html, /<span class="pending-label">\s*LER O MANIFESTO DE AMOR<br>\s*<strong>EM BREVE<\/strong>\s*<\/span>/);
  assert.doesNotMatch(html, /Paranaense, Marcos de Mello Silva escreve a partir do encontro entre cidades/);
  assert.doesNotMatch(html, /Engenheiro civil · autor de Amor em todos os cantos/);
});

// --- quantity controls ----------------------------------------------------

test('quantity starts at one and stays within one to three', async () => {
  const h = await harness();
  const qty = h.ids['direct-quantity'];
  assert.equal(qty.textContent, '1');
  assert.equal(h.ids['direct-quantity-minus'].disabled, true);
  h.ids['direct-quantity-minus'].fire('click');
  assert.equal(qty.textContent, '1');
  h.ids['direct-quantity-plus'].fire('click'); h.ids['direct-quantity-plus'].fire('click');
  assert.equal(qty.textContent, '3');
  assert.equal(h.ids['direct-quantity-minus'].disabled, false);
  assert.equal(h.ids['direct-quantity-contact'].hidden, true);
  h.ids['direct-quantity-plus'].fire('click');
  assert.equal(qty.textContent, '3');
  assert.equal(h.ids['direct-quantity-contact'].hidden, false);
  h.ids['direct-quantity-minus'].fire('click');
  assert.equal(qty.textContent, '2');
  assert.equal(h.ids['direct-quantity-contact'].hidden, true);
});

test('quote sends quantity and renders unit, subtotal, shipping, deadline and total', async () => {
  const h = await harness();
  await quoted(h, 3);
  const last = h.pending[h.pending.length - 1];
  assert.deepEqual(last.body, {destination_cep: '01419100', quantity: 3});
  assert.equal(h.ids['direct-quantity-summary'].textContent, '3');
  assert.equal(h.ids['direct-unit'].textContent, 'R$ 59,90');
  assert.equal(h.ids['direct-subtotal'].textContent, 'R$ 179,70');
  assert.equal(h.ids['direct-shipping'].textContent, 'R$ 12,46');
  assert.equal(h.ids['direct-days'].textContent, '2 dias úteis');
  assert.equal(h.ids['direct-total'].textContent, 'R$ 192,16');
  assert.equal(h.ids['direct-buy'].disabled, false);
  assert.deepEqual(structuredClone(h.commerceEvents.at(-1)), {event: 'add_shipping_info', currency: 'BRL', value: 192.16,
    quantity: 3, item_id: 'fissura_fisico_direto', item_name: 'Amor em todos os cantos — Fissura', sales_channel: 'direct'});
});

test('active offer emits view_item only after first real intersection', async () => {
  const h = await harness();
  assert.equal(h.commerceEvents.length, 0);
  assert.equal(h.observers.length, 1);
  h.observers[0].callback([{target: h.ids['direct-card'], isIntersecting: false, intersectionRatio: 0}], h.observers[0].observer);
  assert.equal(h.commerceEvents.length, 0);
  h.observers[0].callback([{target: h.ids['direct-card'], isIntersecting: true, intersectionRatio: 0.5}], h.observers[0].observer);
  h.observers[0].callback([{target: h.ids['direct-card'], isIntersecting: true, intersectionRatio: 1}], h.observers[0].observer);
  assert.equal(h.commerceEvents.filter(event => event.event === 'view_item').length, 1);
});

test('active offer measures a real viewport intersection when IntersectionObserver is unavailable', async () => {
  const h = await harness(true, {noIntersectionObserver: true});
  assert.equal(h.commerceEvents.filter(event => event.event === 'view_item').length, 1);
});

test('changing quantity invalidates the quote', async () => {
  const h = await harness();
  await quoted(h);
  h.ids['direct-quantity-plus'].fire('click');
  assert.equal(h.ids['direct-summary'].hidden, true);
  assert.equal(h.ids['direct-buy'].disabled, true);
});

test('quantity above three from the server shows only the email contact', async () => {
  const h = await harness();
  h.ids['direct-quote'].fire('click');
  h.respond(0, 400, {ok: false, error: {code: 'INVALID_QUANTITY', contact_email: 'marcos@demelloeng.com.br',
    message: 'Para mais de 3 exemplares, escreva para marcos@demelloeng.com.br.'}});
  await h.flush();
  assert.equal(h.ids['direct-quantity-contact'].hidden, false);
  assert.equal(h.ids['direct-buy'].disabled, true);
});

// --- commercial attempt -----------------------------------------------------

test('checkout sends quantity, summary and a stable attempt key', async () => {
  const h = await harness();
  await quoted(h);
  h.ids['direct-buy'].fire('click');
  const first = h.pending[1].body;
  assert.deepEqual(first.confirmed_summary, summary);
  assert.equal(first.quantity, 1);
  assert.match(first.idempotency_key, /^[0-9a-f-]{36}$/);
  h.respond(1, 202, {ok: false, error: {code: 'CHECKOUT_IN_PROGRESS', message: 'Preparando.'},
    order, access_token: 'tok'}); await h.flush();
  h.ids['direct-buy'].fire('click');
  assert.equal(h.pending[2].body.idempotency_key, first.idempotency_key);
});

test('same quote reused keeps the key; material changes create a new key', async () => {
  const h = await harness();
  await quoted(h);
  h.ids['direct-buy'].fire('click');
  const key1 = h.pending[1].body.idempotency_key;
  h.respond(1, 409, {ok: false, error: {code: 'QUOTE_CHANGED', message: 'x'}, quote, summary: changed});
  await h.flush();
  h.ids['direct-buy'].fire('click');
  const key2 = h.pending[2].body.idempotency_key;
  assert.notEqual(key1, key2);
  assert.deepEqual(h.pending[2].body.confirmed_summary, changed);
  h.respond(2, 202, {ok: false, error: {code: 'CHECKOUT_IN_PROGRESS', message: 'x'}, order, access_token: 't'});
  await h.flush();
  // Same CEP, quantity and identical summary after requote: same attempt.
  await quoted(h, 1, changed);
  h.ids['direct-buy'].fire('click');
  assert.equal(h.pending[h.pending.length - 1].body.idempotency_key, key2);
  h.respond(h.pending.length - 1, 202, {ok: false, error: {code: 'CHECKOUT_IN_PROGRESS', message: 'x'}, order, access_token: 't'});
  await h.flush();
  // New CEP: new attempt.
  h.ids['direct-cep'].value = '80000000'; h.ids['direct-cep'].fire('input');
  await quoted(h, 1, makeSummary(1, {destination_cep: '80000000'}));
  h.ids['direct-buy'].fire('click');
  assert.notEqual(h.pending[h.pending.length - 1].body.idempotency_key, key2);
});

test('changed quote requires a second click and shows updated server values', async () => {
  const h = await harness();
  await quoted(h);
  h.ids['direct-buy'].fire('click');
  h.respond(1, 409, {ok: false, error: {code: 'QUOTE_CHANGED', message: 'x'},
    quote: {...quote, charged_amount_cents: 1500, real_amount_cents: 1600, delivery_days: 3}, summary: changed});
  await h.flush();
  assert.equal(h.popupWindows[0].closed, true);
  assert.equal(h.ids['direct-error'].textContent, 'Os valores foram atualizados. Confira e clique em Comprar novamente.');
  assert.equal(h.ids['direct-unit'].textContent, 'R$ 64,90');
  assert.equal(h.ids['direct-real-row'].hidden, false);
  assert.equal(h.ids['direct-total'].textContent, 'R$ 79,90');
  assert.equal(h.ids['direct-buy'].disabled, false);
});

// --- popup, outcomes and storage -------------------------------------------

test('popup opens synchronously, waits, then receives the checkout URL', async () => {
  const h = await harness();
  await quoted(h);
  h.ids['direct-buy'].fire('click');
  assert.equal(h.commerceEvents.at(-1).event, 'begin_checkout');
  assert.equal(h.opened.length, 1);
  assert.equal(h.opened[0][0], 'about:blank');
  assert.match(h.popupWindows[0].document.body.textContent, /aguarde|preparando/i);
  h.respond(1, 200, {ok: true, checkout: {url: 'https://example.test/checkout'}, order,
    access_token: 'secret-token', summary});
  await h.flush();
  assert.equal(h.popupWindows[0].location, 'https://example.test/checkout');
  assert.equal(h.commerceEvents.at(-1).event, 'direct_checkout_created');
  const saved = JSON.parse(h.session.data['ma-fissura:order']);
  assert.deepEqual(saved, {order_id: 'ord-1', access_token: 'secret-token'});
  assert.equal(JSON.stringify(h.local.data).includes('secret-token'), false);
});

test('double click cannot duplicate checkout attempt or begin_checkout', async () => {
  const h = await harness();
  await quoted(h);
  h.ids['direct-buy'].fire('click'); h.ids['direct-buy'].fire('click');
  assert.equal(h.pending.filter(item => item.url.endsWith('/v1/checkout')).length, 1);
  assert.equal(h.commerceEvents.filter(event => event.event === 'begin_checkout').length, 1);
  assert.equal(h.opened.length, 1);
});

test('each successful quote emits one shipping event and a new valid quote can emit another', async () => {
  const h = await harness();
  await quoted(h);
  assert.equal(h.commerceEvents.filter(event => event.event === 'add_shipping_info').length, 1);
  h.ids['direct-quote'].fire('click');
  h.respond(h.pending.length - 1, 200, {ok: true, quote, summary}); await h.flush();
  assert.equal(h.commerceEvents.filter(event => event.event === 'add_shipping_info').length, 2);
});

test('checkout failures expose only a sanitized technical code to commerce analytics', async () => {
  const h = await harness();
  await quoted(h);
  h.ids['direct-buy'].fire('click');
  h.respond(1, 502, {ok: false, error: {code: 'CHECKOUT_FAILED', message: 'CEP 01419-100 de Pessoa x@example.test'}});
  await h.flush();
  assert.deepEqual(structuredClone(h.commerceEvents.at(-1)), {event: 'direct_checkout_error', error_code: 'CHECKOUT_FAILED'});
  assert.equal(JSON.stringify(h.commerceEvents).includes('01419'), false);
  assert.equal(JSON.stringify(h.commerceEvents).includes('example.test'), false);
  assert.equal(h.commerceEvents.some(event => event.event === 'purchase'), false);
});

test('checkout network failure emits one sanitized error and keeps the UI recoverable', async () => {
  const h = await harness();
  await quoted(h);
  h.ids['direct-buy'].fire('click');
  h.reject(1, new Error('network failed for CEP 01419-100 and x@example.test'));
  await h.flush();
  const errors = h.commerceEvents.filter(event => event.event === 'direct_checkout_error');
  assert.equal(h.commerceEvents.filter(event => event.event === 'begin_checkout').length, 1);
  assert.equal(errors.length, 1);
  assert.deepEqual(structuredClone(errors[0]), {event: 'direct_checkout_error', error_code: 'CHECKOUT_REQUEST_FAILED'});
  assert.equal(h.commerceEvents.some(event => event.event === 'direct_checkout_created'), false);
  assert.equal(h.commerceEvents.some(event => event.event === 'purchase'), false);
  assert.doesNotMatch(JSON.stringify(errors), /network failed|01419|example\.test/);
  assert.equal(h.ids['direct-buy'].disabled, false);
});

test('invalid checkout response emits direct_checkout_error only once', async () => {
  const h = await harness();
  await quoted(h);
  h.ids['direct-buy'].fire('click');
  h.respond(1, 200, {ok: true}); await h.flush();
  const errors = h.commerceEvents.filter(event => event.event === 'direct_checkout_error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].error_code, 'INVALID_CHECKOUT_RESPONSE');
});

test('blocked popup aborts before any reservation', async () => {
  const h = await harness(true, {blockPopup: true});
  await quoted(h);
  h.ids['direct-buy'].fire('click');
  assert.equal(h.pending.length, 1);
  assert.match(h.ids['direct-error'].textContent, /janela/i);
  assert.equal(h.ids['direct-buy'].disabled, false);
});

test('checkout unknown closes popup, keeps order and never retries', async () => {
  const h = await harness();
  await quoted(h);
  h.ids['direct-buy'].fire('click');
  h.respond(1, 202, {ok: false, error: {code: 'CHECKOUT_UNKNOWN', message: 'Seu pedido está em verificação. Não tente pagar novamente.'},
    order: {...order, checkout_state: 'CHECKOUT_UNKNOWN', checkout_url: null}, access_token: 'tok'});
  await h.flush();
  assert.equal(h.popupWindows[0].closed, true);
  assert.match(h.ids['direct-error'].textContent, /verificação/);
  assert.equal(h.ids['direct-buy'].disabled, true);
  h.ids['direct-buy'].fire('click');
  assert.equal(h.pending.length, 2);
  assert.ok(h.session.data['ma-fissura:order']);
});

test('stock unavailable shows public message without counts', async () => {
  const h = await harness();
  await quoted(h);
  h.ids['direct-buy'].fire('click');
  h.respond(1, 409, {ok: false, error: {code: 'STOCK_UNAVAILABLE', message: 'Exemplares temporariamente indisponíveis.'},
    inventory_status: 'TEMPORARILY_UNAVAILABLE'});
  await h.flush();
  assert.equal(h.popupWindows[0].closed, true);
  assert.match(h.ids['direct-error'].textContent, /indisponíveis/);
  assert.equal(h.ids['direct-buy'].disabled, true);
});

test('expired or failed orders require a new quote', async () => {
  for (const [status, code] of [[409, 'ORDER_EXPIRED'], [502, 'CHECKOUT_FAILED'], [409, 'IDEMPOTENCY_CONFLICT']]) {
    const h = await harness();
    await quoted(h);
    h.ids['direct-buy'].fire('click');
    h.respond(1, status, {ok: false, error: {code, message: 'Faça uma nova cotação.'}});
    await h.flush();
    assert.equal(h.popupWindows[0].closed, true, code);
    assert.equal(h.ids['direct-buy'].disabled, true, code);
    assert.equal(h.ids['direct-summary'].hidden, true, code);
  }
});

test('inventory temporarily unavailable disables the flow publicly', async () => {
  const h = await harness(true, {inventory: 'TEMPORARILY_UNAVAILABLE'});
  assert.equal(h.ids['direct-availability'].hidden, false);
  assert.match(h.ids['direct-availability'].textContent, /temporariamente/i);
  h.ids['direct-quote'].fire('click');
  assert.equal(h.pending.length, 0);
});

test('CEP edits invalidate quote and stale replies', async () => {
  const h = await harness();
  h.ids['direct-quote'].fire('click');
  h.ids['direct-cep'].value = '80000000'; h.ids['direct-cep'].fire('input');
  h.respond(0, 200, {ok: true, quote, summary}); await h.flush();
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

// --- return and authenticated status ---------------------------------------

for (const [state, message] of [['success', 'não confirma o pagamento'], ['cancel', 'cancelada'], ['expired', 'expirou']]) {
  test(`checkout return ${state} reports only the navigation state`, async () => {
    const h = await harness(true, {search: `?checkout=production-${state}`});
    assert.equal(h.ids['checkout-return'].hidden, false);
    assert.match(h.ids['checkout-return'].textContent.toLowerCase(), new RegExp(message));
    assert.doesNotMatch(h.ids['checkout-return'].textContent.toLowerCase(), /pagamento confirmado|estoque/);
    assert.deepEqual(structuredClone(h.commerceEvents[0]), {event: 'direct_checkout_return', return_state: `production-${state}`});
    assert.equal(h.commerceEvents.some(event => event.event === 'purchase'), false);
  });
}

test('unrecognized checkout return state is neither shown nor measured', async () => {
  const h = await harness(true, {search: '?checkout=production-paid'});
  assert.equal(h.ids['checkout-return'].hidden, true);
  assert.equal(h.commerceEvents.some(event => event.event === 'direct_checkout_return'), false);
});

test('return queries order status with bearer header, never URL token', async () => {
  const session = storage({'ma-fissura:order': JSON.stringify({order_id: 'ord-1', access_token: 'secret-token'})});
  const h = await harness(true, {search: '?checkout=production-success&order_id=ord-1', session});
  const request = h.pending.find(item => item.url.includes('/v1/orders/'));
  assert.ok(request);
  assert.equal(request.url.endsWith('/v1/orders/ord-1'), true);
  assert.equal(request.url.includes('secret-token'), false);
  assert.equal(request.init.headers.Authorization, 'Bearer secret-token');
  request.resolve(response(200, {ok: true, order: {...order, payment_status: 'PAID', reservation_status: 'CONSUMED'}}));
  await h.flush();
  assert.equal(h.ids['direct-order-status'].hidden, false);
  assert.match(h.ids['direct-order-status'].textContent, /Pagamento confirmado/);
});

test('pending status never claims payment and mismatched order is not queried', async () => {
  const session = storage({'ma-fissura:order': JSON.stringify({order_id: 'ord-1', access_token: 't'})});
  const h = await harness(true, {search: '?checkout=production-success&order_id=ord-1', session});
  const request = h.pending.find(item => item.url.includes('/v1/orders/'));
  request.resolve(response(200, {ok: true, order}));
  await h.flush();
  assert.doesNotMatch(h.ids['direct-order-status'].textContent, /Pagamento confirmado/);
  assert.match(h.ids['direct-order-status'].textContent, /ainda não/i);

  const other = await harness(true, {search: '?checkout=production-success&order_id=ord-2', session});
  assert.equal(other.pending.some(item => item.url.includes('/v1/orders/')), false);
});

test('storage failures do not break the flow', async () => {
  const broken = {getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {}};
  const h = await harness(true, {session: broken, search: '?checkout=production-success&order_id=ord-1'});
  await quoted(h);
  h.ids['direct-buy'].fire('click');
  h.respond(h.pending.length - 1, 200, {ok: true, checkout: {url: 'https://example.test/checkout'}, order, access_token: 't'});
  await h.flush();
  assert.equal(h.popupWindows[0].location, 'https://example.test/checkout');
});
