# MCAT Mobile (Expo) + Desktop LAN Server — Design

Date: 2026-07-03
Status: Approved

## Goal

Study MCAT content from a phone on the same Wi-Fi as the desktop. The phone runs a
native React Native (Expo) frontend; the desktop app exposes its existing Rust
backend to the LAN via a button on the MCAT dashboard that displays the IP, port,
and a QR pairing code.

Scope on mobile: **dashboard, study, diagnostic** — the MCAT flows only. No deck
browsing, editing, stats, or sync.

## Architecture

Two deliverables:

1. **Desktop LAN server** (changes inside this repo): an "Open LAN server" button
   on the MCAT dashboard (`ts/routes/mcat/McatDashboard.svelte`) that starts a
   second HTTP listener on `0.0.0.0:8045` serving the existing mediasrv Flask app,
   gated by a bearer token and restricted to the MCAT API surface.
2. **Phone app** (new standalone project at `C:\AlphaAI\wk1to3\mcat-mobile`,
   sibling of this repo, not part of its build system): Expo + TypeScript +
   Expo Router, Expo Go-compatible. Screens: Pair, Dashboard, Study, Diagnostic.

No Rust changes are required. The 7 MCAT RPCs already exist on
`SchedulerService`/`BackendSchedulerService` (`proto/anki/scheduler.proto`) and are
already exposed over `POST /_anki/{method}` with binary protobuf bodies
(`qt/aqt/mediasrv.py` `exposed_backend_list`):
`computeMcatReadiness`, `recomputeMcatLeafStates`, `getMcatStudyQueue`,
`answerMcatCard`, `answerMcatCardTyped`, `getMcatDiagnostic`, `resetMcatProgress`.

## Desktop LAN server

### Behavior

- Button **Open LAN server** on the MCAT dashboard opens a modal and starts the
  LAN listener. The modal shows:
  - the desktop's LAN IPv4 address and port in plain text,
  - a QR code encoding the pairing payload,
  - a **Stop server** button,
  - a note that Windows Firewall may prompt to allow Python on private networks
    the first time (allow it, or the phone cannot connect).
- Server state is session-scoped: it starts when opened and stops when the app
  closes or the user stops it. The pairing token persists across restarts.

### Implementation

- New Python post-handlers in `qt/aqt/mediasrv.py` (dynamic requests, callable only
  with desktop webview API access): `startLanServer`, `stopLanServer`,
  `getLanServerStatus`. Status returns `{running, host_ip, port, token}` for the
  modal and QR.
- The LAN listener is a second waitress server on `0.0.0.0:8045` serving the same
  Flask app object. The existing `127.0.0.1` listener and desktop webview auth
  path are untouched. Port 8045 is a fixed default (persisted in the profile) so
  the phone's saved connection remains valid across sessions.
- LAN IP detection: UDP-connect trick (`socket.connect(("8.8.8.8", 80))`) to find
  the primary interface address; fall back to enumerating non-loopback IPv4s.

### Auth model

- **LAN token**: `secrets.token_urlsafe(32)`, generated on first enable, persisted
  in the profile (`mw.pm.profile`), so pairing survives desktop restarts.
- Requests carrying `Authorization: Bearer <lan-token>`:
  - skip the localhost Host/Origin checks (which would otherwise 403 a request
    addressed to `192.168.x.x`),
  - are **restricted to an allowlist**: the 7 MCAT RPCs (POST, content-type
    `application/binary`) plus GET of media files (card images). Everything else
    → 403.
- Requests to the LAN listener without a valid LAN token → 403. The existing
  per-launch `_APIKEY` desktop token keeps its current full access from localhost.
- The `ANKI_API_HOST=0.0.0.0` env mode (which disables all auth) is not used and
  is unchanged.

### QR payload

JSON, versioned: `{"v": 1, "host": "<ip>", "port": 8045, "token": "<lan-token>"}`.
Rendered client-side in the modal with the `qrcode` npm package (added to the ts
workspace).

## Phone app

### Project

- `C:\AlphaAI\wk1to3\mcat-mobile`: fresh `create-expo-app`, TypeScript, Expo
  Router, latest Expo SDK. Must run in **Expo Go** — dependencies limited to pure
  JS packages and Expo Go built-in native modules (`expo-camera`,
  `@react-native-async-storage/async-storage`).

### API layer

- Protobuf message classes generated from this repo's `proto/` directory using
  `@bufbuild/protobuf` + `protoc-gen-es` (pure JS, Hermes-safe). A codegen script
  in `mcat-mobile` reads `..\MCATspeedrun\proto` so both sides share one contract.
- `callBackend(method, requestBytes)` mirrors `ts/lib/generated/post.ts`
  `postProto`: `POST http://<host>:<port>/_anki/<method>`, headers
  `Content-Type: application/binary` and `Authorization: Bearer <token>`, response
  parsed from bytes. Uses `expo/fetch` (WinterCG fetch — supports binary bodies).
  Every call has a timeout so a dead IP never hangs the UI.

### Screens

- **Pair**: scan QR with `expo-camera` barcode scanning (works in Expo Go;
  verified on-device as the first milestone). Fallback: paste the pairing JSON as
  text. On success, store `{host, port, token}` in AsyncStorage and verify with a
  `computeMcatReadiness` round-trip. Re-pair action available afterwards.
- **Dashboard**: readiness score (472–528), confidence band, coverage / depth /
  freshness, per-leaf mastery list — from `computeMcatReadiness`; actions for
  `recomputeMcatLeafStates`. Mirrors `ts/routes/mcat/McatDashboard.svelte`.
- **Study**: `getMcatStudyQueue` → queue of `McatStudyItem`s.
  - Flashcards: front → tap to reveal back → grade via `answerMcatCard`; typed
    answer mode uses `answerMcatCardTyped` with block-until-graded (no self-grade
    fallback), matching `ts/routes/mcat/study/StudyPage.svelte`.
  - MCQs: stem + optional image + A–D choices, answer + explanation feedback,
    graded via `answerMcatCard`.
  - Card images: `Image` with `uri: http://<host>:<port>/<image>` and the bearer
    header (mediasrv serves media at the root path).
- **Diagnostic**: question-count picker → `getMcatDiagnostic` → run through the
  set → results summary → `recomputeMcatLeafStates`. Mirrors
  `ts/routes/mcat/diagnostic/`.

Content rendering is native (Text/Image) — MCAT items are plain text + optional
media image, not HTML templates, so no WebView is needed.

## Error handling

- Desktop unreachable / timeout → full-width banner with Retry and Re-pair;
  message calls out the two common causes (LAN server not open; phone on cellular
  instead of Wi-Fi).
- 401/403 → re-pair prompt (token rotated or server restarted in a new profile).
- Typed-answer grading failure → error surfaced with retry, same as desktop.

## Testing

- **Desktop**: Python tests for LAN auth rules — no token → 403; valid token →
  MCAT RPCs and media GET allowed, any other method → 403; localhost webview path
  unaffected. `just check` must pass.
- **Phone**: unit tests for `callBackend` and pairing-payload parsing (mocked
  fetch). On-device verification in Expo Go against the real desktop: pair via QR,
  load dashboard, answer one study card (including one typed-answer grade), load
  one card image, run a short diagnostic.

## Out of scope

Internet/away-from-home access (LAN only), offline caching, app-store/dev-client
builds, card editing or browsing on mobile, collection sync, exposing any
non-MCAT API surface to the LAN.
