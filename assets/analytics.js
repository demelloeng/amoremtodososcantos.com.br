(function () {
  var RETAILER_NAMES = {
    amazon: 'Amazon',
    uiclap: 'UICLAP',
    clube_autores: 'Clube de Autores'
  };
  var COMMERCE_EVENTS = [
    'view_item',
    'add_shipping_info',
    'begin_checkout',
    'direct_checkout_created',
    'direct_checkout_error',
    'direct_checkout_return'
  ];

  function send(eventName, metadata) {
    if (typeof window.sa_event !== 'function') return;
    try {
      window.sa_event(eventName, metadata);
    } catch (error) {
      // Audience measurement is non-critical and must never interrupt commerce.
    }
  }

  function trackPurchaseClick(link) {
    var eventName = link.getAttribute('data-analytics-event');
    var retailerKey = link.getAttribute('data-retailer');
    var price = parseFloat(link.getAttribute('data-price'));
    var metadata = {
      destination: retailerKey,
      retailer: RETAILER_NAMES[retailerKey] || retailerKey,
      product_format: link.getAttribute('data-product-format'),
      currency: 'BRL'
    };
    if (isFinite(price)) metadata.price = price;
    send(eventName, metadata);
  }

  function trackCommerce(event) {
    var detail = event && event.detail;
    if (!detail || COMMERCE_EVENTS.indexOf(detail.event) === -1) return;

    var metadata = {};
    if (detail.currency === 'BRL') metadata.currency = 'BRL';
    if (typeof detail.value === 'number' && isFinite(detail.value)) metadata.value = detail.value;
    if (typeof detail.quantity === 'number' && isFinite(detail.quantity) && detail.quantity > 0) {
      metadata.quantity = detail.quantity;
    }
    if (detail.item_id === 'fissura_fisico_direto') {
      metadata.sales_channel = 'direct';
      metadata.item_id = 'fissura_fisico_direto';
    }
    if (typeof detail.error_code === 'string' && /^[A-Z0-9_]{1,64}$/.test(detail.error_code)) {
      metadata.error_code = detail.error_code;
    }
    if (typeof detail.return_state === 'string' &&
        /^(production|sandbox)-(success|cancel|expired)$/.test(detail.return_state)) {
      metadata.return_state = detail.return_state;
    }
    send(detail.event, metadata);
  }

  function init() {
    window.addEventListener('fissura:commerce', trackCommerce);
    document.querySelectorAll('[data-analytics-event]').forEach(function (link) {
      link.addEventListener('click', function () { trackPurchaseClick(link); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
