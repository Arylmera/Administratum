//! Custom rooms (Settings > Rooms, `adm.rooms`): user rules that map a folder pattern to a named room. Each tick the
//! roster's sessions get the id of the first rule their `cwd` matches (`assign`); the UI groups their departments in
//! that room. A pattern is a glob (case-insensitive, `\` and `/` alike, anchored) or, after `re:`, a regex run
//! unanchored on the normalised path. The `regex` crate is linear-time; a pattern is capped at 200 characters and its
//! compiled size at 1 MiB, so a rule cannot hang the poll loop.

use crate::registry::Session;
use regex::{Regex, RegexBuilder};
use serde_json::Value;
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};

pub const MAX_RULES: usize = 6;
pub const MAX_PATTERN: usize = 200;
const MAX_NAME: usize = 32;

pub struct Rule {
    pub id: String,
    pub re: Regex,
}

/// A glob as an anchored regex source: `**/` any folders (none included), a trailing `/**` the folder itself or
/// anything under it, any other `**` anything, `*` within one segment, `?` one character of a segment; the rest is
/// literal (no `[...]`, no `{a,b}`). `\` counts as `/`; a trailing `/` is dropped, as `norm` drops the path's.
pub fn glob_to_regex(glob: &str) -> String {
    let g = glob.replace('\\', "/");
    let c: Vec<char> = g.trim_end_matches('/').chars().collect();
    let mut out = String::from("^");
    let mut i = 0;
    while i < c.len() {
        let rest = &c[i..];
        let (re, n) = if rest.starts_with(&['*', '*', '/']) {
            ("(?:.*/)?".to_string(), 3)
        } else if rest == ['/', '*', '*'] {
            ("(?:/.*)?".to_string(), 3)
        } else if rest.starts_with(&['*', '*']) {
            (".*".to_string(), 2)
        } else if c[i] == '*' {
            ("[^/]*".to_string(), 1)
        } else if c[i] == '?' {
            ("[^/]".to_string(), 1)
        } else {
            (regex::escape(&c[i].to_string()), 1)
        };
        out.push_str(&re);
        i += n;
    }
    out.push('$');
    out
}

/// A rule's pattern compiled: a glob, or `re:` + a regex. Err (the message the Settings tab shows) on an empty pattern,
/// one over `MAX_PATTERN` characters (`re:` included) or an invalid one.
pub fn compile(pattern: &str) -> Result<Regex, String> {
    if pattern.trim().is_empty() {
        return Err("empty pattern".into());
    }
    if pattern.chars().count() > MAX_PATTERN {
        return Err(format!("longer than {MAX_PATTERN} characters"));
    }
    let src = match pattern.strip_prefix("re:") {
        Some(re) if re.trim().is_empty() => return Err("empty regex".into()),
        Some(re) => re.to_string(),
        None => glob_to_regex(pattern),
    };
    RegexBuilder::new(&src).case_insensitive(true).size_limit(1 << 20).build().map_err(|e| e.to_string())
}

/// An `adm.rooms` entry the UI would also keep (ui/rooms.js roomsOf): an id not seen before, a name of at most 32
/// characters, a pattern of 1 to 200, a `#rrggbb` colour.
fn shaped(e: &Value, seen: &mut HashSet<String>) -> bool {
    let s = |k: &str| e[k].as_str();
    let hex = s("color").is_some_and(|c| c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|d| d.is_ascii_hexdigit()));
    let ok = s("id").is_some_and(|id| !id.is_empty())
        && s("name").is_some_and(|n| n.chars().count() <= MAX_NAME)
        && s("pattern").is_some_and(|p| !p.trim().is_empty() && p.chars().count() <= MAX_PATTERN)
        && hex;
    ok && seen.insert(s("id").unwrap_or_default().to_string())
}

/// The rules in `settings["adm.rooms"]` (a JSON string, rule order): the first `MAX_RULES` well-shaped entries, those
/// whose pattern compiles. Corrupt JSON or anything but an array: no rules.
pub fn rules_from(settings: &Value) -> Vec<Rule> {
    let list = settings["adm.rooms"].as_str().and_then(|t| serde_json::from_str::<Value>(t).ok());
    let Some(list) = list.as_ref().and_then(Value::as_array) else { return vec![] };
    let mut seen = HashSet::new();
    list.iter().filter(|e| shaped(e, &mut seen)).take(MAX_RULES).filter_map(|e| Some(Rule { id: e["id"].as_str()?.to_string(), re: compile(e["pattern"].as_str()?).ok()? })).collect()
}

/// A cwd as the rules see it: `\` as `/`, no trailing `/`.
pub fn norm(cwd: &str) -> String {
    cwd.replace('\\', "/").trim_end_matches('/').to_string()
}

/// The first rule whose pattern matches `cwd`: its id.
pub fn room_of(cwd: &str, rules: &[Rule]) -> Option<String> {
    let p = norm(cwd);
    rules.iter().find(|r| r.re.is_match(&p)).map(|r| r.id.clone())
}

/// Every session's room; a temp session (the break-out room) never has one.
pub fn assign(roster: &mut [Session], rules: &[Rule]) {
    for s in roster.iter_mut() {
        s.room = if s.temp { None } else { room_of(&s.cwd, rules) };
    }
}

static RULES: Mutex<Option<Arc<Vec<Rule>>>> = Mutex::new(None);

/// The rules in force (compiled at setup and on each settings save, monitor.rs's pattern).
pub fn set(rules: Vec<Rule>) {
    *crate::lock(&RULES) = Some(Arc::new(rules));
}

pub fn get() -> Arc<Vec<Rule>> {
    crate::lock(&RULES).clone().unwrap_or_default()
}

/// Settings > Rooms, while a pattern is typed: whether it compiles (Err: the message), and which of `cwds` it matches.
#[tauri::command]
pub fn rooms_test(pattern: String, cwds: Vec<String>) -> Result<Vec<bool>, String> {
    let re = compile(&pattern)?;
    Ok(cwds.iter().map(|c| re.is_match(&norm(c))).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::{tests_session, Agent};
    use serde_json::json;

    const TERRA: &str = r"C:\Users\guill\Documents\git\Terra";
    fn rule(id: &str, pattern: &str) -> Rule {
        Rule { id: id.into(), re: compile(pattern).unwrap() }
    }
    fn hits(pattern: &str, cwds: &[&str]) -> Vec<bool> {
        rooms_test(pattern.into(), cwds.iter().map(|c| c.to_string()).collect()).unwrap()
    }

    #[test]
    fn glob_matches_the_folder_and_under_it_in_any_case() {
        let p = "**/git/Terra/**";
        assert_eq!(hits(p, &[TERRA, &format!(r"{TERRA}\ui"), r"c:\users\GUILL\documents\GIT\terra\", r"C:\git\TerraX", r"C:\git\Terra2\x"]), [true, true, true, false, false]);
        assert_eq!(hits("C:/git/*", &[r"C:\git\Terra", r"C:\git\Terra\ui"]), [true, false], "* stays in one segment");
        assert_eq!(hits("C:/git/Ter?a", &[r"C:\git\Terra", r"C:\git\Ter/a"]), [true, false], "? is one character of a segment");
        assert_eq!(hits("C:/git/**", &[r"C:\git", r"C:\git\a\b"]), [true, true]);
        assert_eq!(hits("**/a.b+c(d)", &[r"C:\x\a.b+c(d)", r"C:\x\aXb+c(d)", r"C:\x\abbc(d)"]), [true, false, false], ". + ( are literal");
        assert_eq!(hits(r"C:\Users\guill\Documents\git\Terra\", &[TERRA]), [true], "a trailing separator on the glob");
        assert_eq!(glob_to_regex("**/git/Terra/**"), r"^(?:.*/)?git/Terra(?:/.*)?$");
    }

    #[test]
    fn re_prefix_is_an_unanchored_case_insensitive_regex() {
        assert_eq!(hits("re:git/(terra|geneseed)$", &[TERRA, r"C:\git\Geneseed", r"C:\git\Terra\ui"]), [true, true, false]);
        assert_eq!(hits("re:TERRA", &[r"C:\git\Terra\ui"]), [true], "unanchored, case-insensitive");
        assert!(rooms_test("re:(".into(), vec![]).is_err());
        assert!(compile("re:").is_err());
    }

    #[test]
    fn empty_and_overlong_patterns_are_errors() {
        assert!(compile("").is_err());
        assert!(compile("   ").is_err());
        assert!(compile(&"a".repeat(MAX_PATTERN)).is_ok());
        assert!(compile(&"a".repeat(MAX_PATTERN + 1)).is_err());
        assert!(compile(&format!("re:{}", "a".repeat(MAX_PATTERN - 3))).is_ok(), "re: counts toward the cap");
        assert!(compile(&format!("re:{}", "a".repeat(MAX_PATTERN - 2))).is_err());
    }

    #[test]
    fn rules_from_skips_bad_entries_keeps_order_and_caps() {
        let rooms = |v: Value| json!({ "adm.rooms": v.to_string() });
        let ok = |id: &str, pattern: &str| json!({ "id": id, "name": id, "pattern": pattern, "color": "#d9a84e" });
        let ids = |r: Vec<Rule>| r.into_iter().map(|r| r.id).collect::<Vec<_>>();
        assert!(rules_from(&json!({})).is_empty());
        assert!(rules_from(&json!({ "adm.rooms": "{oops" })).is_empty(), "corrupt JSON");
        assert!(rules_from(&json!({ "adm.rooms": "{}" })).is_empty(), "not a list");
        let bad = vec![
            json!(1),
            json!({ "id": "", "name": "x", "pattern": "**", "color": "#000000" }),
            json!({ "id": "c", "name": "x", "pattern": "**", "color": "red" }),
            json!({ "id": "n", "name": "x".repeat(33), "pattern": "**", "color": "#000000" }),
            json!({ "id": "p", "name": "x", "pattern": "", "color": "#000000" }),
            ok("b", "**/b/**"),
            ok("b", "**/dup/**"),
            ok("bad", "re:("),
            ok("a", "**/a/**"),
        ];
        assert_eq!(ids(rules_from(&rooms(Value::Array(bad)))), ["b", "a"], "rule order, bad entries, a duplicate id and a bad regex dropped");
        let many: Vec<Value> = (0..8).map(|i| ok(&format!("r{i}"), "**")).collect();
        assert_eq!(ids(rules_from(&rooms(Value::Array(many)))), ["r0", "r1", "r2", "r3", "r4", "r5"], "the first six");
    }

    #[test]
    fn first_matching_rule_wins_and_temp_gets_none() {
        let rules = [rule("wide", "**/git/**"), rule("terra", "**/git/Terra/**")];
        assert_eq!(room_of(TERRA, &rules).as_deref(), Some("wide"));
        assert_eq!(room_of(TERRA, &rules[1..]).as_deref(), Some("terra"));
        assert_eq!(room_of(r"D:\elsewhere", &rules), None);
        let mut roster = vec![
            Session { cwd: TERRA.into(), ..tests_session("a") },
            Session { cwd: TERRA.into(), temp: true, room: Some("stale".into()), ..tests_session("t") },
            Session { cwd: TERRA.into(), source: Agent::OpenCode, ..tests_session("oc") },
            Session { cwd: r"D:\elsewhere".into(), room: Some("stale".into()), ..tests_session("x") },
        ];
        assign(&mut roster, &rules[1..]);
        let rooms: Vec<_> = roster.iter().map(|s| s.room.as_deref()).collect();
        assert_eq!(rooms, [Some("terra"), None, Some("terra"), None], "temp: the break-out room; OpenCode: its room; no match: cleared");
    }

    #[test]
    fn rules_in_force_and_the_settings_file() {
        set(vec![rule("terra", "**/Terra/**")]);
        assert_eq!(get().len(), 1);
        set(vec![]);
        assert!(get().is_empty());
        let v = json!({ "adm.rooms": json!([{ "id": "r1", "name": "Terra", "pattern": "**/Terra/**", "color": "#d9a84e" }]).to_string() });
        assert!(crate::settings::validate(&v).is_ok(), "adm.rooms is one string value");
        assert_eq!(rules_from(&v).len(), 1);
    }
}
