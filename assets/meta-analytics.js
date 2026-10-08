(function () {
  var PIXEL_ID = '979000055233966';
  var ITEM_ID = 'fissura_fisico_direto';

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

  function onCommerce(event) {
    var detail = event && event.detail;
    if (!detail || detail.item_id !== ITEM_ID) return;
    var params = { content_ids: [ITEM_ID], content_type: 'product', currency: 'BRL' };
    if (typeof detail.value === 'number' && isFinite(detail.value)) params.value = detail.value;
    if (typeof detail.quantity === 'number' && detail.quantity > 0) params.num_items = detail.quantity;
    if (detail.event === 'view_item') track('ViewContent', params);
    if (detail.event === 'direct_checkout_created') track('InitiateCheckout', params);
  }

  function cookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // Only browser ad identifiers; sent to our own backend at checkout for the server-side Purchase.
  window.fissuraMetaAttribution = function () {
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

  function init() {
    window.addEventListener('fissura:commerce', onCommerce);
    loadPixel();
    window.fbq('init', PIXEL_ID);
    track('PageView');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
