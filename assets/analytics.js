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

    UTM_KEYS.forEach(function (key) {
      attribution[key] = params.get(key) || null;
    });

    attribution.referrer = document.referrer || null;
    attribution.landing_page = window.location.pathname + window.location.search;
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

  function trackPurchaseClick(link) {
    if (typeof gtag !== 'function') {
      return;
    }

    var attribution = getSessionAttribution();
    var eventName = link.getAttribute('data-analytics-event');
    var retailerKey = link.getAttribute('data-retailer');

    gtag('event', eventName, {
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

  function init() {
    getSessionAttribution();

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
