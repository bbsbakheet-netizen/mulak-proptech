use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::Manager;

struct BackendProcess(Mutex<Option<Child>>);

#[tauri::command]
fn start_backend(state: tauri::State<BackendProcess>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok("Backend already running".to_string());
    }

    // Find backend directory relative to the executable
    let exe_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("Cannot find exe dir")?
        .to_path_buf();

    // In development, backend is at ../backend from the project root
    // In production, it should be bundled alongside the app
    let backend_dir = exe_dir.join("backend");
    let fallback_dir = exe_dir.parent()
        .and_then(|p| p.parent())
        .map(|p| p.join("backend"))
        .unwrap_or(backend_dir.clone());

    let dir = if backend_dir.exists() { backend_dir } else { fallback_dir };

    if !dir.join("src/server.js").exists() {
        return Err("Backend server not found. Please ensure the backend directory is present.".to_string());
    }

    let child = Command::new("node")
        .arg("src/server.js")
        .current_dir(&dir)
        .spawn()
        .map_err(|e| format!("Failed to start backend: {}", e))?;

    *guard = Some(child);
    Ok("Backend started successfully".to_string())
}

#[tauri::command]
fn stop_backend(state: tauri::State<BackendProcess>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        child.kill().map_err(|e| format!("Failed to stop: {}", e))?;
        Ok("Backend stopped".to_string())
    } else {
        Ok("No backend running".to_string())
    }
}

#[tauri::command]
fn get_app_version() -> String {
    "1.0.0".to_string()
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(BackendProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            greet,
            start_backend,
            stop_backend,
            get_app_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
