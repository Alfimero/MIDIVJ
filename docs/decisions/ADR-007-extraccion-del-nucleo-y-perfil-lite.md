# ADR-007: Extracción del núcleo por estrangulamiento y perfil LITE como recorte de módulos

- Estado: propuesta
- Fecha: 2026-09-13
- Base: `docs/architecture/auditoria-modular-y-lite.md` (auditoría con métricas
  reproducibles; este ADR fija la decisión, no repite la evidencia).

## Contexto

La modularización de MIDIVJ está hecha en el perímetro y no en el centro.
Relay, mando, cámara, salida, control, emisor, `midivj-qr.js` y
`src/modules/audio/` son piezas independientes que se comunican por protocolo
(ADR-003 a ADR-006). `src/Midivj ZYX.html` sigue siendo un solo `<script>` de
~5000 líneas y un solo ámbito global: 284 funciones globales, 327 referencias
al estado `S`, 147 accesos al DOM, 47 funciones invocadas por nombre desde
`on*=` en el marcado, 36 llamadas manuales a `renderClips()` y un modelo de
pista que **es** el DOM (cuatro `<video>` por pista, 32 en total). No hay
pruebas automatizadas más allá de `node --check`.

Se quieren dos cosas que hoy no son posibles: trabajar cada módulo del núcleo
sin afectar lo que ya funciona, y una versión LITE para iOS/Android hecha
quitando módulos, no reescribiendo. Ambas chocan con la misma pared: el núcleo
no tiene bordes.

Restricciones de plataforma verificadas contra el código, que hacen imposible
llevar el archivo tal cual a móvil: iOS no tiene Web MIDI en ningún navegador;
`getDisplayMedia` no existe en móvil; `window.open` no sirve como segunda
pantalla; 32 `<video>` simultáneos son inviables; `ctx.filter` (bw/rgb/scan)
sólo funciona en Safari ≥ 18.

## Decisión

1. **El núcleo se extrae por estrangulamiento, nunca por reescritura.** Cada
   paso deja la aplicación funcionando exactamente igual y se puede detener en
   cualquiera. No se reescribe `Midivj ZYX.html`; se le van sacando secciones.

2. **Paso 0 — Archivos, mismo ámbito.** El `<script>` inline se corta por sus
   cabeceras de sección existentes en `src/app/NN-nombre.js` (CONSTANTS,
   TRACKS, OUTPUT WINDOW, VIDEO LOADING, MASTER CLOCK, MIDI, CLIPS, GROUPS,
   TIMELINE, RENDER, TRANSITIONS, REVERSE, HQ REVERSE, SAVE/LOAD, NETWORK,
   CÁMARA, SALIDA, MANDOS, BANKS) y se cargan con `<script src>` clásicos en
   el mismo orden. Siguen siendo globales: los `on*=` del marcado no se tocan.
   **No** se adopta ESM ni bundler en este paso. Los archivos se agregan a la
   lista blanca `MODULOS` del relay y a las comprobaciones de `AGENTS.md`.

3. **Paso 1 — Red de seguridad antes de tocar lógica.** Pruebas en Node, sin
   navegador, para lo que no puede romperse: ida y vuelta de `.vjp` en formatos
   5 y 6 con sesiones reales; `triggerOn`/`triggerOff` con un `S` sintético
   (exclusivo, hold, lock, bancos); transiciones sobre un canvas falso que
   registre llamadas. Requisito implícito: `core/*` no debe tocar el DOM al
   cargarse.

4. **Paso 2 — Eventos en lugar de re-render manual.** Se añade
   `MIDIVJ.eventos` (`emitir`/`suscribir`) junto a `MIDIVJ.targets` y
   `MIDIVJ.acciones` en `src/modules/midivj-module.js`. El dominio emite
   (`clips-cambiaron`, `pista-cambio`, …); la interfaz se suscribe una vez.
   Métrica de avance: llamadas a `renderClips()` y `renderTrackInfo()` desde
   código de dominio, de 36 y 20 a 0.

5. **Paso 3 — Puertos de plataforma.** Las cuatro dependencias no portables
   quedan detrás de una interfaz que el arranque inyecta: `MidiPort` (Web MIDI
   / WebSocket / nativo), `MediaPort` (elementos `<video>`), `OutputPort`
   (ventana HDMI / `captureStream` / ninguna) y `StoragePort` (IndexedDB /
   archivos). La forma es la que ya tiene `AudioSource` en el módulo de audio:
   el motor no sabe de dónde viene la fuente.

6. **Paso 4 — Perfiles como manifiesto.** `perfiles/full.json` y
   `perfiles/lite.json` enumeran los módulos que carga cada variante. El
   relay ya sirve por lista blanca; el perfil es esa lista. LITE es
   `full` menos `media/reversa`, `media/en-vivo`, `salida/hdmi`,
   `salida/obs`, `camara/movil` y con `media/pistas-lite` (2–4 pistas, un
   `<video>` por pista) en lugar de `media/pistas`.

7. **Paso 5 — Relay, sólo cuando LITE-satélite lo exija.** Separar
   `red-windows.js` (netsh/PowerShell/hotspot, sólo `win32`) de `salas.js`
   (WS + señalización, portable) y `estatico.js`.

8. **LITE se diseña como "satélite"** (misma app que se une al relay de la
   laptop); la variante autónoma es la misma sin `entrada/midi-red`. Un
   envoltorio nativo (Capacitor o similar) queda como decisión aparte,
   posterior, y sólo se justifica por lo que el navegador no da en iOS:
   MIDI por CoreMIDI, pantalla externa, sistema de archivos.

9. **Módulos capaces de ejecutarse sin navegador (`core/*`) deben poder
   cargarse en Node.** Es la condición que hace posibles las pruebas del Paso 1
   y la que garantiza que el corte es real y no cosmético.

## Alternativas descartadas

- **Fork de `Midivj ZYX.html` para móvil.** Sin núcleo compartido, cada
  corrección de clips, bancos o sesiones se hace dos veces y los `.vjp` dejan
  de ser intercambiables en el primer cambio de formato. Es la opción que
  parece más rápida y la que más cuesta a los tres meses.
- **Reescritura del núcleo con framework y bundler.** Es la migración masiva
  que ADR-006 ya descartó, y el archivo contiene reversa por IndexedDB,
  prebuffer, transiciones y tres integraciones WebRTC sin una sola prueba.
- **ESM desde el Paso 0.** Saca las funciones del ámbito global y rompe los 47
  `on*=` del marcado de golpe. Se reconsidera después del Paso 2, cuando la
  interfaz ya no llame al dominio por nombre.
- **Empezar por LITE.** El orden es núcleo → pruebas → puertos → perfil. LITE
  es el cuarto resultado, no el primero.
- **Electron o host nativo para el escritorio.** No aporta nada a los dos
  objetivos y añade toolchain por sistema; ya descartado en ADR-006.

## Consecuencias

- Aparece `src/app/` (núcleo extraído) al lado de `src/modules/` (subsistemas
  con contrato). Con el tiempo, `Midivj ZYX.html` se reduce a marcado, estilos
  y la lista ordenada de `<script src>`.
- Aparece una carpeta de pruebas ejecutables con `node`; `AGENTS.md` pasa a
  exigirlas después de cada cambio en `core/*`.
- `MIDIVJ.eventos` se convierte en la tercera pieza del contrato de módulos.
  Los módulos futuros (DMX, red) deben usarlo en lugar de llamar a funciones de
  la interfaz.
- Las métricas de la auditoría (referencias a `S`, accesos al DOM en
  `core/*`, `renderClips()` desde dominio) son el indicador de avance y se
  repiten al cerrar cada paso.
- El grafo de graphify debe regenerarse con `graphify update .` al cerrar cada
  paso; hoy está en `aa065a8` y no incluye `src/modules/`.
- Este ADR pasa a "aceptada" cuando el Paso 0 esté en `main` con la aplicación
  verificada idéntica (mismas sesiones abren igual, mismo render).
