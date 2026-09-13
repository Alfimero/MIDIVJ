# Glosario

- **Banco**: conjunto guardado de asignaciones o estados recuperables durante una sesión.
- **Pista**: capa de archivo o captura que participa en la composición.
- **Sala**: grupo en memoria del relay WebSocket.
- **VJP**: formato JSON de sesión de MIDIVJ.
- **Salida secundaria**: ventana destinada al lienzo de presentación.
- **Relación inferida**: arista propuesta por el análisis que requiere confirmación.

- **Cámara móvil**: teléfono que entra por `/camara` y entrega su video a una pista por WebRTC directo; el relay sólo negocia.
- **Salida a OBS**: página `/salida` que recibe el lienzo por WebRTC para usarse como fuente de navegador en OBS.
- **Módulo**: subsistema en `src/modules/` que cumple el contrato de `midivj-module.js` (`init/start/stop/dispose/getStatus`).
- **Target**: parámetro continuo registrado en `MIDIVJ.targets` que un módulo puede mover (opacidad, parámetro de efecto).
- **Acción**: disparo discreto registrado en `MIDIVJ.acciones` (clip, banco, efecto).
- **Bus (audio)**: cadena `fuente → ganancia → análisis + monitor`; analizar no implica escuchar.
- **Puerto de plataforma**: interfaz que aísla una API no portable (MIDI, media, salida, almacenamiento); ver ADR-007.
- **Perfil (FULL/LITE)**: lista de módulos que carga una variante de la aplicación; ver ADR-007.
