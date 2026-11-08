use std::path::Path;

fn main() {
    let payload = Path::new("payload.zip");
    println!("cargo:rerun-if-changed=payload.zip");
    if std::env::var("PROFILE").as_deref() == Ok("release")
        && std::fs::metadata(payload).map_or(true, |meta| meta.len() == 0)
    {
        panic!("Release installer requires a real payload.zip; run the payload build step first");
    }
    if !payload.exists() {
        println!("cargo:warning=payload.zip is a placeholder — run scripts/build-payload step before shipping this installer");
        std::fs::write(payload, []).expect("failed to write placeholder payload.zip");
    }

    tauri_build::build()
}
