# Operación de Graphify

## Requisitos

- PowerShell 5.1 o posterior.
- `uv` accesible en `PATH`.
- `graphifyy==0.9.16` instalado como herramienta de `uv`.
- Node.js para las comprobaciones de sintaxis.

## Generación limpia

Elimina sólo el directorio derivado `graphify-out/` después de verificar su ruta y ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-Graphify.ps1 -CodeOnly
```

El script regenera primero `graphify-src/` con los scripts embebidos y una copia del relay. Después ejecuta una extracción limpia de ese corpus y escribe `graphify-out/` en la raíz. No edites esos archivos manualmente.

## Validación

```powershell
node --check .\src\midivj-relay.js
node --check .\graphify-src\Midivj-ZYX.inline.js
node --check .\graphify-src\midivj-sender.inline.js
powershell -ExecutionPolicy Bypass -File ..\..\project-atlas\scripts\Test-GraphifyArtifacts.ps1 -ProjectPath .
```

## Consulta

```powershell
$graphify = Join-Path (& uv tool dir --bin) graphify.exe
& $graphify query onMIDIMsg --graph .\graphify-out\graph.json
& $graphify affected onMIDIMsg --graph .\graphify-out\graph.json
```

## Recuperación

Si el grafo queda incompleto, conserva las fuentes, elimina únicamente `graphify-out/`, vuelve a generar y ejecuta la revisión de seguridad antes de usarlo. Reinstalación fijada:

```powershell
uv tool install "graphifyy[pdf,office,sql,mcp,ollama]==0.9.16" --force
```
