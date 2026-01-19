// 防止 Windows 釋出模式下開啟主控台
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 透過專案名稱 (cyber_ytdl_lib) 來呼叫，而不是 mod
    cyber_ytdl_lib::run(); 
}