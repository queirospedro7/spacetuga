use std::{io::Write, process::{Child, Stdio}, sync::Mutex, time::{Duration, Instant}};
use tauri::{Manager, path::BaseDirectory, WindowEvent};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

struct LocalServer(Mutex<Option<Child>>);
struct BackendUrl(String);

fn stop_server(mut child: Child) {
    if let Some(mut input) = child.stdin.take() { let _ = input.write_all(b"tuga-shutdown\n"); let _ = input.flush(); }
    let deadline = Instant::now() + Duration::from_millis(800);
    while Instant::now() < deadline {
        if matches!(child.try_wait(), Ok(Some(_))) { return; }
        std::thread::sleep(Duration::from_millis(20));
    }
    let _ = child.kill(); let _ = child.wait();
}

#[tauri::command]
fn desktop_backend_url(url: tauri::State<'_, BackendUrl>, server: tauri::State<'_, LocalServer>) -> Result<String, String> {
    let mut process = server.0.lock().map_err(|_| "Não foi possível verificar o serviço local.".to_string())?;
    if let Some(child) = process.as_mut() {
        if child.try_wait().map_err(|_| "Não foi possível verificar o serviço local.".to_string())?.is_some() {
            return Err("O serviço local não iniciou. Fecha e volta a abrir o Tuga.".to_string());
        }
    }
    Ok(url.0.clone())
}

impl Drop for LocalServer {
    fn drop(&mut self) {
        if let Ok(process) = self.0.get_mut() {
            if let Some(child) = process.take() { stop_server(child); }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") { let _ = window.unminimize(); let _ = window.show(); let _ = window.set_focus(); }
        }));
    }
    builder
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![desktop_backend_url])
        .setup(|app| {
            let mut backend_url = "http://127.0.0.1:8787".to_string();
            let mut local_server = None;
            if !cfg!(debug_assertions) && include_str!("../desktop-runtime.txt").trim() == "local" {
                let reservation = std::net::TcpListener::bind("127.0.0.1:0")?;
                let port = reservation.local_addr()?.port();
                backend_url = format!("http://127.0.0.1:{}", port);
                let server = app.path().resolve("server/index.mjs", BaseDirectory::Resource)?;
                let data_dir = app.path().app_data_dir()?;
                std::fs::create_dir_all(&data_dir)?;
                let node = app.path().resolve("binaries/node.exe", BaseDirectory::Resource)?;
                let mut command = std::process::Command::new(node);
                command.arg("--max-old-space-size=128")
                    .arg(server)
                    .env("TUGA_HOST", "127.0.0.1")
                    .env("TUGA_PORT", port.to_string())
                    .env("TUGA_DESKTOP", "1")
                    .stdin(Stdio::piped())
                    // Keep the existing data-file location so upgrades preserve accounts and messages.
                    .env("TUGA_DATA_FILE", data_dir.join("melo-data.json"));
                #[cfg(windows)]
                command.creation_flags(0x08000000);
                drop(reservation);
                local_server = Some(command.spawn()?);
            }
            let eval_script = format!("window.__TUGA_DESKTOP_API__ = '{}';", backend_url);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval(&eval_script);
            }
            app.manage(BackendUrl(backend_url));
            app.manage(LocalServer(Mutex::new(local_server)));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                if let Some(server) = window.try_state::<LocalServer>() {
                    if let Ok(mut child) = server.0.lock() {
                        if let Some(child) = child.take() { stop_server(child); }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Tuga desktop app");
}
