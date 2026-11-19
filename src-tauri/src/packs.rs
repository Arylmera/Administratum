//! Theme packs: folders of themes from outside in `<app data>/themes/` (ui/themes.js `loadPacks`), listed and read
//! here, never trusted. `list` names each pack and its theme folders; `read` serves one of its files, by a path it
//! checks in full (the UI is not the guard): `<dir>/pack.json` or `<dir>/<folder>/<name>.json|png`, plain segments
//! only, a regular file of at most 2 MiB whose canonical path stays inside the themes root at that same shape. A
//! pack's `pack-source.json` (where it was installed from) is read by `list`, never served. No Tauri in here.

use serde::Serialize;
use std::{
    fs,
    io::{self, Read, Write},
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

/// The largest file a pack may serve.
pub const MAX_FILE: u64 = 2 * 1024 * 1024;
const SOURCE: &str = "pack-source.json";
const MAX_SOURCE: u64 = 64 * 1024;

/// A pack as the UI loads it: `id` is `owner/repo` lower-cased when its `pack-source.json` names a repo (GitHub names
/// ignore case: `Alice/T` and `alice/t` are one pack, one folder, one id), else `local/<dir>`; `repo` the repo as
/// typed, for display; `dir` its folder under the themes root; `themes` its sub-folders holding a `theme.json`, sorted.
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

/// `owner/repo` as GitHub names them: an owner of 1 to 39 letters, digits and `-`, not starting with `-`, and a
/// repository of 1 to 100 letters, digits, `.`, `-`, `_`, neither `.` nor `..`. The owner `local` (any case) is
/// refused: `local/<dir>` is the id of a pack dropped by hand, which an installed pack must not claim.
pub fn repo_ok(r: &str) -> bool {
    let Some((o, n)) = r.split_once('/') else { return false };
    let owner = (1..=39).contains(&o.len()) && o.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') && !o.starts_with('-');
    let name = (1..=100).contains(&n.len()) && n.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'-' | b'_')) && n != "." && n != "..";
    owner && name && !o.eq_ignore_ascii_case("local")
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

/// The packs under `root`, by folder name; a missing or unreadable root gives none. Two folders naming one repo (any
/// case): the first by folder name is that repo's pack, the other is listed as a local pack (`local/<dir>`), so it is
/// seen, never silently lost.
pub fn list(root: &Path) -> Vec<Pack> {
    let mut seen = std::collections::HashSet::new();
    folders(root)
        .into_iter()
        .map(|dir| {
            let at = root.join(&dir);
            let themes = folders(&at).into_iter().filter(|f| fs::symlink_metadata(at.join(f).join("theme.json")).is_ok_and(|m| m.is_file())).collect();
            let (repo, installed) = source(&at).filter(|(r, _)| seen.insert(r.to_ascii_lowercase())).map_or((None, None), |(r, i)| (Some(r), i));
            Pack { id: repo.as_deref().map_or_else(|| format!("local/{dir}"), str::to_ascii_lowercase), dir, repo, installed, themes }
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

// ---- install, update, remove: everything that decides what reaches the disk, from bytes and paths (no network)

/// The largest archive downloaded (main.rs stops reading past it).
pub const MAX_ARCHIVE: usize = 20 * 1024 * 1024;
/// How old a `.tmp-*` / `.old-*` work folder must be before `install` takes it for a crashed run's.
const STALE: Duration = Duration::from_secs(10 * 60);
const LICENCES: [&str; 3] = ["LICENSE", "LICENSE.md", "LICENSE.txt"];

/// What an archive without a theme is told (`keep`).
const NO_THEME: &str = "no theme in this repository: a theme is a folder holding theme.json at the top of the repository";

/// What `unpack` keeps (`files`, each at most `file` bytes, `total` in all) and reads (`read` decompressed bytes,
/// `entries` entries, the dropped ones included, so a compressed bomb of dropped entries ends too; `ext` bytes for a
/// long name or PAX header, which `tar` reads whole into memory).
struct Limits {
    files: usize,
    file: u64,
    total: u64,
    read: u64,
    entries: usize,
    ext: u64,
}
const LIMITS: Limits = Limits { files: 2000, file: MAX_FILE, total: 50 * 1024 * 1024, read: 200 * 1024 * 1024, entries: 100_000, ext: 64 * 1024 };

/// The archive of `repo`'s default branch on GitHub, or None when `repo` is not one (`repo_ok`).
pub fn archive_url(repo: &str) -> Option<String> {
    repo_ok(repo).then(|| format!("https://codeload.github.com/{repo}/tar.gz/HEAD"))
}

/// The folder a repo installs into: `<owner>__<repo>`, lower-cased (GitHub names ignore case, so `Alice/T` and
/// `alice/t` are one pack); an owner holds no `_`, so no two repos share a folder.
fn folder_of(repo: &str) -> Option<String> {
    let (o, n) = repo.split_once('/').filter(|_| repo_ok(repo))?;
    Some(format!("{o}__{n}").to_ascii_lowercase()).filter(|d| plain(d))
}

/// A name Windows keeps for a device (`con.json` opens the console there), whatever its extension.
fn reserved(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL") || (stem.len() == 4 && (stem.starts_with("COM") || stem.starts_with("LPT")) && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

/// A path under the archive's top folder that `unpack` keeps: `pack.json`, a licence, or `<folder>/<name>.json|png`
/// one level deep, every segment plain (a folder not ending in `.`, which Windows would drop), no device name.
fn keepable(rel: &[&str]) -> bool {
    match rel {
        [f] => *f == "pack.json" || LICENCES.contains(f),
        [d, f] => plain(d) && !d.ends_with('.') && !reserved(d) && plain(f) && !reserved(f) && (f.ends_with(".json") || f.ends_with(".png")),
        _ => false,
    }
}

/// A reader that fails once more than `left` bytes have come through it (`hit` says it did).
struct Capped<R> {
    inner: R,
    left: u64,
    hit: bool,
}
impl<R: Read> Read for Capped<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let n = self.inner.read(buf)?;
        match self.left.checked_sub(n as u64) {
            Some(left) => {
                self.left = left;
                Ok(n)
            }
            None => {
                self.hit = true;
                Err(io::Error::other("too large"))
            }
        }
    }
}

/// Unpack a gzip tar whose entries sit under one top folder (GitHub's `<repo>-<sha>/`) into `dest`, an existing
/// empty folder, keeping only what `keepable` allows: regular files of at most 2 MiB, 2000 of them, 50 MiB in all.
/// Anything else (a link, a device, a `..`, a leading `.`, a deeper path, another top folder, a file too big, a
/// second copy) is dropped, not an error. Each entry is decided from its type and its path's segments and written
/// by hand, create-new, into folders made here (never `tar`'s own unpack, never through a link). Returns the number
/// of files written; an error when the limits are passed (what is read is bounded too: 200 MiB decompressed,
/// 100000 entries, 64 KiB for a long name or PAX header), the archive cannot be read, or no `<folder>/theme.json` was kept. On an error `dest` may hold
/// some files: the caller removes it.
pub fn unpack(archive: &[u8], dest: &Path) -> Result<usize, String> {
    unpack_with(archive, dest, &LIMITS)
}

/// The archive as `unpack` reads it: gzip, capped, tar.
type Tgz<'a, 'b> = tar::Archive<&'a mut Capped<flate2::read::GzDecoder<&'b [u8]>>>;

fn unpack_with(archive: &[u8], dest: &Path, l: &Limits) -> Result<usize, String> {
    // two passes, each bounded: the raw headers first (an extension's size seen before `tar` reads it whole), then
    // the entries as `tar` folds them
    let read = |pass: &dyn Fn(&mut Tgz) -> Result<usize, String>| {
        let mut capped = Capped { inner: flate2::read::GzDecoder::new(archive), left: l.read, hit: false };
        let done = pass(&mut tar::Archive::new(&mut capped));
        if capped.hit {
            return Err(format!("the archive is too large once unpacked (more than {} MiB read)", l.read >> 20));
        }
        done
    };
    read(&|ar| vet(ar, l))?;
    read(&|ar| keep(ar, dest, l))
}

fn unreadable(e: io::Error) -> String {
    format!("not a readable archive: {e}")
}

/// The raw entries of the archive, extensions unfolded: an error for one more than `l.entries`, for a long name,
/// long link or PAX header over `l.ext` bytes (`tar` would read it whole before handing out the entry it names), and
/// for what would make `keep`'s walk differ from this one: a GNU sparse entry, or a PAX header giving a `size` (git
/// archive's `path=` and `comment=` records pass).
fn vet<R: Read>(ar: &mut tar::Archive<R>, l: &Limits) -> Result<usize, String> {
    let mut n = 0;
    for entry in ar.entries().map_err(unreadable)?.raw(true) {
        let mut entry = entry.map_err(unreadable)?;
        let t = entry.header().entry_type();
        if (t.is_gnu_longname() || t.is_gnu_longlink() || t.is_pax_local_extensions() || t.is_pax_global_extensions()) && entry.size() > l.ext {
            return Err(format!("the archive has a long name or PAX header over {} KiB", l.ext >> 10));
        }
        if t.is_gnu_sparse() {
            return Err("the archive has a sparse file".into());
        }
        if t.is_pax_local_extensions() {
            let pax = entry.pax_extensions().map_err(unreadable)?.into_iter().flatten();
            for ext in pax {
                if ext.map_err(unreadable)?.key_bytes() == b"size" {
                    return Err("the archive has a PAX header giving a size".into());
                }
            }
        }
        n += 1;
        if n > l.entries {
            return Err(format!("the archive has more than {} entries", l.entries));
        }
    }
    Ok(n)
}

fn keep<R: Read>(ar: &mut tar::Archive<R>, dest: &Path, l: &Limits) -> Result<usize, String> {
    let (mut top, mut files, mut total, mut theme) = (None::<String>, 0usize, 0u64, false);
    for (i, entry) in ar.entries().map_err(unreadable)?.enumerate() {
        if i >= l.entries {
            return Err(format!("the archive has more than {} entries", l.entries));
        }
        let mut entry = entry.map_err(unreadable)?;
        let kind = entry.header().entry_type();
        let Ok(path) = String::from_utf8(entry.path_bytes().into_owned()) else { continue };
        let path = if kind.is_dir() { path.strip_suffix('/').unwrap_or(&path) } else { &path };
        let segs: Vec<&str> = path.split('/').collect();
        let Some((first, rel)) = segs.split_first() else { continue };
        // the top folder is the first folder or file path seen with a folder in front (a stray file at the top of
        // the archive does not get to name it)
        if first.is_empty() || *first == "." || *first == ".." || !(kind.is_dir() || (kind.is_file() && !rel.is_empty())) {
            continue;
        }
        if top.as_deref().is_some_and(|t| t != *first) {
            continue;
        }
        top.get_or_insert_with(|| first.to_string());
        if !kind.is_file() || !keepable(rel) || entry.size() > l.file {
            continue;
        }
        let mut bytes = Vec::new();
        entry.by_ref().take(l.file + 1).read_to_end(&mut bytes).map_err(unreadable)?;
        if bytes.len() as u64 > l.file {
            continue;
        }
        if files >= l.files {
            return Err(format!("the pack has more than {} files", l.files));
        }
        if total + bytes.len() as u64 > l.total {
            return Err(format!("the pack is more than {} MiB unpacked", l.total >> 20));
        }
        if write_new(dest, rel, &bytes)? {
            files += 1;
            total += bytes.len() as u64;
            theme |= rel.len() == 2 && rel[1] == "theme.json";
        }
    }
    if !theme {
        return Err(NO_THEME.into());
    }
    Ok(files)
}

/// Write `bytes` at `dest/<rel>` as a new file, making its folder (one level) if needed; false when something of
/// that name is already there (a second copy, a name differing only in case on such a disk), which drops it.
fn write_new(dest: &Path, rel: &[&str], bytes: &[u8]) -> Result<bool, String> {
    let failed = |e: io::Error| format!("cannot write the pack: {e}");
    let mut at = dest.to_path_buf();
    if let [d, _] = rel {
        at.push(d);
        if let Err(e) = fs::create_dir(&at) {
            if e.kind() != io::ErrorKind::AlreadyExists {
                return Err(failed(e));
            }
        }
        if !fs::symlink_metadata(&at).is_ok_and(|m| m.is_dir()) {
            return Ok(false); // a file of that name came first
        }
    }
    at.push(rel[rel.len() - 1]);
    if fs::symlink_metadata(&at).is_ok() {
        return Ok(false);
    }
    match fs::OpenOptions::new().write(true).create_new(true).open(&at) {
        Ok(mut f) => f.write_all(bytes).map(|()| true).map_err(failed),
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => Ok(false),
        Err(e) => Err(failed(e)),
    }
}

/// A work folder in `root`: `<prefix>-<seconds>-<tag>-<dir>`, unique to this call, its time readable by `sweep`.
fn work(root: &Path, prefix: &str, dir: &str) -> PathBuf {
    static N: AtomicU64 = AtomicU64::new(0);
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    root.join(format!("{prefix}-{secs}-{:x}x{:x}-{dir}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)))
}

/// Clear the work entries a crashed run left in `root`, older than `age` by the time in their name (a name that
/// does not parse is left alone): a `.tmp-*` is removed; an `.old-*` folder (a pack moved aside) is put back as its
/// pack when that folder is missing, else removed; a work entry that is a file or a link is removed.
fn sweep(root: &Path, age: Duration) {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let Ok(rd) = fs::read_dir(root) else { return };
    for e in rd.flatten() {
        let Ok(name) = e.file_name().into_string() else { continue };
        let (old, rest) = match (name.strip_prefix(".tmp-"), name.strip_prefix(".old-")) {
            (Some(r), _) => (false, r),
            (_, Some(r)) => (true, r),
            _ => continue,
        };
        let mut parts = rest.splitn(3, '-');
        let (Some(Ok(secs)), Some(_), Some(dir)) = (parts.next().map(str::parse::<u64>), parts.next(), parts.next()) else { continue };
        if now.saturating_sub(secs) < age.as_secs() {
            continue;
        }
        let at = e.path();
        let folder = e.file_type().is_ok_and(|t| t.is_dir());
        if old && folder && plain(dir) && fs::symlink_metadata(root.join(dir)).is_err() && fs::rename(&at, root.join(dir)).is_ok() {
            continue;
        }
        discard(&at);
    }
}

/// At the app's start (no install can be running then: one instance): every work entry of an earlier run, however
/// young, is cleared, and a pack left moved aside by a swap that could not put it back is in place again.
pub fn recover(root: &Path) {
    sweep(root, Duration::ZERO);
}

/// Delete `at` whatever it is: a real folder with all it holds, a file or a link (the link only).
fn discard(at: &Path) {
    if fs::symlink_metadata(at).is_ok_and(|m| m.is_dir()) {
        let _ = fs::remove_dir_all(at);
    } else if fs::remove_file(at).is_err() {
        let _ = fs::remove_dir(at); // a link to a folder, on Windows
    }
}

/// Install `repo` (trimmed, `repo_ok`) from its `archive` (a gzip tar, `unpack`) into `root`: unpacked into a
/// `.tmp-*` folder (hidden from `list`) with its `pack-source.json` (`{ "repo", "installed": now }`, the repo as
/// typed), then swapped into `<owner>__<repo>` (lower-cased): the old folder moved aside to `.old-*` first and
/// deleted after, put back if the swap fails; a local pack in that folder is refused (`swap`). A failure leaves `root`
/// as it was. Work folders have unique names and
/// are removed on every exit path; those of a crashed run, older than ten minutes, are swept first (`sweep`).
/// Returns the pack as `list` sees it.
pub fn install(root: &Path, repo: &str, archive: &[u8], now: &str) -> Result<Pack, String> {
    install_with(root, repo, archive, now, |a, b| fs::rename(a, b))
}

fn install_with(root: &Path, repo: &str, archive: &[u8], now: &str, rename: impl Fn(&Path, &Path) -> io::Result<()>) -> Result<Pack, String> {
    let repo = repo.trim();
    let dir = folder_of(repo).ok_or_else(|| format!("not a GitHub repository: {repo}"))?;
    fs::create_dir_all(root).map_err(|e| format!("cannot make the themes folder: {e}"))?;
    sweep(root, STALE);
    let tmp = work(root, ".tmp", &dir);
    fs::create_dir(&tmp).map_err(|e| format!("cannot write the pack: {e}"))?;
    let done = unpack(archive, &tmp)
        .and_then(|_| {
            let src = serde_json::json!({ "repo": repo, "installed": now });
            fs::write(tmp.join(SOURCE), serde_json::to_vec_pretty(&src).unwrap_or_default()).map_err(|e| format!("cannot write the pack: {e}"))
        })
        .and_then(|()| swap(root, &dir, &tmp, &rename));
    if done.is_err() {
        let _ = fs::remove_dir_all(&tmp);
    }
    done?;
    list(root).into_iter().find(|p| p.dir == dir).ok_or_else(|| format!("{dir} is not listed after its install"))
}

/// Put `tmp` in place as `root/<dir>`, the folder there moved aside first and removed after, put back on a failure.
/// A folder there without a valid `pack-source.json` is a local pack (a draft made by hand): refused, left as it is.
fn swap(root: &Path, dir: &str, tmp: &Path, rename: &impl Fn(&Path, &Path) -> io::Result<()>) -> Result<(), String> {
    let target = root.join(dir);
    if fs::symlink_metadata(&target).is_ok_and(|m| m.is_dir()) && source(&target).is_none() {
        return Err(format!("{dir} is a local pack: move or delete its folder yourself, then install again"));
    }
    let old = fs::symlink_metadata(&target).is_ok().then(|| work(root, ".old", dir));
    if let Some(old) = &old {
        rename(&target, old).map_err(|e| format!("cannot move the installed pack aside: {e}"))?;
    }
    if let Err(e) = rename(tmp, &target) {
        // put the old pack back; should that fail too, `sweep` puts it back at a later install
        if let Some(old) = &old {
            let _ = rename(old, &target);
        }
        return Err(format!("cannot put the new pack in place: {e}"));
    }
    if let Some(old) = old {
        discard(&old);
    }
    Ok(())
}

/// The repo the pack in `root/<dir>` was installed from (its `pack-source.json`); an error for a local pack or a
/// `dir` that is not a pack folder.
pub fn origin(root: &Path, dir: &str) -> Result<String, String> {
    if !plain(dir) || !fs::symlink_metadata(root.join(dir)).is_ok_and(|m| m.is_dir()) {
        return Err(format!("no pack {dir}"));
    }
    source(&root.join(dir)).map(|(repo, _)| repo).ok_or_else(|| format!("{dir} is a local pack: there is no repository to update it from"))
}

/// What `update` did: the pack as `list` sees it after, and whether anything was replaced (`changed`: false when the
/// archive holds what the pack already holds, nothing touched). Serialized as the pack's fields plus `changed`.
#[derive(Debug, PartialEq, Serialize)]
pub struct Updated {
    #[serde(flatten)]
    pub pack: Pack,
    pub changed: bool,
}

/// Install the pack in `root/<dir>` again from `archive` (its repo's, `origin`), replacing it whole; when the archive
/// holds what the pack already holds (`changed`) and the pack is in its repo's folder, nothing is replaced: the folder
/// and its `installed` date stay. A pack whose folder is not its repo's canonical one (made by hand) moves there: the
/// old folder is removed once installed, unless it is the same folder under another name (`same_folder`, decided
/// before the install).
pub fn update(root: &Path, dir: &str, archive: &[u8], now: &str) -> Result<Updated, String> {
    let repo = origin(root, dir)?;
    let canonical = folder_of(&repo).ok_or_else(|| format!("not a GitHub repository: {repo}"))?;
    let same = same_folder(root, dir, &canonical);
    if same && !changed(root, dir, archive)? {
        let pack = list(root).into_iter().find(|p| p.dir == dir).ok_or_else(|| format!("{dir} is not listed"))?;
        return Ok(Updated { pack, changed: false });
    }
    let pack = install(root, &repo, archive, now)?;
    if !same {
        remove(root, dir).map_err(|e| format!("installed as {}, but {e}", pack.dir))?;
    }
    Ok(Updated { pack, changed: true })
}

/// Whether `archive` holds other files than the pack in `root/<dir>` (a pack installed from a repository, `origin`;
/// an error for a local pack): unpacked as `install` would (`unpack`, same filters) into a `.tmp-*` work folder, hidden
/// from `list` and removed on every exit path, then its kept files compared with the pack's (`kept`). Never touches
/// the installed pack. An archive `install` would refuse is an error here too.
pub fn changed(root: &Path, dir: &str, archive: &[u8]) -> Result<bool, String> {
    origin(root, dir)?;
    let tmp = work(root, ".tmp", dir);
    fs::create_dir(&tmp).map_err(|e| format!("cannot unpack the pack: {e}"))?;
    let fresh = unpack(archive, &tmp).map(|_| kept(&tmp));
    let _ = fs::remove_dir_all(&tmp);
    Ok(fresh? != kept(&root.join(dir)))
}

/// The files of a pack folder that `unpack` would keep, its digest: each regular file at its top or one folder down
/// (no link followed) whose path `keepable` allows, its `/`-separated path and its bytes, sorted by path. What
/// `unpack` never writes is left out (`pack-source.json`, the install's own; a `.DS_Store`, a `desktop.ini`, a note
/// dropped in by hand), so it never makes a pack differ. A file that cannot be read is missing from it, so it
/// differs and an update writes it again.
fn kept(at: &Path) -> Vec<(String, Vec<u8>)> {
    fn files(at: &Path, folder: Option<&str>, out: &mut Vec<(String, Vec<u8>)>) {
        let Ok(rd) = fs::read_dir(at) else { return };
        for e in rd.flatten() {
            let Ok(name) = e.file_name().into_string() else { continue };
            let Ok(t) = e.file_type() else { continue };
            let rel: Vec<&str> = folder.into_iter().chain([name.as_str()]).collect();
            if t.is_file() && keepable(&rel) {
                if let Ok(bytes) = fs::read(e.path()) {
                    out.push((rel.join("/"), bytes));
                }
            } else if t.is_dir() && folder.is_none() {
                files(&e.path(), Some(&name), out);
            }
        }
    }
    let mut out = Vec::new();
    files(at, None, &mut out);
    out.sort();
    out
}

/// Whether `root/<a>` and `root/<b>` are one folder: by identity (`identity`, so `Alice__T` and `alice__t` on a
/// case-insensitive disk, or `p.` and `p` on Windows, are one), `b` missing meaning not; when `a` itself cannot be
/// resolved, by name, case and trailing dots aside.
fn same_folder(root: &Path, a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    match (identity(&root.join(a)), identity(&root.join(b))) {
        (Some(x), Some(y)) => x == y,
        (Some(_), None) => false,
        (None, _) => a.trim_end_matches('.').eq_ignore_ascii_case(b.trim_end_matches('.')),
    }
}

/// What a folder is, whatever name opens it: on Unix its device and inode (on a case-insensitive Linux disk,
/// `canonicalize` keeps the case it was given, so two names of one folder would differ), elsewhere its canonical path.
#[cfg(unix)]
fn identity(at: &Path) -> Option<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    fs::metadata(at).ok().map(|m| (m.dev(), m.ino()))
}
#[cfg(not(unix))]
fn identity(at: &Path) -> Option<PathBuf> {
    fs::canonicalize(at).ok()
}

/// Remove the pack folder `root/<dir>`, `dir` a plain name and a real folder (not a link, not a work folder) installed
/// from a repository (`origin`): moved to a `.tmp-*` folder first, so `list` never sees half a pack, then deleted. A
/// local pack (no valid `pack-source.json`: a draft made by hand) is refused: the app never deletes one.
pub fn remove(root: &Path, dir: &str) -> Result<(), String> {
    let at = root.join(dir);
    if !plain(dir) || !fs::symlink_metadata(&at).is_ok_and(|m| m.is_dir()) {
        return Err(format!("no pack {dir}"));
    }
    if source(&at).is_none() {
        return Err(format!("{dir} is a local pack: delete its folder yourself"));
    }
    let gone = work(root, ".tmp", dir);
    fs::rename(&at, &gone).map_err(|e| format!("cannot remove {dir}: {e}"))?;
    fs::remove_dir_all(&gone).map_err(|e| format!("{dir} is out of the list but not all its files are deleted: {e}"))
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

    // ---- install, update, remove: archives built in memory, raw headers for what `tar::Builder` refuses to write

    enum E<'a> {
        File(&'a [u8]),
        Dir,
        Link(&'a str),
        Hard(&'a str),
        Raw(tar::EntryType, &'a [u8]),
    }

    fn tgz(entries: &[(&str, E)]) -> Vec<u8> {
        let mut b = tar::Builder::new(flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast()));
        for (path, e) in entries {
            let mut h = tar::Header::new_gnu();
            let (kind, data): (tar::EntryType, &[u8]) = match e {
                E::File(d) => (tar::EntryType::Regular, d),
                E::Dir => (tar::EntryType::Directory, b""),
                E::Link(_) => (tar::EntryType::Symlink, b""),
                E::Hard(_) => (tar::EntryType::Link, b""),
                E::Raw(kind, d) => (*kind, d),
            };
            h.set_entry_type(kind);
            h.set_size(data.len() as u64);
            h.set_mode(0o644);
            let old = h.as_old_mut();
            old.name[..path.len()].copy_from_slice(path.as_bytes()); // raw: `..` and `/abs` too
            if let E::Link(to) | E::Hard(to) = e {
                old.linkname[..to.len()].copy_from_slice(to.as_bytes());
            }
            h.set_cksum();
            b.append(&h, data).unwrap();
        }
        b.into_inner().unwrap().finish().unwrap()
    }

    /// Every path under `dir`, relative, `/`-separated, sorted (links listed, not followed).
    fn tree(dir: &Path) -> Vec<String> {
        fn walk(base: &Path, at: &Path, out: &mut Vec<String>) {
            for e in fs::read_dir(at).unwrap().flatten() {
                let p = e.path();
                out.push(p.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/"));
                if e.file_type().unwrap().is_dir() {
                    walk(base, &p, out);
                }
            }
        }
        let mut out = Vec::new();
        if dir.exists() {
            walk(dir, dir, &mut out);
        }
        out.sort();
        out
    }

    fn clean() -> Vec<u8> {
        tgz(&[
            ("pax_global_header", E::Raw(tar::EntryType::XGlobalHeader, b"52 comment=0123456789abcdef0123456789abcdef01234567\n")),
            ("r-abc/", E::Dir),
            ("r-abc/pack.json", E::File(b"{\"name\":\"R\"}")),
            ("r-abc/LICENSE", E::File(b"MIT")),
            ("r-abc/pink/", E::Dir),
            ("r-abc/pink/theme.json", E::File(b"{}")),
            ("r-abc/pink/breakout.png", E::File(b"\x89PNG")),
        ])
    }

    #[test]
    fn a_clean_archive_installs() {
        let root = tmp("install");
        let pack = install(&root, " alice/Adm-Themes ", &clean(), "2026-11-16T10:00:00Z").unwrap();
        assert_eq!(
            pack,
            Pack { id: "alice/adm-themes".into(), dir: "alice__adm-themes".into(), repo: Some("alice/Adm-Themes".into()), installed: Some("2026-11-16T10:00:00Z".into()), themes: vec!["pink".into()] }
        );
        assert_eq!(
            tree(&root),
            [
                "alice__adm-themes",
                "alice__adm-themes/LICENSE",
                "alice__adm-themes/pack-source.json",
                "alice__adm-themes/pack.json",
                "alice__adm-themes/pink",
                "alice__adm-themes/pink/breakout.png",
                "alice__adm-themes/pink/theme.json",
            ]
        );
        assert_eq!(fs::read(root.join("alice__adm-themes/pink/breakout.png")).unwrap(), b"\x89PNG");
        let src: serde_json::Value = serde_json::from_slice(&fs::read(root.join("alice__adm-themes/pack-source.json")).unwrap()).unwrap();
        assert_eq!(src, serde_json::json!({ "repo": "alice/Adm-Themes", "installed": "2026-11-16T10:00:00Z" }));
        assert_eq!(list(&root), [pack]);
        let dest = tmp("unpack-count");
        assert_eq!(unpack(&clean(), &dest), Ok(4));
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&dest);
    }

    #[test]
    fn hostile_entries_are_dropped_and_the_rest_installs() {
        let root = tmp("hostile");
        let outside = tmp("hostile-outside");
        let big = vec![0u8; 3 * 1024 * 1024];
        let out_link = format!("{}", outside.display());
        let archive = tgz(&[
            ("stray.json", E::File(b"{}")),
            ("r-abc/", E::Dir),
            ("r-abc/../evil.json", E::File(b"{}")),
            ("/abs.json", E::File(b"{}")),
            ("r-abc/pink/link.json", E::Link("../../../../etc/passwd")),
            ("r-abc/pink/hard.json", E::Hard("r-abc/pack.json")),
            ("r-abc/pink/big.png", E::File(&big)),
            ("r-abc/a/b/deep.json", E::File(b"{}")),
            ("r-abc/pink/run.js", E::File(b"alert(1)")),
            ("r-abc/.github/x.json", E::File(b"{}")),
            ("r-abc/pink/.x.json", E::File(b"{}")),
            ("r-abc/pink/./theme2.json", E::File(b"{}")),
            ("r-abc//pink/theme3.json", E::File(b"{}")),
            ("r-abc/pink\\..\\..\\back.json", E::File(b"{}")),
            ("r-abc/pack-source.json", E::File(br#"{"repo":"local/x"}"#)),
            ("r-abc/README.md", E::File(b"# hi")),
            ("r-abc/pink/con.json", E::File(b"{}")),
            ("r-abc/pink./theme.json", E::File(b"{}")),
            ("r-abc/dir.json/", E::Dir),
            ("r-abc/out", E::Link(&out_link)),
            ("r-abc/out/theme.json", E::File(b"{}")),
            ("other-top/pink/theme.json", E::File(b"{}")),
            ("r-abc/pink/theme.json", E::File(b"{}")),
            ("r-abc/pink/theme.json", E::File(b"{\"again\":1}")),
        ]);
        let pack = install(&root, "alice/t", &archive, "now").unwrap();
        assert_eq!(pack.themes, ["out", "pink"], "`out` is a folder of its own, not the link");
        assert_eq!(tree(&root), ["alice__t", "alice__t/out", "alice__t/out/theme.json", "alice__t/pack-source.json", "alice__t/pink", "alice__t/pink/theme.json"]);
        assert_eq!(fs::read(root.join("alice__t/pink/theme.json")).unwrap(), b"{}", "the first copy wins");
        assert_eq!(pack.repo.as_deref(), Some("alice/t"), "the archive's own pack-source.json is dropped");
        assert_eq!(tree(&outside), Vec::<String>::new(), "nothing written through the link");
        assert!(!root.parent().unwrap().join("evil.json").exists() && !Path::new("/abs.json").exists());
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn a_failed_install_leaves_nothing() {
        let root = tmp("fail");
        let no_theme = tgz(&[("r-abc/pack.json", E::File(b"{}")), ("r-abc/pink/breakout.png", E::File(b"x"))]);
        assert_eq!(install(&root, "alice/t", &no_theme, "now"), Err(NO_THEME.into()));
        assert_eq!(tree(&root), Vec::<String>::new());
        let many: Vec<String> = (0..2001).map(|i| format!("r-abc/pink/f{i}.json")).collect();
        let mut entries: Vec<(&str, E)> = vec![("r-abc/pink/theme.json", E::File(b"{}"))];
        entries.extend(many.iter().map(|p| (p.as_str(), E::File(b"{}"))));
        assert!(install(&root, "alice/t", &tgz(&entries), "now").unwrap_err().contains("files"));
        assert_eq!(tree(&root), Vec::<String>::new());
        let two = vec![b'x'; MAX_FILE as usize];
        let heavy: Vec<String> = (0..26).map(|i| format!("r-abc/pink/f{i}.png")).collect();
        let mut entries: Vec<(&str, E)> = vec![("r-abc/pink/theme.json", E::File(b"{}"))];
        entries.extend(heavy.iter().map(|p| (p.as_str(), E::File(&two))));
        assert!(install(&root, "alice/t", &tgz(&entries), "now").unwrap_err().contains("MiB"));
        assert_eq!(tree(&root), Vec::<String>::new());
        assert!(install(&root, "alice/t", b"not a gzip", "now").is_err());
        assert!(install(&root, "alice/..", &clean(), "now").is_err());
        assert_eq!(tree(&root), Vec::<String>::new());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn what_is_read_is_bounded_too() {
        let dest = tmp("bounded");
        let dropped = vec![0u8; 4096];
        let lots: Vec<String> = (0..50).map(|i| format!("r-abc/x{i}.txt")).collect();
        let mut entries: Vec<(&str, E)> = vec![("r-abc/pink/theme.json", E::File(b"{}"))];
        entries.extend(lots.iter().map(|p| (p.as_str(), E::File(&dropped))));
        let archive = tgz(&entries);
        let small = Limits { read: 64 * 1024, ..LIMITS };
        assert!(unpack_with(&archive, &dest, &small).unwrap_err().contains("too large"));
        let few = Limits { entries: 20, ..LIMITS };
        let dest2 = tmp("bounded-entries");
        assert!(unpack_with(&archive, &dest2, &few).unwrap_err().contains("entries"));
        let dest3 = tmp("bounded-ok");
        assert_eq!(unpack_with(&archive, &dest3, &LIMITS), Ok(1));
        assert_eq!(LIMITS.read, 200 * 1024 * 1024);
        // a long name or a PAX header is read whole by `tar`: one over 64 KiB is refused before it is
        let long = vec![b'a'; 100 * 1024];
        for kind in [tar::EntryType::GNULongName, tar::EntryType::XHeader, tar::EntryType::XGlobalHeader, tar::EntryType::GNULongLink] {
            let bomb = tgz(&[("././@LongLink", E::Raw(kind, &long)), ("r-abc/pink/theme.json", E::File(b"{}"))]);
            assert!(unpack_with(&bomb, &dest3, &LIMITS).unwrap_err().contains("64 KiB"), "{kind:?}");
        }
        let fine = vec![b'a'; 1000];
        let named = tgz(&[
            ("././@LongLink", E::Raw(tar::EntryType::GNULongName, &[b"r-abc/pink/".as_slice(), &fine[..90], b".json\0"].concat())),
            ("x", E::File(b"{}")),
            ("r-abc/pink/theme.json", E::File(b"{}")),
        ]);
        let dest4 = tmp("bounded-long");
        assert_eq!(unpack_with(&named, &dest4, &LIMITS), Ok(2), "a long name under the limit still names its entry");
        assert!(dest4.join("pink").join(format!("{}.json", "a".repeat(90))).exists());
        // what would make the second pass walk the archive otherwise than the first: a PAX size, a GNU sparse entry
        let sized = tgz(&[("r-abc/PaxHeaders/x", E::Raw(tar::EntryType::XHeader, b"12 size=100\n")), ("r-abc/pink/x.json", E::File(b"{}")), ("r-abc/pink/theme.json", E::File(b"{}"))]);
        let dest5 = tmp("bounded-pax");
        assert_eq!(unpack_with(&sized, &dest5, &LIMITS), Err("the archive has a PAX header giving a size".into()));
        let sparse = tgz(&[("r-abc/pink/s.json", E::Raw(tar::EntryType::GNUSparse, b"")), ("r-abc/pink/theme.json", E::File(b"{}"))]);
        assert_eq!(unpack_with(&sparse, &dest5, &LIMITS), Err("the archive has a sparse file".into()));
        // git archive's own PAX records pass: a `path=` names its entry
        let pathed = tgz(&[("r-abc/PaxHeaders/x", E::Raw(tar::EntryType::XHeader, b"30 path=r-abc/pink/theme.json\n")), ("x", E::File(b"{}"))]);
        assert_eq!(unpack_with(&pathed, &dest5, &LIMITS), Ok(1));
        assert!(dest5.join("pink/theme.json").exists());
        for d in [dest, dest2, dest3, dest4, dest5] {
            let _ = fs::remove_dir_all(d);
        }
    }

    #[test]
    fn an_update_replaces_the_pack_whole_or_not_at_all() {
        let root = tmp("update");
        install(&root, "alice/t", &clean(), "one").unwrap();
        let second = tgz(&[("t-def/blue/theme.json", E::File(b"{\"v\":2}"))]);
        let pack = update(&root, "alice__t", &second, "two").unwrap().pack;
        assert_eq!((pack.themes, pack.installed.as_deref()), (vec!["blue".to_string()], Some("two")));
        assert_eq!(tree(&root), ["alice__t", "alice__t/blue", "alice__t/blue/theme.json", "alice__t/pack-source.json"]);
        let broken = tgz(&[("t-def/pack.json", E::File(b"{}"))]);
        assert_eq!(update(&root, "alice__t", &broken, "three"), Err(NO_THEME.into()));
        assert_eq!(tree(&root), ["alice__t", "alice__t/blue", "alice__t/blue/theme.json", "alice__t/pack-source.json"]);
        assert_eq!(list(&root)[0].installed.as_deref(), Some("two"));
        // the same repo typed in another case is the same pack: one folder, one id; the repo shown as last typed
        install(&root, "Alice/T", &clean(), "four").unwrap();
        assert_eq!(list(&root).iter().map(|p| (p.dir.as_str(), p.id.as_str(), p.repo.as_deref())).collect::<Vec<_>>(), [("alice__t", "alice/t", Some("Alice/T"))]);
        // a local pack has nothing to update from; a hand-made folder naming a repo moves to its canonical folder
        put(&root, "mine/green/theme.json", b"{}");
        assert!(origin(&root, "mine").is_err());
        assert!(update(&root, "mine", &clean(), "five").is_err());
        put(&root, "odd/pack-source.json", br#"{"repo": "bob/x"}"#);
        put(&root, "odd/green/theme.json", b"{}");
        assert_eq!(origin(&root, "odd").as_deref(), Ok("bob/x"));
        assert_eq!(update(&root, "odd", &clean(), "six").unwrap().pack.dir, "bob__x");
        assert!(!root.join("odd").exists());
        assert!(root.join("bob__x/pink/theme.json").exists(), "the new pack stays");
        assert_eq!(origin(&root, "../x"), Err("no pack ../x".into()));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn an_identical_archive_changes_nothing() {
        let root = tmp("changed");
        install(&root, "alice/t", &clean(), "one").unwrap();
        let before = tree(&root);
        #[cfg(unix)]
        let inode = identity(&root.join("alice__t"));
        // the same files under another top folder, in another order, with what `unpack` drops: the same pack
        let same = tgz(&[
            ("t-xyz/pink/breakout.png", E::File(b"\x89PNG")),
            ("t-xyz/pink/theme.json", E::File(b"{}")),
            ("t-xyz/README.md", E::File(b"# changed, but not kept")),
            ("t-xyz/LICENSE", E::File(b"MIT")),
            ("t-xyz/pack.json", E::File(b"{\"name\":\"R\"}")),
        ]);
        assert_eq!(changed(&root, "alice__t", &same), Ok(false));
        assert_eq!(tree(&root), before, "the check leaves no work folder and touches nothing");
        // what `unpack` never writes, dropped in by the system or by hand, is no change
        for junk in ["alice__t/.DS_Store", "alice__t/pink/.DS_Store", "alice__t/pink/desktop.ini", "alice__t/notes.txt", "alice__t/pink/con.json"] {
            put(&root, junk, b"junk");
            assert_eq!(changed(&root, "alice__t", &same), Ok(false), "{junk}");
            fs::remove_file(root.join(junk)).unwrap();
        }
        let up = update(&root, "alice__t", &same, "two").unwrap();
        assert_eq!((up.changed, up.pack.installed.as_deref()), (false, Some("one")), "the installed date stays");
        assert_eq!(tree(&root), before);
        #[cfg(unix)]
        assert_eq!(identity(&root.join("alice__t")), inode, "the folder itself stays");
        let json = serde_json::to_value(&up).unwrap();
        assert_eq!(json, serde_json::json!({ "id": "alice/t", "dir": "alice__t", "repo": "alice/t", "installed": "one", "themes": ["pink"], "changed": false }));
        // a file changed, added or gone: changed
        let edited = tgz(&[
            ("t-xyz/pack.json", E::File(b"{\"name\":\"R\"}")),
            ("t-xyz/LICENSE", E::File(b"MIT")),
            ("t-xyz/pink/theme.json", E::File(b"{\"v\":2}")),
            ("t-xyz/pink/breakout.png", E::File(b"\x89PNG")),
        ]);
        let fewer = tgz(&[("t-xyz/pink/theme.json", E::File(b"{}")), ("t-xyz/pink/breakout.png", E::File(b"\x89PNG")), ("t-xyz/LICENSE", E::File(b"MIT"))]);
        let more = tgz(&[
            ("t-xyz/pack.json", E::File(b"{\"name\":\"R\"}")),
            ("t-xyz/LICENSE", E::File(b"MIT")),
            ("t-xyz/pink/theme.json", E::File(b"{}")),
            ("t-xyz/pink/breakout.png", E::File(b"\x89PNG")),
            ("t-xyz/blue/theme.json", E::File(b"{}")),
        ]);
        for a in [&edited, &fewer, &more] {
            assert_eq!(changed(&root, "alice__t", a), Ok(true));
        }
        assert_eq!(tree(&root), before);
        let up = update(&root, "alice__t", &edited, "three").unwrap();
        assert_eq!((up.changed, up.pack.installed.as_deref()), (true, Some("three")));
        assert_eq!(fs::read(root.join("alice__t/pink/theme.json")).unwrap(), b"{\"v\":2}");
        // an archive `install` would refuse is an error, not a change; a local pack has nothing to compare with
        assert_eq!(changed(&root, "alice__t", &tgz(&[("t-xyz/pack.json", E::File(b"{}"))])), Err(NO_THEME.into()));
        put(&root, "mine/pink/theme.json", b"{}");
        assert!(changed(&root, "mine", &clean()).unwrap_err().contains("local pack"));
        assert!(changed(&root, "missing", &clean()).is_err());
        assert!(tree(&root).iter().all(|p| !p.starts_with('.')), "{:?}", tree(&root));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_failed_swap_puts_the_old_pack_back() {
        let root = tmp("swap");
        install(&root, "alice/t", &clean(), "one").unwrap();
        let before = tree(&root);
        let calls = std::cell::Cell::new(0);
        let flaky = |a: &Path, b: &Path| {
            calls.set(calls.get() + 1);
            if calls.get() == 2 {
                Err(std::io::Error::other("cannot rename"))
            } else {
                fs::rename(a, b)
            }
        };
        let second = tgz(&[("t-def/blue/theme.json", E::File(b"{}"))]);
        assert!(install_with(&root, "alice/t", &second, "two", flaky).unwrap_err().contains("cannot rename"));
        assert_eq!(tree(&root), before);
        let refuse = |_: &Path, _: &Path| Err(std::io::Error::other("cannot rename"));
        assert!(install_with(&root, "alice/t", &second, "two", refuse).is_err());
        assert_eq!(tree(&root), before);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_same_folder_by_identity_not_by_name() {
        let root = tmp("same");
        put(&root, "p/x", b"");
        put(&root, "q/x", b"");
        assert!(same_folder(&root, "p", "p"));
        assert!(!same_folder(&root, "p", "q"));
        assert!(!same_folder(&root, "p", "missing"), "a folder that is not there is not the pack's");
        put(&root, "Alice__T/x", b"");
        // on a case-insensitive disk both names open one folder: never two packs to remove one of
        assert_eq!(same_folder(&root, "Alice__T", "alice__t"), fs::symlink_metadata(root.join("alice__t")).is_ok());
        // when the pack's own folder cannot be resolved, the names decide, case and trailing dots aside
        assert!(same_folder(&root, "Gone.", "gone"));
        assert!(!same_folder(&root, "gone", "other"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            std::os::unix::fs::symlink(root.join("p"), root.join("alias")).unwrap();
            assert!(same_folder(&root, "alias", "p"), "an alias of the same folder");
            // by device and inode, not by the name's case (which `canonicalize` keeps on a case-insensitive disk)
            let m = fs::metadata(root.join("p")).unwrap();
            assert_eq!(identity(&root.join("p")), Some((m.dev(), m.ino())));
            assert_eq!(identity(&root.join("alias")), identity(&root.join("p")));
            assert_ne!(identity(&root.join("q")), identity(&root.join("p")));
            assert_eq!(identity(&root.join("missing")), None);
        }
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_file_in_the_way_is_cleared() {
        let root = tmp("file-in-way");
        put(&root, "alice__t", b"a file, not a pack");
        install(&root, "alice/t", &clean(), "one").unwrap();
        assert!(tree(&root).iter().all(|p| !p.starts_with('.')), "{:?}", tree(&root));
        put(&root, ".old-1-a-q", b"a stale file");
        put(&root, ".tmp-1-a-q", b"a stale file");
        sweep(&root, Duration::ZERO);
        assert!(tree(&root).iter().all(|p| !p.starts_with('.')), "{:?}", tree(&root));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn recover_puts_back_a_pack_moved_aside_at_start() {
        let root = tmp("recover");
        let aside = work(&root, ".old", "alice__t"); // young: `install` would leave it ten minutes
        put(&aside, "pink/theme.json", b"{}");
        let tmp_left = work(&root, ".tmp", "alice__t");
        put(&tmp_left, "pink/theme.json", b"{}");
        recover(&root);
        assert_eq!(tree(&root), ["alice__t", "alice__t/pink", "alice__t/pink/theme.json"]);
        recover(&root.join("missing"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn stale_work_folders_are_swept() {
        let root = tmp("sweep");
        put(&root, ".tmp-1-a-x/pink/theme.json", b"{}"); // a crashed install's: removed
        put(&root, ".old-1-b-p/pink/theme.json", b"{}"); // moved aside, its pack back in place: removed
        put(&root, ".old-1-c-lost/pink/theme.json", b"{}"); // moved aside, its pack missing: put back
        put(&root, ".tmp-abc/keep", b""); // not a work folder's name: left alone
        put(&root, ".hidden/keep", b"");
        put(&root, "p/pink/theme.json", b"{}");
        let young = work(&root, ".tmp", "y");
        fs::create_dir(&young).unwrap();
        sweep(&root, Duration::from_secs(600));
        let young_name = young.file_name().unwrap().to_str().unwrap().to_string();
        let mut kept = vec![".hidden", ".hidden/keep", ".tmp-abc", ".tmp-abc/keep", young_name.as_str(), "lost", "lost/pink", "lost/pink/theme.json", "p", "p/pink", "p/pink/theme.json"];
        kept.sort();
        assert_eq!(tree(&root), kept);
        sweep(&root, Duration::ZERO);
        assert!(!young.exists(), "another install's, once old enough");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_repo_is_owner_slash_name() {
        for ok in ["alice/adm-themes", "a/b.c_d-e", "Alice/T", "a-b/.x", "0/x", &format!("{}/x", "a".repeat(39)), &format!("a/{}", "x".repeat(100))] {
            assert!(repo_ok(ok), "{ok:?}");
        }
        for bad in [
            "alice",
            "alice/..",
            "alice/.",
            "../x",
            "a/b/c",
            "a b/c",
            "-a/b",
            "a_b/c",
            "a.b/c",
            "/x",
            "a/",
            "a/b c",
            "a/b\0",
            "local/x",
            "LOCAL/x",
            "a/b\\c",
            "a/b%2f",
            &format!("{}/x", "a".repeat(40)),
            &format!("a/{}", "x".repeat(101)),
            "",
        ] {
            assert!(!repo_ok(bad), "{bad:?}");
        }
        assert_eq!(archive_url("alice/t").as_deref(), Some("https://codeload.github.com/alice/t/tar.gz/HEAD"));
        assert_eq!(archive_url("alice/../x"), None);
    }

    #[test]
    fn two_folders_naming_one_repo_list_the_second_as_local() {
        let root = tmp("twice");
        put(&root, "alice__t/pack-source.json", br#"{"repo": "alice/t", "installed": "one"}"#);
        put(&root, "copy/pack-source.json", br#"{"repo": "Alice/T", "installed": "two"}"#);
        put(&root, "copy/pink/theme.json", b"{}");
        let packs = list(&root);
        assert_eq!(
            packs.iter().map(|p| (p.id.as_str(), p.dir.as_str(), p.repo.as_deref(), p.installed.as_deref())).collect::<Vec<_>>(),
            [("alice/t", "alice__t", Some("alice/t"), Some("one")), ("local/copy", "copy", None, None)]
        );
        assert_eq!(packs[1].themes, ["pink"], "still seen, with its themes");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_source_naming_no_repo_is_a_local_pack() {
        let root = tmp("source");
        put(&root, "x/pack-source.json", br#"{"repo": "local/mine"}"#);
        put(&root, "y/pack-source.json", br#"{"repo": "a_b/c"}"#);
        assert_eq!(list(&root).iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["local/x", "local/y"]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_id_ignores_the_case_typed() {
        let root = tmp("case");
        let first = install(&root, "Alice/T", &clean(), "one").unwrap();
        let again = install(&root, "alice/t", &clean(), "two").unwrap();
        assert_eq!((first.id.as_str(), again.id.as_str()), ("alice/t", "alice/t"));
        assert_eq!((first.repo.as_deref(), again.repo.as_deref()), (Some("Alice/T"), Some("alice/t")));
        assert_eq!(list(&root).len(), 1);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_local_pack_is_never_deleted() {
        let root = tmp("local");
        put(&root, "mine/green/theme.json", b"{}");
        assert_eq!(remove(&root, "mine"), Err("mine is a local pack: delete its folder yourself".into()));
        assert!(root.join("mine/green/theme.json").exists());
        // a source naming no valid repo is no source
        put(&root, "odd/pack-source.json", br#"{"repo": "../evil"}"#);
        assert!(remove(&root, "odd").is_err() && root.join("odd/pack-source.json").exists());
        // a hand-made folder of the canonical name: an install over it is refused, the folder untouched
        put(&root, "alice__t/green/theme.json", b"{\"draft\":1}");
        let before = tree(&root);
        assert!(install(&root, "alice/t", &clean(), "one").unwrap_err().contains("alice__t is a local pack"));
        assert_eq!(tree(&root), before);
        assert_eq!(fs::read(root.join("alice__t/green/theme.json")).unwrap(), b"{\"draft\":1}");
        // nor can an update of another folder naming that repo land on it
        put(&root, "other/pack-source.json", br#"{"repo": "alice/t"}"#);
        put(&root, "other/blue/theme.json", b"{}");
        assert!(update(&root, "other", &clean(), "two").is_err());
        assert!(root.join("alice__t/green/theme.json").exists() && root.join("other/blue/theme.json").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn remove_takes_a_pack_folder_only() {
        let root = tmp("remove");
        put(&root, "p/pink/theme.json", b"{}");
        put(&root, "p/pack-source.json", br#"{"repo": "a/p"}"#);
        put(&root, ".tmp/x", b"");
        put(&root, "f", b"a file");
        let outside = tmp("remove-outside");
        assert_eq!(remove(&root, "p"), Ok(()));
        assert!(!root.join("p").exists());
        for bad in ["../remove-outside", "../x", ".tmp", "", "p/pink", "/", "f", "missing"] {
            assert!(remove(&root, bad).is_err(), "{bad:?}");
        }
        assert!(root.join(".tmp/x").exists() && root.join("f").exists() && outside.exists());
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }
}
