// ============================================================
//  SIRAM NATIVE — OneSignal (push) + GPS background
//  Questo file viene caricato SOLO dentro l'app Android (Capacitor).
//
//  Va incluso nell'index.html del sito live con:
//    <script src="gps-native.js"></script>
//  Il codice si attiva solo se rileva Capacitor (window.Capacitor),
//  quindi nel browser desktop/mobile normale non fa nulla.
//
//  PARTE 1 — OneSignal: registra l'operaio come "external id" così
//            il server può inviargli notifiche mirate per nome.
//  PARTE 2 — GPS presenze (in standby, codice conservato).
// ============================================================

(function () {
  // Esce subito se non siamo dentro l'app Capacitor
  if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
    console.log('[Native] Non in app nativa — modulo disattivato');
    return;
  }

  var ONESIGNAL_APP_ID = '32ab0140-3994-4704-a3c9-07b9f4790a6f';
  var PROXY_URL = 'https://siram-proxy.onrender.com';

  // ==========================================================
  //  PARTE 1 — ONESIGNAL PUSH
  // ==========================================================

  var oneSignalPronto = false;
  var operaioLoggato = null;

  function operaioCorrente() {
    return (typeof window.currentUser === 'string' && window.currentUser) ? window.currentUser : null;
  }

  // Trova l'oggetto OneSignal esposto dal plugin (5.x).
  // Il plugin espone l'API reale sotto la proprietà `default` (ES module),
  // con fallback agli altri percorsi per sicurezza.
  function getOneSignal() {
    if (window.OneSignal && window.OneSignal.default && typeof window.OneSignal.default.initialize === 'function') {
      return window.OneSignal.default;
    }
    if (window.OneSignal && typeof window.OneSignal.initialize === 'function') {
      return window.OneSignal;
    }
    if (window.plugins && window.plugins.OneSignal && typeof window.plugins.OneSignal.initialize === 'function') {
      return window.plugins.OneSignal;
    }
    if (window.plugins && window.plugins.OneSignal && window.plugins.OneSignal.default) {
      return window.plugins.OneSignal.default;
    }
    return null;
  }

  // Inizializza OneSignal una sola volta
  function initOneSignal() {
    var OneSignal = getOneSignal();
    if (!OneSignal) {
      console.warn('[OneSignal] Plugin non disponibile');
      return;
    }
    try {
      // API 5.x
      OneSignal.initialize(ONESIGNAL_APP_ID);

      // Richiedi il permesso notifiche all'utente
      OneSignal.Notifications.requestPermission(true).then(function (accepted) {
        console.log('[OneSignal] Permesso notifiche:', accepted);
      }).catch(function (e) {
        console.warn('[OneSignal] requestPermission error:', e);
      });

      oneSignalPronto = true;
      console.log('[OneSignal] Inizializzato con App ID', ONESIGNAL_APP_ID);

      // Se l'operaio è già loggato, associalo subito
      var op = operaioCorrente();
      if (op) loginOperaio(op);

    } catch (e) {
      console.warn('[OneSignal] Init fallito:', e.message);
    }
  }

  // Associa il dispositivo all'operaio (External ID = nome operaio)
  function loginOperaio(nome) {
    var OneSignal = getOneSignal();
    if (!OneSignal || !oneSignalPronto) return;
    try {
      OneSignal.login(nome);
      operaioLoggato = nome;
      console.log('[OneSignal] login operaio:', nome);
    } catch (e) {
      console.warn('[OneSignal] login error:', e.message);
    }
  }

  function logoutOperaio() {
    var OneSignal = getOneSignal();
    if (!OneSignal || !oneSignalPronto) return;
    try {
      OneSignal.logout();
      console.log('[OneSignal] logout operaio:', operaioLoggato);
      operaioLoggato = null;
    } catch (e) {
      console.warn('[OneSignal] logout error:', e.message);
    }
  }

  // Sorveglia login/logout della web app (currentUser cambia)
  // e mantiene allineato l'External ID di OneSignal.
  setInterval(function () {
    if (!oneSignalPronto) return;
    var op = operaioCorrente();
    if (op && op !== operaioLoggato) {
      loginOperaio(op);
    } else if (!op && operaioLoggato) {
      logoutOperaio();
    }
  }, 3000);

  // Avvia OneSignal: il deviceready di Cordova garantisce che il plugin sia caricato.
  document.addEventListener('deviceready', initOneSignal, false);
  // Fallback: se deviceready è già passato, prova dopo un attimo.
  setTimeout(function () {
    if (!oneSignalPronto) initOneSignal();
  }, 2500);


  // ==========================================================
  //  PARTE 2 — GPS PRESENZE (IN STANDBY)
  //  Codice conservato ma non avviato. Per riattivarlo,
  //  chiamare avviaGPS() al login.
  // ==========================================================

  var watcherId = null;
  var ultimaPos = null;
  var presenzaOggi = {};
  var ultimoReset = oggiStr();

  var ORARI = [
    { ora: '07:30', tipo: 'Arrivo'  },
    { ora: '12:30', tipo: 'Pausa'   },
    { ora: '13:30', tipo: 'Rientro' },
    { ora: '16:30', tipo: 'Uscita'  },
    { ora: '18:00', tipo: 'Uscita'  }
  ];
  var TOLLERANZA = 5;

  function oggiStr() {
    return new Date().toISOString().slice(0, 10);
  }
  function oraHHMM() {
    var n = new Date();
    return ('0' + n.getHours()).slice(-2) + ':' + ('0' + n.getMinutes()).slice(-2);
  }
  function minDiff(a, b) {
    var pa = a.split(':'), pb = b.split(':');
    return Math.abs((pa[0]*60 + +pa[1]) - (pb[0]*60 + +pb[1]));
  }

  function avviaGPS() {
    var BG = window.Capacitor.Plugins.BackgroundGeolocation;
    if (!BG) {
      console.warn('[GPS] Plugin BackgroundGeolocation non disponibile');
      return;
    }
    BG.addWatcher({
      backgroundMessage: 'Portale Veolia in funzione',
      backgroundTitle: 'Siram Manutenzione',
      requestPermissions: true,
      stale: false,
      distanceFilter: 20
    }, function (location, error) {
      if (error) {
        if (error.code === 'NOT_AUTHORIZED') console.warn('[GPS] Permesso negato');
        return;
      }
      if (!location) return;
      ultimaPos = { lat: location.latitude, lon: location.longitude, batt: null, time: new Date() };
      controllaOrario();
    }).then(function (id) {
      watcherId = id;
      console.log('[GPS] Watcher avviato:', id);
    });
  }

  function fermaGPS() {
    var BG = window.Capacitor.Plugins.BackgroundGeolocation;
    if (BG && watcherId) {
      BG.removeWatcher({ id: watcherId });
      watcherId = null;
      console.log('[GPS] Watcher fermato');
    }
  }

  function controllaOrario() {
    if (oggiStr() !== ultimoReset) { presenzaOggi = {}; ultimoReset = oggiStr(); }
    var operaio = operaioCorrente();
    if (!operaio || !ultimaPos) return;
    var ora = oraHHMM(), match = null;
    for (var i = 0; i < ORARI.length; i++) {
      if (minDiff(ora, ORARI[i].ora) <= TOLLERANZA) { match = ORARI[i]; break; }
    }
    if (!match) return;
    if (presenzaOggi[match.tipo]) return;
    presenzaOggi[match.tipo] = true;
    inviaPresenza(operaio, ultimaPos.lat, ultimaPos.lon, match.tipo);
  }

  function inviaPresenza(operaio, lat, lon, tipo) {
    fetch(PROXY_URL + '/registra-presenza', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operaio: operaio, lat: lat, lon: lon, tipo: tipo })
    })
    .then(function (r) { return r.json(); })
    .then(function (d) { console.log('[GPS] Presenza', tipo, 'inviata:', d); })
    .catch(function (e) {
      console.warn('[GPS] Errore invio presenza:', e.message);
      presenzaOggi[tipo] = false;
    });
  }

  // GPS non avviato (standby). Per riattivare: agganciare avviaGPS()/fermaGPS()
  // al login/logout come nella versione precedente.

  console.log('[Native] Modulo caricato — OneSignal attivo, GPS in standby');
})();
