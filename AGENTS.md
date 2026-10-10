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
