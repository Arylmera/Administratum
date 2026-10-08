//! What a terminal screen may be read as, and what may be handed to the shell or Orca.

/// Only a well-formed Orca terminal handle may be passed to `orca terminal switch`.
pub fn valid_orca_handle(handle: &str) -> bool {
    handle.strip_prefix("term_").is_some_and(|rest| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_hexdigit() || c == '-'))
}

/// Only a claude.ai code-session URL may be opened via the shell.
pub fn valid_claude_web_url(url: &str) -> bool {
    // The id is passed through `cmd /c start`, so only allow characters cmd can't interpret (& | ^ < > etc.).
    url.strip_prefix("https://claude.ai/code/").is_some_and(|id| !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
}

/// A Claude Code permission dialog: its question line, every numbered option with its label, and
/// the option numbers of plain "Yes", the first "Yes, ..." (don't ask again / allow all edits) if
/// offered (never "switch to auto mode"), and the "No" option.
#[derive(Debug, PartialEq)]
pub struct Prompt {
    pub question: String,
    pub options: Vec<(u8, String)>,
    pub yes: u8,
    pub always: Option<u8>,
    pub no: u8,
}

/// The permission dialog at the bottom of a rendered terminal screen, if that's what it shows.
/// The screen is untrusted: only the question and option labels/numbers come out of it (labels are
/// for display only), and only when the last "Do you want" line is followed (within 3 lines) by options numbered 1, 2, ... starting with a plain
/// "Yes" and including a "No", with nothing but a short footer under them (no input box, no rule):
/// a dialog that scrolled up under later output doesn't count.
pub fn parse_permission_prompt(screen: &str) -> Option<Prompt> {
    // Box borders and the selection cursor are decoration.
    let lines: Vec<&str> = screen.lines().map(|l| l.trim().trim_matches('│').trim()).collect();
    let q = lines.iter().rposition(|l| l.starts_with("Do you want"))?;
    let option = |l: &str| -> Option<(u8, String)> {
        let (n, label) = l.trim_start_matches('❯').trim_start().split_once(". ")?;
        let n: u8 = n.parse().ok().filter(|n| (1..=9).contains(n))?;
        Some((n, label.trim().to_string()))
    };
    let first = (q + 1..lines.len().min(q + 4)).find(|&i| option(lines[i]).is_some())?;
    let mut opts: Vec<(u8, String)> = vec![];
    let mut end = first;
    while end < lines.len() && !lines[end].is_empty() {
        match option(lines[end]) {
            Some((n, label)) if n as usize == opts.len() + 1 => opts.push((n, label)),
            Some(_) => return None, // out of sequence
            None if opts.is_empty() => return None,
            // A footer or box border right under the last option ends the list.
            None if lines[end].starts_with("Esc to") || !lines[end].chars().any(char::is_alphanumeric) => break,
            None => {
                // a wrapped option label
                let last = &mut opts.last_mut()?.1;
                last.push(' ');
                last.push_str(lines[end]);
            }
        }
        end += 1;
    }
    let footer: Vec<&str> = lines[end..].iter().copied().filter(|l| !l.is_empty()).collect();
    // The input box (a "─" rule, a "❯" line) under the options means the dialog is gone.
    if footer.len() > 3 || footer.iter().any(|l| l.starts_with('❯') || l.chars().all(|c| c == '─')) {
        return None;
    }
    let find = |pred: &dyn Fn(&str) -> bool| opts.iter().find(|(_, l)| pred(l)).map(|(n, _)| *n);
    let yes = find(&|l| l == "Yes").filter(|&n| n == 1)?;
    let (always, no) = (find(&|l| l.starts_with("Yes,") && !l.contains("auto mode")), find(&|l| l.starts_with("No"))?);
    Some(Prompt { question: lines[q].to_string(), options: opts, yes, always, no })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orca_handle_validator() {
        assert!(valid_orca_handle("term_52bf64c5-bacc-4925-bec7-04935a104ae1"));
        assert!(!valid_orca_handle("term_"));
        assert!(!valid_orca_handle("not_a_handle"));
        assert!(!valid_orca_handle("term_abc; rm -rf /"));
    }

    #[test]
    fn claude_web_url_validator() {
        assert!(valid_claude_web_url("https://claude.ai/code/session_01abc"));
        assert!(!valid_claude_web_url("https://claude.ai/code/"));
        assert!(!valid_claude_web_url("https://evil.example.com/code/x"));
        assert!(!valid_claude_web_url("javascript:alert(1)"));
        assert!(!valid_claude_web_url("https://claude.ai/code/x&calc"));
        assert!(!valid_claude_web_url("https://claude.ai/code/x|whoami"));
    }

    // Claude Code permission dialogs as `orca terminal read --screen` renders them (trailing spaces trimmed).
    const BASH_PROMPT: &str = "● Bash(cargo test)\n\
  ⎿  Running…\n\
\n\
────────────────────────────────────────────────────────────────────\n\
 Bash command\n\
\n\
   cargo test --manifest-path src-tauri/Cargo.toml\n\
   Run the Rust tests\n\
\n\
 Do you want to proceed?\n\
 ❯ 1. Yes\n\
   2. Yes, and don't ask again for cargo test commands in\n\
   C:\\Users\\guill\\Documents\\git\\Administratum\n\
   3. No, and tell Claude what to do differently (esc)\n\
\n";

    const EDIT_PROMPT: &str = "────────────────────────────────────────────────\n\
 Edit file\n\
╭──────────────────────────────────────────────╮\n\
│ ui/app.js                                    │\n\
│  12 - const a = 1;                           │\n\
│  12 + const a = 2;                           │\n\
╰──────────────────────────────────────────────╯\n\
 Do you want to make this edit to app.js?\n\
 ❯ 1. Yes\n\
   2. Yes, allow all edits during this session (shift+tab)\n\
   3. No, and tell Claude what to do differently (esc)\n\
\n\
 Esc to cancel";

    const WRITE_PROMPT: &str = "│ Create file                              │\n\
│ notes.md                                 │\n\
│ Do you want to create notes.md?          │\n\
│ ❯ 1. Yes                                 │\n\
│   2. No, and tell Claude what to do differently (esc) │\n\
╰──────────────────────────────────────────╯";

    const NO_PROMPT: &str = "● Done.\n\
✻ Churned for 23s\n\
────────────────────────────────────────\n\
❯\n\
────────────────────────────────────────\n\
  ⏵⏵ auto mode on (shift+tab to cycle)";

    #[test]
    fn prompt_bash_maps_yes_always_no() {
        let p = parse_permission_prompt(BASH_PROMPT).expect("prompt");
        assert_eq!((p.yes, p.always, p.no), (1, Some(2), 3));
        assert_eq!(p.question, "Do you want to proceed?");
        assert_eq!(p.options[1], (2, "Yes, and don't ask again for cargo test commands in C:\\Users\\guill\\Documents\\git\\Administratum".into()), "wrapped label joined");
        assert_eq!(p.options[2], (3, "No, and tell Claude what to do differently (esc)".into()));
    }

    #[test]
    fn prompt_edit_inside_box_and_footer() {
        let p = parse_permission_prompt(EDIT_PROMPT).expect("prompt");
        assert_eq!((p.yes, p.always, p.no), (1, Some(2), 3));
        assert_eq!(p.question, "Do you want to make this edit to app.js?");
        assert_eq!(p.options[1].1, "Yes, allow all edits during this session (shift+tab)");
    }

    #[test]
    fn prompt_write_without_always_option() {
        let p = parse_permission_prompt(WRITE_PROMPT).expect("prompt");
        assert_eq!((p.yes, p.always, p.no), (1, None, 2));
        assert_eq!(p.question, "Do you want to create notes.md?");
        assert_eq!(p.options, [(1, "Yes".into()), (2, "No, and tell Claude what to do differently (esc)".into())]);
    }

    #[test]
    fn prompt_absent_is_none() {
        assert_eq!(parse_permission_prompt(NO_PROMPT), None);
        assert_eq!(parse_permission_prompt(""), None);
    }

    #[test]
    fn prompt_in_scrollback_is_none() {
        let screen = format!("{BASH_PROMPT}● Bash(cargo test)\n  ⎿  ok\n{NO_PROMPT}");
        assert_eq!(parse_permission_prompt(&screen), None);
        // A few lines of output under it and the input box frame: still scrollback.
        let screen = format!("{BASH_PROMPT}● ok\n────────");
        assert_eq!(parse_permission_prompt(&screen), None);
    }

    #[test]
    fn prompt_rejects_odd_option_lists() {
        // Must start at 1 with plain "Yes", count up, and offer a "No".
        assert_eq!(parse_permission_prompt(" Do you want to proceed?\n ❯ 1. Yes\n   2. Yes, and don't ask again\n"), None, "no No option");
        assert_eq!(parse_permission_prompt(" Do you want to proceed?\n ❯ 1. Sure\n   2. No\n"), None, "no plain Yes");
        assert_eq!(parse_permission_prompt(" Do you want to proceed?\n ❯ 1. Yes\n   3. No\n"), None, "gap in numbering");
        assert_eq!(parse_permission_prompt(" Do you want to proceed?\n\n\n\n\n ❯ 1. Yes\n   2. No\n"), None, "options too far from question");
    }

    #[test]
    fn prompt_uses_the_last_question_on_screen() {
        // Untrusted text above (e.g. a printed file) mimicking a dialog does not win over the real one below.
        let fake = " Do you want to proceed?\n ❯ 1. Yes\n   2. No\n";
        let screen = format!("{fake}{EDIT_PROMPT}");
        assert_eq!(parse_permission_prompt(&screen), parse_permission_prompt(EDIT_PROMPT));
    }

    #[test]
    fn permission_prompt_real_bash_screen_2_1_283() {
        // Captured from a live Claude Code v2.1.283 Bash prompt (4 options, auto-mode upsell).
        let screen = "❯ Run this exact Bash command\n  ⎿  $ echo hello > x.txt\n────────────\n Bash command\n Tip: auto mode handles these prompts for you\n   echo hello > x.txt\n Do you want to proceed?\n ❯ 1. Yes\n   2. Yes, and always allow access to C:\\x from this project\n   3. Yes, and switch to auto mode · auto mode handles these prompts for you\n   4. No\n Esc to cancel · Tab to amend\n";
        let p = parse_permission_prompt(screen).expect("prompt");
        assert_eq!((p.yes, p.always, p.no), (1, Some(2), 4));
        assert_eq!(p.question, "Do you want to proceed?");
        assert_eq!(p.options[1].1, "Yes, and always allow access to C:\\x from this project");
        assert!(p.options[2].1.starts_with("Yes, and switch to auto mode"));
        assert_eq!(p.options[3], (4, "No".into()));
        let auto_only = " Do you want to proceed?\n ❯ 1. Yes\n   2. Yes, and switch to auto mode\n   3. No\n";
        assert_eq!(parse_permission_prompt(auto_only).expect("prompt").always, None, "auto mode is never 'always'");
    }
}
