(function () {
  var STORAGE_KEY = 'fissura_attribution_session';
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var RETAILER_NAMES = {
    amazon: 'Amazon',
    uiclap: 'UICLAP',
    clube_autores: 'Clube de Autores'
  };

  function readExistingAttribution() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function captureAttributionFromEntry() {
    var params = new URLSearchParams(window.location.search);
    var attribution = {};
    var safeLandingParams = new URLSearchParams();

    UTM_KEYS.forEach(function (key) {
      attribution[key] = params.get(key) || null;
      if (attribution[key]) safeLandingParams.set(key, attribution[key]);
    });

    try {
      var referrerUrl = document.referrer ? new URL(document.referrer) : null;
      attribution.referrer = referrerUrl ? referrerUrl.origin + referrerUrl.pathname : null;
    } catch (e) {
      attribution.referrer = null;
    }
    var safeQuery = safeLandingParams.toString();
    attribution.landing_page = window.location.pathname + (safeQuery ? '?' + safeQuery : '');
    attribution.timestamp = new Date().toISOString();

    if (attribution.utm_source) {
      attribution.traffic_origin = attribution.utm_source;
    } else if (attribution.referrer) {
      try {
        attribution.traffic_origin = new URL(attribution.referrer).hostname;
      } catch (e) {
        attribution.traffic_origin = attribution.referrer;
      }
    } else {
      attribution.traffic_origin = 'direct';
    }

    return attribution;
  }

  function getSessionAttribution() {
    var existing = readExistingAttribution();
    if (existing) {
      return existing;
    }

    var fresh = captureAttributionFromEntry();
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    } catch (e) {
      // sessionStorage indisponível (ex.: navegação privada) — segue sem persistir entre páginas.
    }
    return fresh;
  }

  function hasConsent() {
    return Boolean(window.FissuraPrivacy && window.FissuraPrivacy.hasAnalyticsConsent());
  }

  function trackPurchaseClick(link) {
    // No collection of any kind without the visitor's analytics permission.
    if (!hasConsent() || typeof window.gtag !== 'function') {
      return;
    }

    var attribution = attributionPayload();
    var eventName = link.getAttribute('data-analytics-event');
    var retailerKey = link.getAttribute('data-retailer');

    window.gtag('event', eventName, {
      destination: retailerKey,
      retailer: RETAILER_NAMES[retailerKey] || retailerKey,
      product_format: link.getAttribute('data-product-format'),
      price: parseFloat(link.getAttribute('data-price')),
      currency: 'BRL',
      link_url: link.getAttribute('href'),
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      utm_content: attribution.utm_content,
      utm_term: attribution.utm_term,
      referrer: attribution.referrer,
      landing_page: attribution.landing_page,
      traffic_origin: attribution.traffic_origin
    });
  }

  function attributionPayload() {
    var attribution = getSessionAttribution();
    var safeParams = new URLSearchParams();
    UTM_KEYS.forEach(function (key) {
      if (attribution[key]) safeParams.set(key, attribution[key]);
    });
    var safeReferrer = null;
    var safeLandingPath = '/';
    try {
      var referrerUrl = attribution.referrer ? new URL(attribution.referrer) : null;
      safeReferrer = referrerUrl ? referrerUrl.origin + referrerUrl.pathname : null;
    } catch (e) { /* malformed stored referrer is discarded */ }
    try {
      safeLandingPath = new URL(attribution.landing_page || '/', 'https://amoremtodososcantos.com.br').pathname;
    } catch (e) { /* malformed stored landing page falls back to root */ }
    return {
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      utm_content: attribution.utm_content,
      utm_term: attribution.utm_term,
      referrer: safeReferrer,
      landing_page: safeLandingPath + (safeParams.toString() ? '?' + safeParams.toString() : ''),
      traffic_origin: attribution.traffic_origin
    };
  }

  function trackCommerce(event) {
    if (!hasConsent() || typeof window.gtag !== 'function') return;
    var detail = event && event.detail;
    if (!detail) return;
    var allowed = ['view_item', 'add_shipping_info', 'begin_checkout',
      'direct_checkout_created', 'direct_checkout_error', 'direct_checkout_return'];
    if (allowed.indexOf(detail.event) === -1) return;
    var payload = attributionPayload();
    if (detail.currency === 'BRL') payload.currency = 'BRL';
    if (typeof detail.value === 'number' && isFinite(detail.value)) payload.value = detail.value;
    if (typeof detail.quantity === 'number' && detail.quantity > 0) payload.quantity = detail.quantity;
    if (typeof detail.error_code === 'string' && /^[A-Z0-9_]{1,64}$/.test(detail.error_code)) {
      payload.error_code = detail.error_code;
    }
    if (typeof detail.return_state === 'string' && /^(production|sandbox)-(success|cancel|expired)$/.test(detail.return_state)) {
      payload.return_state = detail.return_state;
    }
    if (detail.item_id === 'fissura_fisico_direto') {
      payload.items = [{
        item_id: 'fissura_fisico_direto',
        item_name: 'Amor em todos os cantos — Fissura',
        sales_channel: 'direct',
        price: 49.99,
        quantity: payload.quantity || 1
      }];
    }
    window.gtag('event', detail.event, payload);
  }

  function init() {
    if (hasConsent()) {
      getSessionAttribution();
    }
    window.addEventListener('fissura:analytics-consent', function () {
      getSessionAttribution();
    });
    window.addEventListener('fissura:commerce', trackCommerce);

    var links = document.querySelectorAll('[data-analytics-event]');
    links.forEach(function (link) {
      link.addEventListener('click', function () {
        trackPurchaseClick(link);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
