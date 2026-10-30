# ADR-008: Grabación de la salida con MediaRecorder, guardada por el relay segundo a segundo

- Estado: aceptada
- Fecha: 2026-10-30

## Contexto

El operador quiere grabar la salida compuesta (y más adelante cada cámara por separado) sin depender de OBS. Hasta ahora la única forma era agregar `/salida` en OBS y grabar ahí, con un salto WebRTC de por medio que vuelve a comprimir la imagen.

Restricciones que pesan:

- El navegador del operador es Brave, que trae apagada la API de archivos (`showSaveFilePicker`). Descargar un Blob al final pierde todo si la pestaña se cierra a media función.
- La salida ya existe como lienzo (`cvs`), y `cvs.captureStream()` la entrega como `MediaStream`. Ese stream lo comparten la ventana HDMI y los visores de `/salida`: detenerlo los congela (pasaba al cerrar la ventana HDMI; se corrige en el mismo cambio).
- El lienzo cambia de tamaño solo cuando la pista 1 carga un video de otra resolución, y a mano desde ⛶ SALIDA.
- Todo cambio tiene que funcionar tras un `git pull` simple, sin dependencias nuevas.

## Decisión

- **Módulo propio** en `src/modules/grabacion/` (motor `midivj-grabacion.js` + vista `midivj-grabacion-ui.js`), con el contrato de `midivj-module.js`. La app sólo registra la salida en un registro nuevo, `MIDIVJ.capturas` (`{ id, nombre, capturar(fps), tamano() }`), y pinta el botón ⏺ de la cabecera. El módulo no conoce `S` ni el lienzo. Las cámaras se agregarán al mismo registro.
- **Cada archivo tiene su propio `captureStream`**, pedido al módulo y detenido por él: grabar no toca HDMI ni OBS. Además, un stream compartido le entregaba al grabador nuevo un cuadro del tamaño anterior y el MP4 quedaba con el tamaño equivocado.
- **MP4 (H.264) por defecto**, WebM (VP9/VP8) si el navegador no tiene MP4 en MediaRecorder. Bitrate por calidad: 0,08 / 0,15 / 0,3 bits por píxel y cuadro (≈ 5 / 9 / 19 Mbps a 1080p30), entre 1 y 80 Mbps.
- **Un cuadro clave por segundo** (`videoKeyFrameIntervalDuration: 1000`): el MP4 se escribe por fragmentos que empiezan en un cuadro clave; sin esto llegaba a disco cada ~3,4 s.
- **El relay escribe los archivos.** MediaRecorder entrega un trozo por segundo y la app lo manda con `PUT /api/grabaciones/<toma>/<archivo>?desde=<bytes ya guardados>`. El relay agrega si el archivo mide eso, responde bien sin escribir si ya lo incluye (reintento tras un corte) y da 409 con el tamaño real en cualquier otro caso. No guarda estado en memoria: un relay reiniciado sigue recibiendo la misma grabación. Si el relay no responde, los trozos esperan en memoria y se reenvían solos.
- **Tomas.** `POST /api/grabaciones` crea `Grabaciones/<fecha hora>[ nombre]/` y un archivo vacío sin pisar nada (`salida (2).mp4`, …). `toma.json` describe cada archivo (formato, tamaño, kbps, bytes, `desdeMs`/`hastaMs` con un mismo reloj para alinear cámaras después). `GET` lista las últimas 12 tomas; `POST /api/grabaciones/abrir` abre la carpeta en el explorador.
- **Seguridad:** las rutas responden sólo a loopback (como las sesiones) y rechazan un `Origin` que no sea el propio relay, para que un sitio abierto en otra pestaña no pueda escribir. Los nombres se limpian y uno que cambia al limpiarlo (`..`, barras, `CON`) se rechaza; la ruta final tiene que quedar dentro de `Grabaciones/`. Trozo máximo 64 MB.
- **Cambios de tamaño.** Mientras graba, el lienzo no cambia solo con la pista 1. Un cambio a mano pasa por `grabador.cortar(cambiar)`: el grabador viejo se detiene *antes* del cambio y el nuevo arranca justo después, en un archivo nuevo de la misma toma. Ningún archivo mezcla dos tamaños (el H.264 quedaba dañado). `revisar()` cada segundo es el respaldo para un cambio que no pase por ahí.
- Recargar o cerrar la pestaña mientras graba pide confirmación (`beforeunload`).

## Alternativas descartadas

- **File System Access API** (escribir directo a disco desde el navegador): apagada en Brave y ausente en Firefox/Safari.
- **Descargar un Blob al detener**: todo queda en memoria y se pierde si la pestaña se cierra o el navegador se cae.
- **WebSocket binario al relay**: habría que reconstruir orden, acuse y reintentos. Un `PUT` con `?desde=` es idempotente por diseño y no deja estado en el relay.
- **Un solo `captureStream` compartido con HDMI/OBS**: detenerlo al terminar los congelaba, y al cortar por tamaño entregaba un cuadro viejo al archivo nuevo.
- **Dejar que MediaRecorder siga tras un cambio de tamaño**: el MP4 queda con cuadros que el decodificador no puede leer.
- **Grabar en OBS**: sigue disponible, pero pasa por un salto WebRTC que recomprime y no da un archivo por cámara.

## Consecuencias

- Hay grabación sin OBS, con lo grabado en disco segundo a segundo, probada en Brave, Edge y Chrome 156 (Playwright, `ffprobe`/`ffmpeg`). En Chrome 149 (headless) cualquier segundo MediaRecorder de la página crashea la pestaña, aun en una página vacía: es un fallo de esa versión, no de este código.
- Sin audio por ahora: se graba aparte (OBS o la mezcladora) y se junta al editar.
- La ventana de MIDIVJ tiene que quedar a la vista: minimizada, el navegador frena el dibujo (igual que para HDMI y OBS). El módulo lo avisa.
- Hay que reiniciar el relay tras actualizar; con un relay viejo el panel lo dice.
- Siguientes pasos: cada cámara en su propio archivo (registrar cada fuente en vivo en `MIDIVJ.capturas`), grabación en el teléfono con subida al relay, audio, y grabar/detener desde MIDI o el mando.
