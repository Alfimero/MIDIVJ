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

### Pendientes
- Sincronía local vs GitHub: resuelta el 2026-10-10 (PR #3 y #4 en `main`, `080e1db`).
- 2026-10-10, en la rama `claude/wizardly-goldberg-1s1ejj` (falta fusionar a `main` y que el usuario lo pruebe en su PC):
  - Trackviewer: scroll vertical (`#tl-wrap`), manija de alto en el borde superior (doble clic = ver todas las pistas), zoom vertical (`↕−`/`↕+`, Alt+rueda), Shift+rueda = scroll; alto y zoom se recuerdan en localStorage (`midivj-tl-view`).
  - Bug "video atorado": no había botón ✕ para fuentes de archivo; 🎬 VIDEO sobre una pista con video sólo lo agregaba a la lista; al pasar a una fuente en vivo el video viejo seguía sonando y los clips de archivo dejaban la fuente nueva invisible; al abrir una sesión, el clip activo y el video de la sesión anterior seguían mandando. Arreglado con `releaseFileMedia()` y cambios en `stopTrackSource`, `_applyStream`, `onTrackMediaChosen`, `applyProjectData` y `restoreProjectMedia`.
  - Offset: `maxDur()` no sumaba el offset del video (la reproducción se detenía antes del final; reproducido en la versión anterior: con DUR 10 min y offset 590 s se paraba en 600 s con el video en 10/20 s). Ahora usa `contentEnd()`. Slider sin tope fijo de 1 h + campo de texto (`90`, `1:30`, `1:02:03`).
  - Probado con Chromium headless (Playwright) y videos de prueba; no probado: selector real de PANTALLA/CAPTURA, Windows, hardware MIDI.
- Pregunta abierta al usuario: si "agregar más video y colocarlo en cualquier parte sin que se solape" significa varios videos posicionables libremente dentro de UNA misma pista (función nueva en el motor de reproducción, zona de riesgo) o basta con el offset sin límite por pista.
- El caso "offset en el extremo izquierdo (0) no reproduce todo el video" no se reprodujo; si persiste tras el arreglo, pedir pasos exactos.
- Pendiente de decisión del usuario: si se sacan del repo las 3 sesiones ya publicadas (`Bk-Nk!*.vjp`) con `git rm --cached` desde su PC. Si se quitan, ajustar las referencias en `AGENTS.md`, `PROJECT.md`, `PROJECT_CONTEXT.md` y `docs/operations/graphify-validation.md`.
- Actualizar `PROJECT_CONTEXT.md` (fuentes de pista GALERÍA/NAVEGADOR, CAPAS, procesador de video, trackviewer nuevo), que hoy no las menciona.

### Repositorio
- GitHub: https://github.com/Alfimero/MIDIVJ
- Visibilidad: public
- Rama predeterminada: main
<!-- project-manager:context:end -->
