# Arquitectura verificada

## Frontera del sistema

MIDIVJ es una aplicación local de navegador con un servidor HTTP Node mínimo. El mismo proceso sirve las interfaces, guarda sesiones únicamente en `Sessions/` y mantiene el relay WebSocket por salas. No existe una base de datos de servidor.

## Componentes

1. `src/Midivj ZYX.html` contiene interfaz, estado `S`, biblioteca `MEDIA`, ocho pistas, efectos, renderizado, persistencia, MIDI y salida secundaria.
2. `src/midivj-sender.html` toma eventos de Web MIDI y los convierte en mensajes WebSocket.
3. `src/midivj-relay.js` sirve las interfaces, acepta `POST /api/sessions` sólo desde loopback y procesa `join`/`midi` por WebSocket.
4. Los `.vjp` de `Sessions/` guardan sesiones en formatos 5 y 6; los videos de `videos/Visuales 2026/` siguen siendo recursos externos elegidos por el operador.
5. IndexedDB `midivj-rev` conserva caché derivada para reversa; no es la fuente de los medios.

## Flujo principal

```text
MIDI local ───────────────────────────────┐
                                         v
Emisor Web MIDI -> relay por sala -> netConnect -> onMIDIMsg -> S -> loop
                                                                    |
archivo/captura -> videos de pista -------------------------------> canvas
                                                                    |
                                                         ventana de salida
```

## Autoridad

El flujo se derivó del código ejecutable. `graphify-src/` conserva una copia analizable de los scripts embebidos, pero cualquier línea debe confirmarse en `src/Midivj ZYX.html`.
