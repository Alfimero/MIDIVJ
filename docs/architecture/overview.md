# Arquitectura verificada

## Frontera del sistema

MIDIVJ es una aplicación local de navegador con un servidor HTTP Node mínimo. El mismo proceso sirve las interfaces, guarda sesiones únicamente en `Sessions/` y mantiene el relay WebSocket por salas. No existe una base de datos de servidor.

## Componentes

1. `src/Midivj ZYX.html` contiene interfaz, estado `S`, biblioteca `MEDIA`, ocho pistas, efectos, renderizado, persistencia, MIDI y salida secundaria. Además publica al relay su inventario de clips, efectos y bancos y los eventos `clip-inicio` / `clip-fin`.
2. `src/midivj-sender.html` toma eventos de Web MIDI y los convierte en mensajes WebSocket.
3. `src/midivj-relay.js` sirve las interfaces, acepta `POST /api/sessions` sólo desde loopback, procesa `join`/`midi` por WebSocket y administra roles (`app`, `mando`, `emisor`), cuatro slots de mando, el layout compartido y la información de red.
4. `src/midivj-mando.html` es el mando móvil: cuadrícula n×m editable, grupos, imágenes o GIF, submenús por clip y envío de MIDI.
5. `src/midivj-control.html` es la página de cabina: QR de Wi-Fi y de cada mando, direcciones disponibles y presencia en vivo.
6. `src/midivj-qr.js` genera los códigos QR en local, sin red; corre igual en Node y en el navegador.
7. Los `.vjp` de `Sessions/` guardan sesiones en formatos 5 y 6; los videos de `videos/Visuales 2026/` siguen siendo recursos externos elegidos por el operador.
8. `data/mando-layout.json` guarda el layout del mando. Es configuración local: queda fuera de Git.
9. IndexedDB `midivj-rev` conserva caché derivada para reversa; no es la fuente de los medios.

## Flujo principal

```text
MIDI local ───────────────────────────────┐
                                         v
Emisor Web MIDI -> relay por sala -> netConnect -> onMIDIMsg -> S -> loop
Mando móvil ────┘                                                   |
                                                                    |
archivo/captura -> videos de pista -------------------------------> canvas
                                                                    |
                                                         ventana de salida
```

El mando entra por la misma puerta que el hardware: sus botones envían MIDI y el relay lo reenvía a la sala. En sentido inverso viaja sólo información: `updateActiveLbl()` compara el clip activo de cada pista con el anterior y emite `clip-fin`, que es lo que hace volver al mando desde el submenú de efectos.

## Autoridad

El flujo se derivó del código ejecutable. `graphify-src/` conserva una copia analizable de los scripts embebidos, pero cualquier línea debe confirmarse en `src/Midivj ZYX.html`.
