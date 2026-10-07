//! UI settings file (`settings.json` in the app config dir): survives a reinstall that wipes the
//! WebView's localStorage. The UI owns the keys; this side only checks shape and size. Keys under
//! `remote.` (remote view: enabled, port, actions, token) belong to the backend: the UI never sees
//! them (`public`) and never overwrites them (`merge_ui`).

use serde_json::{Map, Value};
use std::{fs, path::Path, sync::Mutex};

pub const MAX_BYTES: usize = 16 * 1024;
const BACKEND: &str = "remote.";

/// The settings as the UI (local or remote) may see them: without the backend's keys.
pub fn public(mut v: Value) -> Value {
    if let Some(o) = v.as_object_mut() {
        o.retain(|k, _| !k.starts_with(BACKEND));
    }
    v
}

/// What the UI saves (`new`, its backend keys ignored) plus the backend keys already in `old`.
pub fn merge_ui(old: &Value, new: &Value) -> Value {
    let mut out = public(new.clone());
    if let (Some(o), Some(old)) = (out.as_object_mut(), old.as_object()) {
        o.extend(old.iter().filter(|(k, _)| k.starts_with(BACKEND)).map(|(k, v)| (k.clone(), v.clone())));
    }
    out
}

/// Read-modify-write of the file, serialised so the UI's saves and the backend's never lose each other's keys.
pub fn update(path: &Path, f: impl FnOnce(Value) -> Value) -> Result<(), String> {
    static LOCK: Mutex<()> = Mutex::new(());
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    save(path, &f(load(path)))
}

/// An object of primitive values (string, number, bool, null), at most `MAX_BYTES` serialized.
pub fn validate(v: &Value) -> Result<String, String> {
    let obj = v.as_object().ok_or("settings must be an object")?;
    if obj.values().any(|x| x.is_object() || x.is_array()) {
        return Err("settings values must be primitives".into());
    }
    let text = serde_json::to_string_pretty(obj).map_err(|e| e.to_string())?;
    if text.len() > MAX_BYTES {
        return Err("settings too large".into());
    }
    Ok(text)
}

/// The saved object, or {} when missing, unreadable, corrupt or invalid.
pub fn load(path: &Path) -> Value {
    fs::read_to_string(path).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).filter(|v| validate(v).is_ok()).unwrap_or_else(|| Value::Object(Map::new()))
}

/// Validate, then write atomically (temp file + rename), creating the directory if needed.
pub fn save(path: &Path, v: &Value) -> Result<(), String> {
    let text = validate(v)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validate_shape_and_size() {
        assert!(validate(&json!({"adm.mode": "auto", "n": 3, "b": true, "z": null})).is_ok());
        assert!(validate(&json!({})).is_ok());
        assert!(validate(&json!([1])).is_err());
        assert!(validate(&json!("x")).is_err());
        assert!(validate(&json!({"a": {"b": 1}})).is_err());
        assert!(validate(&json!({"a": [1]})).is_err());
        assert!(validate(&json!({"a": "x".repeat(MAX_BYTES)})).is_err());
    }

    #[test]
    fn save_load_roundtrip_and_corrupt() {
        let dir = std::env::temp_dir().join(format!("adm-settings-test-{}", std::process::id()));
        let path = dir.join("sub").join("settings.json");
        assert_eq!(load(&path), json!({}));
        let v = json!({"adm.settings": "{\"onTop\":false}", "adm.muted": "1"});
        save(&path, &v).unwrap();
        assert_eq!(load(&path), v);
        assert!(save(&path, &json!([1])).is_err());
        assert_eq!(load(&path), v, "a rejected save leaves the file alone");
        fs::write(&path, "{oops").unwrap();
        assert_eq!(load(&path), json!({}));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn backend_keys_hidden_and_kept() {
        let file = json!({"adm.muted": "1", "remote.token": "secret", "remote.port": 7770});
        assert_eq!(public(file.clone()), json!({"adm.muted": "1"}));
        // The UI cannot drop or forge backend keys.
        let ui = json!({"adm.muted": "0", "remote.token": "forged"});
        assert_eq!(merge_ui(&file, &ui), json!({"adm.muted": "0", "remote.token": "secret", "remote.port": 7770}));
        let dir = std::env::temp_dir().join(format!("adm-settings-upd-{}", std::process::id()));
        let path = dir.join("settings.json");
        update(&path, |v| merge_ui(&v, &json!({"a": 1}))).unwrap();
        update(&path, |mut v| {
            v["remote.port"] = json!(8000);
            v
        })
        .unwrap();
        assert_eq!(load(&path), json!({"a": 1, "remote.port": 8000}));
        let _ = fs::remove_dir_all(&dir);
    }
}
