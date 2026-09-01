/**
 * midivj-qr.js — generador de códigos QR local (sin internet).
 *
 * El control remoto se usa en vivo y muchas veces sobre una red Wi-Fi
 * creada por la propia computadora: ahí NO hay internet, así que un QR
 * pedido a un servicio externo no carga. Este módulo genera la matriz
 * completa en local, tanto en Node (relay) como en el navegador
 * (páginas /control y /mando).
 *
 * Alcance a propósito acotado: modo BYTE (UTF-8), versiones 1-10,
 * niveles de corrección L / M / Q / H. Con eso caben de sobra las URLs
 * del mando (~70 caracteres) y los payloads WIFI:T:...;S:...;P:...;;
 *
 * API:
 *   QRLite.matriz(texto, {ecl:'M', version:0, mascara:-1})
 *     -> { size, modulos:[[0|1]], version, ecl, mascara }
 *   QRLite.svg(texto, {ecl, escala, margen, claro, oscuro}) -> string SVG
 *   QRLite.dataURL(texto, opciones) -> "data:image/svg+xml;..."
 *
 * Referencia: ISO/IEC 18004. Las tablas de bloques por versión son las
 * del estándar; capacidad, alineación y formato se derivan por fórmula.
 */

(function (raiz) {
  'use strict';

  /* ── Campo de Galois GF(256), polinomio 0x11D ── */
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  /* Polinomio generador de n palabras de corrección.
     Coeficientes en orden descendente: poly[0] es el término líder. */
  function polinomioGenerador(n) {
    let poly = [1];
    for (let i = 0; i < n; i++) {
      const nuevo = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        nuevo[j] ^= poly[j];                        // x · poly
        nuevo[j + 1] ^= gfMul(poly[j], EXP[i]);     // α^i · poly
      }
      poly = nuevo;
    }
    return poly;
  }

  /* Resto Reed-Solomon de `datos` con n palabras de corrección */
  function correccion(datos, n) {
    const gen = polinomioGenerador(n);
    const resto = new Array(n).fill(0);
    for (const byte of datos) {
      const factor = byte ^ resto[0];
      resto.shift();
      resto.push(0);
      for (let i = 0; i < n; i++) resto[i] ^= gfMul(gen[i + 1], factor);
    }
    return resto;
  }

  /* ── Tablas del estándar (versiones 1-10) ──
     ec = palabras de corrección por bloque, bloques = número de bloques */
  const ECC = {
    L: { ec: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18], bloques: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4] },
    M: { ec: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26], bloques: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5] },
    Q: { ec: [13, 22, 18, 26, 18, 24, 18, 22, 20, 24], bloques: [1, 1, 2, 2, 4, 4, 6, 6, 8, 8] },
    H: { ec: [17, 28, 22, 16, 22, 28, 26, 26, 24, 28], bloques: [1, 1, 2, 4, 4, 4, 5, 6, 8, 8] }
  };
  const BITS_ECL = { L: 1, M: 0, Q: 3, H: 2 };
  const VERSION_MAX = 10;

  /* Módulos de datos crudos de una versión (fórmula del estándar) */
  function modulosCrudos(v) {
    let total = (16 * v + 128) * v + 64;
    if (v >= 2) {
      const nAlin = Math.floor(v / 7) + 2;
      total -= (25 * nAlin - 10) * nAlin - 55;
      if (v >= 7) total -= 36;
    }
    return total;
  }

  function totalPalabras(v) { return Math.floor(modulosCrudos(v) / 8); }

  function palabrasDatos(v, ecl) {
    const t = ECC[ecl];
    return totalPalabras(v) - t.ec[v - 1] * t.bloques[v - 1];
  }

  /* Bits del contador de caracteres en modo byte */
  function bitsContador(v) { return v <= 9 ? 8 : 16; }

  function capacidadBytes(v, ecl) {
    const bits = palabrasDatos(v, ecl) * 8 - 4 - bitsContador(v);
    return Math.floor(bits / 8);
  }

  /* ── Codificación de datos ── */
  function aBytesUTF8(texto) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(texto));
    const out = [];
    const crudo = unescape(encodeURIComponent(String(texto)));
    for (let i = 0; i < crudo.length; i++) out.push(crudo.charCodeAt(i));
    return out;
  }

  function versionMinima(nBytes, ecl) {
    for (let v = 1; v <= VERSION_MAX; v++) {
      if (capacidadBytes(v, ecl) >= nBytes) return v;
    }
    return 0;
  }

  function palabrasDeDatos(bytes, v, ecl) {
    const bits = [];
    const empuja = (valor, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >> i) & 1); };
    empuja(0b0100, 4);                       // indicador de modo byte
    empuja(bytes.length, bitsContador(v));
    for (const b of bytes) empuja(b, 8);

    const capacidadBits = palabrasDatos(v, ecl) * 8;
    for (let i = 0; i < 4 && bits.length < capacidadBits; i++) bits.push(0);  // terminador
    while (bits.length % 8 !== 0) bits.push(0);

    const palabras = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      palabras.push(byte);
    }
    const relleno = [0xec, 0x11];
    let k = 0;
    while (palabras.length < palabrasDatos(v, ecl)) palabras.push(relleno[k++ % 2]);
    return palabras;
  }

  /* Reparte en bloques, calcula corrección e intercala */
  function palabrasFinales(datos, v, ecl) {
    const t = ECC[ecl];
    const nBloques = t.bloques[v - 1];
    const ecPorBloque = t.ec[v - 1];
    const largoCorto = Math.floor(datos.length / nBloques);
    const cortos = nBloques - (datos.length % nBloques);

    const bloquesDatos = [];
    const bloquesEC = [];
    let off = 0;
    for (let i = 0; i < nBloques; i++) {
      const largo = largoCorto + (i < cortos ? 0 : 1);
      const bloque = datos.slice(off, off + largo);
      off += largo;
      bloquesDatos.push(bloque);
      bloquesEC.push(correccion(bloque, ecPorBloque));
    }

    const salida = [];
    for (let i = 0; i <= largoCorto; i++) {
      for (const b of bloquesDatos) if (i < b.length) salida.push(b[i]);
    }
    for (let i = 0; i < ecPorBloque; i++) {
      for (const b of bloquesEC) salida.push(b[i]);
    }
    return salida;
  }

  /* ── Matriz ── */
  function posicionesAlineacion(v) {
    if (v === 1) return [];
    const nAlin = Math.floor(v / 7) + 2;
    const size = 17 + 4 * v;
    const paso = Math.floor((v * 4 + nAlin * 2 + 1) / (nAlin * 2 - 2)) * 2;
    const pos = [];
    for (let p = size - 7; pos.length < nAlin - 1; p -= paso) pos.unshift(p);
    pos.unshift(6);
    return pos;
  }

  function matrizVacia(size, valor) {
    const m = [];
    for (let r = 0; r < size; r++) m.push(new Array(size).fill(valor));
    return m;
  }

  function ponBuscador(m, reservado, fila, col, size) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = fila + dr, c = col + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const separador = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const nucleo = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        const marco = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        m[r][c] = separador ? 0 : (nucleo || marco ? 1 : 0);
        reservado[r][c] = 1;
      }
    }
  }

  function construirPatrones(v) {
    const size = 17 + 4 * v;
    const m = matrizVacia(size, 0);
    const reservado = matrizVacia(size, 0);

    ponBuscador(m, reservado, 0, 0, size);
    ponBuscador(m, reservado, 0, size - 7, size);
    ponBuscador(m, reservado, size - 7, 0, size);

    /* Temporizadores */
    for (let i = 8; i < size - 8; i++) {
      const val = i % 2 === 0 ? 1 : 0;
      m[6][i] = val; reservado[6][i] = 1;
      m[i][6] = val; reservado[i][6] = 1;
    }

    /* Patrones de alineación (no se pisan con los buscadores) */
    const pos = posicionesAlineacion(v);
    for (const r of pos) {
      for (const c of pos) {
        if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const anillo = Math.max(Math.abs(dr), Math.abs(dc));
            m[r + dr][c + dc] = anillo === 1 ? 0 : 1;
            reservado[r + dr][c + dc] = 1;
          }
        }
      }
    }

    /* Módulo oscuro fijo */
    m[size - 8][8] = 1;
    reservado[size - 8][8] = 1;

    /* Reserva de la información de formato */
    for (let i = 0; i < 9; i++) {
      reservado[8][i] = 1;
      reservado[i][8] = 1;
    }
    for (let i = 0; i < 8; i++) {
      reservado[8][size - 1 - i] = 1;
      reservado[size - 1 - i][8] = 1;
    }

    /* Reserva de la información de versión (v >= 7) */
    if (v >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          reservado[i][size - 11 + j] = 1;
          reservado[size - 11 + j][i] = 1;
        }
      }
    }

    return { m, reservado, size };
  }

  function colocarDatos(m, reservado, size, palabras) {
    let bit = 0;
    const total = palabras.length * 8;
    const leer = () => {
      if (bit >= total) return 0;                       // bits de resto: siempre 0
      const b = (palabras[bit >> 3] >> (7 - (bit & 7))) & 1;
      bit++;
      return b;
    };
    let haciaArriba = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;                             // la columna del temporizador no cuenta
      for (let i = 0; i < size; i++) {
        const fila = haciaArriba ? size - 1 - i : i;
        for (let j = 0; j < 2; j++) {
          const c = col - j;
          if (reservado[fila][c]) continue;
          m[fila][c] = leer();
        }
      }
      haciaArriba = !haciaArriba;
    }
  }

  const MASCARAS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ];

  function aplicarMascara(m, reservado, size, idx) {
    const f = MASCARAS[idx];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (reservado[r][c]) continue;
        if (f(r, c)) m[r][c] ^= 1;
      }
    }
  }

  /* BCH de 15 bits para el formato */
  function bitsFormato(ecl, mascara) {
    const datos = (BITS_ECL[ecl] << 3) | mascara;
    let resto = datos;
    for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >> 9) * 0x537);
    return ((datos << 10) | resto) ^ 0x5412;
  }

  /* BCH de 18 bits para la versión (v >= 7) */
  function bitsVersion(v) {
    let resto = v;
    for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >> 11) * 0x1f25);
    return (v << 12) | resto;
  }

  function escribirFormato(m, size, ecl, mascara) {
    const bits = bitsFormato(ecl, mascara);
    const leer = i => (bits >> i) & 1;
    /* Copia 1: los bits bajos suben por la columna 8, los altos corren
       por la fila 8 hacia el centro (m[fila][columna]). */
    for (let i = 0; i <= 5; i++) m[i][8] = leer(i);
    m[7][8] = leer(6);
    m[8][8] = leer(7);
    m[8][7] = leer(8);
    for (let i = 9; i <= 14; i++) m[8][14 - i] = leer(i);
    /* Copia 2: fila 8 por la derecha y columna 8 por abajo */
    for (let i = 0; i <= 7; i++) m[8][size - 1 - i] = leer(i);
    for (let i = 8; i <= 14; i++) m[size - 15 + i][8] = leer(i);
    m[size - 8][8] = 1;
  }

  function escribirVersion(m, size, v) {
    if (v < 7) return;
    const bits = bitsVersion(v);
    for (let i = 0; i < 18; i++) {
      const b = (bits >> i) & 1;
      const fila = Math.floor(i / 3);
      const col = size - 11 + (i % 3);
      m[fila][col] = b;
      m[col][fila] = b;
    }
  }

  /* ── Penalización: elige la máscara menos ruidosa ── */
  function penalizacion(m, size) {
    let p = 0;

    /* Regla 1: series de 5 o más módulos del mismo color */
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      if (run >= 5) p += run - 2;
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      if (run >= 5) p += run - 2;
    }

    /* Regla 2: bloques 2x2 del mismo color */
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
      }
    }

    /* Regla 3: patrón 1:1:3:1:1 con cuatro módulos claros a un lado */
    const patron = [1, 0, 1, 1, 1, 0, 1];
    const coincide = (get, i) => {
      for (let k = 0; k < 7; k++) if (get(i + k) !== patron[k]) return false;
      const antes = i - 4 >= 0 && [1, 2, 3, 4].every(d => get(i - d) === 0);
      const despues = i + 10 < size && [7, 8, 9, 10].every(d => get(i + d) === 0);
      return antes || despues;
    };
    for (let r = 0; r < size; r++) {
      for (let c = 0; c + 6 < size; c++) if (coincide(i => m[r][i], c)) p += 40;
    }
    for (let c = 0; c < size; c++) {
      for (let r = 0; r + 6 < size; r++) if (coincide(i => m[i][c], r)) p += 40;
    }

    /* Regla 4: desviación respecto al 50% de módulos oscuros */
    let oscuros = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) oscuros += m[r][c];
    const porcentaje = (oscuros * 100) / (size * size);
    p += Math.floor(Math.abs(porcentaje - 50) / 5) * 10;

    return p;
  }

  /* ── API ── */
  function matriz(texto, opciones) {
    const op = opciones || {};
    const ecl = ECC[op.ecl] ? op.ecl : 'M';
    const bytes = aBytesUTF8(texto == null ? '' : String(texto));
    const v = op.version >= 1 && op.version <= VERSION_MAX ? op.version : versionMinima(bytes.length, ecl);
    if (!v) throw new Error('[qr] texto demasiado largo (' + bytes.length + ' bytes) para versión ' + VERSION_MAX + ' nivel ' + ecl);
    if (capacidadBytes(v, ecl) < bytes.length) throw new Error('[qr] la versión pedida no alcanza para el texto');

    const palabras = palabrasFinales(palabrasDeDatos(bytes, v, ecl), v, ecl);
    const base = construirPatrones(v);
    colocarDatos(base.m, base.reservado, base.size, palabras);
    escribirVersion(base.m, base.size, v);

    const forzada = typeof op.mascara === 'number' && op.mascara >= 0 && op.mascara <= 7 ? op.mascara : -1;
    let mejor = null;
    for (let mk = 0; mk < 8; mk++) {
      if (forzada !== -1 && mk !== forzada) continue;
      const copia = base.m.map(f => f.slice());
      aplicarMascara(copia, base.reservado, base.size, mk);
      escribirFormato(copia, base.size, ecl, mk);
      const p = penalizacion(copia, base.size);
      if (!mejor || p < mejor.p) mejor = { p, mk, m: copia };
    }

    return { size: base.size, modulos: mejor.m, version: v, ecl, mascara: mejor.mk };
  }

  /* SVG autocontenido: sirve inline o dentro de <img src="data:…"> */
  function svg(texto, opciones) {
    const op = opciones || {};
    const escala = op.escala || 4;
    const margen = op.margen == null ? 4 : op.margen;
    const claro = op.claro || '#ffffff';
    const oscuro = op.oscuro || '#000000';
    const q = matriz(texto, op);
    const lado = (q.size + margen * 2) * escala;

    let d = '';
    for (let r = 0; r < q.size; r++) {
      for (let c = 0; c < q.size; c++) {
        if (!q.modulos[r][c]) continue;
        d += 'M' + (c + margen) * escala + ' ' + (r + margen) * escala +
             'h' + escala + 'v' + escala + 'h-' + escala + 'z';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + lado + '" height="' + lado +
      '" viewBox="0 0 ' + lado + ' ' + lado + '" shape-rendering="crispEdges" role="img" aria-label="Código QR">' +
      '<rect width="' + lado + '" height="' + lado + '" fill="' + claro + '"/>' +
      '<path d="' + d + '" fill="' + oscuro + '"/></svg>';
  }

  function dataURL(texto, opciones) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(texto, opciones));
  }

  const QRLite = { matriz, svg, dataURL, capacidadBytes, VERSION_MAX };

  if (typeof module !== 'undefined' && module.exports) module.exports = QRLite;
  raiz.QRLite = QRLite;
})(typeof globalThis !== 'undefined' ? globalThis : this);
