(function () {
  var prices = null, currentQuote = null, currentSummary = null, apiBase = '', directSaleActive = false;
  var quoteRevision = 0, quotedCep = '', quotedQuantity = 1, quantity = 1, attempt = null;
  var inventoryAvailable = true, checkoutLocked = false;
  var MIN_QUANTITY = 1, MAX_QUANTITY = 3;
  var ORDER_STORAGE_KEY = 'ma-fissura:order', ATTEMPT_STORAGE_KEY = 'ma-fissura:attempt';
  var cepInput = document.getElementById('direct-cep');
  var directCard = document.getElementById('direct-card');
  var directFlow = document.getElementById('direct-flow');
  var comingSoon = document.getElementById('direct-coming-soon');
  var buy = document.getElementById('direct-buy');
  var errorBox = document.getElementById('direct-error');
  var loading = document.getElementById('direct-loading');
  var summary = document.getElementById('direct-summary');
  var kindleUnlimited = document.getElementById('amazon-kindle-unlimited');
  var paymentMethods = document.getElementById('direct-payment-methods');
  var paymentInstallments = document.getElementById('direct-payment-installments');
  var checkoutReturn = document.getElementById('checkout-return');
  var quantityOutput = document.getElementById('direct-quantity');
  var quantityMinus = document.getElementById('direct-quantity-minus');
  var quantityPlus = document.getElementById('direct-quantity-plus');
  var quantityContact = document.getElementById('direct-quantity-contact');
  var availability = document.getElementById('direct-availability');
  var orderStatus = document.getElementById('direct-order-status');
  var directActiveOffer = document.getElementById('direct-active-offer');
  var ITEM = {item_id:'fissura_fisico_direto', item_name:'Amor em todos os cantos — Fissura', sales_channel:'direct'};
  function commerce(eventName, fields) {
    var detail = {event:eventName};
    Object.keys(fields || {}).forEach(function (key) { detail[key] = fields[key]; });
    try { window.dispatchEvent(new CustomEvent('fissura:commerce', {detail:detail})); } catch (e) { /* analytics is optional */ }
  }
  function itemFields(quantityValue, value) {
    var fields = {currency:'BRL', quantity:quantityValue, item_id:ITEM.item_id,
      item_name:ITEM.item_name, sales_channel:ITEM.sales_channel};
    if (typeof value === 'number') fields.value = value;
    return fields;
  }
  function money(cents) { return new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(cents / 100); }
  function channelName(id) { return {direct:'Compra direta',amazon:'Amazon',uiclap:'UICLAP',clube_autores:'Clube de Autores'}[id]; }
  function fail(message) { errorBox.textContent = message; errorBox.hidden = false; }
  // Session storage only: the order access token must not outlive the tab.
  function readSession(key) {
    try { var raw = window.sessionStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function writeSession(key, value) {
    try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ':' + canonical(value[key]);
      }).join(',') + '}';
    }
    return JSON.stringify(value);
  }
  function showCheckoutReturn() {
    var state = new URLSearchParams(window.location.search).get('checkout');
    var messages = {
      'production-success': 'Você retornou do checkout. Isso não confirma o pagamento; inclusive o Pix depende da confirmação financeira.',
      'sandbox-success': 'Você retornou do checkout de teste. Isso não confirma o pagamento.',
      'production-cancel': 'A etapa de checkout foi cancelada. Nenhum pagamento foi confirmado.',
      'sandbox-cancel': 'A etapa de checkout de teste foi cancelada. Nenhum pagamento foi confirmado.',
      'production-expired': 'A sessão de checkout expirou. Nenhum pagamento foi confirmado.',
      'sandbox-expired': 'A sessão de checkout de teste expirou. Nenhum pagamento foi confirmado.'
    };
    if (checkoutReturn && messages[state]) {
      checkoutReturn.textContent = messages[state];
      checkoutReturn.hidden = false;
      commerce('direct_checkout_return', {return_state:state});
    }
    return Boolean(messages[state]);
  }
  var returnedFromCheckout = showCheckoutReturn();
  function describeOrder(order) {
    if (order.payment_status === 'PAID') return 'Pagamento confirmado. Obrigado pela compra!';
    if (order.payment_status === 'REFUNDED') return 'Pagamento estornado.';
    if (order.reservation_status === 'RELEASED') return 'Pedido cancelado. Nenhum pagamento foi confirmado.';
    if (order.checkout_state === 'CHECKOUT_UNKNOWN' || order.payment_status === 'UNKNOWN') {
      return 'Seu pedido está em verificação. Não tente pagar novamente.';
    }
    return 'Pagamento ainda não confirmado. Assim que o Asaas confirmar, o pedido será atualizado.';
  }
  function queryOrderStatus() {
    // The browser return is navigation only; financial state comes from the authenticated API.
    var orderId = new URLSearchParams(window.location.search).get('order_id');
    var saved = readSession(ORDER_STORAGE_KEY);
    if (!returnedFromCheckout || !orderId || !saved || saved.order_id !== orderId || !saved.access_token) return;
    fetch(apiBase + '/v1/orders/' + encodeURIComponent(orderId), {
      method: 'GET', cache: 'no-store', headers: {'Authorization': 'Bearer ' + saved.access_token}
    }).then(function (response) { return response.json().then(function (data) { return {ok: response.ok, data: data}; }); })
      .then(function (result) {
        if (!result.ok || !result.data.order) return;
        orderStatus.textContent = describeOrder(result.data.order);
        orderStatus.hidden = false;
      }).catch(function () { /* status stays unknown to the visitor */ });
  }
  function renderQuantity() {
    quantityOutput.textContent = String(quantity);
    quantityMinus.disabled = quantity <= MIN_QUANTITY;
  }
  // Destination is display-only: never changes the server-confirmed commercial summary.
  function showDestination(confirmed) {
    var cep = String(confirmed.destination_cep || '').replace(/\D/g, '');
    var destination = document.getElementById('direct-region');
    var formatted = cep.replace(/^(\d{5})(\d{3})$/, '$1-$2');
    destination.textContent = 'CEP ' + formatted;
    if (!/^\d{8}$/.test(cep)) return;
    var revision = quoteRevision;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 4000);
    fetch('https://viacep.com.br/ws/' + cep + '/json/', {
      credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal
    }).then(function (response) {
      if (!response.ok) throw new Error('Destination unavailable');
      return response.json();
    }).then(function (data) {
      if (controller.signal.aborted || revision !== quoteRevision || currentSummary !== confirmed ||
          summary.hidden || cepInput.value.replace(/\D/g, '') !== cep) return;
      if (!data || data.erro || typeof data.cep !== 'string' ||
          data.cep.replace(/\D/g, '') !== cep || typeof data.localidade !== 'string' ||
          !data.localidade.trim() || typeof data.uf !== 'string' ||
          !/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(data.uf)) return;
      destination.textContent = data.localidade.trim() + '/' + data.uf + ' — CEP ' + formatted;
    }).catch(function () { /* The quoted CEP remains visible; freight and checkout are independent. */ })
      .finally(function () { clearTimeout(timer); });
  }
  function showQuote(quote, confirmed) {
    currentQuote = quote; currentSummary = confirmed;
    quotedQuantity = confirmed.quantity;
    showDestination(confirmed);
    document.getElementById('direct-quantity-summary').textContent = String(confirmed.quantity);
    document.getElementById('direct-unit').textContent = money(confirmed.unit_price_cents);
    document.getElementById('direct-subtotal').textContent = money(confirmed.subtotal_cents);
    document.getElementById('direct-shipping').textContent = money(confirmed.shipping_amount_cents);
    document.getElementById('direct-real').textContent = money(confirmed.real_shipping_amount_cents);
    document.getElementById('direct-real-row').hidden = confirmed.real_shipping_amount_cents === confirmed.shipping_amount_cents;
    document.getElementById('direct-days').textContent = confirmed.delivery_days + (confirmed.delivery_days === 1 ? ' dia útil' : ' dias úteis');
    document.getElementById('direct-total').textContent = money(confirmed.total_amount_cents);
    summary.hidden = false; buy.disabled = checkoutLocked;
  }
  function commercialAttempt(destinationCep) {
    // One immutable attempt per material payload (CEP, quantity, confirmed summary).
    var fingerprint = canonical({destination_cep: destinationCep, quantity: quotedQuantity, summary: currentSummary});
    if (!attempt) attempt = readSession(ATTEMPT_STORAGE_KEY);
    if (!attempt || attempt.fingerprint !== fingerprint) {
      attempt = {key: crypto.randomUUID(), fingerprint: fingerprint};
      writeSession(ATTEMPT_STORAGE_KEY, attempt);
    }
    return attempt.key;
  }
  function discardAttempt() {
    attempt = null;
    try { window.sessionStorage.removeItem(ATTEMPT_STORAGE_KEY); } catch (e) { /* storage unavailable */ }
  }
  function setInventory(status) {
    inventoryAvailable = status !== 'TEMPORARILY_UNAVAILABLE';
    availability.hidden = inventoryAvailable;
    availability.textContent = inventoryAvailable ? '' : 'Exemplares temporariamente indisponíveis para compra direta.';
    if (!inventoryAvailable) invalidateQuote();
  }
  fetch('/config/prices.json', {cache:'no-store'}).then(function (response) { if (!response.ok) throw new Error(); return response.json(); }).then(function (data) {
    prices = data.channels;
    apiBase = String(data.api_base_url || '').replace(/\/+$/, '');
    var directStatus = data.direct_sale.status;
    var payment = data.direct_sale.payment;
    if (payment.pix_enabled && payment.credit_card_enabled) paymentMethods.textContent = 'Pix ou cartão de crédito';
    else if (payment.pix_enabled) paymentMethods.textContent = 'Pix';
    else if (payment.credit_card_enabled) paymentMethods.textContent = 'Cartão de crédito';
    else paymentMethods.textContent = 'Meios de pagamento a definir';
    var installmentsEnabled = payment.credit_card_enabled && payment.max_installments > 1;
    paymentMethods.hidden = true;
    paymentInstallments.hidden = true;
    paymentInstallments.textContent = installmentsEnabled ?
      'À vista ou em até ' + payment.max_installments + 'x no cartão' : '';
    if (directStatus === 'hidden') {
      directCard.hidden = true;
    } else if (directStatus === 'coming_soon') {
      directCard.hidden = false;
      directActiveOffer.hidden = true;
      directFlow.hidden = true;
      comingSoon.hidden = false;
      directCard.querySelector('.card__price').textContent = 'Em breve';
      directCard.setAttribute('aria-label', 'Compra direta — Em breve');
      directCard.removeAttribute('data-price');
    } else if (directStatus === 'active') {
      directSaleActive = true;
      directCard.hidden = false;
      directActiveOffer.hidden = false;
      directFlow.hidden = false;
      comingSoon.hidden = true;
      paymentMethods.hidden = false;
      paymentInstallments.hidden = !installmentsEnabled;
      var viewed = false;
      function recordView() {
        if (viewed) return;
        viewed = true;
        commerce('view_item', itemFields(quantity, prices.direct.amount_cents / 100));
      }
      if (typeof IntersectionObserver === 'function') {
        var observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!viewed && entry.target === directCard && entry.isIntersecting && entry.intersectionRatio > 0) {
              recordView();
              observer.disconnect();
            }
          });
        }, {threshold:0.25});
        observer.observe(directCard);
      } else {
        var checkDirectVisibility = function () {
          var rect = directCard.getBoundingClientRect();
          var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
          if (rect.bottom > 0 && rect.top < viewportHeight) {
            recordView();
            window.removeEventListener('scroll', checkDirectVisibility);
            window.removeEventListener('resize', checkDirectVisibility);
          }
        };
        window.addEventListener('scroll', checkDirectVisibility, {passive:true});
        window.addEventListener('resize', checkDirectVisibility);
        checkDirectVisibility();
      }
      fetch(apiBase + '/v1/prices', {cache:'no-store'}).then(function (response) { return response.json(); })
        .then(function (live) { if (live && live.inventory_status) setInventory(live.inventory_status); })
        .catch(function () { /* availability is enforced server-side at checkout */ });
    }
    document.querySelectorAll('[data-price-channel]').forEach(function (card) {
      if (card.dataset.priceChannel === 'direct' && directStatus !== 'active') return;
      var item = prices[card.dataset.priceChannel];
      var label = item.amount_cents === null ? 'Indisponível' : money(item.amount_cents);
      var isAmazonUnlimited = card.dataset.priceChannel === 'amazon' && item.kindle_unlimited;
      if (card.dataset.priceChannel === 'amazon') kindleUnlimited.hidden = !item.kindle_unlimited;
      card.querySelector('.card__price').textContent = (isAmazonUnlimited ? 'ou ' : '') + label;
      var channel = card.dataset.priceChannel;
      if (channel === 'direct') {
        card.setAttribute('aria-label', 'Compra direta por ' + label +
          ' mais frete — preço anterior R$ 49,99 — R$ 10 OFF');
      } else {
        var freightLabel = channel === 'uiclap' || channel === 'clube_autores' ? ' mais frete' : '';
        card.setAttribute('aria-label', channelName(channel) +
          (isAmazonUnlimited ? ' — Grátis no Kindle Unlimited ou ' : ' por ') + label + freightLabel);
      }
      if (item.amount_cents !== null) card.dataset.price = (item.amount_cents / 100).toFixed(2);
    });
    queryOrderStatus();
  }).catch(function () { fail('Não foi possível carregar os preços.'); });
  function invalidateQuote() {
    quoteRevision += 1;
    currentQuote = null; currentSummary = null; quotedCep = '';
    buy.disabled = true; summary.hidden = true; loading.hidden = true; errorBox.hidden = true;
  }
  function onCepEdit() {
    // An in-flight response must not restore a quote for an earlier edit,
    // even when the user changes the field back to the same CEP.
    if (currentQuote || !loading.hidden) invalidateQuote();
    else quoteRevision += 1;
  }
  function changeQuantity(delta) {
    var next = quantity + delta;
    if (next > MAX_QUANTITY) { quantityContact.hidden = false; return; }
    quantityContact.hidden = true;
    if (next < MIN_QUANTITY || next === quantity) return;
    quantity = next;
    renderQuantity();
    invalidateQuote();
  }
  renderQuantity();
  quantityContact.hidden = true;
  availability.hidden = true;
  orderStatus.hidden = true;
  quantityMinus.addEventListener('click', function () { changeQuantity(-1); });
  quantityPlus.addEventListener('click', function () { changeQuantity(1); });
  cepInput.addEventListener('input', onCepEdit);
  cepInput.addEventListener('change', onCepEdit);
  document.getElementById('direct-quote').addEventListener('click', function () {
    if (!directSaleActive || !inventoryAvailable) return;
    invalidateQuote();
    checkoutLocked = false;
    var revision = quoteRevision, destinationCep = cepInput.value, requestedQuantity = quantity;
    loading.hidden = false;
    fetch(apiBase + '/v1/shipping/quote', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({destination_cep:destinationCep, quantity:requestedQuantity})})
      .then(function (response) { return response.json().then(function (data) {
        if (!response.ok) {
          if (data.error && data.error.contact_email) quantityContact.hidden = false;
          throw new Error(data.error.message);
        }
        return data; }); })
      .then(function (data) {
        if (revision !== quoteRevision || destinationCep !== cepInput.value || requestedQuantity !== quantity) return;
        quotedCep = destinationCep;
        showQuote(data.quote, data.summary);
        commerce('add_shipping_info', itemFields(data.summary.quantity, data.summary.total_amount_cents / 100));
      }).catch(function (error) {
        if (revision === quoteRevision && destinationCep === cepInput.value) fail(error.message || 'Frete indisponível.');
      }).finally(function () { if (revision === quoteRevision) loading.hidden = true; });
  });
  function closeWith(checkoutWindow, message) {
    checkoutWindow.close();
    if (message) fail(message);
  }
  buy.addEventListener('click', function () {
    if (!directSaleActive || !currentQuote || !currentSummary || buy.disabled || checkoutLocked) return;
    if (quotedCep !== cepInput.value || quotedQuantity !== quantity) { invalidateQuote(); return; }
    var revision = quoteRevision, destinationCep = quotedCep;
    // Opened synchronously by the click so popup blockers allow it.
    var checkoutWindow = window.open('about:blank', '_blank');
    if (!checkoutWindow) {
      fail('Não foi possível abrir a janela do checkout. Permita pop-ups para este site e tente novamente.');
      buy.disabled = false;
      return;
    }
    checkoutWindow.opener = null;
    try {
      checkoutWindow.document.title = 'Preparando pagamento…';
      checkoutWindow.document.body.textContent = 'Aguarde: estamos preparando o pagamento seguro.';
    } catch (e) { /* the waiting text is cosmetic */ }
    buy.disabled = true; errorBox.hidden = true;
    commerce('begin_checkout', itemFields(quotedQuantity, currentSummary.total_amount_cents / 100));
    var checkoutErrorSent = false;
    function trackCheckoutError(code) {
      if (checkoutErrorSent) return;
      checkoutErrorSent = true;
      commerce('direct_checkout_error', {error_code:code});
    }
    var body = {destination_cep: destinationCep, quantity: quotedQuantity,
      confirmed_summary: currentSummary, idempotency_key: commercialAttempt(destinationCep)};
    fetch(apiBase + '/v1/checkout', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function (response) { return response.json().then(function (data) { return {status:response.status, ok:response.ok, data:data}; }); })
      .then(function (result) {
        var data = result.data, code = data.error && data.error.code;
        if (data.order && data.access_token) {
          writeSession(ORDER_STORAGE_KEY, {order_id: data.order.order_id, access_token: data.access_token});
        }
        if (revision !== quoteRevision || destinationCep !== cepInput.value) {
          checkoutWindow.close(); return;
        }
        if (code === 'QUOTE_CHANGED') {
          checkoutWindow.close();
          showQuote(data.quote, data.summary);
          fail('Os valores foram atualizados. Confira e clique em Comprar novamente.');
          return;
        }
        if (code === 'CHECKOUT_UNKNOWN') {
          checkoutLocked = true;
          closeWith(checkoutWindow, data.error.message); buy.disabled = true; return;
        }
        if (code === 'CHECKOUT_IN_PROGRESS') {
          closeWith(checkoutWindow, data.error.message); buy.disabled = false; return;
        }
        if (code === 'STOCK_UNAVAILABLE') {
          closeWith(checkoutWindow, data.error.message);
          setInventory('TEMPORARILY_UNAVAILABLE'); fail(data.error.message); return;
        }
        if (code === 'ORDER_EXPIRED' || code === 'CHECKOUT_FAILED' || code === 'IDEMPOTENCY_CONFLICT') {
          trackCheckoutError(code);
          discardAttempt(); invalidateQuote(); closeWith(checkoutWindow, data.error.message); return;
        }
        if (!result.ok || !data.checkout || !data.checkout.url) {
          trackCheckoutError(code || 'INVALID_CHECKOUT_RESPONSE');
          throw new Error(data.error && data.error.message);
        }
        commerce('direct_checkout_created', itemFields(quotedQuantity, currentSummary.total_amount_cents / 100));
        checkoutWindow.location = data.checkout.url;
      })
      .catch(function (error) {
        checkoutWindow.close();
        if (revision !== quoteRevision || destinationCep !== cepInput.value || !currentQuote) return;
        trackCheckoutError('CHECKOUT_REQUEST_FAILED');
        fail(error.message || 'Checkout indisponível.'); buy.disabled = false;
      });
  });
}());
