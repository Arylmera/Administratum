//! The end-of-day report: one day's Tithe and events summed up, for the Chronicon and, when the user turned it on, a
//! markdown file in a folder they chose (`write_capture`, never anywhere else).
use super::{Event, Tithe};
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashSet},
    fmt::Write as _,
    fs,
    path::{Path, PathBuf},
};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DayReport {
    pub day: String,
    /// Sessions seen in the day's events or its token counts.
    pub sessions: u32,
    /// Sessions that left the hall (`left` events; the break-out room's temp sessions have none).
    pub finished: u32,
    /// Turns that ran 5 minutes or more (`task-done`).
    pub long_tasks: u32,
    pub turns: u32,
    /// New tokens (cache reads left out) and every token.
    pub fresh: u64,
    pub total: u64,
    pub busy_ms: u64,
    /// By tokens, most first.
    pub depts: Vec<DeptReport>,
    /// Counts of the events worth a line: commits, pushes, failed tests, usage limits, stuck episodes, token alerts.
    pub notable: BTreeMap<String, u32>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeptReport {
    pub name: String,
    pub turns: u32,
    pub tokens: u64,
    pub busy_ms: u64,
    pub files: Vec<String>,
    pub more_files: u32,
}

const NOTABLE: [&str; 6] = ["commit", "push", "tests-fail", "limit", "stuck", "token-alert"];

pub fn report(day: &str, t: &Tithe, events: &[Event]) -> DayReport {
    let count = |kind: &str| events.iter().filter(|e| e.kind == kind).count() as u32;
    let mut depts: Vec<DeptReport> =
        t.by_project.iter().map(|(name, s)| DeptReport { name: name.clone(), turns: s.turns, tokens: s.tokens, busy_ms: s.busy_ms, files: s.files.clone(), more_files: s.more_files }).collect();
    depts.sort_by(|a, b| b.tokens.cmp(&a.tokens).then_with(|| a.name.cmp(&b.name)));
    DayReport {
        day: day.into(),
        // A session that only spent tokens has no event; older day files have no by_session.
        sessions: events.iter().map(|e| e.session_id.as_str()).filter(|id| !id.is_empty()).chain(t.by_session.keys().map(String::as_str)).collect::<HashSet<_>>().len() as u32,
        finished: count("left"),
        long_tasks: count("task-done"),
        turns: depts.iter().map(|d| d.turns).sum(),
        fresh: t.tokens.fresh(),
        total: t.tokens.total(),
        busy_ms: t.busy_ms,
        depts,
        notable: NOTABLE.iter().map(|k| (k.to_string(), count(k))).filter(|(_, n)| *n > 0).collect(),
    }
}

/// "2h05" / "12m", as the Chronicon writes working time.
fn dur(ms: u64) -> String {
    let m = ms / 60_000;
    if m < 60 {
        format!("{m}m")
    } else {
        format!("{}h{:02}", m / 60, m % 60)
    }
}

impl DayReport {
    /// Plain markdown with a small neutral frontmatter (readable by Obsidian and by anyone else).
    pub fn markdown(&self) -> String {
        let tok = crate::monitor::fmt_tokens;
        let mut s = format!("---\ndate: {}\nsource: Administratum\ntags: [administratum]\n---\n\n# Day report — {}\n\n", self.day, self.day);
        let _ = writeln!(
            s,
            "{} sessions ({} finished), {} turns ({} long), {} of work, {} new tokens ({} in all).",
            self.sessions,
            self.finished,
            self.turns,
            self.long_tasks,
            dur(self.busy_ms),
            tok(self.fresh),
            tok(self.total)
        );
        if !self.depts.is_empty() {
            s.push_str("\n## Departments\n");
        }
        for d in &self.depts {
            let _ = writeln!(s, "\n### {}\n\n{} turns · {} tokens · {} of work", d.name, d.turns, tok(d.tokens), dur(d.busy_ms));
            if !d.files.is_empty() {
                s.push('\n');
            }
            for f in &d.files {
                let _ = writeln!(s, "- {f}");
            }
            if d.more_files > 0 {
                let _ = writeln!(s, "- +{} more", d.more_files);
            }
        }
        if !self.notable.is_empty() {
            s.push_str("\n## Notable\n\n");
            for (k, n) in &self.notable {
                let _ = writeln!(s, "- {k}: {n}");
            }
        }
        s
    }
}

/// Writes `r` as `<day>-administratum-day.md` into `dir`, replacing that day's file (temp + rename). Refuses a
/// relative or missing folder: it is never created.
pub fn write_capture(dir: &Path, r: &DayReport) -> Result<PathBuf, String> {
    if !dir.is_absolute() || !dir.is_dir() {
        return Err(format!("not an existing absolute folder: {}", dir.display()));
    }
    let path = dir.join(format!("{}-administratum-day.md", r.day));
    let tmp = path.with_extension("md.tmp");
    fs::write(&tmp, r.markdown()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chronicle::{Share, Tokens};

    fn ev(kind: &str, id: &str) -> Event {
        Event { ts: 0, kind: kind.into(), session_id: id.into(), name: id.into(), dept: "Terra".into(), helper: None, detail: String::new() }
    }

    fn day() -> DayReport {
        let mut t = Tithe::new("2026-10-16");
        t.tokens = Tokens { input: 10, output: 20, cache_read: 1000, cache_write: 5 };
        t.busy_ms = 7_500_000;
        t.by_project.insert("Terra".into(), Share { tokens: 900, busy_ms: 7_000_000, turns: 3, files: vec!["src/a.rs".into()], more_files: 2 });
        t.by_project.insert("Geneseed".into(), Share { tokens: 135, busy_ms: 500_000, turns: 1, ..Default::default() });
        let events = [ev("arrived", "a"), ev("commit", "a"), ev("commit", "b"), ev("left", "b"), ev("task-done", "a"), ev("vigil", "")];
        report("2026-10-16", &t, &events)
    }

    #[test]
    fn report_of_a_fixed_day() {
        let r = day();
        assert_eq!((r.sessions, r.finished, r.long_tasks, r.turns, r.fresh, r.total, r.busy_ms), (2, 1, 1, 4, 35, 1035, 7_500_000));
        assert_eq!(r.depts.iter().map(|d| d.name.as_str()).collect::<Vec<_>>(), ["Terra", "Geneseed"], "most tokens first");
        assert_eq!(r.notable, BTreeMap::from([("commit".to_string(), 2)]));
        let mut t = Tithe::new("2026-10-16");
        t.by_session.insert("a".into(), Default::default());
        t.by_session.insert("quiet".into(), Default::default());
        assert_eq!(report("2026-10-16", &t, &[ev("commit", "a")]).sessions, 2, "a session with tokens but no event counts");
    }

    #[test]
    fn markdown_has_frontmatter_and_sections() {
        let md = day().markdown();
        assert!(md.starts_with("---\ndate: 2026-10-16\nsource: Administratum\ntags: [administratum]\n---\n"), "{md}");
        for part in
            ["# Day report — 2026-10-16", "2 sessions (1 finished), 4 turns (1 long), 2h05 of work, 35 new tokens", "### Terra", "- src/a.rs\n- +2 more", "### Geneseed", "## Notable", "- commit: 2"]
        {
            assert!(md.contains(part), "missing {part:?} in\n{md}");
        }
    }

    #[test]
    fn capture_refuses_bad_folders() {
        let missing = std::env::temp_dir().join(format!("adm-report-missing-{}", std::process::id()));
        assert!(write_capture(&missing, &day()).is_err());
        assert!(!missing.exists(), "never created");
        // An existing folder given relative (cargo runs tests in src-tauri/, where target/ exists): refused, not written.
        let rel = Path::new("target");
        assert!(rel.is_dir(), "the fixture folder exists");
        assert!(write_capture(rel, &day()).is_err());
        assert!(!rel.join("2026-10-16-administratum-day.md").exists());
    }

    #[test]
    fn capture_writes_and_overwrites() {
        let d = std::env::temp_dir().join(format!("adm-report-{}", std::process::id()));
        fs::create_dir_all(&d).unwrap();
        let mut r = day();
        let p = write_capture(&d, &r).unwrap();
        assert_eq!(p, d.join("2026-10-16-administratum-day.md"));
        r.turns = 99;
        write_capture(&d, &r).unwrap();
        assert!(fs::read_to_string(&p).unwrap().contains("99 turns"), "the same day's file is replaced");
        assert_eq!(fs::read_dir(&d).unwrap().count(), 1, "no temp file left");
        let _ = fs::remove_dir_all(&d);
    }
}
