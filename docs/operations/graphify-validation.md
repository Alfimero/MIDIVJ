# Validación del piloto Graphify

- Fecha: 2026-07-14
- Graphify: 0.9.16, entorno `uv`
- Modo final: AST local `--code-only`
- Estado global del piloto: PARTIAL

## Artefacto final

- Generación limpia: PASS, 3.35 s.
- Nodos: 229.
- Aristas: 539; 534 `EXTRACTED`, 5 `INFERRED`, 0 `AMBIGUOUS`.
- Comunidades: 17.
- Fuentes: 5; sólo JavaScript generado, relay y scripts operativos.
- Exclusión de videos, configuraciones privadas y rutas absolutas: PASS.
- Revisión automatizada: 0 hallazgos altos, 0 medios.
- HTML: doctype, cierre, datos de nodos y tres bloques de script presentes.

## Regeneración e incremento

La regeneración limpia devolvió dos veces 229 nodos y 539 aristas. `update .` terminó en 2.66 s, pero elevó el resultado a 301 nodos, 599 aristas y 17 fuentes sin cambio de código entre ambas mediciones. La actualización incremental queda `PARTIAL` por no ser idempotente; el procedimiento operativo oficial es la regeneración limpia.

## Pruebas de fuente

- `node --check src/midivj-relay.js`: PASS.
- `node --check graphify-src/Midivj-ZYX.inline.js`: PASS.
- `node --check graphify-src/midivj-sender.inline.js`: PASS.
- Parseo JSON de tres `Sessions/*.vjp`: PASS. Dos son versión 6 y una es versión 5; todas contienen 8 pistas, 15 efectos y 8 bancos.
- Prueba con navegador, controlador MIDI, captura y salida secundaria: BLOCKED por requerir hardware y una sesión operativa autorizada.
- La observación histórica de relay bloqueado quedó resuelta en la revalidación del 2026-07-16.

## Revalidación de runtime y persistencia — 2026-07-16

- Dependencia reproducible: PASS; `package.json` y `package-lock.json` fijan `ws` 8.21.0 y `npm audit` reportó 0 vulnerabilidades.
- `node --check src/midivj-relay.js`: PASS.
- Extracción y parseo de scripts embebidos desde `src/`: PASS.
- `GET /`, `GET /sender` y `GET /health`: PASS con HTTP 200.
- Guardado de sesión nueva en `Sessions/`: PASS.
- Colisión de nombre: PASS; se creó un sufijo sin sobrescribir.
- Copia de una sesión v6 existente: PASS; conservó versión 6 y 8 pistas.
- Confinamiento de nombre con traversal: PASS; el archivo permaneció bajo `Sessions/`.
- Escritura desde la dirección LAN: PASS; rechazada con HTTP 403.
- Los artefactos temporales de estas pruebas fueron eliminados después de validar su contenido.

## Diez consultas verificadas

1. `onMIDIMsg`: encontró las dos implementaciones; en el emisor llama a `noteN`, `flashPad`, `addLog` y `updateSent`.
2. `netConnect`: encontró la conexión principal y su llamada a `onMIDIMsg`, además de `netToggle`, `appendNetLog` y `setSt`.
3. `getOrCreate leaveRoom rooms`: ubicó la administración de salas en `src/midivj-relay.js`.
4. `openOutputWindow`: relacionó la apertura con `bindOutputSurface`, reinicio del stream, temporizador y alternativa de canvas.
5. `getOutputStream`: mostró su relación con `bindOutputSurface` y las rutas de salida.
6. `loop renderTrackInfo`: ubicó el bucle, dibujo, transición, timeline, salida y rutas de captura/reversa. Incluyó una arista `INFERRED`, por lo que se verificó en el código.
7. `initMIDI`: encontró `populateMIDI` y `setSt`; la llamada nativa `requestMIDIAccess` no aparece como nodo independiente.
8. `revDB revDBGet revDBPut`: encontró la caché de reversa, `ensureReverse`, generación de blob y reproducción HQ.
9. `EFX_DEFS trackFrame`: ubicó las definiciones de efectos y el estado de cuadros; `N_TRACKS` no se representó como nodo consultable.
10. `WebSocketServer`: ubicó relay, salas y funciones de entrada/salida, pero los callbacks anónimos limitan la ruta completa del broadcast.

La consulta de impacto con el ID estable de `onMIDIMsg()` principal identificó `netConnect()` y `netToggle()` a profundidad 2. Las referencias deben confirmarse en `src/Midivj ZYX.html`, porque las líneas del grafo pertenecen al derivado.

## Limitaciones observadas

- Graphify no separa por nombre las dos funciones `onMIDIMsg()` sin usar su ID completo.
- Las APIs nativas llamadas como propiedades (`requestMIDIAccess`, `captureStream`, `indexedDB.open`) no siempre se convierten en nodos.
- Los callbacks anónimos del relay reducen la expresividad del flujo de broadcast.
- El modo AST no responde contradicciones documentales ni semántica de hardware.
- `graphify-src/` introduce una diferencia de numeración de líneas respecto al HTML original.
