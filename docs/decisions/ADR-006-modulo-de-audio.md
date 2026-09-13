# ADR-006: Módulo de audio como primer módulo desacoplado, con análisis en AudioWorklet

- Estado: aceptada
- Fecha: 2026-09-03

## Contexto

### Diagnóstico de la arquitectura previa (fase 0 de la auditoría)

MIDIVJ es una aplicación local de navegador servida por un Node mínimo. Antes
de este cambio:

- **Proceso principal**: no hay proceso nativo. `src/midivj-relay.js` (~1400
  líneas) sirve archivos, guarda sesiones y hace de relay WebSocket; todo lo
  demás corre en la pestaña.
- **Aplicación**: `src/Midivj ZYX.html` (~6000 líneas, un solo `<script>`
  inline). Contiene el estado global `S`, ocho pistas, clips y grupos,
  dieciséis efectos, el `loop()` de render sobre canvas, la reversa por
  IndexedDB, la persistencia `.vjp`, Web MIDI y el cliente del relay.
- **MIDI**: `onMIDIMsg()` → `triggerOn()` / `triggerOff()`. Nótese que **CC se
  trata como on/off** (`vel >= 64`): el proyecto no tenía, hasta ahora, ningún
  camino para un valor continuo que mueva un parámetro.
- **Red**: cinco roles (`app`, `mando`, `emisor`, `camara`, `salida`), slots
  por dispositivo, y señalización WebRTC unicast resuelta tres veces (ADR-003,
  ADR-004, ADR-005). El relay nunca toca contenido multimedia.
- **Estado**: un único objeto `S` mutado directamente desde los manejadores de
  interfaz. No hay store, ni eventos, ni IPC.
- **Acoplamiento**: alto dentro del HTML (interfaz, estado y render se llaman
  entre sí sin capas); **bajo** en los bordes — el relay, las páginas de
  mando/cámara/salida y `midivj-qr.js` ya son piezas independientes que se
  comunican por protocolo. Es decir: el proyecto ya sabe agregar subsistemas
  por el borde, no por el centro.

La conclusión de la auditoría es que **no hay que refactorizar el monolito para
agregar audio**. El punto de extensión natural es el que el proyecto ya usa
cuatro veces: una pieza nueva, autónoma, que se comunica por un contrato
mínimo.

## Decisión

- **El audio se agrega como módulo al lado del monolito, no dentro.** Se crea
  `src/modules/` con un contrato mínimo (`midivj-module.js`: `id`, `init`,
  `start`, `stop`, `dispose`, `getStatus`, `capacidades`, `estado`) y
  `src/modules/audio/` como primer módulo que lo cumple. **No se migra nada
  existente.** Video, MIDI, cámara y DMX podrán migrar después, o nunca.
- **El acople con MIDIVJ son dos registros, no una dependencia.**
  `MIDIVJ.targets` (parámetros continuos) y `MIDIVJ.acciones` (disparos). La
  app los llena en `refrescarDestinosAudio()`; el motor sólo los consume. El
  motor no importa, referencia ni conoce `S`, el canvas ni el relay.
- **Todo el análisis por muestra vive en un `AudioWorkletProcessor`**, es decir
  en el hilo de audio del navegador, con las reglas de tiempo real escritas en
  el propio archivo: sin asignaciones, sin logs, sin JSON dentro de
  `process()`. El hilo principal recibe ~62 reportes por segundo y por bus con
  valores ya normalizados. El render de video no puede frenar el análisis ni al
  revés.
- **El bus es un concepto de primera clase desde el día uno, y analizar no
  implica escuchar.** El grafo por bus es `fuente → ganancia → [worklet de
  análisis] + [ganancia de monitor → destination]`, con el monitor en 0 por
  omisión. Una entrada puede controlar visuales sin sonar. Esto no es un
  detalle de interfaz: es el caso normal en vivo, donde el sonido ya va por la
  consola.
- **`AudioSource` acepta cualquier `MediaStream`, no sólo un `deviceId`.** Es
  el punto de desacople que hace baratas las fases futuras: audio de red,
  teléfono por WebRTC, o un host nativo entran por la misma puerta sin tocar
  análisis, buses ni mapeos.
- **Audio de red = WebRTC/Opus; WebSocket sólo para señalización, control y
  metadata.** Coherente con ADR-004 y ADR-005, y explícitamente **nunca** audio
  como JSON o base64. No se implementa todavía.
- **Los módulos se sirven por lista blanca explícita** en el relay
  (`MODULOS`), no recorriendo la carpeta: el relay no debe poder entregar un
  archivo del proyecto que no esté enumerado.
- **La configuración de audio se guarda en la sesión `.vjp` bajo la clave
  `audio`**, de forma aditiva sobre el formato 6. Las sesiones anteriores no la
  traen y se abren igual. No se guardan streams ni permisos: al abrir una
  sesión las entradas quedan `pendiente` hasta que el operador pulse
  RECONECTAR, porque el navegador exige un gesto del usuario.
- **Degradación limpia.** Si los módulos no cargan (página abierta como
  `file://`, relay viejo), el botón AUDIO se esconde y MIDIVJ queda idéntica a
  como estaba.

### Sobre la captura en Windows 11 (ASIO / WASAPI)

Se evaluó como pedía la auditoría, y la respuesta la fija el stack, no la
preferencia:

- **ASIO es inalcanzable desde un navegador.** No hay API web que lo exponga.
- **WASAPI exclusivo tampoco** está disponible desde la pestaña.
- **La ruta real es WASAPI en modo compartido**, que es lo que Chrome/Edge
  abren por debajo de `getUserMedia`. Medido aquí: 48 kHz, `baseLatency` 10 ms,
  `outputLatency` 48 ms, bloque de 128 muestras, 0 dropouts.
- **Multi-cliente**: al ser compartido, MIDIVJ convive con otras aplicaciones
  WASAPI compartidas, pero **no** con una que tenga la interfaz en ASIO o
  exclusivo, salvo que el driver del fabricante sea multi-cliente. Eso depende
  del driver y **hay que medirlo con la interfaz concreta** — queda como tarea
  de validación en el roadmap, no como supuesto.
- Las entradas se piden con `echoCancellation`, `noiseSuppression` y
  `autoGainControl` en `false`: con los valores por omisión del navegador, un
  instrumento suena mal y el AGC destruye cualquier mapeo por nivel.

### Alcance implementado

Fases 1 a 5 del roadmap: motor, enumeración, captura, medidores RMS/pico,
envolvente y gate, mapeo audio → parámetro y eventos audio → disparo. Sin FFT,
sin detección de tempo, sin audio de red, sin salida más allá del monitor.

## Alternativas descartadas

- **Refactorizar `Midivj ZYX.html` en módulos antes de agregar audio.** Es la
  migración masiva que el encargo pedía explícitamente evitar, y el riesgo es
  desproporcionado: ese archivo contiene reversa por IndexedDB, prebuffer de
  clips, transiciones y tres integraciones WebRTC, nada de lo cual tiene
  pruebas automatizadas. El módulo de audio no necesita esa refactorización
  para existir.
- **Análisis con `AnalyserNode` en el hilo principal.** Es el camino corto y
  habría funcionado para medidores, pero el análisis quedaría atado al
  `requestAnimationFrame` del render: un cuadro de video pesado retrasa el
  gate. Además `AnalyserNode` no da envolvente ni gate con ataque/hold/release
  sin reimplementarlos igual. El worklet cuesta un archivo más y cumple el
  requisito de hilos de forma real, no nominal.
- **FFT desde el principio.** Costosa por bloque y no necesaria para lo que
  mueve visuales. Entra como analizador adicional del mismo bus cuando haga
  falta, sin cambiar interfaces.
- **`SharedArrayBuffer` + ring buffer entre worklet e hilo principal.** Exige
  aislamiento entre orígenes (`COOP`/`COEP`), lo que obligaría a cambiar
  cabeceras del relay y podría romper las páginas embebidas y la señalización
  ya funcionando. A 62 mensajes por segundo y por bus, `postMessage` no es el
  cuello de botella. Se reconsidera si alguna vez hay que pasar audio crudo,
  no valores.
- **Electron o un host nativo con PortAudio (ASIO/WASAPI exclusivo).** Es la
  única forma de bajar la latencia a niveles de monitoreo, pero convierte una
  herramienta de "un Node y un navegador" en una aplicación con dependencias
  nativas por sistema operativo — muy por fuera del stack declarado
  (`package.json`: `ws` y `selfsigned`). Queda documentado como salida futura,
  y la interfaz `AudioSource` se diseñó para que ese host entre sin reescribir
  el motor.
- **Dependencias npm nuevas** (analizadores, DSP, transporte). Ninguna hace
  falta: Web Audio, `AudioWorklet` y `getUserMedia` vienen en el navegador, y
  el DSP implementado son filtros de un polo de veinte líneas. Se mantiene el
  criterio del resto del proyecto: dos dependencias en total.
- **Un módulo de audio con su propio servidor o su propio puerto.** El relay ya
  sirve todo y ya resuelve señalización; agregar un segundo servidor duplicaría
  la infraestructura que ADR-003/004/005 dieron por buena.

## Consecuencias

- Aparece `src/modules/` y con él una segunda forma de escribir código en este
  proyecto: archivos externos con contrato, frente al HTML monolítico. Es
  deliberado, pero hay que sostenerlo — cada módulo nuevo va ahí y se agrega a
  la lista blanca del relay y a las comprobaciones de sintaxis de `AGENTS.md`.
- El relay gana una ruta estática más. No gana ningún rol nuevo: el audio de
  red todavía no existe.
- MIDIVJ gana, por primera vez, un camino para **valores continuos** que mueven
  parámetros. MIDI sigue siendo on/off; si algún día se quieren CC continuos,
  el registro `MIDIVJ.targets` ya está y sería reutilizable.
- El formato de sesión 6 crece con una clave opcional. Sesiones viejas se
  abren igual; sesiones nuevas abiertas en una versión vieja de la app ignoran
  la clave.
- **Falta validación con hardware real.** Lo verificado aquí es la cadena
  completa con una señal sintética (oscilador → worklet → mapeo → opacidad de
  TRACK 1, con valores medidos correctos y 0 dropouts). Abrir una entrada
  física de la interfaz, confirmar el mapeo de canales y probar la convivencia
  con el driver requiere hardware autorizado y prueba manual — igual que pasó
  con la cámara (ADR-004) y con OBS (ADR-005).
