/* ===========================================================================
 * letture.js — Presa letture contatori (vista operaio)
 * ---------------------------------------------------------------------------
 * Modulo autonomo, sul modello di gps-native.js: si aggancia a index.html
 * iniettando da solo CSS, FAB e panel. L'unica riga da aggiungere in
 * index.html e':
 *
 *     <script src="letture.js"></script>
 *
 * subito accanto a <script src="gps-native.js"></script>.
 *
 * Dipendenze da index.html (gia' presenti):
 *   PROXY_URL, currentUser / window.currentUser, S.impianti, toast()
 *
 * Endpoint usati: GET /config-letture, GET /letture-dati, POST /salva-lettura
 * =========================================================================== */

(function () {
  'use strict';

  // ── Aggancio difensivo a quello che espone index.html ────────────────────
  function proxy() {
    return (typeof PROXY_URL !== 'undefined') ? PROXY_URL : 'https://siram-proxy.onrender.com';
  }
  function utente() {
    if (window.currentUser) return window.currentUser;
    try { return (typeof currentUser !== 'undefined') ? currentUser : null; } catch (e) { return null; }
  }
  function impiantiApp() {
    try { return (typeof S !== 'undefined' && S.impianti) ? S.impianti : []; } catch (e) { return []; }
  }
  function avviso(msg, tipo) {
    if (typeof toast === 'function') toast(msg, tipo);
    else console.log('[letture]', msg);
  }
  async function apiGetL(path) {
    const r = await fetch(proxy() + path);
    return r.json();
  }
  async function apiPostL(path, body) {
    const r = await fetch(proxy() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  // ── Stato modulo ─────────────────────────────────────────────────────────
  const L = {
    cfg: null,
    contatori: [],
    letture: [],          // letture del mese corrente
    impiantoSel: null,    // codice impianto aperto
    filtro: 'tutti',      // tutti | dafare | fatti
    caricato: false,
    posizione: null,
  };

  // ── CSS ──────────────────────────────────────────────────────────────────
  const CSS = `
.fab-let{position:absolute;bottom:max(22px,calc(18px + env(safe-area-inset-bottom,0px)));left:146px;width:54px;height:54px;border-radius:50%;background:var(--bg2);border:1.5px solid var(--bg4);color:var(--muted);font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.3)}
.fab-let:active{transform:scale(.90);background:var(--bg3)}
.fab-let.chiuso{opacity:.4}
.fab-let.aperto{border-color:var(--yellow);color:var(--yellow);background:rgba(200,180,100,.12)}
.let-banner{padding:12px 16px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--bg3)}
.let-banner.aperto{background:rgba(143,190,122,.1);color:var(--green)}
.let-banner.chiuso{background:rgba(200,180,100,.1);color:var(--yellow)}
.let-toolbar{padding:10px 16px;background:var(--bg2);border-bottom:1px solid var(--bg3);display:flex;gap:8px}
.let-search{flex:1;padding:9px 12px;background:var(--bg3);border:1.5px solid var(--bg4);border-radius:10px;color:var(--text);font-family:'Outfit',sans-serif;font-size:14px}
.let-fbtn{padding:8px 12px;border-radius:10px;border:1.5px solid var(--bg4);background:var(--bg3);color:var(--muted);font-family:'Outfit',sans-serif;font-size:13px;font-weight:700;cursor:pointer}
.let-fbtn.on{background:var(--bg4);color:var(--text);border-color:var(--accent)}
.let-comune{padding:10px 18px 4px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
.let-imp{margin:0 12px 8px;background:var(--bg2);border:1.5px solid var(--bg4);border-radius:18px;overflow:hidden;display:flex;align-items:stretch;cursor:pointer}
.let-imp:active{background:var(--bg3)}
.let-imp-strip{width:5px;flex-shrink:0}
.let-imp-body{flex:1;padding:14px 16px;display:flex;align-items:center;gap:12px;min-width:0}
.let-imp-ico{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0}
.let-imp-nome{font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.let-imp-cod{font-size:11px;color:var(--muted);margin-top:2px}
.let-imp-badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;margin-top:5px;display:inline-block}
.let-ct{background:var(--bg2);border:1.5px solid var(--bg4);border-radius:18px;margin-bottom:14px;overflow:hidden}
.let-ct.letto{border-color:rgba(143,190,122,.45)}
.let-ct-top{display:flex;align-items:center;gap:10px;padding:14px 16px 10px}
.let-ct-tipo{font-size:11px;font-weight:700;padding:3px 9px;border-radius:8px;letter-spacing:.3px;color:#1a1a1a;flex-shrink:0}
.let-ct-fascia{font-size:11px;font-weight:700;padding:3px 8px;border-radius:8px;background:var(--bg4);color:var(--text);flex-shrink:0}
.let-ct-unita{margin-left:auto;font-size:11px;color:var(--muted);flex-shrink:0}
.let-ct-descr{padding:0 16px;font-size:14px;color:var(--muted);line-height:1.4;margin-bottom:10px;word-break:break-word}
.let-ct-prec{margin:0 16px 12px;background:var(--bg3);border-radius:10px;padding:10px 12px;display:flex;align-items:baseline;gap:10px}
.let-ct-prec-lbl{font-size:12px;color:var(--muted)}
.let-ct-prec-val{font-size:18px;font-weight:700}
.let-ct-prec-data{margin-left:auto;font-size:12px;color:var(--muted)}
.let-ct-inp-row{display:flex;gap:10px;padding:0 16px 14px}
.let-ct-inp{flex:1;background:var(--bg3);border:1.5px solid var(--bg4);border-radius:12px;color:var(--text);font-family:'Outfit',sans-serif;font-size:22px;font-weight:700;padding:14px;text-align:right;min-width:0}
.let-ct-inp:focus{outline:none;border-color:var(--accent)}
.let-ct-inp:disabled{opacity:.5}
.let-ct-save{background:var(--green);border:none;border-radius:12px;color:#fff;font-family:'Outfit',sans-serif;font-size:15px;font-weight:700;padding:14px 18px;cursor:pointer;flex-shrink:0}
.let-ct-save:disabled{background:var(--bg4);color:var(--muted)}
.let-ct-save:active:not(:disabled){transform:scale(.96)}
.let-ct-esito{padding:0 16px 14px;font-size:13px;font-weight:600;color:var(--green)}
.let-ct-esito.warn{color:var(--yellow)}
.let-ct-opz{display:flex;gap:8px;padding:0 16px 14px}
.let-ct-opz button{flex:1;padding:9px;border-radius:10px;border:1.5px solid var(--bg4);background:var(--bg3);color:var(--muted);font-family:'Outfit',sans-serif;font-size:12px;font-weight:700;cursor:pointer}
.let-ct-opz button.on{border-color:var(--yellow);color:var(--yellow);background:rgba(200,180,100,.12)}
.let-nota{width:100%;background:var(--bg3);border:1.5px solid var(--bg4);border-radius:10px;color:var(--text);font-family:'Outfit',sans-serif;font-size:14px;padding:10px;margin:0 0 14px;resize:none}
.let-nota-wrap{padding:0 16px}
.let-sum{background:var(--bg2);border-bottom:1px solid var(--bg3);padding:12px 18px}
.let-sum-row{display:flex;gap:10px;margin-bottom:10px}
.let-sum-box{flex:1;background:var(--bg3);border-radius:12px;padding:10px;text-align:center;border:1px solid var(--bg4)}
.let-sum-n{font-size:26px;font-weight:700}
.let-sum-l{font-size:12px;color:var(--muted);margin-top:2px}
.let-bar{height:7px;background:var(--red);border-radius:4px;overflow:hidden}
.let-bar>div{height:100%;background:var(--green);border-radius:4px;transition:width .5s ease;width:0%}
`;

  // ── HTML dei panel ───────────────────────────────────────────────────────
  const HTML = `
<div class="panel" id="lettPanel">
  <div class="panel-top">
    <button class="back-btn" id="lettBack">‹</button>
    <div class="panel-title-wrap">
      <div class="panel-title">Letture contatori</div>
      <div class="panel-sub" id="lettSub">—</div>
    </div>
    <button id="lettReload" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:8px">↻</button>
  </div>
  <div class="let-banner" id="lettBanner"></div>
  <div class="let-sum" id="lettSum">
    <div class="let-sum-row">
      <div class="let-sum-box"><div class="let-sum-n" id="lettTot">0</div><div class="let-sum-l">Impianti</div></div>
      <div class="let-sum-box" style="border-color:rgba(63,185,80,.3)"><div class="let-sum-n" style="color:var(--green)" id="lettFatti">0</div><div class="let-sum-l">✓ Completi</div></div>
      <div class="let-sum-box" style="border-color:rgba(200,120,120,.3)"><div class="let-sum-n" style="color:var(--red)" id="lettDaFare">0</div><div class="let-sum-l">✗ Da fare</div></div>
    </div>
    <div class="let-bar"><div id="lettBar"></div></div>
  </div>
  <div class="let-toolbar">
    <input type="search" class="let-search" id="lettSearch" placeholder="🔍 Cerca impianto..."/>
    <button class="let-fbtn on" id="lettFTutti">Tutti</button>
    <button class="let-fbtn" id="lettFDaFare">✗</button>
    <button class="let-fbtn" id="lettFFatti">✓</button>
  </div>
  <div class="panel-scroll" id="lettLista" style="padding:8px 0"></div>
</div>

<div class="panel" id="lettCtPanel" style="z-index:11">
  <div class="panel-top">
    <button class="back-btn" id="lettCtBack">‹</button>
    <div class="panel-title-wrap">
      <div class="panel-title" id="lettCtTitle"></div>
      <div class="panel-sub" id="lettCtSub"></div>
    </div>
  </div>
  <div class="panel-scroll" id="lettCtLista"></div>
</div>
`;

  // ── Utility ──────────────────────────────────────────────────────────────
  const COL_TIPO = {
    CORRETTORE:  '#d9a066',
    MECCANICO:   '#7a9ec8',
    CONTATERMIE: '#b08fd8',
    ELETTRICO:   '#5cc0c8',
    ALTRO:       '#9aa0a8',
  };

  // Accetta sia "1063,15" sia "1063.15"; restituisce Number o null
  function parseNum(v) {
    if (v === null || v === undefined) return null;
    let s = v.toString().trim();
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  // Mostra i numeri con la virgola, come li scrive il foglio
  function fmtNum(n) {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('it-IT', { maximumFractionDigits: 3 });
  }

  function esc(s) {
    return (s === null || s === undefined ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function datiImpianto(codice) {
    const imp = impiantiApp().find(i => String(i.codice).trim() === String(codice).trim());
    return {
      descrizione: imp ? imp.descrizione : codice,
      comune: imp ? imp.comune : '—',
    };
  }

  function contatoriDi(codice) {
    return L.contatori
      .filter(c => String(c.codiceImpianto).trim() === String(codice).trim())
      .sort((a, b) => (a.ordine - b.ordine) ||
        String(a.codElem).localeCompare(String(b.codElem)) ||
        String(a.fascia).localeCompare(String(b.fascia)));
  }

  function letturaMese(idContatore) {
    return L.letture.find(l => l.idContatore === idContatore) || null;
  }

  // Elenco impianti con conteggio letti/totali
  function elencoImpianti() {
    const mappa = {};
    L.contatori.forEach(c => {
      const k = String(c.codiceImpianto).trim();
      if (!mappa[k]) mappa[k] = { codice: k, tot: 0, letti: 0 };
      mappa[k].tot++;
      if (letturaMese(c.id)) mappa[k].letti++;
    });
    return Object.values(mappa).map(m => {
      const d = datiImpianto(m.codice);
      return Object.assign(m, d);
    });
  }

  // ── Rendering elenco impianti ────────────────────────────────────────────
  function renderLista() {
    const search = (document.getElementById('lettSearch').value || '').toLowerCase();
    let lista = elencoImpianti();

    const tot    = lista.length;
    const fatti  = lista.filter(x => x.letti >= x.tot && x.tot > 0).length;
    const daFare = tot - fatti;
    const pct    = tot ? Math.round(fatti / tot * 100) : 0;

    document.getElementById('lettTot').textContent    = tot;
    document.getElementById('lettFatti').textContent  = fatti;
    document.getElementById('lettDaFare').textContent = daFare;
    document.getElementById('lettBar').style.width    = pct + '%';
    document.getElementById('lettSub').textContent    =
      fatti + '/' + tot + ' completi · ' + (L.cfg && L.cfg.meseCorrente ? L.cfg.meseCorrente : '');

    if (L.filtro === 'fatti')  lista = lista.filter(x => x.letti >= x.tot && x.tot > 0);
    if (L.filtro === 'dafare') lista = lista.filter(x => x.letti < x.tot);
    if (search) lista = lista.filter(x =>
      (x.codice + ' ' + x.descrizione + ' ' + x.comune).toLowerCase().indexOf(search) >= 0);

    lista.sort((a, b) =>
      (a.comune || '').localeCompare(b.comune || '') ||
      (a.descrizione || '').localeCompare(b.descrizione || ''));

    if (!lista.length) {
      document.getElementById('lettLista').innerHTML =
        '<div class="empty" style="padding:60px 20px"><div style="font-size:48px;opacity:.3;margin-bottom:12px">🔢</div>' +
        '<div class="empty-txt">Nessun impianto</div></div>';
      return;
    }

    let html = '', ultimoComune = null;
    lista.forEach(x => {
      if (x.comune !== ultimoComune) {
        html += '<div class="let-comune">📍 ' + esc(x.comune || '—') + '</div>';
        ultimoComune = x.comune;
      }
      const completo = x.letti >= x.tot && x.tot > 0;
      const parziale = x.letti > 0 && !completo;
      const col = completo ? 'var(--green)' : parziale ? 'var(--yellow)' : 'var(--red)';
      const bg  = completo ? 'rgba(63,185,80,.12)' : parziale ? 'rgba(200,180,100,.12)' : 'rgba(200,120,120,.1)';
      const ico = completo ? '✓' : parziale ? '◐' : '✗';
      html +=
        '<div class="let-imp" data-cod="' + esc(x.codice) + '">' +
          '<div class="let-imp-strip" style="background:' + col + '"></div>' +
          '<div class="let-imp-body">' +
            '<div class="let-imp-ico" style="background:' + bg + ';color:' + col + '">' + ico + '</div>' +
            '<div style="flex:1;min-width:0">' +
              '<div class="let-imp-nome">' + esc(x.descrizione) + '</div>' +
              '<div class="let-imp-cod">' + esc(x.codice) + '</div>' +
              '<div><span class="let-imp-badge" style="background:' + bg + ';color:' + col + '">' +
                x.letti + '/' + x.tot + ' contatori</span></div>' +
            '</div>' +
            '<div style="color:var(--muted);font-size:20px">›</div>' +
          '</div>' +
        '</div>';
    });
    const el = document.getElementById('lettLista');
    el.innerHTML = html;
    el.querySelectorAll('.let-imp').forEach(n => {
      n.addEventListener('click', () => apriContatori(n.getAttribute('data-cod')));
    });
  }

  // ── Rendering contatori di un impianto ───────────────────────────────────
  function renderContatori() {
    const cod  = L.impiantoSel;
    const cts  = contatoriDi(cod);
    const d    = datiImpianto(cod);
    const apre = L.cfg && L.cfg.apertoOggi;

    document.getElementById('lettCtTitle').textContent = d.descrizione;
    document.getElementById('lettCtSub').textContent   = cod + ' · ' + (d.comune || '') + ' · ' + cts.length + ' contatori';

    if (!cts.length) {
      document.getElementById('lettCtLista').innerHTML =
        '<div class="empty" style="padding:60px 20px"><div class="empty-txt">Nessun contatore</div>' +
        '<div class="empty-sub">Questo impianto non è nel file importazioni</div></div>';
      return;
    }

    let html = '';
    let ultimoVettore = null;
    cts.forEach(c => {
      if (c.vettore !== ultimoVettore) {
        const icoV = c.vettore === 'ELETTRICO' ? '⚡' : c.vettore === 'TERMICO' ? '🌡' : '🔥';
        html += '<div class="chk-sec" style="margin-top:6px">' + icoV + ' ' + esc(c.vettore) + '</div>';
        ultimoVettore = c.vettore;
      }
      const let_  = letturaMese(c.id);
      const col   = COL_TIPO[c.tipo] || COL_TIPO.ALTRO;
      const valIn = let_ ? String(let_.valore).replace('.', ',') : '';
      const evSel = let_ ? let_.evento : 'LETTURA NORMALE';
      const stima = let_ && /stima/i.test(let_.commenti || '');

      html +=
        '<div class="let-ct ' + (let_ ? 'letto' : '') + '" id="ct-' + esc(c.id) + '">' +
          '<div class="let-ct-top">' +
            '<span class="let-ct-tipo" style="background:' + col + '">' + esc(c.tipo) + '</span>' +
            (c.fascia ? '<span class="let-ct-fascia">' + esc(c.fascia) + '</span>' : '') +
            '<span class="let-ct-unita">' + esc(c.unita) + '</span>' +
          '</div>' +
          '<div class="let-ct-descr">' + esc(c.descrizione || '—') + '<br>' +
            '<span style="opacity:.6">' + esc(c.codiceIT) + ' · elem ' + esc(c.codElem) + '</span></div>' +
          '<div class="let-ct-prec">' +
            '<span class="let-ct-prec-lbl">Ultima</span>' +
            '<span class="let-ct-prec-val">' + fmtNum(c.ultimaLettura) + '</span>' +
            '<span class="let-ct-prec-data">' + esc(c.dataUltimaLettura || '—') + '</span>' +
          '</div>' +
          '<div class="let-ct-inp-row">' +
            '<input class="let-ct-inp" type="text" inputmode="decimal" placeholder="Nuova lettura" ' +
              'value="' + esc(valIn) + '" data-id="' + esc(c.id) + '" ' + (apre ? '' : 'disabled') + '/>' +
            '<button class="let-ct-save" data-id="' + esc(c.id) + '" ' + (apre ? '' : 'disabled') + '>Salva</button>' +
          '</div>' +
          '<div class="let-ct-opz">' +
            '<button data-ev="LETTURA NORMALE" data-id="' + esc(c.id) + '" class="' + (evSel === 'LETTURA NORMALE' ? 'on' : '') + '">Normale</button>' +
            '<button data-ev="GUASTO" data-id="' + esc(c.id) + '" class="' + (evSel === 'GUASTO' ? 'on' : '') + '">Guasto</button>' +
            '<button data-ev="STIMA" data-id="' + esc(c.id) + '" class="' + (stima ? 'on' : '') + '">Stima</button>' +
          '</div>' +
          '<div class="let-nota-wrap"><textarea class="let-nota" rows="1" placeholder="Commento (facoltativo)" ' +
            'data-id="' + esc(c.id) + '">' + esc(let_ ? let_.commenti : '') + '</textarea></div>' +
          '<div class="let-ct-esito" id="esito-' + esc(c.id) + '">' +
            (let_ ? '✓ Salvata' + (let_.consumo !== null && let_.consumo !== '' ? ' · consumo ' + fmtNum(let_.consumo) : '') : '') +
          '</div>' +
        '</div>';
    });

    const el = document.getElementById('lettCtLista');
    el.innerHTML = html;

    el.querySelectorAll('.let-ct-save').forEach(b => {
      b.addEventListener('click', () => salva(b.getAttribute('data-id')));
    });
    el.querySelectorAll('.let-ct-opz button').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const ev = b.getAttribute('data-ev');
        const gruppo = b.parentElement.querySelectorAll('button');
        if (ev === 'STIMA') {
          b.classList.toggle('on');
        } else {
          gruppo.forEach(x => { if (x.getAttribute('data-ev') !== 'STIMA') x.classList.remove('on'); });
          b.classList.add('on');
        }
      });
    });
  }

  // ── Salvataggio di una singola lettura ───────────────────────────────────
  async function salva(idContatore) {
    const box = document.getElementById('ct-' + idContatore);
    if (!box) return;

    const inp  = box.querySelector('.let-ct-inp');
    const btn  = box.querySelector('.let-ct-save');
    const nota = box.querySelector('.let-nota');
    const es   = document.getElementById('esito-' + idContatore);

    const val = parseNum(inp.value);
    if (val === null) { avviso('Inserisci un numero valido', 'err'); inp.focus(); return; }

    const c = L.contatori.find(x => x.id === idContatore);
    if (c && c.ultimaLettura !== null && val < c.ultimaLettura) {
      const ok = confirm(
        'La nuova lettura (' + fmtNum(val) + ') è minore della precedente (' + fmtNum(c.ultimaLettura) + ').\n\n' +
        'Giro di quadrante, contatore sostituito o errore di battitura?\n\nSalvo lo stesso?');
      if (!ok) { inp.focus(); return; }
    }

    // Evento e commento dai pulsanti
    let evento = 'LETTURA NORMALE';
    let stima  = false;
    box.querySelectorAll('.let-ct-opz button').forEach(b => {
      const ev = b.getAttribute('data-ev');
      if (!b.classList.contains('on')) return;
      if (ev === 'STIMA') stima = true; else evento = ev;
    });
    let commenti = (nota.value || '').trim();
    if (stima && !/stima/i.test(commenti)) commenti = ('stima ' + commenti).trim();

    btn.disabled = true;
    btn.textContent = '...';
    try {
      const r = await apiPostL('/salva-lettura', {
        idContatore,
        valore: val,
        evento,
        commenti,
        operaio: utente(),
        lat: L.posizione ? L.posizione.lat : null,
        lon: L.posizione ? L.posizione.lon : null,
      });

      if (!r.ok) {
        es.className = 'let-ct-esito warn';
        es.textContent = '⚠ ' + (r.errore || 'Errore salvataggio');
        avviso(r.chiuso ? 'Letture chiuse oggi' : 'Errore salvataggio', 'err');
        return;
      }

      box.classList.add('letto');
      es.className = 'let-ct-esito';
      es.textContent = (r.aggiornata ? '✓ Aggiornata' : '✓ Salvata') +
        (r.consumo !== '' && r.consumo !== null && r.consumo !== undefined ? ' · consumo ' + fmtNum(r.consumo) : '') +
        (r.calo ? ' · ⚠ inferiore alla precedente' : '');

      // Aggiorna lo stato locale senza ricaricare tutto
      const esistente = L.letture.find(l => l.idContatore === idContatore);
      const nuova = {
        id: r.id, idContatore, valore: val, evento, commenti,
        operaio: utente(), consumo: r.consumo, dataOra: '',
      };
      if (esistente) Object.assign(esistente, nuova); else L.letture.push(nuova);

      renderLista();
      avviso(r.aggiornata ? 'Lettura aggiornata ✓' : 'Lettura salvata ✓', 'ok');
    } catch (e) {
      es.className = 'let-ct-esito warn';
      es.textContent = '⚠ Errore rete — riprova';
      avviso('Errore rete', 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salva';
    }
  }

  // ── Apertura / chiusura panel ────────────────────────────────────────────
  function apriContatori(cod) {
    L.impiantoSel = cod;
    renderContatori();
    document.getElementById('lettCtPanel').classList.add('open');
    document.getElementById('lettCtLista').scrollTop = 0;
  }
  function chiudiContatori() {
    document.getElementById('lettCtPanel').classList.remove('open');
    L.impiantoSel = null;
    renderLista();
  }

  function bannerFinestra() {
    const b = document.getElementById('lettBanner');
    if (!L.cfg) { b.className = 'let-banner'; b.textContent = ''; return; }
    if (L.cfg.apertoOggi) {
      b.className = 'let-banner aperto';
      b.textContent = '🟢 Finestra letture aperta — giorni ' + (L.cfg.giorni || []).join(', ') +
        (L.cfg.sempreAperte ? ' (blocco disattivato)' : '');
    } else {
      b.className = 'let-banner chiuso';
      b.textContent = '🔒 Letture chiuse — prossima finestra il ' + (L.cfg.prossimaFinestra || '—');
    }
  }

  async function carica() {
    document.getElementById('lettLista').innerHTML =
      '<div class="loading-ctr"><div class="spinner"></div>Caricamento contatori...</div>';
    try {
      const d = await apiGetL('/letture-dati');
      if (!d.ok) throw new Error(d.errore || 'errore');
      L.cfg       = d;
      L.contatori = d.contatori || [];
      L.letture   = d.letture || [];
      L.caricato  = true;
      if (d.avviso) avviso(d.avviso, 'err');
      bannerFinestra();
      renderLista();
    } catch (e) {
      document.getElementById('lettLista').innerHTML =
        '<div class="loading-ctr" style="color:var(--red)">Errore caricamento.<br>Controlla la rete.</div>';
    }
  }

  async function apriLetture() {
    // Config sempre fresca: i giorni possono cambiare di mese in mese
    let cfg = null;
    try { cfg = await apiGetL('/config-letture'); } catch (e) { /* offline: si apre lo stesso */ }
    if (cfg && cfg.ok) { L.cfg = Object.assign(L.cfg || {}, cfg); aggiornaFab(); }

    if (cfg && cfg.ok && !cfg.apertoOggi) {
      avviso('Letture chiuse · prossima finestra il ' + (cfg.prossimaFinestra || '—'), 'err');
      return;
    }

    document.getElementById('lettPanel').classList.add('open');
    posizione();
    if (!L.caricato) carica(); else { bannerFinestra(); renderLista(); }
  }

  function chiudiLetture() {
    document.getElementById('lettPanel').classList.remove('open');
  }

  function aggiornaFab() {
    const f = document.getElementById('fabLetture');
    if (!f || !L.cfg) return;
    f.classList.toggle('aperto', !!L.cfg.apertoOggi);
    f.classList.toggle('chiuso', !L.cfg.apertoOggi);
    f.title = L.cfg.apertoOggi
      ? 'Letture contatori — finestra aperta'
      : 'Letture chiuse — prossima finestra il ' + (L.cfg.prossimaFinestra || '—');
  }

  // Posizione best-effort: se il GPS non risponde si salva lo stesso
  function posizione() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      p => { L.posizione = { lat: p.coords.latitude, lon: p.coords.longitude }; },
      () => { L.posizione = null; },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  // ── Innesto nel DOM ──────────────────────────────────────────────────────
  function innesta() {
    const app  = document.getElementById('app');
    const main = document.getElementById('mainScreen');
    if (!app || !main) { console.warn('[letture] index.html non pronto'); return; }

    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    const fab = document.createElement('button');
    fab.className = 'fab-let chiuso';
    fab.id = 'fabLetture';
    fab.textContent = '🔢';
    fab.title = 'Letture contatori';
    fab.addEventListener('click', apriLetture);
    main.appendChild(fab);

    const wrap = document.createElement('div');
    wrap.innerHTML = HTML;
    while (wrap.firstElementChild) app.appendChild(wrap.firstElementChild);

    document.getElementById('lettBack').addEventListener('click', chiudiLetture);
    document.getElementById('lettCtBack').addEventListener('click', chiudiContatori);
    document.getElementById('lettReload').addEventListener('click', carica);
    document.getElementById('lettSearch').addEventListener('input', renderLista);

    const filtri = { lettFTutti: 'tutti', lettFDaFare: 'dafare', lettFFatti: 'fatti' };
    Object.keys(filtri).forEach(id => {
      document.getElementById(id).addEventListener('click', () => {
        L.filtro = filtri[id];
        Object.keys(filtri).forEach(x => document.getElementById(x).classList.toggle('on', x === id));
        renderLista();
      });
    });

    // Stato iniziale del FAB (aperto/chiuso) senza aspettare il primo tap
    apiGetL('/config-letture')
      .then(c => { if (c && c.ok) { L.cfg = Object.assign(L.cfg || {}, c); aggiornaFab(); } })
      .catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', innesta);
  } else {
    innesta();
  }

})();
