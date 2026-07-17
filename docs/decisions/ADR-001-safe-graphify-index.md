# ADR-001: Índice AST derivado y exclusión de medios

- Estado: aceptada para el piloto
- Fecha: 2026-07-14

## Contexto

Graphify 0.9.16 clasifica HTML como documento en `--code-only`. La lógica principal de MIDIVJ está dentro de un script embebido en un HTML de 170 KB. El directorio de videos eleva el proyecto a aproximadamente 3.4 GB.

## Decisión

Generar de forma reproducible `graphify-src/*.inline.js` desde los bloques `<script>` y ejecutar Graphify en modo AST local. Excluir videos, medios, configuraciones de agentes, secretos, copias históricas y `graphify-out/`.

## Consecuencias

El grafo representa las funciones y llamadas sin enviar código a un modelo remoto. Las líneas del derivado no son una referencia exacta al HTML, por lo que deben confirmarse en la fuente. La generación semántica y los hooks quedan desactivados durante la evaluación.

