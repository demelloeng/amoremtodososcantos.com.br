const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const policy = fs.readFileSync(path.join(root, 'privacidade.html'), 'utf8');
const analyticsSource = fs.readFileSync(path.join(root, 'assets/analytics.js'), 'utf8');
const directSalesSource = fs.readFileSync(path.join(root, 'assets/direct-sales.js'), 'utf8');

function element(attributes = {}) {
  return {
    attributes,
    listeners: {},
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
    fire(type) { for (const listener of this.listeners[type] || []) listener(); },
    getAttribute(name) { return this.attributes[name] ?? null; }
  };
}

function analyticsPage() {
  const links = [];
  const ctas = [];
  const listeners = {};
  const calls = [];
  const document = {
    readyState: 'complete',
    querySelectorAll(selector) {
      if (selector === '[data-analytics-event]') return links;
      return selector === '[data-analytics-cta]' ? ctas : [];
    },
    addEventListener() {}
  };
  const window = {
    sa_event(name, metadata) { calls.push([name, metadata]); },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    dispatchEvent(event) { for (const listener of listeners[event.type] || []) listener(event); }
  };
  window.window = window;
  const context = {
    window,
    document,
    isFinite,
    CustomEvent: function (type, init = {}) { this.type = type; this.detail = init.detail; }
  };
  vm.createContext(context);
  return {window, context, links, ctas, calls, run() { vm.runInContext(analyticsSource, context); }};
}

test('public page loads the official Simple Analytics script after the queue placeholder', () => {
  const placeholderAt = html.indexOf('window.sa_event=window.sa_event||function()');
  const analyticsAt = html.indexOf('<script src="assets/analytics.js" defer></script>');
  const simpleAt = html.indexOf('<script async src="https://scripts.simpleanalyticscdn.com/latest.js"></script>');
  const directAt = html.indexOf('<script src="assets/direct-sales.js" defer></script>');
  assert.ok(placeholderAt > 0);
  assert.ok(placeholderAt < analyticsAt);
  assert.ok(simpleAt > placeholderAt && simpleAt < analyticsAt);
  assert.ok(analyticsAt < directAt);
  assert.doesNotMatch(html, /<noscript[^>]*>[^<]*simpleanalytics/is);
});

test('GA4 and analytics consent are absent from every repository text file', () => {
  const forbidden = [
    /googletagmanager\.com/i, /G-NGG2M69HNW/, /window\.gtag/, /ga-disable/,
    /fissura_privacy_prefs_v1/, /assets\/consent\.js/, /fissura:analytics-consent/, /Google Analytics 4/i
  ];
  const files = ['index.html', 'privacidade.html', 'assets/analytics.js', 'assets/direct-sales.js'];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
  }
  assert.equal(fs.existsSync(path.join(root, 'assets/consent.js')), false);
});

test('analytics consent banner and preference control are removed while the policy link remains', () => {
  assert.doesNotMatch(html, /id="privacy-banner"|id="privacy-accept"|id="privacy-reject"|Aceitar|Permitir medição/);
  assert.doesNotMatch(html, /id="privacy-preferences"|Preferências de privacidade/);
  assert.match(html, /href="privacidade\.html"[^>]*>Política de privacidade<\/a>/i);
});

test('every analytics event and the CEP lookup are declared in the policy', () => {
  const normalized = policy.replace(/\s+/g, ' ');
  for (const term of ['Compre aqui', 'Conheça a fic', 'confirmação de pagamento', 'ViaCEP']) {
    assert.ok(normalized.includes(term), term);
  }
  assert.doesNotMatch(policy, /Cloud Run|ma-fissura:/);
  assert.match(directSalesSource, /viacep\.com\.br/);
});

test('privacy policy describes Simple Analytics and preserves purchase processors', () => {
  const normalizedPolicy = policy.replace(/\s+/g, ' ');
  for (const term of ['Simple Analytics', 'estatísticas agregadas', 'cookies', 'localStorage', 'sessionStorage',
    'perfil individual', 'referrer', 'UTM', 'endereço IP', 'nome', 'e-mail', 'CPF', 'telefone', 'endereço', 'CEP',
    'Compra direta', 'Google Cloud', 'Firestore', 'Asaas', 'SuperFrete', 'Google Fonts', 'GitHub Pages']) {
    assert.ok(policy.includes(term), term);
  }
  for (const absent of ['Google Analytics 4', 'G-NGG2M69HNW', 'cookies _ga',
    'Preferências de privacidade', 'retirar o consentimento']) assert.ok(!policy.includes(absent), absent);
  assert.doesNotMatch(policy, /o site não trata nenhum dado pessoal/i);
  for (const stage of ['visualização da oferta', 'cálculo de frete concluído', 'início do checkout',
    'criação do checkout', 'falha técnica do checkout', 'retorno do checkout']) assert.ok(normalizedPolicy.includes(stage), stage);
});

test('retailer click sends only allowlisted flat metadata to sa_event', () => {
  const p = analyticsPage();
  const link = element({
    'data-analytics-event': 'click_amazon', 'data-retailer': 'amazon',
    'data-product-format': 'ebook_kindle', 'data-price': '9.90',
    href: 'https://www.amazon.com.br/dp/example?secret=1'
  });
  p.links.push(link);
  p.run();
  link.fire('click');
  assert.deepEqual(JSON.parse(JSON.stringify(p.calls)), [['click_amazon', {
    destination: 'amazon', retailer: 'Amazon', product_format: 'ebook_kindle', price: 9.9, currency: 'BRL'
  }]]);
});

test('all retailer event names remain in the public markup', () => {
  for (const event of ['click_amazon', 'click_uiclap', 'click_clube_autores']) {
    assert.match(html, new RegExp(`data-analytics-event="${event}"`));
  }
  assert.match(html, /data-retailer=/);
  assert.match(html, /data-product-format=/);
});

test('hero CTAs keep their anchors and carry internal analytics attributes', () => {
  const hero = html.match(/<div class="hero__actions">(.*?)<\/div>/s)[1];
  assert.match(hero, /<a class="button" href="#comprar" data-analytics-cta="click_compre_aqui" data-analytics-placement="hero" data-analytics-destination="comprar">COMPRE AQUI<\/a>/);
  assert.match(hero, /<a class="button button--outline" href="#a-fic" data-analytics-cta="click_conheca_fic" data-analytics-placement="hero" data-analytics-destination="a_fic">CONHEÇA A FIC<\/a>/);
  assert.doesNotMatch(hero, /data-analytics-event|data-retailer|data-price|data-product-format/);
  assert.equal((html.match(/data-analytics-cta=/g) || []).length, 2);
});

test('hero CTA clicks send one event each with only placement and destination', () => {
  const p = analyticsPage();
  const buy = element({'data-analytics-cta': 'click_compre_aqui', 'data-analytics-placement': 'hero',
    'data-analytics-destination': 'comprar', href: '#comprar'});
  const fic = element({'data-analytics-cta': 'click_conheca_fic', 'data-analytics-placement': 'hero',
    'data-analytics-destination': 'a_fic', href: '#a-fic'});
  const amazon = element({'data-analytics-event': 'click_amazon', 'data-retailer': 'amazon',
    'data-product-format': 'ebook_kindle', 'data-price': '9.90'});
  p.ctas.push(buy, fic);
  p.links.push(amazon);
  p.run();
  buy.fire('click');
  assert.deepEqual(JSON.parse(JSON.stringify(p.calls)), [
    ['click_compre_aqui', {placement: 'hero', destination: 'comprar'}]
  ]);
  fic.fire('click');
  assert.deepEqual(JSON.parse(JSON.stringify(p.calls.slice(1))), [
    ['click_conheca_fic', {placement: 'hero', destination: 'a_fic'}]
  ]);
  for (const [, metadata] of p.calls) {
    for (const key of ['retailer', 'price', 'product_format', 'currency']) assert.ok(!(key in metadata), key);
  }
  amazon.fire('click');
  assert.equal(p.calls.length, 3);
  assert.equal(p.calls[2][0], 'click_amazon');
  assert.equal(p.calls[2][1].retailer, 'Amazon');
});

test('hero CTAs are not also selected by the retailer click handler', () => {
  assert.doesNotMatch(html, /data-analytics-cta="[^"]*"[^>]*data-analytics-event|data-analytics-event="[^"]*"[^>]*data-analytics-cta/);
  const p = analyticsPage();
  const buy = element({'data-analytics-cta': 'click_compre_aqui', 'data-analytics-placement': 'hero',
    'data-analytics-destination': 'comprar'});
  p.ctas.push(buy);
  p.run();
  assert.equal((buy.listeners.click || []).length, 1);
});

test('commerce events are converted to flat Simple Analytics metadata', () => {
  const p = analyticsPage();
  p.run();
  p.window.dispatchEvent(new p.context.CustomEvent('fissura:commerce', {detail: {
    event: 'add_shipping_info', currency: 'BRL', value: 62.45, quantity: 2,
    item_id: 'fissura_fisico_direto', sales_channel: 'direct', items: [{secret: true}]
  }}));
  assert.deepEqual(JSON.parse(JSON.stringify(p.calls)), [['add_shipping_info', {
    currency: 'BRL', value: 62.45, quantity: 2, sales_channel: 'direct', item_id: 'fissura_fisico_direto'
  }]]);
});

test('commerce allowlist supports seven events and drops PII, tokens and purchase', () => {
  const p = analyticsPage();
  p.run();
  const allowed = ['view_item', 'add_shipping_info', 'begin_checkout', 'direct_checkout_created',
    'direct_payment_confirmed', 'direct_checkout_error', 'direct_checkout_return'];
  for (const event of allowed) {
    p.window.dispatchEvent(new p.context.CustomEvent('fissura:commerce', {detail: {
      event, currency: 'BRL', value: 49.99, quantity: 1, item_id: 'fissura_fisico_direto',
      error_code: 'CHECKOUT_FAILED', return_state: 'production-success', name: 'Pessoa',
      email: 'x@example.test', cpf: '123', cep: '80000-000', phone: '9999', address: 'Rua X',
      order_id: 'ord-secret', access_token: 'token-secret', checkout_url: 'https://secret.example/'
    }}));
  }
  p.window.dispatchEvent(new p.context.CustomEvent('fissura:commerce', {detail: {event: 'purchase', value: 99}}));
  assert.deepEqual(p.calls.map(call => call[0]), allowed);
  assert.doesNotMatch(JSON.stringify(p.calls), /Pessoa|example\.test|80000|ord-secret|token-secret|secret\.example/);
  for (const [, metadata] of p.calls) assert.ok(Object.values(metadata).every(value => typeof value !== 'object'));
});

test('invalid error codes and return states are not forwarded', () => {
  const p = analyticsPage();
  p.run();
  p.window.dispatchEvent(new p.context.CustomEvent('fissura:commerce', {detail: {
    event: 'direct_checkout_error', error_code: 'bad-code-with-email@example.test'
  }}));
  p.window.dispatchEvent(new p.context.CustomEvent('fissura:commerce', {detail: {
    event: 'direct_checkout_return', return_state: 'production-paid'
  }}));
  assert.deepEqual(JSON.parse(JSON.stringify(p.calls)), [
    ['direct_checkout_error', {}], ['direct_checkout_return', {}]
  ]);
});

test('missing or failing Simple Analytics never blocks retailer or commerce flows', () => {
  const p = analyticsPage();
  delete p.window.sa_event;
  const link = element({'data-analytics-event': 'click_uiclap', 'data-retailer': 'uiclap'});
  p.links.push(link);
  assert.doesNotThrow(() => { p.run(); link.fire('click'); });
  p.window.sa_event = () => { throw new Error('analytics unavailable'); };
  assert.doesNotThrow(() => link.fire('click'));
  assert.doesNotThrow(() => p.window.dispatchEvent(new p.context.CustomEvent('fissura:commerce', {
    detail: {event: 'begin_checkout', value: 49.99, quantity: 1}
  })));
});

test('analytics adapter contains no storage, cookies, identifiers or PII fields', () => {
  assert.doesNotMatch(analyticsSource, /cookie|localStorage|sessionStorage|fingerprint|visitor.?id|user.?id/i);
  assert.doesNotMatch(analyticsSource, /\b(name|email|cpf|cep|phone|address|order_id|access_token|checkout_url)\b/i);
  assert.doesNotMatch(analyticsSource, /referrer|utm_source|utm_medium|utm_campaign|utm_content/i);
  assert.match(analyticsSource, /fissura:commerce/);
  assert.match(analyticsSource, /sa_event/);
});

test('direct sales remains independent from analytics', () => {
  assert.doesNotMatch(directSalesSource, /gtag|dataLayer|FissuraPrivacy|sa_event|simpleanalytics/i);
  assert.match(directSalesSource, /new CustomEvent\('fissura:commerce'/);
});

test('purchase and editorial anchors remain present', () => {
  for (const text of ['Compra direta', 'R$ 49,90', 'CALCULAR FRETE', 'Comprar', 'Amazon', 'UICLAP',
    'Clube de Autores', 'Skoob', 'FLIM', 'Manifesto', 'Política de privacidade']) {
    assert.ok(html.toLocaleLowerCase('pt-BR').includes(text.toLocaleLowerCase('pt-BR')), text);
  }
  assert.match(html, /fonts\.googleapis\.com/);
  assert.match(html, /family=Montserrat/);
  assert.match(html, /family=EB\+Garamond/);
});

const metaSource = fs.readFileSync(path.join(root, 'assets/meta-analytics.js'), 'utf8');

test('meta pixel is consent-gated, loaded last and never installed inline', () => {
  assert.doesNotMatch(html, /fbq\(|connect\.facebook\.net/);
  const directAt = html.indexOf('<script src="assets/direct-sales.js" defer></script>');
  const metaAt = html.indexOf('<script src="assets/meta-analytics.js" defer></script>');
  assert.ok(metaAt > directAt);
  assert.match(metaSource, /979000055233966/);
  assert.match(metaSource, /function grant\(\)/);
  const loadAt = metaSource.indexOf('loadPixel();');
  assert.ok(loadAt > metaSource.indexOf('function grant()'));
  assert.equal((metaSource.match(/loadPixel\(\)/g) || []).length, 2); // definition + the single call in grant()
});

test('meta pixel sends only browser events, never Purchase or personal data', () => {
  assert.doesNotMatch(metaSource, /'Purchase'|"Purchase"/);
  assert.doesNotMatch(metaSource, /\b(email|cpf|cep|phone|address|access_token|checkout_url|order_id)\b/i);
  assert.match(metaSource, /ViewContent/);
  assert.match(metaSource, /InitiateCheckout/);
  assert.doesNotMatch(metaSource, /sa_event|simpleanalytics/i);
});

function metaPage({ stored = null, search = '', cookies = '' } = {}) {
  const listeners = {};
  const fbqCalls = [];
  const body = { children: [], appendChild(node) { this.children.push(node); } };
  const nodes = [];
  const window = {
    location: { search },
    localStorage: { getItem: () => stored, setItem(k, v) { stored = v; } },
    addEventListener(type, fn) { listeners[type] = fn; }
  };
  const document = {
    readyState: 'complete', cookie: cookies, body,
    head: { appendChild(node) { nodes.push(node); } },
    createElement(tag) {
      const node = { tag, listeners: {}, remove() {}, setAttribute() {},
        querySelector(sel) { return node[sel] || (node[sel] = { addEventListener(t, fn) { node['on' + sel] = fn; } }); } };
      return node;
    },
    addEventListener() {}
  };
  vm.runInNewContext(metaSource, { window, document, Date: { now: () => 1700000000000 } });
  return { window, document, listeners, fbqCalls, nodes, body, getStored: () => stored };
}

test('meta pixel does not load without consent and exposes consent=false attribution', () => {
  const page = metaPage();
  assert.equal(page.window.fbq, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(page.window.fissuraMetaAttribution())), { consent: false });
  page.listeners['fissura:commerce']({ detail: { event: 'view_item', item_id: 'fissura_fisico_direto', value: 49.9, quantity: 1 } });
  assert.equal(page.window.fbq, undefined);
});

test('stored denial keeps the pixel off and shows no banner', () => {
  const page = metaPage({ stored: 'denied' });
  assert.equal(page.window.fbq, undefined);
  assert.equal(page.body.children.length, 0);
});

test('stored consent loads the pixel and attribution carries only fbp/fbc', () => {
  const page = metaPage({ stored: 'granted', search: '?fbclid=AbC', cookies: '_fbp=fb.1.1700000000000.123' });
  assert.equal(typeof page.window.fbq, 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(page.window.fissuraMetaAttribution())),
    { consent: true, fbp: 'fb.1.1700000000000.123', fbc: 'fb.1.1700000000000.AbC' });
  assert.equal(page.body.children.length, 0);
});

test('checkout request carries meta attribution without identifiers in the idempotency attempt', () => {
  assert.match(directSalesSource, /attribution: typeof window\.fissuraMetaAttribution === 'function'/);
});

test('policy declares meta pixel, conversions api and data never sent', () => {
  const normalized = policy.replace(/\s+/g, ' ');
  for (const term of ['Meta Pixel', 'API de Conversões', '_fbp', '_fbc', 'Recusar', 'BRL',
    'Nunca enviamos à Meta nome, e-mail, telefone, CPF, endereço ou CEP']) assert.ok(normalized.includes(term), term);
});
