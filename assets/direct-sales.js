(function () {
  var prices = null, currentQuote = null, apiBase = '', directSaleActive = false;
  var quoteRevision = 0, quotedCep = '';
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
  function money(cents) { return new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(cents / 100); }
  function channelName(id) { return {direct:'Compra direta',amazon:'Amazon',uiclap:'UICLAP',clube_autores:'Clube de Autores'}[id]; }
  function fail(message) { errorBox.textContent = message; errorBox.hidden = false; }
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
    paymentInstallments.hidden = !installmentsEnabled;
    paymentInstallments.textContent = installmentsEnabled ?
      'À vista ou em até ' + payment.max_installments + 'x no cartão' : '';
    if (directStatus === 'hidden') {
      directCard.hidden = true;
    } else if (directStatus === 'coming_soon') {
      directCard.hidden = false;
      directFlow.hidden = true;
      comingSoon.hidden = false;
      directCard.querySelector('.card__price').textContent = 'Em breve';
      directCard.setAttribute('aria-label', 'Compra direta — Em breve');
      directCard.removeAttribute('data-price');
    } else if (directStatus === 'active') {
      directSaleActive = true;
      directCard.hidden = false;
      directFlow.hidden = false;
      comingSoon.hidden = true;
    }
    document.querySelectorAll('[data-price-channel]').forEach(function (card) {
      if (card.dataset.priceChannel === 'direct' && directStatus !== 'active') return;
      var item = prices[card.dataset.priceChannel];
      var label = item.amount_cents === null ? 'Indisponível' : money(item.amount_cents);
      var isAmazonUnlimited = card.dataset.priceChannel === 'amazon' && item.kindle_unlimited;
      if (card.dataset.priceChannel === 'amazon') kindleUnlimited.hidden = !item.kindle_unlimited;
      card.querySelector('.card__price').textContent = (isAmazonUnlimited ? 'ou ' : '') + label;
      card.setAttribute('aria-label', channelName(card.dataset.priceChannel) +
        (isAmazonUnlimited ? ' — Grátis no Kindle Unlimited ou ' : ' por ') + label);
      if (item.amount_cents !== null) card.dataset.price = (item.amount_cents / 100).toFixed(2);
    });
  }).catch(function () { fail('Não foi possível carregar os preços.'); });
  function invalidateQuote() {
    quoteRevision += 1;
    currentQuote = null; quotedCep = '';
    buy.disabled = true; summary.hidden = true; loading.hidden = true; errorBox.hidden = true;
  }
  function onCepEdit() {
    // An in-flight response must not restore a quote for an earlier edit,
    // even when the user changes the field back to the same CEP.
    if (currentQuote || !loading.hidden) invalidateQuote();
    else quoteRevision += 1;
  }
  cepInput.addEventListener('input', onCepEdit);
  cepInput.addEventListener('change', onCepEdit);
  document.getElementById('direct-quote').addEventListener('click', function () {
    if (!directSaleActive) return;
    invalidateQuote();
    var revision = quoteRevision, destinationCep = cepInput.value;
    loading.hidden = false;
    fetch(apiBase + '/v1/shipping/quote', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({destination_cep:destinationCep})})
      .then(function (response) { return response.json().then(function (data) { if (!response.ok) throw new Error(data.error.message); return data; }); })
      .then(function (data) {
        if (revision !== quoteRevision || destinationCep !== cepInput.value) return;
        currentQuote = data.quote; quotedCep = destinationCep;
        document.getElementById('direct-region').textContent = currentQuote.is_curitiba ? 'Curitiba' : 'Fora de Curitiba';
        document.getElementById('direct-book').textContent = money(prices.direct.amount_cents);
        document.getElementById('direct-shipping').textContent = money(currentQuote.charged_amount_cents);
        document.getElementById('direct-real').textContent = money(currentQuote.real_amount_cents);
        document.getElementById('direct-real-row').hidden = currentQuote.real_amount_cents === currentQuote.charged_amount_cents;
        document.getElementById('direct-days').textContent = currentQuote.delivery_days + (currentQuote.delivery_days === 1 ? ' dia útil' : ' dias úteis');
        document.getElementById('direct-total').textContent = money(prices.direct.amount_cents + currentQuote.charged_amount_cents);
        summary.hidden = false; buy.disabled = false;
      }).catch(function (error) {
        if (revision === quoteRevision && destinationCep === cepInput.value) fail(error.message || 'Frete indisponível.');
      }).finally(function () { if (revision === quoteRevision) loading.hidden = true; });
  });
  buy.addEventListener('click', function () {
    if (!directSaleActive || !currentQuote || buy.disabled) return;
    if (quotedCep !== cepInput.value) { invalidateQuote(); return; }
    var revision = quoteRevision, destinationCep = quotedCep;
    buy.disabled = true; errorBox.hidden = true;
    fetch(apiBase + '/v1/checkout', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({destination_cep:destinationCep})})
      .then(function (response) { return response.json().then(function (data) { if (!response.ok) throw new Error(data.error.message); return data; }); })
      .then(function (data) {
        if (revision !== quoteRevision || destinationCep !== cepInput.value) return;
        window.open(data.checkout.url, '_blank', 'noopener');
      })
      .catch(function (error) {
        if (revision !== quoteRevision || destinationCep !== cepInput.value || !currentQuote) return;
        fail(error.message || 'Checkout indisponível.'); buy.disabled = false;
      });
  });
}());
