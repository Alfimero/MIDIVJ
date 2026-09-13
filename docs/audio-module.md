# Módulo de audio

Estado: **fase 1–5 implementadas** (motor, entradas, medidores, envolvente/gate,
mapeo audio → parámetro visual y eventos audio → disparo). Fases 6–10 diseñadas
pero no construidas: ver `audio-module-roadmap.md`.

## 1. Por qué está separado

MIDIVJ es una sola página (`src/Midivj ZYX.html`) con estado global `S`,
render por `requestAnimationFrame`, MIDI, red y persistencia adentro. Ese
archivo no se migró ni se reescribió: el audio se agregó **al lado**, con un
contrato mínimo (`src/modules/midivj-module.js`) que los subsistemas nuevos
pueden seguir sin obligar a nadie a refactorizar lo viejo.

El motor de audio no conoce MIDIVJ. Lo único que ve del resto de la aplicación
son dos registros que la app llena por su cuenta:

- `MIDIVJ.targets` — parámetros que se pueden mover (valor continuo).
- `MIDIVJ.acciones` — cosas que se pueden disparar (evento discreto).

Si el motor visual cambiara por completo, ninguno de los archivos de
`src/modules/audio/` se enteraría.

## 2. Arquitectura

```text
                     ┌──────────── hilo de audio ────────────┐
AudioSource ──▶ gain(fuente) ─┬─▶ AudioWorkletNode (análisis) │
 (getUserMedia                │   RMS · pico · envolvente     │
  o MediaStream)              │   gate · low/mid/high         │
                              │            │ port ~60 Hz      │
                              └─▶ gain(monitor) ─▶ destination│
                                   (0 por defecto)            │
                     └───────────────────────────────────────┘
                                           │
                     ┌───────── hilo principal ──────────────┐
                     │  MAPPING ENGINE     EVENT ENGINE      │
                     │      │                   │            │
                     │  MIDIVJ.targets     MIDIVJ.acciones   │
                     │      │                   │            │
                     │  opacidad, parámetros    trigClip(),   │
                     │  de efecto…              bancos, FX…   │
                     └───────────────────────────────────────┘
```

**Analizar no es escuchar.** El monitor es una rama aparte del grafo y arranca
en ganancia 0. Una entrada puede controlar visuales sin que salga un solo dB
por la salida de la computadora — que es el caso normal en vivo, donde el
sonido ya va por la consola.

### Archivos

| Archivo | Qué es |
|---|---|
| `src/modules/midivj-module.js` | Contrato de módulos + registros `targets` / `acciones`. |
| `src/modules/audio/midivj-audio-engine.js` | AudioEngine: fuentes, buses, mapeos, eventos, métricas, persistencia. |
| `src/modules/audio/midivj-audio-worklet.js` | `AudioWorkletProcessor` de análisis. Corre en el hilo de audio. |
| `src/modules/audio/midivj-audio-ui.js` | Vista AUDIO (panel, medidores, mapeos). Opcional: el motor funciona sin ella. |
| `src/Midivj ZYX.html` | Puente: registra destinos/acciones, abre el panel, guarda en la sesión. |
| `src/midivj-relay.js` | Sirve `/modules/**` por lista blanca. |

## 3. Captura de audio en Windows 11 — qué es posible aquí

Esta es la decisión técnica que más restringe todo lo demás, así que conviene
que quede escrita sin ambigüedad.

**MIDIVJ no tiene proceso nativo.** Es una página servida por un Node mínimo y
ejecutada por el navegador. En ese contexto:

- **ASIO no es alcanzable.** Ninguna API web expone ASIO. No existe forma de
  abrir un driver ASIO desde una pestaña, ni con permisos, ni con banderas.
- **WASAPI exclusivo tampoco.** El navegador no ofrece modo exclusivo.
- **Lo que se usa realmente es WASAPI en modo compartido**, que es lo que
  Chrome/Edge abren por debajo al llamar `getUserMedia`. Es la única ruta
  disponible, y para el objetivo real de este módulo (envolvente, gate y
  bandas para mover visuales) es suficiente.

Consecuencias prácticas:

- **Convivencia con otras aplicaciones.** Al ser WASAPI compartido, MIDIVJ
  puede convivir con cualquier otra aplicación que también use WASAPI
  compartido. **No** puede convivir con una aplicación que tenga la interfaz
  tomada en ASIO o en WASAPI exclusivo, salvo que el driver del fabricante sea
  multi-cliente. Eso depende del driver, no de MIDIVJ: hay que probarlo con la
  interfaz concreta y anotarlo. Un DAW abierto con el driver ASIO de la
  interfaz es el caso típico en el que la entrada no aparecerá o aparecerá
  muda.
- **Canales.** Una interfaz multicanal se presenta como **un** dispositivo con
  N canales, no como N dispositivos. Por eso el bus tiene un selector de canal:
  "Input 1" es el canal 0 de ese dispositivo, tomado con un `ChannelSplitter`.
  Cuántos canales entrega realmente depende del driver y de lo que Chrome
  decida exponer; el panel muestra el valor real que devolvió la pista.
- **Sin procesamiento de voz.** Las entradas se piden con
  `echoCancellation:false`, `noiseSuppression:false`, `autoGainControl:false`.
  Con esas tres encendidas (el valor por omisión del navegador) un instrumento
  suena mal y el AGC arruina cualquier mapeo por nivel.
- **Contexto seguro.** `getUserMedia` exige `http://localhost` o HTTPS. Abrir
  MIDIVJ desde el relay local cumple. Abrir el HTML como archivo suelto
  (`file://`) no: en ese caso los módulos ni siquiera cargan y el botón AUDIO
  se esconde solo.

Medido en la máquina de desarrollo (Windows 11, Chrome, 2026-09-03):

| Métrica | Valor |
|---|---|
| sampleRate | 48 000 Hz |
| bloque del worklet | 128 muestras (fijo por especificación) |
| `baseLatency` (entrada) | 10 ms |
| `outputLatency` | 48 ms |
| período de reporte al hilo principal | ~16 ms (62 Hz) |
| dropouts en la prueba | 0 |

Si algún día hiciera falta latencia de nivel ASIO (monitoreo real, no control
de visuales), la salida es un host nativo — Electron o un servicio local con
PortAudio — que implemente la misma interfaz `AudioSource` y entregue buffers
al mismo motor. Por eso `agregarFuente()` acepta un `MediaStream` cualquiera y
no sólo un `deviceId`: el transporte es reemplazable sin tocar análisis,
buses ni mapeos.

## 4. Threading y tiempo real

- Todo el análisis por muestra vive en el `AudioWorkletProcessor`, es decir en
  el hilo de audio del navegador. Ni la interfaz ni el render de video pueden
  frenarlo.
- Dentro de `process()` no hay `new`, ni literales de objeto/arreglo, ni logs,
  ni JSON, ni red, ni disco. Los objetos de reporte y de evento están
  reservados en el constructor y se reutilizan.
- El worklet reporta **una vez cada 6 bloques** (~62 Hz), no una vez por
  bloque: 8 veces menos mensajes, resolución de sobra para video a 60 fps.
  Los eventos (`gate.open`, `peak.detected`, …) se mandan en el momento.
- En el hilo principal, cada mensaje sólo hace aritmética y aplica mapeos. Los
  mapeos ignoran cambios menores a 0.002 para no reescribir el mismo valor 60
  veces por segundo.
- Los medidores del panel usan su propio `setInterval` a 30 Hz y **sólo
  mientras el panel está abierto**. Cerrar el panel no afecta al análisis ni a
  los mapeos: siguen corriendo.
- No se usa `SharedArrayBuffer` porque la página no está aislada entre orígenes
  (`COOP`/`COEP`). Con ~62 mensajes por segundo y por bus, `postMessage` no es
  el cuello de botella.

## 5. Sincronización

Cada reporte y cada evento llevan dos marcas de tiempo del reloj de audio:

- `audioTime` — `currentTime` del `AudioContext` en ese bloque.
- `frame` — `currentFrame`, la muestra exacta.

Todavía no hay reloj maestro y no hace falta. Lo que sí está evitado es la
decisión que lo impediría: los eventos no se marcan con `Date.now()` del hilo
principal, que es justamente el reloj que se desincroniza. Cuando haya que
alinear audio con MIDI, video, DMX o Ableton, la conversión `frame` →
`performance.now()` es aritmética con `ctx.outputLatency`, sin cambiar formatos.

## 6. Análisis disponible

Por bus, todo normalizado 0..1 (amplitud lineal, no dB):

| Señal | Qué es |
|---|---|
| `rms` | RMS del bloque. |
| `peak` | Pico absoluto desde el reporte anterior. |
| `env` | Seguidor de envolvente (ataque rápido, caída lenta configurable). |
| `low` `mid` `high` | Tres bandas por filtros de un polo (cortes en 200 Hz y 2 kHz, configurables). |
| `gate` | 0/1 del gate con umbral, ataque, hold y release. |

Eventos: `gate.open`, `gate.close`, `peak.detected`, `silence.detected`,
`silence.end`.

No hay FFT. Es deliberado: para mover opacidad, escala o disparar un clip, la
envolvente y tres bandas alcanzan, y cuestan una fracción de lo que cuesta una
FFT por bloque. La FFT entra en la fase 2 del roadmap, como analizador
adicional del mismo bus, sin cambiar la interfaz.

## 7. Mapeos

```text
BUS · señal ──▶ normalizar(inMin..inMax) ──▶ curva ──▶ outMin..outMax ──▶ destino
```

Curvas: `linear`, `log`, `exp`, `inverted`, `threshold`.

Destinos registrados hoy por el puente de la app (24 en una sesión vacía):

- `track.tN.opacity` — opacidad de cada una de las 8 pistas.
- `efx.eN.<param>` — cada parámetro numérico de cada efecto (intensidad de
  FLASH, agresividad de GLITCH, escala de ZOOM, los siete de TRANSFORM…).

Acciones registradas (17 en una sesión vacía, más una por clip):

- `efx.eN.toggle` — encender/apagar un efecto.
- `clip.<id>` — disparar un clip concreto.
- `bank.N` — recuperar un banco guardado.
- `master.playpause`.

Agregar un destino nuevo es una línea en `refrescarDestinosAudio()` dentro de
`src/Midivj ZYX.html`. El motor no se toca.

## 8. Persistencia

La configuración de audio se guarda dentro de la sesión `.vjp`, en la clave
`audio` (formato 6, aditivo: las sesiones anteriores simplemente no la traen y
se abren igual). Se guardan fuentes, buses, mapeos y enlaces; **no** se guardan
streams ni permisos. Al abrir una sesión, las entradas quedan en estado
`pendiente` hasta que el operador pulse **⟲ RECONECTAR** en el panel: el
navegador exige un gesto del usuario para volver a abrir un micrófono o una
entrada de línea.

## 9. Observabilidad

El panel muestra, en la sección DIAGNÓSTICO: `sampleRate`, `bufferSize`,
`inputLatency`, `outputLatency`, cuadros recibidos, **saltos** (huecos de más
del triple del período esperado — dropout del hilo de audio o hilo principal
bloqueado) y el promedio de milisegundos entre cuadros.

Los mensajes del motor van a la bitácora de red de la app
(`appendNetLog('[audio] …')`), nunca desde el callback de audio.

## 10. Limitaciones conocidas

1. **ASIO y WASAPI exclusivo son inalcanzables** desde el navegador. Si otra
   aplicación tiene la interfaz tomada en modo exclusivo, MIDIVJ no la verá.
   Depende del driver ser multi-cliente.
2. **`outputLatency` medido en 48 ms** en la máquina de desarrollo. Irrelevante
   para control de visuales; inaceptable para monitoreo de un músico. El
   monitor de MIDIVJ es para verificar señal, no para tocar encima.
3. **Sin FFT ni detección de tempo.** `beat.detected` todavía no existe;
   `peak.detected` es un detector de transitorios, no un seguidor de tempo.
4. **AudioOutput sólo como monitor.** Enviar audio a otra aplicación, a otro
   bus o por red está contemplado en la arquitectura (`agregarFuente` acepta
   cualquier `MediaStream`) pero no implementado.
5. **Sin audio de red.** `NetworkAudioSource` está diseñado, no construido: hoy
   la ruta existe sólo como "pásame un `MediaStream`".
6. **El número de canales lo decide el driver.** Pedir 8 canales no garantiza
   recibirlos; el panel muestra lo que realmente devolvió la pista.
7. **Los medidores no sobreviven a cerrar el panel** — por diseño; el análisis
   y los mapeos sí siguen.

## 11. Prueba mínima verificada

Con un oscilador sintético de 220 Hz a 0.5 de amplitud inyectado como fuente
(`type:'stream'`), un bus con el analizador por omisión y un mapeo
`env → track.t1.opacity` (rango 0–0.5, curva lineal):

| | con señal | en silencio |
|---|---|---|
| `rms` | 0.329 (teórico 0.354) | — |
| `peak` | 0.500 (exacto) | — |
| `env` | 0.371 | 0.003 |
| `gate` | 1 (abierto) | 0 (cerrado) |
| bandas | low 0.250 · mid 0.245 · high 0.036 | — |
| **opacidad de TRACK 1** | **0.744** | **0.006** |

113 cuadros, 16.05 ms de promedio entre cuadros, **0 saltos**.

Falta la validación que sólo puede hacerse a mano y con hardware autorizado:
abrir una entrada física real de la interfaz y confirmar canales, latencia y
convivencia con el driver. Ver `docs/operations/acceptance-questions.md`.
