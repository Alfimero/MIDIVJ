---
project_id: project:midivj
project_name: MIDIVJ
status: active
category: software-and-musical-production
owners: []
stack:
  - HTML
  - CSS
  - JavaScript
  - Web MIDI API
  - WebSocket
  - Canvas 2D
  - Node.js
  - WebRTC
  - Web Audio / AudioWorklet
repositories:
  - repository:midivj-local
databases:
  - browser:indexeddb-midivj-rev
devices:
  - generic:midi-input
  - generic:video-capture
integrations:
  - integration:web-midi
  - integration:websocket-relay
  - integration:obs-browser-source
related_projects: []
last_verified: 2026-09-13
---

# Propósito

Herramienta local de ejecución visual para superponer hasta ocho pistas de video o captura en un lienzo, controlarlas por MIDI y enviar la salida a una segunda pantalla.

# Estado actual verificado

La aplicación principal está concentrada en `src/Midivj ZYX.html`. `src/midivj-relay.js` sirve las interfaces (HTTP, y HTTPS sólo para `/camara`), guarda sesiones y mantiene el relay de red con cinco roles; el emisor está en `src/midivj-sender.html`. `package.json` fija `ws` y `selfsigned`. Desde 2026-09-03 existe `src/modules/` con el contrato de módulos y el módulo de audio. Los tres archivos `Sessions/*.vjp` inspeccionados contienen 8 pistas, 15 efectos y 8 bancos; dos usan formato 6 y `Sessions/Bk-Nk!.vjp` conserva formato 5.

# Alcance

Incluye compositor Canvas 2D, reproducción de archivos, captura en vivo, cámara de teléfono por WebRTC (hasta cuatro), mapeo MIDI local, relay MIDI por WebSocket, control remoto desde hasta cuatro teléfonos con QR y cuadrícula configurable, persistencia `.vjp`, caché de reversa en IndexedDB, salida secundaria (ventana HDMI) y salida a OBS por WebRTC (hasta cuatro fuentes), y análisis de audio en `AudioWorklet` que mueve parámetros y dispara acciones. La biblioteca de video no forma parte del grafo.

# Arquitectura

El estado global `S` y la biblioteca `MEDIA` coordinan ocho pistas. `loop()` compone cada cuadro. `onMIDIMsg()` concentra el despacho MIDI. `netConnect()` recibe MIDI remoto. `openOutputWindow()` gestiona la salida secundaria y usa `canvas.captureStream()` con alternativa de copia.

# Componentes principales

- `src/Midivj ZYX.html`: interfaz, estado, reproducción, composición, efectos, persistencia y MIDI.
- `src/midivj-relay.js`: servidor HTTP local, guardado confinado en `Sessions/`, salas WebSocket con roles y slots, layout del mando e información de red.
- `src/midivj-sender.html`: entrada Web MIDI y envío al relay.
- `src/midivj-mando.html`: mando móvil (cuadrícula editable, grupos, imágenes, submenús por clip).
- `src/midivj-control.html`: página de cabina con los QR de Wi-Fi, de cada mando y de cada cámara, más la URL de salida a OBS.
- `src/midivj-camara.html`: cámara móvil; enciende `getUserMedia` sólo cuando la app pide ese slot y ofrece por WebRTC (ADR-004).
- `src/midivj-salida.html`: fuente de navegador para OBS; recibe el lienzo por WebRTC, la app es la offerer (ADR-005).
- `src/modules/midivj-module.js`: contrato `init/start/stop/dispose/getStatus` y registros `MIDIVJ.targets` / `MIDIVJ.acciones`.
- `src/modules/audio/`: motor, `AudioWorkletProcessor` de análisis y panel AUDIO (ADR-006).
- `data/certs/`: certificado autofirmado de `/camara`; fuera de Git.
- `src/midivj-qr.js`: generador de QR local, compartido por Node y el navegador.
- `Sessions/*.vjp`: ejemplos de sesiones operativas.
- `data/mando-layout.json`: layout del mando; configuración local fuera de Git.
- `graphify-src/`: JavaScript derivado de los HTML para análisis AST; no es fuente oficial.

# Flujos de datos

Entrada MIDI local o remota → `onMIDIMsg()` → estado y acciones de pista → `loop()` → canvas principal → ventana de salida. El emisor y el mando móvil envían `{type:'midi', data:[...]}` al relay; el relay reenvía sólo dentro de la misma sala. De vuelta, la aplicación publica su inventario (clips, efectos y bancos con su MIDI) y los eventos `clip-inicio` / `clip-fin` que usan los mandos para volver de un submenú de efectos.

# Dependencias

Navegador con Web MIDI, APIs de captura, WebRTC y `AudioWorklet`; Node.js con `ws` y `selfsigned`, ambos fijados en `package.json` y `package-lock.json`.

# Integraciones

Web MIDI, WebSocket local, WebRTC (cámara de teléfono y salida a OBS), captura de pantalla/dispositivo, entrada de audio, selección de carpetas y ventana secundaria. OBS se integra como fuente de navegador en `/salida` (ADR-005). No hay integración con Ableton Live.

# Decisiones técnicas

- La aplicación principal conserva su formato monolítico; los subsistemas nuevos se agregan como módulos en `src/modules/` (ADR-006) y el núcleo se extraerá por estrangulamiento sin reescritura (ADR-007, propuesta).
- El relay nunca transporta video ni audio: sólo señalización WebRTC (ADR-004, ADR-005).
- Graphify indexa una copia generada de los scripts embebidos para no reescribir el HTML.
- Los videos y las copias históricas quedan excluidos.
- Las aristas `INFERRED` son hipótesis, no hechos.

# Riesgos

Acoplamiento en estado global (medido en `docs/architecture/auditoria-modular-y-lite.md`), rutas sensibles de renderizado, ausencia de pruebas automatizadas, y validación de espectáculo dependiente de hardware/navegador real. Cámara, OBS y audio se verificaron con clientes sintéticos, no con hardware autorizado.

# Incidentes conocidos

El incidente de ruta absoluta del launcher quedó resuelto: `src/INICIAR_RELAY.bat` calcula la raíz desde su propia ubicación. Véase `docs/incidents/2026-07-14-launcher-path.md`.

# Componentes reutilizables

El protocolo de relay por salas y el extractor reproducible de scripts embebidos son candidatos. Su reutilización requiere revisar seguridad, dependencias y pruebas.

# Relaciones con otros proyectos

No se confirmó ninguna relación directa en el código inspeccionado.

# Operación y despliegue

La aplicación se sirve localmente en `http://localhost:9191/`. El relay se ejecuta con Node después de instalar `ws`; el mismo proceso guarda las sesiones en `Sessions/`. Graphify se regenera manualmente con `scripts/Update-Graphify.ps1`.

# Próximos pasos

Realizar una prueba operativa con controlador MIDI, salida secundaria, teléfono como cámara, OBS y una interfaz de audio autorizados. Ejecutar el Paso 0 de ADR-007 (cortar el `<script>` inline en `src/app/*.js` sin cambiar el ámbito) y pasar el ADR a aceptada cuando la aplicación se verifique idéntica.

Para el mando móvil queda pendiente la prueba de función con teléfonos reales sobre una red creada por la computadora: el protocolo, el layout y el retorno de submenú se validaron con clientes simulados y en navegador, no con dispositivos ni con un punto de acceso activo.

# Fuentes verificadas

`src/Midivj ZYX.html`, `src/midivj-relay.js`, `src/midivj-sender.html`, `src/INICIAR_RELAY.bat`, `PROJECT_CONTEXT.md` y los tres archivos `Sessions/*.vjp`, revalidados tras la reorganización del 2026-07-16. El mando móvil (`src/midivj-mando.html`, `src/midivj-control.html`, `src/midivj-qr.js` y los cambios del relay y de la aplicación) se agregó el 2026-08-20; ver `docs/decisions/ADR-003-mando-movil-por-websocket.md`. Cámara móvil (ADR-004), salida a OBS (ADR-005) y módulo de audio (ADR-006) se agregaron entre el 2026-09-01 y el 2026-09-03; la auditoría modular y ADR-007 son del 2026-09-13.
