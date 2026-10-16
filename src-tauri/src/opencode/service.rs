//! OpenCode's shared service: its registration file (read, never written: replacing or deleting it stops the
//! service) and a minimal HTTP/1.1 client for its loopback API on `std::net`, in the house style of `remote/`.
//! The password goes only into the `Authorization` header: never into a `Debug`, an error string or a log line.
use crate::registry::valid_opencode_id;
use serde::Deserialize;
use std::{
    collections::HashSet,
    fmt,
    io::{BufRead, BufReader, Read, Write},
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpStream},
    path::PathBuf,
    time::Duration,
};

/// Connect and read timeouts of every call: the service is on this machine or it is not there.
const TIMEOUT: Duration = Duration::from_millis(300);
const MAX_HEAD: usize = 16 * 1024;
const MAX_BODY: usize = 1024 * 1024;

/// A parsed `service.json` whose url is loopback and whose version is 2 or newer.
pub struct Registration {
    pub id: String,
    pub pid: u32,
    addr: SocketAddr,
    /// The url's authority, for the `Host` header.
    host: String,
    password: String,
}

impl fmt::Debug for Registration {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.debug_struct("Registration").field("id", &self.id).field("pid", &self.pid).field("addr", &self.addr).finish_non_exhaustive()
    }
}

/// A pending permission request (`Permission.Request`), the fields the card shows.
#[derive(Deserialize, Clone, Debug, PartialEq)]
pub struct Permission {
    pub id: String,
    /// The session that asked: a helper's own id when a helper asked (the reply goes to it).
    #[serde(rename = "sessionID", default)]
    pub session_id: String,
    pub action: String,
    #[serde(default)]
    pub resources: Vec<String>,
}

/// `$XDG_STATE_HOME/opencode/service.json` (when set and non-empty), else `~/.local/state/opencode/service.json`:
/// OpenCode's rule on every OS, Windows included.
pub fn registration_path() -> PathBuf {
    let state = std::env::var_os("XDG_STATE_HOME").filter(|v| !v.is_empty()).map(PathBuf::from);
    state.unwrap_or_else(|| std::env::home_dir().unwrap_or_default().join(".local").join("state")).join("opencode").join("service.json")
}

#[derive(Deserialize)]
struct Raw {
    id: String,
    version: String,
    url: String,
    pid: u32,
    password: String,
}

/// The registration in `text`, refused unless its version is 2 or newer and its url is `http://` to 127.0.0.1,
/// localhost or [::1] with a port (OpenCode's config allows a remote hostname: never followed).
pub fn registration(text: &str) -> Result<Registration, String> {
    let raw: Raw = serde_json::from_str(text).map_err(|_| "opencode registration: unreadable".to_string())?;
    if before_2(&raw.version) {
        return Err(format!("opencode registration: version {} is not 2.x", raw.version));
    }
    let (addr, host) = loopback(&raw.url).ok_or_else(|| format!("opencode registration: {} is not a loopback http url", raw.url))?;
    Ok(Registration { id: raw.id, pid: raw.pid, addr, host, password: raw.password })
}

fn before_2(version: &str) -> bool {
    version.split('.').next().and_then(|m| m.parse::<u32>().ok()).is_none_or(|m| m < 2)
}

/// A registration file written by an OpenCode before 2.x (or with no version number): the whole source stays off.
pub fn too_old(text: &str) -> bool {
    #[derive(Deserialize)]
    struct Version {
        version: String,
    }
    serde_json::from_str::<Version>(text).is_ok_and(|v| before_2(&v.version))
}

/// `http://<loopback host>:<port>[/]` as a socket address and its authority; anything else is None.
fn loopback(url: &str) -> Option<(SocketAddr, String)> {
    let authority = url.strip_prefix("http://")?;
    let authority = authority.strip_suffix('/').unwrap_or(authority);
    let (host, port) = authority.rsplit_once(':')?;
    let ip = match host {
        "127.0.0.1" | "localhost" => IpAddr::V4(Ipv4Addr::LOCALHOST),
        "[::1]" => IpAddr::V6(Ipv6Addr::LOCALHOST),
        _ => return None,
    };
    let port: u16 = port.parse().ok().filter(|p| *p != 0 && port.bytes().all(|c| c.is_ascii_digit()))?;
    Some((SocketAddr::new(ip, port), authority.to_string()))
}

/// RFC 4648 base64, with padding.
fn base64(bytes: &[u8]) -> String {
    const ABC: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = chunk.iter().enumerate().fold(0u32, |n, (i, b)| n | u32::from(*b) << (16 - 8 * i));
        for i in 0..4 {
            out.push(if i <= chunk.len() { ABC[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
        }
    }
    out
}

/// One request on a fresh connection (`Connection: close`): the status and the body. Errors name the route,
/// never a header.
fn call(reg: &Registration, method: &str, path: &str, body: Option<&str>) -> Result<(u16, Vec<u8>), String> {
    let fail = |what: &dyn fmt::Display| format!("opencode {method} {path}: {what}");
    let mut s = TcpStream::connect_timeout(&reg.addr, TIMEOUT).map_err(|e| fail(&e))?;
    s.set_read_timeout(Some(TIMEOUT)).map_err(|e| fail(&e))?;
    s.set_write_timeout(Some(TIMEOUT)).map_err(|e| fail(&e))?;
    let auth = base64(format!("opencode:{}", reg.password).as_bytes());
    let mut req = format!("{method} {path} HTTP/1.1\r\nHost: {}\r\nAuthorization: Basic {auth}\r\nAccept: application/json\r\nConnection: close\r\n", reg.host);
    if let Some(b) = body {
        req.push_str(&format!("Content-Type: application/json\r\nContent-Length: {}\r\n", b.len()));
    }
    req.push_str("\r\n");
    req.push_str(body.unwrap_or(""));
    s.write_all(req.as_bytes()).map_err(|e| fail(&e))?;
    let mut r = BufReader::new(s.take((MAX_HEAD + MAX_BODY) as u64));
    let (mut status, mut len, mut head) = (None, None, 0);
    loop {
        let mut line = String::new();
        let n = r.read_line(&mut line).map_err(|e| fail(&e))?;
        head += n;
        if n == 0 || head > MAX_HEAD {
            return Err(fail(&"truncated response head"));
        }
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        if status.is_none() {
            let code = line.split(' ').nth(1).and_then(|c| c.parse::<u16>().ok()).filter(|_| line.starts_with("HTTP/1."));
            status = Some(code.ok_or_else(|| fail(&"not an HTTP response"))?);
            continue;
        }
        let (k, v) = line.split_once(':').unwrap_or((line, ""));
        match k.trim().to_ascii_lowercase().as_str() {
            "content-length" => len = Some(v.trim().parse::<usize>().map_err(|_| fail(&"bad Content-Length"))?),
            // shortcut: no chunked decoder; these small JSON replies come with a Content-Length. Add one if they ever don't.
            "transfer-encoding" => return Err(fail(&"chunked response not supported")),
            _ => {}
        }
    }
    let status = status.ok_or_else(|| fail(&"no status line"))?;
    let mut buf = vec![];
    match len {
        _ if status == 204 => {}
        Some(n) if n > MAX_BODY => return Err(fail(&"response too large")),
        Some(n) => {
            buf.resize(n, 0);
            r.read_exact(&mut buf).map_err(|e| fail(&e))?;
        }
        None => {
            r.read_to_end(&mut buf).map_err(|e| fail(&e))?;
        }
    }
    Ok((status, buf))
}

/// A GET whose 200 body is json.
fn get_json(reg: &Registration, path: &str) -> Result<serde_json::Value, String> {
    match call(reg, "GET", path, None)? {
        (200, body) => serde_json::from_slice(&body).map_err(|_| format!("opencode GET {path}: unreadable json")),
        (code, _) => Err(format!("opencode GET {path}: {code}")),
    }
}

/// `GET /api/session/active`: the ids of the sessions this service is running now.
pub fn active(reg: &Registration) -> Result<HashSet<String>, String> {
    let v = get_json(reg, "/api/session/active")?;
    let data = v["data"].as_object().ok_or("opencode GET /api/session/active: no data")?;
    Ok(data.iter().filter(|(_, a)| a["type"] == "running").map(|(id, _)| id.clone()).collect())
}

/// `GET /api/session/{id}/permission`: the session's pending permission requests (they live only in the service).
pub fn pending(reg: &Registration, session: &str) -> Result<Vec<Permission>, String> {
    if !valid_opencode_id(session) {
        return Err("opencode: bad session id".into());
    }
    let path = format!("/api/session/{session}/permission");
    let v = get_json(reg, &path)?;
    serde_json::from_value(v["data"].clone()).map_err(|_| format!("opencode GET {path}: unreadable permissions"))
}

/// `POST /api/session/{sid}/permission/{rid}/reply` with `{"decision": once | always | reject}`. A reject also
/// refuses the session's other pending requests (OpenCode's rule).
#[allow(dead_code)] // the card's answer command calls it; not wired yet
pub fn reply(reg: &Registration, session: &str, request: &str, decision: &str) -> Result<(), String> {
    let ids = valid_opencode_id(session) && session.starts_with("ses_") && valid_opencode_id(request) && request.starts_with("per_");
    if !ids || !matches!(decision, "once" | "always" | "reject") {
        return Err("opencode: bad reply".into());
    }
    let path = format!("/api/session/{session}/permission/{request}/reply");
    match call(reg, "POST", &path, Some(&serde_json::json!({ "decision": decision }).to_string()))? {
        (200 | 204, _) => Ok(()),
        (404, _) => Err("opencode: that request is no longer pending".into()),
        (code, _) => Err(format!("opencode POST {path}: {code}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{net::TcpListener, thread};

    const SECRET: &str = "s3cr3t-pa55";

    fn reg_json(url: &str, version: &str) -> String {
        format!(r#"{{"id":"svc_1","version":"{version}","url":"{url}","pid":4242,"password":"{SECRET}"}}"#)
    }

    #[test]
    fn registration_wants_a_loopback_http_url_and_version_2() {
        for url in ["http://127.0.0.1:4096", "http://localhost:4096", "http://[::1]:4096", "http://127.0.0.1:4096/"] {
            let r = registration(&reg_json(url, "2.0.29")).unwrap_or_else(|e| panic!("{url}: {e}"));
            assert_eq!((r.id.as_str(), r.pid, r.addr.port()), ("svc_1", 4242, 4096));
            assert!(r.addr.ip().is_loopback());
        }
        for url in [
            "http://10.0.0.5:4096",
            "http://evil.example:4096",
            "http://127.0.0.1.evil.example:1",
            "http://127.0.0.1@evil.example:1",
            "http://user@127.0.0.1:1",
            "https://127.0.0.1:4096",
            "ftp://127.0.0.1:4096",
            "http://127.0.0.1",
            "http://127.0.0.1:0",
            "http://127.0.0.1:99999",
            "http://127.0.0.1:4096/x",
            "127.0.0.1:4096",
            "http://LOCALHOST:4096",
            "http://localhost.evil.example:1",
            "http://[::1]",
            "http://[::1]:",
            "http://[::2]:1",
            "http://::1:4096",
            "http://127.1:4096",
            "http://0x7f000001:4096",
            "http://localhost:4096?x",
            "http://localhost:+4096",
            r"http://127.0.0.1:4096\r\nX-Injected: 1", // json escapes: the url itself holds CR LF
            "HTTP://127.0.0.1:4096",
            "",
        ] {
            let e = registration(&reg_json(url, "2.0.29")).expect_err(url);
            assert!(!e.contains(SECRET), "{e}");
        }
        assert!(registration(&reg_json("http://127.0.0.1:4096", "1.14.2")).is_err(), "1.x");
        assert!(too_old(&reg_json("http://127.0.0.1:4096", "1.14.2")) && too_old(&reg_json("http://127.0.0.1:4096", "dev")));
        assert!(!too_old(&reg_json("http://127.0.0.1:4096", "2.0.29")) && !too_old(&reg_json("http://10.0.0.5:1", "10.1")) && !too_old("{not json"));
        assert!(registration(&reg_json("http://127.0.0.1:4096", "dev")).is_err(), "no version number");
        assert!(registration(r#"{"id":"svc_1","version":"2.0.29","url":"http://127.0.0.1:4096","pid":4242}"#).is_err(), "no password");
        assert!(registration("{not json").is_err());
    }

    #[test]
    fn registration_debug_hides_the_password() {
        let r = registration(&reg_json("http://127.0.0.1:4096", "2.0.29")).unwrap();
        let d = format!("{r:?}");
        assert!(d.contains("svc_1") && !d.contains(SECRET), "{d}");
    }

    #[test]
    fn base64_matches_rfc_4648_vectors() {
        let v = [("", ""), ("f", "Zg=="), ("fo", "Zm8="), ("foo", "Zm9v"), ("foob", "Zm9vYg=="), ("fooba", "Zm9vYmE="), ("foobar", "Zm9vYmFy")];
        for (plain, enc) in v {
            assert_eq!(base64(plain.as_bytes()), enc, "{plain}");
        }
        assert_eq!(base64(&[0xfb, 0xff, 0xbf]), "+/+/");
    }

    /// A one-shot server answering `response`; the join handle gives back the request it got.
    fn serve(response: &'static str) -> (Registration, thread::JoinHandle<String>) {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let h = thread::spawn(move || {
            let (s, _) = l.accept().unwrap();
            s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            let mut r = BufReader::new(s);
            let mut req = String::new();
            let mut len = 0;
            loop {
                let mut line = String::new();
                r.read_line(&mut line).unwrap();
                if let Some(v) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                    len = v.trim().parse().unwrap();
                }
                req.push_str(&line);
                if line == "\r\n" || line.is_empty() {
                    break;
                }
            }
            let mut body = vec![0; len];
            r.read_exact(&mut body).unwrap();
            req.push_str(&String::from_utf8(body).unwrap());
            if !response.is_empty() {
                r.get_mut().write_all(response.as_bytes()).unwrap();
            } else {
                thread::sleep(Duration::from_secs(1)); // never answers
            }
            req
        });
        (registration(&reg_json(&format!("http://127.0.0.1:{port}"), "2.0.29")).unwrap(), h)
    }

    fn ok(body: &str) -> &'static str {
        Box::leak(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).into_boxed_str())
    }

    #[test]
    fn active_lists_the_running_sessions() {
        let (reg, h) = serve(ok(r#"{"data":{"ses_x":{"type":"running"},"ses_y":{"type":"running"}}}"#));
        assert_eq!(active(&reg).unwrap(), HashSet::from(["ses_x".to_string(), "ses_y".to_string()]));
        let req = h.join().unwrap();
        assert!(req.starts_with("GET /api/session/active HTTP/1.1\r\n"), "{req}");
        assert!(req.contains(&format!("Host: 127.0.0.1:{}\r\n", reg.addr.port())), "{req}");
        // OpenCode's compression middleware turns a >= 1 KiB reply chunked only when asked: never ask
        assert!(!req.to_ascii_lowercase().contains("accept-encoding"), "{req}");
    }

    #[test]
    fn pending_parses_the_permission_requests() {
        let (reg, h) = serve(ok(
            r#"{"data":[{"id":"per_1","sessionID":"ses_x","action":"shell","resources":["cargo test","x"],"save":["cargo *"],"metadata":{},"source":{"type":"tool","messageID":"msg_1","id":"t1"}}]}"#,
        ));
        assert_eq!(pending(&reg, "ses_x").unwrap(), [Permission { id: "per_1".into(), session_id: "ses_x".into(), action: "shell".into(), resources: vec!["cargo test".into(), "x".into()] }]);
        assert!(h.join().unwrap().starts_with("GET /api/session/ses_x/permission HTTP/1.1\r\n"));
        assert!(pending(&reg, "ses_x/../y").is_err(), "a bad id never reaches the path");
    }

    #[test]
    fn reply_posts_the_decision_with_basic_auth() {
        let (reg, h) = serve("HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
        reply(&reg, "ses_x", "per_y", "once").unwrap();
        let req = h.join().unwrap();
        assert!(req.starts_with("POST /api/session/ses_x/permission/per_y/reply HTTP/1.1\r\n"), "{req}");
        assert!(req.contains(&format!("Authorization: Basic {}\r\n", base64(format!("opencode:{SECRET}").as_bytes()))), "{req}");
        assert!(req.contains("Content-Type: application/json\r\n") && req.ends_with("\r\n\r\n{\"decision\":\"once\"}"), "{req}");
        assert!(reply(&reg, "ses_x", "per_y", "yes").is_err(), "only once / always / reject");
        assert!(reply(&reg, "ses_x", "per_y?z", "once").is_err());
    }

    #[test]
    fn errors_name_the_route_never_the_credentials() {
        let creds = base64(format!("opencode:{SECRET}").as_bytes());
        let (reg, h) = serve("HTTP/1.1 401 Unauthorized\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
        let e = active(&reg).unwrap_err();
        h.join().unwrap();
        assert!(e.contains("/api/session/active") && e.contains("401"), "{e}");
        let (reg, h) = serve(""); // accepts, never answers: the read times out
        let started = std::time::Instant::now();
        let e2 = pending(&reg, "ses_x").unwrap_err();
        assert!(started.elapsed() < Duration::from_millis(900), "300 ms timeout");
        h.join().unwrap();
        let (reg, h) = serve("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n2\r\n{}\r\n0\r\n\r\n");
        let e3 = active(&reg).unwrap_err();
        h.join().unwrap();
        for e in [e, e2, e3] {
            assert!(!e.contains(SECRET) && !e.contains(&creds) && !e.contains("Basic"), "{e}");
        }
    }
}
