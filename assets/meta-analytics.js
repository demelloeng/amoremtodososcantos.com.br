(function () {
  var PIXEL_ID = '979000055233966';
  var CONSENT_KEY = 'ma-fissura:meta-consent';
  var ITEM_ID = 'fissura_fisico_direto';
  var granted = false;
  var queue = [];

  function readConsent() {
    try { return window.localStorage.getItem(CONSENT_KEY); } catch (error) { return null; }
  }

  function writeConsent(value) {
    try { window.localStorage.setItem(CONSENT_KEY, value); } catch (error) { /* choice lasts only for this visit */ }
  }

  function loadPixel() {
    if (window.fbq) return;
    var f = window.fbq = function () {
      f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = f;
    f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }

  function track(name, params) {
    try { window.fbq('track', name, params); } catch (error) { /* ad measurement must never interrupt commerce */ }
  }

  function grant() {
    if (granted) return;
    granted = true;
    loadPixel();
    window.fbq('init', PIXEL_ID);
    track('PageView');
    queue.splice(0).forEach(function (item) { track(item[0], item[1]); });
  }

  function emit(name, params) {
    if (granted) track(name, params);
    else if (queue.length < 5) queue.push([name, params]);
  }

  function onCommerce(event) {
    var detail = event && event.detail;
    if (!detail || detail.item_id !== ITEM_ID) return;
    var params = { content_ids: [ITEM_ID], content_type: 'product', currency: 'BRL' };
    if (typeof detail.value === 'number' && isFinite(detail.value)) params.value = detail.value;
    if (typeof detail.quantity === 'number' && detail.quantity > 0) params.num_items = detail.quantity;
    if (detail.event === 'view_item') emit('ViewContent', params);
    if (detail.event === 'direct_checkout_created') emit('InitiateCheckout', params);
  }

  function cookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // Only browser ad identifiers, and only with consent; sent to our own backend at checkout.
  window.fissuraMetaAttribution = function () {
    if (!granted) return { consent: false };
    var result = { consent: true };
    var fbp = cookie('_fbp');
    var fbc = cookie('_fbc');
    if (!fbc) {
      var click = /[?&]fbclid=([^&#]+)/.exec(window.location.search);
      if (click) fbc = 'fb.1.' + Date.now() + '.' + click[1];
    }
    if (fbp) result.fbp = fbp;
    if (fbc) result.fbc = fbc;
    return result;
  };

  function showBanner() {
    var style = document.createElement('style');
    style.textContent =
      '.meta-consent{position:fixed;left:0;right:0;bottom:0;z-index:50;background:#202f53;color:#fbfefd;' +
      'padding:14px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;' +
      'font:500 14px/1.4 Montserrat,system-ui,sans-serif;box-shadow:0 -4px 18px #0004}' +
      '.meta-consent p{margin:0;max-width:640px}.meta-consent a{color:#e8ce8e}' +
      '.meta-consent button{font:700 14px Montserrat,system-ui,sans-serif;padding:10px 18px;border-radius:6px;' +
      'cursor:pointer;border:2px solid #e8ce8e;background:transparent;color:#fbfefd}' +
      '.meta-consent button[data-accept]{background:#e8ce8e;color:#202f53}';
    document.head.appendChild(style);
    var bar = document.createElement('div');
    bar.className = 'meta-consent';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Medição de anúncios');
    bar.innerHTML =
      '<p>Usamos o Meta Pixel para medir a eficácia dos nossos anúncios. Ele usa cookies e é opcional. ' +
      '<a href="privacidade.html">Saiba mais</a>.</p>' +
      '<span><button type="button" data-accept>Permitir</button> ' +
      '<button type="button" data-reject>Recusar</button></span>';
    function close(value) {
      writeConsent(value);
      if (value === 'granted') grant(); else queue.length = 0;
      bar.remove();
    }
    bar.querySelector('[data-accept]').addEventListener('click', function () { close('granted'); });
    bar.querySelector('[data-reject]').addEventListener('click', function () { close('denied'); });
    document.body.appendChild(bar);
  }

  function init() {
    window.addEventListener('fissura:commerce', onCommerce);
    var stored = readConsent();
    if (stored === 'granted') grant();
    else if (stored !== 'denied') showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
