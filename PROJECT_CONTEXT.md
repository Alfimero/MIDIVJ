# MIDIVJ Project Context

## Design Read

Reading this as: a live VJ control tool for a technical operator, with a dark utilitarian interface, leaning toward a single-file browser app optimized for direct manipulation, low-latency playback, and predictable recovery during a show.

## What this project is

- Main product: a browser-based VJ tool that layers up to 8 tracks of video or live capture, controlled by local MIDI and optional network MIDI.
- Primary runtime: one large HTML app in `src/Midivj ZYX.html`.
- Support tools:
  - `src/midivj-relay.js`: local HTTP server, safe session writer and WebSocket relay for network MIDI.
  - `src/midivj-sender.html`: separate sender UI that forwards MIDI to the relay.
  - `src/midivj-mando.html` + `src/midivj-control.html` + `src/midivj-qr.js`: phone remote control (grid of MIDI buttons) and the QR/cabin page (ADR-003).
  - `src/midivj-camara.html`: phone camera as a track source over direct WebRTC; served over a self-signed HTTPS endpoint because `getUserMedia` needs a secure context on LAN (ADR-004).
  - `src/midivj-salida.html`: OBS browser source receiving the output canvas over direct WebRTC, app as offerer (ADR-005).
  - `src/modules/`: the module contract (`midivj-module.js`, with the `MIDIVJ.targets` / `MIDIVJ.acciones` registries) and the first decoupled subsystem, `audio/` (AudioWorklet analysis -> continuous parameters and discrete triggers; ADR-006).
  - `src/INICIAR_RELAY.bat` / `src/INICIAR_RELAY.command`: convenience launchers for Windows / macOS.
- Media library in workspace: `videos/Visuales 2026/` with `.mp4` files used by saved projects; it is excluded from Git.
- Saved session examples: `Sessions/Bk-Nk!.vjp`, `Sessions/Bk-Nk! con videos.vjp`, `Sessions/Bk-Nk! (2).vjp`.

## Repo shape and constraints

- This is not a normal multi-file web app. The main behavior is concentrated in one monolithic HTML file with inline CSS and JS.
- `package.json` and `package-lock.json` pin two dependencies, `ws` and `selfsigned`; Node.js and npm remain host prerequisites.
- Editing cost is high because most behavior is coupled through shared global state in `src/Midivj ZYX.html`. Measured on 2026-09-13: ~5000 inline JS lines, 284 global functions, 327 references to `S`, 147 DOM accesses, 47 functions called by name from `on*=` markup (see `docs/architecture/auditoria-modular-y-lite.md`).
- New subsystems go in `src/modules/` under the module contract instead of inside the HTML; the relay serves them through an explicit whitelist (`MODULOS`).
- The plan to extract the core in place (no rewrite) and derive a LITE profile for iOS/Android is ADR-007.

## Main entrypoints

- `src/Midivj ZYX.html`
  - UI, state, timeline, playback, rendering, HDMI output, project save/load, media library, MIDI input, network MIDI client.
- `src/midivj-relay.js`
  - One process, two servers: HTTP for every route and HTTPS only for `/camara`. Serves all pages and the module whitelist, writes sessions only under `Sessions/`, stores the phone layout in `data/`, reports LAN/Wi-Fi info for the QR page, and runs the WebSocket rooms with five roles (`app`, `mando`, `emisor`, `camara`, `salida`). Broadcasts `{ type:'midi', data:[status,noteOrCc,value] }` inside a room and relays WebRTC signaling as unicast; it never touches media.
- `src/midivj-sender.html`
  - Small utility UI that reads Web MIDI input and sends it to the relay.

## Core architecture inside `src/Midivj ZYX.html`

- Track count: `N_TRACKS = 8`.
- Rendering model:
  - One main output canvas (`#out-canvas`) is the compositor.
  - Render loop is `loop()`.
  - Each track can be:
    - file video
    - captured screen/window
    - capture device / camera
    - phone camera over WebRTC (`_applyStream()`, same entry point as screen/capture)
- Playback model:
  - Each file track has two hidden video elements (`vidA`, `vidB`) for seamless loop prebuffering.
  - Each live source uses a dedicated `liveVid`.
  - Master timeline + active clip logic drive playback and seeking.
- Effects model:
  - Global effects live in `EFX_DEFS`.
  - Render path is canvas 2D, not WebGL.
  - Some effects are cheap compositing operations; others are heavier.

## Important state and persistence

- Global state object: `S`.
- Media library state: `MEDIA`.
- Save format:
  - Current project format is `version: 6`.
  - `saveProject()` posts the JSON to the loopback-only `/api/sessions` endpoint.
  - The server writes a unique `.vjp` filename atomically under `Sessions/` and never overwrites an existing session.
  - Projects store:
    - track clip/group data
    - opacity and video offsets
    - effects
    - banks
    - media references for file-backed tracks
- Media restore flow:
  - `MEDIA` button lets the operator select a folder of videos.
  - Saved projects can restore videos by:
    - relative path inside the selected media folder
    - file name fallback
    - direct URL, if applicable
  - This is necessary because browser sessions cannot reliably reopen arbitrary local files without user selection.

## MIDI and network flow

- Local MIDI:
  - Web MIDI API.
  - Up to 8 assigned input selectors in the main app.
  - Central dispatcher: `onMIDIMsg()`.
- Network MIDI:
  - Main app connects with `netConnect()`.
  - Sender app publishes to relay.
  - Relay groups clients by `room`.

## HDMI / second-screen output

- HDMI output logic starts in `openOutputWindow()`.
- The same `getOutputStream()` feeds `/salida` (OBS browser source) over WebRTC; see ADR-005.
- Current strategy:
  - prefer `canvas.captureStream(...)` into a second window
  - fallback to canvas-copy safe mode when stream hookup fails
- Current tuning:
  - `HDMI_STREAM_FPS = 30`
  - short wait before stream fallback
  - fullscreen main-screen cleanup hides local operator chrome when using fullscreen on the main canvas
- Practical implication:
  - more GPU usage does not automatically reduce latency
  - queue depth and duplicate composition matter more than raw utilization

## Known performance-sensitive areas

- Heaviest code paths are in the main render loop:
  - RGB split
  - glitch
  - pixelate
  - reverse / pingpong frame capture and playback
  - HDMI output path
- Reverse/pingpong uses background frame capture with `createImageBitmap(...)`.
- Full-video reverse caches are intentionally deferred to idle time to avoid startup spikes.
- File tracks no longer auto-play immediately on metadata load; they sync when actually needed. This was done to reduce initial decoder contention.

## UI / operator workflow assumptions

- This is a show-control tool, not a generic website.
- Operator-facing controls are expected to stay visible in normal mode.
- Output-facing fullscreen modes should suppress control chrome where possible.
- Changes should prefer robustness and recoverability over abstraction or visual polish.

## Safe areas to change

- Save/load and media-library behavior, if the project version is bumped carefully.
- Fullscreen overlay behavior.
- MIDI mapping UI text and status indicators.
- HDMI mode heuristics, if fallback behavior remains intact.

## Risky areas to change

- `loop()` render path.
- Clip trigger and prebuffer logic in file tracks.
- Reverse/pingpong caching.
- Shared global state wiring between timeline, clips, effects, and MIDI triggers.
- The audio bridge in the HTML (`refrescarDestinosAudio()`): it is the only place that knows both `S` and `MIDIVJ.targets`; the audio engine itself must stay unaware of `S`, the canvas and the relay.
- Anything that modifies both main output and HDMI output in the same frame path.

## Suggested workflow for future changes

1. Identify whether the change touches:
   - render loop
   - playback state
   - MIDI routing
   - project persistence
2. Prefer small local changes over refactors.
3. Keep fallback behavior intact for HDMI and media restore.
4. Validate syntax after every edit; the main app is a single large inline script.
5. If changing persistence, test with an existing `.vjp` and with a fresh save/load cycle.
