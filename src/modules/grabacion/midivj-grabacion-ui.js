/* ══════════════════════════════════════════════════════════════════════
   MIDIVJ — Vista GRABACIÓN
   ══════════════════════════════════════════════════════════════════════

   Panel del módulo de grabación. Como la vista de AUDIO, está aparte del
   motor (`midivj-grabacion.js`): el motor graba sin esta vista y esta vista
   no sabe nada de MIDIVJ más allá del motor.

   Se redibuja cuando el motor avisa un cambio (una vez por segundo mientras
   graba) y sólo si el panel está abierto.
   ────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const CSS = `
  #grab-ovl{position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;z-index:60;}
  #grab-ovl.vis{display:flex;}
  #grab-panel{background:var(--panel,#101022);border:1px solid var(--border2,#2a2a4a);border-radius:6px;width:min(620px,96vw);max-height:92vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,.6);}
  #grab-panel header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border,#1e1e3a);}
  #grab-panel h2{margin:0;font-family:var(--mono,monospace);font-size:12px;letter-spacing:2px;color:var(--accent,#00ff88);flex:1;}
  .gr-cuerpo{padding:14px 16px 18px;display:flex;flex-direction:column;gap:16px;}
  .gr-sec{border:1px solid var(--border,#1e1e3a);border-radius:5px;overflow:hidden;}
  .gr-sec > h3{margin:0;padding:7px 10px;background:var(--panel2,#141430);font-family:var(--mono,monospace);font-size:9px;letter-spacing:2px;color:var(--text2,#9a9ac0);display:flex;align-items:center;gap:8px;}
  .gr-sec > h3 .gr-sp{flex:1;}
  .gr-lista{padding:10px;display:flex;flex-direction:column;gap:9px;}
  .gr-fila{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-family:var(--mono,monospace);font-size:9px;color:var(--text2,#9a9ac0);}
  .gr-fila label{display:flex;align-items:center;gap:5px;letter-spacing:1px;}
  .gr-fila select,.gr-fila input[type=text]{background:var(--panel2,#141430);border:1px solid var(--border2,#2a2a4a);color:var(--text,#e6e6ff);font-family:var(--mono,monospace);font-size:9px;padding:3px 5px;outline:none;}
  .gr-fila input[type=text]{width:220px;}
  .gr-fila select:disabled,.gr-fila input:disabled{opacity:.45;}
  .gr-btn{background:var(--panel2,#141430);border:1px solid var(--border2,#2a2a4a);color:var(--text2,#9a9ac0);font-family:var(--mono,monospace);font-size:9px;letter-spacing:1px;padding:4px 9px;cursor:pointer;}
  .gr-btn:hover{border-color:var(--accent,#00ff88);color:var(--accent,#00ff88);}
  .gr-btn:disabled{opacity:.4;cursor:default;}
  #gr-rec{font-size:12px;font-weight:700;padding:8px 16px;letter-spacing:2px;border-color:#ff3366;color:#ff3366;background:rgba(255,51,102,.08);}
  #gr-rec:hover:not(:disabled){background:rgba(255,51,102,.2);color:#fff;}
  #gr-rec.on{background:#ff3366;color:#fff;}
  .gr-reloj{font-family:var(--mono,monospace);font-size:18px;letter-spacing:2px;color:var(--text3,#5a5a7a);}
  .gr-reloj.on{color:#ff3366;}
  .gr-reloj.on::before{content:'● ';animation:gr-blk 1s steps(1) infinite;}
  @keyframes gr-blk{50%{opacity:0}}
  .gr-dato{font-family:var(--mono,monospace);font-size:9px;color:var(--text2,#9a9ac0);line-height:1.7;}
  .gr-dato b{color:var(--text,#e6e6ff);font-weight:400;}
  .gr-error{font-family:var(--mono,monospace);font-size:9px;color:#ff4466;line-height:1.6;}
  .gr-aviso{font-family:var(--mono,monospace);font-size:9px;color:#ffcc00;line-height:1.6;}
  .gr-ayuda{margin:0;padding:0 10px 10px;font-family:var(--mono,monospace);font-size:8px;line-height:1.8;color:var(--text3,#5a5a7a);}
  .gr-toma{display:flex;align-items:center;gap:8px;font-family:var(--mono,monospace);font-size:9px;color:var(--text2,#9a9ac0);}
  .gr-toma .gr-nom{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text,#e6e6ff);}
  .gr-vacio{font-family:var(--mono,monospace);font-size:9px;color:var(--text3,#5a5a7a);text-align:center;padding:4px 0;}
  .gr-fuentes{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;}
  .gr-fuente{display:flex;align-items:flex-start;gap:6px;padding:6px 8px;border:1px solid var(--border2,#2a2a4a);border-radius:4px;font-family:var(--mono,monospace);font-size:9px;color:var(--text2,#9a9ac0);cursor:pointer;min-width:0;}
  .gr-fuente.on{border-color:#ff3366;background:rgba(255,51,102,.07);color:var(--text,#e6e6ff);}
  .gr-fuente.sin{opacity:.45;}
  .gr-fuente input{margin:1px 0 0;accent-color:#ff3366;}
  .gr-fuente span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;}
  .gr-fuente small{display:block;font-size:8px;color:var(--text3,#5a5a7a);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .gr-fuente.grabando small{color:#ff3366;}
  .gr-fila input.gr-ruta{flex:1;min-width:200px;width:auto;}
  `;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function reloj(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const dos = n => String(n).padStart(2, '0');
    return dos(Math.floor(s / 3600)) + ':' + dos(Math.floor(s / 60) % 60) + ':' + dos(s % 60);
  }
  function tamano(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function crear(grabador, host, opciones) {
    const op = opciones || {};
    const ui = { _abierto: false, _tomas: null };

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const ovl = document.createElement('div');
    ovl.id = 'grab-ovl';
    ovl.innerHTML =
      '<div id="grab-panel">' +
        '<header><h2>GRABACIÓN</h2>' +
          '<button class="gr-btn" id="gr-cerrar">✕ CERRAR</button>' +
        '</header>' +
        '<div class="gr-cuerpo">' +
          '<div class="gr-sec"><h3>GRABAR<span class="gr-sp"></span>' +
              '<button class="gr-btn" id="gr-todas" title="Marca la salida y todas las pistas con señal">TODAS</button>' +
              '<button class="gr-btn" id="gr-solo-salida" title="Sólo la salida">SÓLO SALIDA</button></h3>' +
            '<div class="gr-lista">' +
              '<div class="gr-fila"><button class="gr-btn" id="gr-rec">⏺ GRABAR</button>' +
                '<span class="gr-reloj" id="gr-reloj">00:00:00</span></div>' +
              '<div class="gr-fuentes" id="gr-fuentes"></div>' +
              '<div class="gr-dato" id="gr-dato"></div>' +
              '<div class="gr-error" id="gr-error"></div>' +
              '<div class="gr-fila">' +
                '<label>FORMATO <select id="gr-formato"></select></label>' +
                '<label>CALIDAD <select id="gr-calidad"></select></label>' +
                '<label>FPS <select id="gr-fps"><option value="30">30</option><option value="60">60</option></select></label>' +
              '</div>' +
              '<div class="gr-fila"><label>NOMBRE DE LA TOMA <input type="text" id="gr-titulo" maxlength="60" placeholder="opcional — se agrega a la fecha" spellcheck="false"></label></div>' +
            '</div>' +
            '<p class="gr-ayuda"><b>Salida</b>: lo que se ve en HDMI y OBS. <b>Pistas</b>: la señal limpia de cada una (su video o su cámara, con su corrección de color), ' +
              'sin mezcla, sin posición ni efectos, se vea o no en la salida: sirve para reeditar después. Todo va <b>sin audio</b>: graba el sonido aparte y júntalos al editar.<br>' +
              'Cada toma es una carpeta con todos sus archivos (<b>salida.mp4</b>, <b>pista-1.mp4</b>…) y un <b>toma.json</b> con los tiempos para alinearlos.<br>' +
              'Cada segundo grabado va directo a disco: si algo se cierra a media función, lo grabado ya está guardado.<br>' +
              'Mientras grabas, la salida no cambia sola de tamaño con el video de la pista 1, y cada pista conserva el tamaño con el que empezó (otra fuente entra encajada). ' +
              'Cada archivo es un codificador más: en equipos modestos, graba sólo las pistas que necesites.<br>' +
              'Deja la ventana de MIDIVJ a la vista: minimizada, el navegador frena el dibujo.</p>' +
          '</div>' +
          '<div class="gr-sec"><h3>CARPETA DE LAS GRABACIONES</h3>' +
            '<div class="gr-lista">' +
              '<div class="gr-fila">' +
                '<input type="text" class="gr-ruta" id="gr-ruta" spellcheck="false" placeholder="ruta completa de la carpeta">' +
                '<button class="gr-btn" id="gr-ruta-ok" title="Usar la ruta escrita">USAR</button>' +
                '<button class="gr-btn" id="gr-elegir" title="Abre el selector de carpetas de este equipo">📁 ELEGIR…</button>' +
                '<button class="gr-btn" id="gr-ruta-def" title="Volver a Grabaciones/ dentro del proyecto">↺ LA DEL PROYECTO</button>' +
              '</div>' +
              '<div class="gr-dato" id="gr-ruta-dato"></div>' +
            '</div>' +
            '<p class="gr-ayuda">Todas las tomas (salida y pistas) se guardan aquí. Puede ser otro disco o una carpeta del show; el relay la recuerda.</p>' +
          '</div>' +
          '<div class="gr-sec" id="gr-sec-avisos" hidden><h3>AVISOS</h3><div class="gr-lista" id="gr-avisos"></div></div>' +
          '<div class="gr-sec"><h3>ÚLTIMAS TOMAS<span class="gr-sp"></span>' +
            '<button class="gr-btn" id="gr-refrescar" title="Volver a leer la carpeta">↻</button>' +
            '<button class="gr-btn" id="gr-abrir">📂 ABRIR CARPETA</button></h3>' +
            '<div class="gr-lista" id="gr-tomas"><div class="gr-vacio">—</div></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ovl);

    const $ = id => document.getElementById(id);
    ovl.addEventListener('click', e => { if (e.target === ovl) ui.cerrar(); });
    $('gr-cerrar').onclick = () => ui.cerrar();

    /* ── Ajustes ── */
    const fmts = grabador.formatos();
    $('gr-formato').innerHTML = fmts.length
      ? fmts.map((f, i) => '<option value="' + f.id + '">' + esc(f.etiqueta) + (i === 0 ? ' (recomendado)' : '') + '</option>').join('')
      : '<option value="">— no disponible —</option>';
    $('gr-calidad').innerHTML = grabador.calidades().map(c => '<option value="' + c.id + '">' + esc(c.etiqueta) + '</option>').join('');
    const cfg = grabador.config;
    if (cfg.formato === 'auto' && fmts.length) cfg.formato = fmts[0].id;
    $('gr-formato').value = cfg.formato;
    $('gr-calidad').value = cfg.calidad;
    $('gr-fps').value = String(cfg.fps);
    $('gr-titulo').value = cfg.titulo;
    $('gr-formato').onchange = e => { cfg.formato = e.target.value; ui.refrescar(); };
    $('gr-calidad').onchange = e => { cfg.calidad = e.target.value; ui.refrescar(); };
    $('gr-fps').onchange = e => { cfg.fps = parseInt(e.target.value, 10) || 30; ui.refrescar(); };
    $('gr-titulo').oninput = e => { cfg.titulo = e.target.value; };

    $('gr-rec').onclick = async () => {
      try {
        if (grabador.fase === 'grabando') await grabador.stop();
        else if (grabador.fase === 'lista') await grabador.start();
      } catch (e) { /* el motor ya guardó el error en ultimoError */ }
      cargarTomas();
    };
    $('gr-abrir').onclick = () => abrir(null);
    $('gr-refrescar').onclick = () => cargarTomas();

    /* ── Qué se graba ── */
    function elegir(ids) {
      cfg.fuentes = ids;
      if (op.alCambiarConfig) op.alCambiarConfig();
      ui.refrescar();
    }
    $('gr-todas').onclick = () => elegir(grabador.fuentes().filter(f => f.disponible).map(f => f.id));
    $('gr-solo-salida').onclick = () => elegir(['salida']);
    $('gr-fuentes').addEventListener('change', e => {
      const id = e.target && e.target.dataset ? e.target.dataset.fuente : null;
      if (!id) return;
      const set = new Set(cfg.fuentes);
      if (e.target.checked) set.add(id); else set.delete(id);
      /* en el orden del registro: la salida primero, luego las pistas */
      elegir(grabador.fuentes().map(f => f.id).filter(x => set.has(x)));
    });
    let firmaFuentes = '';
    function pintarFuentes(st, bloqueado) {
      const lista = grabador.fuentes();
      const enToma = new Map((st.fuentes || []).map(f => [f.id, f]));
      const firma = JSON.stringify([lista, bloqueado, st.fase, [...enToma.values()].map(f => [f.id, f.archivo, f.activa])]);
      if (firma === firmaFuentes) return;
      firmaFuentes = firma;
      $('gr-fuentes').innerHTML = lista.map(f => {
        const t = enToma.get(f.id);
        const grabando = !!(t && t.activa);
        const sub = grabando ? '● ' + t.archivo + ' · ' + t.ancho + '×' + t.alto
          : !f.disponible ? 'sin señal'
          : (f.detalle ? f.detalle + ' · ' : '') + (f.ancho ? f.ancho + '×' + f.alto : '');
        return '<label class="gr-fuente' + (f.elegida ? ' on' : '') + (f.disponible ? '' : ' sin') + (grabando ? ' grabando' : '') + '">' +
          '<input type="checkbox" data-fuente="' + esc(f.id) + '"' + (f.elegida ? ' checked' : '') + (bloqueado ? ' disabled' : '') + '>' +
          '<div style="min-width:0"><span>' + esc(f.nombre) + '</span><small title="' + esc(sub) + '">' + esc(sub) + '</small></div></label>';
      }).join('');
    }

    /* ── Carpeta ── */
    let carpeta = null;
    function pintarCarpeta(error) {
      const dato = $('gr-ruta-dato');
      if (error) { dato.innerHTML = '<span class="gr-error">⚠ ' + esc(error) + '</span>'; return; }
      if (!carpeta) { dato.textContent = ''; return; }
      if (document.activeElement !== $('gr-ruta')) $('gr-ruta').value = carpeta.carpeta;
      dato.innerHTML = 'Las tomas se guardan en <b>' + esc(carpeta.carpeta) + '</b>' + (carpeta.porDefecto ? ' (la del proyecto)' : '');
      $('gr-ruta-def').disabled = !!carpeta.porDefecto || grabador.grabando();
    }
    async function conCarpeta(pedido) {
      try {
        const r = await pedido();
        carpeta = r;
        pintarCarpeta(r.cancelado ? null : '');
        if (!r.cancelado) cargarTomas();
      } catch (e) { pintarCarpeta(e.message); }
    }
    $('gr-ruta-ok').onclick = () => conCarpeta(() => grabador.fijarCarpeta($('gr-ruta').value.trim()));
    $('gr-ruta').addEventListener('keydown', e => { if (e.key === 'Enter') $('gr-ruta-ok').click(); });
    $('gr-ruta-def').onclick = () => conCarpeta(() => grabador.fijarCarpeta(''));
    $('gr-elegir').onclick = async () => {
      $('gr-ruta-dato').textContent = 'Elige la carpeta en la ventana que se abrió en este equipo (puede quedar detrás del navegador)…';
      $('gr-elegir').disabled = true;
      await conCarpeta(() => grabador.elegirCarpeta());
      $('gr-elegir').disabled = grabador.grabando();
      if (carpeta) pintarCarpeta('');
    };

    function abrir(toma) {
      grabador.abrirCarpeta(toma).catch(e => { if (op.avisar) op.avisar('no se pudo abrir la carpeta: ' + e.message); });
    }

    async function cargarTomas() {
      try {
        ui._tomas = await grabador.listarTomas();
        if (ui._tomas.carpeta) { carpeta = { carpeta: ui._tomas.carpeta, porDefecto: ui._tomas.porDefecto }; pintarCarpeta(''); }
      } catch (e) { ui._tomas = { error: e.message }; }
      pintarTomas();
    }

    function pintarTomas() {
      const caja = $('gr-tomas');
      const t = ui._tomas;
      if (!t) { caja.innerHTML = '<div class="gr-vacio">—</div>'; return; }
      if (t.error) { caja.innerHTML = '<div class="gr-error">' + esc(t.error) + '</div>'; return; }
      if (!t.tomas.length) { caja.innerHTML = '<div class="gr-vacio">Todavía no hay tomas en ' + esc(t.carpeta) + '</div>'; return; }
      caja.innerHTML = t.tomas.map((x, i) => {
        const bytes = x.archivos.reduce((n, a) => n + a.bytes, 0);
        const detalle = x.archivos.length === 1 ? x.archivos[0].archivo : x.archivos.length + ' archivos';
        return '<div class="gr-toma"><span class="gr-nom" title="' + esc(x.archivos.map(a => a.archivo).join(', ')) + '">' +
          esc(x.toma) + '</span><span>' + esc(detalle) + '</span><span>' + tamano(bytes) + '</span>' +
          '<button class="gr-btn" data-i="' + i + '" title="Abrir esta toma">📂</button></div>';
      }).join('');
      caja.querySelectorAll('button[data-i]').forEach(b => { b.onclick = () => abrir(t.tomas[+b.dataset.i].toma); });
    }

    /* ── Estado ── */
    ui.refrescar = function () {
      if (!ui._abierto) return;
      const st = grabador.getStatus();
      const grabando = st.fase === 'grabando';
      const ocupado = st.fase === 'abriendo' || st.fase === 'cerrando';
      const btn = $('gr-rec');
      btn.textContent = grabando ? '⏹ DETENER' : st.fase === 'abriendo' ? '… ABRIENDO' : st.fase === 'cerrando' ? '… GUARDANDO' : '⏺ GRABAR';
      btn.classList.toggle('on', grabando);
      btn.disabled = ocupado || !fmts.length || (!grabando && !grabador.fuentes().some(f => f.elegida && f.disponible));
      const rel = $('gr-reloj');
      rel.textContent = reloj(st.transcurridoMs);
      rel.classList.toggle('on', grabando);
      const bloqueado = grabando || ocupado;
      ['gr-formato', 'gr-calidad', 'gr-fps', 'gr-titulo', 'gr-todas', 'gr-solo-salida', 'gr-ruta', 'gr-ruta-ok', 'gr-elegir'].forEach(id => { $(id).disabled = bloqueado; });
      $('gr-ruta-def').disabled = bloqueado || !carpeta || !!carpeta.porDefecto;
      pintarFuentes(st, bloqueado);

      const elegidas = grabador.fuentes().filter(f => f.elegida);
      const conSenal = elegidas.filter(f => f.disponible);
      let dato;
      if (grabando || st.fase === 'cerrando') {
        dato = '<b>' + esc(st.toma) + '</b> · ' + st.archivos + (st.archivos === 1 ? ' archivo' : ' archivos') +
          '<br>' + esc(st.formato) + ' · ' + (st.kbps / 1000).toFixed(1) + ' Mbps · <b>' + tamano(st.bytes) + '</b> en disco' +
          (st.pendientes > 0 ? ' · ' + tamano(st.pendientes) + ' por guardar' : '');
        if (st.fase === 'cerrando') dato += '<br>Terminando de guardar…' + (st.sinRelay ? ' esperando al relay (si cierras la pestaña ahora, se pierde lo pendiente).' : '');
      } else {
        const mbps = grabador.estimarMbps();
        dato = !elegidas.length ? 'Marca qué quieres grabar.'
          : '<b>' + conSenal.length + '</b> ' + (conSenal.length === 1 ? 'archivo' : 'archivos') + ' por toma · ~' + mbps.toFixed(1) + ' Mbps' +
            ' (~' + Math.round(mbps * 450 / 1024 * 10) / 10 + ' GB por hora)' +
            (conSenal.length < elegidas.length ? ' · ' + (elegidas.length - conSenal.length) + ' sin señal ahora (no se graban)' : '');
        if (st.toma && st.bytes) dato += '<br>Última toma: <b>' + esc(st.toma) + '</b> · ' + tamano(st.bytes) + ' · ' + reloj(st.transcurridoMs);
      }
      $('gr-dato').innerHTML = dato;
      $('gr-error').textContent = !fmts.length
        ? 'Este navegador no puede grabar video (MediaRecorder sin MP4 ni WebM).'
        : (st.ultimoError ? '⚠ ' + st.ultimoError : '');
      const avisos = st.avisos;
      $('gr-sec-avisos').hidden = !avisos.length;
      $('gr-avisos').innerHTML = avisos.map(a => '<div class="gr-aviso">' + esc(a) + '</div>').join('');
    };

    ui.abrir = function () {
      ui._abierto = true;
      ovl.classList.add('vis');
      ui.refrescar();
      cargarTomas();
    };
    ui.cerrar = function () {
      ui._abierto = false;
      ovl.classList.remove('vis');
    };

    return ui;
  }

  global.MIDIVJGrabacionUI = { crear, reloj };
})(typeof window !== 'undefined' ? window : globalThis);
