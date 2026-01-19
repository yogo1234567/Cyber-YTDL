import sys
import json
import yt_dlp
import os
import re
import io

# [2026-01-14 新增] 強制設定全域輸出為 UTF-8，防止 Windows cp950 (Big5) 編碼報錯導致崩潰
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def analyze(url):
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'check_formats': False, # [優化] 加快解析速度
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # [2026-01-14 新增] 使用字典進行去重，Key 為解析度或位元率
            video_dict = {}
            audio_dict = {}
            
            for f in info.get('formats', []):
                # --- 影片邏輯 ---
                if f.get('vcodec') != 'none':
                    res = f.get('resolution') or f.get('format_note') or f.get('height')
                    if res:
                        res_str = str(res)
                        filesize = f.get('filesize') or f.get('filesize_approx') or 0
                        if res_str not in video_dict or filesize > video_dict[res_str].get('filesize', 0):
                            video_dict[res_str] = {
                                "id": f.get('format_id'),
                                "ext": "mp4", 
                                "resolution": res_str,
                                "filesize": filesize
                            }
                
                # --- 音訊邏輯 ---
                elif f.get('acodec') != 'none' and f.get('vcodec') == 'none':
                    abr = f.get('abr') or f.get('tbr')
                    if abr:
                        bitrate = f"{int(abr)}k"
                        filesize = f.get('filesize') or f.get('filesize_approx') or 0
                        if bitrate not in audio_dict or filesize > audio_dict[bitrate].get('filesize', 0):
                            audio_dict[bitrate] = {
                                "id": f.get('format_id'),
                                "ext": "mp3", 
                                "resolution": bitrate,
                                "filesize": filesize
                            }

            def get_res_num(res_text):
                nums = re.findall(r'\d+', res_text)
                return int(nums[0]) if nums else 0

            final_videos = sorted(video_dict.values(), key=lambda x: get_res_num(x['resolution']), reverse=True)
            final_audios = sorted(audio_dict.values(), key=lambda x: get_res_num(x['resolution']), reverse=True)

            result = {
                "title": info.get('title', '未知標題'),
                "thumbnail": info.get('thumbnail', ''),
                "formats": final_videos + final_audios
            }
            print(json.dumps(result), flush=True)
    except Exception as e:
        print(f"Python Error: {str(e)}", file=sys.stderr, flush=True)
        sys.exit(1)

# [2026-01-14 修改]：強化版進度回報，解決緩衝導致的瞬間100%問題
def progress_hook(d):
    if d['status'] == 'downloading':
        # 1. 處理進度百分比
        p_raw = d.get('_percent_str', '0%').replace('%','')
        p = "".join(filter(lambda x: x.isdigit() or x == '.', p_raw))
        
        # 2. 獲取網速與剩餘時間
        s = d.get('_speed_str', 'N/A').strip()
        e = d.get('_eta_str', '00:00').strip()
        
        # 3. [修正] 確保 DATA 輸出乾淨且立即排空
        print(f"DATA:{p}|{s}|{e}", flush=True)
    
    elif d['status'] == 'finished':
        # 確保結束時進度條補滿
        print("DATA:100.0|0KiB/s|00:00", flush=True)

# [2026-01-14 新增]：自動檢查重複並編號的邏輯
def get_unique_path(base_path, title, quality_tag, ext):
    # 清理檔名非法字元
    clean_title = re.sub(r'[\\/:*?"<>|]', '_', title)
    counter = 0
    while True:
        num_suffix = f"_{counter}" if counter > 0 else ""
        file_name = f"{clean_title}_{quality_tag}{num_suffix}.{ext}"
        # [修正] 轉為絕對路徑，防止 Tauri 執行目錄偏移
        full_path = os.path.abspath(os.path.join(base_path, file_name))
        if not os.path.exists(full_path):
            return full_path
        counter += 1

def download(url, mode, quality, save_path):
    try:
        # [修正] 預處理路徑
        if not os.path.isabs(save_path):
            save_path = os.path.abspath(save_path)
            
        if not os.path.exists(save_path):
            os.makedirs(save_path, exist_ok=True)
            
        # 先獲取基本資訊以產生檔名
        with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True}) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get('title', 'unknown')
            quality_label = quality if quality != "best" else "Best"

        ext = "mp4" if mode == "video" else "mp3"
        final_path = get_unique_path(save_path, title, quality_label, ext)
        
        # 輸出檔名給 Rust 
        print(f"FILENAME:{os.path.basename(final_path)}", flush=True)

        ydl_opts = {
            'outtmpl': final_path,
            'progress_hooks': [progress_hook],
            'quiet': True,
            'no_warnings': True,
            'noprogress': True, # [2026-01-14 新增] 禁用原生進度條輸出，防止控制字元阻塞 Rust 緩衝區
            'ffmpeg_location': './ffmpeg.exe', 
        }

        if mode == 'video':
            ydl_opts['format'] = f"{quality}+bestaudio/best" if quality != "best" else "bestvideo+bestaudio/best"
            ydl_opts['merge_output_format'] = 'mp4'
        else:
            ydl_opts['format'] = quality if quality != "bestaudio" else "bestaudio/best"
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '256',
            }]

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
            
    except Exception as e:
        print(f"Download Error: {str(e)}", file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(1)
    
    command = sys.argv[1]
    video_url = sys.argv[2]
    
    if command == "analyze":
        analyze(video_url)
    elif command == "download":
        mode = sys.argv[3] if len(sys.argv) > 3 else "video"
        quality = sys.argv[4] if len(sys.argv) > 4 else "best"
        save_path = sys.argv[5] if len(sys.argv) > 5 else "."
        
        download(video_url, mode, quality, save_path)