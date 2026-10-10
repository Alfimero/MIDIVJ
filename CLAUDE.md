<!-- project-manager:context:start revision="4" hash="586007ff8bb07825d7e6fbab8ed1720413d6556c96e1dfa5bfe012dfb2fc6b60" -->
## Contexto compartido

Herramienta local de visuales en vivo controlada por MIDI.

### Propósito
Para VJs que desean controlar visualmente sus presentaciones mediante MIDI.

### Stack
- JavaScript
- Node.js
- ws

### Comandos
- node src/midivj-relay.js
- node --check src/midivj-relay.js

### Estado
active

### Decisiones
- 2026-10-10: las sesiones `.vjp` son sesiones personales de shows y deben quedar fuera del repo (`*.vjp` en `.gitignore`).
- 2026-10-10: flujo de trabajo. Claude sube sus cambios a la rama `claude/wizardly-goldberg-1s1ejj`; el usuario los fusiona en `main` (PR en GitHub) y actualiza su copia local con `git switch main` + `git pull origin main`. El usuario usa cmd (Símbolo del sistema de Windows), no PowerShell: dar comandos compatibles con cmd.
- 2026-10-10: el usuario cuestionó el gasto de tokens de las revisiones con varios agentes (modo "ultracode" activo en la sesión). Regla: NO lanzar flujos de agentes (Workflow) sin preguntar antes al usuario y decirle el costo aproximado; por defecto, probar con las baterías propias de Playwright. El usuario pidió detener la ronda de cierre (detenida).
- 2026-10-10: timeline. Los videos se mueven arrastrando su bloque (1 video principal por pista, sin "varios videos por pista" por ahora). Los videos de pistas distintas PUEDEN coincidir en el tiempo (son capas); el imán y ⇥ SECUENCIA sirven para ponerlos seguidos.

### Pendientes
- PR #5 (trackviewer, fuente atorada, offset + arreglos de la revisión) fusionado en `main` (`36d04bd`).
- 2026-10-10: la PC del usuario quedó actualizada a `13ac9b1` (PR #6) con `git stash` + `git pull origin main`; el diff de AGENTS.md/CLAUDE.md salió vacío (sólo saltos de línea), así que `git stash drop` es seguro. Pendiente: que pruebe en su equipo (trackviewer, ✕/⇄, arrastre con imán, SECUENCIA, GALERÍA/NAVEGADOR) y sobre todo PANTALLA/CAPTURA y su MIDI. Opcional: borrar su rama local `feat/capas-y-fuentes` (`git branch -d`). Las notas de contexto de la rama (sólo docs) entran con el próximo PR.
- 2026-10-10, PR #6 (https://github.com/Alfimero/MIDIVJ/pull/6, BORRADOR hasta terminar la verificación): videos arrastrables en el timeline (sin Shift, umbral 4 px, imán a bordes de otras pistas/0/cursor, Ctrl = libre, auto-desplazamiento en los bordes sin tope, eje = scrub), ⇥ SECUENCIA con ↶, y 7 arreglos de la segunda verificación del PR #5.
  - Revisión con agentes del PR #6: 10 problemas confirmados (franja del borde que disparaba el video, mouseup perdido, zoom cambiado al soltar, Alt sobre clip de MEDIOS, ↶ tras abrir sesión y tras ◂ ▸, error del buffer que descargaba la pista, clips de MEDIOS con out viejo, _srcFile, precarga con archivo cambiado) → arreglados en `fbe1430`. Pruebas: test4 22/22, test5 14/14, baterías antiguas OK.
  - Verificación de `fbe1430`: los 10 arreglos confirmados; 7 casos borde nuevos (zoom con Ctrl+rueda durante el arrastre, franja del borde con un solo movimiento, RESET y ↶, ↶ sobre pistas no movidas, MEDIOS reemplazado mientras suena, PING con out > archivo, ⇄ con el archivo que ya suena) → arreglados en `8b882d1`. Pruebas: test4 22/22, test5 14/14, test6 9/9, antiguas OK.
  - Verificación de `8b882d1`: los 7 confirmados; 10 casos nuevos. 4 venían de modificar en caliente la entrada de MEDIOS al elegir un archivo con el mismo nombre → REDISEÑO en `571f035`: la entrada no se toca (como en main) y la fila '➕ "X" elegido · ⇄ USAR COMO FUENTE' carga el archivo recién elegido. Los otros 6 (zoom normalizado tras auto-alargar, acercar nunca aleja, franja según punto de pulsación, ↶ sólo de lo que cambió y no-op sin pisar ↶, recorte de out al promover el buffer, prebuffer del loop que deja _plBufKey viejo) arreglados en `571f035`. Pruebas: test4 22/22, test5 15/15, test6 14/14, antiguas OK.
  - Verificación de `571f035`: los 10 confirmados; 3 casos nuevos de severidad baja (coma flotante en el no-op de SECUENCIA, homónimo que compartía clave con la entrada de MEDIOS, tooltip de la ✕) → arreglados en `2f96aa8` (test7 5/5; test4/5/6 y antiguas OK).
  - Verificación de `2f96aa8`: los 3 confirmados; 3 casos de severidad baja (cadena de SECUENCIA con ruido de coma flotante, homónimo por otras vías: dzone/loadT1, RESET, entrada quitada) → `9a707c5`: syncSrcKey() calcula la clave de la fuente en un solo lugar; SECUENCIA sigue desde la posición real. Pruebas: test7 8/8, test4 22/22, test5 15/15, test6 14/14, antiguas OK.
  - Ronda de cierre de `9a707c5`: detenida a pedido del usuario. PR #6 FUSIONADO en `main` (`13ac9b1`).
- 2026-10-10: en la laptop del usuario el mando y las cámaras dan ERR_CONNECTION_TIMED_OUT en el teléfono (en dos redes distintas); el QR de Wi-Fi sí funciona. Verificado aquí: relay/mando/cámara/QR no cambiaron desde `360a00d`; con el código de `main` la cadena mando → relay → app funciona de punta a punta (Playwright: el pad llega como C-1) y /camara responde por HTTPS. Diagnóstico probable: firewall de Windows (red marcada Pública o regla de bloqueo para node.exe). Arreglo en `/control`: la regla sugerida ahora abre también el puerto HTTPS de la cámara (9191,10191). Diagnóstico con la salida del usuario: perfiles privado y público activos a la vez, ambos BlockInbound; la regla "Node.js JavaScript Runtime" que permite C:\program files\nodejs\node.exe sólo vale en perfil Público (no hay permiso en Privado → timeout en redes privadas). Las reglas de Bloquear son del node.exe de Ableton Live (Max for Live), no del relay: no tocarlas. Solución dada (cmd admin): `netsh advfirewall firewall add rule name="MIDIVJ 9191,10191" dir=in action=allow protocol=TCP localport=9191,10191 profile=private`, confirmar `where node` y que la Wi-Fi esté en perfil Privado. `where node` = C:\Program Files\nodejs\node.exe (correcto). El usuario creó la regla con `sudo` (sin salida visible: en Windows 11 sudo puede abrir otra ventana); verificada: la regla existe (Privada, TCP 9191,10191, Permitir; puede haber un duplicado inofensivo por repetir el sudo). Con la regla creada el mando SIGUE sin funcionar. Resultados: la URL del QR SÍ carga en la propia laptop; con el firewall apagado TAMPOCO funciona → no es el firewall. El usuario instaló una VPN en la laptop y en el teléfono: causa más probable (la VPN del teléfono bloquea la LAN; la de la laptop agrega un adaptador, lo que explica los dos perfiles activos, y puede hacer que el QR use la IP de la VPN). Pedido: volver a encender el firewall; probar con ambas VPN apagadas y el relay reiniciado; si funciona, activar "acceso a la red local"/tunelización dividida en cada VPN y elegir en /control la IP de la Wi-Fi. PR #7 abierto (regla con el puerto de la cámara).
- No probado: selector real de PANTALLA/CAPTURA, Windows, hardware MIDI.
- El caso "offset en 0 no reproduce todo el video" no se reprodujo; si persiste con la versión nueva, pedir pasos exactos.
- Pendiente de decisión del usuario: si se sacan del repo las 3 sesiones ya publicadas (`Bk-Nk!*.vjp`) con `git rm --cached` desde su PC. Si se quitan, ajustar las referencias en `AGENTS.md`, `PROJECT.md`, `PROJECT_CONTEXT.md` y `docs/operations/graphify-validation.md`.
- Actualizar `PROJECT_CONTEXT.md` (fuentes GALERÍA/NAVEGADOR, CAPAS, procesador de video, trackviewer y arrastre de videos), que hoy no las menciona.

### Repositorio
- GitHub: https://github.com/Alfimero/MIDIVJ
- Visibilidad: public
- Rama predeterminada: main
<!-- project-manager:context:end -->
