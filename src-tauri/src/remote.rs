//! Remote view: the widget served to devices on the local network (docs/remote-api.md).
//!
//! A minimal std HTTP/1.1 server (one request per connection), bound only while enabled. Every request must come from a loopback or
//! private peer, name an IP or localhost as its Host, and carry the pairing token (query `t`
//! once, then an HttpOnly SameSite=Strict cookie). The decision is `route` (pure, tested); the
//! I/O around it is `handle`. Live events fan out to `/events` clients through bounded channels.

use serde::Serialize;
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{IpAddr, Ipv4Addr, Shutdown, SocketAddr, TcpListener, TcpStream, UdpSocket},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

pub const DEFAULT_PORT: u16 = 7770;
const COOKIE: &str = "adm_t";
const MAX_BODY: usize = 1024;
const MAX_HEAD: usize = 8 * 1024;
const MAX_CONNECTIONS: usize = 64;
const IO_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_CLIENTS: usize = 16;
const CLIENT_BUFFER: usize = 64;
const HEARTBEAT: Duration = Duration::from_secs(15);

/// A call into the app, as the remote client may make it.
#[derive(Debug, PartialEq)]
pub enum Call {
    ChronicleDay(String),
    TitheDay(String),
    ChronicleDays,
    SettingsLoad,
    PeekPetition(String),
    AnswerPetition { handle: String, choice: String },
    Vigil { arm: bool },
}

/// What the server needs from the app: its commands, and its embedded UI files (bytes, mime).
pub struct Backend {
    pub call: Box<dyn Fn(Call) -> Result<Value, String> + Send + Sync>,
    pub asset: Box<dyn Fn(&str) -> Option<(Vec<u8>, String)> + Send + Sync>,
}

// ---- policy (pure) ----

/// Loopback, private or link-local, v4 or v6 (an IPv4-mapped v6 address is judged as its v4).
pub fn allowed_peer(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_loopback() || v4.is_private() || v4.is_link_local(),
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => allowed_peer(IpAddr::V4(v4)),
            None => {
                let s = v6.segments()[0];
                v6.is_loopback() || (s & 0xfe00) == 0xfc00 || (s & 0xffc0) == 0xfe80
            }
        },
    }
}

/// Equal without an early exit, so timing does not reveal how much of a guess was right.
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// A 128-bit random token, 32 lowercase hex characters.
pub fn new_token() -> String {
    let mut b = [0u8; 16];
    getrandom::fill(&mut b).expect("OS random source");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

pub fn valid_token(t: &str) -> bool {
    t.len() == 32 && t.bytes().all(|c| matches!(c, b'0'..=b'9' | b'a'..=b'f'))
}

/// The pairing cookie's value among every `Cookie` header.
fn cookie_token<'a>(headers: &'a [(String, String)]) -> Option<&'a str> {
    headers.iter().filter(|(k, _)| k == "cookie").flat_map(|(_, v)| v.split(';')).filter_map(|kv| kv.trim().split_once('=')).find(|(k, _)| *k == COOKIE).map(|(_, v)| v)
}

fn header<'a>(headers: &'a [(String, String)], name: &str) -> Option<&'a str> {
    headers.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
}

/// `%XX` decoding of a query value ('+' is a space); None on a malformed escape or non-UTF-8.
fn percent_decode(s: &str) -> Option<String> {
    let mut out = Vec::with_capacity(s.len());
    let mut b = s.bytes();
    while let Some(c) = b.next() {
        out.push(match c {
            b'%' => {
                let hex = [b.next()?, b.next()?];
                u8::from_str_radix(std::str::from_utf8(&hex).ok()?, 16).ok()?
            }
            b'+' => b' ',
            c => c,
        });
    }
    String::from_utf8(out).ok()
}

fn query_param(query: &str, name: &str) -> Option<String> {
    query.split('&').filter_map(|kv| kv.split_once('=')).find(|(k, _)| *k == name).and_then(|(_, v)| percent_decode(v))
}

/// The embedded-asset key for a URL path, or None. Only plain relative names: no traversal, no
/// escapes, no hidden segments, no backslashes or drive letters. "/" is the page.
pub fn asset_path(path: &str) -> Option<String> {
    let p = path.strip_prefix('/')?;
    if p.is_empty() {
        return Some("index.html".into());
    }
    let seg_ok = |s: &str| !s.is_empty() && !s.starts_with('.') && s.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'-' | b'_'));
    p.split('/').all(seg_ok).then(|| p.to_string())
}

/// Host must be an IP literal or localhost (with an optional port): a DNS-rebinding name is refused.
fn host_ok(host: &str) -> bool {
    let name = match host.strip_prefix('[') {
        Some(rest) => return rest.split_once(']').is_some_and(|(ip, port)| ip.parse::<std::net::Ipv6Addr>().is_ok() && port_ok(port)),
        None => host.split_once(':').map_or(host, |(h, port)| if port_ok(&format!(":{port}")) { h } else { "" }),
    };
    name == "localhost" || name.parse::<Ipv4Addr>().is_ok()
}

fn port_ok(p: &str) -> bool {
    p.is_empty() || p.strip_prefix(':').is_some_and(|n| n.parse::<u16>().is_ok())
}

pub struct Req<'a> {
    pub method: &'a str,
    pub url: &'a str,
    pub headers: &'a [(String, String)],
    pub peer: Option<IpAddr>,
}

#[derive(Debug, PartialEq)]
enum Route {
    Status(u16),
    Unauthorized,
    /// Valid `?t=`: set the cookie and reload "/" (drops the token from the address bar).
    Pair,
    Asset(String),
    RemoteJs,
    Events,
    Call(Call),
    /// POST /api/answer_petition passed every gate; the body is read and checked next.
    Answer,
    /// POST /api/vigil passed every gate; the body is read and checked next.
    Vigil,
}

/// The same on-screen safety gate for every action endpoint. `None` passed; `Some(403|415)` else.
fn action_gate(req: &Req, actions: bool) -> Option<u16> {
    let h = |n| header(req.headers, n);
    let same_origin = h("origin").zip(h("host")).is_some_and(|(o, host)| o == format!("http://{host}")) && h("sec-fetch-site").is_none_or(|s| s == "same-origin");
    if !actions || h("x-adm") != Some("1") || !same_origin {
        Some(403)
    } else if !h("content-type").is_some_and(|c| c.starts_with("application/json")) {
        Some(415)
    } else {
        None
    }
}

fn route(req: &Req, token: &str, actions: bool) -> Route {
    if !req.peer.is_some_and(allowed_peer) || !header(req.headers, "host").is_some_and(host_ok) {
        return Route::Status(403);
    }
    let (path, query) = req.url.split_once('?').unwrap_or((req.url, ""));
    if let Some(t) = query_param(query, "t") {
        return if ct_eq(t.as_bytes(), token.as_bytes()) { Route::Pair } else { Route::Unauthorized };
    }
    if !cookie_token(req.headers).is_some_and(|c| ct_eq(c.as_bytes(), token.as_bytes())) {
        return Route::Unauthorized;
    }
    // A required query parameter, made into a call; 400 when missing or malformed.
    let with = |name, f: fn(String) -> Call| query_param(query, name).map_or(Route::Status(400), |v| Route::Call(f(v)));
    match (req.method, path) {
        ("GET", "/remote.js") => Route::RemoteJs,
        ("GET", "/events") => Route::Events,
        ("GET", "/api/chronicle_day") => with("day", Call::ChronicleDay),
        ("GET", "/api/tithe_day") => with("day", Call::TitheDay),
        ("GET", "/api/chronicle_days") => Route::Call(Call::ChronicleDays),
        ("GET", "/api/settings_load") => Route::Call(Call::SettingsLoad),
        ("GET", "/api/peek_petition") => with("handle", Call::PeekPetition),
        ("POST", "/api/answer_petition") => action_gate(req, actions).map_or(Route::Answer, Route::Status),
        ("POST", "/api/vigil") => action_gate(req, actions).map_or(Route::Vigil, Route::Status),
        ("GET", p) if !p.starts_with("/api/") => asset_path(p).map_or(Route::Status(404), Route::Asset),
        ("GET", _) => Route::Status(404),
        _ => Route::Status(405),
    }
}

// ---- live events ----

static CLIENTS: Mutex<Vec<SyncSender<Arc<str>>>> = Mutex::new(Vec::new());

/// Mirror a Tauri event to every `/events` client. Costs a lock on an empty list when none is
/// connected; a client whose buffer is full is dropped (it reconnects and catches up).
pub fn publish<S: Serialize + ?Sized>(event: &str, payload: &S) {
    let mut clients = CLIENTS.lock().unwrap_or_else(|e| e.into_inner());
    if clients.is_empty() {
        return;
    }
    let Ok(data) = serde_json::to_string(payload) else { return };
    let frame: Arc<str> = format!("event: {event}\ndata: {data}\n\n").into();
    clients.retain(|tx| tx.try_send(frame.clone()).is_ok());
}

fn drop_clients() {
    CLIENTS.lock().unwrap_or_else(|e| e.into_inner()).clear();
}

fn subscribe() -> Option<Receiver<Arc<str>>> {
    let mut clients = CLIENTS.lock().unwrap_or_else(|e| e.into_inner());
    clients.retain(|tx| tx.try_send(": hi\n\n".into()).is_ok()); // prune the gone before counting
    if clients.len() >= MAX_CLIENTS {
        return None;
    }
    let (tx, rx) = sync_channel(CLIENT_BUFFER);
    clients.push(tx);
    Some(rx)
}

fn stream_events(w: &mut dyn Write, rx: Receiver<Arc<str>>) -> std::io::Result<()> {
    w.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\nretry: 3000\n\n")?;
    w.flush()?;
    loop {
        match rx.recv_timeout(HEARTBEAT) {
            Ok(frame) => w.write_all(frame.as_bytes())?,
            Err(RecvTimeoutError::Timeout) => w.write_all(b": hb\n\n")?,
            Err(RecvTimeoutError::Disconnected) => return Ok(()), // dropped: slow, token changed or server stopped
        }
        w.flush()?;
    }
}

// ---- server ----

static TOKEN: Mutex<String> = Mutex::new(String::new());
static ACTIONS: AtomicBool = AtomicBool::new(false);

struct Running {
    port: u16,
    stop: Arc<AtomicBool>,
    thread: thread::JoinHandle<()>,
}

static SERVER: Mutex<Option<Running>> = Mutex::new(None);
static CONNECTIONS: AtomicUsize = AtomicUsize::new(0);

/// A new token cuts every paired device off, open event streams included.
pub fn set_token(t: &str) {
    *TOKEN.lock().unwrap_or_else(|e| e.into_inner()) = t.to_string();
    drop_clients();
}

pub fn set_actions(on: bool) {
    ACTIONS.store(on, Ordering::Relaxed);
}

pub fn running_port() -> Option<u16> {
    SERVER.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|r| r.port)
}

/// (Re)start on `addr`; returns the bound port. One thread blocked in accept; one short-lived
/// thread per connection (one request each, `Connection: close`), refused past `MAX_CONNECTIONS`.
pub fn start(addr: SocketAddr, backend: Backend) -> Result<u16, String> {
    stop();
    let listener = TcpListener::bind(addr).map_err(|e| format!("cannot listen on port {}: {e}", addr.port()))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let stop = Arc::new(AtomicBool::new(false));
    let (flag, backend) = (stop.clone(), Arc::new(backend));
    let thread = thread::spawn(move || {
        for conn in listener.incoming() {
            if flag.load(Ordering::Relaxed) {
                break;
            }
            let Ok(stream) = conn else { continue };
            // Refuse before reading a byte: a public peer, or too many connections at once.
            let peer = stream.peer_addr().map(|a| a.ip()).ok();
            if !peer.is_some_and(allowed_peer) {
                continue;
            }
            if CONNECTIONS.fetch_add(1, Ordering::Relaxed) >= MAX_CONNECTIONS {
                CONNECTIONS.fetch_sub(1, Ordering::Relaxed);
                continue;
            }
            let b = backend.clone();
            thread::spawn(move || {
                handle(stream, peer, &b);
                CONNECTIONS.fetch_sub(1, Ordering::Relaxed);
            });
        }
    });
    *SERVER.lock().unwrap_or_else(|e| e.into_inner()) = Some(Running { port, stop, thread });
    Ok(port)
}

/// Close the port and end every event stream; returns once the port is free.
pub fn stop() {
    let Some(r) = SERVER.lock().unwrap_or_else(|e| e.into_inner()).take() else { return };
    r.stop.store(true, Ordering::Relaxed);
    let _ = TcpStream::connect_timeout(&SocketAddr::from((Ipv4Addr::LOCALHOST, r.port)), Duration::from_secs(1)); // wake accept
    let _ = r.thread.join();
    drop_clients();
}

struct Head {
    method: String,
    target: String,
    headers: Vec<(String, String)>,
}

/// Request line and headers, strictly: HTTP/1.x, at most `MAX_HEAD` bytes (431 past it), header
/// names lowercased. A body sent chunked is refused (411): only Content-Length bodies are read.
fn read_head(r: &mut impl BufRead) -> Result<Head, u16> {
    let mut lines = Vec::new();
    let mut total = 0;
    loop {
        let mut line = Vec::new();
        let n = r.take((MAX_HEAD - total + 1) as u64).read_until(b'\n', &mut line).map_err(|_| 400u16)?;
        total += n;
        if total > MAX_HEAD {
            return Err(431);
        }
        if n == 0 || !line.ends_with(b"\n") {
            return Err(400);
        }
        let line = String::from_utf8(line).map_err(|_| 400u16)?;
        let line = line.trim_end_matches(['\r', '\n']).to_string();
        if line.is_empty() {
            break;
        }
        if line.bytes().any(|c| c.is_ascii_control() && c != b'\t') {
            return Err(400);
        }
        lines.push(line);
    }
    let mut it = lines.into_iter();
    let first = it.next().ok_or(400u16)?;
    let mut parts = first.split(' ');
    let (Some(method), Some(target), Some(version), None) = (parts.next(), parts.next(), parts.next(), parts.next()) else { return Err(400) };
    if !matches!(version, "HTTP/1.1" | "HTTP/1.0") || !target.starts_with('/') || method.is_empty() {
        return Err(400);
    }
    let mut headers = Vec::new();
    for l in it {
        let (k, v) = l.split_once(':').ok_or(400u16)?;
        if k.is_empty() || k.contains([' ', '\t']) {
            return Err(400);
        }
        headers.push((k.to_ascii_lowercase(), v.trim().to_string()));
    }
    if header(&headers, "transfer-encoding").is_some() {
        return Err(411);
    }
    Ok(Head { method: method.into(), target: target.into(), headers })
}

/// Exactly the declared body, refused (413) past `max` before reading any of it.
fn read_body(r: &mut impl Read, declared: Option<&str>, max: usize) -> Result<Vec<u8>, u16> {
    let len: usize = declared.unwrap_or("0").parse().map_err(|_| 400u16)?;
    if len > max {
        return Err(413);
    }
    let mut buf = vec![0; len];
    r.read_exact(&mut buf).map_err(|_| 400u16)?;
    Ok(buf)
}

fn handle(stream: TcpStream, peer: Option<IpAddr>, backend: &Backend) {
    let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));
    let Ok(clone) = stream.try_clone() else { return };
    let mut r = BufReader::new(clone);
    let mut w = stream;
    let head = match read_head(&mut r) {
        Ok(h) => h,
        Err(code) => return respond(&mut w, code, TEXT, status_text(code).as_bytes(), &[]),
    };
    let token = TOKEN.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let decision = if valid_token(&token) {
        route(&Req { method: &head.method, url: &head.target, headers: &head.headers, peer }, &token, ACTIONS.load(Ordering::Relaxed))
    } else {
        Route::Status(503) // no token yet: nothing can pair
    };
    let json = |w: &mut TcpStream, r: Result<Value, String>| match r {
        Ok(v) => respond(w, 200, "application/json", v.to_string().as_bytes(), &[]),
        Err(e) => respond(w, 400, "application/json", serde_json::json!({ "error": e }).to_string().as_bytes(), &[]),
    };
    match decision {
        Route::Status(code) => respond(&mut w, code, TEXT, status_text(code).as_bytes(), &[]),
        Route::Unauthorized => respond(&mut w, 401, "text/html; charset=utf-8", UNAUTHORIZED.as_bytes(), &[]),
        Route::Pair => {
            let cookie = format!("{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000");
            // A page-initiated reload rather than a 303: a redirect at the end of a cross-site
            // navigation would not carry the new SameSite=Strict cookie, a same-origin one does.
            respond(&mut w, 200, "text/html; charset=utf-8", PAIRED.as_bytes(), &[("Set-Cookie", &cookie)])
        }
        Route::RemoteJs => respond(&mut w, 200, "text/javascript; charset=utf-8", REMOTE_JS.as_bytes(), &[]),
        Route::Asset(p) => match (backend.asset)(&p) {
            Some((bytes, mime)) if mime.starts_with("text/html") => respond(&mut w, 200, &mime, &inject_flag(&bytes), &[]),
            Some((bytes, mime)) => respond(&mut w, 200, &mime, &bytes, &[]),
            None => respond(&mut w, 404, TEXT, status_text(404).as_bytes(), &[]),
        },
        Route::Events => match subscribe() {
            Some(rx) => {
                let _ = stream_events(&mut w, rx);
                let _ = w.shutdown(Shutdown::Both); // EventSource reconnects (and meets the new token, if any)
            }
            None => respond(&mut w, 503, TEXT, b"too many event streams", &[]),
        },
        Route::Call(c) => json(&mut w, (backend.call)(c)),
        Route::Answer => {
            #[derive(serde::Deserialize)]
            struct Answer {
                handle: String,
                choice: String,
            }
            let parsed = read_body(&mut r, header(&head.headers, "content-length"), MAX_BODY).and_then(|b| serde_json::from_slice::<Answer>(&b).map_err(|_| 400));
            match parsed {
                Ok(a) => json(&mut w, (backend.call)(Call::AnswerPetition { handle: a.handle, choice: a.choice })),
                Err(code) => respond(&mut w, code, TEXT, status_text(code).as_bytes(), &[]),
            }
        }
        Route::Vigil => {
            #[derive(serde::Deserialize)]
            struct Arm {
                arm: bool,
            }
            let parsed = read_body(&mut r, header(&head.headers, "content-length"), MAX_BODY).and_then(|b| serde_json::from_slice::<Arm>(&b).map_err(|_| 400));
            match parsed {
                Ok(a) => json(&mut w, (backend.call)(Call::Vigil { arm: a.arm })),
                Err(code) => respond(&mut w, code, TEXT, status_text(code).as_bytes(), &[]),
            }
        }
    }
}

const TEXT: &str = "text/plain; charset=utf-8";
const COMMON: &str = "Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nX-Frame-Options: DENY\r\nX-Adm-Remote: 1\r\nConnection: close\r\n";

fn respond(w: &mut impl Write, status: u16, ctype: &str, body: &[u8], extra: &[(&str, &str)]) {
    let mut head = format!("HTTP/1.1 {status} {}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\n{COMMON}", status_text(status), body.len());
    for (k, v) in extra {
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    head.push_str("\r\n");
    let _ = w.write_all(head.as_bytes()).and_then(|_| w.write_all(body)).and_then(|_| w.flush());
}

fn status_text(code: u16) -> &'static str {
    match code {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        411 => "Length Required",
        413 => "Payload Too Large",
        415 => "Unsupported Media Type",
        431 => "Request Header Fields Too Large",
        503 => "Service Unavailable",
        _ => "Error",
    }
}

const PAIRED: &str = "<!doctype html><meta charset=utf-8><meta http-equiv=refresh content=\"0;url=/\"><title>Administratum</title>Paired.";
const REMOTE_JS: &str = "window.ADM_REMOTE = true;\n";
const UNAUTHORIZED: &str = "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width\"><title>Administratum</title>\
<body style=\"font:16px system-ui;background:#111;color:#ddd;display:grid;place-items:center;height:90vh;text-align:center\">\
<p>Not paired.<br>Scan the QR code in Administratum &rarr; Settings &rarr; Remote view.</p>";

/// The page with `<script src="/remote.js">` first in its head, so the UI knows it is remote before app.js runs.
fn inject_flag(html: &[u8]) -> Vec<u8> {
    const TAG: &[u8] = b"<script src=\"/remote.js\"></script>";
    let at = html.windows(6).position(|w| w == b"<head>").map_or(0, |i| i + 6);
    [&html[..at], TAG, &html[at..]].concat()
}

// ---- pairing info ----

/// This machine's LAN IPv4 address: the source the OS would use toward the internet (a UDP
/// "connect" sends nothing). Empty when there is none or it is not private.
// ponytail: one address (the default route's); enumerate adapters if multi-homed hosts need it.
pub fn lan_ipv4() -> Vec<Ipv4Addr> {
    let ip = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).and_then(|s| s.connect((Ipv4Addr::new(8, 8, 8, 8), 80)).and(s.local_addr()));
    match ip {
        Ok(SocketAddr::V4(a)) if a.ip().is_private() || a.ip().is_link_local() => vec![*a.ip()],
        _ => Vec::new(),
    }
}

/// An SVG QR code of `text` (dark on light, quiet zone included).
pub fn qr_svg(text: &str) -> String {
    qrcode::QrCode::new(text.as_bytes()).map(|c| c.render::<qrcode::render::svg::Color>().min_dimensions(200, 200).build()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv6Addr;

    const TOK: &str = "0123456789abcdef0123456789abcdef";

    fn h(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    fn get(url: &str, headers: &[(String, String)]) -> Route {
        route(&Req { method: "GET", url, headers, peer: Some("192.168.1.20".parse().unwrap()) }, TOK, false)
    }

    fn authed(extra: &[(&str, &str)]) -> Vec<(String, String)> {
        let mut v = h(&[("host", "192.168.1.5:7770"), ("cookie", &format!("theme=x; adm_t={TOK}"))]);
        v.extend(h(extra));
        v
    }

    #[test]
    fn private_peers_only() {
        for ok in ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.10", "169.254.1.1", "::1", "fd12::1", "fc00::1", "fe80::1", "::ffff:192.168.1.2", "::ffff:127.0.0.1"] {
            assert!(allowed_peer(ok.parse().unwrap()), "{ok}");
        }
        for no in ["8.8.8.8", "172.15.0.1", "172.32.0.1", "100.64.0.1", "0.0.0.0", "255.255.255.255", "224.0.0.1", "2001:db8::1", "::", "fec0::1", "::ffff:8.8.8.8", "64:ff9b::808:808"] {
            assert!(!allowed_peer(no.parse().unwrap()), "{no}");
        }
        let req = |peer| route(&Req { method: "GET", url: "/", headers: &authed(&[]), peer }, TOK, false);
        assert_eq!(req(Some(IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1)))), Route::Status(403));
        assert_eq!(req(None), Route::Status(403));
        assert_eq!(req(Some(IpAddr::V6(Ipv6Addr::LOCALHOST))), Route::Asset("index.html".into()));
    }

    #[test]
    fn token_and_cookie() {
        assert!(ct_eq(b"abc", b"abc") && !ct_eq(b"abc", b"abd") && !ct_eq(b"abc", b"ab") && !ct_eq(b"", b"a"));
        let t = new_token();
        assert!(valid_token(&t) && t != new_token());
        assert!(!valid_token("0123") && !valid_token(&TOK.to_uppercase()));
        let host = h(&[("host", "192.168.1.5:7770")]);
        assert_eq!(get(&format!("/?t={TOK}"), &host), Route::Pair);
        assert_eq!(get(&format!("/api/chronicle_days?x=1&t={TOK}"), &host), Route::Pair);
        assert_eq!(get("/?t=0123456789abcdef0123456789abcdee", &host), Route::Unauthorized);
        assert_eq!(get("/?t=", &host), Route::Unauthorized);
        assert_eq!(get("/", &host), Route::Unauthorized);
        assert_eq!(get("/events", &host), Route::Unauthorized);
        assert_eq!(get("/", &authed(&[])), Route::Asset("index.html".into()));
        // Cookie parsing: exact name, any position, several headers, no prefix tricks.
        let c = |v: &str| h(&[("cookie", v)]);
        assert_eq!(cookie_token(&c(&format!("adm_t={TOK}"))), Some(TOK));
        assert_eq!(cookie_token(&c("a=1;  adm_t=zz ; b=2")), Some("zz"));
        assert_eq!(cookie_token(&c("xadm_t=zz; adm_tt=yy")), None);
        assert_eq!(cookie_token(&h(&[("cookie", "a=1"), ("cookie", "adm_t=q")])), Some("q"));
        assert_eq!(cookie_token(&h(&[("x-cookie", "adm_t=q")])), None);
        assert_eq!(get("/", &h(&[("host", "192.168.1.5"), ("cookie", "adm_t=0123456789abcdef0123456789abcdee")])), Route::Unauthorized);
    }

    #[test]
    fn host_must_be_an_address() {
        for ok in ["192.168.1.5", "192.168.1.5:7770", "localhost:7770", "127.0.0.1", "[::1]:7770", "[fe80::1]"] {
            assert!(host_ok(ok), "{ok}");
        }
        for no in ["evil.example", "evil.example:7770", "192.168.1.5:99999", "192.168.1.5:x", "[::1", "", "localhost.evil:1"] {
            assert!(!host_ok(no), "{no}");
        }
        assert_eq!(get("/", &h(&[("host", "rebind.example:7770"), ("cookie", &format!("adm_t={TOK}"))])), Route::Status(403));
        assert_eq!(get("/", &h(&[("cookie", &format!("adm_t={TOK}"))])), Route::Status(403));
    }

    #[test]
    fn routes_and_params() {
        let a = authed(&[]);
        assert_eq!(get("/api/chronicle_day?day=2026-10-05", &a), Route::Call(Call::ChronicleDay("2026-10-05".into())));
        assert_eq!(get("/api/tithe_day?day=2026-10-05", &a), Route::Call(Call::TitheDay("2026-10-05".into())));
        assert_eq!(get("/api/chronicle_day", &a), Route::Status(400));
        assert_eq!(get("/api/chronicle_days", &a), Route::Call(Call::ChronicleDays));
        assert_eq!(get("/api/settings_load", &a), Route::Call(Call::SettingsLoad));
        assert_eq!(get("/api/peek_petition?handle=term_ab%2D1", &a), Route::Call(Call::PeekPetition("term_ab-1".into())));
        assert_eq!(get("/api/peek_petition?handle=%zz", &a), Route::Status(400));
        assert_eq!(get("/api/open_session?target=x", &a), Route::Status(404));
        assert_eq!(get("/api/answer_petition", &a), Route::Status(404));
        assert_eq!(get("/remote.js", &a), Route::RemoteJs);
        assert_eq!(get("/events", &a), Route::Events);
        assert_eq!(get("/fonts/x.woff2", &a), Route::Asset("fonts/x.woff2".into()));
        let r = route(&Req { method: "DELETE", url: "/", headers: &a, peer: Some("10.0.0.2".parse().unwrap()) }, TOK, true);
        assert_eq!(r, Route::Status(405));
        assert_eq!(percent_decode("a%20b+c%C3%A9"), Some("a b cé".into()));
        assert_eq!(percent_decode("%4"), None);
        assert_eq!(percent_decode("%ff"), None);
    }

    #[test]
    fn no_path_traversal() {
        assert_eq!(asset_path("/"), Some("index.html".into()));
        assert_eq!(asset_path("/app.js"), Some("app.js".into()));
        assert_eq!(asset_path("/fonts/a-b_c.woff2"), Some("fonts/a-b_c.woff2".into()));
        assert_eq!(asset_path("/icons/apple-touch-icon.png"), Some("icons/apple-touch-icon.png".into()));
        for bad in ["/../secret", "/fonts/../../x", "/..", "/.env", "/fonts/.x", "//etc/passwd", "/a//b", "/a/", "/%2e%2e/x", "/a\\b", "/C:/x", "/a b", "app.js", ""] {
            assert_eq!(asset_path(bad), None, "{bad}");
        }
        assert_eq!(get("/%2e%2e/%2e%2e/settings.json", &authed(&[])), Route::Status(404));
        assert_eq!(get("/../Cargo.toml", &authed(&[])), Route::Status(404));
    }

    fn post_to(url: &str, headers: &[(String, String)], actions: bool) -> Route {
        route(&Req { method: "POST", url, headers, peer: Some("192.168.1.20".parse().unwrap()) }, TOK, actions)
    }

    fn post(headers: &[(String, String)], actions: bool) -> Route {
        post_to("/api/answer_petition", headers, actions)
    }

    #[test]
    fn answer_is_gated() {
        let good = [("x-adm", "1"), ("origin", "http://192.168.1.5:7770"), ("content-type", "application/json")];
        assert_eq!(post(&authed(&good), true), Route::Answer);
        assert_eq!(post(&authed(&[good[0], good[1], good[2], ("sec-fetch-site", "same-origin")]), true), Route::Answer);
        // Actions off.
        assert_eq!(post(&authed(&good), false), Route::Status(403));
        // Header missing or wrong.
        assert_eq!(post(&authed(&good[1..]), true), Route::Status(403));
        assert_eq!(post(&authed(&[("x-adm", "true"), good[1], good[2]]), true), Route::Status(403));
        // Cross-origin or no origin.
        assert_eq!(post(&authed(&[good[0], good[2]]), true), Route::Status(403));
        assert_eq!(post(&authed(&[good[0], ("origin", "http://evil.example"), good[2]]), true), Route::Status(403));
        assert_eq!(post(&authed(&[good[0], ("origin", "null"), good[2]]), true), Route::Status(403));
        assert_eq!(post(&authed(&[good[0], good[1], good[2], ("sec-fetch-site", "cross-site")]), true), Route::Status(403));
        // Not JSON.
        assert_eq!(post(&authed(&[good[0], good[1], ("content-type", "text/plain")]), true), Route::Status(415));
        // No cookie.
        assert_eq!(post(&h(&[("host", "192.168.1.5:7770"), good[0], good[1], good[2]]), true), Route::Unauthorized);
    }

    #[test]
    fn vigil_is_gated() {
        let good = [("x-adm", "1"), ("origin", "http://192.168.1.5:7770"), ("content-type", "application/json")];
        assert_eq!(post_to("/api/vigil", &authed(&good), true), Route::Vigil);
        assert_eq!(post_to("/api/vigil", &authed(&good), false), Route::Status(403));
        assert_eq!(post_to("/api/vigil", &authed(&good[1..]), true), Route::Status(403));
        assert_eq!(post_to("/api/vigil", &h(&[("host", "192.168.1.5:7770"), good[0], good[1], good[2]]), true), Route::Unauthorized);
        assert_eq!(post_to("/api/vigil", &authed(&[good[0], good[1], ("content-type", "text/plain")]), true), Route::Status(415));
        assert_eq!(get("/api/vigil", &authed(&[])), Route::Status(404));
        // Cross-origin or no origin.
        assert_eq!(post_to("/api/vigil", &authed(&[good[0], ("origin", "http://evil.example"), good[2]]), true), Route::Status(403));
        assert_eq!(post_to("/api/vigil", &authed(&[good[0], ("origin", "null"), good[2]]), true), Route::Status(403));
        assert_eq!(post_to("/api/vigil", &authed(&[good[0], good[1], good[2], ("sec-fetch-site", "cross-site")]), true), Route::Status(403));
    }

    #[test]
    fn oversized_or_malformed_requests_refused() {
        let body = |declared: Option<&str>, data: &[u8]| read_body(&mut std::io::Cursor::new(data.to_vec()), declared, MAX_BODY);
        assert_eq!(body(Some("3"), b"abcdef"), Ok(b"abc".to_vec()));
        assert_eq!(body(None, b"abc"), Ok(vec![]));
        assert_eq!(body(Some(&(MAX_BODY + 1).to_string()), &[b'x'; MAX_BODY + 1]), Err(413));
        assert_eq!(body(Some("99999999999999999999999"), b""), Err(400));
        assert_eq!(body(Some("10"), b"short"), Err(400));
        assert_eq!(body(Some("-1"), b""), Err(400));
        let head = |raw: &str| read_head(&mut std::io::Cursor::new(raw.as_bytes().to_vec())).map(|h| (h.method, h.target, h.headers));
        let ok = head("GET /a?b=1 HTTP/1.1\r\nHost: 10.0.0.1\r\nX-Adm:  1 \r\n\r\nBODY").unwrap();
        assert_eq!(ok, ("GET".into(), "/a?b=1".into(), vec![("host".into(), "10.0.0.1".into()), ("x-adm".into(), "1".into())]));
        assert_eq!(head(&format!("GET / HTTP/1.1\r\nX: {}\r\n\r\n", "a".repeat(MAX_HEAD))), Err(431));
        assert_eq!(head("GET / HTTP/1.1\r\nHost: x"), Err(400)); // cut short
        assert_eq!(head("GET  / HTTP/1.1\r\n\r\n"), Err(400));
        assert_eq!(head("GET http://x/ HTTP/1.1\r\n\r\n"), Err(400));
        assert_eq!(head("GET / HTTP/2.0\r\n\r\n"), Err(400));
        assert_eq!(head("GET / HTTP/1.1\r\nBad Name: 1\r\n\r\n"), Err(400));
        assert_eq!(head("GET / HTTP/1.1\r\nNoColon\r\n\r\n"), Err(400));
        assert_eq!(head("GET / HTTP/1.1\r\nX: a\x00b\r\n\r\n"), Err(400));
        assert_eq!(head("POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n"), Err(411));
    }

    #[test]
    fn page_gets_the_remote_flag() {
        let out = inject_flag(b"<!doctype html><html><head><title>x</title></head><header>");
        assert_eq!(String::from_utf8(out).unwrap(), "<!doctype html><html><head><script src=\"/remote.js\"></script><title>x</title></head><header>");
        assert!(qr_svg("http://192.168.1.5:7770/?t=x").starts_with("<?xml"));
    }

    /// The real server on loopback, end to end, with a stub app. Also checks a stopped server frees its port.
    #[test]
    fn serves_over_http() {
        set_token(TOK);
        set_actions(false);
        let backend =
            || Backend { call: Box::new(|c| Ok(serde_json::json!(format!("{c:?}")))), asset: Box::new(|p| (p == "index.html").then(|| (b"<html><head></head></html>".to_vec(), "text/html".into()))) };
        let port = start("127.0.0.1:0".parse().unwrap(), backend()).unwrap();
        let send = |raw: String| {
            let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
            s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            s.write_all(raw.as_bytes()).unwrap();
            let mut out = String::new();
            let _ = s.read_to_string(&mut out);
            out
        };
        let get = |path: &str, cookie: bool| {
            let c = if cookie { format!("Cookie: adm_t={TOK}\r\n") } else { String::new() };
            send(format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{c}Connection: close\r\n\r\n"))
        };
        assert!(get("/", false).starts_with("HTTP/1.1 401"));
        let paired = get(&format!("/?t={TOK}"), false);
        assert!(paired.starts_with("HTTP/1.1 200") && paired.contains("url=/") && paired.contains(&format!("Set-Cookie: adm_t={TOK}; Path=/; HttpOnly; SameSite=Strict")), "{paired}");
        let page = get("/", true);
        assert!(page.contains("Cache-Control: no-store") && page.contains("<head><script src=\"/remote.js\"></script></head>"), "{page}");
        assert!(get("/api/chronicle_days", true).ends_with("\"ChronicleDays\""));
        let big = "x".repeat(MAX_BODY + 1);
        let answer = |body: &str| {
            send(format!(
                "POST /api/answer_petition HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nCookie: adm_t={TOK}\r\nX-Adm: 1\r\nOrigin: http://127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            ))
        };
        assert!(answer("{}").starts_with("HTTP/1.1 403"));
        set_actions(true);
        assert!(answer(&big).starts_with("HTTP/1.1 413"));
        assert!(answer("{\"handle\":\"term_1\"}").starts_with("HTTP/1.1 400"));
        let ok = answer("{\"handle\":\"term_1\",\"choice\":\"yes\"}");
        assert!(ok.starts_with("HTTP/1.1 200") && ok.contains("AnswerPetition"), "{ok}");
        // SSE: a published event reaches the stream; a new token ends it.
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        write!(s, "GET /events HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nCookie: adm_t={TOK}\r\n\r\n").unwrap();
        let mut buf = [0u8; 512];
        let n = s.read(&mut buf).unwrap();
        assert!(String::from_utf8_lossy(&buf[..n]).contains("text/event-stream"));
        while CLIENTS.lock().unwrap().is_empty() {
            thread::sleep(Duration::from_millis(10));
        }
        publish("roster", &serde_json::json!([{"name": "a"}]));
        let mut got = String::new();
        while !got.contains("\n\n") {
            let n = s.read(&mut buf).unwrap();
            got.push_str(&String::from_utf8_lossy(&buf[..n]));
        }
        assert!(got.contains("event: roster\ndata: [{\"name\":\"a\"}]\n\n"), "{got}");
        set_token(&new_token());
        let mut rest = Vec::new();
        assert!(s.read_to_end(&mut rest).is_ok(), "the server closes the stream");
        set_token(TOK);
        stop();
        assert!(running_port().is_none());
        // The port is free again at once.
        let again = start(SocketAddr::from((Ipv4Addr::LOCALHOST, port)), backend()).unwrap();
        assert_eq!(again, port);
        stop();
    }
}
