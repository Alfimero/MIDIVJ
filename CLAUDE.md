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
- 2026-10-10: timeline. Los videos se mueven arrastrando su bloque (1 video principal por pista, sin "varios videos por pista" por ahora). Los videos de pistas distintas PUEDEN coincidir en el tiempo (son capas); el imán y ⇥ SECUENCIA sirven para ponerlos seguidos.

### Pendientes
- PR #5 (trackviewer, fuente atorada, offset + arreglos de la revisión) fusionado en `main` (`36d04bd`).
- La PC del usuario ejecuta una versión vieja: la captura del 2026-10-10 coincide con `360a00d` (sección PLAYLIST, sin GALERÍA/NAVEGADOR, tooltip viejo del OFFSET). Debe hacer `git switch main` + `git pull origin main` (si el pull se queja de `AGENTS.md`/`CLAUDE.md`: `git restore AGENTS.md CLAUDE.md`) y recargar con Ctrl+F5. Confirmar con `git log --oneline -1`.
- 2026-10-10, PR nuevo desde `claude/wizardly-goldberg-1s1ejj` (borrador hasta terminar la revisión con agentes): videos arrastrables en el timeline (sin Shift, umbral 4 px, imán a bordes de otras pistas/0/cursor, Ctrl = libre, auto-desplazamiento en los bordes sin tope, eje = scrub), ⇥ SECUENCIA con ↶, y 7 arreglos de la segunda verificación (manija, ⇄ con mismo nombre, ⇄ sin alert, imagen/video dañados, cursor fuera de rango, imagen con interruptor de capa). Pruebas: 22/22 en Chromium headless + baterías anteriores.
- No probado: selector real de PANTALLA/CAPTURA, Windows, hardware MIDI.
- El caso "offset en 0 no reproduce todo el video" no se reprodujo; si persiste con la versión nueva, pedir pasos exactos.
- Pendiente de decisión del usuario: si se sacan del repo las 3 sesiones ya publicadas (`Bk-Nk!*.vjp`) con `git rm --cached` desde su PC. Si se quitan, ajustar las referencias en `AGENTS.md`, `PROJECT.md`, `PROJECT_CONTEXT.md` y `docs/operations/graphify-validation.md`.
- Actualizar `PROJECT_CONTEXT.md` (fuentes GALERÍA/NAVEGADOR, CAPAS, procesador de video, trackviewer y arrastre de videos), que hoy no las menciona.

### Repositorio
- GitHub: https://github.com/Alfimero/MIDIVJ
- Visibilidad: public
- Rama predeterminada: main
<!-- project-manager:context:end -->
