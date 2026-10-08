//! Transcript files: one stat, the subagents listing, where a session's transcript lives, its last bytes.
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

/// A transcript file with the size and mtime one stat (or directory listing) gave.
#[derive(Clone, Debug, PartialEq)]
pub struct FileStat {
    pub path: PathBuf,
    pub len: u64,
    pub mtime_ms: i64,
}

fn mtime_ms(m: &fs::Metadata) -> i64 {
    m.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(i64::MAX, |d| d.as_millis() as i64)
}

/// One stat of a regular file.
pub fn stat(path: &Path) -> Option<FileStat> {
    let m = fs::metadata(path).ok().filter(|m| m.is_file())?;
    Some(FileStat { path: path.to_path_buf(), len: m.len(), mtime_ms: mtime_ms(&m) })
}

/// Every `agent-<id>.jsonl` in a session's `subagents` dir, sorted by path; sizes come from the
/// listing itself (free on Windows), no stat per file.
pub fn list_subagents(dir: &Path) -> Vec<FileStat> {
    let mut out: Vec<FileStat> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.file_name().to_str().is_some_and(|n| n.starts_with("agent-") && n.ends_with(".jsonl")))
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            Some(FileStat { path: e.path(), len: m.len(), mtime_ms: mtime_ms(&m) })
        })
        .collect();
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

pub(super) const TAIL_BYTES: u64 = 65536;
pub(super) const BIG_TAIL_BYTES: u64 = 512 * 1024;

/// `cwd` turned into the project-folder slug Claude Code uses under `~/.claude/projects`:
/// every non-alphanumeric-ASCII char becomes `-` (e.g. `C:\Users\x\git\Foo` -> `C--Users-x-git-Foo`).
pub(crate) fn slug(cwd: &str) -> String {
    cwd.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect()
}

/// `<projects>/<slug(cwd)>/<session_id>.jsonl`, where Claude Code writes a session's transcript.
pub fn direct_transcript(projects: &Path, session_id: &str, cwd: &str) -> PathBuf {
    projects.join(slug(cwd)).join(format!("{session_id}.jsonl"))
}

/// `<session_id>.jsonl` in any project folder: one stat per folder, for when the direct slug
/// path misses (e.g. cwd changed since the session started). The caller caches the answer.
pub fn find_transcript(projects: &Path, session_id: &str) -> Option<PathBuf> {
    let file = format!("{session_id}.jsonl");
    fs::read_dir(projects).ok()?.flatten().map(|e| e.path().join(&file)).find(|p| p.is_file())
}

/// Last `tail_bytes` of `path`, cut to whole lines (the first partial line is dropped).
pub fn file_tail(path: &Path, tail_bytes: u64) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = fs::File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    f.seek(SeekFrom::Start(len.saturating_sub(tail_bytes))).ok()?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf).into_owned();
    Some(if len > tail_bytes { text.split_once('\n').map(|(_, rest)| rest.to_string()).unwrap_or_default() } else { text })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::testutil::*;

    #[test]
    fn transcript_direct_slug_path() {
        let cwd = r"C:\Users\guill\Documents\git\Administratum";
        assert_eq!(direct_transcript(Path::new("p"), "abc", cwd), Path::new("p").join("C--Users-guill-Documents-git-Administratum").join("abc.jsonl"));
    }

    #[test]
    fn transcript_found_in_any_project_and_tail_cut_to_whole_lines() {
        let d = temp_dir("projects");
        fs::create_dir_all(d.join("C--git-Terra")).unwrap();
        let line = r#"{"type":"user","message":{"content":"x"}}"#;
        let big = std::iter::repeat(line).take(3000).collect::<Vec<_>>().join("\n");
        fs::write(d.join("C--git-Terra").join("abc.jsonl"), &big).unwrap();
        let path = find_transcript(&d, "abc").expect("found via fallback scan");
        let tail = file_tail(&path, 65536).unwrap();
        assert!(tail.len() <= 65536);
        assert!(tail.lines().all(|l| l == line), "first partial line dropped");
        assert!(find_transcript(&d, "nope").is_none());
    }
}
