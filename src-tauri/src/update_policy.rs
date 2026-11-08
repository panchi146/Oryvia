//! Pure configuration gate; no endpoint/key is synthesized for local-only use.
pub fn configured(updater: Option<&serde_json::Value>) -> bool {
    let Some(updater) = updater else { return false };
    let key = updater.get("pubkey").and_then(|value| value.as_str()).unwrap_or("");
    let Some(endpoints) = updater.get("endpoints").and_then(|value| value.as_array()) else { return false };
    !key.trim().is_empty() && !endpoints.is_empty() && endpoints.iter().all(|endpoint| {
        endpoint.as_str().is_some_and(|url| url.starts_with("https://") && !url.to_ascii_lowercase().contains("kua8/nectar"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn local_only_and_upstream_configs_cannot_start_a_network_check() {
        assert!(!configured(None));
        assert!(!configured(Some(&serde_json::json!({"endpoints":[],"pubkey":""}))));
        assert!(!configured(Some(&serde_json::json!({"endpoints":["https://github.com/kua8/Nectar/releases/latest"],"pubkey":"test-public-key"}))));
        assert!(!configured(Some(&serde_json::json!({"endpoints":["http://test.invalid/updates"],"pubkey":"test-public-key"}))));
        assert!(configured(Some(&serde_json::json!({"endpoints":["https://test.invalid/updates"],"pubkey":"test-public-key"}))));
        assert!(configured(Some(&serde_json::json!({
            "endpoints": ["https://github.com/panchi146/Oryvia/releases/latest/download/latest.json"],
            "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDMzODBEQTkyODBCMUYwRjkKUldUNThMR0FrdHFBTTkvQ0lyRWJ5WW4wUVY4cWZIOXNHRUJoV2hIOGhic2ZjbENwQTlrV2M0dUcK"
        }))));
    }
}
