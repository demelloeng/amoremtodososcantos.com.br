const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const consentSource = fs.readFileSync(path.join(root, 'assets/consent.js'), 'utf8');
const analyticsSource = fs.readFileSync(path.join(root, 'assets/analytics.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const policyPath = path.join(root, 'privacidade.html');
const MEASUREMENT_ID = 'G-NGG2M69HNW';
const PREFS_KEY = 'fissura_privacy_prefs_v1';

function storage(initial = {}, broken = false) {
  const data = {...initial};
  if (broken) {
    return {data, getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); },
      removeItem() { throw new Error('denied'); }};
  }
  return {data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }};
}

function element(id) {
  return {id, hidden: true, listeners: {}, attributes: {}, focused: false,
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    fire(type, event = {}) { (this.listeners[type] || []).forEach(fn => fn({preventDefault() {}, ...event})); },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    focus() { this.focused = true; }};
}

function page({local = storage(), session = storage(), cookies = '_ga=GA1.1.1; _ga_NGG2M69HNW=GS1; other=1'} = {}) {
  const ids = Object.fromEntries(['privacy-banner', 'privacy-accept', 'privacy-reject', 'privacy-preferences']
    .map(id => [id, element(id)]));
  const scripts = [], cookieWrites = [], events = [];
  const links = [];
  const document = {
    readyState: 'complete',
    referrer: 'https://www.instagram.com/',
    getElementById: id => ids[id] || null,
    querySelectorAll: selector => (selector === '[data-analytics-event]' ? links : []),
    createElement: tag => ({tagName: tag, async: false, src: ''}),
    head: {appendChild: node => scripts.push(node)},
    get cookie() { return cookies; },
    set cookie(value) { cookieWrites.push(value); },
    addEventListener() {}
  };
  const window = {
    location: {search: '?utm_source=instagram', pathname: '/', hostname: 'amoremtodososcantos.com.br'},
    localStorage: local, sessionStorage: session,
    dispatchEvent: event => events.push(event.type),
    addEventListener() {},
  };
  window.window = window;
  const context = {window, document, localStorage: local, sessionStorage: session, URLSearchParams, URL,
    JSON, Date, CustomEvent: function (type) { this.type = type; }, Error};
  context.self = window;
  vm.createContext(context);
  return {ids, scripts, cookieWrites, events, window, context, local, session, links,
    run(source) { vm.runInContext(source, context); }};
}

function loadedGtag(p) {
  return p.scripts.filter(s => s.src.startsWith('https://www.googletagmanager.com/gtag/js'));
}

// --- markup and policy ------------------------------------------------------

test('index.html no longer loads GA4 unconditionally', () => {
  assert.doesNotMatch(html, /googletagmanager\.com/);
  assert.doesNotMatch(html, /gtag\('config'/);
  const consentAt = html.indexOf('<script src="assets/consent.js" defer></script>');
  const analyticsAt = html.indexOf('<script src="assets/analytics.js" defer></script>');
  assert.ok(consentAt > 0 && analyticsAt > consentAt, 'consent.js must precede analytics.js');
});

test('banner and footer controls are accessible and link the policy', () => {
  assert.match(html, /id="privacy-banner"[^>]*role="region"[^>]*aria-label="[^"]+"/);
  assert.match(html, /id="privacy-banner"[^>]*hidden/);
  assert.match(html, /<button id="privacy-accept" type="button">/);
  assert.match(html, /<button id="privacy-reject" type="button">/);
  assert.match(html, /<button id="privacy-preferences" type="button"[^>]*>Preferências de privacidade<\/button>/);
  assert.match(html, /href="privacidade\.html"/);
});

test('privacy policy describes the real processing only', () => {
  assert.ok(fs.existsSync(policyPath));
  const policy = fs.readFileSync(policyPath, 'utf8');
  for (const term of ['Google Analytics 4', 'consentimento', 'Asaas', 'SuperFrete', 'Google Cloud',
    'Firestore', 'GitHub Pages', 'Google Fonts', 'localStorage', 'sessionStorage', PREFS_KEY,
    'CEP', 'marcos@demelloeng.com.br', 'LGPD', 'Preferências de privacidade']) {
    assert.ok(policy.includes(term), term);
  }
  for (const absent of ['Facebook Pixel', 'Meta Pixel', 'Hotjar', 'Clarity', 'TikTok Pixel', 'fbq(']) {
    assert.ok(!policy.includes(absent), absent);
  }
  assert.doesNotMatch(policy, /googletagmanager\.com\/gtag/);
  assert.match(policy, /<html lang="pt-BR">/);
  assert.match(policy, /href="\/"/);
});

test('policy names the work canonically and shares the home stylesheet version', () => {
  const policy = fs.readFileSync(policyPath, 'utf8');
  assert.match(policy, /<title>Política de privacidade — Amor em todos os cantos — Fissura<\/title>/);
  assert.match(policy, /Amor em todos os cantos — Fissura<\/em> e permite a compra direta/);
  assert.doesNotMatch(policy, /série Amor em todos os cantos/);
  assert.match(policy, /Maringá Cultura\/FLIM/);
  const version = page => (page.match(/styles\.css\?v=([^"]+)"/) || [])[1];
  assert.ok(version(html));
  assert.equal(version(policy), version(html));
});

// --- consent behavior -------------------------------------------------------

test('undecided visitor sees the banner and GA4 never loads', () => {
  const p = page();
  p.run(consentSource);
  assert.equal(p.ids['privacy-banner'].hidden, false);
  assert.equal(loadedGtag(p).length, 0);
  assert.equal(p.window.dataLayer, undefined);
  assert.equal(p.window.FissuraPrivacy.hasAnalyticsConsent(), false);
});

test('accepting stores the choice and only then loads GA4', () => {
  const p = page();
  p.run(consentSource);
  p.ids['privacy-accept'].fire('click');
  assert.equal(p.ids['privacy-banner'].hidden, true);
  const [script] = loadedGtag(p);
  assert.equal(script.src, `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`);
  assert.equal(script.async, true);
  const stored = JSON.parse(p.local.data[PREFS_KEY]);
  assert.equal(stored.version, 1);
  assert.equal(stored.analytics, 'granted');
  assert.ok(Date.parse(stored.decided_at));
  const config = p.window.dataLayer.map(args => Array.from(args)).find(args => args[0] === 'config');
  assert.equal(config[1], MEASUREMENT_ID);
  assert.ok(p.events.includes('fissura:analytics-consent'));
  assert.equal(p.window.FissuraPrivacy.hasAnalyticsConsent(), true);
});

test('rejecting stores the choice, never loads GA4 and disables it', () => {
  const p = page();
  p.run(consentSource);
  p.ids['privacy-reject'].fire('click');
  assert.equal(JSON.parse(p.local.data[PREFS_KEY]).analytics, 'denied');
  assert.equal(loadedGtag(p).length, 0);
  assert.equal(p.window[`ga-disable-${MEASUREMENT_ID}`], true);
  assert.equal(p.ids['privacy-banner'].hidden, true);
});

test('stored choices are honored on later visits without asking again', () => {
  const granted = page({local: storage({[PREFS_KEY]: JSON.stringify({version: 1, analytics: 'granted', decided_at: '2026-09-27T20:00:00Z'})})});
  granted.run(consentSource);
  assert.equal(granted.ids['privacy-banner'].hidden, true);
  assert.equal(loadedGtag(granted).length, 1);

  const denied = page({local: storage({[PREFS_KEY]: JSON.stringify({version: 1, analytics: 'denied', decided_at: '2026-09-27T20:00:00Z'})})});
  denied.run(consentSource);
  assert.equal(denied.ids['privacy-banner'].hidden, true);
  assert.equal(loadedGtag(denied).length, 0);
});

test('unknown, corrupted or old-version preferences fail safe to asking again', () => {
  for (const raw of ['not-json', JSON.stringify({version: 0, analytics: 'granted'}),
    JSON.stringify({version: 1, analytics: 'yes'}), JSON.stringify(null)]) {
    const p = page({local: storage({[PREFS_KEY]: raw})});
    p.run(consentSource);
    assert.equal(loadedGtag(p).length, 0, raw);
    assert.equal(p.ids['privacy-banner'].hidden, false, raw);
  }
});

test('storage failure never enables analytics implicitly', () => {
  const p = page({local: storage({}, true)});
  p.run(consentSource);
  assert.equal(p.ids['privacy-banner'].hidden, false);
  assert.equal(loadedGtag(p).length, 0);
  p.ids['privacy-accept'].fire('click');
  assert.equal(loadedGtag(p).length, 1, 'explicit choice still applies to this page');
});

test('preferences can be reviewed and consent revoked', () => {
  const p = page({local: storage({[PREFS_KEY]: JSON.stringify({version: 1, analytics: 'granted', decided_at: '2026-09-27T20:00:00Z'})})});
  p.run(consentSource);
  p.ids['privacy-preferences'].fire('click');
  assert.equal(p.ids['privacy-banner'].hidden, false);
  assert.equal(p.ids['privacy-accept'].focused || p.ids['privacy-reject'].focused, true);
  p.ids['privacy-reject'].fire('click');
  assert.equal(JSON.parse(p.local.data[PREFS_KEY]).analytics, 'denied');
  assert.equal(p.window[`ga-disable-${MEASUREMENT_ID}`], true);
  const expired = p.cookieWrites.filter(c => /expires=Thu, 01 Jan 1970/.test(c)).map(c => c.split('=')[0]);
  assert.ok(expired.includes('_ga'));
  assert.ok(expired.includes('_ga_NGG2M69HNW'));
  assert.ok(!expired.includes('other'));
});

// --- analytics.js respects the preference ----------------------------------

test('attribution and purchase events never run without consent', () => {
  const p = page();
  p.run(consentSource);
  const link = element('amazon-link');
  link.attributes = {'data-analytics-event': 'click_amazon', 'data-retailer': 'amazon', href: 'https://www.amazon.com.br/x'};
  p.links.push(link);
  let calls = 0;
  p.context.gtag = () => { calls += 1; };
  p.run(analyticsSource);
  link.fire('click');
  assert.equal(p.session.data.fissura_attribution_session, undefined);
  assert.equal(calls, 0);
});

test('with consent, attribution is captured and clicks are tracked', () => {
  const p = page({local: storage({[PREFS_KEY]: JSON.stringify({version: 1, analytics: 'granted', decided_at: '2026-09-27T20:00:00Z'})})});
  p.run(consentSource);
  const link = element('amazon-link');
  link.attributes = {'data-analytics-event': 'click_amazon', 'data-retailer': 'amazon', 'data-price': '9.90', href: 'https://www.amazon.com.br/x'};
  p.links.push(link);
  p.run(analyticsSource);
  link.fire('click');
  const stored = JSON.parse(p.session.data.fissura_attribution_session);
  assert.equal(stored.utm_source, 'instagram');
  const event = p.window.dataLayer.map(args => Array.from(args)).find(args => args[0] === 'event');
  assert.equal(event[1], 'click_amazon');
});

test('site works with analytics denied: direct sales script is independent', () => {
  const direct = fs.readFileSync(path.join(root, 'assets/direct-sales.js'), 'utf8');
  assert.doesNotMatch(direct, /gtag|dataLayer|FissuraPrivacy/);
});
