//! Two sessions on one file, and a port already in use (O13). Pure: display only, nothing is sent to Claude.
use crate::registry::Session;
use std::collections::{HashMap, HashSet};

/// How long an edit counts toward a conflict: an edit exactly this old still counts.
pub const WINDOW_MS: i64 = 20 * 60_000;

/// The key two paths are compared by: a Windows path (`X:` first) with either slash and any case is one file; other
/// paths compare as written.
pub fn path_key(p: &str) -> String {
    let b = p.as_bytes();
    if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' {
        p.replace('/', "\\").to_lowercase()
    } else {
        p.to_string()
    }
}

/// A path's file name (either slash), what the hall shows: never the full path.
pub fn file_name(p: &str) -> &str {
    p.rsplit(['\\', '/']).next().unwrap_or(p)
}

/// One pair of live sessions that edited the same file within the window: their ids (a < b), the path as `a` wrote it,
/// and the path's key.
#[derive(Clone, Debug, PartialEq)]
pub struct Pair {
    pub a: String,
    pub b: String,
    pub path: String,
    pub key: String,
}

/// Drops the edits older than the window (`recent`: per session id, (ts, absolute path); a subagent's edits are kept
/// under its parent's id, so a session never conflicts with its own subagent).
pub fn prune(recent: &mut HashMap<String, Vec<(i64, String)>>, now: i64) {
    for v in recent.values_mut() {
        v.retain(|(ts, _)| now - ts <= WINDOW_MS);
    }
    recent.retain(|_, v| !v.is_empty());
}

/// The pairs of live sessions (`roster`) whose edits in the window touched the same file, sorted, one per pair and path.
pub fn pairs(recent: &HashMap<String, Vec<(i64, String)>>, roster: &[Session], now: i64) -> Vec<Pair> {
    let live: HashSet<&str> = roster.iter().map(|s| s.id.as_str()).collect();
    let mut by_file: HashMap<String, Vec<(&str, &str)>> = HashMap::new(); // key -> (session, path as written)
    for (id, edits) in recent.iter().filter(|(id, _)| live.contains(id.as_str())) {
        for (_, p) in edits.iter().filter(|(ts, _)| now - ts <= WINDOW_MS) {
            let list = by_file.entry(path_key(p)).or_default();
            if !list.iter().any(|(s, _)| s == id) {
                list.push((id, p));
            }
        }
    }
    let mut out = vec![];
    for (key, list) in by_file {
        for (i, x) in list.iter().enumerate() {
            for y in &list[i + 1..] {
                let ((a, path), (b, _)) = if x.0 < y.0 { (x, y) } else { (y, x) }; // the path as `a` wrote it: the same each tick
                out.push(Pair { a: (*a).into(), b: (*b).into(), path: (*path).into(), key: key.clone() });
            }
        }
    }
    out.sort_by(|x, y| (&x.a, &x.b, &x.key).cmp(&(&y.a, &y.b, &y.key)));
    out
}

/// The tools whose output can say a port is in use: a shell and its output reader.
pub const SHELL_TOOLS: [&str; 3] = ["Bash", "PowerShell", "BashOutput"];

/// The port a tool result says is already in use: Some(port) or Some("?") when it names none; None when it says no
/// such thing (`EADDRINUSE`, `address already in use`, `port … is already in use`).
pub fn port_in_use(text: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let line = lower.lines().find(|l| l.contains("eaddrinuse") || l.contains("address already in use") || (l.contains("port") && l.contains("already in use")))?;
    let digits = |s: &str| -> Option<String> {
        let d: String = s.chars().take_while(char::is_ascii_digit).collect();
        (2..=5).contains(&d.len()).then_some(d)
    };
    // "port 3000 is already in use", else the last ":<port>" on the line (":::3000", "0.0.0.0:8080")
    let named = line.match_indices("port ").find_map(|(i, _)| digits(&line[i + 5..]));
    Some(named.or_else(|| line.rmatch_indices(':').find_map(|(i, _)| digits(&line[i + 1..]))).unwrap_or_else(|| "?".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::tests_session;

    const NOW: i64 = 100 * 60_000;
    fn edits(list: &[(&str, i64, &str)]) -> HashMap<String, Vec<(i64, String)>> {
        let mut m: HashMap<String, Vec<(i64, String)>> = HashMap::new();
        for (id, ago, p) in list {
            m.entry((*id).into()).or_default().push((NOW - ago, (*p).into()));
        }
        m
    }
    fn roster(ids: &[&str]) -> Vec<Session> {
        ids.iter().map(|id| tests_session(id)).collect()
    }
    fn ids(p: &[Pair]) -> Vec<(&str, &str, &str)> {
        p.iter().map(|p| (p.a.as_str(), p.b.as_str(), p.key.as_str())).collect()
    }

    #[test]
    fn two_sessions_on_one_file() {
        let r = roster(&["a", "b", "c"]);
        let e = edits(&[("b", 60_000, r"C:\git\Terra\ui\app.js"), ("a", 5 * 60_000, "c:/git/terra/UI/app.js"), ("c", 0, r"C:\git\Terra\ui\other.js")]);
        assert_eq!(ids(&pairs(&e, &r, NOW)), [("a", "b", r"c:\git\terra\ui\app.js")], "case and slashes ignored on a Windows path");
        assert_eq!(pairs(&e, &r, NOW)[0].path, "c:/git/terra/UI/app.js");
        let unix = edits(&[("a", 0, "/home/x/App.js"), ("b", 0, "/home/x/app.js")]);
        assert!(pairs(&unix, &r, NOW).is_empty(), "a path without a drive compares as written");
    }

    #[test]
    fn the_window_is_twenty_minutes_inclusive() {
        let r = roster(&["a", "b"]);
        let at = |ago| edits(&[("a", 0, r"C:\x\f.rs"), ("b", ago, r"C:\x\f.rs")]);
        assert_eq!(pairs(&at(WINDOW_MS), &r, NOW).len(), 1, "exactly 20 min old still counts");
        assert!(pairs(&at(WINDOW_MS + 1), &r, NOW).is_empty(), "older: no conflict");
        let mut e = at(WINDOW_MS + 1);
        prune(&mut e, NOW);
        assert_eq!(e.len(), 1, "the stale edit and its now-empty session are dropped");
        let mut edge = at(WINDOW_MS);
        prune(&mut edge, NOW);
        assert_eq!(edge.len(), 2, "prune keeps an edit exactly 20 min old");
    }

    #[test]
    fn no_self_conflict_and_subagents_fold_into_their_parent() {
        let r = roster(&["a", "b"]);
        // a's own two edits (its main transcript and a subagent's, both kept under a's id): no pair.
        let own = edits(&[("a", 0, r"C:\x\f.rs"), ("a", 1000, r"C:\x\F.rs")]);
        assert!(pairs(&own, &r, NOW).is_empty());
        let gone = edits(&[("a", 0, r"C:\x\f.rs"), ("zz", 0, r"C:\x\f.rs")]);
        assert!(pairs(&gone, &r, NOW).is_empty(), "a session no longer live is no pair");
        let three = edits(&[("c", 0, r"C:\x\f.rs"), ("a", 0, r"C:\x\f.rs"), ("b", 0, r"C:\x\f.rs")]);
        assert_eq!(ids(&pairs(&three, &roster(&["a", "b", "c"]), NOW)).len(), 3, "three sessions: three pairs");
    }

    #[test]
    fn ports_in_use() {
        assert_eq!(port_in_use("Error: listen EADDRINUSE: address already in use :::3000").as_deref(), Some("3000"));
        assert_eq!(port_in_use("OSError: [Errno 98] Address already in use").as_deref(), Some("?"));
        assert_eq!(port_in_use("Port 5173 is already in use").as_deref(), Some("5173"));
        assert_eq!(port_in_use("bind 0.0.0.0:8080: address already in use").as_deref(), Some("8080"));
        assert_eq!(port_in_use("ok\nError: port 8123 is already in use, try another").as_deref(), Some("8123"));
        assert_eq!(port_in_use("all good on port 3000"), None);
        assert_eq!(port_in_use("file already in use"), None);
    }

    #[test]
    fn file_names_only() {
        assert_eq!(file_name(r"C:\git\Terra\ui\app.js"), "app.js");
        assert_eq!(file_name("/home/x/a.rs"), "a.rs");
        assert_eq!(file_name("plain"), "plain");
    }
}
