//! OpenCode 2.x sessions, a second source beside the Claude registry: its SQLite database read read-only (`db`),
//! its loopback service asked only for live state (`service`). Nothing of OpenCode's is ever written, and the
//! service password never leaves `service`.
mod db;
mod service;

use crate::{
    chronicle::{Msg, OPENCODE_BATCH},
    registry::{self, Agent, Context, Helper, Session},
};
use service::Permission;
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    time::{Duration, Instant},
};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

/// How long an OpenCode session stays in the hall after it went idle: nothing on disk says a TUI still has it open.
pub const OPENCODE_IDLE_MS: i64 = 900_000;

/// A shown session row with what its newest messages say.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Shown {
    pub row: db::Row,
    /// The newest prompt (`db::last_user_text`), "—" without one.
    pub task: String,
    pub context: Option<Context>,
}

/// What the service says this tick.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Live {
    pub pid: u32,
    /// The registration pid is a running process.
    pub alive: bool,
    /// `/api/session/active`, None when the service did not answer.
    pub active: Option<HashSet<String>>,
    /// Session id -> its first pending permission request and when it was first seen (the petition's episode).
    pub pending: HashMap<String, (Permission, i64)>,
}

/// The hall's OpenCode sessions from this tick's rows and service: `waiting` on a pending permission, `busy` while
/// the claim is set and the service runs it, else `idle`, shown only within OPENCODE_IDLE_MS of the newest idle or
/// claim time (a claim under a dead service is a crashed run). Running children are their parent's helpers, never
/// top-level sessions. The window is applied here, every tick: `rows` may be cached from an earlier read.
pub fn build(rows: &[Shown], live: Option<&Live>, now_ms: i64) -> Vec<Session> {
    let temp_root = std::env::temp_dir().to_string_lossy().into_owned();
    let claimed = |r: &db::Row| r.time_suspended.is_some() && live.is_some_and(|l| l.alive);
    let running = |r: &db::Row| claimed(r) && live.and_then(|l| l.active.as_ref()).is_none_or(|a| a.contains(&r.id));
    let mut out = vec![];
    for Shown { row: r, task, context } in rows.iter().filter(|s| s.row.parent_id.is_none()) {
        let pending = live.and_then(|l| l.pending.get(&r.id));
        let status = if pending.is_some() {
            "waiting"
        } else if running(r) {
            "busy"
        } else {
            "idle"
        };
        let last = r.time_idle.max(r.time_suspended);
        if status == "idle" && last.is_none_or(|t| t < now_ms - OPENCODE_IDLE_MS) {
            continue;
        }
        let since_ms = match (status, pending) {
            (_, Some((_, seen))) => Some(*seen),
            ("busy", _) => r.time_suspended,
            _ => last,
        };
        let helpers = rows
            .iter()
            .filter(|c| c.row.parent_id.as_deref() == Some(r.id.as_str()) && claimed(&c.row))
            .map(|c| Helper {
                id: c.row.id.clone(),
                kind: c.row.agent.clone().unwrap_or_else(|| "agent".into()),
                task: c.row.title.clone().unwrap_or_else(|| c.task.clone()),
                model: c.row.model.clone(),
                context: c.context.clone(),
            })
            .collect();
        let temp = registry::temp_dept(&r.directory, &temp_root);
        out.push(Session {
            id: r.id.clone(),
            pid: live.map_or(0, |l| l.pid),
            name: r.slug.clone(),
            temp: temp.is_some(),
            dept: temp.unwrap_or_else(|| registry::dept_of(&r.directory)),
            cwd: r.directory.clone(),
            status: status.into(),
            waiting_for: pending.map(|_| "permission".into()),
            since_ms: since_ms.unwrap_or(0),
            task: task.clone(),
            title: r.title.clone(),
            asks: pending.map(|(p, _)| p.resources.first().map_or_else(|| p.action.clone(), |res| format!("{}: {res}", p.action))),
            helpers,
            context: context.clone(),
            source: Agent::OpenCode,
            opencode_request: pending.map(|(p, _)| p.id.clone()),
            opencode_asker: pending.map(|(p, _)| p.session_id.clone()),
            parent: None,
            ..Default::default()
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// How often the opencode TUIs and their folders are listed (a scan of every process name, cwd read once per pid).
const TUIS_EVERY: Duration = Duration::from_secs(5);

/// A process that is an OpenCode TUI (or a one-shot `opencode run`): the `opencode` executable, not its service.
fn is_tui(name: &str, cmd: &[String]) -> bool {
    let name = name.to_ascii_lowercase();
    (name == "opencode" || name == "opencode.exe") && !cmd.iter().skip(1).any(|a| a == "serve")
}

/// A folder as compared between OpenCode's `directory` and a process cwd: one separator, no trailing one, and on
/// Windows no case.
fn folder_key(p: &str) -> String {
    let p = p.replace('\\', "/");
    let p = p.trim_end_matches('/');
    if cfg!(windows) {
        p.to_lowercase()
    } else {
        p.to_string()
    }
}

/// An idle session leaves as soon as no TUI runs in its folder: OpenCode records no presence, and its service
/// outlives every TUI. `tuis` None (not listed yet): the OPENCODE_IDLE_MS window alone decides.
fn keep_idle(sessions: &mut Vec<Session>, tuis: Option<&HashSet<String>>) {
    if let Some(tuis) = tuis {
        sessions.retain(|s| s.status != "idle" || tuis.contains(&folder_key(&s.cwd)));
    }
}

/// The folders the running opencode TUIs were started in: every process name is refreshed, a command line and cwd
/// are read once per pid (`OnlyIfNotSet`), dead pids are dropped.
fn scan_tuis(sys: &mut System) -> HashSet<String> {
    let refresh = ProcessRefreshKind::nothing().with_cmd(UpdateKind::OnlyIfNotSet).with_cwd(UpdateKind::OnlyIfNotSet);
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, refresh);
    let tuis = sys.processes().values().filter(|p| {
        let name = p.name().to_string_lossy();
        // Build the command line only for an opencode process.
        name.to_ascii_lowercase().starts_with("opencode") && is_tui(&name, &p.cmd().iter().map(|a| a.to_string_lossy().into_owned()).collect::<Vec<_>>())
    });
    tuis.filter_map(|p| p.cwd()).map(|c| folder_key(&c.to_string_lossy())).collect()
}

/// `$OPENCODE_DB` (resolved against the data dir), else `<data>/opencode/opencode.db`, the data dir being
/// `$XDG_DATA_HOME` (when set and non-empty) or `~/.local/share`: OpenCode's rule on every OS. Default channel only.
fn db_path() -> PathBuf {
    let base = std::env::var_os("XDG_DATA_HOME").filter(|v| !v.is_empty()).map(PathBuf::from);
    let data = base.unwrap_or_else(|| std::env::home_dir().unwrap_or_default().join(".local").join("share")).join("opencode");
    data.join(std::env::var_os("OPENCODE_DB").filter(|v| !v.is_empty()).unwrap_or_else(|| "opencode.db".into()))
}

/// Whether `pid` is a running process (a one-pid sysinfo refresh, no snapshot).
fn pid_alive(pid: u32) -> bool {
    let mut sys = System::new();
    let pid = Pid::from_u32(pid);
    sys.refresh_processes_specifics(ProcessesToUpdate::Some(&[pid]), true, ProcessRefreshKind::nothing());
    sys.process(pid).is_some()
}

/// The OpenCode side of each tick. The database is re-read (one read transaction, dropped before returning) only
/// when it or its `-wal` changed (len, mtime), and only while its `-wal` exists (OpenCode has it open); the service
/// is asked (active, then pending for the running sessions) only while some session holds a claim. Missing files
/// mean no OpenCode: nothing shown, nothing logged. A registration older than 2.x turns the source off.
pub struct Source {
    db: PathBuf,
    registration: PathBuf,
    stamp: Option<[Option<(u64, i64)>; 2]>,
    rows: Vec<Shown>,
    /// Pending request id -> when it was first seen: the petition's episode (`since_ms`).
    seen: HashMap<String, i64>,
    /// Messages already logged: each is printed once per run.
    logged: HashSet<String>,
    /// The database stamp the Chronicon last read messages at, and whether a batch came back full (more to read).
    fed: Option<[Option<(u64, i64)>; 2]>,
    more: bool,
    /// The folders opencode TUIs run in, listed at most every TUIS_EVERY while an idle session is shown, and the
    /// process table that lists them (kept so a pid's cwd is read once).
    tuis: Option<(Instant, HashSet<String>)>,
    sys: System,
    /// Lists the TUI folders from the process table: `scan_tuis`, a fixed list in tests.
    lister: fn(&mut System) -> HashSet<String>,
}

/// Session id -> its top-level session (the hall's): a parent cycle in the DB cannot hang the tick.
fn root_of<'a>(parent: &HashMap<&'a str, &'a str>, mut id: &'a str) -> &'a str {
    for _ in 0..16 {
        match parent.get(id) {
            Some(p) => id = p,
            None => break,
        }
    }
    id
}

fn parents(rows: &[Shown]) -> HashMap<&str, &str> {
    rows.iter().filter_map(|s| Some((s.row.id.as_str(), s.row.parent_id.as_deref()?))).collect()
}

impl Source {
    pub fn new() -> Self {
        Source::at(db_path(), service::registration_path())
    }

    fn at(db: PathBuf, registration: PathBuf) -> Self {
        Source { db, registration, stamp: None, rows: vec![], seen: HashMap::new(), logged: HashSet::new(), fed: None, more: false, tuis: None, sys: System::new(), lister: scan_tuis }
    }

    /// The folders of the running opencode TUIs, re-listed at most every TUIS_EVERY.
    fn tui_folders(&mut self) -> &HashSet<String> {
        if self.tuis.as_ref().is_none_or(|(at, _)| at.elapsed() >= TUIS_EVERY) {
            self.tuis = Some((Instant::now(), (self.lister)(&mut self.sys)));
        }
        &self.tuis.as_ref().expect("just listed").1
    }

    pub fn roster(&mut self, now_ms: i64) -> Vec<Session> {
        let mut wal = self.db.clone().into_os_string();
        wal.push("-wal");
        let stamp = [self.db.clone(), PathBuf::from(wal)].map(|p| registry::stat(&p).map(|f| (f.len, f.mtime_ms)));
        if self.stamp != Some(stamp) {
            // No -wal: OpenCode has the database closed, and a read-only open would create its -wal and -shm.
            match if stamp[1].is_some() { self.read(now_ms) } else { Ok(vec![]) } {
                Ok(rows) => (self.rows, self.stamp) = (rows, Some(stamp)),
                Err(e) => self.log(e), // keep the last rows; read again next tick
            }
        }
        if self.rows.is_empty() {
            self.seen.clear();
            return vec![];
        }
        let text = std::fs::read_to_string(&self.registration).ok(); // none: a standalone TUI, or no service yet
        if text.as_deref().is_some_and(service::too_old) {
            self.log("opencode: its service is older than 2.x, its sessions are not shown".into());
            return vec![];
        }
        let running = self.rows.iter().any(|s| s.row.time_suspended.is_some());
        let live = text.filter(|_| running).and_then(|t| self.live(&t, now_ms));
        if live.is_none() {
            self.seen.clear();
        }
        let mut out = build(&self.rows, live.as_ref(), now_ms);
        if out.iter().any(|s| s.status == "idle") {
            keep_idle(&mut out, Some(self.tui_folders()));
        } else {
            self.tuis = None; // nothing idle to keep: no process scan
        }
        out
    }

    fn log(&mut self, msg: String) {
        if self.logged.insert(msg.clone()) {
            eprintln!("{msg}");
        }
    }

    fn read(&mut self, now_ms: i64) -> Result<Vec<Shown>, String> {
        let Some(conn) = db::open(&self.db) else {
            if self.db.is_file() {
                self.log("opencode: no session_v2 table (OpenCode before 2.x?), its sessions are not shown".into());
            }
            return Ok(vec![]);
        };
        let tx = conn.unchecked_transaction().map_err(|e| format!("opencode db: {e}"))?;
        let rows = db::shown_sessions(&tx, now_ms).and_then(|rows| {
            rows.into_iter()
                .map(|row| {
                    let task = db::last_user_text(&tx, &row.id)?.unwrap_or_else(|| "—".into());
                    let context = db::last_assistant(&tx, &row.id)?;
                    Ok(Shown { row, task, context })
                })
                .collect()
        });
        drop(tx); // a read-only transaction: rolled back, never held across ticks
        rows.map_err(|e| format!("opencode db: {e}"))
    }

    /// The running sessions to ask `/permission` of, each with its top-level session: a helper's request carries
    /// the helper's own id (OpenCode filters on the exact session), but it is the parent's scribe that waits.
    /// Nothing is asked when `/active` did not answer: the service is hung and every call would wait out its timeout.
    fn askable<'a>(rows: &'a [Shown], active: Option<&HashSet<String>>) -> Vec<(&'a str, &'a str)> {
        let Some(active) = active else { return vec![] };
        let parent = parents(rows);
        rows.iter().filter(|s| s.row.time_suspended.is_some() && active.contains(&s.row.id)).map(|s| (s.row.id.as_str(), root_of(&parent, &s.row.id))).collect()
    }

    /// The sessions whose messages feed the Chronicon: every shown one, finished helpers included (their last rows
    /// land as they finish), as (id, top-level session id, helper kind for a child).
    pub fn family(&self) -> Vec<(String, String, Option<String>)> {
        let parent = parents(&self.rows);
        let kind = |s: &Shown| s.row.parent_id.as_ref().map(|_| s.row.agent.clone().unwrap_or_else(|| "agent".into()));
        self.rows.iter().map(|s| (s.row.id.clone(), root_of(&parent, &s.row.id).to_string(), kind(s))).collect()
    }

    /// Runs `f` with a reader of a session's rows after a seq (`db::messages_after`, OPENCODE_BATCH at most), all in
    /// one read transaction dropped before returning. The reader gives nothing while the database is closed (no
    /// `-wal`: opening would create sidecars) or unchanged since the last read with nothing left over.
    pub fn with_messages<T>(&mut self, f: impl FnOnce(&mut dyn FnMut(&str, i64) -> Vec<Msg>) -> T) -> T {
        let open = self.stamp.is_some_and(|s| s[1].is_some()) && (self.more || self.fed != self.stamp);
        let conn = if open { db::open(&self.db) } else { None };
        let Some(tx) = conn.as_ref().and_then(|c| c.unchecked_transaction().ok()) else { return f(&mut |_, _| vec![]) };
        let (mut more, mut failed) = (false, None);
        let out = f(&mut |id, seq| match db::messages_after(&tx, id, seq, OPENCODE_BATCH) {
            Ok(rows) => {
                more |= rows.len() >= OPENCODE_BATCH as usize;
                rows
            }
            Err(e) => {
                failed = Some(format!("opencode db: {e}"));
                vec![]
            }
        });
        drop(tx); // never held across ticks
        (self.fed, self.more) = (self.stamp, more || failed.is_some());
        if let Some(e) = failed {
            self.log(e);
        }
        out
    }

    fn live(&mut self, text: &str, now_ms: i64) -> Option<Live> {
        let reg = match service::registration(text) {
            Ok(r) => r,
            Err(e) => {
                self.log(e);
                return None;
            }
        };
        let mut live = Live { pid: reg.pid, alive: pid_alive(reg.pid), ..Default::default() };
        if live.alive {
            live.active = service::active(&reg).ok();
            for (ask, root) in Self::askable(&self.rows, live.active.as_ref()) {
                if live.pending.contains_key(root) {
                    continue; // one petition per scribe: the first one found
                }
                if let Some(mut p) = service::pending(&reg, ask).ok().and_then(|v| v.into_iter().next()) {
                    if p.session_id.is_empty() {
                        p.session_id = ask.to_string(); // the session asked about is the one that asks
                    }
                    let seen = *self.seen.entry(p.id.clone()).or_insert(now_ms);
                    live.pending.insert(root.to_string(), (p, seen));
                }
            }
        }
        let open: HashSet<&str> = live.pending.values().map(|(p, _)| p.id.as_str()).collect();
        self.seen.retain(|id, _| open.contains(id.as_str()));
        Some(live)
    }
}

/// The card's Approve / Always / Deny as OpenCode's reply decision.
pub fn decision(choice: &str) -> Result<&'static str, String> {
    match choice {
        "yes" => Ok("once"),
        "always" => Ok("always"),
        "no" => Ok("reject"),
        _ => Err("unknown choice".into()),
    }
}

/// Answers permission request `request` on hall session `session`'s card, only while `roster` (the newest) still
/// shows it there: the ids from the UI or the remote view select a roster entry, never a URL by themselves. The
/// reply goes to the session that asked (a helper's own, maybe) at the service the registration at `registration`
/// names now (re-read at each click: the service may have restarted).
fn answer_at(registration: &std::path::Path, roster: &[Session], session: &str, request: &str, choice: &str) -> Result<(), String> {
    let decision = decision(choice)?;
    let shown = |s: &&Session| s.id == session && s.source == Agent::OpenCode && s.status == "waiting" && s.opencode_request.as_deref() == Some(request);
    let s = roster.iter().find(shown).ok_or("no permission request pending")?; // as Orca's "no permission prompt on screen"
    let text = std::fs::read_to_string(registration).map_err(|_| "opencode: no service registration".to_string())?;
    let reg = service::registration(&text)?;
    service::reply(&reg, s.opencode_asker.as_deref().unwrap_or(&s.id), request, decision)
}

pub fn answer(roster: &[Session], session: &str, request: &str, choice: &str) -> Result<(), String> {
    answer_at(&service::registration_path(), roster, session, request, choice)
}

/// Answer an OpenCode permission petition from the card: `choice` yes / always / no -> once / always / reject (a
/// reject also refuses the asking session's other pending requests). Runs off the main thread (async).
#[tauri::command(async)]
pub fn answer_opencode(session: String, request: String, choice: String, live: tauri::State<crate::Live>) -> Result<(), String> {
    let roster: Vec<Session> = crate::lock(&live).iter().filter(|s| s.id == session).cloned().collect(); // the lock is not held over the call
    answer(&roster, &session, &request, &choice)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{BufRead, BufReader, Write},
        net::TcpListener,
        thread,
    };

    /// A fake service answering every request by path from `routes` (404 otherwise), until the test process ends;
    /// it logs each as "METHOD path body".
    fn fake_service(routes: Vec<(&'static str, &'static str)>) -> (u16, std::sync::Arc<std::sync::Mutex<Vec<String>>>) {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let log = std::sync::Arc::new(std::sync::Mutex::new(vec![]));
        let seen = log.clone();
        thread::spawn(move || {
            for s in l.incoming().flatten() {
                let mut r = BufReader::new(s);
                let mut first = String::new();
                r.read_line(&mut first).unwrap();
                let mut len = 0;
                loop {
                    let mut line = String::new();
                    if r.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                        break;
                    }
                    if let Some(v) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                        len = v.trim().parse().unwrap();
                    }
                }
                let mut body = vec![0; len];
                std::io::Read::read_exact(&mut r, &mut body).unwrap();
                let (method, path) = (first.split(' ').next().unwrap_or_default(), first.split(' ').nth(1).unwrap_or_default());
                seen.lock().unwrap().push(format!("{method} {path} {}", String::from_utf8_lossy(&body)));
                let reply = match routes.iter().find(|(p, _)| *p == path) {
                    Some((_, body)) => format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()),
                    None => "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into(),
                };
                r.get_mut().write_all(reply.as_bytes()).unwrap();
            }
        });
        (port, log)
    }

    #[test]
    fn choices_map_to_opencode_decisions() {
        assert_eq!(["yes", "always", "no"].map(|c| decision(c).unwrap()), ["once", "always", "reject"]);
        assert!(decision("once").is_err() && decision("").is_err());
    }

    #[test]
    fn an_answer_goes_to_the_asking_session_while_the_card_shows_the_request() {
        let (port, log) = fake_service(vec![("/api/session/ses_kid/permission/per_7/reply", "")]);
        let dir = std::env::temp_dir().join(format!("adm-opencode-answer-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let reg = dir.join("service.json");
        std::fs::write(&reg, format!(r#"{{"id":"svc","version":"2.0.29","url":"http://127.0.0.1:{port}","pid":1,"password":"pw-zz9"}}"#)).unwrap();
        let card = Session { status: "waiting".into(), source: Agent::OpenCode, opencode_request: Some("per_7".into()), opencode_asker: Some("ses_kid".into()), ..registry::tests_session("ses_run") };
        let roster = [card.clone()];
        answer_at(&reg, &roster, "ses_run", "per_7", "no").unwrap();
        assert_eq!(*log.lock().unwrap(), [r#"POST /api/session/ses_kid/permission/per_7/reply {"decision":"reject"}"#], "the helper's request: its own session");
        for (session, request) in [("ses_run", "per_8"), ("ses_other", "per_7")] {
            let e = answer_at(&reg, &roster, session, request, "yes").unwrap_err();
            assert_eq!(e, "no permission request pending", "{session} {request}");
        }
        assert!(answer_at(&reg, &[Session { status: "busy".into(), ..card.clone() }], "ses_run", "per_7", "yes").is_err(), "answered meanwhile");
        // the service no longer has it (answered in the TUI): its 404, said plainly
        let gone = [Session { opencode_asker: None, ..card.clone() }];
        let e = answer_at(&reg, &gone, "ses_run", "per_7", "always").unwrap_err();
        assert_eq!(e, "opencode: that request is no longer pending");
        assert!(log.lock().unwrap()[1].starts_with("POST /api/session/ses_run/permission/per_7/reply"), "no asker known: the card's session");
        std::fs::remove_file(&reg).unwrap();
        assert!(answer_at(&reg, &roster, "ses_run", "per_7", "yes").unwrap_err().contains("no service registration"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn source_reads_the_database_and_asks_the_service() {
        const SECRET: &str = "pa55-w0rd-xyz";
        let (dir, db_file, c) = wal_db("source");
        db::tests::add_session(&c, "ses_run", None, "Fix the card", (Some(NOW - 5_000), None, None));
        db::tests::add_message(&c, "ses_run", 1, "user", r#"{"text":"fix the card"}"#);
        let (port, _) = fake_service(vec![
            ("/api/session/active", r#"{"data":{"ses_run":{"type":"running"}}}"#),
            ("/api/session/ses_run/permission", r#"{"data":[{"id":"per_7","sessionID":"ses_run","action":"shell","resources":["cargo test"]}]}"#),
        ]);
        let reg = dir.join("service.json");
        std::fs::write(&reg, format!(r#"{{"id":"svc","version":"2.0.29","url":"http://127.0.0.1:{port}","pid":{},"password":"{SECRET}"}}"#, std::process::id())).unwrap();
        let mut src = test_source(db_file.clone(), reg.clone());
        let first = src.roster(NOW);
        assert_eq!(first.len(), 1);
        let s = &first[0];
        assert_eq!((s.status.as_str(), s.opencode_request.as_deref(), s.since_ms, s.pid), ("waiting", Some("per_7"), NOW, std::process::id()));
        assert_eq!((s.task.as_str(), s.title.as_deref()), ("“fix the card”", Some("Fix the card")));
        let again = src.roster(NOW + 1_000);
        assert_eq!(again[0].since_ms, NOW, "the same request is the same petition episode");
        assert!(!serde_json::to_string(&again).unwrap().contains(SECRET));
        // no registration: the claim stands alone, shown idle while a TUI runs in its folder
        std::fs::remove_file(&reg).unwrap();
        assert_eq!(src.roster(NOW + 2_000)[0].status, "idle");
        // its TUI quits: the idle scribe leaves at the next listing, well inside the window
        src.lister = |_| HashSet::new();
        src.tuis = None;
        assert!(src.roster(NOW + 3_000).is_empty(), "no TUI in its folder any more");
        drop(c);
        let _ = std::fs::remove_dir_all(&dir);
        assert!(test_source(dir.join("opencode.db"), dir.join("service.json")).roster(NOW).is_empty(), "no OpenCode installed");
    }

    const NOW: i64 = 50_000_000;

    /// A source whose only TUI runs in the fixtures' folder (`db::tests::add_session`), never the machine's.
    fn test_source(db: PathBuf, registration: PathBuf) -> Source {
        Source { lister: |_| [folder_key(r"C:\git\Terra")].into(), ..Source::at(db, registration) }
    }

    fn row(id: &str, parent: Option<&str>, suspended: Option<i64>, idle: Option<i64>) -> Shown {
        Shown {
            row: db::Row {
                id: id.into(),
                parent_id: parent.map(str::to_string),
                slug: format!("{id}-slug"),
                directory: r"C:\Users\guill\Documents\git\Terra".into(),
                title: Some(format!("{id} title")),
                agent: Some("build".into()),
                model: Some("claude-sonnet-5".into()),
                time_suspended: suspended,
                time_idle: idle,
            },
            task: format!("“{id} prompt”"),
            context: Some(Context { tokens: 1234, model: "claude-sonnet-5".into() }),
        }
    }

    #[test]
    fn helpers_are_asked_for_permissions_on_behalf_of_their_scribe() {
        let rows = [
            row("ses_run", None, Some(NOW), None),
            row("ses_kid", Some("ses_run"), Some(NOW), None),
            row("ses_grandkid", Some("ses_kid"), Some(NOW), None),
            row("ses_quiet", None, None, Some(NOW)),
            row("ses_gone", Some("ses_run"), Some(NOW), None), // claimed but not active: not asked
        ];
        let active: HashSet<String> = ["ses_run", "ses_kid", "ses_grandkid", "ses_quiet"].map(String::from).into();
        assert_eq!(Source::askable(&rows, Some(&active)), [("ses_run", "ses_run"), ("ses_kid", "ses_run"), ("ses_grandkid", "ses_run")]);
        assert!(Source::askable(&rows, None).is_empty(), "a service that did not answer /active is not asked again");
        let cycle = [row("ses_a", Some("ses_b"), Some(NOW), None), row("ses_b", Some("ses_a"), Some(NOW), None)];
        let both: HashSet<String> = ["ses_a", "ses_b"].map(String::from).into();
        assert_eq!(Source::askable(&cycle, Some(&both)).len(), 2, "a parent cycle ends");
    }

    #[test]
    fn a_tui_is_the_opencode_executable_but_not_its_service() {
        let cmd = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(is_tui("opencode.exe", &cmd(&[r"C:\x\opencode.exe"])));
        assert!(is_tui("OpenCode.EXE", &cmd(&["opencode", "-c"])));
        assert!(is_tui("opencode", &cmd(&["/opt/homebrew/bin/opencode", "run", "hi"])));
        assert!(!is_tui("opencode.exe", &cmd(&["opencode.exe", "serve", "--service"])));
        assert!(!is_tui("opencode-helper", &cmd(&["opencode-helper"])));
        assert!(!is_tui("node.exe", &cmd(&["node", "opencode"])));
        assert!(is_tui("opencode", &cmd(&["serve"])), "only an argument after the program is a subcommand");
    }

    #[test]
    fn folders_compare_across_separators_and_a_trailing_one() {
        assert_eq!(folder_key("C:/Users/guill/git/Terra/"), folder_key(r"C:\Users\guill\git\Terra"));
        assert_ne!(folder_key("/a/b"), folder_key("/a/bc"));
        if cfg!(windows) {
            assert_eq!(folder_key(r"C:\Users\Guill"), folder_key(r"c:\users\guill"));
        }
    }

    #[test]
    fn an_idle_session_leaves_when_no_tui_runs_in_its_folder() {
        let at = |id: &str, status: &str, cwd: &str| Session { id: id.into(), status: status.into(), cwd: cwd.into(), ..Default::default() };
        let all = vec![at("ses_open", "idle", r"C:\git\Terra"), at("ses_closed", "idle", r"C:\git\Geneseed"), at("ses_busy", "busy", r"C:\git\Geneseed"), at("ses_ask", "waiting", r"C:\git\Geneseed")];
        let mut out = all.clone();
        keep_idle(&mut out, Some(&[folder_key("C:/git/Terra")].into()));
        assert_eq!(out.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["ses_open", "ses_busy", "ses_ask"], "running and waiting stay regardless");
        let mut out = all.clone();
        keep_idle(&mut out, Some(&HashSet::new()));
        assert_eq!(out.len(), 2, "no TUI at all: every idle session leaves");
        let mut out = all.clone();
        keep_idle(&mut out, None);
        assert_eq!(out, all, "not listed yet: the window alone decides");
    }

    /// The real process scan on this machine: its cost, and that it runs (`cargo test -- --ignored --nocapture`).
    #[test]
    #[ignore]
    fn live_tui_scan_cost() {
        let mut src = Source::new();
        let t = Instant::now();
        let n = src.tui_folders().len();
        let first = t.elapsed();
        src.tuis = None;
        let t = Instant::now();
        src.tui_folders();
        let again = t.elapsed();
        let me = src.sys.process(Pid::from_u32(std::process::id())).expect("this test process is listed");
        assert!(me.cwd().is_some(), "a process cwd is readable here");
        let count = src.sys.processes().len();
        let mut probe = System::new();
        let rss = |sys: &mut System| {
            let pid = Pid::from_u32(std::process::id());
            sys.refresh_processes_specifics(ProcessesToUpdate::Some(&[pid]), false, ProcessRefreshKind::nothing().with_memory());
            sys.process(pid).map_or(0, |p| p.memory())
        };
        let before = rss(&mut probe);
        drop(src);
        let after = rss(&mut probe);
        // the table's size: what freeing it gives back (approximate, the allocator may keep some)
        println!("tuis={n} processes={count} first={first:?} again={again:?} table≈{} KB", before.saturating_sub(after) / 1024);
    }

    fn live(active: &[&str]) -> Live {
        Live { pid: 777, alive: true, active: Some(active.iter().map(|s| s.to_string()).collect()), pending: HashMap::new() }
    }

    fn perm(id: &str, action: &str, resources: &[&str]) -> Permission {
        Permission { id: id.into(), session_id: "ses_run".into(), action: action.into(), resources: resources.iter().map(|s| s.to_string()).collect() }
    }

    #[test]
    fn status_from_the_claim_the_service_and_its_petitions() {
        let rows = [row("ses_run", None, Some(NOW - 9_000), Some(NOW - 60_000)), row("ses_idle", None, None, Some(NOW - 1_000))];
        let out = build(&rows, Some(&live(&["ses_run"])), NOW);
        let st: Vec<_> = out.iter().map(|s| (s.id.as_str(), s.status.as_str(), s.since_ms, s.pid)).collect();
        assert_eq!(st, [("ses_idle", "idle", NOW - 1_000, 777), ("ses_run", "busy", NOW - 9_000, 777)]);
        // a dead service: the claim is a crashed run, shown idle
        let dead = Live { alive: false, ..live(&["ses_run"]) };
        assert_eq!(build(&rows, Some(&dead), NOW)[1].status, "idle");
        assert_eq!(build(&rows, None, NOW)[1].status, "idle", "no registration");
        // the service answers and does not run it: idle
        assert_eq!(build(&rows, Some(&live(&[])), NOW)[1].status, "idle");
        // the service is up but /api/session/active failed: trust the claim
        assert_eq!(build(&rows, Some(&Live { active: None, ..live(&[]) }), NOW)[1].status, "busy");
    }

    #[test]
    fn a_pending_permission_is_a_petition() {
        let rows = [row("ses_run", None, Some(NOW - 9_000), None)];
        let mut l = live(&["ses_run"]);
        l.pending.insert("ses_run".into(), (perm("per_1", "shell", &["cargo test", "x"]), NOW - 500));
        let s = &build(&rows, Some(&l), NOW)[0];
        assert_eq!((s.status.as_str(), s.waiting_for.as_deref(), s.asks.as_deref()), ("waiting", Some("permission"), Some("shell: cargo test")));
        assert_eq!((s.opencode_request.as_deref(), s.since_ms), (Some("per_1"), NOW - 500));
        l.pending.insert("ses_run".into(), (perm("per_2", "external_directory", &[]), NOW - 100));
        let s = &build(&rows, Some(&l), NOW)[0];
        assert_eq!((s.asks.as_deref(), s.opencode_request.as_deref(), s.since_ms), (Some("external_directory"), Some("per_2"), NOW - 100), "a new request is a new episode");
        let busy = &build(&rows, Some(&live(&["ses_run"])), NOW)[0];
        assert_eq!((busy.waiting_for.as_ref(), busy.asks.as_ref(), busy.opencode_request.as_ref()), (None, None, None));
    }

    #[test]
    fn fields_come_from_the_row_and_its_messages() {
        let s = &build(&[row("ses_a", None, None, Some(NOW))], None, NOW)[0];
        assert_eq!((s.source, s.name.as_str(), s.title.as_deref(), s.task.as_str()), (Agent::OpenCode, "ses_a-slug", Some("ses_a title"), "“ses_a prompt”"));
        assert_eq!((s.dept.as_str(), s.temp, s.cwd.as_str()), ("Terra", false, r"C:\Users\guill\Documents\git\Terra"));
        assert_eq!(s.context, Some(Context { tokens: 1234, model: "claude-sonnet-5".into() }));
        assert_eq!((s.orca.as_ref(), s.web.as_ref(), s.limit.as_ref()), (None, None, None));
        let tmp = std::env::temp_dir().join("gs-triggers-PV9zh9").to_string_lossy().into_owned();
        let mut r = row("ses_t", None, None, Some(NOW));
        r.row.directory = tmp;
        let s = &build(&[r], None, NOW)[0];
        assert_eq!((s.dept.as_str(), s.temp), ("gs-triggers", true));
    }

    #[test]
    fn running_children_are_helpers_not_sessions() {
        let mut kid = row("ses_kid", Some("ses_run"), Some(NOW), None);
        kid.row.agent = Some("explore".into());
        let rows = [row("ses_run", None, Some(NOW), None), kid, row("ses_done", Some("ses_run"), None, Some(NOW)), row("ses_orphan", Some("ses_gone"), Some(NOW), None)];
        let out = build(&rows, Some(&live(&["ses_run", "ses_kid"])), NOW);
        assert_eq!(out.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["ses_run"]);
        let h = &out[0].helpers;
        assert_eq!(h.len(), 1, "a finished child is no longer a helper");
        assert_eq!((h[0].id.as_str(), h[0].kind.as_str(), h[0].task.as_str(), h[0].model.as_deref()), ("ses_kid", "explore", "ses_kid title", Some("claude-sonnet-5")));
        assert_eq!(h[0].context, Some(Context { tokens: 1234, model: "claude-sonnet-5".into() }));
    }

    #[test]
    fn idle_sessions_leave_after_the_window_even_on_a_quiet_database() {
        let rows = [row("ses_idle", None, None, Some(NOW)), row("ses_crash", None, Some(NOW), Some(NOW - 3_600_000))];
        let dead = Live { alive: false, ..live(&[]) };
        assert_eq!(build(&rows, Some(&dead), NOW + OPENCODE_IDLE_MS).len(), 2, "same cached rows, within the window");
        assert!(build(&rows, Some(&dead), NOW + OPENCODE_IDLE_MS + 1).is_empty(), "past it: gone");
        assert_eq!(build(&rows[1..], Some(&live(&["ses_crash"])), NOW + 10 * OPENCODE_IDLE_MS).len(), 1, "a live run stays");
    }

    #[test]
    fn the_roster_never_holds_the_password() {
        let mut l = live(&["ses_run"]);
        l.pending.insert("ses_run".into(), (perm("per_1", "shell", &["ls"]), NOW));
        let json = serde_json::to_string(&build(&[row("ses_run", None, Some(NOW), None)], Some(&l), NOW)).unwrap();
        assert!(json.contains("\"source\":\"opencode\"") && json.contains("\"opencodeRequest\":\"per_1\""), "{json}");
        assert!(!json.to_lowercase().contains("password"), "{json}");
    }

    /// A file database in WAL mode like OpenCode's, its writer connection left open.
    fn wal_db(name: &str) -> (PathBuf, PathBuf, rusqlite::Connection) {
        let dir = std::env::temp_dir().join(format!("adm-opencode-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("opencode.db");
        let c = rusqlite::Connection::open(&file).unwrap();
        c.execute_batch("PRAGMA foreign_keys = OFF; PRAGMA journal_mode = WAL;").unwrap();
        c.execute_batch(include_str!("testdata/schema.sql")).unwrap();
        (dir, file, c)
    }

    #[test]
    fn source_follows_a_live_wal_database() {
        let (dir, file, c) = wal_db("wal");
        db::tests::add_session(&c, "ses_a", None, "First", (None, Some(NOW), None));
        let mut src = test_source(file.clone(), dir.join("service.json"));
        assert_eq!(src.roster(NOW).iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["ses_a"], "rows still in the -wal");
        db::tests::add_session(&c, "ses_b", None, "Second", (None, Some(NOW), None));
        assert_eq!(src.roster(NOW).len(), 2, "a write to the -wal is seen next tick");
        let busy: i64 = c.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |r| r.get(0)).unwrap();
        assert_eq!(busy, 0, "between ticks no reader pins a snapshot: OpenCode can checkpoint");
        drop(c);
        // the writer is gone and took its -wal and -shm with it: reading would bring them back, so it does not read
        let sidecars = || ["opencode.db-wal", "opencode.db-shm"].map(|f| dir.join(f).exists());
        assert_eq!(sidecars(), [false, false]);
        assert!(src.roster(NOW).is_empty(), "OpenCode closed its database");
        assert!(test_source(file.clone(), dir.join("service.json")).roster(NOW).is_empty());
        assert_eq!(sidecars(), [false, false], "the reader wrote nothing beside OpenCode's database");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn messages_are_read_when_the_database_moved() {
        let (dir, file, c) = wal_db("messages");
        db::tests::add_session(&c, "ses_a", None, "Run", (None, Some(NOW), None));
        db::tests::add_session(&c, "ses_kid", Some("ses_a"), "Look", (None, Some(NOW), None));
        db::tests::add_message(&c, "ses_a", 1, "user", r#"{"text":"go"}"#);
        let mut src = test_source(file, dir.join("service.json"));
        let read = |src: &mut Source| src.with_messages(|rows| rows("ses_a", 0).len());
        assert_eq!(read(&mut src), 0, "before a roster read the database is not known open");
        src.roster(NOW);
        let mut fam = src.family();
        fam.sort();
        assert_eq!(fam, [("ses_a".into(), "ses_a".into(), None), ("ses_kid".into(), "ses_a".into(), Some("build".into()))]);
        assert_eq!(read(&mut src), 1);
        assert_eq!(read(&mut src), 0, "unchanged since: not read again");
        db::tests::add_message(&c, "ses_a", 2, "idle", r#"{"outcome":"succeeded"}"#);
        src.roster(NOW);
        assert_eq!(read(&mut src), 2);
        drop(c);
        src.roster(NOW); // OpenCode closed it: its -wal is gone
        assert_eq!(read(&mut src), 0);
        assert!(!dir.join("opencode.db-wal").exists(), "the reader wrote nothing beside OpenCode's database");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_closed_wal_database_is_never_opened() {
        let (dir, file, c) = wal_db("closed");
        db::tests::add_session(&c, "ses_a", None, "Run", (None, Some(NOW), None));
        drop(c);
        let sidecars = || ["opencode.db-wal", "opencode.db-shm"].map(|f| dir.join(f).exists());
        assert_eq!(sidecars(), [false, false], "the writer took its sidecars with it");
        // the hazard the -wal gate avoids: a read-only open of a closed WAL database leaves sidecars behind
        let r = db::open(&file).expect("opens");
        assert_eq!(db::shown_sessions(&r, NOW).unwrap().len(), 1);
        let during = sidecars();
        drop(r);
        let after = sidecars();
        for f in ["opencode.db-wal", "opencode.db-shm"] {
            let _ = std::fs::remove_file(dir.join(f));
        }
        assert!(during != [false, false] || after != [false, false], "a read-only open wrote nothing: the gate would be moot");
        let shown = test_source(file, dir.join("service.json")).roster(NOW);
        assert_eq!(sidecars(), [false, false], "the source wrote nothing beside OpenCode's database");
        assert!(shown.is_empty(), "OpenCode has its database closed");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_registration_before_2_x_turns_the_source_off() {
        let (dir, file, c) = wal_db("old-reg");
        db::tests::add_session(&c, "ses_a", None, "Run", (Some(NOW), None, None));
        let reg = dir.join("service.json");
        std::fs::write(&reg, r#"{"id":"svc","version":"1.14.2","url":"http://127.0.0.1:4096","pid":1,"password":"x"}"#).unwrap();
        assert!(test_source(file.clone(), reg.clone()).roster(NOW).is_empty());
        std::fs::write(&reg, r#"{"id":"svc","version":"2.0.29","url":"http://10.0.0.5:4096","pid":1,"password":"x"}"#).unwrap();
        assert_eq!(test_source(file, reg).roster(NOW)[0].status, "idle", "a 2.x service out of reach: no live state, sessions still shown");
        drop(c);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
