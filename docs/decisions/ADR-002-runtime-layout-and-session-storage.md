# ADR-002: Runtime organizado y sesiones guardadas por el servidor local

- Estado: aceptada
- Fecha: 2026-07-16

## Contexto

Los archivos ejecutables, las sesiones y los videos convivían en la raíz. El navegador descargaba cada `.vjp` en la carpeta configurada por el usuario, por lo que MIDIVJ no podía garantizar que las sesiones quedaran dentro del proyecto. Los videos ocupan aproximadamente 3.43 GB y no deben publicarse en Git.

## Decisión

- Concentrar la aplicación, el emisor, el relay y el launcher en `src/`.
- Conservar las sesiones publicables en `Sessions/`.
- Mover los medios a `videos/Visuales 2026/` y excluir esa ruta de Git y Graphify.
- Servir las interfaces y `POST /api/sessions` desde el proceso Node que ya aloja el relay WebSocket.
- Aceptar escrituras de sesiones únicamente desde loopback, sanear nombres, confinar rutas, escribir de forma atómica y elegir un sufijo antes que sobrescribir.
- Si el servidor local no está disponible, no descargar el `.vjp` en otra ubicación: informar el error al operador.

## Consecuencias

El flujo normal requiere iniciar `src/INICIAR_RELAY.bat` y abrir `http://localhost:9191/`. Las sesiones quedan organizadas y recuperables dentro del proyecto. El relay sigue accesible para MIDI en la red local, pero la escritura de archivos permanece limitada al equipo anfitrión.
