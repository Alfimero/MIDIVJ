/* ══════════════════════════════════════════════════════════════════════
   MIDIVJ — contrato mínimo de módulos
   ══════════════════════════════════════════════════════════════════════

   MIDIVJ nació como una sola página (`src/Midivj ZYX.html`) con todo
   adentro: estado, render, MIDI, red, persistencia. Ese archivo sigue
   siendo la fuente ejecutable y NO se está migrando. Lo único que hace
   este archivo es fijar la forma que tendrán los subsistemas nuevos, para
   que se puedan agregar (y apagar) sin tocar el núcleo.

   Un módulo es un objeto con:
     id            string estable
     nombre        etiqueta para la interfaz
     capacidades   string[]  — qué ofrece ('audio-in', 'analisis', …)
     estado        'inactivo'|'iniciando'|'activo'|'error'
     init(host)    prepara sin abrir hardware; recibe el host (ver abajo)
     start()       abre recursos (Promise)
     stop()        los suelta, conservando la configuración (Promise)
     dispose()     libera todo; después de esto hay que volver a init()
     getStatus()   objeto serializable de diagnóstico

   El "host" es lo único que un módulo puede suponer del resto de MIDIVJ:

     host.log(msg, extra)          bitácora (nunca desde un callback de audio)
     host.targets                  registro de parámetros controlables
     host.now()                    reloj monótono en segundos

   El registro es deliberadamente tonto: no hay inyección de dependencias,
   ni ciclo de vida automático, ni orden de arranque. Si algún día hace
   falta, se agrega aquí y no en cada módulo.
   ────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const modulos = new Map();

  /* Registro de parámetros controlables.
     Cualquier módulo (audio hoy, DMX o red mañana) puede *ofrecer* valores
     y cualquier parte de MIDIVJ puede *exponer* destinos, sin que ninguno
     de los dos conozca al otro. El bridge de la app llena esto en
     `Midivj ZYX.html`; el motor de audio sólo lo consume. */
  const targets = {
    _defs: new Map(),

    /** def = { id, grupo, nombre, min, max, aplicar(valor), leer() } */
    registrar(def) {
      if (!def || !def.id || typeof def.aplicar !== 'function') return null;
      const completo = {
        id: def.id,
        grupo: def.grupo || 'general',
        nombre: def.nombre || def.id,
        min: def.min !== undefined ? def.min : 0,
        max: def.max !== undefined ? def.max : 1,
        aplicar: def.aplicar,
        leer: typeof def.leer === 'function' ? def.leer : null,
      };
      this._defs.set(completo.id, completo);
      return completo;
    },
    quitar(id) { this._defs.delete(id); },
    obtener(id) { return this._defs.get(id) || null; },
    listar() { return [...this._defs.values()]; },
    /** Aplica un valor ya normalizado 0..1 escalándolo al rango del destino. */
    aplicarNormalizado(id, n) {
      const d = this._defs.get(id);
      if (!d) return false;
      const v = d.min + (d.max - d.min) * Math.max(0, Math.min(1, n));
      try { d.aplicar(v); } catch (e) { return false; }
      return true;
    },
  };

  /* Acciones discretas (lo que un evento de audio puede disparar).
     Mismo patrón que `targets`, pero sin valor: sólo "hazlo". */
  const acciones = {
    _defs: new Map(),
    registrar(def) {
      if (!def || !def.id || typeof def.ejecutar !== 'function') return null;
      const completo = { id: def.id, grupo: def.grupo || 'general', nombre: def.nombre || def.id, ejecutar: def.ejecutar };
      this._defs.set(completo.id, completo);
      return completo;
    },
    quitar(id) { this._defs.delete(id); },
    listar() { return [...this._defs.values()]; },
    ejecutar(id) {
      const d = this._defs.get(id);
      if (!d) return false;
      try { d.ejecutar(); } catch (e) { return false; }
      return true;
    },
  };

  const host = {
    targets,
    acciones,
    now() { return (global.performance ? performance.now() : Date.now()) / 1000; },
    log(msg, extra) {
      if (extra !== undefined) console.log('[MIDIVJ] ' + msg, extra);
      else console.log('[MIDIVJ] ' + msg);
    },
  };

  const MIDIVJ = global.MIDIVJ || (global.MIDIVJ = {});
  MIDIVJ.host = host;
  MIDIVJ.targets = targets;
  MIDIVJ.acciones = acciones;
  MIDIVJ.modulos = {
    registrar(mod) {
      if (!mod || !mod.id) throw new Error('Un módulo necesita id.');
      modulos.set(mod.id, mod);
      if (typeof mod.init === 'function') { try { mod.init(host); } catch (e) { host.log('init falló en módulo ' + mod.id, e); } }
      return mod;
    },
    obtener(id) { return modulos.get(id) || null; },
    listar() { return [...modulos.values()]; },
    estado() { return [...modulos.values()].map(m => ({ id: m.id, nombre: m.nombre, estado: m.estado, capacidades: m.capacidades })); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
