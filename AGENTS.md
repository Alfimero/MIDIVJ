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
```

Una prueba de sintaxis no demuestra reproducción, MIDI, captura ni salida secundaria. Esas funciones requieren validación manual con navegador y hardware autorizados. Si cambias persistencia, prueba una sesión nueva y una copia de una `.vjp` existente; nunca sobrescribas el original.

## Decisiones y conflictos

Registra decisiones en `docs/decisions/` e incidentes en `docs/incidents/`. Ante contradicción usa, salvo evidencia específica: comportamiento comprobado > código ejecutable > pruebas > configuración activa > documentación reciente > README > notas históricas > inferencias del grafo. Conserva la fuente antigua y marca el conflicto.

## Aprobación humana

Solicita aprobación antes de conectar o controlar hardware real, ejecutar una actuación pública, instalar dependencias globales, publicar un grafo, exponer WebSocket a Internet, cambiar sesiones originales, usar credenciales o realizar una operación irreversible.

<!-- project-manager:context:start revision="3" hash="01ea2d37aa075c5c4f56073f177abcd6a00bf2760c6d3b0d3ed28144e1a9ccf5" -->
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
- —

### Repositorio
- GitHub: https://github.com/Alfimero/MIDIVJ
- Visibilidad: private
- Rama predeterminada: main
<!-- project-manager:context:end -->
