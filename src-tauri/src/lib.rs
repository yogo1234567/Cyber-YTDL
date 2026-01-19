use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write, Read}; // [修正] 加入 Read 用於讀取錯誤訊息
use std::process::{Command, Stdio};
use tauri::Emitter; 
use std::path::{Path, PathBuf};
use regex::Regex;
use futures_util::StreamExt; // 用於串流下載
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::Manager; // 用於視窗管理
use tauri::Listener; // [新增] 修正 error[E0599]，讓 app 支援 listen 方法

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// [2026-01-17 新增] 全域下載鎖，確保同時間只有一個下載任務執行，防止誤觸導致的邏輯打架
lazy_static::lazy_static! {
    static ref DOWNLOAD_LOCK: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoFormat {
    pub id: String,
    pub ext: String,
    pub resolution: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub title: String,
    pub thumbnail: String,
    pub formats: Vec<VideoFormat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadPayload {
    pub progress: f64,
    pub speed: String,
    pub eta: String,
}

fn get_msg(lang: &str, zh: &str, en: &str) -> String {
    if lang == "en" { en.to_string() } else { zh.to_string() }
}

fn get_app_dir() -> PathBuf {
    std::env::current_exe()
        .map(|p| p.parent().unwrap_or(Path::new("")).to_path_buf())
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn get_unique_path(base_path: &Path, title: &str, quality: &str, ext: &str) -> PathBuf {
    let safe_title = title.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_");
    let mut counter = 0;
    loop {
        let filename = if counter == 0 {
            format!("{}_{}.{}", safe_title, quality, ext)
        } else {
            format!("{}_{}_{}.{}", safe_title, quality, counter, ext)
        };
        let full_path = base_path.join(filename);
        if !full_path.exists() {
            return full_path;
        }
        counter += 1;
    }
}

// 內部輔助函數：執行實際的帶網速下載
async fn perform_download(
    window: &tauri::Window, 
    url: &str, 
    save_path: &PathBuf, 
    base_prog: f64, 
    max_prog: f64
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    let total_size = response.content_length().unwrap_or(0);
    
    let mut file = std::fs::File::create(save_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let start_time = std::time::Instant::now();
    let mut stream = response.bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        let elapsed = start_time.elapsed().as_secs_f64();
        if elapsed > 0.5 { // 每 0.5 秒更新一次數據
            let speed_bps = downloaded as f64 / elapsed;
            let progress_ratio = if total_size > 0 { downloaded as f64 / total_size as f64 } else { 0.0 };
            let current_progress = base_prog + (progress_ratio * (max_prog - base_prog));
            
            let speed_text = if speed_bps > 1024.0 * 1024.0 {
                format!("{:.2} MB/s", speed_bps / (1024.0 * 1024.0))
            } else {
                format!("{:.2} KB/s", speed_bps / 1024.0)
            };

            let eta_text = if total_size > 0 && speed_bps > 0.0 {
                let remaining_secs = (total_size - downloaded) as f64 / speed_bps;
                format!("{:02}:{:02}", (remaining_secs / 60.0) as i32, (remaining_secs % 60.0) as i32)
            } else {
                "--:--".into()
            };

            // [2026-01-19 修正] 使用 app_handle().emit 確保所有視窗收到進度
            let _ = window.app_handle().emit("download-progress", DownloadPayload {
                progress: current_progress,
                speed: speed_text,
                eta: eta_text,
            });
        }
    }
    Ok(())
}

// [2026-01-17 修正] 強化版強制退出：確保殺掉所有可能殘留的 yt-dlp 子進程，避免背景佔用
#[tauri::command]
fn exit_app() {
    #[cfg(target_os = "windows")]
    {
        // 暴力清理所有由本程式啟動可能殘留的下載進程
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "yt-dlp.exe", "/T"])
            .creation_flags(0x08000000)
            .status();
    }
    std::process::exit(0);
}

#[tauri::command]
async fn open_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if let Err(_) = app.opener().open_url(&url, None::<&str>) {
        #[cfg(target_os = "windows")]
        {
            let mut cmd = Command::new("powershell");
            cmd.args(["-Command", &format!("Start-Process '{}'", url)]);
            cmd.creation_flags(0x08000000); 
            cmd.spawn().map_err(|e| format!("無法開啟網頁: {}", e))?;
        }
    }
    Ok(())
}

// [2026-01-18 修改] 偵測邏輯新增 deno.exe，確保環境完整
#[tauri::command]
fn check_core_components(window: tauri::Window, lang: String) -> Result<bool, String> {
    let app_dir = get_app_dir();
    let yt_exists = app_dir.join("yt-dlp.exe").exists();
    let ff_exists = app_dir.join("ffmpeg.exe").exists();
    let de_exists = app_dir.join("deno.exe").exists(); // [2026-01-18 新增]
    
    let is_ok = yt_exists && ff_exists && de_exists;
    let _ = window.emit("core-status-update", is_ok);
    
    if is_ok {
        Ok(true)
    } else {
        let mut missing = Vec::new();
        if !yt_exists { missing.push("yt-dlp.exe"); }
        if !ff_exists { missing.push("ffmpeg.exe"); }
        if !de_exists { missing.push("deno.exe"); } // [2026-01-18 新增]
        let log_txt = get_msg(&lang, 
            &format!("⚠️ 核心組件不完整，缺失: {}", missing.join(", ")),
            &format!("⚠️ Core components incomplete, missing: {}", missing.join(", "))
        );
        let _ = window.emit("backend-log", log_txt);
        Ok(false) 
    }
}

// [2026-01-18 修改] 修復程序新增 Deno 下載邏輯
#[tauri::command]
async fn download_components(window: tauri::Window, lang: String) -> Result<String, String> {
    let mut lock = DOWNLOAD_LOCK.lock().await;
    if *lock { return Err("BUSY".into()); }
    *lock = true;

    let app_dir = get_app_dir();
    let yt_path = app_dir.join("yt-dlp.exe");
    let ff_path = app_dir.join("ffmpeg.exe");
    let de_path = app_dir.join("deno.exe"); // [2026-01-18 新增]

    let yt_missing = !yt_path.exists();
    let ff_missing = !ff_path.exists();
    let de_missing = !de_path.exists(); // [2026-01-18 新增]

    let msg_start = get_msg(&lang, "🚀 啟動修復程序：正在下載缺失組件...", "🚀 Starting repair: Downloading missing components...");
    let _ = window.emit("backend-log", msg_start);

    // 下載 yt-dlp
    if yt_missing {
        let log_msg = get_msg(&lang, "⬇️ 正在獲取 yt-dlp.exe...", "⬇️ Downloading yt-dlp.exe...");
        let _ = window.emit("backend-log", log_msg);
        if let Err(e) = perform_download(&window, "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", &yt_path, 0.0, 30.0).await {
            *lock = false;
            return Err(e);
        }
    }

    // 下載 FFmpeg
    if ff_missing {
        let log_msg = get_msg(&lang, "⬇️ 正在獲取 ffmpeg.exe (此檔案較大)...", "⬇️ Downloading ffmpeg.exe (Large file)...");
        let _ = window.emit("backend-log", log_msg);
        
        let zip_path = app_dir.join("ffmpeg.zip");
        if let Err(e) = perform_download(&window, "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip", &zip_path, 30.0, 80.0).await {
            *lock = false;
            return Err(e);
        }

        let _ = window.emit("backend-log", get_msg(&lang, "📦 正在解壓並部署 FFmpeg...", "📦 Extracting and deploying FFmpeg..."));
        let mut cmd = Command::new("powershell");
        cmd.args(["-Command", &format!(
            "Expand-Archive -Path '{}' -DestinationPath './ff_tmp' -Force; \
             Move-Item './ff_tmp/*/bin/ffmpeg.exe' '{}' -Force; \
             Remove-Item '{}'; Remove-Item './ff_tmp' -Recurse", 
             zip_path.display(), ff_path.display(), zip_path.display())]);
        
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); 
        let _ = cmd.output();
    }

    // [2026-01-18 新增] 下載 Deno 引擎 (YouTube SABR 解碼必需)
    if de_missing {
        let log_msg = get_msg(&lang, "⬇️ 正在獲取解碼引擎 (Deno)...", "⬇️ Downloading Decode Engine (Deno)...");
        let _ = window.emit("backend-log", log_msg);

        let de_zip_path = app_dir.join("deno.zip");
        // 下載進度分配在 80% 到 95%
        if let Err(e) = perform_download(&window, "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip", &de_zip_path, 80.0, 95.0).await {
            *lock = false;
            return Err(e);
        }

        let _ = window.emit("backend-log", get_msg(&lang, "📦 正在部署解碼引擎...", "📦 Deploying Decode Engine..."));
        let mut cmd = Command::new("powershell");
        
        // [修正邏輯] 使用更安全的路徑指定方式，確保 deno.exe 被解壓到正確的 app_dir
        let dest_dir = app_dir.to_string_lossy();
        cmd.args(["-Command", &format!(
            "Expand-Archive -Path '{}' -DestinationPath '{}' -Force; \
             Remove-Item '{}' -Force", 
             de_zip_path.display(), dest_dir, de_zip_path.display())]);
        
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); 
        let _ = cmd.output();
    }
    let is_ready = yt_path.exists() && ff_path.exists() && de_path.exists();
    let _ = window.emit("core-status-update", is_ready);

    *lock = false;

    if is_ready {
        let _ = window.emit("download-progress", DownloadPayload { progress: 100.0, speed: "Done".into(), eta: "00:00".into() });
        let _ = window.emit("backend-log", get_msg(&lang, "✅ 核心組件修復完成！", "✅ Core components repair completed!"));
        Ok("OK".into())
    } else {
        let _ = window.emit("download-progress", DownloadPayload { progress: 0.0, speed: "".into(), eta: "".into() });
        let _ = window.emit("backend-log", get_msg(&lang, "❌ 修復失敗，請檢查網路。", "❌ Repair failed."));
        Err("Fail".into())
    }
}

// [2026-01-18 新增] 獲取本地 yt-dlp 版本號
#[tauri::command]
async fn get_local_yt_dlp_version() -> Result<String, String> {
    let app_dir = get_app_dir();
    let yt_exe = app_dir.join("yt-dlp.exe");

    if !yt_exe.exists() {
        return Ok("none".into());
    }

    let mut cmd = Command::new(&yt_exe);
    cmd.args(["--version"]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().map_err(|e| e.to_string())?;
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(version)
}

// [2026-01-18 新增] 獲取遠端 GitHub 最新 yt-dlp 版本號 (方案 B)
#[tauri::command]
async fn check_remote_yt_dlp_version() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Tauri-Video-Downloader") // GitHub API 要求必須有 User-Agent
        .build()
        .map_err(|e: reqwest::Error| e.to_string())?;

    let resp = client.get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .send()
        .await
        .map_err(|e: reqwest::Error| e.to_string())?;
        
    // [修正] 明確標註反序列化的類型為 serde_json::Value
    let json = resp.json::<serde_json::Value>()
        .await
        .map_err(|e: reqwest::Error| e.to_string())?;
    
    // GitHub 的 tag_name 通常是日期格式，如 2025.01.15
    let latest_version = json["tag_name"].as_str().unwrap_or("").to_string();
    
    Ok(latest_version)
}

#[tauri::command]
async fn analyze_video(window: tauri::Window, url: String, lang: String) -> Result<VideoMetadata, String> {
    let app_dir = get_app_dir();
    let yt_exe = app_dir.join("yt-dlp.exe");

    if !yt_exe.exists() { 
        let _ = window.emit("core-status-update", false);
        let _ = window.emit("backend-log", get_msg(&lang, "❌ 找不到 yt-dlp.exe", "❌ yt-dlp.exe not found"));
        return Err("Missing Core".into()); 
    }

    let _ = window.emit("backend-log", get_msg(&lang, "🔍 正在解析影片...", "🔍 Analyzing..."));

    let mut cmd = Command::new(&yt_exe);
    // [2026-01-18 修正] 加入 --no-config 確保穩定性
    cmd.args(["--no-config", "--quiet", "--no-warnings", "--skip-download", "--dump-json", &url]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); 

    let output = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() { return Err("Empty Output".into()); }

    let json: serde_json::Value = serde_json::from_str(&stdout).map_err(|e| e.to_string())?;
    
    let mut video_formats = std::collections::HashMap::new();
    let mut audio_formats = std::collections::HashMap::new();

    if let Some(fmts) = json["formats"].as_array() {
        for f in fmts {
            let vcodec = f["vcodec"].as_str().unwrap_or("none");
            let acodec = f["acodec"].as_str().unwrap_or("none");

            if vcodec != "none" {
                let res = f["resolution"].as_str().or(f["format_note"].as_str()).unwrap_or("unknown");
                video_formats.entry(res.to_string()).or_insert(f["format_id"].as_str().unwrap_or("").to_string());
            } else if acodec != "none" && vcodec == "none" {
                let abr = f["abr"].as_f64().or(f["tbr"].as_f64()).unwrap_or(0.0);
                let bitrate = format!("{}k", abr as i32);
                audio_formats.entry(bitrate).or_insert(f["format_id"].as_str().unwrap_or("").to_string());
            }
        }
    }

    let mut v_list: Vec<VideoFormat> = video_formats.into_iter()
        .map(|(res, id)| VideoFormat { id, ext: "mp4".into(), resolution: res })
        .collect();

    v_list.sort_by(|a, b| {
        let get_num = |s: &str| s.chars().filter(|c| c.is_digit(10)).collect::<String>().parse::<i32>().unwrap_or(0);
        get_num(&b.resolution).cmp(&get_num(&a.resolution))
    });

    let mut a_list: Vec<VideoFormat> = audio_formats.into_iter()
        .map(|(bit, id)| VideoFormat { id, ext: "mp3".into(), resolution: bit })
        .collect();

    a_list.sort_by(|a, b| {
        let get_num = |s: &str| s.chars().filter(|c| c.is_digit(10)).collect::<String>().parse::<i32>().unwrap_or(0);
        get_num(&b.resolution).cmp(&get_num(&a.resolution))
    });

    let mut final_formats = v_list;
    final_formats.extend(a_list);

    let _ = window.emit("backend-log", get_msg(&lang, "✅ 解析完成", "✅ Analysis complete"));

    Ok(VideoMetadata {
        title: json["title"].as_str().unwrap_or("未知標題").into(),
        thumbnail: json["thumbnail"].as_str().unwrap_or("").into(),
        formats: final_formats,
    })
}

#[tauri::command]
async fn download_video(
    window: tauri::Window,
    url: String,
    mode: String,
    quality: String,
    path: String,
    lang: String, 
) -> Result<String, String> {
    let mut lock = DOWNLOAD_LOCK.lock().await;
    if *lock {
        return Err(get_msg(&lang, "⚠️ 已有任務正在下載中", "⚠️ Task is already in progress"));
    }
    *lock = true;

    // [2026-01-18 防呆修正] 檢查 quality 是否為空，避免因為前端 reset 導致的邏輯錯誤
    if quality.is_empty() {
        *lock = false;
        return Err(get_msg(&lang, "❌ 錯誤：未選擇下載品質或格式", "❌ Error: Quality or format not selected"));
    }

    let app_dir = get_app_dir();
    let yt_exe = app_dir.join("yt-dlp.exe");
    let ff_exe = app_dir.join("ffmpeg.exe");

    let _ = window.app_handle().emit("backend-log", get_msg(&lang, "⚙️ 準備下載...", "⚙️ Preparing..."));

    let mut info_cmd = Command::new(&yt_exe);
    // [2026-01-18 修正] 加入 --no-config
    info_cmd.args(["--no-config", "--quiet", "--skip-download", "--dump-json", &url]);
    #[cfg(target_os = "windows")]
    info_cmd.creation_flags(0x08000000);

    let info_output = info_cmd.output().map_err(|e| { *lock = false; e.to_string() })?;
    let info_json: serde_json::Value = serde_json::from_str(&String::from_utf8_lossy(&info_output.stdout)).map_err(|e| { *lock = false; e.to_string() })?;
    let title = info_json["title"].as_str().unwrap_or("unknown");
    
    let ext = if mode == "video" { "mp4" } else { "mp3" };
    let final_path = get_unique_path(Path::new(&path), title, &quality, ext);
    let final_path_str = final_path.to_string_lossy().to_string();

    let _ = window.app_handle().emit("backend-log", get_msg(&lang, "📥 開始下載...", "📥 Downloading..."));

    let fmt_val = if mode == "video" {
        if quality == "best" { "bestvideo+bestaudio/best".to_string() } else { format!("{}+bestaudio/best", quality) }
    } else {
        if quality == "bestaudio" { "bestaudio/best".to_string() } else { quality.clone() }
    };

    // [修正邏輯錯誤 E0716] 將 to_string_lossy() 產生的暫時字串綁定到變數，以延長生命週期
    let ff_path_lossy = ff_exe.to_string_lossy();
    let ff_path_str = ff_path_lossy.as_ref();
    let mut args = vec![
        "--no-config", // [2026-01-18 修正] 加入 --no-config 確保調用 deno.exe
        "--progress", "--newline",
        "--ffmpeg-location", ff_path_str,
        "-o", &final_path_str,
    ];

    if mode == "video" {
        args.extend(["-f", &fmt_val, "--merge-output-format", "mp4"]);
    } else {
        args.extend(["-f", &fmt_val, "--extract-audio", "--audio-format", "mp3", "--audio-quality", "256K"]);
    }
    args.push(&url);

    let mut child_cmd = Command::new(&yt_exe);
    child_cmd.args(args);
    child_cmd.stdout(Stdio::piped());
    child_cmd.stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    child_cmd.creation_flags(0x08000000);

    let mut child = child_cmd.spawn().map_err(|e| { *lock = false; e.to_string() })?;
    
    // [2026-01-18 優化] 獨立獲取管道，避免緩衝區堵塞
    let stdout = child.stdout.take().ok_or("No Stdout")?;
    let stderr = child.stderr.take().ok_or("No Stderr")?;
    let reader = BufReader::new(stdout);
    let mut error_reader = BufReader::new(stderr);

    let re = Regex::new(r"\[download\]\s+(\d+\.?\d*)%\s+of\s+.*\s+at\s+(.*)\s+ETA\s+(.*)").unwrap();

    // [2026-01-18 修改] 強化日誌讀取：確保所有日誌都傳回前端，用於偵測轉檔狀態
    for line in reader.lines() {
        if let Ok(content) = line {
            // 1. 進度正則判斷
            if let Some(caps) = re.captures(&content) {
                let progress = caps[1].parse::<f64>().unwrap_or(0.0);
                let speed = caps[2].trim().to_string();
                let eta = caps[3].trim().to_string();
                // [2026-01-19 修正] 改用 app_handle().emit
                let _ = window.app_handle().emit("download-progress", DownloadPayload { progress, speed, eta });
            }
            
            // 2. 將原始日誌行廣播發送給所有視窗
            let _ = window.app_handle().emit("backend-log", content.clone());
        }
    }

    let result = child.wait().map_err(|e| { *lock = false; e.to_string() })?;
    *lock = false; 

    if result.success() {
        let _ = window.app_handle().emit("backend-log", get_msg(&lang, "🎉 下載完成！", "🎉 Finished!"));
        Ok("Success".to_string())
    } else {
        // [2026-01-18 優化] 失敗時才讀取具體原因
        let mut err_msg = String::new();
        let _ = error_reader.read_to_string(&mut err_msg);
        if err_msg.is_empty() {
            err_msg = "Download process failed. Possibly network or format issues.".into();
        }
        Err(err_msg)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            // [2026-01-19 修正] 依照要求徹底移除 Mini 懸浮窗邏輯
            // 以免刪除 mini.html 後程式因找不到視窗源檔案而報錯
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let lock = DOWNLOAD_LOCK.try_lock();
                if lock.is_err() || *lock.unwrap() == true {
                    api.prevent_close();
                    let _ = window.emit("close-requested-while-downloading", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            analyze_video,
            download_video,
            check_core_components,
            download_components,
            get_local_yt_dlp_version,
            check_remote_yt_dlp_version,
            open_link,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}