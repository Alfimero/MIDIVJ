# ADR-003: Mando móvil por WebSocket con MIDI como único canal de control

- Estado: aceptada
- Fecha: 2026-08-20

## Contexto

MIDIVJ ya disparaba clips, efectos y bancos por MIDI local o remoto: `onMIDIMsg()` concentra el despacho y `netConnect()` inyecta el MIDI que llega del relay por la misma ruta que el hardware. Faltaba una forma de operar el show desde teléfonos, con una parrilla de botones diseñada para cada canción y sin depender de un controlador físico.

MechaKatz VS Bake-Neko! resuelve un problema parecido (`mecha_remote_hub.js`, `mobile-controller.html`): hub local, un slot por dispositivo, reconexión por identidad del teléfono y QR en una página de cabina. Ese proyecto no se modificó; sólo se tomaron los patrones.

Un requisito operativo cambia el diseño respecto a MechaKatz: el show puede correr sobre una red Wi-Fi creada por la propia computadora, donde **no hay internet**. MechaKatz pide sus QR a `api.qrserver.com`; aquí eso no funcionaría.

## Decisión

- **El control viaja como MIDI.** Los botones del mando envían `{type:'midi', data:[status,num,vel]}` por el relay existente. La aplicación no necesita lógica nueva de disparo: todo lo mapeable con MIDI queda disparable desde el teléfono y el `MAP` (MIDI learn) aprende de un botón del celular igual que de un controlador.
- **El relay gana roles y slots, sin romper lo anterior.** `join` acepta `rol` (`app`, `mando`, `emisor`), `slot` 1-4 y `disp`. El rol por defecto es `emisor`, así que el emisor MIDI y cualquier cliente previo siguen funcionando sin cambios. Un mismo `disp` recupera su slot al recargar; un dispositivo distinto sobre un slot ocupado recibe `slot-ocupado`.
- **El layout vive en el relay**, no en cada teléfono: `data/mando-layout.json`, saneado en el servidor, repartido por WebSocket a toda la sala y expuesto también por `GET/POST /api/mando-layout`. Se edita desde cualquier dispositivo y todos ven lo mismo.
- **La aplicación aporta sólo dos cosas nuevas**: el inventario de clips, efectos y bancos con su MIDI (para nombrar y sugerir etiquetas) y los eventos `clip-inicio` / `clip-fin`. Ambos son aditivos.
- **El fin de clip se detecta en `updateActiveLbl()`**, comparando el clip activo de cada pista contra el anterior. Es el único punto por el que pasan `trigClip`, `deactivateClip` y `chainClip`, así que no hay ruta de finalización que se escape y no hubo que tocar la lógica de reproducción.
- **Los QR se generan en local** con `src/midivj-qr.js` (modo byte, versiones 1-10, niveles L/M/Q/H), tanto en el navegador como en Node. Sin dependencias nuevas y sin internet.
- **La red creada por la computadora es un caso de primera clase**: el relay enumera todas las IPv4 y coloca primero las de hotspot (`192.168.137.x` o adaptador virtual), y detecta por `netsh` el SSID y la clave de `hostednetwork`, con la red conectada como alternativa y un campo manual para el punto de acceso móvil de Windows 11, que no publica su clave.

## Complemento del 2026-08-20: arranque sin pasos manuales

La primera versión dejaba tres puntos donde la cadena se rompía en uso real. Se corrigieron así:

- **Un puerto ocupado tumbaba el proceso.** `ws` reenvía los errores del servidor HTTP a la instancia `WebSocketServer`; sin manejador ahí, `EADDRINUSE` terminaba en un volcado de Node en vez del aviso preparado. Ahora `wss` escucha sus errores y el relay prueba puertos consecutivos (9191 → 9200) hasta encontrar uno libre.
- **La aplicación apuntaba a un puerto fijo.** Si el relay se movía de puerto, el campo `NET` seguía en el anterior y los mandos no llegaban. Ahora, cuando la página la sirvió el relay, la aplicación deduce la dirección de su propio origen y se conecta al cargar; también reintenta sola si la conexión se cae, salvo que el usuario haya pulsado `DESCONECTAR`.
- **El relay no abría nada.** Ahora abre el navegador en la dirección real al arrancar (`--sin-navegador` lo evita), así que el operador sólo ejecuta el `.bat`.

- **El relay no existía en la interfaz.** Estaba resuelto por debajo, pero no había dónde iniciarlo ni configurarlo: sólo un texto en la barra de estado. Se agregó el panel `📡 RELAY` en el encabezado, que muestra el estado, el comando para iniciarlo (una página no puede arrancar un proceso: eso queda explícito en vez de implícito), un buscador de relay en los puertos 9191-9200, la configuración de dirección y sala, y el acceso a los QR. Se abre solo si a los 2.5 s no hay relay.

- **Los botones no se podían aprender con MAP.** Un botón recién creado no llevaba mensaje (`accion.tipo:'nada'`), así que al tocarlo no salía nada por la red y el MIDI LEARN de MIDIVJ no tenía qué escuchar: el mapeo, que era el punto de todo el diseño, quedaba bloqueado detrás de teclear números a mano. Ahora cada botón nace con un par tipo+número libre —ni repetido entre botones ni usado por un clip, efecto o banco del inventario—, los layouts viejos se completan al abrirlos, y un modo **🎯 MAPEAR** hace que tocar un botón sólo emita su mensaje, sin navegar ni encenderse. La bandera `tocado` marca los botones configurados a mano para no reasignarles nada.

Además, la detección de red pasó a cubrir el **punto de acceso móvil de Windows 10/11**, que `netsh wlan show hostednetwork` no ve. Se consulta `NetworkOperatorTetheringManager` por WinRT desde PowerShell (`-EncodedCommand`, ~250 ms, con caché de 8 s): devuelve SSID, contraseña y si está encendido, incluso apagado, así que el QR queda listo antes de encender la red. Es una lectura; el relay no modifica configuración de red en ningún caso.

## Alternativas descartadas

- **Un hub aparte tipo MechaKatz.** Habría duplicado servidor, puerto y firewall. El relay ya existía y ya hablaba MIDI por salas.
- **Un protocolo de control propio (acciones con nombre en vez de MIDI).** Habría obligado a mantener en dos lados la tabla de qué dispara qué, y habría dejado fuera el MIDI learn.
- **Layout guardado en cada teléfono.** Cuatro dispositivos con parrillas distintas y sin forma de diseñar en pantalla grande.
- **QR desde un servicio web.** No funciona en la red sin internet que este proyecto necesita soportar.

## Consecuencias

- El relay pasa de reenviar mensajes a mantener estado por sala (app, slots, inventario, layout). Sigue siendo un proceso único, de red local y sin base de datos.
- `data/` queda fuera de Git: el layout puede llevar imágenes y GIF embebidos en base64. Respaldarlo es copiar el archivo.
- La detección de Wi-Fi depende de `netsh`, así que sólo aplica en Windows; en otros sistemas queda el campo manual.
- El relay no autentica: cualquiera que alcance el puerto puede disparar visuales. Es aceptable en LAN o en la red del show, y queda anotado en el README; exponerlo a internet requeriría una decisión nueva.
- No se validó con hardware ni teléfonos reales: las pruebas fueron el `smoke test` del protocolo y el recorrido en navegador. Falta una prueba de función con dispositivos autorizados.
