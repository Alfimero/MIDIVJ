# Instrucciones para agentes

Lee primero `PROJECT.md`, `PROJECT_CONTEXT.md`, `docs/architecture/overview.md` y el ADR activo. Para preguntas de arquitectura o impacto, consulta `graphify-out/graph.json` antes de recorrer todo el proyecto y confirma cada conclusión en los archivos fuente citados.

## Fuentes de verdad

- Git, cuando exista un repositorio válido, es la fuente oficial del código. Esta carpeta contiene `.git`, pero Git no la reconoce como repositorio válido al 2026-07-14.
- `src/Midivj ZYX.html` es la fuente ejecutable de la aplicación principal.
- Los `.vjp` de `Sessions/` son la fuente de las sesiones guardadas.
- Los medios originales son la fuente audiovisual y no deben indexarse.
- `graphify-src/` y `graphify-out/` son derivados locales; nunca sustituyen las fuentes.

## Graphify

Regenera desde PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-Graphify.ps1 -CodeOnly
```

Las relaciones `EXTRACTED` provienen del análisis sintáctico. Las relaciones `INFERRED` requieren confirmación en el código. No unas entidades por similitud nominal y no atribuyas integración con Ableton u OBS sin una fuente verificable.

## Límites de modificación

No modifiques `videos/Visuales 2026/`, `Sessions/*.vjp`, copias `*.backup*.html`, `.claude/`, `.codex/`, `.agents/`, medios ni archivos privados salvo solicitud explícita. No edites `graphify-src/` a mano: se regenera desde los HTML.

## Secretos y privacidad

Trata `.env*`, claves, certificados, cookies, sesiones, tokens, configuraciones privadas, rutas de usuario y datos personales como secretos. No los copies al grafo, reportes, commits o mensajes. Detén la distribución del artefacto si la revisión de seguridad falla.

## Pruebas y validación

Después de cambiar JavaScript, ejecuta:

```powershell
node --check .\src\midivj-relay.js
powershell -ExecutionPolicy Bypass -File .\scripts\Export-InlineScripts.ps1
node --check .\graphify-src\Midivj-ZYX.inline.js
node --check .\graphify-src\midivj-sender.inline.js
node --check .\src\modules\midivj-module.js
node --check .\src\modules\audio\midivj-audio-engine.js
node --check .\src\modules\audio\midivj-audio-ui.js
node --check .\src\modules\audio\midivj-audio-worklet.js
```

Los archivos de `src/modules/` se editan a mano (no salen de `graphify-src/`) y deben estar en la lista blanca `MODULOS` de `src/midivj-relay.js` para que el navegador pueda cargarlos.

Una prueba de sintaxis no demuestra reproducción, MIDI, captura ni salida secundaria. Esas funciones requieren validación manual con navegador y hardware autorizados. Si cambias persistencia, prueba una sesión nueva y una copia de una `.vjp` existente; nunca sobrescribas el original.

## Decisiones y conflictos

Registra decisiones en `docs/decisions/` e incidentes en `docs/incidents/`. Ante contradicción usa, salvo evidencia específica: comportamiento comprobado > código ejecutable > pruebas > configuración activa > documentación reciente > README > notas históricas > inferencias del grafo. Conserva la fuente antigua y marca el conflicto.

## Aprobación humana

Solicita aprobación antes de conectar o controlar hardware real, ejecutar una actuación pública, instalar dependencias globales, publicar un grafo, exponer WebSocket a Internet, cambiar sesiones originales, usar credenciales o realizar una operación irreversible.

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
- 2026-10-13: instalación y actualización desde GitHub. El usuario instala con `git clone https://github.com/Alfimero/MIDIVJ.git` (fuera de Program Files) y actualiza con `git pull origin main`; videos, sesiones y `data/` se mueven a mano (las sesiones viejas no hacen falta). Todo cambio debe funcionar tras un `git pull` simple: los launchers instalan solos las dependencias nuevas o cambiadas.

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
- 2026-10-10: en la laptop del usuario el mando y las cámaras dan ERR_CONNECTION_TIMED_OUT en el teléfono (en dos redes distintas); el QR de Wi-Fi sí funciona. Verificado aquí: relay/mando/cámara/QR no cambiaron desde `360a00d`; con el código de `main` la cadena mando → relay → app funciona de punta a punta (Playwright: el pad llega como C-1) y /camara responde por HTTPS. Diagnóstico probable: firewall de Windows (red marcada Pública o regla de bloqueo para node.exe). Arreglo en `/control`: la regla sugerida ahora abre también el puerto HTTPS de la cámara (9191,10191). Diagnóstico con la salida del usuario: perfiles privado y público activos a la vez, ambos BlockInbound; la regla "Node.js JavaScript Runtime" que permite C:\program files\nodejs\node.exe sólo vale en perfil Público (no hay permiso en Privado → timeout en redes privadas). Las reglas de Bloquear son del node.exe de Ableton Live (Max for Live), no del relay: no tocarlas. Solución dada (cmd admin): `netsh advfirewall firewall add rule name="MIDIVJ 9191,10191" dir=in action=allow protocol=TCP localport=9191,10191 profile=private`, confirmar `where node` y que la Wi-Fi esté en perfil Privado. `where node` = C:\Program Files\nodejs\node.exe (correcto). El usuario creó la regla con `sudo` (sin salida visible: en Windows 11 sudo puede abrir otra ventana); verificada: la regla existe (Privada, TCP 9191,10191, Permitir; puede haber un duplicado inofensivo por repetir el sudo). Con la regla creada el mando seguía sin funcionar; la URL carga en la laptop y con el firewall apagado tampoco funcionaba. CAUSA encontrada con `ipconfig`: Tailscale (100.82.132.1) aparece antes que la Wi-Fi (10.143.155.202) y /control usaba la primera dirección para los QR. Solución inmediata dada: elegir la Wi-Fi en el selector de /control. Arreglo en el PR #7: el relay ordena hotspot → red local → VPN/virtual (100.64.0.0/10, 169.254/16, nombres de VPN) y las marca. Probado con los adaptadores simulados del usuario; mando → relay → app OK. El usuario apagó la VPN en la laptop y en el teléfono y lo considera resuelto; volvió a encender el firewall (la regla MIDIVJ 9191,10191 privada queda). PR #7 FUSIONADO en `main` (`ac43f61`): puede dejar Tailscale encendido en la laptop; la VPN del teléfono debe permitir la red local o estar apagada.
  - 2026-10-10 (sesión en la laptop del usuario, Windows): volvió a fallar tras cambiar de red. Medido en la laptop: la Wi-Fi es ahora INFINITUM269F_2.4 (192.168.1.194); Tailscale apagado deja su adaptador "Up" con 169.254.83.107 y el relay de `main` lo daba PRIMERO en /api/red → QR a una IP inalcanzable (mando y cámara). Además el certificado de /camara se generó al arrancar (15:57) para 10.143.155.202 y no cubría la IP nueva. El perfil de red NO era la causa (la regla "Node.js JavaScript Runtime" permite node.exe en Público; el usuario igual la pasó a Privada). Arreglo sumado al PR #7: el relay renueva el certificado en caliente (`setSecureContext`) cuando aparece una IP de hotspot/LAN no cubierta (al pedir /api/red y cada 10 s); conserva las IPs de redes anteriores (tope 24) y las de VPN no obligan a regenerar. Probado con adaptadores simulados: orden Wi-Fi → VPN, SAN renovado por /api/red y por el temporizador, sin regenerar al volver a una red conocida, ws/wss abren, /control elige 192.168.1.194.
- 2026-10-13: análisis de instalación sobre `ac43f61`: clon limpio + `npm install` (0 vulnerabilidades), todas las páginas sin errores de consola, guardado de sesiones, HTTPS de /camara y orden Wi-Fi → VPN OK; también arranca con Node 16. Cambio de launchers (último por ahora): `src/midivj-dependencias.js` compara node_modules con package-lock.json y el `.bat`/`.command` instalan si falta algo o cambió una versión (sin internet: si sólo cambió la versión, avisa y arranca; si falta algo, error); el `.bat` avisa si falta Node; `.gitattributes` fija CRLF para `.bat` y LF para `.command`; el `.command` queda ejecutable en git. Probado: 7 casos con el `.bat` y 7 con el `.command`. Pendiente: fusionar ese PR e instalar con `git clone`.
- 2026-10-15: mejoras al mando y a las fuentes (PR en la rama `claude/wizardly-goldberg-1s1ejj`). (1) FILAS/COLS son de cada grupo (`pagina.filas/columnas`; sin ellas, las de la rejilla). (2) Controles continuos en el mando: slider, palanca (vuelve al centro) y pad XY, mandan CC 0-127 (`boton.control`, `accion.midiY` para el eje Y); en MIDIVJ la ventana 🎛 CONTROLES (cabecera de EFECTOS) mapea CC → parámetro (zoom/posición/rotación/opacidad/color por pista, parámetros de efectos con AUTO, TRANSFORM global, fundido a negro) con MÍN/MÁX/⇅; también se elige desde el inspector del mando (campo CONTROLA, mensaje `mapear-param`). Un CC mapeado ya no dispara clips. (3) Transiciones por fuente (sección 🎞 AJUSTE Y TRANSICIÓN de la pista, la usan los clips sin transición propia): primero sale la fuente actual y luego entra la nueva; nuevo tipo `disolver` (fundido de opacidad por pista, encadenado entre cámaras). (4) /camara a pantalla completa (encajar/llenar, tocar oculta controles, muestra resolución). (5) AJUSTE de la fuente: `auto` = la cámara del teléfono mantiene su proporción (vertical queda vertical dentro de la salida 16:9) y ya no cambia el tamaño de la salida. Pruebas Playwright: mando 30/30, transiciones/proporción 24/24, cámara 12/12. No probado en teléfono real ni con hardware MIDI.
- 2026-10-15 (PR #10): modo general **🎯 MAPEO** (botón en la cabecera). Al activarlo se resaltan todos los parámetros mapeables (sliders de efectos, TRANSFORM global y de pista, color/procesador, opacidad de la fuente) y se abren sus paneles; clic en uno = escucha, se mapea moviendo un slider/palanca/pad del mando o una perilla MIDI (una nota avisa que hace falta CC); clic derecho = quitar; ESC cancela y un segundo ESC sale. Fuera del modo no hay botones extra junto a los sliders. Es el mismo `S.ccMaps` de 🎛 CONTROLES (rango e inversión allá). Pruebas Playwright 18/18 con un relay aislado en el scratchpad (no toca `data/` del usuario).
- 2026-10-15 (PR #11): eje Y de palanca/pad/fader. El control manda más alto hacia arriba y "Pos Y" mayor baja la imagen: los parámetros de posición vertical (`arriba:true` en el catálogo: Pos Y de pista y de TRANSFORM global) se recorren al revés en `ccPosicion()`, así arriba en el control = arriba en pantalla (también arregla los mapeos ya hechos, sin re-mapear; ⇅ sigue invirtiendo). El eje X ya estaba bien. Pruebas: ejes 14/14 y las anteriores (30/18/24) OK.
- 2026-10-15 (PR #12): (1) Disparos simultáneos: con varios dedos el navegador tomaba el toque como gesto (zoom/desplazamiento) y mandaba pointercancel: el botón mantenido se soltaba solo y los toques siguientes no llegaban hasta levantar todos los dedos. Arreglo: `touch-action:none` en la rejilla y seguimiento de cada dedo por pointerId a nivel de documento (`dedosBoton`/`dedosCtl`), que además suelta bien aunque la rejilla se redibuje con el dedo encima; al ocultarse la página se suelta todo. Reproducido con toques reales por CDP (falla con el código anterior, pasa con el nuevo). (2) EASING (`boton.easing` 0..1, inercia exponencial, tau = e²·0.6 s) y SENSIBILIDAD (`boton.sensibilidad` 0.25×..4×: slider/pad relativo sin saltos si ≠1×; palanca = curva de respuesta) en el inspector de los controles. (3) ⊞ UNIR CELDAS en la barra de edición: arrastrar o tocar dos esquinas → ✓ UNIR; el botón de la esquina superior izquierda crece y los de adentro quedan guardados debajo; ⊟ SEPARAR en el inspector los devuelve; una selección que corta un botón grande se agranda para incluirlo. Pruebas: multitoque 6/6, unir/easing/sensibilidad 21/21 y todas las anteriores OK (113 en total).
- 2026-10-16 (PR #13): (1) Capas: EXCL ahora va por grupos (`grupoExcl`/`seExcluyen`): un video reemplaza a otro video y una fuente en vivo a otra (sigue el cambio entre cámaras con disolver), pero una cámara encima de un video ya no lo pausa ni el video a la cámara. Por pista, 🎞 AJUSTE Y TRANSICIÓN → EXCL: `auto` / `capa` (se superpone: ni apaga ni la apagan, para dos videos a la vez al 50 %; en el timeline `T2 ⧉`) / `todas` (como antes); `t.excl` se guarda en la sesión (las de antes abren en auto). Las fuentes en vivo ocupan todo el ancho del timeline (bloque rayado `● EN VIVO`, `○ OCULTA` con el interruptor apagado; `vivoVisible`). (2) Configuración de la cámara del teléfono: resolución (480p–4K), FPS, formato (original / 16:9 / 9:16 / 4:3 / 3:4 / 1:1, recortado en el teléfono por canvas), calidad (Mbps máx.) y lente, desde la pista (⚙ CONFIG. DE CÁMARA · 📱) o desde ⚙ en /camara; se aplica en caliente (applyConstraints/replaceTrack, sin renegociar) y el teléfono la guarda en localStorage. Mensajes nuevos `camara-config` (app→teléfono) y `camara-estado` (teléfono→app) en el relay (hay que reiniciarlo). `contentHint='detail'` para que WebRTC no rebaje la resolución elegida. La capturadora local suma FORMATO (aspectRatio exact + resizeMode crop-and-scale). Pruebas Playwright: capas 32/32, cámara del teléfono 40/40, transiciones 24/24, /camara 12/12, mando 30/30, mapeo 18/18, ejes 14/14, unir 21/21 (con relay recién arrancado). test-multitoque falla igual en main (depende del layout del mando). No probado en teléfono real (iOS/Android).
- No probado: selector real de PANTALLA/CAPTURA, Windows, hardware MIDI.
- El caso "offset en 0 no reproduce todo el video" no se reprodujo; si persiste con la versión nueva, pedir pasos exactos.
- Pendiente de decisión del usuario: si se sacan del repo las 3 sesiones ya publicadas (`Bk-Nk!*.vjp`) con `git rm --cached` desde su PC. Si se quitan, ajustar las referencias en `AGENTS.md`, `PROJECT.md`, `PROJECT_CONTEXT.md` y `docs/operations/graphify-validation.md`.
- Actualizar `PROJECT_CONTEXT.md` (fuentes GALERÍA/NAVEGADOR, CAPAS, procesador de video, trackviewer y arrastre de videos), que hoy no las menciona.

### Repositorio
- GitHub: https://github.com/Alfimero/MIDIVJ
- Visibilidad: public
- Rama predeterminada: main
<!-- project-manager:context:end -->
