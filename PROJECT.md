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
related_projects: []
last_verified: 2026-07-14
---

# Propósito

Herramienta local de ejecución visual para superponer hasta ocho pistas de video o captura en un lienzo, controlarlas por MIDI y enviar la salida a una segunda pantalla.

# Estado actual verificado

La aplicación principal está concentrada en `src/Midivj ZYX.html`. `src/midivj-relay.js` sirve las interfaces, guarda sesiones y mantiene el relay de red; el emisor está en `src/midivj-sender.html`. `package.json` fija la dependencia `ws`. Los tres archivos `Sessions/*.vjp` inspeccionados contienen 8 pistas, 15 efectos y 8 bancos; dos usan formato 6 y `Sessions/Bk-Nk!.vjp` conserva formato 5.

# Alcance

Incluye compositor Canvas 2D, reproducción de archivos, captura en vivo, mapeo MIDI local, relay MIDI por WebSocket, persistencia `.vjp`, caché de reversa en IndexedDB y salida secundaria. La biblioteca de video no forma parte del grafo.

# Arquitectura

El estado global `S` y la biblioteca `MEDIA` coordinan ocho pistas. `loop()` compone cada cuadro. `onMIDIMsg()` concentra el despacho MIDI. `netConnect()` recibe MIDI remoto. `openOutputWindow()` gestiona la salida secundaria y usa `canvas.captureStream()` con alternativa de copia.

# Componentes principales

- `src/Midivj ZYX.html`: interfaz, estado, reproducción, composición, efectos, persistencia y MIDI.
- `src/midivj-relay.js`: servidor HTTP local, guardado confinado en `Sessions/`, salas WebSocket y reenvío de mensajes.
- `src/midivj-sender.html`: entrada Web MIDI y envío al relay.
- `Sessions/*.vjp`: ejemplos de sesiones operativas.
- `graphify-src/`: JavaScript derivado de los HTML para análisis AST; no es fuente oficial.

# Flujos de datos

Entrada MIDI local o remota → `onMIDIMsg()` → estado y acciones de pista → `loop()` → canvas principal → ventana de salida. El emisor envía `{type:'midi', data:[...]}` al relay; el relay reenvía sólo dentro de la misma sala.

# Dependencias

Navegador con Web MIDI y APIs de captura, Node.js y paquete `ws` para el relay. No hay versión fijada de `ws` ni instalación reproducible en el estado inspeccionado.

# Integraciones

Web MIDI, WebSocket local, captura de pantalla/dispositivo, selección de carpetas y ventana secundaria. No se encontró código que integre directamente Ableton Live u OBS; esos usos no se consideran confirmados.

# Decisiones técnicas

- La aplicación principal conserva su formato monolítico.
- Graphify indexa una copia generada de los scripts embebidos para no reescribir el HTML.
- Los videos y las copias históricas quedan excluidos.
- Las aristas `INFERRED` son hipótesis, no hechos.

# Riesgos

Acoplamiento en estado global, rutas sensibles de renderizado, ausencia de manifiesto Node, launcher con ruta obsoleta y validación de espectáculo dependiente de hardware/navegador real.

# Incidentes conocidos

El incidente de ruta absoluta del launcher quedó resuelto: `src/INICIAR_RELAY.bat` calcula la raíz desde su propia ubicación. Véase `docs/incidents/2026-07-14-launcher-path.md`.

# Componentes reutilizables

El protocolo de relay por salas y el extractor reproducible de scripts embebidos son candidatos. Su reutilización requiere revisar seguridad, dependencias y pruebas.

# Relaciones con otros proyectos

No se confirmó ninguna relación directa en el código inspeccionado.

# Operación y despliegue

La aplicación se sirve localmente en `http://localhost:9191/`. El relay se ejecuta con Node después de instalar `ws`; el mismo proceso guarda las sesiones en `Sessions/`. Graphify se regenera manualmente con `scripts/Update-Graphify.ps1`.

# Próximos pasos

Corregir el launcher, fijar la dependencia `ws` y realizar una prueba operativa con un controlador MIDI y salida secundaria autorizados. Estos puntos no se ejecutaron porque exceden la integración estructural y requieren una sesión de hardware.

# Fuentes verificadas

`src/Midivj ZYX.html`, `src/midivj-relay.js`, `src/midivj-sender.html`, `src/INICIAR_RELAY.bat`, `PROJECT_CONTEXT.md` y los tres archivos `Sessions/*.vjp`, revalidados tras la reorganización del 2026-07-16.
