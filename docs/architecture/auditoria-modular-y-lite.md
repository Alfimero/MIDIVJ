# Auditoría: conversión modular y viabilidad de una versión LITE (iOS / Android)

- Fecha: 2026-09-13
- Alcance: `src/`, `docs/`, `graphify-out/` (grafo construido en `aa065a8`; el árbol de trabajo ya tiene `src/modules/` y las páginas `camara`/`salida`, que el grafo aún no incluye).
- Método: lectura del código ejecutable, métricas contadas sobre `src/Midivj ZYX.html` y `src/midivj-relay.js`, y contraste con las comunidades del grafo. Ninguna cifra viene de la documentación; todas son reproducibles con `grep`.

## 1. Resumen ejecutivo

**La conversión modular está hecha por fuera y no por dentro.** El perímetro (relay, mando, cámara, salida, control, emisor, QR, módulo de audio) ya son piezas independientes que se comunican por protocolo; ahí sí se puede trabajar cada una sin afectar al resto. El centro — `Midivj ZYX.html`, ~5000 líneas de JavaScript en un solo `<script>` con un único ámbito global — sigue siendo un monolito donde estado, lógica de disparo, render y DOM se llaman entre sí sin capas. Cualquier cambio en clips, timeline, efectos o pistas toca el mismo objeto `S` y las mismas funciones de re-render que usan todos los demás.

**Grado de modularización estimado: ~35 %** (todo el perímetro; nada del núcleo). ADR-006 lo dice explícitamente: "no se migra nada existente", y el contrato de `src/modules/` sólo lo cumple un módulo.

**Versión LITE para iOS/Android: viable, pero condicionada.** El código del núcleo depende de APIs que no existen en móvil (Web MIDI en iOS, `getDisplayMedia`, `window.open` como segunda pantalla, 32 elementos `<video>` simultáneos) y no tiene una frontera que permita quitar esas dependencias sin reescribir. Hacer LITE hoy sería un fork que divergiría en semanas. Hacerlo después de extraer el núcleo en 5–6 archivos con "puertos" de plataforma es un recorte de módulos, que es exactamente lo que se pide. Esa extracción es también lo que resuelve el primer objetivo (trabajar cada módulo sin romper lo que funciona), así que **una sola inversión sirve a los dos fines**.

## 2. Estado actual, con evidencia

### 2.1 Perímetro: modular de verdad

| Pieza | Tamaño | Cómo se comunica con el resto | Cohesión (grafo) |
|---|---|---|---|
| `midivj-relay.js` | 1421 líneas | HTTP + WebSocket JSON | 0.06 (ver 2.3) |
| `midivj-mando.html` | 58 KB | WS `midi`/`join`, `fetch /api/mando-layout` | 0.08 |
| `midivj-camara.html` | 20 KB | WS señalización, WebRTC P2P | 0.23 |
| `midivj-salida.html` | 8 KB | WS señalización, WebRTC P2P | — |
| `midivj-control.html` | 16 KB | WS presencia, HTTP | 0.24 |
| `midivj-sender.html` | 14 KB | WS `midi` | 0.22 |
| `midivj-qr.js` | 16 KB | función pura, corre en Node y navegador | 0.16 |
| `modules/audio/*` | 57 KB | `MIDIVJ.targets` / `MIDIVJ.acciones` | (no indexado) |

Verificado: el motor de audio no referencia `S`, `document` ni `window` fuera de su API pública; la vista de audio toca el DOM sólo 6 veces y sólo su propio panel. Es el ejemplo a seguir.

### 2.2 Núcleo: `src/Midivj ZYX.html`

Métricas contadas:

| Métrica | Valor | Qué implica |
|---|---|---|
| Líneas totales / JS inline | 6190 / ~4990 | Un solo archivo, un solo ámbito |
| Funciones de nivel superior | 284 | Todas globales, todas visibles entre sí |
| Referencias a `S.` | 327 (19 campos) | Estado único mutado desde cualquier sitio |
| Accesos al DOM (`getElementById`, `$()`, `querySelector`) | 147 | Lógica y vista entrelazadas |
| Handlers `on*=` en el marcado | 58 → 47 funciones distintas | El HTML llama a funciones por nombre global; renombrar rompe |
| Llamadas a `renderClips()` | 36 | Cualquier cambio de dominio redibuja el panel a mano |
| Llamadas a `renderTrackInfo()` | 20 | Ídem |
| Elementos `<video>` por pista | 4 (`vidA`, `vidB`, `liveVid`, `revVid`) × 8 pistas = 32 | El modelo de pista **es** el DOM |
| Pruebas automatizadas | 0 (sólo `node --check`) | No hay red de seguridad para refactorizar |

Ejemplos concretos de acoplamiento centro-a-vista:

- `triggerOn()` (lógica pura de MIDI → clip/efecto/banco) termina en `refreshEfxUI()`.
- `trigClip()` (dominio) llama a `ensureReverse()` (IndexedDB + MediaRecorder) y `startTX()` (render).
- `makeTrack()` crea y adjunta `<video>` al `body`: no existe una pista sin navegador.
- `openOutputWindow()` genera la segunda pantalla con `window.open` + `document.write`.

Las secciones ya están **delimitadas por comentarios** (CONSTANTS, TRACKS, OUTPUT WINDOW, VIDEO LOADING, MASTER CLOCK, MIDI, CLIPS, GROUPS, TIMELINE, CANVAS RENDER LOOP, TRANSITIONS, REVERSE, HQ REVERSE, SAVE/LOAD, NETWORK MIDI, CÁMARA, SALIDA, MANDOS, BANKS). Esas cabeceras son las costuras naturales: el autor ya pensó el archivo por módulos; sólo que viven en un mismo ámbito.

El grafo lo confirma: las comunidades del monolito (`renderClips` 0.08, `netConnect` 0.09, `Midivj-ZYX.inline.js` 0.05) tienen la cohesión más baja del proyecto, mientras que las páginas satélite están entre 0.16 y 0.38.

### 2.3 Relay: modular hacia fuera, monolítico hacia dentro

`midivj-relay.js` mezcla seis responsabilidades en un archivo: servidor estático + lista blanca `MODULOS`, API de sesiones `.vjp`, layout del mando, certificado autofirmado, detección de red/Wi-Fi (con `netsh` y PowerShell, gateado por `process.platform === 'win32'`) y salas WebSocket con señalización WebRTC de dos tipos. Funciona, y tiene ventanas limpias (`handleHttp`, `alConectar`), pero cualquier port a otro host obliga a separar al menos "red/Wi-Fi" (específico de Windows) de "salas" (portable).

### 2.4 Lo que ya existe y ayuda

- `src/modules/midivj-module.js`: contrato `init/start/stop/dispose/getStatus` y dos registros (`targets`, `acciones`). Es una semilla correcta de bus de eventos.
- `scripts/Export-InlineScripts.ps1` + `graphify-src/`: el proyecto ya extrae el inline a archivos `.js` para analizarlos. Es una señal de que el código quiere vivir en archivos; hoy sólo lo hace para el grafo.
- `MODULOS` en el relay: lista blanca explícita = manifiesto de qué se sirve. Es el mismo mecanismo que necesitará un perfil FULL/LITE.
- Formato de sesión `.vjp` (5/6, aditivo): si el núcleo se comparte, una sesión hecha en escritorio abre en LITE.

## 3. Riesgos de trabajar "un módulo sin afectar lo demás" hoy

1. **Sin pruebas, todo refactor del núcleo es a ciegas.** Reversa por IndexedDB, prebuffer, transiciones y tres integraciones WebRTC no tienen ni una prueba. ADR-006 evitó tocar el monolito por esta razón; sigue vigente.
2. **Nombres globales llamados desde el marcado (47).** Mover una función a otro archivo con ESM la saca del ámbito global y rompe el `onclick`.
3. **Re-render manual disperso.** 36 sitios llaman a `renderClips()`; un cambio de modelo exige revisar cada uno.
4. **El grafo está desactualizado** (`aa065a8`; faltan `modules/`, `camara`, `salida`). Cualquier análisis de impacto con `graphify query` hoy omite el módulo de audio.

## 4. Mapa de módulos objetivo

Los bordes ya están en las cabeceras del archivo. Propuesta de corte, por dependencia de plataforma (de menor a mayor):

| Módulo | Contenido actual | Depende de | FULL | LITE |
|---|---|---|---|---|
| `core/estado` | `S`, `EFX_DEFS`, clips, grupos, bancos, `findClip`, `allClips` | nada | ✓ | ✓ |
| `core/motor` | `triggerOn/Off`, `trigClip`, exclusivo, cadena/lock, master clock, `TX` | estado + puertos | ✓ | ✓ |
| `core/sesion` | `saveProject`, `applyProjectData`, formato 5/6, `audio` | estado | ✓ | ✓ |
| `render/canvas2d` | `loop`, `drawVid`, efectos, TRANSFORM, transiciones | canvas | ✓ | ✓ (subconjunto) |
| `media/pistas` | `makeTrack`, `startLoad`, prebuffer, playlists | `<video>`, `URL.createObjectURL` | ✓ | ✓ (recortado) |
| `media/reversa` | captura, HQ reverse, IndexedDB `midivj-rev` | MediaRecorder, IndexedDB | ✓ | ✗ |
| `media/en-vivo` | PANTALLA / CAPTURA / `_applyStream` | `getDisplayMedia`, `getUserMedia` | ✓ | ✗ (sólo cámara propia) |
| `entrada/midi-web` | `initMIDI`, `onMIDIMsg` | Web MIDI | ✓ | Android sí, iOS ✗ |
| `entrada/midi-red` | `netConnect`, cliente de relay, mandos | WebSocket | ✓ | opcional |
| `salida/hdmi` | `openOutputWindow`, `captureStream` | `window.open` | ✓ | ✗ |
| `salida/obs` | `_salIniciar`, WebRTC offerer | RTCPeerConnection | ✓ | ✗ |
| `camara/movil` | `CAM`, WebRTC answerer | RTCPeerConnection | ✓ | ✗ |
| `ui/*` | paneles, timeline, bounding box, bancos, relay panel | DOM | ✓ | reescrita para táctil |
| `modules/audio` | ya existe | AudioWorklet, `getUserMedia` | ✓ | opcional |

El requisito no negociable para que la columna LITE sea "quitar" y no "reescribir": `core/*` no debe importar nada de `media/`, `salida/`, `entrada/` ni `ui/`. Lo que necesite de ellos entra como **puerto** (interfaz) que el arranque inyecta:

```text
core/motor  ──►  puertos: { media: {cargar, reproducir, pausar, seek}, reloj, eventos }
                          ▲                         ▲
                 media/pistas (escritorio)   media/pistas-lite (móvil, 1 <video>/pista)
```

Y en lugar de `renderClips()` desde el dominio, un `MIDIVJ.eventos.emitir('clips-cambiaron')` al que la UI se suscribe. `MIDIVJ.targets`/`acciones` ya son ese patrón en miniatura.

## 5. Plan recomendado: estrangulador, no reescritura

Cada paso deja la app funcionando igual y se puede parar en cualquiera.

**Paso 0 — Sacar el inline a archivos sin cambiar semántica (riesgo mínimo).**
Cortar el `<script>` por las cabeceras existentes en `src/app/00-constantes.js … 18-bancos.js` y cargarlos con `<script src>` clásicos, en el mismo orden. Siguen siendo globales; los `onclick` siguen funcionando. `Export-InlineScripts.ps1` ya hace casi esto para `graphify-src/`. Beneficio inmediato: diffs por archivo, `node --check` por archivo, grafo por módulo, y `MODULOS` del relay pasa a ser el manifiesto real. Precaución: `const`/`let` de nivel superior en scripts clásicos comparten ámbito entre archivos, así que nada se rompe, pero tampoco nada se aísla todavía.

**Paso 1 — Red de seguridad antes de tocar lógica.**
Tres pruebas baratas en Node, sin navegador: (a) ida y vuelta de `.vjp` formatos 5 y 6 con las sesiones reales de `Sessions/`; (b) `triggerOn/Off` con un `S` sintético (exclusivo, hold, lock, bancos); (c) `_drawTX`/transiciones sobre un canvas falso que registre llamadas. Esto exige que `core/*` no toque el DOM al cargarse — que es justo la primera separación que interesa.

**Paso 2 — Eventos en vez de re-render manual.**
Reemplazar los 36 `renderClips()` y 20 `renderTrackInfo()` de origen "dominio" por `eventos.emitir(...)`; la UI se suscribe una vez. Se hace por sección, midiendo con `grep` que el conteo baja.

**Paso 3 — Puertos de plataforma.**
Extraer las cuatro APIs no portables detrás de una interfaz cada una: `MidiPort` (Web MIDI / WS / nativo), `MediaPort` (elementos `<video>`), `OutputPort` (ventana HDMI / captureStream / nada), `StoragePort` (IndexedDB / archivos). `AudioSource` del módulo de audio ya es exactamente esto; copiar su forma.

**Paso 4 — Perfiles.**
Un manifiesto `perfiles/{full,lite}.json` que liste módulos; el arranque carga sólo esos. El relay ya sirve por lista blanca: el perfil es la misma lista.

**Paso 5 — Relay.**
Separar `red-windows.js` (netsh/PowerShell/hotspot) de `salas.js` (WS + señalización) y `estatico.js`. Sólo cuando LITE-satélite lo necesite.

Orden de valor: el Paso 0 solo ya cumple la mitad del primer objetivo (trabajar por archivo). Los Pasos 1–3 son los que hacen posible LITE. El Paso 4 es casi gratis después.

## 6. Evaluación LITE por plataforma

### 6.1 Restricciones técnicas verificadas contra el código

| Capacidad que usa el núcleo | iOS (WebKit, cualquier navegador) | Android (Chrome) | Consecuencia para LITE |
|---|---|---|---|
| Web MIDI (`requestMIDIAccess`) | **No existe** | Sí (USB OTG, BLE MIDI) | En iOS, MIDI sólo entra por red (mando/emisor) o por app nativa con CoreMIDI |
| `getDisplayMedia` (PANTALLA) | No | No | Quitar fuente PANTALLA |
| `window.open` segunda pantalla + `document.write` | No útil | No útil | Sin salida HDMI; AirPlay/HDMI sólo con envoltorio nativo |
| 32 `<video>` simultáneos (8 pistas × 4) | Inviable (decodificadores hw limitados, autoplay) | Inviable en gama media | LITE: 2–4 pistas × 1 `<video>` (+1 de prebuffer opcional) |
| `ctx.filter` en canvas (bw, rgb, scan) | Sólo Safari ≥ 18 | Sí | Verificar versión mínima o reimplementar esos tres |
| `MediaRecorder` (reversa HQ) | Sí (≥ 14.5), pesado | Sí, pesado | Quitar reversa; dejar sólo *pingpong* por seek si acaso |
| IndexedDB `midivj-rev` | Sí, pero purgable a los 7 días | Sí | Irrelevante si no hay reversa |
| `webkitdirectory` (abrir carpeta) | No | Parcial | Selector de archivos múltiple; biblioteca por sesión |
| `captureStream` + WebRTC (salida OBS) | Sí | Sí | Técnicamente posible, fuera de LITE por alcance |
| AudioWorklet + `getUserMedia` audio | Sí (≥ 14.5) | Sí | Módulo de audio entra como opcional sin cambios |
| Relay Node en el dispositivo | No | Sólo con nodejs-mobile | LITE **no** hospeda relay |

### 6.2 Tres formas de LITE, de menor a mayor esfuerzo

1. **LITE-PWA autónoma** (misma pestaña, sin relay). Reproduce sesiones `.vjp`, 2–4 pistas, efectos baratos, disparo táctil desde la propia pantalla, MIDI por Web MIDI en Android. En iOS se controla sólo por pantalla. Es la que sale casi gratis tras los Pasos 0–4. Cubre "llevar visuales en el teléfono a un lugar sin laptop".
2. **LITE-satélite** (se une a un relay que corre en la laptop). Misma app, más `entrada/midi-red`: recibe el mismo MIDI que la app de escritorio y puede ser una salida secundaria barata (una tablet como pantalla extra). Requiere el Paso 5 sólo si se quiere que el relay corra en otro host.
3. **LITE-nativa** (Capacitor u similar sobre 1 ó 2). Gana lo que el navegador no da: BLE MIDI en iOS vía CoreMIDI, pantalla externa vía `UIScreen`/Presentation, sistema de archivos, ejecución en segundo plano. Es la única que iguala al escritorio en entrada MIDI en iOS. Añade toolchain nativo por plataforma — la misma objeción que ADR-006 puso a Electron; aquí estaría justificada porque no hay alternativa web para MIDI en iOS.

Recomendación: apuntar a **2** como diseño (la 1 es la 2 sin red) y dejar **3** como decisión aparte cuando haya un núcleo compartido que envolver.

### 6.3 Qué no se debe hacer

- **Un fork de `Midivj ZYX.html` para móvil.** Sin núcleo compartido, cada corrección de clips/bancos/sesiones habría que hacerla dos veces y los `.vjp` dejarían de ser intercambiables en el primer cambio de formato.
- **Empezar por LITE.** El orden es: extraer núcleo → pruebas → puertos → perfil. LITE es el cuarto resultado, no el primero.
- **Migrar a ESM/bundler en el Paso 0.** Rompe los 47 handlers globales del marcado de golpe. Primero archivos clásicos; ESM cuando la UI ya se suscriba por eventos y no por nombre.

## 7. Veredicto

| Pregunta | Respuesta |
|---|---|
| ¿Se puede trabajar hoy cada módulo sin afectar lo que funciona? | Sí en el perímetro (relay, mando, cámara, salida, audio). No en el núcleo. |
| ¿La conversión modular está completa? | ~35 %. El contrato existe; sólo un módulo lo usa; el centro no está cortado. |
| ¿Es viable una versión LITE para iOS/Android? | Sí, como recorte de módulos, **después** de los Pasos 0–3. Antes, sólo como fork, que se desaconseja. |
| ¿Cuál es el mayor riesgo? | La ausencia de pruebas. Es lo primero que hay que resolver y lo más barato. |
| ¿Cuál es el primer paso con mejor relación valor/riesgo? | Paso 0: cortar el inline por sus cabeceras en `src/app/*.js` con `<script src>` clásicos. Cero cambio de comportamiento. |

## 8. Notas para mantener este documento

- Las cifras de la sección 2.2 se obtienen con `grep -c` sobre `src/Midivj ZYX.html`; conviene repetirlas al cerrar cada paso para medir que bajan (`renderClips()` de 36 → 0 en dominio; `getElementById` en `core/*` → 0).
- Regenerar el grafo (`graphify update .`) antes de usarlo para impacto: hoy no contiene `src/modules/`.
- Si se acepta el plan, redactarlo como ADR-007 y enlazar desde `docs/architecture/overview.md`.
