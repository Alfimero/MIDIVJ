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
- —

### Pendientes
- Sincronía local vs GitHub (verificado 2026-10-10 con la salida de git del usuario): la PC del usuario está en `360a00d`, igual que `origin/main` (0 commits de diferencia), pero tiene cambios SIN commit desde el día 14: modificados `AGENTS.md`, `CLAUDE.md`, `README.md`, `src/Midivj ZYX.html`; nuevos sin seguimiento `Sessions/CDMX.vjp`, `Sessions/STREAM.vjp`, `Sessions/Zimapán.vjp`, `Sessions/untitled.vjp`. Pendiente: revisar `git diff` y que el usuario haga commit/push a `main`.
- Riesgo de conflicto: la rama `claude/wizardly-goldberg-1s1ejj` también modifica esta sección de `CLAUDE.md`/`AGENTS.md`. Tras el push del usuario, rehacer esa rama sobre el nuevo `main`.
- Repo público: antes de subir sesiones `.vjp`, comprobar que no contengan rutas absolutas personales (las 3 sesiones ya publicadas usan rutas relativas).

### Repositorio
- GitHub: https://github.com/Alfimero/MIDIVJ
- Visibilidad: public
- Rama predeterminada: main
<!-- project-manager:context:end -->
