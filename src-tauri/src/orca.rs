//! Orca, the terminal host: switch to a session's terminal, read the permission dialog on its screen, answer it.
use crate::{mask, no_window, registry, status};
use std::{
    io::Read,
    process::{Command, Output, Stdio},
    sync::mpsc::{channel, Receiver},
    thread,
    time::{Duration, Instant},
};

/// How long one Orca CLI call may take before it is killed: it answers in well under a second when it is up, and a
/// hung one would hold the card's peek (every 3 s) and the toast's answer.
const TIMEOUT: Duration = Duration::from_secs(3);

/// Where to look for the Orca CLI: "orca" on PATH first, then the known install paths (an app started from
/// Finder or the Dock does not get the shell's PATH, so /usr/local/bin and Homebrew are listed too). On Linux the
/// CLI is `orca-ide`, and `orca` is never tried: there it is GNOME's screen reader, which ignores the arguments it
/// does not know and starts. `orca-ide` on PATH, then the package's install path and the link Orca's CLI installer
/// puts in ~/.local/bin (a launcher may leave that folder off PATH).
fn candidates() -> Vec<String> {
    #[cfg(any(windows, target_os = "macos"))]
    let mut c = vec!["orca".to_string()];
    #[cfg(windows)]
    c.extend(std::env::var("LOCALAPPDATA").map(|l| format!("{l}\\Programs\\orca\\resources\\bin\\orca.exe")));
    #[cfg(target_os = "macos")]
    c.extend(["/Applications/Orca.app/Contents/Resources/bin/orca", "/usr/local/bin/orca", "/opt/homebrew/bin/orca"].map(String::from));
    #[cfg(not(any(windows, target_os = "macos")))]
    let c = ["orca-ide".to_string(), "/opt/Orca/resources/bin/orca-ide".to_string()]
        .into_iter()
        .chain(std::env::home_dir().map(|h| h.join(".local/bin/orca-ide").to_string_lossy().into_owned()))
        .collect();
    c
}

/// Why one call to a candidate failed: it did not start (try the next one), or it started and went wrong (stop).
enum Fail {
    NotStarted(std::io::Error),
    Ran(String),
}

/// The bytes of one pipe, sent when it closes.
fn drain<R: Read + Send + 'static>(pipe: Option<R>) -> Receiver<Vec<u8>> {
    let (tx, rx) = channel();
    thread::spawn(move || {
        let mut buf = vec![];
        if let Some(mut p) = pipe {
            let _ = p.read_to_end(&mut buf);
        }
        let _ = tx.send(buf);
    });
    rx
}

/// `cmd` run to its end, its output collected, killed when it has not ended after `limit`. Output goes through pipes
/// read on their own threads (a full pipe would stall the child); a pipe a grandchild keeps open is given up on
/// shortly after the child ends.
fn run(mut cmd: Command, limit: Duration) -> Result<Output, Fail> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(Fail::NotStarted)?;
    let (out, err) = (drain(child.stdout.take()), drain(child.stderr.take()));
    let deadline = Instant::now() + limit;
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(Fail::Ran(format!("orca did not answer in {} s", limit.as_secs_f32())));
            }
            Ok(None) => thread::sleep(Duration::from_millis(15)),
            Err(e) => return Err(Fail::Ran(e.to_string())),
        }
    };
    let grab = |rx: Receiver<Vec<u8>>| rx.recv_timeout(Duration::from_millis(300)).unwrap_or_default();
    Ok(Output { status, stdout: grab(out), stderr: grab(err) })
}

/// What a failed Orca call says: its stderr (masked, one line, clipped), else its exit status.
fn exit_error(out: &Output) -> String {
    let text = String::from_utf8_lossy(&out.stderr);
    let first = text.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or_default();
    if first.is_empty() {
        format!("orca exited with {}", out.status)
    } else {
        format!("orca failed: {}", registry::clip_to(&mask::mask(first), 200))
    }
}

/// `build(exe)` run for each of `exes` in turn until one starts, within `limit`. A candidate that cannot start is
/// skipped (the message stays "orca not found" unless one failed for another reason); one that starts is the answer:
/// a timeout or a non-zero exit is its error, and the next candidate is not tried.
fn first_of(exes: &[String], build: impl Fn(&str) -> Command, limit: Duration) -> Result<Output, String> {
    let mut err = "orca not found".to_string();
    for exe in exes {
        match run(build(exe), limit) {
            Ok(out) if out.status.success() => return Ok(out),
            Ok(out) => return Err(exit_error(&out)),
            Err(Fail::Ran(e)) => return Err(e),
            Err(Fail::NotStarted(e)) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(Fail::NotStarted(e)) => err = e.to_string(), // found but not runnable (permissions): a better message than "not found"
        }
    }
    Err(err)
}

/// Run `orca <args>`, trying each of `candidates()` until one starts, within `TIMEOUT`. Args go straight to the
/// process, never through a shell. A failure is recorded in the status store (once per change, not per call).
fn orca(args: &[&str]) -> Result<Output, String> {
    let result = first_of(
        &candidates(),
        |exe| {
            let mut cmd = no_window(Command::new(exe));
            cmd.args(args);
            cmd
        },
        TIMEOUT,
    );
    match &result {
        Ok(_) => status::report_change("orca", status::State::Ok, "answers"),
        Err(e) => status::report_change("orca", status::State::Warn, e),
    }
    result
}

/// Open `url` with the OS's opener: the default browser, or the app that owns its scheme (`claude://`). The URL is
/// one argument to the opener.
pub(crate) fn open_url(url: &str) -> std::io::Result<std::process::Child> {
    #[cfg(windows)]
    return no_window(Command::new("cmd")).args(["/c", "start", "", url]).spawn();
    #[cfg(target_os = "macos")]
    return Command::new("/usr/bin/open").arg(url).spawn();
    #[cfg(not(any(windows, target_os = "macos")))]
    return Command::new("xdg-open").arg(url).spawn();
}

/// Switch Orca's foreground terminal to `handle`, open `url` in the default browser, or open that claude.ai
/// session in the Claude desktop app. `target` is "orca:<handle>", "web:<url>" or "app:<url>"; every branch
/// validates before touching the shell so a malformed roster entry can never inject arguments.
#[tauri::command]
pub fn open_session(target: String) -> Result<(), String> {
    if let Some(handle) = target.strip_prefix("orca:") {
        if !registry::valid_orca_handle(handle) {
            return Err("invalid orca handle".into());
        }
        orca(&["terminal", "switch", "--terminal", handle])?;
        Ok(())
    } else if let Some(url) = target.strip_prefix("web:") {
        if !registry::valid_claude_web_url(url) {
            return Err("invalid claude.ai url".into());
        }
        open_url(url).map_err(|e| e.to_string())?;
        Ok(())
    } else if let Some(url) = target.strip_prefix("app:") {
        let link = registry::claude_desktop_link(url).ok_or("invalid claude.ai url")?;
        open_url(&link).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("unknown target kind".into())
    }
}

/// The Claude Code permission dialog on Orca terminal `handle`'s rendered screen (read only).
fn read_prompt(handle: &str) -> Result<registry::Prompt, String> {
    if !registry::valid_orca_handle(handle) {
        return Err("invalid orca handle".into());
    }
    let out = orca(&["terminal", "read", "--terminal", handle, "--screen", "--json"])?;
    let v: serde_json::Value = serde_json::from_slice(&out.stdout).map_err(|_| "unreadable terminal".to_string())?;
    let term = &v["result"]["terminal"];
    if v["ok"] != true || term["source"] != "screen" {
        return Err("terminal screen unavailable".into());
    }
    let screen = term["tail"].as_array().map(|l| l.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join("\n")).unwrap_or_default();
    registry::parse_permission_prompt(&screen).ok_or_else(|| "no permission prompt on screen".into())
}

#[derive(serde::Serialize)]
pub struct Peek {
    question: String,
    yes: String,
    always: Option<String>,
    no: String,
}

/// What the permission dialog in Orca terminal `handle` offers, for the card's buttons: its
/// question and the labels of the Yes / Always / No options. Never types anything. The labels
/// come from the screen (untrusted) and are only ever shown as text.
#[tauri::command(async)]
pub fn peek_petition(handle: String) -> Result<Peek, String> {
    let p = read_prompt(&handle)?;
    let label = |n: u8| p.options[n as usize - 1].1.clone(); // options are numbered 1, 2, ... by the parser
    Ok(Peek { question: p.question.clone(), yes: label(p.yes), always: p.always.map(label), no: label(p.no) })
}

/// Answer the Claude Code permission dialog in Orca terminal `handle`: "yes", "always" or "no".
/// Types exactly one option digit, and only after the rendered screen shows that dialog at its
/// bottom (see `registry::parse_permission_prompt`); nothing read from the screen is ever sent
/// except that digit. Errors are fixed strings, or Orca's own failure (its stderr, masked and clipped). Runs off the
/// main thread (async).
#[tauri::command(async)]
pub fn answer_petition(handle: String, choice: String) -> Result<(), String> {
    let p = read_prompt(&handle)?;
    let n = match choice.as_str() {
        "yes" => p.yes,
        "always" => p.always.ok_or("this prompt has no 'always' option")?,
        "no" => p.no,
        _ => return Err("unknown choice".into()),
    };
    let key = char::from(b'0' + n).to_string(); // 1..=9, guaranteed by the parser
    orca(&["terminal", "send", "--terminal", &handle, "--text", &key, "--json"])?; // a non-zero exit is its error
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The test binary stands in for the Orca CLI: started with `ADM_FAKE_ORCA` set (by `fake`), this test plays a
    /// fake CLI and exits; in a normal run the variable is absent and it does nothing.
    #[test]
    fn fake_orca() {
        use std::io::Write;
        match std::env::var("ADM_FAKE_ORCA").as_deref() {
            Ok("sleep") => thread::sleep(Duration::from_secs(60)),
            Ok("fail") => {
                let _ = std::io::stderr().write_all(b"
  terminal not found
more
");
                std::process::exit(3)
            }
            Ok("leak") => {
                let _ = std::io::stderr().write_all(b"bad token=Abcdefghij0123456789xyz
");
                std::process::exit(1)
            }
            Ok("silent-fail") => std::process::exit(4),
            Ok("ok") => {
                let _ = std::io::stdout().write_all(b"FAKE-ORCA-OK
");
                std::process::exit(0)
            }
            _ => {}
        }
    }

    /// A command that runs the fake CLI in `mode`; `exe` is the program (the test binary, or a path that is not there).
    fn fake(mode: &'static str) -> impl Fn(&str) -> Command {
        move |exe| {
            let mut c = Command::new(exe);
            c.args(["--exact", "orca::tests::fake_orca", "--nocapture", "--test-threads=1"]).env("ADM_FAKE_ORCA", mode);
            c
        }
    }

    fn me() -> String {
        std::env::current_exe().unwrap().to_string_lossy().into_owned()
    }

    const NOWHERE: &str = "/definitely/not/here/orca-nope";

    #[test]
    fn a_hung_orca_is_killed_at_the_timeout_and_reports_it() {
        let started = Instant::now();
        let err = first_of(&[me()], fake("sleep"), Duration::from_millis(400)).unwrap_err();
        assert!(err.contains("did not answer"), "{err}");
        assert!(started.elapsed() < Duration::from_secs(5), "returned within the bound, not after the fake's 60 s: {:?}", started.elapsed());
    }

    #[test]
    fn a_non_zero_exit_is_an_error_with_its_stderr() {
        assert_eq!(first_of(&[me()], fake("fail"), Duration::from_secs(20)).unwrap_err(), "orca failed: terminal not found");
        let silent = first_of(&[me()], fake("silent-fail"), Duration::from_secs(20)).unwrap_err();
        assert!(silent.starts_with("orca exited with") && silent.contains('4'), "no stderr: the exit status says it: {silent}");
        let leak = first_of(&[me()], fake("leak"), Duration::from_secs(20)).unwrap_err();
        assert!(leak.contains("token=•••") && !leak.contains("Abcdefghij0123456789xyz"), "the stderr goes out masked: {leak}");
    }

    #[test]
    fn no_candidate_is_orca_not_found() {
        assert_eq!(first_of(&[], fake("ok"), Duration::from_secs(1)).unwrap_err(), "orca not found");
        let none = [NOWHERE.to_string(), format!("{NOWHERE}-2")];
        assert_eq!(first_of(&none, fake("ok"), Duration::from_secs(1)).unwrap_err(), "orca not found", "each candidate missing: the clear message stays");
    }

    #[test]
    fn a_missing_candidate_is_skipped_and_one_that_ran_is_the_answer() {
        let ok = first_of(&[NOWHERE.into(), me()], fake("ok"), Duration::from_secs(20)).unwrap();
        assert!(String::from_utf8_lossy(&ok.stdout).contains("FAKE-ORCA-OK"), "stdout is collected");
        let err = first_of(&[NOWHERE.into(), me()], fake("fail"), Duration::from_secs(20)).unwrap_err();
        assert_eq!(err, "orca failed: terminal not found", "not overwritten by the missing candidate's error");
        let after = first_of(&[me(), NOWHERE.into()], fake("fail"), Duration::from_secs(20)).unwrap_err();
        assert_eq!(after, "orca failed: terminal not found", "a candidate that ran ends the search");
    }

    /// Linux: `orca` is GNOME's screen reader, which would start on any arguments.
    #[cfg(not(any(windows, target_os = "macos")))]
    #[test]
    fn linux_never_runs_the_screen_reader() {
        let c = super::candidates();
        assert_eq!(c[0], "orca-ide");
        assert!(c.iter().all(|e| e.ends_with("orca-ide")), "{c:?}");
    }
}
