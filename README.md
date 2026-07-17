# MIDIVJ

Aplicación local de visuales en vivo controlada por MIDI. El runtime vive en `src/`, las sesiones `.vjp` en `Sessions/` y los medios locales en `videos/Visuales 2026/`.

## Ejecutar

En Windows, inicia `src/INICIAR_RELAY.bat`. El launcher usa la raíz real del proyecto, instala la versión fijada de `ws` si falta y muestra estas direcciones:

- Aplicación principal: `http://localhost:9191/`
- Emisor MIDI: `http://localhost:9191/sender`

También puedes ejecutar el relay manualmente desde la raíz:

```powershell
node .\src\midivj-relay.js
```

El botón **GUARDAR** envía la sesión al relay local. El servidor valida el nombre y crea un archivo nuevo dentro de `Sessions/`; nunca guarda sesiones en Descargas ni sobrescribe una existente. Los videos permanecen fuera de Git mediante `.gitignore`.

## Graphify

Graphify 0.9.16 se usa como índice técnico local. Como la lógica principal está embebida en HTML y el modo `--code-only` no analiza HTML como código, el flujo genera copias JavaScript en `graphify-src/` antes de construir el grafo.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-Graphify.ps1 -CodeOnly
```

Consulta `PROJECT.md`, `AGENTS.md` y `docs/operations/graphify.md`. No publiques `graphify-out/`; sus relaciones inferidas no son hechos confirmados.
