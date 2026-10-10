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
- Verificar sincronía entre la copia local (PC del usuario) y GitHub. Al 2026-10-10, `origin/main` está en `360a00d` (merge del PR #2, último commit de contenido `c64f357`, 2026-09-13). Falta que el usuario ejecute `git fetch` + `git status` en su PC; desde la sesión en la nube no hay acceso a su equipo.
- El usuario indica (2026-10-10) que probablemente tiene cambios en la carpeta local desde el día 14 (sin confirmar mes; se asume septiembre) que no están en GitHub. Pendiente: que comparta la salida de `git status` y `git diff --stat` para revisarlos antes de hacer commit/push (repo público: revisar que no se suban archivos pesados o privados).

### Repositorio
- GitHub: https://github.com/Alfimero/MIDIVJ
- Visibilidad: public
- Rama predeterminada: main
<!-- project-manager:context:end -->
