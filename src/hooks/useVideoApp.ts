import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event'; // [2026-01-20 修改] 移除 emit，因為不再需要主動發送事件給懸浮窗
import { invoke } from '@tauri-apps/api/core';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open } from '@tauri-apps/plugin-dialog';
// [2026-01-17 新增] 引入路徑與檔案系統工具，用於自動路徑與權限偵測
import { downloadDir } from '@tauri-apps/api/path';
import { writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { VideoMetadata, DownloadPayload } from '../types';
import { THEMES, LANG_PACK } from '../constants';

export const useVideoApp = () => {
  const [url, setUrl] = useState('');
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [status, setStatus] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [dlStats, setDlStats] = useState<{ speed: string, eta: string }>({ speed: '', eta: '' });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  // [2026-01-18 新增] 追蹤是否進入合併/轉檔階段
  const [isProcessing, setIsProcessing] = useState(false);

  // [2026-01-18 修改] 主題記憶邏輯：優先從本地儲存讀取，若無則預設為 'cyber'
  const [themeKey, setThemeKey] = useState<'cyber' | 'white' | 'black'>(
    (localStorage.getItem('app_theme') as 'cyber' | 'white' | 'black') || 'cyber'
  );
  // [2026-01-18 修改] 語言記憶邏輯：記憶使用者選取的語系
  const [lang, setLang] = useState<'zh_TW' | 'en'>(
    (localStorage.getItem('app_lang') as 'zh_TW' | 'en') || 'zh_TW'
  );

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCoreOk, setIsCoreOk] = useState(true);
  // [2026-01-18 新增] 是否有新版本狀態
  const [hasUpdate, setHasUpdate] = useState(false);

  const [menuPos, setMenuPos] = useState<{ x: number, y: number, type: 'input' | 'status' } | null>(null);
  const [showSettingsMenu, setSettingsMenuPos] = useState<{ x: number, y: number } | null>(null);
  const [showAboutMenu, setAboutMenuPos] = useState<{ x: number, y: number } | null>(null);
  // [2026-01-18 修改] 擴充彈窗類型，新增台灣專屬支付選項：easyPay (悠遊付)，並移除時效性不穩的台灣 Pay
  const [modalType, setModalType] = useState<'about' | 'support' | 'easyPay' | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [downloadPath, setDownloadPath] = useState(localStorage.getItem('dl_path') || '');

  const [dlMode, setDlMode] = useState<'video' | 'audio' | null>(null);
  const [videoQuality, setVideoQuality] = useState<string>("best");
  const [audioQuality, setAudioQuality] = useState<string>("bestaudio");

  const inputRef = useRef<HTMLInputElement>(null);
  const statusContainerRef = useRef<HTMLDivElement>(null);
  const statusEndRef = useRef<HTMLDivElement>(null);
  const lastClipboard = useRef("");

  const theme = THEMES[themeKey];
  const t = LANG_PACK[lang] as any;

  // [2026-01-18 新增] 自動持久化主題設定
  useEffect(() => {
    localStorage.setItem('app_theme', themeKey);
  }, [themeKey]);

  // [2026-01-18 新增] 自動持久化語言設定
  useEffect(() => {
    localStorage.setItem('app_lang', lang);
  }, [lang]);

  // [2026-01-18 修改] 強化日誌解析
  const addLog = useCallback((msg: string) => {
    let displayMsg = msg;
    if (msg.includes("Extracting URL")) {
      displayMsg = t.log_extracting;
    } else if (msg.includes("Downloading webpage")) {
      displayMsg = t.log_webpage;
    } else if (msg.includes("Downloading tv client config")) {
      displayMsg = t.log_config;
    } else if (msg.includes("Downloading player")) {
      displayMsg = t.log_player;
    } else if (msg.includes("Downloading tv player API JSON")) {
      displayMsg = t.log_api_tv;
    } else if (msg.includes("Downloading android sdkless player API JSON")) {
      displayMsg = t.log_api_android;
    } else if (msg.includes("Downloading 1 format(s)")) {
      const formatMatch = msg.match(/Downloading 1 format\(s\): (.+)/);
      displayMsg = `${t.log_format}${formatMatch ? formatMatch[1] : "Best"}`;
    }
    else if (msg.includes("[Merger]")) {
      displayMsg = t.log_merger;
      setIsProcessing(true);
    } else if (msg.includes("[ExtractAudio]")) {
      displayMsg = t.log_extract_audio;
      setIsProcessing(true);
    } else if (msg.includes("[VideoConvertor]")) {
      displayMsg = t.log_convertor;
      setIsProcessing(true);
    } else if (msg.includes("[fixup]")) {
      displayMsg = t.log_fixup;
      setIsProcessing(true);
    }

    if (msg.startsWith("[download]") && msg.includes("%")) {
      return; 
    }

    displayMsg = displayMsg
      .replace(/^\[youtube\]\s*/, "📺 ")
      .replace(/^\[info\]\s*/, "💡 ");

    setStatus(prev => [...prev, `${t.status}${displayMsg}`].slice(-50));
  }, [t, setIsProcessing]);

  const checkPathPermission = async (path: string): Promise<boolean> => {
    try {
      const testFile = `${path}/.perm_test`;
      await writeTextFile(testFile, '');
      await remove(testFile);
      return true;
    } catch (e) {
      return false;
    }
  };

  const checkComponentUpdate = useCallback(async () => {
    try {
      const localVer = await invoke<string>('get_local_yt_dlp_version');
      if (localVer === "none") return; 
      const remoteVer = await invoke<string>('check_remote_yt_dlp_version');
      if (localVer !== remoteVer) {
        setHasUpdate(true); 
        const updateMsg = lang === 'zh_TW' 
          ? `✨ 發現 yt-dlp 新版本: ${remoteVer} (目前: ${localVer})。`
          : `✨ New yt-dlp version found: ${remoteVer}.`;
        addLog(updateMsg);
      }
    } catch (err) {
      console.error("檢查更新失敗:", err);
    }
  }, [addLog, lang]);

  useEffect(() => {
    const initPath = async () => {
      const savedPath = localStorage.getItem('dl_path');
      if (!savedPath) {
        try {
          const defaultPath = await downloadDir();
          setDownloadPath(defaultPath);
          localStorage.setItem('dl_path', defaultPath);
          addLog(t.default_path_msg);
        } catch (err) {
          console.error("無法取得下載路徑", err);
        }
      } else {
        setDownloadPath(savedPath);
      }
    };
    initPath();
    checkComponentUpdate();
  }, [t.default_path_msg, addLog, checkComponentUpdate]);

  const checkCoreStatus = useCallback(async () => {
    try {
      const isOk = await invoke<boolean>('check_core_components', { lang });
      setIsCoreOk(isOk);
      if (isOk) addLog(t.core_ok); else addLog(t.core_warn);
    } catch (err) {
      setIsCoreOk(false);
      addLog(`[警告] 偵測核心失敗: ${err}`);
    }
  }, [addLog, t.core_ok, t.core_warn, lang]);

  const isYouTubeUrl = (testUrl: string) => {
    const regex = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/(watch\?v=|embed\/|shorts\/|live\/|v\/|.+\?v=)?([^&=%\?]{11})/;
    return regex.test(testUrl);
  };

  const handleAnalyze = async (inputUrl?: string) => {
    const targetUrl = inputUrl || url;
    if (!targetUrl.trim() || !isYouTubeUrl(targetUrl) || isAnalyzing) return;
    setIsAnalyzing(true);
    addLog(t.parsing);
    try {
      const data = await invoke<VideoMetadata>('analyze_video', { url: targetUrl, lang });
      setMetadata(data);
      addLog(t.parse_success);
    } catch (err) {
      addLog(`解析錯誤: ${err}`);
      setMetadata(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startDownload = async () => {
    if (!metadata || isDownloading) return;
    setIsDownloading(true);
    setIsProcessing(false); 
    setProgress(0);
    setDlStats({ speed: '', eta: '' });
    addLog(t.dl_start);
    const activeMode = dlMode || 'video';
    const finalQuality = activeMode === 'video' ? videoQuality : audioQuality;
    try {
      await invoke('download_video', {
        url, mode: activeMode, quality: finalQuality, path: downloadPath, lang
      });
      setProgress(100);
      setDlStats({ speed: '0 B/s', eta: '00:00' });
      addLog(t.dl_done);
    } catch (err) {
      addLog(`❌ ${err}`);
      setProgress(0);
    } finally {
      setIsDownloading(false);
      setIsProcessing(false); 
    }
  };

  const reset = async () => {
    if (isDownloading || isMonitoring) return;
    setUrl('');
    setMetadata(null);
    setProgress(0);
    setDlStats({ speed: '', eta: '' });
    setIsDownloading(false);
    setIsProcessing(false); 
    lastClipboard.current = "";
    setStatus([]);
    inputRef.current?.focus();
    setTimeout(async () => {
      addLog(t.status_ready);
      await checkCoreStatus();
    }, 100);
  };

  useEffect(() => {
    checkCoreStatus();
    const unlistenStatus = listen<boolean>('core-status-update', (event) => setIsCoreOk(event.payload));
    const unlistenLog = listen<string>('backend-log', (event) => addLog(event.payload));
    
    const unlistenProgress = listen<DownloadPayload | number>('download-progress', (event) => {
      let rawVal = 0;
      if (typeof event.payload === 'number') {
        rawVal = event.payload;
      } else {
        const payload = event.payload as DownloadPayload;
        rawVal = payload.progress;
        setDlStats({ speed: payload.speed || '', eta: payload.eta || '' });
      }

      let mappedProgress = !isProcessing ? Math.floor(rawVal * 0.9) : 90 + Math.floor(rawVal * 0.1);
      
      setProgress(prev => {
        const newProg = mappedProgress > prev ? mappedProgress : prev;
        return newProg;
      });
    });

    return () => {
      unlistenStatus.then(f => f());
      unlistenLog.then(f => f());
      unlistenProgress.then(f => f());
    };
  }, [checkCoreStatus, addLog, isProcessing]);

  useEffect(() => {
    if (statusEndRef.current) statusEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [status]);

  useEffect(() => {
    let interval: number;
    if (isMonitoring) {
      readText().then(text => { if (text) lastClipboard.current = text; });
      interval = window.setInterval(async () => {
        try {
          const text = await readText();
          if (text && text !== lastClipboard.current && isYouTubeUrl(text)) {
            lastClipboard.current = text;
            setUrl(text);
            handleAnalyze(text);
          }
        } catch (e) {}
      }, 1500);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isMonitoring, handleAnalyze]);

  const doSelectAll = () => {
    if (menuPos?.type === 'input' && inputRef.current) {
      inputRef.current.select();
    } else if (statusContainerRef.current) {
      const range = document.createRange();
      range.selectNodeContents(statusContainerRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    setMenuPos(null);
  };

  const doCopy = async () => {
    const selectedText = window.getSelection()?.toString();
    if (menuPos?.type === 'input') {
      await writeText(url);
    } else if (selectedText) {
      await writeText(selectedText);
    } else {
      await writeText(status.join('\n'));
      addLog(t.copy_all);
    }
    setMenuPos(null);
  };

  const doCut = async () => {
    if (inputRef.current) { await writeText(url); setUrl(''); }
    setMenuPos(null);
  };

  const doPaste = async () => {
    const text = await readText();
    if (text) { setUrl(text); inputRef.current?.focus(); }
    setMenuPos(null);
  };

  return {
    url, setUrl, metadata, status, progress, dlStats, isAnalyzing, isDownloading, isProcessing, setProgress, setIsDownloading,
    themeKey, setThemeKey, lang, setLang, isMonitoring, setIsMonitoring, isCoreOk,
    hasUpdate, setHasUpdate, 
    menuPos, setMenuPos, showSettingsMenu, setSettingsMenuPos, showAboutMenu, setAboutMenuPos,
    modalType, setModalType, showGuide, setShowGuide, downloadPath, setDownloadPath,
    dlMode, setDlMode, videoQuality, setVideoQuality, audioQuality, setAudioQuality,
    inputRef, statusContainerRef, statusEndRef, theme, t,
    handleAnalyze, startDownload, reset, doSelectAll, doCopy, doCut, doPaste, checkCoreStatus, addLog,
    open, checkPathPermission 
  };
};