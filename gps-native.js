// ============================================================
//  SIRAM NATIVE — OneSignal (push) + ponte presenze native
//  Questo file viene caricato SOLO dentro l'app Android (Capacitor).
//
//  Va incluso nell'index.html del sito live con:
//    <script src="gps-native.js"></script>
//  Il codice si attiva solo se rileva Capacitor (window.Capacitor),
//  quindi nel browser desktop/mobile normale non fa nulla.
//
//  PARTE 1 — OneSignal: registra l'operaio come "external id" così
//            il server può inviargli notifiche mirate per nome.
//  PARTE 2 — Ponte presenze: salva il nome operaio in Preferences
//            (SharedPreferences Android) così il WorkManager nativo
//            sa chi è loggato e può rilevare la presenza a 07:15/16:00
//            anche con l'app chiusa.
// ============================================================

(function () {
  // Esce subito se non siamo dentro l'app Capacitor
  if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
    console.log('[Native] Non in app nativa — modulo disattivato');
    return;
  }

  var ONESIGNAL_APP_ID = '32ab0140-3994-4704-a3c9-07b9f4790a6f';

  // ==========================================================
  //  PARTE 1 — ONESIGNAL PUSH
  // ==========================================================

  var oneSignalPronto = false;
  var operaioLoggato = null;

  function operaioCorrente() {
    return (typeof window.currentUser === 'string' && window.currentUser) ? window.currentUser : null;
  }

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

  function initOneSignal() {
    var OneSignal = getOneSignal();
    if (!OneSignal) {
      console.warn('[OneSignal] Plugin non disponibile');
      return;
    }
    try {
      OneSignal.initialize(ONESIGNAL_APP_ID);
      OneSignal.Notifications.requestPermission(true).then(function (accepted) {
        console.log('[OneSignal] Permesso notifiche:', accepted);
      }).catch(function (e) {
        console.warn('[OneSignal] requestPermission error:', e);
      });
      oneSignalPronto = true;
      console.log('[OneSignal] Inizializzato con App ID', ONESIGNAL_APP_ID);
      var op = operaioCorrente();
      if (op) loginOperaio(op);
    } catch (e) {
      console.warn('[OneSignal] Init fallito:', e.message);
    }
  }

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

  // ==========================================================
  //  PARTE 2 — PONTE PRESENZE (JS → nativo)
  //  Salva/rimuove il nome operaio in Preferences così il
  //  WorkManager nativo sa chi è loggato.
  // ==========================================================

  function getPreferences() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences) {
      return window.Capacitor.Plugins.Preferences;
    }
    return null;
  }

  function salvaOperaioNativo(nome) {
    var Prefs = getPreferences();
    if (!Prefs) { console.warn('[Presenze] Plugin Preferences non disponibile'); return; }
    // Chiave 'operaio_presenze' — la stessa che leggerà il worker Java.
    Prefs.set({ key: 'operaio_presenze', value: nome }).then(function () {
      console.log('[Presenze] Operaio salvato per il worker nativo:', nome);
    }).catch(function (e) {
      console.warn('[Presenze] Errore salvataggio operaio:', e.message);
    });
  }

  function rimuoviOperaioNativo() {
    var Prefs = getPreferences();
    if (!Prefs) return;
    Prefs.remove({ key: 'operaio_presenze' }).then(function () {
      console.log('[Presenze] Operaio rimosso dal worker nativo');
    }).catch(function (e) {
      console.warn('[Presenze] Errore rimozione operaio:', e.message);
    });
  }

  // ==========================================================
  //  SORVEGLIANZA login/logout
  //  Allinea OneSignal e il nome operaio salvato per il nativo.
  // ==========================================================
  setInterval(function () {
    if (!oneSignalPronto) return;
    var op = operaioCorrente();
    if (op && op !== operaioLoggato) {
      loginOperaio(op);
      salvaOperaioNativo(op);   // il worker nativo ora sa chi è loggato
    } else if (!op && operaioLoggato) {
      logoutOperaio();
      rimuoviOperaioNativo();   // niente operaio → niente rilevamento
    }
  }, 3000);

  // Avvio robusto OneSignal (deviceready in Capacitor può non scattare)
  var tentativiInit = 0;
  var initTimer = setInterval(function () {
    tentativiInit++;
    if (oneSignalPronto) { clearInterval(initTimer); return; }
    var OneSignal = getOneSignal();
    if (OneSignal) {
      initOneSignal();
      if (oneSignalPronto) clearInterval(initTimer);
    }
    if (tentativiInit >= 15) clearInterval(initTimer);
  }, 2000);

  console.log('[Native] Modulo caricato — OneSignal attivo, ponte presenze native attivo');
})();
