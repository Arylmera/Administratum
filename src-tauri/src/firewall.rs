//! The Windows Firewall rule that lets other devices reach the remote view. Reading is
//! unelevated; changing goes through one elevated PowerShell (Windows shows its UAC prompt).
//! Scripts are fixed text plus a validated port and exe path, passed as -EncodedCommand.
use std::{path::Path, process::Command};

const RULE: &str = "Administratum remote view";

/// Status read: active connection profiles and every rule named RULE, as JSON. Takes no input.
const READ: &str = "$ErrorActionPreference = 'SilentlyContinue'
$n = @(Get-NetConnectionProfile | ForEach-Object { [string]$_.NetworkCategory })
$r = @(Get-NetFirewallRule -DisplayName 'Administratum remote view' | ForEach-Object {
  $p = $_ | Get-NetFirewallPortFilter
  $a = $_ | Get-NetFirewallApplicationFilter
  @{ enabled = [string]$_.Enabled; action = [string]$_.Action; direction = [string]$_.Direction; profile = [string]$_.Profile; protocol = [string]$p.Protocol; port = [string]$p.LocalPort; program = [string]$a.Program }
})
ConvertTo-Json -Compress -Depth 3 -InputObject @{ networks = $n; rules = $r }";

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Status {
    pub network: &'static str,
    pub rule: &'static str,
    pub detail: String,
}

pub fn valid_port(port: u16) -> Result<u16, String> {
    if port >= 1024 {
        Ok(port)
    } else {
        Err("port must be between 1024 and 65535".into())
    }
}

/// The exe path goes inside a single-quoted PowerShell string: allow only letters, digits and
/// plain path punctuation (no quotes of any kind, `$`, backtick, `;`, control characters...).
pub fn valid_exe(path: &Path) -> Result<&str, String> {
    let s = path.to_str().ok_or("the program path is not valid Unicode")?;
    let ok = path.is_absolute() && s.to_ascii_lowercase().ends_with(".exe") && s.chars().all(|c| c.is_alphanumeric() || " \\:._-()".contains(c));
    if ok {
        Ok(s)
    } else {
        Err(format!("unsupported program path: {s}"))
    }
}

pub fn allow_script(port: u16, exe: &str) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'
Remove-NetFirewallRule -DisplayName '{RULE}' -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName '{RULE}' -Direction Inbound -Program '{exe}' -Protocol TCP -LocalPort {port} -RemoteAddress LocalSubnet -Action Allow -Profile Private | Out-Null
exit 0"
    )
}

pub fn remove_script() -> String {
    format!("Remove-NetFirewallRule -DisplayName '{RULE}' -ErrorAction SilentlyContinue\nexit 0")
}

/// UTF-16LE then base64, what powershell -EncodedCommand expects.
pub fn encode(script: &str) -> String {
    const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for c in bytes.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            out.push(if i <= c.len() { B64[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
        }
    }
    out
}

pub fn powershell(script: &str) -> Result<std::process::Output, String> {
    crate::no_window(Command::new("powershell.exe")).args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &encode(script)]).output().map_err(|e| format!("cannot run PowerShell: {e}"))
}

/// Run `script` elevated and wait. A refused UAC prompt makes Start-Process throw: exit 1223.
fn elevated(script: &str) -> Result<(), String> {
    let outer = format!(
        "try {{ $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile -NonInteractive -EncodedCommand {}'; exit $p.ExitCode }} catch {{ exit 1223 }}",
        encode(script)
    );
    match powershell(&outer)?.status.code() {
        Some(0) => Ok(()),
        Some(1223) => Err("Cancelled".into()),
        code => Err(format!("The firewall change failed (exit {})", code.map_or("?".into(), |c| c.to_string()))),
    }
}

pub fn allow(port: u16) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    elevated(&allow_script(valid_port(port)?, valid_exe(&exe)?))
}

pub fn remove() -> Result<(), String> {
    elevated(&remove_script())
}

pub fn status(port: u16) -> Result<Status, String> {
    let port = valid_port(port)?;
    let out = powershell(READ)?;
    let exe = std::env::current_exe().ok();
    parse(&String::from_utf8_lossy(&out.stdout), port, exe.as_deref().and_then(|p| p.to_str()))
}

#[derive(serde::Deserialize, Default)]
#[serde(default)]
struct Raw {
    networks: Vec<String>,
    rules: Vec<RawRule>,
}

#[derive(serde::Deserialize, Default)]
#[serde(default)]
struct RawRule {
    enabled: String,
    action: String,
    direction: String,
    profile: String,
    protocol: String,
    port: String,
    program: String,
}

/// "Any", "7770", "7770-7780", or several of those separated by spaces or commas.
fn port_matches(spec: &str, port: u16) -> bool {
    spec.split([' ', ',']).filter(|s| !s.is_empty()).any(|s| {
        s.eq_ignore_ascii_case("any")
            || match s.split_once('-') {
                Some((a, b)) => a.parse().is_ok_and(|a: u16| a <= port) && b.parse().is_ok_and(|b: u16| port <= b),
                None => s.parse() == Ok(port),
            }
    })
}

pub fn parse(json: &str, port: u16, exe: Option<&str>) -> Result<Status, String> {
    let raw: Raw = serde_json::from_str(json.trim()).map_err(|e| format!("cannot read the firewall status: {e}"))?;
    let has = |c: &str| raw.networks.iter().any(|n| n.eq_ignore_ascii_case(c));
    // ponytail: several connected networks report as one; the private one wins (it is the LAN).
    let (network, category) = if has("Private") {
        ("private", "Private")
    } else if has("DomainAuthenticated") {
        ("domain", "Domain")
    } else if has("Public") {
        ("public", "Public")
    } else {
        ("unknown", "")
    };
    let on_port: Vec<&RawRule> = raw.rules.iter().filter(|r| port_matches(&r.port, port)).collect();
    let open = |r: &&&RawRule| {
        r.enabled.eq_ignore_ascii_case("true")
            && r.action.eq_ignore_ascii_case("allow")
            && r.direction.eq_ignore_ascii_case("inbound")
            && (r.protocol.eq_ignore_ascii_case("tcp") || r.protocol.eq_ignore_ascii_case("any"))
    };
    let (rule, detail) = if raw.rules.is_empty() {
        ("missing", "Blocked by the Windows Firewall (no rule for Administratum)".to_string())
    } else if on_port.is_empty() {
        ("other-port", format!("The firewall rule allows port {}, not {port}", raw.rules[0].port))
    } else if let Some(r) = on_port.iter().find(open) {
        let applies = r.profile.split(',').any(|p| {
            let p = p.trim();
            p.eq_ignore_ascii_case("any") || p.eq_ignore_ascii_case(category)
        });
        let mut d = match (applies, network) {
            (_, "unknown") => format!("Allowed on port {port}"),
            (true, _) => format!("Allowed on port {port} ({network} network)"),
            (false, _) => format!("Your network is {category} — the rule only applies on {} networks", r.profile.to_lowercase()),
        };
        if let Some(exe) = exe.filter(|e| !r.program.is_empty() && !r.program.eq_ignore_ascii_case("any") && !r.program.eq_ignore_ascii_case(e)) {
            d += &format!(" — but the rule is for another program ({}, this is {exe})", r.program);
        }
        ("allowed", d)
    } else if on_port.iter().any(|r| r.enabled.eq_ignore_ascii_case("false")) {
        ("disabled", "The firewall rule is turned off".to_string())
    } else {
        ("disabled", "The firewall rule does not allow inbound TCP connections".to_string())
    };
    Ok(Status { network, rule, detail })
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXE: &str = r"C:\Users\guill\AppData\Local\Administratum\administratum.exe";
    fn rule(enabled: &str, profile: &str, port: &str) -> String {
        format!(
            r#"{{"action":"Allow","direction":"Inbound","profile":"{profile}","program":"C:\\Users\\guill\\AppData\\Local\\Administratum\\administratum.exe","protocol":"TCP","port":"{port}","enabled":"{enabled}"}}"#
        )
    }
    fn st(net: &str, rules: &[String]) -> Status {
        parse(&format!(r#"{{"networks":[{net}],"rules":[{}]}}"#, rules.join(",")), 7770, Some(EXE)).unwrap()
    }

    #[test]
    fn ports() {
        assert!(valid_port(1023).is_err());
        assert_eq!(valid_port(1024), Ok(1024));
        assert_eq!(valid_port(65535), Ok(65535));
        assert!(port_matches("7770", 7770) && port_matches("Any", 7770) && port_matches("7000-8000", 7770) && port_matches("80 7770", 7770));
        assert!(!port_matches("7771", 7770) && !port_matches("", 7770) && !port_matches("7771-8000", 7770));
    }

    #[test]
    fn exe_paths() {
        assert_eq!(valid_exe(Path::new(EXE)), Ok(EXE));
        assert!(valid_exe(Path::new(r"C:\Program Files (x86)\Admin-1\app_v2.exe")).is_ok());
        assert!(valid_exe(Path::new(r"C:\Users\Hélène\administratum.exe")).is_ok());
        for bad in [r"C:\it's\a.exe", r"C:\a\b‘c.exe", r#"C:\a"b.exe"#, r"C:\$env\a.exe", r"C:\a`b.exe", r"C:\a;b.exe", "C:\\a\nb.exe", r"relative\a.exe", r"C:\a\b.bat", r"\\?\C:\a.exe"] {
            assert!(valid_exe(Path::new(bad)).is_err(), "{bad}");
        }
    }

    #[test]
    fn scripts() {
        assert_eq!(
            allow_script(7770, EXE),
            "$ErrorActionPreference = 'Stop'\n\
             Remove-NetFirewallRule -DisplayName 'Administratum remote view' -ErrorAction SilentlyContinue\n\
             New-NetFirewallRule -DisplayName 'Administratum remote view' -Direction Inbound -Program 'C:\\Users\\guill\\AppData\\Local\\Administratum\\administratum.exe' -Protocol TCP -LocalPort 7770 -RemoteAddress LocalSubnet -Action Allow -Profile Private | Out-Null\n\
             exit 0"
        );
        assert_eq!(remove_script(), "Remove-NetFirewallRule -DisplayName 'Administratum remote view' -ErrorAction SilentlyContinue\nexit 0");
    }

    #[test]
    fn encoded_command() {
        // [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes(...)) in PowerShell
        assert_eq!(encode("exit 0"), "ZQB4AGkAdAAgADAA");
        assert_eq!(encode("é$"), "6QAkAA==");
        assert_eq!(encode("a"), "YQA=");
        assert_eq!(encode(""), "");
    }

    #[test]
    fn status_json() {
        let ok = st(r#""Private""#, &[rule("True", "Private", "7770")]);
        assert_eq!(ok, Status { network: "private", rule: "allowed", detail: "Allowed on port 7770 (private network)".into() });
        let public = st(r#""Public""#, &[rule("True", "Private", "7770")]);
        assert_eq!((public.network, public.rule), ("public", "allowed"));
        assert_eq!(public.detail, "Your network is Public — the rule only applies on private networks");
        assert_eq!(st(r#""Public""#, &[rule("True", "Any", "7770")]).detail, "Allowed on port 7770 (public network)");
        let other = st(r#""Private""#, &[rule("True", "Private", "8080")]);
        assert_eq!((other.rule, other.detail.as_str()), ("other-port", "The firewall rule allows port 8080, not 7770"));
        let off = st(r#""Private""#, &[rule("False", "Private", "7770")]);
        assert_eq!((off.rule, off.detail.as_str()), ("disabled", "The firewall rule is turned off"));
        let none = st(r#""Public","Private""#, &[]);
        assert_eq!((none.network, none.rule), ("private", "missing"));
        assert_eq!(st(r#""DomainAuthenticated""#, &[]).network, "domain");
        assert_eq!(st("", &[]).network, "unknown");
        let other_exe = parse(&format!(r#"{{"networks":["Private"],"rules":[{}]}}"#, rule("True", "Private", "7770")), 7770, Some(r"C:\dev\target\debug\administratum.exe")).unwrap();
        assert!(other_exe.rule == "allowed" && other_exe.detail.contains("another program"));
        assert!(parse("", 7770, None).is_err());
    }

    /// Live, read-only: `cargo test -- --ignored live_status --nocapture`.
    #[test]
    #[ignore]
    fn live_status() {
        println!("{:?}", status(7770));
    }
}
