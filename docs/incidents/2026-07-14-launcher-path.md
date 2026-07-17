# Conflicto: ruta obsoleta en el launcher

- Fecha de detección: 2026-07-14
- Estado: resuelto el 2026-07-16

`INICIAR_RELAY.bat` cambia a `C:\Users\soach\Desktop\MIDIVJ`, pero la carpeta inspeccionada está en `C:\Users\soach\Desktop\Main\projects\MIDIVJ`.

Autoridad aplicada: la ruta existente comprobada tiene prioridad sobre el comentario o launcher histórico. No se borró ni reescribió el archivo porque corregir la operación del relay requiere decidir si se conserva la ubicación actual y crear un manifiesto reproducible para `ws`.

Impacto: el launcher no encuentra `midivj-relay.js` en este entorno. Recuperación temporal desde la carpeta correcta: `node .\midivj-relay.js`, siempre que `ws` esté instalado localmente.

## Resolución

El runtime se movió a `src/` y `src/INICIAR_RELAY.bat` ahora calcula la raíz mediante `%~dp0..`, sin rutas absolutas. El comando manual vigente es `node .\src\midivj-relay.js`.
