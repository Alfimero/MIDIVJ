# Arquitectura verificada

## Frontera del sistema

MIDIVJ es una aplicación local de navegador con un servidor HTTP Node mínimo. El mismo proceso sirve las interfaces, guarda sesiones únicamente en `Sessions/` y mantiene el relay WebSocket por salas. No existe una base de datos de servidor.

`midivj-relay.js` en realidad levanta **dos** servidores en el mismo proceso: uno HTTP (el de siempre, todas las rutas) y uno HTTPS aparte, sólo para `/camara`, con un certificado autofirmado generado en local — `getUserMedia` exige un contexto seguro y una IP de LAN por HTTP no lo es (ver ADR-004). Ambos comparten el mismo `handleHttp()` y el mismo estado de salas en memoria, así que interoperan como si fuera un único servidor.

## Componentes

1. `src/Midivj ZYX.html` contiene interfaz, estado `S`, biblioteca `MEDIA`, ocho pistas, efectos, renderizado, persistencia, MIDI y salida secundaria. Además publica al relay su inventario de clips, efectos y bancos y los eventos `clip-inicio` / `clip-fin`.
2. `src/midivj-sender.html` toma eventos de Web MIDI y los convierte en mensajes WebSocket.
3. `src/midivj-relay.js` sirve las interfaces (por HTTP, y por HTTPS sólo para `/camara`), acepta `POST /api/sessions` sólo desde loopback, procesa `join`/`midi` por WebSocket y administra roles (`app`, `mando`, `emisor`, `camara`, `salida`), sus slots (cuatro de mando, cuatro de cámara; `salida` no usa slot, sólo un `id` efímero por conexión, hasta cuatro simultáneas), el layout compartido y la información de red. Para el rol `camara` también reenvía señalización WebRTC (`camara-iniciar`/`rtc-oferta`/`rtc-respuesta`/`rtc-candidato`/`camara-colgar`/`camara-error`) como unicast app↔cámara-de-un-slot; para `salida`, señalización análoga (`salida-hola`/`salida-oferta`/`salida-respuesta`/`salida-candidato`/`salida-cerrar`/`salida-error`) como unicast app↔visor-de-un-id. En ambos casos el relay nunca toca el contenido del video.
4. `src/midivj-mando.html` es el mando móvil: cuadrícula n×m editable, grupos, imágenes o GIF, submenús por clip y envío de MIDI.
5. `src/midivj-camara.html` es la cámara móvil: se conecta y queda disponible sin encender la cámara; sólo la enciende (`getUserMedia`) cuando la app pide ese slot, y arma la oferta WebRTC hacia la app (ver ADR-004).
6. `src/midivj-salida.html` es la página que se agrega en OBS como "Fuente de navegador" (`/salida`): recibe por WebRTC el lienzo de salida de la app (`cvs.captureStream()`), sin negociar permisos porque no usa `getUserMedia`. Aquí la app es la offerer, al revés que con la cámara (ver ADR-005).
7. `src/midivj-control.html` es la página de cabina: QR de Wi-Fi, de cada mando, de cada cámara, la URL de salida a OBS, direcciones disponibles y presencia en vivo.
8. `src/midivj-qr.js` genera los códigos QR en local, sin red; corre igual en Node y en el navegador.
9. Los `.vjp` de `Sessions/` guardan sesiones en formatos 5 y 6; los videos de `videos/Visuales 2026/` siguen siendo recursos externos elegidos por el operador.
10. `data/mando-layout.json` guarda el layout del mando; `data/certs/` guarda el certificado autofirmado de `/camara`. Ambos son configuración/estado local: quedan fuera de Git.
11. IndexedDB `midivj-rev` conserva caché derivada para reversa; no es la fuente de los medios.
12. `src/modules/` es la forma de agregar subsistemas nuevos sin tocar el monolito: `midivj-module.js` fija el contrato (`init`/`start`/`stop`/`dispose`/`getStatus`) y los dos registros con los que un módulo se comunica con la app — `MIDIVJ.targets` (parámetros continuos) y `MIDIVJ.acciones` (disparos). `src/modules/audio/` es el primero que lo cumple: motor, `AudioWorkletProcessor` de análisis y vista AUDIO. El relay los sirve por lista blanca (`MODULOS`). Ver `docs/audio-module.md` y ADR-006.

## Flujo principal

```text
MIDI local ───────────────────────────────┐
                                         v
Emisor Web MIDI -> relay por sala -> netConnect -> onMIDIMsg -> S -> loop
Mando móvil ────┘                                                   |
                                                                    |
archivo/captura/pantalla -> videos de pista ------------------------> canvas
                                                                    |
Cámara móvil -- WebRTC directo (P2P) --------------------> _applyStream()
   ↕ señalización SDP/ICE únicamente                                |
   relay por sala                                       ventana de salida
                                                                    |
                                                    cvs.captureStream()
                                                                    |
                                                          getOutputStream()
                                                                    |
                                          _salIniciar() -- WebRTC directo (P2P) --> OBS (/salida)
                                                    ↕ señalización SDP/ICE únicamente
                                                       relay por sala
```

El audio es un flujo aparte que no toca el canvas: la entrada se abre con `getUserMedia` en la propia pestaña, se analiza dentro de un `AudioWorklet` (hilo de audio) y lo único que llega al hilo principal son valores normalizados ~62 veces por segundo. De ahí salen dos caminos: valores continuos hacia `MIDIVJ.targets` (opacidad de pista, parámetros de efecto) y eventos discretos hacia `MIDIVJ.acciones` (disparar un clip, un banco, un efecto). El monitor es una rama separada del grafo y arranca apagado: analizar no implica escuchar. Ver ADR-006.

El mando entra por la misma puerta que el hardware: sus botones envían MIDI y el relay lo reenvía a la sala. En sentido inverso viaja sólo información: `updateActiveLbl()` compara el clip activo de cada pista con el anterior y emite `clip-fin`, que es lo que hace volver al mando desde el submenú de efectos.

La cámara del teléfono es un flujo aparte: el video nunca pasa por el relay. El relay sólo transporta el handshake WebRTC (SDP + candidatos ICE) entre la pestaña de MIDIVJ y el teléfono; una vez negociada la conexión, el video llega directo por `pc.ontrack` y se entrega a `_applyStream()` — el mismo punto donde ya entran PANTALLA y CAPTURA. Ver ADR-004.

La salida a OBS es el mismo patrón de WebRTC directo, con los papeles invertidos: la app es la offerer (ya tiene `getOutputStream()` — el mismo `MediaStream` que alimenta la ventana de salida HDMI — listo de forma síncrona) y `/salida` es la answerer. El relay vuelve a limitarse a señalización; el video de la propia MIDIVJ llega directo al visor. Ver ADR-005.

## Autoridad

El flujo se derivó del código ejecutable. `graphify-src/` conserva una copia analizable de los scripts embebidos, pero cualquier línea debe confirmarse en `src/Midivj ZYX.html`.

## Evolución

La conversión modular del núcleo y la versión LITE se rigen por ADR-007. El diagnóstico con métricas está en `auditoria-modular-y-lite.md`.
