/* ══════════════════════════════════════════════════════════════════════
   MIDIVJ — Vista MEZCLA
   ══════════════════════════════════════════════════════════════════════
   Panel de la mezcladora (`midivj-mezcla.js`): una tira por canal con
   medidor, fader, M (silenciar en esta PC) y REC (entra en la grabación),
   la ENTRADA del equipo con su selector y el MASTER de lo que se escucha.
   ────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const CSS = `
  #mez-ovl{position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;z-index:60;}
  #mez-ovl.vis{display:flex;}
  #mez-panel{background:var(--panel,#101022);border:1px solid var(--border2,#2a2a4a);border-radius:6px;width:min(980px,97vw);max-height:92vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,.6);}
  #mez-panel header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border,#1e1e3a);}
  #mez-panel h2{margin:0;font-family:var(--mono,monospace);font-size:12px;letter-spacing:2px;color:var(--accent,#00ff88);flex:1;}
  .mz-btn{background:var(--panel2,#141430);border:1px solid var(--border2,#2a2a4a);color:var(--text2,#9a9ac0);font-family:var(--mono,monospace);font-size:9px;letter-spacing:1px;padding:4px 9px;cursor:pointer;}
  .mz-btn:hover{border-color:var(--accent,#00ff88);color:var(--accent,#00ff88);}
  .mz-fila{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 16px 0;font-family:var(--mono,monospace);font-size:9px;color:var(--text2,#9a9ac0);}
  .mz-fila select{background:var(--panel2,#141430);border:1px solid var(--border2,#2a2a4a);color:var(--text,#e6e6ff);font-family:var(--mono,monospace);font-size:9px;padding:3px 5px;outline:none;max-width:340px;}
  .mz-error{color:#ff4466;}
  #mez-tiras{display:flex;gap:6px;padding:14px 16px 6px;overflow-x:auto;align-items:stretch;}
  .mz-tira{flex:none;width:86px;border:1px solid var(--border2,#2a2a4a);border-radius:5px;padding:7px 5px 8px;display:flex;flex-direction:column;align-items:center;gap:6px;font-family:var(--mono,monospace);font-size:9px;color:var(--text2,#9a9ac0);}
  .mz-tira.sin{opacity:.42;}
  .mz-tira.entrada{border-color:#00b3ff;}
  .mz-tira.master{border-color:var(--accent,#00ff88);margin-left:10px;}
  .mz-nom{font-weight:700;color:var(--text,#e6e6ff);letter-spacing:1px;}
  .mz-det{font-size:8px;color:var(--text3,#5a5a7a);width:100%;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-height:11px;}
  .mz-medio{display:flex;gap:7px;height:150px;align-items:stretch;}
  .mz-med{width:9px;background:#05050d;border:1px solid var(--border2,#2a2a4a);position:relative;overflow:hidden;}
  .mz-med i{position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(to top,#00d68f 0,#00d68f 70%,#ffcc00 88%,#ff3366 100%);background-size:100% 150px;background-position:bottom;}
  .mz-fader{writing-mode:vertical-lr;direction:rtl;width:22px;height:150px;accent-color:var(--accent,#00ff88);}
  .mz-val{font-size:8px;color:var(--text3,#5a5a7a);}
  .mz-bot{display:flex;gap:4px;}
  .mz-bot button{width:34px;padding:3px 0;font-family:var(--mono,monospace);font-size:9px;font-weight:700;background:var(--panel2,#141430);border:1px solid var(--border2,#2a2a4a);color:var(--text3,#5a5a7a);cursor:pointer;}
  .mz-bot button.m.on{background:#ffcc00;border-color:#ffcc00;color:#000;}
  .mz-bot button.r.on{background:#ff3366;border-color:#ff3366;color:#fff;}
  .mz-ayuda{margin:0;padding:6px 16px 16px;font-family:var(--mono,monospace);font-size:8px;line-height:1.8;color:var(--text3,#5a5a7a);}
  .mz-ayuda b{color:var(--text2,#9a9ac0);font-weight:400;}
  `;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function crear(mezcla, opciones) {
    const op = opciones || {};
    const ui = { _abierto: false };
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const ovl = document.createElement('div');
    ovl.id = 'mez-ovl';
    ovl.innerHTML =
      '<div id="mez-panel">' +
        '<header><h2>MEZCLA DE AUDIO</h2><button class="mz-btn" id="mz-cerrar">✕ CERRAR</button></header>' +
        '<div class="mz-fila"><span>ENTRADA DE AUDIO</span><select id="mz-disp"></select>' +
          '<button class="mz-btn" id="mz-refrescar" title="Volver a leer las entradas de audio del equipo">↻</button>' +
          '<span id="mz-disp-st"></span></div>' +
        '<div id="mez-tiras"></div>' +
        '<p class="mz-ayuda"><b>Fader</b>: volumen del canal (hasta 150 %). <b>M</b>: lo silencia en esta PC; no cambia lo que se graba. ' +
          '<b>REC</b>: el canal entra en la grabación. Las cámaras entran silenciadas (su micrófono acopla con los parlantes) pero con REC puesto.<br>' +
          'Al grabar (⏺ GRABAR): la <b>salida</b> lleva la mezcla de los canales con REC, cada <b>pista</b> lleva su propio sonido limpio y la <b>entrada</b> además queda en un archivo de audio aparte.<br>' +
          'Los canales en gris no tienen sonido ahora. El audio de una cámara de teléfono se enciende en su configuración (AUDIO: micrófono).</p>' +
      '</div>';
    document.body.appendChild(ovl);
    const $ = id => document.getElementById(id);
    ovl.addEventListener('click', e => { if (e.target === ovl) ui.cerrar(); });
    $('mz-cerrar').onclick = () => ui.cerrar();

    /* ── Entrada ── */
    async function cargarDispositivos(pedirPermiso) {
      const sel = $('mz-disp');
      let lista = [];
      try { lista = await mezcla.listarDispositivos(pedirPermiso); } catch (e) { $('mz-disp-st').textContent = e.message; }
      const actual = mezcla.entrada.deviceId;
      sel.innerHTML = '<option value="">— ninguna —</option>' +
        lista.map(d => '<option value="' + esc(d.deviceId) + '">' + esc(d.label) + '</option>').join('') +
        (actual && !lista.some(d => d.deviceId === actual) ? '<option value="' + esc(actual) + '">' + esc(mezcla.entrada.label || 'entrada guardada') + ' (no conectada)</option>' : '');
      sel.value = actual || '';
    }
    $('mz-disp').onchange = async e => {
      const o = e.target.selectedOptions[0];
      await mezcla.usarEntrada(e.target.value, o ? o.textContent : '');
      if (e.target.value) cargarDispositivos(false);   // con el permiso dado ya llegan los nombres
      if (op.alCambiar) op.alCambiar();
    };
    $('mz-refrescar').onclick = () => cargarDispositivos(true);

    /* ── Tiras ── */
    let firma = '';
    function pintar() {
      const st = mezcla.getStatus();
      const e = st.entrada;
      $('mz-disp-st').innerHTML = e.error ? '<span class="mz-error">⚠ ' + esc(e.error) + '</span>' : e.activa ? '● ' + esc(e.label) : '';
      const canales = st.canales.slice().sort((a, b) => (a.tipo === 'entrada') - (b.tipo === 'entrada'));
      const f = JSON.stringify([canales, st.master]);
      if (f === firma) return;
      firma = f;
      const tira = (c, clase) =>
        '<div class="mz-tira ' + clase + (c.conSenal === false ? ' sin' : '') + '" data-id="' + esc(c.id) + '">' +
          '<span class="mz-nom">' + esc(c.nombre) + '</span>' +
          '<span class="mz-det" title="' + esc(c.detalle || '') + '">' + esc(c.detalle || (c.conSenal === false ? 'sin sonido' : '')) + '</span>' +
          '<div class="mz-medio"><div class="mz-med"><i></i></div>' +
            '<input type="range" class="mz-fader" min="0" max="150" step="1" value="' + Math.round(c.vol * 100) + '" title="Volumen"></div>' +
          '<span class="mz-val">' + Math.round(c.vol * 100) + ' %</span>' +
          '<div class="mz-bot"><button class="m' + (c.mute ? ' on' : '') + '" title="Silenciar en esta PC (no afecta la grabación)">M</button>' +
            (c.rec === undefined ? '' : '<button class="r' + (c.rec ? ' on' : '') + '" title="Este canal entra en la grabación">REC</button>') + '</div>' +
        '</div>';
      $('mez-tiras').innerHTML = canales.map(c => tira(c, c.tipo === 'entrada' ? 'entrada' : '')).join('') +
        tira({ id: 'master', nombre: 'MASTER', detalle: 'lo que suena aquí', vol: st.master.vol, mute: st.master.mute }, 'master');
    }
    $('mez-tiras').addEventListener('input', e => {
      const t = e.target.closest('.mz-tira');
      if (!t || !e.target.classList.contains('mz-fader')) return;
      t.querySelector('.mz-val').textContent = e.target.value + ' %';
      firma = '';   // el valor ya está en pantalla; el próximo pintar() no debe pisar el arrastre
      mezcla.fijar(t.dataset.id, { vol: (+e.target.value) / 100 });
    });
    $('mez-tiras').addEventListener('click', e => {
      const t = e.target.closest('.mz-tira');
      const b = e.target.closest('button');
      if (!t || !b) return;
      const st = mezcla.getStatus();
      const c = t.dataset.id === 'master' ? st.master : st.canales.find(x => x.id === t.dataset.id);
      if (!c) return;
      mezcla.fijar(t.dataset.id, b.classList.contains('m') ? { mute: !c.mute } : { rec: !c.rec });
      if (op.alCambiar) op.alCambiar();
    });
    /* Doble clic en el fader: vuelve a 100 % */
    $('mez-tiras').addEventListener('dblclick', e => {
      const t = e.target.closest('.mz-tira');
      if (t && e.target.classList.contains('mz-fader')) mezcla.fijar(t.dataset.id, { vol: 1 });
    });

    let arrastrando = false;
    $('mez-tiras').addEventListener('pointerdown', e => { if (e.target.classList.contains('mz-fader')) arrastrando = true; });
    global.addEventListener('pointerup', () => { if (arrastrando) { arrastrando = false; firma = ''; ui.refrescar(); } });

    /* ── Medidores ── */
    const picos = {};
    function medir() {
      if (!ui._abierto) return;
      requestAnimationFrame(medir);
      const n = mezcla.niveles();
      let master = 0;
      document.querySelectorAll('#mez-tiras .mz-tira').forEach(t => {
        const id = t.dataset.id;
        let v = id === 'master' ? master : (n[id] || 0);
        if (id !== 'master') {
          const st = mezcla.canales.get(id);
          if (st && !st.mute) master = Math.max(master, v * st.vol);
        } else v = mezcla.master.mute ? 0 : v * mezcla.master.vol;
        /* escala en dB: -54 dB abajo, 0 dB arriba; cae despacio */
        const alto = v > 0 ? Math.max(0, Math.min(1, 1 + 20 * Math.log10(v) / 54)) : 0;
        picos[id] = Math.max(alto, (picos[id] || 0) - 0.02);
        const barra = t.querySelector('.mz-med i');
        if (barra) barra.style.height = (picos[id] * 100).toFixed(1) + '%';
      });
    }

    ui.refrescar = function () { if (ui._abierto && !arrastrando) pintar(); };
    ui.abrir = async function () {
      ui._abierto = true;
      ovl.classList.add('vis');
      try { await mezcla.start(); } catch (e) {}
      if (op.alAbrir) op.alAbrir();
      firma = '';
      pintar();
      cargarDispositivos(false);
      requestAnimationFrame(medir);
    };
    ui.cerrar = function () { ui._abierto = false; ovl.classList.remove('vis'); };
    ui.abierto = () => ui._abierto;
    return ui;
  }

  global.MIDIVJMezclaUI = { crear };
})(typeof window !== 'undefined' ? window : globalThis);
