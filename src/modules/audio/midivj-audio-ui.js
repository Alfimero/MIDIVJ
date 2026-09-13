/* ══════════════════════════════════════════════════════════════════════
   MIDIVJ — Vista AUDIO
   ══════════════════════════════════════════════════════════════════════

   Interfaz del módulo de audio. Está aparte a propósito: el motor
   (`midivj-audio-engine.js`) funciona sin esta vista, y esta vista no sabe
   nada de MIDIVJ más allá del motor y del registro de destinos/acciones.

   Los medidores se refrescan con un `setInterval` propio a ~30 Hz que sólo
   corre mientras el panel está abierto, leyendo el último valor que dejó el
   hilo de audio. No hay ningún camino en el que dibujar esta interfaz
   pueda frenar el análisis: el worklet no espera a nadie.
   ────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const CSS = `
  #audio-ovl{position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;z-index:60;}
  #audio-ovl.vis{display:flex;}
  #audio-panel{background:var(--panel,#101022);border:1px solid var(--border2,#2a2a4a);border-radius:6px;width:min(880px,96vw);max-height:92vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,.6);}
  #audio-panel header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border,#1e1e3a);}
  #audio-panel h2{margin:0;font-family:var(--mono,monospace);font-size:12px;letter-spacing:2px;color:var(--accent,#00ff88);flex:1;}
  .au-cuerpo{padding:14px 16px 18px;display:flex;flex-direction:column;gap:16px;}
  .au-sec{border:1px solid var(--border,#1e1e3a);border-radius:5px;overflow:hidden;}
  .au-sec > h3{margin:0;padding:7px 10px;background:var(--panel2,#141430);font-family:var(--mono,monospace);font-size:9px;letter-spacing:2px;color:var(--text2,#9a9ac0);display:flex;align-items:center;gap:8px;}
  .au-sec > h3 .au-sp{flex:1;}
  .au-lista{padding:8px 10px;display:flex;flex-direction:column;gap:8px;}
  .au-fila{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-family:var(--mono,monospace);font-size:9px;color:var(--text2,#9a9ac0);}
  .au-fila .au-nom{min-width:150px;color:var(--text,#e6e6ff);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .au-fila select,.au-fila input[type=text],.au-fila input[type=number]{background:var(--panel2,#141430);border:1px solid var(--border2,#2a2a4a);color:var(--text2,#9a9ac0);font-family:var(--mono,monospace);font-size:9px;padding:2px 4px;outline:none;}
  .au-fila input[type=range]{width:96px;accent-color:var(--accent,#00ff88);}
  .au-btn{background:var(--panel2,#141430);border:1px solid var(--border2,#2a2a4a);color:var(--text2,#9a9ac0);font-family:var(--mono,monospace);font-size:9px;letter-spacing:1px;padding:4px 9px;cursor:pointer;}
  .au-btn:hover{border-color:var(--accent,#00ff88);color:var(--accent,#00ff88);}
  .au-btn.on{border-color:var(--accent,#00ff88);color:var(--accent,#00ff88);background:rgba(0,255,136,.08);}
  .au-btn.danger:hover{border-color:#ff4466;color:#ff4466;}
  .au-med{position:relative;height:9px;flex:1;min-width:110px;background:#05050e;border:1px solid var(--border,#1e1e3a);overflow:hidden;}
  .au-med i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#00ff88,#ffd400 78%,#ff4466);transition:width .05s linear;}
  .au-med b{position:absolute;top:0;bottom:0;width:2px;background:#fff;opacity:.65;}
  .au-mini{width:64px;height:6px;background:#05050e;border:1px solid var(--border,#1e1e3a);position:relative;overflow:hidden;}
  .au-mini i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--accent,#00ff88);}
  .au-gate{width:9px;height:9px;border-radius:50%;background:#33334d;flex-shrink:0;}
  .au-gate.on{background:var(--accent,#00ff88);box-shadow:0 0 7px var(--accent,#00ff88);}
  .au-vacio{padding:12px 10px;font-family:var(--mono,monospace);font-size:9px;color:var(--text3,#5a5a7a);text-align:center;}
  .au-ayuda{margin:0;padding:0 10px 9px;font-family:var(--mono,monospace);font-size:8px;line-height:1.8;color:var(--text3,#5a5a7a);}
  .au-est{font-family:var(--mono,monospace);font-size:8px;color:var(--text3,#5a5a7a);}
  .au-sub{display:flex;gap:10px;flex-wrap:wrap;padding-left:12px;border-left:2px solid var(--border,#1e1e3a);margin-left:4px;}
  `;

  function crear(motor, host, opciones) {
    const op = opciones || {};
    const ui = { _silenciar: false, _timer: 0, _abierto: false };

    /* ── Andamiaje ── */
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const ovl = document.createElement('div');
    ovl.id = 'audio-ovl';
    ovl.innerHTML =
      '<div id="audio-panel">' +
        '<header><h2>AUDIO</h2>' +
          '<span class="au-est" id="au-est">—</span>' +
          '<button class="au-btn" id="au-cerrar">✕ CERRAR</button>' +
        '</header>' +
        '<div class="au-cuerpo">' +
          '<div class="au-sec"><h3>ENTRADAS<span class="au-sp"></span>' +
            '<button class="au-btn" id="au-activar">▶ ACTIVAR AUDIO</button>' +
            '<button class="au-btn" id="au-dispos">↻ DISPOSITIVOS</button>' +
            '<button class="au-btn" id="au-reconectar">⟲ RECONECTAR</button>' +
          '</h3>' +
            '<div class="au-lista" id="au-dispo-lista"></div>' +
            '<div class="au-lista" id="au-fuentes"></div>' +
            '<p class="au-ayuda">Una interfaz multicanal aparece como <b>un</b> dispositivo con N canales: elige el canal en el bus (Input 1 = canal 1). Se pide sin cancelación de eco ni AGC.</p>' +
          '</div>' +
          '<div class="au-sec"><h3>BUSES / ANÁLISIS<span class="au-sp"></span>' +
            '<button class="au-btn" id="au-add-bus">+ BUS</button></h3>' +
            '<div class="au-lista" id="au-buses"></div>' +
            '<p class="au-ayuda">Analizar no es escuchar: <b>MONITOR</b> apagado significa que el bus alimenta visuales sin sonar por la salida de la computadora.</p>' +
          '</div>' +
          '<div class="au-sec"><h3>MAPEOS — audio → parámetro<span class="au-sp"></span>' +
            '<button class="au-btn" id="au-add-map">+ MAPEO</button></h3>' +
            '<div class="au-lista" id="au-mapeos"></div>' +
          '</div>' +
          '<div class="au-sec"><h3>EVENTOS — audio → disparo<span class="au-sp"></span>' +
            '<button class="au-btn" id="au-add-ev">+ EVENTO</button></h3>' +
            '<div class="au-lista" id="au-enlaces"></div>' +
          '</div>' +
          '<div class="au-sec"><h3>DIAGNÓSTICO</h3>' +
            '<div class="au-lista"><div class="au-fila" id="au-diag">—</div></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ovl);

    const $ = id => document.getElementById(id);
    ovl.addEventListener('click', e => { if (e.target === ovl) ui.cerrar(); });
    $('au-cerrar').onclick = () => ui.cerrar();

    /* ── Acciones de cabecera ── */
    $('au-activar').onclick = async () => {
      try { await motor.start(); motor.rearmarTodo(); avisar('Audio activo.'); }
      catch (e) { avisar('No se pudo activar: ' + (e.message || e)); }
      pintar();
    };
    $('au-dispos').onclick = async () => {
      try {
        if (motor.estado !== 'activo') await motor.start();
        ui._dispositivos = await motor.listarDispositivos(true);
      } catch (e) { avisar('No se pudieron listar dispositivos: ' + (e.message || e)); }
      pintar();
    };
    $('au-reconectar').onclick = async () => {
      try { await motor.reconectar(); avisar('Fuentes reconectadas.'); }
      catch (e) { avisar('Reconexión incompleta: ' + (e.message || e)); }
      pintar();
    };
    $('au-add-bus').onclick = () => {
      const f = [...motor.fuentes.values()][0];
      motor.agregarBus({ name: 'BUS ' + (motor.buses.size + 1), sourceId: f ? f.id : '', channel: 'mix' });
    };
    $('au-add-map').onclick = () => {
      const b = [...motor.buses.values()][0];
      motor.agregarMapeo({ busId: b ? b.id : '', senal: 'env', targetId: primerDestino(), curva: 'linear' });
    };
    $('au-add-ev').onclick = () => {
      const b = [...motor.buses.values()][0];
      motor.agregarEnlace({ busId: b ? b.id : '', ev: 'gate.open', accionId: primeraAccion() });
    };

    function primerDestino() { const l = host.targets.listar(); return l.length ? l[0].id : ''; }
    function primeraAccion() { const l = host.acciones.listar(); return l.length ? l[0].id : ''; }
    function avisar(txt) { if (op.avisar) op.avisar(txt); }

    /* ── Utilidades de construcción ── */
    function el(html) { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
    function opciones(lista, sel, valor, etiqueta) {
      return lista.map(x => {
        const v = valor(x), t = etiqueta(x);
        return '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('');
    }
    function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    /* Cambiar algo del motor dispara onChange → repintado. Mientras se
       arrastra un slider eso robaría el foco, así que se silencia. */
    function sinRepintar(fn) { ui._silenciar = true; try { fn(); } finally { ui._silenciar = false; } }

    /* ══ Pintado ══════════════════════════════════════════════════ */

    function pintar() {
      if (!ui._abierto) return;
      pintarEstado();
      pintarDispositivos();
      pintarFuentes();
      pintarBuses();
      pintarMapeos();
      pintarEnlaces();
    }

    function pintarEstado() {
      const s = motor.getStatus();
      $('au-est').textContent = s.estado.toUpperCase() + (s.sampleRate ? ' · ' + s.sampleRate + ' Hz' : '') +
        (s.error ? ' · ' + s.error : '');
      $('au-diag').innerHTML =
        '<span>sampleRate <b>' + (s.sampleRate || '—') + '</b></span>' +
        '<span>bufferSize <b>' + s.bufferSize + '</b></span>' +
        '<span>inputLatency <b>' + (s.inputLatency * 1000).toFixed(1) + ' ms</b></span>' +
        '<span>outputLatency <b>' + (s.outputLatency * 1000).toFixed(1) + ' ms</b></span>' +
        '<span>cuadros <b>' + s.cuadros + '</b></span>' +
        '<span>saltos <b>' + s.saltos + '</b></span>' +
        '<span>Δ cuadro <b>' + s.msEntreCuadros.toFixed(1) + ' ms</b></span>';
    }

    function pintarDispositivos() {
      const cont = $('au-dispo-lista');
      const lista = ui._dispositivos || [];
      if (!lista.length) { cont.innerHTML = '<div class="au-vacio">Pulsa ↻ DISPOSITIVOS para listar las entradas del sistema.</div>'; return; }
      cont.innerHTML = '';
      lista.forEach(d => {
        const fila = el('<div class="au-fila"><span class="au-nom">' + esc(d.label) + '</span>' +
          '<button class="au-btn">+ AGREGAR</button></div>');
        fila.querySelector('button').onclick = async () => {
          await motor.agregarFuente({ type: 'device', deviceId: d.deviceId, name: d.label, channels: 2 });
        };
        cont.appendChild(fila);
      });
    }

    function pintarFuentes() {
      const cont = $('au-fuentes');
      const fuentes = [...motor.fuentes.values()];
      if (!fuentes.length) { cont.innerHTML = '<div class="au-vacio">Sin entradas agregadas.</div>'; return; }
      cont.innerHTML = '';
      fuentes.forEach(f => {
        const fila = el('<div class="au-fila">' +
          '<span class="au-nom" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
          '<span>' + esc(f.type) + ' · ' + (f.channels || '?') + 'ch · ' + (f.sampleRate || '?') + 'Hz</span>' +
          '<span style="color:' + (f.status === 'activa' ? 'var(--accent,#00ff88)' : '#ff9944') + '">' + esc(f.status) + '</span>' +
          '<span>GAIN</span><input type="range" min="0" max="2" step="0.01" value="' + f.gain + '">' +
          '<span class="au-gv">' + f.gain.toFixed(2) + '</span>' +
          '<button class="au-btn danger">✕</button></div>');
        const rango = fila.querySelector('input');
        const lbl = fila.querySelector('.au-gv');
        rango.oninput = () => sinRepintar(() => {
          motor.setGananciaFuente(f.id, rango.value);
          lbl.textContent = (+rango.value).toFixed(2);
        });
        fila.querySelector('button').onclick = () => motor.quitarFuente(f.id);
        cont.appendChild(fila);
      });
    }

    function pintarBuses() {
      const cont = $('au-buses');
      const buses = [...motor.buses.values()];
      if (!buses.length) { cont.innerHTML = '<div class="au-vacio">Sin buses. Crea uno con + BUS.</div>'; return; }
      const fuentes = [...motor.fuentes.values()];
      cont.innerHTML = '';
      buses.forEach(b => {
        const f = motor.fuentes.get(b.sourceId);
        const nCan = f ? (f.channels || 1) : 1;
        const canales = ['mix'].concat(Array.from({ length: nCan }, (_, i) => i));
        const caja = el('<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<div class="au-fila">' +
            '<input type="text" class="au-bnom" value="' + esc(b.name) + '" style="width:96px">' +
            '<select class="au-bsrc">' + opciones(fuentes, b.sourceId, x => x.id, x => x.name) + '</select>' +
            '<select class="au-bcan">' + opciones(canales, b.channel, x => x, x => (x === 'mix' ? 'MEZCLA' : 'Input ' + (x + 1))) + '</select>' +
            '<span class="au-gate' + (b.ultimo.gate ? ' on' : '') + '"></span>' +
            '<div class="au-med"><i style="width:0"></i><b style="left:0"></b></div>' +
            '<button class="au-btn au-bmon' + (b.monitor ? ' on' : '') + '">MONITOR</button>' +
            '<button class="au-btn danger au-bdel">✕</button>' +
          '</div>' +
          '<div class="au-fila au-sub">' +
            '<span>LOW<div class="au-mini au-mlow"><i></i></div></span>' +
            '<span>MID<div class="au-mini au-mmid"><i></i></div></span>' +
            '<span>HIGH<div class="au-mini au-mhigh"><i></i></div></span>' +
            '<span class="au-val">env 0.00</span>' +
          '</div>' +
          '<div class="au-fila au-sub">' +
            '<span>GATE thr</span><input type="range" class="au-thr" min="0" max="0.5" step="0.005" value="' + b.analisis.gateThreshold + '">' +
            '<span>atk</span><input type="range" class="au-atk" min="0" max="0.2" step="0.001" value="' + b.analisis.gateAttack + '">' +
            '<span>hold</span><input type="range" class="au-hold" min="0" max="1" step="0.01" value="' + b.analisis.gateHold + '">' +
            '<span>rel</span><input type="range" class="au-rel" min="0" max="1" step="0.01" value="' + b.analisis.gateRelease + '">' +
            '<span>env rel</span><input type="range" class="au-env" min="0.02" max="1" step="0.01" value="' + b.analisis.envRelease + '">' +
          '</div>' +
        '</div>');

        caja.querySelector('.au-bnom').onchange = e => motor.configurarBus(b.id, { name: e.target.value });
        caja.querySelector('.au-bsrc').onchange = e => motor.configurarBus(b.id, { sourceId: e.target.value });
        caja.querySelector('.au-bcan').onchange = e => {
          const v = e.target.value;
          motor.configurarBus(b.id, { channel: v === 'mix' ? 'mix' : +v });
        };
        caja.querySelector('.au-bmon').onclick = () => motor.configurarBus(b.id, { monitor: !b.monitor });
        caja.querySelector('.au-bdel').onclick = () => motor.quitarBus(b.id);
        const cfg = (clase, clave) => {
          const r = caja.querySelector(clase);
          r.oninput = () => sinRepintar(() => motor.configurarBus(b.id, { analisis: { [clave]: +r.value } }));
        };
        cfg('.au-thr', 'gateThreshold'); cfg('.au-atk', 'gateAttack');
        cfg('.au-hold', 'gateHold'); cfg('.au-rel', 'gateRelease');
        cfg('.au-env', 'envRelease');

        b._ui = {
          barra: caja.querySelector('.au-med i'),
          umbral: caja.querySelector('.au-med b'),
          gate: caja.querySelector('.au-gate'),
          low: caja.querySelector('.au-mlow i'),
          mid: caja.querySelector('.au-mmid i'),
          high: caja.querySelector('.au-mhigh i'),
          val: caja.querySelector('.au-val'),
        };
        cont.appendChild(caja);
      });
    }

    function pintarMapeos() {
      const cont = $('au-mapeos');
      if (!motor.mapeos.length) { cont.innerHTML = '<div class="au-vacio">Sin mapeos. Ejemplo mínimo: BUS 1 · env → TRACK 1 · opacidad.</div>'; return; }
      const buses = [...motor.buses.values()];
      const destinos = host.targets.listar();
      cont.innerHTML = '';
      motor.mapeos.forEach(m => {
        const fila = el('<div class="au-fila">' +
          '<select class="au-mbus">' + opciones(buses, m.busId, x => x.id, x => x.name) + '</select>' +
          '<select class="au-msen">' + opciones(motor.senales, m.senal, x => x, x => x) + '</select>' +
          '<span>→</span>' +
          '<select class="au-mdst" style="min-width:190px">' + opciones(destinos, m.targetId, x => x.id, x => x.grupo + ' · ' + x.nombre) + '</select>' +
          '<select class="au-mcur">' + opciones(motor.curvas, m.curva, x => x, x => x) + '</select>' +
          '<span>rango</span>' +
          '<input type="number" class="au-mmin" step="0.01" min="0" max="1" value="' + m.inMin + '" style="width:52px">' +
          '<input type="number" class="au-mmax" step="0.01" min="0" max="2" value="' + m.inMax + '" style="width:52px">' +
          '<button class="au-btn au-men' + (m.enabled ? ' on' : '') + '">' + (m.enabled ? 'ON' : 'OFF') + '</button>' +
          '<button class="au-btn danger au-mdel">✕</button>' +
        '</div>');
        fila.querySelector('.au-mbus').onchange = e => motor.configurarMapeo(m.id, { busId: e.target.value });
        fila.querySelector('.au-msen').onchange = e => motor.configurarMapeo(m.id, { senal: e.target.value });
        fila.querySelector('.au-mdst').onchange = e => motor.configurarMapeo(m.id, { targetId: e.target.value });
        fila.querySelector('.au-mcur').onchange = e => motor.configurarMapeo(m.id, { curva: e.target.value });
        fila.querySelector('.au-mmin').onchange = e => motor.configurarMapeo(m.id, { inMin: +e.target.value });
        fila.querySelector('.au-mmax').onchange = e => motor.configurarMapeo(m.id, { inMax: +e.target.value });
        fila.querySelector('.au-men').onclick = () => motor.configurarMapeo(m.id, { enabled: !m.enabled });
        fila.querySelector('.au-mdel').onclick = () => motor.quitarMapeo(m.id);
        cont.appendChild(fila);
      });
    }

    function pintarEnlaces() {
      const cont = $('au-enlaces');
      if (!motor.enlaces.length) { cont.innerHTML = '<div class="au-vacio">Sin eventos. Ejemplo: BUS 1 · gate.open → disparar un clip.</div>'; return; }
      const buses = [...motor.buses.values()];
      const acciones = host.acciones.listar();
      cont.innerHTML = '';
      motor.enlaces.forEach(x => {
        const fila = el('<div class="au-fila">' +
          '<select class="au-ebus">' + opciones(buses, x.busId, b => b.id, b => b.name) + '</select>' +
          '<select class="au-eev">' + opciones(motor.eventosDisponibles, x.ev, v => v, v => v) + '</select>' +
          '<span>→</span>' +
          '<select class="au-eacc" style="min-width:220px">' + opciones(acciones, x.accionId, a => a.id, a => a.grupo + ' · ' + a.nombre) + '</select>' +
          '<button class="au-btn au-een' + (x.enabled ? ' on' : '') + '">' + (x.enabled ? 'ON' : 'OFF') + '</button>' +
          '<button class="au-btn danger au-edel">✕</button>' +
        '</div>');
        fila.querySelector('.au-ebus').onchange = e => motor.configurarEnlace(x.id, { busId: e.target.value });
        fila.querySelector('.au-eev').onchange = e => motor.configurarEnlace(x.id, { ev: e.target.value });
        fila.querySelector('.au-eacc').onchange = e => motor.configurarEnlace(x.id, { accionId: e.target.value });
        fila.querySelector('.au-een').onclick = () => motor.configurarEnlace(x.id, { enabled: !x.enabled });
        fila.querySelector('.au-edel').onclick = () => motor.quitarEnlace(x.id);
        cont.appendChild(fila);
      });
    }

    /* ── Medidores: sólo mientras el panel está abierto ── */
    function refrescarMedidores() {
      for (const b of motor.buses.values()) {
        const u = b._ui; if (!u) continue;
        const v = b.ultimo;
        const pct = x => Math.max(0, Math.min(100, x * 100)) + '%';
        u.barra.style.width = pct(v.env);
        u.umbral.style.left = pct(b.analisis.gateThreshold);
        u.low.style.width = pct(v.low * 2);
        u.mid.style.width = pct(v.mid * 2);
        u.high.style.width = pct(v.high * 2);
        u.val.textContent = 'env ' + v.env.toFixed(3) + ' · rms ' + v.rms.toFixed(3) + ' · pk ' + v.peak.toFixed(3);
        u.gate.classList.toggle('on', !!v.gate);
      }
      pintarEstado();
    }

    /* ── API de la vista ── */
    ui.abrir = function () {
      ui._abierto = true;
      ovl.classList.add('vis');
      pintar();
      clearInterval(ui._timer);
      ui._timer = setInterval(refrescarMedidores, 33);
    };
    ui.cerrar = function () {
      ui._abierto = false;
      ovl.classList.remove('vis');
      clearInterval(ui._timer); ui._timer = 0;
    };
    ui.visible = function () { return ui._abierto; };
    ui.refrescar = function () { if (!ui._silenciar) pintar(); };

    return ui;
  }

  global.MIDIVJAudioUI = { crear };
})(typeof window !== 'undefined' ? window : globalThis);
