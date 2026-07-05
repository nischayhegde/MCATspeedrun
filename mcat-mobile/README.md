# MCAT Mobile

React Native (Expo Go) frontend for the MCATspeedrun desktop app. The phone is
a thin client: all data and scheduling lives in the desktop's Rust backend.

## Running

1. Desktop: launch MCATspeedrun (`run.bat` in the repo), open the MCAT
   dashboard, and click **Phone access**. This displays the desktop's LAN IP,
   port 8045, and a QR code. Leave the server running.
   Allow Python through Windows Firewall (private networks) if prompted.
2. Phone: install **Expo Go**, join the same Wi-Fi as the desktop.
3. Here: `npm install && npm run gen:proto && npx expo start`, then scan the
   terminal QR with Expo Go.
4. In the app, scan the desktop modal's QR code (or paste the pairing code).

## Development

- `npm test` — unit tests (pairing + API client) via jest
- `npx tsc --noEmit` — TypeScript type checking
- `npm run gen:proto` — regenerate protobuf classes after the desktop's
  `proto/` changes (reads `../proto`; this app lives inside the MCATspeedrun repo)
- API contract: `POST http://<desktop>:8045/_anki/<method>`, body/response are
  binary protobuf, `Authorization: Bearer <token>` required; only the MCAT
  RPCs and media GETs are allowed over the LAN.

## Limitations

The app targets **Expo Go** only. A standalone/EAS or custom dev-client build
is out of scope; doing so would additionally require registering the
`expo-camera` config plugin in `app.json` for camera permission strings.

## Troubleshooting

- "Couldn't reach the desktop": server not running (reopen Phone access),
  phone on cellular, or Windows Firewall blocking inbound 8045.
- 401/403 after it used to work: re-pair (desktop token was cleared or you
  switched desktop profiles).
- iOS: accept the Local Network permission prompt on first connect.

## Security

While the desktop "Phone access" server is running, any device on the same
Wi-Fi that has the pairing token can read and answer your MCAT cards. Stop
the server when done studying.
