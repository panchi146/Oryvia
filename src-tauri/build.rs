fn main() {
    let mut attributes = tauri_build::Attributes::new();

    // In release mode (production build), strictly restrict capabilities to default.json
    // to prevent any developer/diagnostic permissions (e.g. dev.json) from leaking into production.
    if std::env::var("PROFILE").unwrap_or_default() == "release" {
        println!("cargo:rerun-if-changed=capabilities/default.json");
        attributes = attributes.capabilities_path_pattern("./capabilities/default.json");
    } else {
        println!("cargo:rerun-if-changed=capabilities");
        attributes = attributes.capabilities_path_pattern("./capabilities/**/*");
    }

    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
