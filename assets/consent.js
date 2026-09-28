(function () {
  // Privacy preferences. Google Analytics 4 is loaded only after an explicit
  // "accept"; anything missing, corrupted or unreadable means "not allowed".
  var MEASUREMENT_ID = 'G-NGG2M69HNW';
  var PREFS_KEY = 'fissura_privacy_prefs_v1';
  var PREFS_VERSION = 1;
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var GRANTED = 'granted', DENIED = 'denied';
  var banner = document.getElementById('privacy-banner');
  var acceptButton = document.getElementById('privacy-accept');
  var rejectButton = document.getElementById('privacy-reject');
  var preferencesButton = document.getElementById('privacy-preferences');
  var sessionChoice = null;
  var analyticsLoaded = false;

  function readStoredChoice() {
    try {
      var prefs = JSON.parse(window.localStorage.getItem(PREFS_KEY));
      if (prefs && prefs.version === PREFS_VERSION &&
          (prefs.analytics === GRANTED || prefs.analytics === DENIED)) {
        return prefs.analytics;
      }
    } catch (e) { /* unreadable preference: ask again */ }
    return null;
  }

  function storeChoice(choice) {
    sessionChoice = choice;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({
        version: PREFS_VERSION, analytics: choice, decided_at: new Date().toISOString()
      }));
    } catch (e) { /* the choice still applies to this page */ }
  }

  function currentChoice() {
    return sessionChoice || readStoredChoice();
  }

  function sanitizedPageLocation() {
    var source = new URLSearchParams(window.location.search);
    var safe = new URLSearchParams();
    UTM_KEYS.forEach(function (key) {
      var value = source.get(key);
      if (value) safe.set(key, value);
    });
    var query = safe.toString();
    return window.location.origin + window.location.pathname + (query ? '?' + query : '');
  }

  function sanitizedPageReferrer() {
    try {
      var referrer = document.referrer ? new URL(document.referrer) : null;
      return referrer ? referrer.origin + referrer.pathname : undefined;
    } catch (e) {
      return undefined;
    }
  }

  function loadAnalytics() {
    window['ga-disable-' + MEASUREMENT_ID] = false;
    if (analyticsLoaded) {
      try {
        window.dispatchEvent(new CustomEvent('fissura:analytics-consent'));
      } catch (e) { /* listeners are optional */ }
      return;
    }
    analyticsLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: sanitizedPageLocation(),
      page_referrer: sanitizedPageReferrer()
    });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    document.head.appendChild(script);
    try {
      window.dispatchEvent(new CustomEvent('fissura:analytics-consent'));
    } catch (e) { /* listeners are optional */ }
  }

  function clearAnalyticsCookies() {
    var names = String(document.cookie || '').split(';').map(function (part) {
      return part.split('=')[0].trim();
    }).filter(function (name) { return /^_ga(_|$)/.test(name); });
    var host = window.location.hostname;
    var domains = ['', 'domain=' + host, 'domain=.' + host.replace(/^www\./, '')];
    names.forEach(function (name) {
      domains.forEach(function (domain) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' +
          (domain ? '; ' + domain : '');
      });
    });
  }

  function disableAnalytics() {
    window['ga-disable-' + MEASUREMENT_ID] = true;
    clearAnalyticsCookies();
  }

  function showBanner(focus) {
    banner.hidden = false;
    if (focus) acceptButton.focus();
  }

  function hideBanner() { banner.hidden = true; }

  acceptButton.addEventListener('click', function () {
    storeChoice(GRANTED);
    hideBanner();
    loadAnalytics();
  });
  rejectButton.addEventListener('click', function () {
    storeChoice(DENIED);
    hideBanner();
    disableAnalytics();
  });
  if (preferencesButton) {
    preferencesButton.addEventListener('click', function () { showBanner(true); });
  }

  window.FissuraPrivacy = {
    hasAnalyticsConsent: function () { return currentChoice() === GRANTED; },
    open: function () { showBanner(true); }
  };

  var initial = readStoredChoice();
  if (initial === GRANTED) {
    loadAnalytics();
  } else if (initial === DENIED) {
    disableAnalytics();
  } else {
    showBanner(false);
  }
}());
