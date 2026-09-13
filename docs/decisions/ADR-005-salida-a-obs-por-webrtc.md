# ADR-005: Salida a OBS (cámara virtual) por WebRTC, con la app como offerer

- Estado: aceptada
- Fecha: 2026-09-01

## Contexto

MIDIVJ ya resuelve "sacar el video a otro programa" para el proyector/pantalla externa: la ventana de salida HDMI (`window.open`, ver `openOutputWindow()`), que además ya expone el lienzo como `MediaStream` vía `cvs.captureStream()` (`getOutputStream()`), usado para alimentar el `<video>` de esa ventana.

Faltaba poder llevar esa misma salida a OBS como una fuente más, para que "Iniciar cámara virtual" de OBS la exponga al resto del sistema (Zoom, Meet, Discord, cualquier programa que acepte una webcam) sin depender de capturar la ventana HDMI (bordes, barra de título, parpadeo del compositor de Windows al capturar una ventana en vez de una fuente nativa de OBS).

## Decisión

- **El video viaja por WebRTC, directo entre la pestaña de MIDIVJ y la página que abre OBS.** El relay existente (`src/midivj-relay.js`) se reutiliza únicamente como canal de *señalización* (oferta/respuesta SDP y candidatos ICE): nunca ve ni retransmite el video. Mismo patrón que ADR-004 (cámara de teléfono), reutilizando el mismo relay en vez de levantar un segundo servidor.
- **La app es quien arma la oferta SDP (offerer) — al revés que con la cámara del teléfono.** La app ya tiene el `MediaStream` del lienzo (`cvs.captureStream()`, vía `getOutputStream()`) disponible de forma **síncrona**: no hay ningún `getUserMedia()` ni permiso de usuario que esperar. No existe la razón que en ADR-004 obligaba al teléfono a ser el offerer (sostener una `RTCPeerConnection` a medio inicializar mientras se resuelve un permiso impredecible), así que la app simplemente ofrece en cuanto sabe que hay un visor esperando.
- **`/salida` no usa `getUserMedia`.** Sólo *recibe* video por `pc.ontrack`, así que no tiene la restricción de contexto seguro que obliga a `/camara` a un servidor HTTPS aparte (ver el complemento de ADR-004). `/salida` se sirve por el mismo HTTP normal que el resto de la app, tanto en `localhost` (OBS en la misma PC) como en cualquier IP de LAN (OBS en otra computadora de la red).
- **Sin slot fijo: un `id` efímero por conexión.** A diferencia de mando/cámara, un visor de `/salida` no necesita identidad estable entre reconexiones — no hay un QR de "este número fijo" que recordar, y OBS puede recargar la fuente de navegador libremente. Cada conexión recibe un `id` correlativo nuevo (`sala.salidaSeq`), y el límite (`MAX_SALIDAS = 4`) sólo evita que se acumulen `RTCPeerConnection` sin tope en la app.
- **Activación automática, no bajo demanda.** Apenas un visor se conecta a `/salida`, el relay avisa a la app (`salida-hola`) y la app ofrece de inmediato — no hace falta ningún botón "iniciar" como con la cámara del teléfono, porque no hay ningún permiso que pedirle a nadie ni batería de teléfono que cuidar.
- **Reintento simple, sin margen de gracia.** La cámara de teléfono necesitó un margen de 8 s (`CAMARA_GRACIA_MS`, ver ADR-004) porque el WebSocket de un celular se cae mucho más seguido que la llamada WebRTC en sí (ahorro de batería, roaming). Un visor de `/salida` — típicamente OBS en la misma red o en la misma PC — no tiene ese patrón de flaqueza, así que el relay avisa "salida-cerrar" de inmediato al desconectarse, sin margen. Sí se reutiliza el margen de gracia **de la app** (`appGracia`, ya existente para cámaras): si la propia pestaña de MIDIVJ se recarga y vuelve a tiempo, los visores de `/salida` no se enteran del blip.
- **Reconexión idempotente del lado de la app.** Al reconectar el WebSocket de la app, el relay reenvía `salida-hola` por cada visor que sigue en la sala (para reconstruir sesiones tras un reemplazo o una recarga). `_salIniciar(id)` ignora el aviso si ya tiene una sesión para ese `id` — evita duplicar `RTCPeerConnection` para el mismo visor y, sobre todo, evita cortar una conexión que seguía perfectamente viva (mismo tipo de bug que documentan los complementos de ADR-004, evitado aquí por diseño en vez de parcheado después).
- **Sólo video**, igual que HDMI/PANTALLA/CAPTURA/cámara. No se enruta audio.

## Alternativas descartadas

- **Sólo documentar "Captura de ventana" de OBS sobre la ventana de salida HDMI existente.** No requiere código, pero depende de que la ventana no tenga foco robado, y en Windows la captura de ventana (a diferencia de una fuente nativa) puede parpadear o mostrar bordes/barra de título según el compositor. Una fuente de navegador apuntando a una página sin chrome es más estable y es lo que la mayoría de guías de "MIDIVJ/VJ software → OBS" recomienda en la práctica.
- **Cámara virtual de sistema (driver nativo, ej. `obs-virtualcam` reimplementado a mano).** Expondría MIDIVJ como webcam sin pasar por OBS, pero exige dependencias nativas fuera de Node/`ws` (el stack actual del proyecto, ver `package.json`), con instalación de driver por sistema operativo. Muy por fuera del alcance de "herramienta local en un solo proceso Node" que ya define el resto del proyecto; además OBS ya resuelve "exponer una escena como cámara virtual" con su propio botón, así que reimplementar esa pieza es trabajo redundante.
- **La página `/salida` como offerer (mismo patrón que la cámara del teléfono).** Descartado porque no hay ningún motivo para invertir los papeles: la app tiene el stream listo de forma síncrona, así que hacerla esperar una oferta de cada visor sólo agregaría una ronda de red innecesaria.
- **STUN/TURN.** Mismo argumento que ADR-003/ADR-004: el proyecto evita deliberadamente depender de servicios de red externos. `iceServers: []` (sólo candidatos host) alcanza para el caso principal — misma PC o misma LAN sin aislamiento de cliente.

## Consecuencias

- El relay gana un quinto rol (`salida`) sin slot fijo y un tercer tipo de señalización WebRTC unicast, pero sigue sin tocar video: exactamente la misma responsabilidad que ya tiene con MIDI y con la cámara.
- `src/midivj-salida.html` es la única página nueva; no se tocó el pipeline de renderizado (`loop()`, `cvs`) — la salida a OBS reutiliza `getOutputStream()` tal cual, así que ve exactamente lo mismo que ya recibe la ventana de salida HDMI, con o sin esa ventana abierta.
- Como con ADR-004, no se validó con OBS real en distintos sistemas operativos: la implementación se apoya en el mismo patrón de señalización ya probado para la cámara del teléfono (protocolo, no hardware). Falta una prueba de función con OBS real, que puede sacar a la luz casos no contemplados — igual que pasó con la cámara (ver los complementos de ADR-004).
