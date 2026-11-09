//! Text rewrites, pure: `mask` hides strings shaped like secrets before any text leaves the backend (the WebView, the
//! remote view, the Chronicon files); `volatile` blurs the parts of an error that change between two runs of the same
//! failure (the loop rule, chronicle `track_turn`).
use regex::Regex;
use serde::Serializer;
use std::{borrow::Cow, sync::OnceLock};

fn re(cell: &'static OnceLock<Regex>, src: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(src).expect("mask pattern"))
}

/// What a secret becomes.
pub const HIDDEN: &str = "•••";

/// `text` with every string shaped like a secret replaced by `•••`: API keys (`sk-…`, `sk-ant-…`), GitHub tokens
/// (`ghp_`, `gho_`, `github_pat_`), Slack tokens (`xox[abps]-`), AWS key ids (`AKIA…`), private key blocks, JWTs,
/// `password=` / `token=` / `secret=` / `api_key=` values (the name kept) and `Bearer` tokens. Git hashes and paths stay.
/// A `name=` value is masked only when it is a literal: quoted, or 16+ characters with no space, bracket, `$` or call
/// (`token = getToken()` and `password=$PASSWORD` are code, not secrets). A Bearer value only when token-like: 20+
/// characters holding both letters and digits.
pub fn mask(text: &str) -> Cow<'_, str> {
    static M: OnceLock<Regex> = OnceLock::new();
    re(
        &M,
        r"(?x)
          (?s:-----BEGIN[A-Z\ ]*PRIVATE\ KEY-----.*?(?:-----END[A-Z\ ]*PRIVATE\ KEY-----|\z))
        | \bsk-(?:ant-)?[A-Za-z0-9_-]{16,}
        | \b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}
        | \bgithub_pat_[A-Za-z0-9_]{20,}
        | \bxox[abps]-[A-Za-z0-9-]{10,}
        | \bAKIA[0-9A-Z]{16}\b
        | \beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}
        | (?P<bearer>(?i:\bbearer\s+))(?P<tok>[A-Za-z0-9._~+/=-]{20,})
        | (?P<name>(?i:\b(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key)\s*=\s*))
          (?:'[^'\n]*'|\x22[^\x22\n]*\x22|[A-Za-z0-9_\-+/=.~!@\#%^*:]{16,}(?P<end>[\s&;,]|$))
        ",
    )
    .replace_all(text, |c: &regex::Captures| {
        if let Some(n) = c.name("name") {
            return format!("{}{HIDDEN}{}", n.as_str(), c.name("end").map_or("", |e| e.as_str()));
        }
        if let (Some(b), Some(t)) = (c.name("bearer"), c.name("tok")) {
            let tok = t.as_str();
            let like = tok.bytes().any(|x| x.is_ascii_digit()) && tok.bytes().any(|x| x.is_ascii_alphabetic());
            return if like { format!("{}{HIDDEN}", b.as_str()) } else { c[0].to_string() };
        }
        HIDDEN.to_string()
    })
}

/// `serialize_with` for a text field: the masked text goes out (`mask`).
pub fn ser<T: AsRef<str>, S: Serializer>(v: &T, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_str(&mask(v.as_ref()))
}

/// `serialize_with` for an optional text field.
pub fn ser_opt<S: Serializer>(v: &Option<String>, s: S) -> Result<S::Ok, S::Error> {
    match v {
        Some(t) => s.serialize_some(&*mask(t)),
        None => s.serialize_none(),
    }
}

/// `text` with its volatile parts as `#`: timestamps and clock times, durations, hex runs (`0x…`, 8+ hex digits),
/// numbers of 4+ digits, and temp paths. Two runs of one failure then read the same.
pub fn volatile(text: &str) -> Cow<'_, str> {
    static V: OnceLock<Regex> = OnceLock::new();
    re(
        &V,
        r"(?ix)
          \d{4}-\d{2}-\d{2}[t\ ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:z|[+-]\d{2}:?\d{2})?   # ISO timestamps
        | \b\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?\b                                              # clock times
        | \b\d+(?:\.\d+)?\s?(?:ms|µs|us|ns|s|sec|secs|seconds?|m|min|mins|minutes?|h)\b   # durations
        | \b0x[0-9a-f]+\b | \b[0-9a-f]{8,}\b                                              # hex
        | \b\d{4,}\b                                                                       # long numbers (not inside a code: E0425)
        | (?:[a-z]:\\[^\s]*?\\(?:temp|tmp)\\|/tmp/|/var/folders/)\S*                       # temp paths
        ",
    )
    .replace_all(text, "#")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_secret_shape_is_masked() {
        let cases = [
            ("key sk-ant-api03-AbCdEfGhIjKlMnOpQrSt_uv end", "key ••• end"),
            ("OPENAI=sk-proj1234567890abcdefXYZ", "OPENAI=•••"),
            ("push with ghp_0123456789abcdefghijABCDEFGHIJ", "push with •••"),
            ("gho_0123456789abcdefghijKLMN", "•••"),
            ("github_pat_11ABCDEFG0123456789_abcdefghijklmn", "•••"),
            ("slack xoxb-1234567890-abcdefghij", "slack •••"),
            ("aws AKIAIOSFODNN7EXAMPLE x", "aws ••• x"),
            ("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U ok", "jwt ••• ok"),
            ("curl -H 'Authorization: Bearer abcdef0123456789xyzQ' x", "curl -H 'Authorization: Bearer •••' x"),
            ("Bearer short1234", "Bearer short1234"),
            ("password=Hunter22Hunter22! user=bob", "password=••• user=bob"),
            ("password=\"hunter22\" user=bob", "password=••• user=bob"),
            ("TOKEN = 'abc def' next", "TOKEN = ••• next"),
            ("url?api_key=XyZ1234567890abcd&page=2", "url?api_key=•••&page=2"),
            ("export API_KEY=0123456789abcdefXYZ", "export API_KEY=•••"),
            ("secret=\"s3cr3t\"", "secret=•••"),
            ("-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----\nafter", "•••\nafter"),
            ("-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1r (clipped", "•••"),
        ];
        for (raw, want) in cases {
            assert_eq!(mask(raw), want, "{raw}");
        }
    }

    #[test]
    fn ordinary_text_hashes_and_paths_stay() {
        for keep in [
            "Commit sealed: fix the plaque (a1b2c3d)",
            "merge 0123456789abcdef0123456789abcdef01234567 into main",
            r"Edit · C:\Users\guill\Documents\git\Administratum\ui\card.js",
            "/home/x/.ssh/known_hosts and src/token.rs",
            "the task-runner and desk-lamp, sk-short",
            "tokens: 12k, passwords are rotated, token budget",
            "Bearer of bad news",
        ] {
            assert_eq!(mask(keep), keep);
            assert!(matches!(mask(keep), Cow::Borrowed(_)));
        }
        // Code, not secrets: a name bound to an expression, a short unquoted value, a Bearer that is not token-like.
        for keep in [
            "const token = getToken(user);",
            "password=$PASSWORD",
            "token=os.environ['TOKEN']",
            "secret=short",
            "if (password == input) ok",
            "headers: { Authorization: `Bearer ${token}` }",
            "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
            "Bearer 01234567890123456789012",
        ] {
            assert_eq!(mask(keep), keep, "{keep}");
        }
    }

    #[test]
    fn what_leaves_the_backend_is_masked() {
        let s = crate::registry::Session {
            task: "Bash · export GH=ghp_0123456789abcdefghijABCDEFGHIJ".into(),
            asks: Some("Bash: curl -H 'Bearer abcdef0123456789xyzXYZ'".into()),
            ..crate::registry::tests_session("a")
        };
        let j = serde_json::to_string(&s).unwrap();
        assert!(!j.contains("ghp_0123") && !j.contains("abcdef0123456789") && j.contains(HIDDEN), "{j}");
        let e = crate::chronicle::Event { detail: "Bash · password='hunter22'".into(), ..crate::chronicle::Event::for_session(0, "tool-error", &s, String::new()) };
        let line = serde_json::to_string(&e).unwrap();
        assert!(line.contains("password=•••") && !line.contains("hunter22"), "the day file's line: {line}");
        let back: crate::chronicle::Event = serde_json::from_str(r#"{"ts":1,"kind":"commit","sessionId":"s","name":"n","dept":"d","helper":null,"detail":"token=old"}"#).unwrap();
        assert_eq!(back.detail, "token=old", "an old line still loads as written; it is masked when it goes out");
        let p = crate::registry::parse_permission_prompt(" Do you want to use password=\"hunter22\"?\n ❯ 1. Yes\n   2. No\n").unwrap();
        assert_eq!(p.question, "Do you want to use password=•••?");
    }

    #[test]
    fn volatile_parts_read_the_same() {
        assert_eq!(volatile("took 1234 ms"), volatile("took 5678 ms"));
        assert_eq!(volatile("took 12 ms"), volatile("took 97 ms"), "a short duration too");
        assert_eq!(volatile("at 2026-11-08T10:00:01.123Z: boom"), volatile("at 2026-11-08T11:42:59.900Z: boom"));
        assert_eq!(volatile("[10:00:01] boom"), volatile("[23:59:59] boom"));
        assert_eq!(volatile("ptr 0x7ffde4a0 bad"), volatile("ptr 0x1 bad"));
        assert_eq!(volatile("object deadbeef00 gone"), volatile("object 0123abcd99 gone"));
        assert_eq!(volatile("pid 48213 died"), volatile("pid 9001 died"));
        assert_eq!(volatile(r"C:\Users\g\AppData\Local\Temp\abc123\x.txt missing"), volatile(r"C:\Users\g\AppData\Local\Temp\zz9\x.txt missing"));
        assert_eq!(volatile("/tmp/tmp.Xa12/out missing"), volatile("/tmp/tmp.Qq77/out missing"));
        // What stays: the words, short numbers that name something (exit codes, line numbers), the file names.
        assert_eq!(volatile("error[E0425] at main.rs:12 exit code 2"), "error[E0425] at main.rs:12 exit code 2");
        assert_ne!(volatile("cannot find foo"), volatile("cannot find bar"));
        assert!(matches!(volatile("plain"), Cow::Borrowed(_)), "nothing to blur: no copy");
    }
}
