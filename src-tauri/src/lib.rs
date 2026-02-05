use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write}; 
use std::process::{Command, Stdio, Child}; 
use tauri::Emitter; 
use std::path::{Path, PathBuf};
use regex::Regex;
use futures_util::StreamExt; 
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering}; // [2026-01-26 新增] 用於中止訊號
use tokio::sync::Mutex;
use tauri::Manager; 


#[cfg(target_os = "windows")]
use window_vibrancy;
use std::os::windows::process::CommandExt;

lazy_static::lazy_static! {
    // [2026-01-26 新增] 中止訊號開關
    static ref ABORT_SIGNAL: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
    // 全域子進程鎖，用於中止任務
    static ref CHILD_PROCESS: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    // 紀錄當前下載路徑，用於中止時清理殘餘檔案
    static ref CURRENT_DOWNLOAD_PATH: Arc<Mutex<Option<PathBuf>>> = Arc::new(Mutex::new(None));
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
        } ;
        let full_path = base_path.join(filename);
        if !full_path.exists() {
            return full_path;
        }
        counter += 1;
    }
}

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
        if elapsed > 0.5 {
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

            let _ = window.app_handle().emit("download-progress", DownloadPayload {
                progress: current_progress,
                speed: speed_text,
                eta: eta_text,
            });
        }
    }
    Ok(())
}

#[tauri::command]
fn exit_app() {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "yt-dlp.exe", "/T"])
            .creation_flags(0x08000000)
            .status();
    }
    std::process::exit(0);
}

#[tauri::command]
async fn pause_download(window: tauri::Window, lang: Option<String>) -> Result<String, String> {
    ABORT_SIGNAL.store(true, Ordering::SeqCst);
    let mut child_lock = CHILD_PROCESS.lock().await;
    let lang_str = lang.unwrap_or_else(|| "zh".to_string());
    let _ = window.app_handle().emit("backend-log", get_msg(&lang_str, "⏸️ 正在暫停下載...", "⏸️ Pausing download..."));

    if let Some(mut child) = child_lock.take() {
        #[cfg(target_os = "windows")]
        {
            let pid = child.id();
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string(), "/T"])
                .creation_flags(0x08000000)
                .status();
        }
        let _ = child.kill(); 
        let _ = window.app_handle().emit("backend-log", get_msg(&lang_str, "✅ 已暫停。下次開始將自動續傳。", "✅ Paused."));
        Ok("PAUSED".into())
    } else {
        Ok("NO_RUNNING_TASK".into())
    }
}

#[tauri::command]
async fn resume_download(window: tauri::Window, lang: Option<String>) -> Result<String, String> {
    ABORT_SIGNAL.store(false, Ordering::SeqCst);
    let lang_str = lang.unwrap_or_else(|| "zh".to_string());
    let _ = window.app_handle().emit("backend-log", get_msg(&lang_str, "▶️ 正在準備恢復下載...", "▶️ Preparing to resume download..."));
    Ok("RESUME_READY".into())
}
#[tauri::command]
async fn adjust_window_size(window: tauri::Window, resizable: bool) -> Result<(), String> {
    // 保留這個：防止視窗在無邊框模式下縮到太小導致內容被切掉
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(940.0, 740.0)));

    if resizable {
        window.set_resizable(true).ok();
        window.set_decorations(true).ok();
        window.set_maximizable(true).ok();
        let _ = window.unmaximize();
    } else {
        window.set_decorations(false).ok();
        window.set_resizable(false).ok();
        // 重點：這裡不寫 set_size，讓它維持現狀
    }
    Ok(())
}

#[tauri::command]
async fn cancel_download(window: tauri::Window, lang: Option<String>) -> Result<String, String> {
    ABORT_SIGNAL.store(true, Ordering::SeqCst);
    let mut child_lock = CHILD_PROCESS.lock().await;
    let mut path_lock = CURRENT_DOWNLOAD_PATH.lock().await;

    let lang_str = lang.unwrap_or_else(|| "zh".to_string());
    let _ = window.app_handle().emit("backend-log", get_msg(&lang_str, "🛑 正在強制中止任務並清理暫存檔...", "🛑 Forcing cancellation and cleaning up..."));

    if let Some(mut child) = child_lock.take() {
        #[cfg(target_os = "windows")]
        {
            let pid = child.id();
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string(), "/T"])
                .creation_flags(0x08000000)
                .status();
        }
        let _ = child.kill(); 
    }

    if let Some(path) = path_lock.take() {
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        let parent_dir = path.parent().unwrap_or(Path::new("."));
        let file_stem = path.file_stem().unwrap_or_default().to_string_lossy();

        if let Ok(entries) = std::fs::read_dir(parent_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if let Some(filename) = p.file_name().map(|n| n.to_string_lossy()) {
                    let is_match = filename.contains(&*file_stem);
                    let is_temp = filename.ends_with(".part") || 
                                  filename.ends_with(".ytdl") || 
                                  filename.contains(".temp") || 
                                  filename.ends_with(".mp4") || 
                                  filename.ends_with(".mp3") ||
                                  filename.ends_with(".m4a") ||
                                  filename.ends_with(".webm") || 
                                  filename.ends_with(".f251") || 
                                  filename.ends_with(".f140") ||
                                  filename.ends_with(".f299") ||
                                  filename.ends_with(".f137");

                    if is_match && is_temp {
                        let _ = std::fs::remove_file(p);
                    }
                }
            }
        }
    }

    let _ = window.app_handle().emit("download-progress", DownloadPayload { progress: 0.0, speed: "Stopped".into(), eta: "".into() });
    let _ = window.app_handle().emit("backend-log", get_msg(&lang_str, "✅ 已中止並清理完畢。", "✅ Cancelled and cleaned up."));
    Ok("CANCELLED".into())
}

#[tauri::command]
async fn open_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if let Err(_) = app.opener().open_url(&url, None::<&str>) {
        #[cfg(target_os = "windows")]
        {
            let mut cmd = Command::new("powershell");
            cmd.args(["-Command", "Start-Process", "-FilePath", &url]);
            cmd.creation_flags(0x08000000); 
            cmd.spawn().map_err(|e| format!("無法開啟網頁: {}", e))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn check_core_components(window: tauri::Window, lang: String) -> Result<bool, String> {
    let app_dir = get_app_dir();
    let yt_exists = app_dir.join("yt-dlp.exe").exists();
    let ff_exists = app_dir.join("ffmpeg.exe").exists();
    let fp_exists = app_dir.join("ffprobe.exe").exists(); 
    let de_exists = app_dir.join("deno.exe").exists(); 
    
    let is_ok = yt_exists && ff_exists && fp_exists && de_exists;
    let _ = window.emit("core-status-update", is_ok);
    
    if is_ok {
        Ok(true)
    } else {
        let mut missing = Vec::new();
        if !yt_exists { missing.push("yt-dlp.exe"); }
        if !ff_exists { missing.push("ffmpeg.exe"); }
        if !fp_exists { missing.push("ffprobe.exe"); }
        if !de_exists { missing.push("deno.exe"); }
        let log_txt = get_msg(&lang, 
            &format!("⚠️ 核心組件不完整，缺失: {}", missing.join(", ")),
            &format!("⚠️ Core components incomplete, missing: {}", missing.join(", "))
        );
        let _ = window.emit("backend-log", log_txt);
        Ok(false) 
    }
}

#[tauri::command]
fn check_path_write_permission(path: String) -> bool {
    let target_dir = std::path::Path::new(&path);
    if !target_dir.exists() { return false; }
    
    let test_file = target_dir.join(".perm_test_r");
    if let Ok(_) = std::fs::write(&test_file, "ok") {
        let _ = std::fs::remove_file(test_file);
        return true;
    }
    false
}

#[tauri::command]
async fn download_components(window: tauri::Window, lang: String) -> Result<String, String> {
    let app_dir = get_app_dir();
    let yt_path = app_dir.join("yt-dlp.exe");
    let ff_path = app_dir.join("ffmpeg.exe");
    let fp_path = app_dir.join("ffprobe.exe");
    let de_path = app_dir.join("deno.exe");

    let ff_missing = !ff_path.exists() || !fp_path.exists();

    let msg_start = get_msg(&lang, "🚀 啟動程序：正在檢查並處理核心組件...", "🚀 Starting: Checking and processing core components...");
    let _ = window.emit("backend-log", msg_start);

    // 1. yt-dlp 更新/下載 (不論是否存在都強制抓最新)
    {
        let log_msg = get_msg(&lang, "⬇️ 正在獲取最新版 yt-dlp.exe...", "⬇️ Downloading latest yt-dlp.exe...");
        let _ = window.emit("backend-log", log_msg);
        let yt_tmp_path = app_dir.join("yt-dlp.exe.tmp");
        if let Err(e) = perform_download(&window, "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", &yt_tmp_path, 0.0, 30.0).await {
            let _ = std::fs::remove_file(&yt_tmp_path);
            return Err(e);
        }
        if let Err(e) = std::fs::rename(&yt_tmp_path, &yt_path) {
            let _ = std::fs::remove_file(&yt_tmp_path);
            return Err(format!("無法覆蓋核心組件: {}", e));
        }
        let _ = window.emit("backend-log", get_msg(&lang, "✅ yt-dlp.exe 已就緒 (最新版)", "✅ yt-dlp.exe ready (Latest)"));
    }

    // 2. FFmpeg 下載邏輯 (僅缺失時下載)
    if ff_missing {
        let log_msg = get_msg(&lang, "⬇️ 正在獲取 FFmpeg 工具組 (此檔案較大)...", "⬇️ Downloading FFmpeg tools (Large file)...");
        let _ = window.emit("backend-log", log_msg);
        let zip_path = app_dir.join("ffmpeg.zip");
        if let Err(e) = perform_download(&window, "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip", &zip_path, 30.0, 80.0).await {
            return Err(e);
        }
        let _ = window.emit("backend-log", get_msg(&lang, "📦 正在解壓並部署 FFmpeg 與 ffprobe...", "📦 Extracting FFmpeg and ffprobe..."));
        let mut cmd = Command::new("powershell");
        cmd.args(["-Command", &format!(
            "Expand-Archive -Path '{}' -DestinationPath './ff_tmp' -Force; \
             Move-Item './ff_tmp/*/bin/ffmpeg.exe' '{}' -Force; \
             Move-Item './ff_tmp/*/bin/ffprobe.exe' '{}' -Force; \
             Remove-Item '{}'; Remove-Item './ff_tmp' -Recurse", 
             zip_path.display(), ff_path.display(), fp_path.display(), zip_path.display())]);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); 
        let _ = cmd.output();
    }

    // 3. Deno 更新/下載 (照 yt-dlp 的方式：只要執行修復就更新)
    {
        let log_msg = get_msg(&lang, "⬇️ 正在獲取最新版解碼引擎 (Deno)...", "⬇️ Downloading latest Decode Engine (Deno)...");
        let _ = window.emit("backend-log", log_msg);
        let de_zip_path = app_dir.join("deno.zip");
        
        if let Err(e) = perform_download(&window, "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip", &de_zip_path, 80.0, 95.0).await {
            let _ = std::fs::remove_file(&de_zip_path);
            return Err(e);
        }

        let _ = window.emit("backend-log", get_msg(&lang, "📦 正在部署解碼引擎...", "📦 Deploying Decode Engine..."));
        
        let mut cmd = Command::new("powershell");
        let dest_dir = app_dir.to_string_lossy();
        cmd.args(["-Command", &format!(
            "Expand-Archive -Path '{}' -DestinationPath '{}' -Force; \
             Remove-Item '{}' -Force", 
            de_zip_path.display(), dest_dir, de_zip_path.display())]);

        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); 
        
        let _ = cmd.output(); 
        let _ = window.emit("backend-log", get_msg(&lang, "✅ Deno 引擎已就緒 (最新版)", "✅ Deno ready"));
    }
    
    // ★ 修正變數定義：重新檢查所有檔案是否真的存在
    let is_ok = yt_path.exists() && ff_path.exists() && fp_path.exists() && de_path.exists();
    
    if is_ok {
        let _ = window.emit("download-progress", DownloadPayload { progress: 100.0, speed: "Done".into(), eta: "00:00".into() });
        let _ = window.emit("backend-log", get_msg(&lang, "✅ 核心組件修復完成！", "✅ Core components repair completed!"));
        let _ = window.emit("core-status-update", true); // 通知前端核心已 OK
        Ok("OK".into())
    } else {
        let _ = window.emit("download-progress", DownloadPayload { progress: 0.0, speed: "".into(), eta: "".into() });
        let _ = window.emit("backend-log", get_msg(&lang, "❌ 修復失敗，請檢查網路或檔案權限。", "❌ Repair failed."));
        Err("Fail".into())
    }
}

#[tauri::command]
async fn get_local_yt_dlp_version() -> Result<String, String> {
    let app_dir = get_app_dir();
    let yt_exe = app_dir.join("yt-dlp.exe");
    if !yt_exe.exists() { return Ok("none".into()); }
    let mut cmd = Command::new(&yt_exe);
    cmd.args(["--version"]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
async fn check_remote_yt_dlp_version() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Tauri-Video-Downloader")
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest").send().await.map_err(|e| e.to_string())?;
    let json = resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
    Ok(json["tag_name"].as_str().unwrap_or("").to_string())
}

// [新增] 獲取本地 Deno 版本
#[tauri::command]
async fn get_local_deno_version() -> Result<String, String> {
    let app_dir = get_app_dir();
    let de_exe = app_dir.join("deno.exe");
    if !de_exe.exists() { return Ok("none".into()); }
    
    let mut cmd = Command::new(&de_exe);
    cmd.args(["--version"]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    
    let output = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // 修正：更嚴謹地只抓取 X.Y.Z 格式，並過濾所有空格
    let re = Regex::new(r"deno\s+v?(\d+\.\d+\.\d+)").unwrap();
    if let Some(caps) = re.captures(&stdout) {
        Ok(caps[1].trim().to_string())
    } else {
        Ok("unknown".into())
    }
}

// [新增] 檢查遠端 Deno 最新版本 (從 GitHub API)
#[tauri::command]
async fn check_remote_deno_version() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Tauri-Video-Downloader")
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    
    let resp = client.get("https://api.github.com/repos/denoland/deno/releases/latest")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    let json = resp.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
    // GitHub 的 tag 可能是 "v2.6.8"，我們把 'v' 去掉方便比對
    let tag = json["tag_name"].as_str().unwrap_or("").replace('v', "");
    Ok(tag)
}

#[tauri::command]
async fn analyze_video(window: tauri::Window, url: String, lang: String) -> Result<VideoMetadata, String> {
    let app_dir = get_app_dir();
    let yt_exe = app_dir.join("yt-dlp.exe");
    let de_exe = app_dir.join("deno.exe"); 

    if !yt_exe.exists() { 
        let _ = window.emit("core-status-update", false);
        let _ = window.emit("backend-log", get_msg(&lang, "❌ 找不到 yt-dlp.exe", "❌ yt-dlp.exe not found"));
        return Err("Missing Core".into()); 
    }

    let _ = window.emit("backend-log", get_msg(&lang, "🔍 正在解析影片...", "🔍 Analyzing..."));
    let mut cmd = Command::new(&yt_exe);
    if de_exe.exists() { cmd.env("YT_DLP_JS_INTERPRETER", "deno.exe"); }
    cmd.args(["--no-config", "--no-playlist", "--quiet", "--no-warnings", "--skip-download", "--dump-json", &url]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); 

    let output = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() { return Err("Empty Output".into()); }
    let json: serde_json::Value = serde_json::from_str(&stdout).map_err(|e| e.to_string())?;
    
    let mut video_dict = std::collections::HashMap::new();
    let mut audio_dict = std::collections::HashMap::new();

    if let Some(fmts) = json["formats"].as_array() {
        for f in fmts {
            let vcodec = f["vcodec"].as_str().unwrap_or("none");
            let acodec = f["acodec"].as_str().unwrap_or("none");
            let filesize = f["filesize"].as_f64().or(f["filesize_approx"].as_f64()).unwrap_or(0.0);
            if vcodec != "none" {
                let res = f["resolution"].as_str().or(f["format_note"].as_str()).unwrap_or("unknown").to_string();
                let current_fs = video_dict.get(&res).map(|v: &(f64, String)| v.0).unwrap_or(0.0);
                if !video_dict.contains_key(&res) || filesize > current_fs {
                    video_dict.insert(res, (filesize, f["format_id"].as_str().unwrap_or("").to_string()));
                }
            } else if acodec != "none" && vcodec == "none" {
                let abr = f["abr"].as_f64().or(f["tbr"].as_f64()).unwrap_or(0.0);
                let bitrate = format!("{}k", abr as i32);
                let current_fs = audio_dict.get(&bitrate).map(|v: &(f64, String)| v.0).unwrap_or(0.0);
                if !audio_dict.contains_key(&bitrate) || filesize > current_fs {
                    audio_dict.insert(bitrate, (filesize, f["format_id"].as_str().unwrap_or("").to_string()));
                }
            }
        }
    }

    let mut v_list: Vec<VideoFormat> = video_dict.into_iter().map(|(res, (_, id))| VideoFormat { id, ext: "mp4".into(), resolution: res }).collect();
    v_list.sort_by(|a, b| {
        let get_num = |s: &str| s.chars().filter(|c| c.is_digit(10)).collect::<String>().parse::<i32>().unwrap_or(0);
        get_num(&b.resolution).cmp(&get_num(&a.resolution))
    });

    let mut a_list: Vec<VideoFormat> = audio_dict.into_iter().map(|(bit, (_, id))| VideoFormat { id, ext: "mp3".into(), resolution: bit }).collect();
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
    ABORT_SIGNAL.store(false, Ordering::SeqCst);
    if quality.is_empty() {
        return Err(get_msg(&lang, "❌ 錯誤：未選擇下載品質或格式", "❌ Error: Quality or format not selected"));
    }

    let app_dir = get_app_dir();
    let yt_exe = app_dir.join("yt-dlp.exe");
    let ff_exe = app_dir.join("ffmpeg.exe");
    let de_exe = app_dir.join("deno.exe"); 

    if ABORT_SIGNAL.load(Ordering::SeqCst) { return Ok("CANCELLED".into()); }
    let _ = window.app_handle().emit("backend-log", get_msg(&lang, "🌐 正在讀取 YouTube 頁面...", "🌐 Reading YouTube page..."));

    let mut info_cmd = Command::new(&yt_exe);
    if de_exe.exists() { info_cmd.env("YT_DLP_JS_INTERPRETER", "deno.exe"); }
    info_cmd.args(["--no-config", "--no-playlist", "--quiet", "--skip-download", "--dump-json", &url]);
    #[cfg(target_os = "windows")]
    info_cmd.creation_flags(0x08000000);

    let info_output = info_cmd.output().map_err(|e| e.to_string())?;
    if ABORT_SIGNAL.load(Ordering::SeqCst) { return Ok("CANCELLED".into()); }

    let info_json: serde_json::Value = serde_json::from_str(&String::from_utf8_lossy(&info_output.stdout)).map_err(|e| e.to_string())?;
    let title = info_json["title"].as_str().unwrap_or("unknown");
    let video_id = info_json["id"].as_str().unwrap_or("unknown_id"); // [新增]
    let ext = if mode == "video" { "mp4" } else { "mp3" };
    // [改進] 檔名加入 VideoID 以確保唯一性，防止不同影片同名導致的續傳錯誤
    let final_filename = format!("{} [{}]", title, video_id);
    let final_path = get_unique_path(Path::new(&path), &final_filename, &quality, ext);
    let final_path_str = final_path.to_string_lossy().to_string();

    {
        let mut path_lock = CURRENT_DOWNLOAD_PATH.lock().await;
        *path_lock = Some(final_path.clone());
    }

    let _ = window.app_handle().emit("backend-log", get_msg(&lang, "📥 開始下載...", "📥 Downloading..."));

    let fmt_val = if mode == "video" {
        if quality == "best" { "bestvideo+bestaudio/best".to_string() } else { format!("{}+bestaudio/best", quality) }
    } else {
        if quality == "bestaudio" { "bestaudio/best".to_string() } else { quality.clone() }
    };

    let ff_path_str = ff_exe.to_string_lossy();
    let mut args = vec![
        "--no-config", "--no-playlist", "--progress", "--newline",
        "--ffmpeg-location", &ff_path_str,
        "-o", &final_path_str,
        "--concurrent-fragments", "8",
        "--fragment-retries", "3",
        "--retries", "3",
        "--resize-buffer", // [新增] 自動調整緩衝區，配合多線程
    ];

    if mode == "video" {
        args.extend(["-f", &fmt_val, "--merge-output-format", "mp4"]);
    } else {
        args.extend(["-f", &fmt_val, "--extract-audio", "--audio-format", "mp3", "--audio-quality", "256K"]);
    }
    args.push(&url);

    let mut child_cmd = Command::new(&yt_exe);
    if de_exe.exists() { child_cmd.env("YT_DLP_JS_INTERPRETER", "deno.exe"); }
    child_cmd.args(args);
    child_cmd.stdout(Stdio::piped());
    child_cmd.stderr(Stdio::piped()); 
    #[cfg(target_os = "windows")]
    child_cmd.creation_flags(0x08000000);

    let mut child = child_cmd.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("No Stdout")?;
    let reader = BufReader::new(stdout);

    {
        let mut child_process_lock = CHILD_PROCESS.lock().await;
        *child_process_lock = Some(child); 
    } 

    let re = Regex::new(r"\[download\]\s+(\d+\.?\d*)%\s+.*at\s+(.*)\s+ETA\s+(.*)").unwrap();



    for line in reader.lines() {
        if ABORT_SIGNAL.load(Ordering::SeqCst) { return Ok("CANCELLED".into()); }
        if let Ok(content) = line {
            
            // ★ 修正點：擴充關鍵字匹配，並轉小寫處理增加相容性 ★
            // 2. 【進度解析】
            if let Some(caps) = re.captures(&content) {
                let progress = caps[1].parse::<f64>().unwrap_or(0.0);
                let speed = caps[2].trim().to_string();
                let eta = caps[3].trim().to_string();
                if !ABORT_SIGNAL.load(Ordering::SeqCst) {
                    let _ = window.app_handle().emit("download-progress", DownloadPayload { progress, speed, eta });
                }
            } else {
                // 3. 【其他訊息】
                if !ABORT_SIGNAL.load(Ordering::SeqCst) {
                    let _ = window.app_handle().emit("backend-log", content.clone());
                }
            }
        }
    }

    if ABORT_SIGNAL.load(Ordering::SeqCst) { return Ok("CANCELLED".into()); }

    let mut child_guard = CHILD_PROCESS.lock().await;
    if let Some(mut c) = child_guard.take() {
        let result = c.wait();
        if ABORT_SIGNAL.load(Ordering::SeqCst) { return Ok("CANCELLED".into()); }
        match result {
            Ok(status) if status.success() => {
                let _ = window.app_handle().emit("backend-log", get_msg(&lang, "🎉 下載完成！", "🎉 Finished!"));
                Ok("Success".to_string())
            },
            _ => Err("Download failed".into())
        }
    } else {
        Ok("CANCELLED".into())
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
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // 初始狀態設為無邊框
                let _ = window.set_decorations(false);
                let _ = window.set_size(tauri::LogicalSize::new(940.0, 740.0));
                
                #[cfg(target_os = "windows")]
                {
                    // 啟動時立即消滅外框線
                    let _ = window_vibrancy::clear_blur(&window);
                }
                
                let _ = window.center();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            analyze_video,
            download_video,
            check_core_components,
            download_components,
            get_local_yt_dlp_version,
            check_remote_yt_dlp_version,
            get_local_deno_version,       
            check_remote_deno_version,
            open_link,
            exit_app,
            cancel_download,
            pause_download,
            resume_download, 
            adjust_window_size,
            check_path_write_permission 
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}