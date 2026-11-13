use serde::Serialize;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
pub struct SaveExportResult {
    saved: bool,
    canceled: bool,
    path: Option<String>,
}

#[tauri::command]
async fn save_export_file(
    app: tauri::AppHandle,
    data: Vec<u8>,
    default_filename: String,
    extension: String,
) -> Result<SaveExportResult, String> {
    let ext_lower = extension.to_lowercase();
    let filter_label = match ext_lower.as_str() {
        "svg" => "SVG Vektorgrafik",
        "png" => "PNG Grafik (2400 px)",
        "jpg" | "jpeg" => "JPEG Grafik (2400 px)",
        _ => "Datei",
    };

    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_file_name(&default_filename)
            .add_filter(filter_label, &[ext_lower.as_str()])
            .blocking_save_file()
    })
    .await
    .map_err(|e| format!("Dialog-Task fehlgeschlagen: {e}"))?;

    let Some(file_path) = picked else {
        return Ok(SaveExportResult {
            saved: false,
            canceled: true,
            path: None,
        });
    };

    let path_buf = file_path
        .into_path()
        .map_err(|e| format!("Ungültiger Speicherpfad: {e}"))?;

    std::fs::write(&path_buf, data)
        .map_err(|e| format!("Datei konnte nicht gespeichert werden: {e}"))?;

    Ok(SaveExportResult {
        saved: true,
        canceled: false,
        path: Some(path_buf.to_string_lossy().to_string()),
    })
}

#[tauri::command]
async fn log_app_error(
    app: tauri::AppHandle,
    event: String,
    message: String,
) -> Result<(), String> {
    if !matches!(
        event.as_str(),
        "upstream_unavailable"
            | "structure_validation_failed"
            | "structure_generation_failed"
            | "frontend_runtime_error"
            | "update_check_failed"
            | "update_install_failed"
            | "external_link_failed"
    ) {
        return Err("Ungültiger Log-Ereignistyp.".to_string());
    }
    if message.len() > 16_384 {
        return Err("Fehlermeldung ist zu lang.".to_string());
    }

    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Log-Verzeichnis konnte nicht aufgelöst werden: {e}"))?;

    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&log_dir)
            .map_err(|e| format!("Log-Verzeichnis konnte nicht erstellt werden: {e}"))?;
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| format!("Zeitstempel konnte nicht erstellt werden: {e}"))?
            .as_secs();
        let record = serde_json::json!({
            "timestampUnixSeconds": timestamp,
            "level": "error",
            "event": event,
            "message": message,
        });
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_dir.join("pandamol.log"))
            .map_err(|e| format!("Log-Datei konnte nicht geöffnet werden: {e}"))?;
        writeln!(file, "{record}")
            .map_err(|e| format!("Fehler konnte nicht protokolliert werden: {e}"))
    })
    .await
    .map_err(|e| format!("Log-Task fehlgeschlagen: {e}"))?
}

#[tauri::command]
fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Nur HTTP/HTTPS-URLs dürfen extern geöffnet werden.".to_string());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("Externer Browser konnte nicht geöffnet werden: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            save_export_file,
            log_app_error,
            open_external_url
        ])
        .plugin(tauri_plugin_updater::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der PandaMol Desktop-Anwendung");
}
