//! Orca, the terminal host: switch to a session's terminal, read the permission dialog on its screen, answer it.
use crate::{no_window, registry};
use std::process::Command;

/// Run `orca <args>` through `run` (spawn or output): "orca" on PATH first, the known install
/// path if that's not resolvable. Args go straight to the process, never through a shell.
fn orca<T>(args: &[&str], run: impl Fn(&mut Command) -> std::io::Result<T>) -> Result<T, String> {
    let with = |exe: String| {
        let mut cmd = no_window(Command::new(exe));
        cmd.args(args);
        run(&mut cmd)
    };
    with("orca".into()).or_else(|_| {
        let fallback = std::env::var("LOCALAPPDATA").map(|l| format!("{l}\\Programs\\orca\\resources\\bin\\orca.exe")).map_err(|_| "orca not found".to_string())?;
        with(fallback).map_err(|e| e.to_string())
    })
}

/// Switch Orca's foreground terminal to `handle`, or open `url` in the default browser. `target`
/// is "orca:<handle>" or "web:<url>"; both branches validate before touching the shell so a
/// malformed roster entry can never inject arguments.
#[tauri::command]
pub fn open_session(target: String) -> Result<(), String> {
    if let Some(handle) = target.strip_prefix("orca:") {
        if !registry::valid_orca_handle(handle) {
            return Err("invalid orca handle".into());
        }
        orca(&["terminal", "switch", "--terminal", handle], |c| c.spawn())?;
        Ok(())
    } else if let Some(url) = target.strip_prefix("web:") {
        if !registry::valid_claude_web_url(url) {
            return Err("invalid claude.ai url".into());
        }
        no_window(Command::new("cmd")).args(["/c", "start", "", url]).spawn().map_err(|e| e.to_string())?;
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
    let out = orca(&["terminal", "read", "--terminal", handle, "--screen", "--json"], |c| c.output())?;
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
/// except that digit. Errors are fixed strings. Runs off the main thread (async).
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
    let sent = orca(&["terminal", "send", "--terminal", &handle, "--text", &key, "--json"], |c| c.output())?;
    if !sent.status.success() {
        return Err("orca could not type into the terminal".into());
    }
    Ok(())
}
