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

### Pendientes
- Sincronía local vs GitHub (verificado 2026-10-10 con la salida de git del usuario): la PC del usuario está en `360a00d`, igual que `origin/main`, con cambios SIN commit desde el día 14:
  - `src/Midivj ZYX.html`: ~1,780 líneas cambiadas (código aún no revisado por Claude).
  - `README.md`: +21/−1; documenta fuentes VIDEO multi-archivo, GALERÍA, NAVEGADOR, CÁMARA, ⚡ GENERAR CLIPS (reemplaza PLAYLIST), 🧅 CAPAS por pista, TRANSFORM DE PISTA, CONFIG. DE CÁMARA, PROCESADOR DE VIDEO y reset con doble clic.
  - `AGENTS.md` / `CLAUDE.md`: sin cambios de contenido (solo aviso LF/CRLF); no hace falta subirlos y no hay riesgo de conflicto.
  - Sesiones nuevas sin seguimiento (`CDMX.vjp`, `STREAM.vjp`, `Zimapán.vjp`, `untitled.vjp`): NO se suben.
- Plan acordado (2026-10-10): el usuario crea `feat/capas-y-fuentes` en su PC, agrega `*.vjp` a `.gitignore` y sube `.gitignore`, `README.md` y `src/Midivj ZYX.html`. Después Claude descarga la rama, revisa el HTML y valida la sintaxis del script inline antes de fusionar a `main`. Estado: el usuario recibió los 5 pasos (status, rama, .gitignore, commit, push) y está por ejecutarlos; falta confirmar el push.
- Pendiente de decisión del usuario (puede ir en un commit aparte, después): si se sacan del repo las 3 sesiones ya publicadas (`Bk-Nk!*.vjp`) con `git rm --cached` desde su PC. Si se quitan, ajustar las referencias en `AGENTS.md`, `PROJECT.md`, `PROJECT_CONTEXT.md` y `docs/operations/graphify-validation.md`.
- Tras fusionar: actualizar `PROJECT_CONTEXT.md` (fuentes de pista, capas, procesador de video), que hoy no las menciona.

### Repositorio
- GitHub: https://github.com/Alfimero/MIDIVJ
- Visibilidad: public
- Rama predeterminada: main
<!-- project-manager:context:end -->
