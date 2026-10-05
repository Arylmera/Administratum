//! UI settings file (`settings.json` in the app config dir): survives a reinstall that wipes the
//! WebView's localStorage. The UI owns the keys; this side only checks shape and size.

use serde_json::{Map, Value};
use std::{fs, path::Path};

pub const MAX_BYTES: usize = 16 * 1024;

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
    fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .filter(|v| validate(v).is_ok())
        .unwrap_or_else(|| Value::Object(Map::new()))
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
}
