# Remote view (LAN) — design (operator-approved)

Serve the widget to other devices on the local network (e.g. an iPad in a browser).

## Settings → Remote view
- "Serve on the local network" toggle, default off. Port (default 7770).
- When on: the URL(s) of this machine's private IPv4 addresses, a QR code encoding the URL with the
  token (`http://<ip>:<port>/?t=<token>`), and "Regenerate token" (invalidates every paired device).
- "Allow remote actions" toggle, right next to it, default off, with a disclaimer: anyone holding the
  link on your network can approve or deny Claude Code permission prompts on this PC.

## Backend (Rust, inside the app)
- Small HTTP server (one dependency, e.g. tiny_http or axum on the existing runtime) bound to 0.0.0.0
  only while enabled; rejects any peer address that is not loopback or private (10/8, 172.16/12,
  192.168/16, 169.254/16, fc00::/7, fe80::/10).
- Auth: a random 128-bit token stored in the settings file; required on every request (query `t` on the
  first load, then an HttpOnly SameSite=Strict cookie). No token -> 401 with a tiny "scan the QR code"
  page. Constant-time comparison.
- Serves the same UI files as the app (Tauri asset resolver / embedded assets), with a no-store cache.
- Live stream: Server-Sent Events `/events` carrying the same payloads as the Tauri events (roster,
  petition, petition-stale, question, chronicle, ui-command).
- Read endpoints mirroring the commands: chronicle_day, tithe_day, chronicle_days, settings_load (a
  remote client never writes host settings), peek_petition.
- Action endpoints only when "Allow remote actions" is on: answer_petition (same on-screen safety check).
  open_session is NOT exposed remotely (it would act on the PC's screen).
- Origin/CSRF: POST only, JSON body, require the cookie + an `X-Adm` header; reject cross-origin.

## Frontend
- A thin bridge module: inside Tauri use window.__TAURI__; in a browser use fetch + EventSource with the
  same function names, so app.js/chronicon.js/settings.js keep calling `invoke`/`listen` unchanged.
- Remote mode: no settings editing (read-only panel or hidden), no tray, no window controls.
- Card actions in remote mode: Approve / Always / Deny when remote actions are allowed; "Open in Orca"
  is replaced by a note "Open on the PC"; "Open on claude.ai" stays (it opens on the iPad itself).
- Touch: tap = click, drag = pan, pinch ignored; larger hit targets on coarse pointers.
- Chime after the first tap (browser audio policy).

## PWA / Web Push — assessed, deferred
Service workers, installable PWAs and Web Push need a secure context (HTTPS with a certificate the
device trusts). Plain HTTP on a LAN IP is not secure, so iPadOS will not install it as an app or deliver
pushes. Options for later: Tailscale `serve` (valid HTTPS on *.ts.net), or a local CA whose root is
installed as a profile on the iPad. Out of scope for this pass; the page keeps in-page alerts + chime.
