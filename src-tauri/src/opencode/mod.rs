//! OpenCode 2.x sessions, a second source beside the Claude registry: its SQLite database read read-only (`db`),
//! its loopback service asked only for live state (`service`). Nothing of OpenCode's is ever written, and the
//! service password never leaves `service`.
mod db;
mod service;

use crate::registry::{self, Agent, Context, Helper, Session};
use service::Permission;
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

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
            ..Default::default()
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
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
}

impl Source {
    pub fn new() -> Self {
        Source::at(db_path(), service::registration_path())
    }

    fn at(db: PathBuf, registration: PathBuf) -> Self {
        Source { db, registration, stamp: None, rows: vec![], seen: HashMap::new(), logged: HashSet::new() }
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
        build(&self.rows, live.as_ref(), now_ms)
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
        let parent: HashMap<&str, &str> = rows.iter().filter_map(|s| Some((s.row.id.as_str(), s.row.parent_id.as_deref()?))).collect();
        let root = |mut id: &'a str| {
            for _ in 0..16 {
                // bounded: a parent cycle in the DB cannot hang the tick
                match parent.get(id) {
                    Some(p) => id = p,
                    None => break,
                }
            }
            id
        };
        rows.iter().filter(|s| s.row.time_suspended.is_some() && active.contains(&s.row.id)).map(|s| (s.row.id.as_str(), root(&s.row.id))).collect()
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
                if let Some(p) = service::pending(&reg, ask).ok().and_then(|v| v.into_iter().next()) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{BufRead, BufReader, Write},
        net::TcpListener,
        thread,
    };

    /// A fake service answering every GET by path from `routes` (404 otherwise), until the test process ends.
    fn fake_service(routes: Vec<(&'static str, &'static str)>) -> u16 {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        thread::spawn(move || {
            for s in l.incoming().flatten() {
                let mut r = BufReader::new(s);
                let mut first = String::new();
                r.read_line(&mut first).unwrap();
                loop {
                    let mut line = String::new();
                    if r.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                        break;
                    }
                }
                let path = first.split(' ').nth(1).unwrap_or_default();
                let reply = match routes.iter().find(|(p, _)| *p == path) {
                    Some((_, body)) => format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()),
                    None => "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into(),
                };
                r.get_mut().write_all(reply.as_bytes()).unwrap();
            }
        });
        port
    }

    #[test]
    fn source_reads_the_database_and_asks_the_service() {
        const SECRET: &str = "pa55-w0rd-xyz";
        let (dir, db_file, c) = wal_db("source");
        db::tests::add_session(&c, "ses_run", None, "Fix the card", (Some(NOW - 5_000), None, None));
        db::tests::add_message(&c, "ses_run", 1, "user", r#"{"text":"fix the card"}"#);
        let port = fake_service(vec![
            ("/api/session/active", r#"{"data":{"ses_run":{"type":"running"}}}"#),
            ("/api/session/ses_run/permission", r#"{"data":[{"id":"per_7","sessionID":"ses_run","action":"shell","resources":["cargo test"]}]}"#),
        ]);
        let reg = dir.join("service.json");
        std::fs::write(&reg, format!(r#"{{"id":"svc","version":"2.0.29","url":"http://127.0.0.1:{port}","pid":{},"password":"{SECRET}"}}"#, std::process::id())).unwrap();
        let mut src = Source::at(db_file.clone(), reg.clone());
        let first = src.roster(NOW);
        assert_eq!(first.len(), 1);
        let s = &first[0];
        assert_eq!((s.status.as_str(), s.opencode_request.as_deref(), s.since_ms, s.pid), ("waiting", Some("per_7"), NOW, std::process::id()));
        assert_eq!((s.task.as_str(), s.title.as_deref()), ("“fix the card”", Some("Fix the card")));
        let again = src.roster(NOW + 1_000);
        assert_eq!(again[0].since_ms, NOW, "the same request is the same petition episode");
        assert!(!serde_json::to_string(&again).unwrap().contains(SECRET));
        // no registration: the claim stands alone, shown idle
        std::fs::remove_file(&reg).unwrap();
        assert_eq!(src.roster(NOW + 2_000)[0].status, "idle");
        drop(c);
        let _ = std::fs::remove_dir_all(&dir);
        assert!(Source::at(dir.join("opencode.db"), dir.join("service.json")).roster(NOW).is_empty(), "no OpenCode installed");
    }

    const NOW: i64 = 50_000_000;

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
        let mut src = Source::at(file.clone(), dir.join("service.json"));
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
        assert!(Source::at(file.clone(), dir.join("service.json")).roster(NOW).is_empty());
        assert_eq!(sidecars(), [false, false], "the reader wrote nothing beside OpenCode's database");
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
        let shown = Source::at(file, dir.join("service.json")).roster(NOW);
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
        assert!(Source::at(file.clone(), reg.clone()).roster(NOW).is_empty());
        std::fs::write(&reg, r#"{"id":"svc","version":"2.0.29","url":"http://10.0.0.5:4096","pid":1,"password":"x"}"#).unwrap();
        assert_eq!(Source::at(file, reg).roster(NOW)[0].status, "idle", "a 2.x service out of reach: no live state, sessions still shown");
        drop(c);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
