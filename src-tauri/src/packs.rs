//! Theme packs: folders of themes from outside in `<app data>/themes/` (ui/themes.js `loadPacks`), listed and read
//! here, never trusted. `list` names each pack and its theme folders; `read` serves one of its files, by a path it
//! checks in full (the UI is not the guard): `<dir>/pack.json` or `<dir>/<folder>/<name>.json|png`, plain segments
//! only, a regular file of at most 2 MiB whose canonical path stays inside the themes root at that same shape. A
//! pack's `pack-source.json` (where it was installed from) is read by `list`, never served. No Tauri in here.

use serde::Serialize;
use std::{
    fs,
    io::Read,
    path::{Component, Path},
};

/// The largest file a pack may serve.
pub const MAX_FILE: u64 = 2 * 1024 * 1024;
const SOURCE: &str = "pack-source.json";
const MAX_SOURCE: u64 = 64 * 1024;

/// A pack as the UI loads it: `id` is `owner/repo` when its `pack-source.json` names a repo, else `local/<dir>`;
/// `dir` its folder under the themes root; `themes` its sub-folders holding a `theme.json`, sorted.
#[derive(Debug, PartialEq, Serialize)]
pub struct Pack {
    pub id: String,
    pub dir: String,
    pub repo: Option<String>,
    pub installed: Option<String>,
    pub themes: Vec<String>,
}

/// A plain name: ASCII letters, digits, `.`, `-`, `_`, not empty, no leading `.` (so no `..`, no hidden file, no
/// escape, no separator, no drive prefix).
pub fn plain(s: &str) -> bool {
    !s.is_empty() && !s.starts_with('.') && s.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'-' | b'_'))
}

/// `owner/repo`, two plain names.
fn repo_ok(r: &str) -> bool {
    r.split_once('/').is_some_and(|(o, n)| plain(o) && plain(n))
}

/// The plain-named sub-folders of `dir` (real folders, not links), sorted.
fn folders(dir: &Path) -> Vec<String> {
    let Ok(rd) = fs::read_dir(dir) else { return Vec::new() };
    let mut out: Vec<String> = rd.flatten().filter(|e| e.file_type().is_ok_and(|t| t.is_dir())).filter_map(|e| e.file_name().into_string().ok()).filter(|n| plain(n)).collect();
    out.sort();
    out
}

/// `{ "repo", "installed" }` from a pack's `pack-source.json`, when it is there, small, and names a valid repo.
fn source(dir: &Path) -> Option<(String, Option<String>)> {
    let p = dir.join(SOURCE);
    if !fs::symlink_metadata(&p).is_ok_and(|m| m.is_file() && m.len() <= MAX_SOURCE) {
        return None;
    }
    let v: serde_json::Value = serde_json::from_slice(&fs::read(p).ok()?).ok()?;
    let repo = v["repo"].as_str().filter(|r| repo_ok(r))?.to_string();
    Some((repo, v["installed"].as_str().map(str::to_string)))
}

/// The packs under `root`, by folder name; a missing or unreadable root gives none.
pub fn list(root: &Path) -> Vec<Pack> {
    folders(root)
        .into_iter()
        .map(|dir| {
            let at = root.join(&dir);
            let themes = folders(&at).into_iter().filter(|f| fs::symlink_metadata(at.join(f).join("theme.json")).is_ok_and(|m| m.is_file())).collect();
            let (repo, installed) = source(&at).map_or((None, None), |(r, i)| (Some(r), i));
            Pack { id: repo.clone().unwrap_or_else(|| format!("local/{dir}")), dir, repo, installed, themes }
        })
        .collect()
}

/// A path a pack may serve: `<dir>/pack.json` or `<dir>/<folder>/<name>.json|png`, every segment plain.
fn servable(rel: &str) -> bool {
    let s: Vec<&str> = rel.split('/').collect();
    s.iter().all(|x| plain(x))
        && match s.as_slice() {
            [_, file] => *file == "pack.json",
            [_, _, file] => file.ends_with(".json") || file.ends_with(".png"),
            _ => false,
        }
}

/// The bytes of the pack file `rel` under `root`, or None when it is not one a pack may serve (see the module doc).
pub fn read(root: &Path, rel: &str) -> Option<Vec<u8>> {
    if !servable(rel) {
        return None;
    }
    let base = fs::canonicalize(root).ok()?;
    let real = fs::canonicalize(base.join(rel)).ok()?;
    // the canonical path, a link resolved, is again a servable path inside the root
    let inside: Vec<&str> = real.strip_prefix(&base).ok()?.components().map(|c| if let Component::Normal(n) = c { n.to_str() } else { None }).collect::<Option<_>>()?;
    if !servable(&inside.join("/")) || !fs::metadata(&real).is_ok_and(|m| m.is_file() && m.len() <= MAX_FILE) {
        return None;
    }
    let mut bytes = Vec::new();
    fs::File::open(&real).ok()?.take(MAX_FILE + 1).read_to_end(&mut bytes).ok()?;
    (bytes.len() as u64 <= MAX_FILE).then_some(bytes) // it may have grown since the check
}

/// The content type a pack file is served with, by its extension (`read` serves only these two).
pub fn mime(rel: &str) -> &'static str {
    if rel.ends_with(".png") {
        "image/png"
    } else {
        "application/json"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("adm-packs-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn put(root: &Path, rel: &str, bytes: &[u8]) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, bytes).unwrap();
    }

    #[test]
    fn lists_the_packs_and_their_themes() {
        let root = tmp("list");
        put(&root, "a__b/pack-source.json", br#"{"repo": "a/b", "installed": "2026-11-16T10:00:00Z"}"#);
        put(&root, "a__b/pink/theme.json", b"{}");
        put(&root, "a__b/blue/theme.json", b"{}");
        put(&root, "a__b/notes/readme.txt", b"no theme here");
        put(&root, "mine/green/theme.json", b"{}");
        fs::create_dir_all(root.join("empty")).unwrap();
        put(&root, ".hidden/x/theme.json", b"{}");
        put(&root, ".tmp-install/x/theme.json", b"{}");
        put(&root, "odd/pack-source.json", br#"{"repo": "../evil"}"#); // not a repo: a local pack
        put(&root, "a file", b"not a folder");
        let packs = list(&root);
        let p = |id: &str, dir: &str, repo: Option<&str>, installed: Option<&str>, themes: &[&str]| Pack {
            id: id.into(),
            dir: dir.into(),
            repo: repo.map(Into::into),
            installed: installed.map(Into::into),
            themes: themes.iter().map(|t| t.to_string()).collect(),
        };
        assert_eq!(
            packs,
            [
                p("a/b", "a__b", Some("a/b"), Some("2026-11-16T10:00:00Z"), &["blue", "pink"]),
                p("local/empty", "empty", None, None, &[]),
                p("local/mine", "mine", None, None, &["green"]),
                p("local/odd", "odd", None, None, &[]),
            ]
        );
        assert_eq!(list(&root.join("missing")), []);
        let json = serde_json::to_value(&packs[0]).unwrap();
        assert_eq!(json["themes"][0], "blue");
        assert_eq!(json["installed"], "2026-11-16T10:00:00Z");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn reads_only_the_files_a_pack_may_serve() {
        let root = tmp("read");
        let outside = tmp("read-outside");
        put(&root, "p/pink/theme.json", b"{\"name\":\"Pink\"}");
        put(&root, "p/pink/breakout.png", b"\x89PNG");
        put(&root, "p/pack.json", b"{}");
        put(&root, "p/pack-source.json", br#"{"repo": "a/p"}"#);
        put(&root, "p/pink/x.js", b"alert(1)");
        put(&root, "p/a/b/c.json", b"{}");
        put(&root, "p/.git/config", b"[core]");
        put(&root, "p/.pink/theme.json", b"{}");
        put(&root, "p/pink/big.json", &vec![b' '; 3 * 1024 * 1024]);
        put(&root, "p/pink/edge.json", &vec![b' '; MAX_FILE as usize]);
        put(&outside, "secret.json", b"secret");
        fs::create_dir_all(root.join("p/pink/dir.json")).unwrap();
        assert_eq!(read(&root, "p/pink/theme.json").as_deref(), Some(&b"{\"name\":\"Pink\"}"[..]));
        assert_eq!(read(&root, "p/pink/breakout.png").as_deref(), Some(&b"\x89PNG"[..]));
        assert_eq!(read(&root, "p/pack.json").as_deref(), Some(&b"{}"[..]));
        assert_eq!(read(&root, "p/pink/edge.json").map(|b| b.len()), Some(MAX_FILE as usize), "2 MiB exactly is served");
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            symlink(outside.join("secret.json"), root.join("p/pink/out.json")).unwrap();
            symlink(&outside, root.join("p/linked")).unwrap();
            symlink(root.join("p/pack-source.json"), root.join("p/pink/src.json")).unwrap();
            symlink(root.join("p/pink/theme.json"), root.join("p/pink/same.json")).unwrap();
            assert_eq!(read(&root, "p/pink/out.json"), None, "a link pointing outside");
            assert_eq!(read(&root, "p/linked/secret.json"), None, "a linked folder pointing outside");
            assert_eq!(read(&root, "p/pink/src.json"), None, "a link to the source file");
            assert!(read(&root, "p/pink/same.json").is_some(), "a link to a servable file inside the root");
        }
        for bad in [
            "p/../x",
            "p/pink/../../p/pack.json",
            "/etc/passwd",
            "../etc/passwd",
            "p/pink/x.js",
            "p/a/b/c.json",
            "p/.git/config",
            "p/.pink/theme.json",
            "p/pink/big.json",
            "p/pack-source.json",
            "p/pink/dir.json",
            "p/pink/missing.json",
            "p/pink/theme.JSON",
            "p/pink/.json",
            "p/pink/theme.json/",
            "p//theme.json",
            "p/pink//theme.json",
            "/p/pink/theme.json",
            "./p/pack.json",
            "p/pink/%2e%2e/theme.json",
            "p%2fpink/theme.json",
            "p\\pink\\theme.json",
            "p/pink\\..\\theme.json",
            "p/pink/theme.json\0",
            "p/pink/the\0me.json",
            "C:/p/pack.json",
            "C:p/pack.json",
            "p/pink/theme.json ",
            "p/pin k/theme.json",
            "p/pïnk/theme.json",
            "pack.json",
            "",
            "/",
            "p",
            "p/",
        ] {
            assert_eq!(read(&root, bad), None, "{bad:?}");
        }
        assert_eq!(read(&root.join("missing"), "p/pack.json"), None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn a_pack_file_is_json_or_png() {
        assert_eq!(mime("p/pink/breakout.png"), "image/png");
        assert_eq!(mime("p/pink/theme.json"), "application/json");
        assert_eq!(mime("p/pack.json"), "application/json");
    }
}
