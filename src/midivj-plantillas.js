/**
 * midivj-plantillas.js — plantillas de estilo para el mando móvil.
 *
 * Una plantilla combina un PATRÓN (cómo varía el estilo entre celdas de la
 * rejilla), una PALETA (colores por grupo del patrón) y una ANIMACIÓN
 * (aplicada sólo a un subgrupo, para no saturar la pantalla). Aplicar una
 * plantilla sólo toca la estética del botón (color, colorTexto, borde,
 * forma, brillo, animación) — nunca su etiqueta, su imagen, su mensaje MIDI
 * ni su acción. Un mando ya mapeado y con submenús puede recibir una
 * plantilla nueva sin perder ninguna de sus conexiones.
 *
 * API:
 *   PlantillasMando.lista                      → 12 plantillas fijas
 *   PlantillasMando.matriz(plantilla, F, C)     → [[{color,colorTexto,borde,forma,animacion,brillo}]]
 *   PlantillasMando.aplicar(plantilla, pagina, F, C, opciones)
 *   PlantillasMando.azar(F, C)                  → plantilla generada al vuelo
 */

(function (raiz) {
  'use strict';

  /* ── Patrones: de la celda (fila,col) a un índice de grupo ── */
  const PATRONES = {
    solido:        () => 0,
    filas:         (f) => f % 2,
    columnas:      (f, c) => c % 2,
    tablero:       (f, c) => (f + c) % 2,
    diagonal:      (f, c, F, C, n) => ((f + c) % Math.max(1, n)),
    degradadoFila: (f, c, F, C, n) => Math.round((f / Math.max(1, F - 1)) * Math.max(0, n - 1)),
    degradadoCol:  (f, c, F, C, n) => Math.round((c / Math.max(1, C - 1)) * Math.max(0, n - 1)),
    anillos:       (f, c, F, C, n) => Math.min(f, F - 1 - f, c, C - 1 - c) % Math.max(1, n),
    bordeCentro:   (f, c, F, C) => (f === 0 || f === F - 1 || c === 0 || c === C - 1) ? 0 : 1,
    celdaAzar:     (f, c, F, C, n, semilla) => hash(f, c, semilla) % Math.max(1, n)
  };

  /* Hash entero determinista: sirve para que "celdaAzar" reparta colores sin
     depender de Math.random en cada celda (una sola tirada por aplicación). */
  function hash(f, c, semilla) {
    let h = (f * 374761393 + c * 668265263 + (semilla || 0) * 2246822519) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return Math.abs(h ^ (h >>> 16));
  }

  /* ── Las 12 plantillas curadas: patrón + paleta + animación combinados ── */
  const LISTA = [
    {
      id: 'neon-tablero', nombre: 'Neón Tablero', emoji: '♟️',
      descripcion: 'Tablero verde neón sobre negro, con onda en los recuadros claros.',
      patron: 'tablero', forma: 'pastilla', radio: 22, fuente: 14, tema: 'oscuro',
      animGrupo: 1, animacion: 'onda', brilloGrupo: 1,
      paleta: [
        { bg: '#0a0d10', tx: '#eafff5', bd: '#00ff88' },
        { bg: '#00ff88', tx: '#03130b', bd: '#00ff88' }
      ]
    },
    {
      id: 'franjas-fuego', nombre: 'Franjas de Fuego', emoji: '🔥',
      descripcion: 'Filas alternadas en rojo y naranja, con latido en las brillantes.',
      patron: 'filas', forma: 'rect', radio: 6, fuente: 14, tema: 'oscuro',
      animGrupo: 1, animacion: 'latido', brilloGrupo: 1,
      paleta: [
        { bg: '#2b0e05', tx: '#ffe6cc', bd: '#ff7a1a' },
        { bg: '#ff7a1a', tx: '#1a0900', bd: '#ffcf40' }
      ]
    },
    {
      id: 'pulso-oceanico', nombre: 'Pulso Oceánico', emoji: '🌊',
      descripcion: 'Columnas en dos azules, todo el mando respira con un pulso lento.',
      patron: 'columnas', forma: 'circulo', radio: 0, fuente: 13, tema: 'oscuro',
      animGrupo: 0, animacion: 'pulso', brilloTodos: false,
      paleta: [
        { bg: '#031b23', tx: '#d8fbff', bd: '#00c2ff' },
        { bg: '#003b4d', tx: '#d8fbff', bd: '#00e5ff' }
      ]
    },
    {
      id: 'aurora-degradado', nombre: 'Degradado Aurora', emoji: '🌌',
      descripcion: 'Degradado diagonal violeta-rosa-dorado, quieto y luminoso.',
      patron: 'diagonal', forma: 'redondo', radio: 16, fuente: 13, tema: 'oscuro',
      animGrupo: null, animacion: 'ninguna', brilloTodos: true,
      paleta: [
        { bg: '#2a0845', tx: '#f6e9ff', bd: '#9b5de5' },
        { bg: '#7b2d8b', tx: '#ffeaf7', bd: '#f15bb5' },
        { bg: '#e0507a', tx: '#2a0410', bd: '#ff9770' },
        { bg: '#f4a261', tx: '#2a1200', bd: '#ffd166' }
      ]
    },
    {
      id: 'cyberpunk-grid', nombre: 'Cyberpunk Grid', emoji: '🤖',
      descripcion: 'Tablero magenta y cian sobre negro puro, parpadeo en el cian.',
      patron: 'tablero', forma: 'rect', radio: 4, fuente: 13, tema: 'oscuro',
      animGrupo: 1, animacion: 'parpadeo', brilloGrupo: 1,
      paleta: [
        { bg: '#050007', tx: '#f5e9ff', bd: '#ff00e5' },
        { bg: '#00e5ff', tx: '#00131a', bd: '#ff00e5' }
      ]
    },
    {
      id: 'bosque-nocturno', nombre: 'Bosque Nocturno', emoji: '🌲',
      descripcion: 'Verdes monocromos en degradado por fila, sobrio y sin animar.',
      patron: 'degradadoFila', forma: 'redondo', radio: 12, fuente: 13, tema: 'oscuro',
      animGrupo: null, animacion: 'ninguna',
      paleta: [
        { bg: '#07140d', tx: '#dff5e6', bd: '#1c5c3a' },
        { bg: '#0d2b1a', tx: '#e3f7e9', bd: '#2c8656' },
        { bg: '#16452a', tx: '#eafff0', bd: '#3fb072' },
        { bg: '#1f5e39', tx: '#eafff0', bd: '#58d493' }
      ]
    },
    {
      id: 'sunset-pastel', nombre: 'Sunset Pastel', emoji: '🌅',
      descripcion: 'Degradado pastel rosa-naranja-lila por columna, suave y liviano.',
      patron: 'degradadoCol', forma: 'pastilla', radio: 22, fuente: 13, tema: 'claro',
      animGrupo: null, animacion: 'ninguna',
      paleta: [
        { bg: '#ffd6e0', tx: '#5c1a2b', bd: '#ff9fb3' },
        { bg: '#ffe1c6', tx: '#5c3a1a', bd: '#ffbb80' },
        { bg: '#ffe9b0', tx: '#5c4a1a', bd: '#ffd166' },
        { bg: '#e3c9ff', tx: '#3a1a5c', bd: '#c39bff' }
      ]
    },
    {
      id: 'alto-contraste', nombre: 'Alto Contraste', emoji: '⬛',
      descripcion: 'Blanco y negro puros en tablero, máxima legibilidad en escenario.',
      patron: 'tablero', forma: 'rect', radio: 2, fuente: 15, tema: 'oscuro',
      animGrupo: null, animacion: 'ninguna',
      paleta: [
        { bg: '#000000', tx: '#ffffff', bd: '#ffffff' },
        { bg: '#ffffff', tx: '#000000', bd: '#000000' }
      ]
    },
    {
      id: 'anillos-plasma', nombre: 'Anillos de Plasma', emoji: '🪐',
      descripcion: 'Anillos concéntricos violeta-rosa-azul, el anillo exterior gira.',
      patron: 'anillos', forma: 'circulo', radio: 0, fuente: 13, tema: 'oscuro',
      animGrupo: 0, animacion: 'giro', brilloGrupo: 0,
      paleta: [
        { bg: '#3a0ca3', tx: '#f1e9ff', bd: '#f72585' },
        { bg: '#7209b7', tx: '#fbe9ff', bd: '#b5179e' },
        { bg: '#4361ee', tx: '#e9f0ff', bd: '#4cc9f0' }
      ]
    },
    {
      id: 'monocromo-ambar', nombre: 'Monocromo Ámbar', emoji: '🟠',
      descripcion: 'Centro ámbar brillante sobre borde ámbar oscuro, con latido central.',
      patron: 'bordeCentro', forma: 'redondo', radio: 16, fuente: 14, tema: 'oscuro',
      animGrupo: 1, animacion: 'latido', brilloGrupo: 1,
      paleta: [
        { bg: '#2b1a02', tx: '#ffe6b3', bd: '#b8860b' },
        { bg: '#ffb703', tx: '#2b1a00', bd: '#ffd166' }
      ]
    },
    {
      id: 'vaporwave', nombre: 'Vaporwave', emoji: '🕶️',
      descripcion: 'Diagonal rosa-cian-lila pastel, con onda en el tercer tono.',
      patron: 'diagonal', forma: 'pastilla', radio: 20, fuente: 13, tema: 'oscuro',
      animGrupo: 2, animacion: 'onda', brilloGrupo: 2,
      paleta: [
        { bg: '#ff71ce', tx: '#2b0018', bd: '#fffb96' },
        { bg: '#01cdfe', tx: '#00131a', bd: '#fffb96' },
        { bg: '#b967ff', tx: '#1a0033', bd: '#05ffa1' }
      ]
    },
    {
      id: 'bordes-electricos', nombre: 'Bordes Eléctricos', emoji: '⚡',
      descripcion: 'Marco cian parpadeante alrededor de un centro oscuro y quieto.',
      patron: 'bordeCentro', forma: 'rect', radio: 5, fuente: 13, tema: 'oscuro',
      animGrupo: 0, animacion: 'parpadeo', brilloGrupo: 0,
      paleta: [
        { bg: '#00c2ff', tx: '#00131a', bd: '#ffffff' },
        { bg: '#0a0c10', tx: '#c9d6e3', bd: '#2f3644' }
      ]
    }
  ];

  /* ── Generador al azar: mismo motor, combinación nueva cada vez ── */
  const NOMBRES_PATRON = Object.keys(PATRONES);
  const FORMAS = ['redondo', 'rect', 'pastilla', 'circulo'];
  const ANIMACIONES = ['pulso', 'latido', 'giro', 'parpadeo', 'onda'];

  function azarEntre(a, b) { return a + Math.random() * (b - a); }
  function elegir(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

  /* HSL a hex, para generar paletas coherentes por matiz sin tabla fija */
  function hslHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const canal = n => Math.round(255 * f(n)).toString(16).padStart(2, '0');
    return '#' + canal(0) + canal(8) + canal(4);
  }

  function paletaAzar() {
    const base = Math.floor(azarEntre(0, 360));
    const nColores = 2 + Math.floor(Math.random() * 3);       // 2 a 4 grupos
    const esclaro = Math.random() < 0.25;
    const salto = elegir([30, 40, 60, 90, 120, 180]);          // análogo, tríada o complementario
    const out = [];
    for (let i = 0; i < nColores; i++) {
      const h = (base + salto * i) % 360;
      const bg = esclaro ? hslHex(h, azarEntre(45, 70), azarEntre(78, 90))
                          : hslHex(h, azarEntre(55, 85), azarEntre(12, 26));
      const bd = hslHex(h, azarEntre(60, 90), esclaro ? azarEntre(35, 50) : azarEntre(45, 65));
      const tx = esclaro ? hslHex(h, 40, 15) : hslHex(h, 25, 92);
      out.push({ bg, tx, bd });
    }
    return out;
  }

  function azar(filas, columnas) {
    const paleta = paletaAzar();
    const patron = elegir(NOMBRES_PATRON);
    const animar = Math.random() < 0.75;
    const semilla = Math.floor(Math.random() * 1e9);
    return {
      id: 'azar-' + semilla,
      nombre: 'Combinación al azar',
      emoji: '🎲',
      descripcion: 'Generada al vuelo: patrón, paleta y animación distintos cada vez que se pide.',
      patron, semilla,
      forma: elegir(FORMAS),
      radio: Math.floor(azarEntre(0, 26)),
      fuente: Math.floor(azarEntre(12, 16)),
      tema: paleta[0] && esClaro(paleta[0].bg) ? 'claro' : 'oscuro',
      animGrupo: animar ? Math.floor(Math.random() * paleta.length) : null,
      animacion: animar ? elegir(ANIMACIONES) : 'ninguna',
      brilloGrupo: Math.random() < 0.5 ? Math.floor(Math.random() * paleta.length) : null,
      brilloTodos: false,
      paleta
    };
  }

  function esClaro(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 150;
  }

  /* ── Cálculo de estilo por celda ── */
  function estiloCelda(plantilla, f, c, F, C) {
    const patronFn = PATRONES[plantilla.patron] || PATRONES.solido;
    const n = plantilla.paleta.length;
    const grupo = ((patronFn(f, c, F, C, n, plantilla.semilla) % n) + n) % n;
    const tono = plantilla.paleta[grupo];
    return {
      color: tono.bg,
      colorTexto: tono.tx,
      borde: tono.bd,
      forma: plantilla.forma,
      brillo: !!(plantilla.brilloTodos || (plantilla.brilloGrupo != null && grupo === plantilla.brilloGrupo)),
      animacion: (plantilla.animGrupo != null && grupo === plantilla.animGrupo) ? plantilla.animacion : 'ninguna'
    };
  }

  /* Matriz completa: útil para dibujar una vista previa sin tocar el layout real */
  function matriz(plantilla, filas, columnas) {
    const out = [];
    for (let f = 0; f < filas; f++) {
      const fila = [];
      for (let c = 0; c < columnas; c++) fila.push(estiloCelda(plantilla, f, c, filas, columnas));
      out.push(fila);
    }
    return out;
  }

  /* Aplica la plantilla a una página real. Requiere que `pagina.botones` ya
     cubra toda la rejilla (celdas vacías incluidas): el llamador es quien
     conoce cómo completarlas (en el mando, botonesDeCuadricula). Sólo toca
     estética; etiqueta, imagen, acción, submenú y mensaje MIDI no se tocan. */
  function aplicar(plantilla, pagina, filas, columnas, opciones) {
    const op = opciones || {};
    const incluirForma = op.forma !== false;
    const mapa = new Map();
    for (const b of pagina.botones) mapa.set(b.fila + ':' + b.col, b);
    for (let f = 0; f < filas; f++) {
      for (let c = 0; c < columnas; c++) {
        const b = mapa.get(f + ':' + c);
        if (!b) continue;
        const e = estiloCelda(plantilla, f, c, filas, columnas);
        b.color = e.color;
        b.colorTexto = e.colorTexto;
        b.borde = e.borde;
        b.brillo = e.brillo;
        b.animacion = e.animacion;
        if (incluirForma) b.forma = e.forma;
      }
    }
  }

  const PlantillasMando = { lista: LISTA, matriz, aplicar, azar };

  if (typeof module !== 'undefined' && module.exports) module.exports = PlantillasMando;
  raiz.PlantillasMando = PlantillasMando;
})(typeof globalThis !== 'undefined' ? globalThis : this);
