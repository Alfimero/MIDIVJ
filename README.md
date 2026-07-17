# MIDIVJ

Aplicación local de visuales en vivo controlada por MIDI. El runtime vive en `src/`, las sesiones `.vjp` en `Sessions/` y los medios locales en `videos/Visuales 2026/`.

![Sesión de Bake-Neko!](docs/images/midivj-preview-1.png)
![Sesión de Bake-Neko!](docs/images/midivj-preview-2.png)

## Ejecutar

En Windows, inicia `src/INICIAR_RELAY.bat`. El launcher usa la raíz real del proyecto, instala la versión fijada de `ws` si falta y muestra estas direcciones:

- Aplicación principal: `http://localhost:9191/`
- Emisor MIDI: `http://localhost:9191/sender`

También puedes ejecutar el relay manualmente desde la raíz:

```powershell
node .\src\midivj-relay.js
```

El botón **GUARDAR** envía la sesión al relay local. El servidor valida el nombre y crea un archivo nuevo dentro de `Sessions/`; nunca guarda sesiones en Descargas ni sobrescribe una existente. Los videos permanecen fuera de Git mediante `.gitignore`.

## Como usarlo

### MIDI

en la barra superior tienes la posibilidad de agregar hasta 4 controladores MIDI conectados a tu computadora, pero también tienes la posibilidad de recibir mediante Websocket MIDI desde otra computadora para mapear los tres elementos principales del programa mediante mensajes CC y Notas: CLIPS, EFECTOS y BANCOS.

### Videos

Para configurar tus visuales dirigete a la ventana lateral izquierda donde tendrás ocho Tracks de videos (T1...T8) donde podrás elegir tres opciones para tus visuales: VIDEO (archivo), PANTALLA, CAPTURADORA de video. Una vez agregado Crea un CLIP en la parte inferior de la misma ventana y ahora podrás asignale un mensaje MIDI de CC o de Nota para disparar el CLIP.

### CLIPS

Los CLIPS cuentan con las siguientes funciones que sirven para personalizar la ejecución de tus visuales:

- MAP: Mapeas el mensaje MIDI que quieres asignar para ejecutar el CLIP.
- LOOP: El CLIP Entrará en Loop, por lo que una vez finalice el CLIP regresa desde el inicio.
- ONCE: El CLIP Entrará en Once, por lo que una vez finalice el CLIP este termina, pero con la posibilidad de usar la función "NEXT".
- NEXT: Esta función permite que el CLIP se dirija a otro CLIP dentro o fuera del mismo TRACK, permitiendo brincar entre videos o CLIPS.
- MODOS: Dentro del LOOP sirven para que el video vaya hacia delante, de reversa o en ping/pong (todavía en pruebas)
- IN/OUT: Sirve para añadir a los CLIPS un Fade IN y/o Fade OUT.
- TRANS: Es para suavizar las transiciones entre CLIPS,
- GRUPOS: Permite agrupar CLIPS en grupos con la finalidad de tener una mejor organización, para esto tienes que crear los grupos que utilizarás y alojar los CLIPS en ese espacio. Ejemplo: Verso - 2 CLIPS | Coro - 3 CLIPS | Outro - 2 CLIPS

### TRACK VIEWER

Es la Ventana inferior central, tienes la posibilidad de observar todos tus tracks, desplazarte, zoom in/out y puedes observar el cursor que te indica la posición de todo el video.

### BANCOS

Permiten guardar el estado de tu sesión para facilitar la reutilización de mensajes MIDI que planeas configurar, pudiendo de esta manera crear PRESETS por canciones tanto de CLIPS, como de EFECTOS o de los mismos BANCOS.

### EFECTOS

Son una lista variada de efectos de video de bajo consumo para modificar el resultado final de tus visuales.

## Graphify

Graphify 0.9.16 se usa como índice técnico local. Como la lógica principal está embebida en HTML y el modo `--code-only` no analiza HTML como código, el flujo genera copias JavaScript en `graphify-src/` antes de construir el grafo.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Update-Graphify.ps1 -CodeOnly
```

Consulta `PROJECT.md`, `AGENTS.md` y `docs/operations/graphify.md`. No publiques `graphify-out/`; sus relaciones inferidas no son hechos confirmados.
