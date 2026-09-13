# Roadmap del módulo de audio

Referencia de arquitectura: `audio-module.md`. Decisión: `decisions/ADR-006-modulo-de-audio.md`.

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 0 | Auditoría de MIDIVJ | ✅ hecha (ver ADR-006 §Diagnóstico) |
| 1 | AudioEngine + enumeración de dispositivos | ✅ |
| 2 | Captura de una entrada física | ✅ código; ⚠️ falta validación con hardware real |
| 3 | Medidores RMS / pico | ✅ |
| 4 | Envolvente + gate | ✅ |
| 5 | Mapeo audio → parámetro visual | ✅ verificado con señal sintética |
| 6 | Audio Bus / routing | 🟡 el concepto de bus existe desde el día uno (fuente → bus → análisis/monitor). Falta: varios buses por fuente con nombre propio en la interfaz, y bus → bus. |
| 7 | NetworkAudioSource | ⬜ diseñado, no construido |
| 8 | Audio desde teléfono | ⬜ |
| 9 | AudioOutput | 🟡 sólo monitor local |
| 10 | Integraciones externas (DMX, Ableton, reloj maestro) | ⬜ |

## Fase 2 bis — validación con hardware (siguiente paso real)

No es código, es la prueba que falta:

1. Conectar la interfaz, abrir MIDIVJ desde el relay, panel **AUDIO** →
   **↻ DISPOSITIVOS** → agregar la interfaz.
2. Anotar en este archivo: cuántos canales expuso realmente, `baseLatency`, y
   si el driver dejó abrirla con un DAW ya corriendo (multi-cliente sí/no).
3. Crear un bus por canal usado, verificar que "Input 1" corresponde al canal
   físico 1 y no al 2.
4. Mapear `env → TRACK 1 · opacidad` y tocar el instrumento.
5. `gate.open → disparar un clip`.

Punto de atención: si la interfaz está tomada en ASIO por otro programa, la
entrada puede aparecer en la lista y entregar silencio. Eso no es un fallo del
módulo — es el modo exclusivo del driver. Anotarlo, no "arreglarlo".

## Fase 6 — buses completos

- Varios buses sobre la misma fuente (ej.: BUS BOMBO con gate en `low`, BUS AIRE
  con envolvente en `high`).
- Bus → bus (suma), para agrupar fuentes antes de analizar.
- Suavizado y `hold` por mapeo, no sólo por bus.

Nada de esto cambia la interfaz pública: `agregarBus` ya toma `sourceId`, y el
grafo se rearma solo al reconfigurar.

## Fase 7 — NetworkAudioSource

Decisión ya tomada (ADR-006, coherente con ADR-004 y ADR-005): **WebRTC/Opus
para el audio, WebSocket sólo para señalización, control y metadata.** Nunca
audio como JSON ni base64.

El motor ya acepta el resultado: `agregarFuente({ type:'stream', stream })`
toma cualquier `MediaStream`, venga de `getUserMedia`, de un `RTCPeerConnection`
o de lo que exista mañana. La fase 7 es, en la práctica:

1. Rol `audio` en el relay, con slots — el mismo patrón que `camara` y `salida`
   ya usan (`reclamarSlot`, gracia de reconexión, señalización unicast).
2. `pc.ontrack` → `agregarFuente({type:'stream', stream: e.streams[0]})`.

Trabajo estimado: chico, porque la señalización ya está resuelta tres veces en
este proyecto.

## Fase 8 — audio desde teléfono

`src/midivj-camara.html` ya hace exactamente esto con video, incluida la parte
difícil: HTTPS con certificado autofirmado para que `getUserMedia` funcione
sobre IP de LAN (ADR-004). Un `midivj-audio-movil.html` reusa esa página casi
entera pidiendo `{audio:true, video:false}`.

Atención: en el teléfono hay que pedir el audio **sin** procesamiento de voz,
igual que en la interfaz, o Android entrega la señal comprimida y filtrada.

## Fase 9 — AudioOutput

Abstracción prevista: `AudioOutput` con destinos `interfaz`, `bus`, `red`,
`monitor`, `descartar`. Hoy sólo existe `monitor` (rama de ganancia hacia
`ctx.destination`).

Límite conocido: el navegador no puede crear un dispositivo virtual de salida
para que otra aplicación de Windows lo capture. Para "enviar audio a otra
aplicación" hacen falta, o un cable virtual instalado por el operador, o el
host nativo mencionado en `audio-module.md` §3.

## Fase 10 — integraciones y reloj maestro

Cuando existan dos fuentes de tiempo que deban alinearse (audio de red + MIDI
clock, o Ableton Link), se agrega un `ClockModule` siguiendo el mismo contrato.
Los eventos de audio ya llevan `audioTime` y `frame`, así que no hay que
cambiar formatos ni volver a instrumentar el worklet.

## Cosas que este módulo NO va a ser

Escrito para no discutirlo dos veces: no es un DAW. No hay grabación, ni
edición, ni plugins, ni mezcla multipista. El objetivo es que audio, MIDI, red
y video produzcan **valores y eventos** que otros módulos puedan usar. Todo lo
que no sirva a eso queda fuera.
