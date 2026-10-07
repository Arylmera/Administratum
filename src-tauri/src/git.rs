//! The git branch of a session's working directory, read from `.git/HEAD` without running git.
use std::{
    fs,
    path::{Path, PathBuf},
};

/// `ref: refs/heads/<name>` -> name; a detached HEAD (a bare hex hash) -> its first 7 chars; anything else -> None.
pub fn parse_head(text: &str) -> Option<String> {
    let t = text.trim();
    if let Some(r) = t.strip_prefix("ref:") {
        return r.trim().strip_prefix("refs/heads/").filter(|n| !n.is_empty()).map(str::to_string);
    }
    (t.len() >= 40 && t.chars().all(|c| c.is_ascii_hexdigit())).then(|| t[..7].to_string())
}

/// The HEAD file for `dir`: the nearest `.git` at or above it. A `.git` file (a worktree) points to its git dir with
/// `gitdir: <path>`, relative to the folder holding the file unless absolute.
pub fn head_file(dir: &Path) -> Option<PathBuf> {
    for d in dir.ancestors() {
        let git = d.join(".git");
        if git.is_dir() {
            return Some(git.join("HEAD"));
        }
        if git.is_file() {
            let text = fs::read_to_string(&git).ok()?;
            let target = text.lines().find_map(|l| l.strip_prefix("gitdir:"))?.trim();
            return Some(d.join(target).join("HEAD")); // join keeps an absolute target as it is
        }
    }
    None
}

pub fn branch_of(dir: &Path) -> Option<String> {
    parse_head(&fs::read_to_string(head_file(dir)?).ok()?)
}

/// The main repo folder of a linked worktree (`<repo>/.git/worktrees/<name>/HEAD` -> `<repo>`); None outside one.
pub fn worktree_repo(dir: &Path) -> Option<PathBuf> {
    let wt = head_file(dir)?.parent()?.to_path_buf();
    let git = wt.parent().filter(|p| p.ends_with("worktrees"))?.parent().filter(|p| p.ends_with(".git"))?;
    git.parent().map(Path::to_path_buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("adm-git-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn head_lines() {
        assert_eq!(parse_head("ref: refs/heads/main\n").as_deref(), Some("main"));
        assert_eq!(parse_head("ref: refs/heads/feat/x").as_deref(), Some("feat/x"));
        assert_eq!(parse_head("0123456789abcdef0123456789abcdef01234567\n").as_deref(), Some("0123456"));
        assert_eq!(parse_head("ref: refs/remotes/origin/main"), None);
        assert_eq!(parse_head("garbage"), None);
        assert_eq!(parse_head(""), None);
    }

    #[test]
    fn repo_subfolder_and_worktree() {
        let d = temp("repo");
        fs::create_dir_all(d.join("repo/.git")).unwrap();
        fs::write(d.join("repo/.git/HEAD"), "ref: refs/heads/dev\n").unwrap();
        fs::create_dir_all(d.join("repo/src/ui")).unwrap();
        assert_eq!(branch_of(&d.join("repo")).as_deref(), Some("dev"));
        assert_eq!(branch_of(&d.join("repo/src/ui")).as_deref(), Some("dev"), "walks up to the repo");

        fs::create_dir_all(d.join("repo/.git/worktrees/wt")).unwrap();
        fs::write(d.join("repo/.git/worktrees/wt/HEAD"), "ref: refs/heads/wt-branch\n").unwrap();
        fs::create_dir_all(d.join("wt")).unwrap();
        let abs = d.join("repo/.git/worktrees/wt");
        fs::write(d.join("wt/.git"), format!("gitdir: {}\n", abs.display())).unwrap();
        assert_eq!(branch_of(&d.join("wt")).as_deref(), Some("wt-branch"), "absolute gitdir");

        fs::create_dir_all(d.join("wt2")).unwrap();
        fs::write(d.join("wt2/.git"), "gitdir: ../repo/.git/worktrees/wt\n").unwrap();
        assert_eq!(branch_of(&d.join("wt2")).as_deref(), Some("wt-branch"), "relative gitdir");

        assert_eq!(worktree_repo(&d.join("wt")).and_then(|p| p.file_name().map(|n| n.to_owned())).as_deref(), Some("repo".as_ref()));
        assert_eq!(worktree_repo(&d.join("wt2")).and_then(|p| p.file_name().map(|n| n.to_owned())).as_deref(), Some("repo".as_ref()));
        assert_eq!(worktree_repo(&d.join("repo/src")), None, "the main checkout is no worktree");

        fs::create_dir_all(d.join("bare/.git")).unwrap();
        assert_eq!(branch_of(&d.join("bare")), None, "no HEAD file");
        let _ = fs::remove_dir_all(&d);
    }
}
