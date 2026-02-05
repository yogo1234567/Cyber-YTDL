import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open } from '@tauri-apps/plugin-dialog';
import { downloadDir, join } from '@tauri-apps/api/path';
import { writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { VideoMetadata, DownloadPayload } from '../types';
import { THEMES, LANG_PACK } from '../constants';

export const useVideoApp = () => {
  // --- 基礎狀態 ---
  const hasInitialChecked = useRef(false);
  const [url, setUrl] = useState('');
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [status, setStatus] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [dlStats, setDlStats] = useState<{ speed: string; eta: string }>({ speed: '', eta: '' });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading] = useState(false); // 徹底移除鎖定，始終為 false

  // --- 下載狀態管理 (暫停/續傳核心) ---
  const [dlStatus, setDlStatus] = useState<"idle" | "downloading" | "paused" | "error">("idle");
  const dlStatusRef = useRef(dlStatus);
  useEffect(() => {
    dlStatusRef.current = dlStatus;
  }, [dlStatus]);

  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // --- 持久化與環境設定 ---
  const [themeKey, setThemeKey] = useState<'cyber' | 'white' | 'black'>(
    (localStorage.getItem('app_theme') as 'cyber' | 'white' | 'black') || 'cyber'
  );
  const [lang, setLang] = useState<'zh_TW' | 'en'>(
    (localStorage.getItem('app_lang') as 'zh_TW' | 'en') || 'zh_TW'
  );
  const [downloadPath, setDownloadPath] = useState(localStorage.getItem('dl_path') || '');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCoreOk, setIsCoreOk] = useState(true);
  const [hasUpdate, setHasUpdate] = useState(false);

  // --- UI 與 選單狀態 ---
  const [menuPos, setMenuPos] = useState<{ x: number; y: number; type: 'input' | 'status' } | null>(null);
  const [settingsMenuPos, setSettingsMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [aboutMenuPos, setAboutMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [modalType, setModalType] = useState<'about' | 'support' | 'easyPay' | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // --- 下載參數 ---
  const [dlMode, setDlMode] = useState<'video' | 'audio' | null>(null);
  const [videoQuality, setVideoQuality] = useState<string>("best");
  const [audioQuality, setAudioQuality] = useState<string>("bestaudio");

  // --- Refs 參考 ---
  const inputRef = useRef<HTMLInputElement>(null);
  const statusContainerRef = useRef<HTMLDivElement>(null);
  const statusEndRef = useRef<HTMLDivElement>(null);
  const lastClipboard = useRef("");
  const isResumingTry = useRef(false);
  const hasJustFailedResume = useRef(false);

  // --- 常數快捷參考 ---
  const theme = THEMES[themeKey];
  const t = LANG_PACK[lang] as any;

  // --- 自動持久化副作用 ---
  useEffect(() => { localStorage.setItem('app_theme', themeKey); }, [themeKey]);
  useEffect(() => { localStorage.setItem('app_lang', lang); }, [lang]);

  // --- 日誌系統 (整合翻譯與狀態攔截) ---
  const addLog = useCallback((msg: string) => {
    let displayMsg = msg;

    // 關鍵日誌翻譯對齊
    if (msg.includes("Extracting URL")) displayMsg = t.log_extracting;
    else if (msg.includes("Downloading webpage")) displayMsg = t.log_webpage;
    else if (msg.includes("Downloading tv client config")) displayMsg = t.log_config;
    else if (msg.includes("Downloading player")) displayMsg = t.log_player;
    else if (msg.includes("Downloading tv player API JSON")) displayMsg = t.log_api_tv;
    else if (msg.includes("Downloading android sdkless player API JSON")) displayMsg = t.log_api_android;

    // 續傳與暫存邏輯優化
    else if (msg.includes("Resuming download at byte")) {
      displayMsg = t.log_resuming_custom || "🚀 偵測到暫存檔，正在執行續傳下載...";
      isResumingTry.current = false;
    } else if (msg.includes("has already been downloaded")) {
      displayMsg = t.log_found_existing || "✅ 偵測到本地已存在完整檔案，準備進入後處理...";
      isResumingTry.current = false;
    } else if (msg.includes("[download] Destination:")) {
      if (isResumingTry.current) {
        displayMsg = t.log_no_temp_found || "💨 未偵測到有效暫存檔，即將重新下載...";
        setProgress(0);
        isResumingTry.current = false;
        hasJustFailedResume.current = true;
        if (msg.includes("(FORCED_TRIGGER)")) {
          setStatus(prev => [...prev, `${t.status}${displayMsg}`].slice(-50));
          return;
        }
      } else return;
    } else if (msg.includes("Downloading 1 format(s)")) {
      if (hasJustFailedResume.current) {
        hasJustFailedResume.current = false;
        return;
      }
      const formatMatch = msg.match(/Downloading 1 format\(s\): (.+)/);
      let formatId = formatMatch ? formatMatch[1] : "Best";
      displayMsg = (isResumingTry.current || progressRef.current > 0)
        ? `${t.log_resume_connect || "🛰️ 連結已重新建立，繼續搬運格式: "}${formatId}`
        : `${t.log_format}${formatId}`;
    }
    // 後處理與 FFmpeg 階段
    else if (msg.includes("Checking existence of")) displayMsg = t.log_merger_detected || "🔍 偵測到已下載軌道，正在跳轉至合併階段...";
    else if (msg.includes("[Merger]") || msg.includes("Merging formats into")) {
      displayMsg = t.log_ffmpeg_mux || "⚡ 軌道就緒，正在進行最後封裝 (FFmpeg)...";
      setIsProcessing(true);
    } else if (msg.includes("[ExtractAudio]")) { displayMsg = t.log_extract_audio; setIsProcessing(true); }
    else if (msg.includes("[VideoConvertor]")) { displayMsg = t.log_convertor; setIsProcessing(true); }
    else if (msg.includes("[fixup]")) { displayMsg = t.log_fixup; setIsProcessing(true); }

    if (msg.startsWith("[download]") && msg.includes("%") && !msg.includes("(FORCED_TRIGGER)")) return;

    displayMsg = displayMsg.replace(/^\[youtube\]\s*/, "📺 ").replace(/^\[info\]\s*/, "💡 ");
    setStatus(prev => [...prev, `${t.status}${displayMsg}`].slice(-50));
  }, [t, setIsProcessing]);

  // --- 核心組件巡檢 (更新檢查) ---
  const checkComponentUpdate = useCallback(async () => {
    console.log("!!! 觸發了更新檢查 !!!");
    if (dlStatus !== 'idle') return;
    try {
      // 版本號 Regex: 確保是數字開頭的格式 (例如 2025.01.15 或 2.6.8)
      const versionRegex = /^\d/;

      // 1. 檢查 yt-dlp 更新
      const localVer = await invoke<string>('get_local_yt_dlp_version');
      if (localVer !== "none") {
        const remoteVer = await invoke<string>('check_remote_yt_dlp_version');

        // ✨ [防呆] 檢查 remoteVer 是否以數字開頭 (排除 API 錯誤訊息)
        if (remoteVer && versionRegex.test(remoteVer)) {
          const match = remoteVer.match(/\d{4}\.\d{2}\.\d{2}/);
          if (match) {
            const cleanRemoteVer = match[0];
            const parseVer = (v: string) => parseInt(v.replace(/\./g, ''), 10);
            if (parseVer(cleanRemoteVer) > parseVer(localVer)) {
              setHasUpdate(true);
              const updateMsg = lang === 'zh_TW'
                ? `✨ 發現 yt-dlp 新版本: ${cleanRemoteVer} (目前: ${localVer})。`
                : `✨ New yt-dlp version found: ${cleanRemoteVer}.`;
              setStatus(prev => [...prev, `${LANG_PACK[lang].status}${updateMsg}`].slice(-50));
            }
          }
        }
      }

      // 2. 檢查 Deno 更新
      const localDeno = await invoke<string>('get_local_deno_version');
      if (localDeno !== "none") {
        const remoteDeno = await invoke<string>('check_remote_deno_version');

        // ✨ [防呆] 去掉 'v' 後檢查是否為有效版本號格式
        const cleanRemoteDeno = remoteDeno.trim().replace(/^v/, '');
        if (cleanRemoteDeno && versionRegex.test(cleanRemoteDeno) && cleanRemoteDeno !== "none") {
          if (cleanRemoteDeno !== localDeno) {
            const denoUpdateMsg = lang === 'zh_TW'
              ? `🦕 發現 Deno 新版本: ${cleanRemoteDeno} (目前: ${localDeno})。`
              : `🦕 New Deno version found: ${cleanRemoteDeno}.`;
            setStatus(prev => [...prev, `${LANG_PACK[lang].status}${denoUpdateMsg}`].slice(-50));
            setHasUpdate(true);
          }
        }
      } else {
        const noDenoMsg = lang === 'zh_TW'
          ? "💡 未偵測到 Deno 引擎，解析複雜影片可能會失敗。"
          : "💡 Deno not found. Complex analysis might fail.";
        setStatus(prev => [...prev, `${LANG_PACK[lang].status}${noDenoMsg}`].slice(-50));
      }
    } catch (err) { console.error("檢查更新失敗:", err); }
  }, [lang, dlStatus]);

  const checkCoreStatus = useCallback(async (_silent = false) => {
    try {
      const isOk = await invoke<boolean>('check_core_components', { lang });
      setIsCoreOk(isOk);
    } catch (err) {
      setIsCoreOk(false);
      addLog(`[警告] 偵測核心失敗: ${err}`);
    }
  }, [addLog, lang]);

  const checkPathPermission = async (path: string): Promise<boolean> => {
    try {
      // 改用後端檢查，避開前端 fs scope 限制
      const isOk = await invoke<boolean>('check_path_write_permission', { path });
      return isOk;
    } catch (err) {
      console.warn(`[Permission Check Failed] Path: ${path}, Error:`, err);
      return false;
    }
  };

  // --- 初始化 ---
  const hasInitialized = useRef(false);

  useEffect(() => {
    const initApp = async () => {
      if (hasInitialized.current) return;
      hasInitialized.current = true;

      const savedPath = localStorage.getItem('dl_path');
      if (!savedPath) {
        try {
          const defaultPath = await downloadDir();
          setDownloadPath(defaultPath);
          localStorage.setItem('dl_path', defaultPath);
          // 初始狀態不一定要跳通知，除非使用者第一次使用，這裡先不顯示 log 讓介面乾淨點
          // addLog(t.default_path_msg); 
        } catch (err) { console.error("無法取得下載路徑", err); }
      } else {
        const hasPerm = await checkPathPermission(savedPath);
        if (hasPerm) {
          setDownloadPath(savedPath);
          // 成功載入舊路徑 -> 【不動作，保持安靜】
        } else {
          try {
            const defaultPath = await downloadDir();
            setDownloadPath(defaultPath);
            localStorage.setItem('dl_path', defaultPath);
            addLog(`${t.path_error} ${t.default_path_msg}`);
          } catch (err) { console.error(err); }
        }
      }
      await checkCoreStatus(false);
      // ✨ 只有在第一次執行時才呼叫更新檢查
      if (!hasInitialChecked.current) {
        checkComponentUpdate();
        hasInitialChecked.current = true;
      }
    };
    initApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 網址處理工具 ---
  const isPlaylistUrl = (rawUrl: string): boolean => {
    try {
      const urlObj = new URL(rawUrl);
      return urlObj.pathname.includes("/playlist") && !urlObj.searchParams.has("v");
    } catch { return false; }
  };

  const standardizeYoutubeUrl = (rawUrl: string): string => {
    try {
      const trimmed = rawUrl.trim();
      if (!trimmed) return "";
      if (trimmed.includes("youtube.com/channel/") || trimmed.includes("youtube.com/user/") ||
        trimmed.includes("youtube.com/c/") || trimmed.match(/youtube\.com\/@[^/]+$/)) return "IS_CHANNEL";

      let cleanUrl = trimmed.replace(/^(https?:\/\/)?(music\.|m\.)/, "$1www.");
      const urlObj = new URL(cleanUrl);
      let videoId: string | null = null;
      if (urlObj.searchParams.has("v")) videoId = urlObj.searchParams.get("v");
      else if (urlObj.hostname === "youtu.be") videoId = urlObj.pathname.slice(1);
      else if (urlObj.pathname.includes("/shorts/") || urlObj.pathname.includes("/live/") || urlObj.pathname.includes("/embed/")) {
        const parts = urlObj.pathname.split("/");
        videoId = parts[parts.length - 1];
      }
      return (videoId && videoId.length === 11) ? `https://www.youtube.com/watch?v=${videoId}` : cleanUrl;
    } catch { return rawUrl; }
  };

  const isYouTubeUrl = (testUrl: string) => {
    const regex = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\/(watch\?v=|embed\/|shorts\/|live\/|v\/|.+\?v=)?([^&=%\?]{11})/;
    return regex.test(testUrl) || testUrl.includes("/channel/") || testUrl.includes("/user/") || testUrl.includes("/c/") || testUrl.includes("/@");
  };

  // --- 核心功能: 解析 ---
  const handleAnalyze = async (inputUrl?: string) => {
    // 🚀 [新增攔截] 如果目前是暫停狀態，禁止解析並跳出提示
    if (dlStatusRef.current === 'paused') {
      const pauseWarnMsg = lang === 'zh_TW'
        ? "目前有下載暫停中無法解析，請繼續下載或中止下載"
        : "Download is paused. Resume or Cancel before analyzing.";
      addLog(pauseWarnMsg);
      return;
    }

    // 原有的狀態防呆：非閒置中或正在解析中，則不處理
    if (dlStatusRef.current !== 'idle' || isAnalyzing) {
      if (isAnalyzing) addLog(t.log_analyzing_wait || "⏳ 正在解析中，請稍候...");
      return;
    }

    const rawUrl = inputUrl || url;
    if (!rawUrl.trim()) return;

    const targetUrl = standardizeYoutubeUrl(rawUrl);
    if (!isYouTubeUrl(targetUrl)) {
      addLog(t.log_invalid_url || "⚠️ 無法辨識此網址，請確認網址是否正確。");
      setIsAnalyzing(false);
      return;
    }

    setIsAnalyzing(true);
    if (targetUrl === "IS_CHANNEL") { addLog(t.warn_channel); setIsAnalyzing(false); return; }
    if (isPlaylistUrl(targetUrl)) { addLog(t.warn_playlist); setIsAnalyzing(false); return; }

    const requestUrl = targetUrl;
    setUrl(targetUrl);

    try {
      const data = await invoke<VideoMetadata>('analyze_video', { url: targetUrl, lang });
      // 確保解析完後網址沒被更換才更新 Metadata
      if (url === requestUrl || inputRef.current?.value === requestUrl) {
        setMetadata(data);
        setDlMode(null);
      }
    } catch (err) {
      addLog(`${t.log_analyze_error || "解析失敗"}: ${err}`);
      setMetadata(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- 核心功能: 下載控制 ---
  const togglePause = async () => {
    try {
      const isPaused = dlStatus === 'paused';
      await invoke('pause_download', { lang });
      if (!isPaused) {
        setDlStatus('paused');
        setDlStats({ speed: '0 B/s', eta: '--:--' });
      }
    } catch (err) { addLog(`❌ 操作失敗: ${err}`); }
  };

  const handleDownloadResult = (result: string) => {
    if (result === "CANCELLED") {
      setDlStats({ speed: '', eta: '' });
    } else {
      setProgress(100);
      setDlStats({ speed: '0 B/s', eta: '00:00' });
      setDlStatus('idle');
      setIsProcessing(false);
    }
  };

  const startDownload = async () => {
    if (!metadata) return;
    const activeMode = dlMode || 'video';
    const finalQuality = activeMode === 'video' ? videoQuality : audioQuality;

    if (dlStatus === 'paused') {
      try {
        isResumingTry.current = true;
        hasJustFailedResume.current = false;
        await invoke('resume_download', { lang });
        setDlStatus('downloading');
        const result = await invoke<string>('download_video', { url, mode: activeMode, quality: finalQuality, path: downloadPath, lang });
        handleDownloadResult(result);
        return;
      } catch (err) {
        if (dlStatusRef.current === 'idle') return;
        addLog(`❌ 恢復失敗: ${err}`);
        isResumingTry.current = false;
        setDlStatus('idle');
        return;
      }
    }

    if (dlStatus === 'downloading') { await togglePause(); return; }

    setDlStatus('downloading');
    setIsProcessing(false);
    setProgress(0);
    setDlStats({ speed: '', eta: '' });

    try {
      let result: string;
      try {
        result = await invoke<string>('download_video', { url, mode: activeMode, quality: finalQuality, path: downloadPath, lang });
      } catch (err: any) {
        const errMsg = String(err);
        if (dlStatusRef.current === 'idle' || errMsg.includes("cancel")) return;
        if (errMsg.includes("403") || errMsg.includes("Forbidden")) {
          addLog("🔑 偵測到門票過期 (403)，正在自動刷新連結...");
          const newData = await invoke<VideoMetadata>('analyze_video', { url, lang });
          setMetadata(newData);
          addLog("✅ 連結已更新，重新啟動下載...");
          result = await invoke<string>('download_video', { url, mode: activeMode, quality: finalQuality, path: downloadPath, lang });
        } else throw err;
      }
      handleDownloadResult(result);
    } catch (err) {
      if (dlStatusRef.current !== 'idle') {
        addLog(`❌ ${err}`);
        setProgress(0);
        setDlStatus('error');
      }
    } finally {
      if (dlStatusRef.current !== 'idle') setIsProcessing(false);
      isResumingTry.current = false;
    }
  };

  const handleCancel = async () => {
    if (!isCoreOk && progress > 0 && progress < 100) return;
    try {
      lastClipboard.current = url;
      await invoke('cancel_download', { lang });
      setIsProcessing(false);
      setProgress(0);
      setDlStats({ speed: '', eta: '' });
      setTimeout(() => {
        setDlStatus('idle');
        // --- 修正處：改用 t.log_cancel_done 並提供預設文字 ---
        addLog(t.log_cancel_done || "✅ 任務已中止，暫存檔已移除。");
      }, 100);
    } catch (err) {
      // --- 修正處：錯誤提示也建議做語系切換 ---
      const errorMsg = lang === 'zh_TW' ? `❌ 中止失敗: ${err}` : `❌ Cancel failed: ${err}`;
      addLog(errorMsg);
      setDlStatus('idle');
      setProgress(0);
    }
  };

  const reset = async () => {
    if (!isCoreOk && progress > 0 && progress < 100) return;
    if (dlStatus !== 'idle') { await handleCancel(); return; }
    setUrl('');
    setMetadata(null);
    setProgress(0);
    setDlStats({ speed: '', eta: '' });
    setDlStatus('idle');
    setIsProcessing(false);
    setIsAnalyzing(false);
    lastClipboard.current = "";
    isResumingTry.current = false;
    hasJustFailedResume.current = false;
    setStatus([t.status_ready]); // 直接設為初始狀態，不要先設 [] 再 addLog
    inputRef.current?.focus();
    setTimeout(async () => {
      await checkCoreStatus(true);
      //checkComponentUpdate(); 註解用意就是別啟動更新檢查
    }, 100);
  };

  // --- 事件監聽 ---
  useEffect(() => {
    const unlistenStatus = listen<boolean>('core-status-update', (event) => setIsCoreOk(event.payload));
    const unlistenLog = listen<string>('backend-log', (event) => addLog(event.payload));
    const unlistenProgress = listen<DownloadPayload | number>('download-progress', (event) => {
      if (dlStatus === 'paused') return;
      let rawVal = 0;
      if (typeof event.payload === 'number') rawVal = event.payload;
      else {
        const payload = event.payload as DownloadPayload;
        rawVal = payload.progress;
        setDlStats({ speed: payload.speed || '', eta: payload.eta || '' });
      }
      if (isResumingTry.current && rawVal < 1 && progress > 5) addLog("[download] Destination: (FORCED_TRIGGER)");

      let mappedProgress = !isProcessing ? Math.floor(rawVal * 0.9) : 90 + Math.floor(rawVal * 0.1);
      setProgress(prev => {
        const canJumpBack = (isResumingTry.current || prev < 5) && rawVal < 1;
        return (mappedProgress > prev || canJumpBack) ? mappedProgress : prev;
      });
    });

    return () => {
      unlistenStatus.then(f => f());
      unlistenLog.then(f => f());
      unlistenProgress.then(f => f());
    };
  }, [addLog, isProcessing, dlStatus, progress]);

  useEffect(() => {
    if (statusEndRef.current) statusEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [status]);

  // --- 剪貼簿監控 ---
  useEffect(() => {
    let interval: number;
    if (isMonitoring) {
      readText().then(text => { if (text) lastClipboard.current = text; });
      interval = window.setInterval(async () => {
        try {
          if (dlStatusRef.current !== 'idle') return;
          const text = await readText();
          if (text && text !== lastClipboard.current && isYouTubeUrl(text)) {
            lastClipboard.current = text;
            setUrl(text);
            setTimeout(() => { if (dlStatusRef.current === 'idle') handleAnalyze(text); }, 300);
          }
        } catch { }
      }, 1500);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isMonitoring, handleAnalyze]);

  // --- 右鍵選單操作 ---
  const doSelectAll = () => {
    if (menuPos?.type === 'input' && inputRef.current) inputRef.current.select();
    else if (statusContainerRef.current) {
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
    if (menuPos?.type === 'input') await writeText(url);
    else if (selectedText) await writeText(selectedText);
    else { await writeText(status.join('\n')); addLog(t.copy_all); }
    setMenuPos(null);
  };

  const doCut = async () => { if (inputRef.current) { await writeText(url); setUrl(''); } setMenuPos(null); };
  const doPaste = async () => { const text = await readText(); if (text) { setUrl(text); inputRef.current?.focus(); } setMenuPos(null); };

  return useMemo(() => ({
    url, setUrl, metadata, status, progress, dlStats, isAnalyzing, isDownloading, isProcessing, setProgress,
    dlStatus, setDlStatus, togglePause,
    themeKey, setThemeKey, lang, setLang, isMonitoring, setIsMonitoring, isCoreOk, setIsCoreOk,
    hasUpdate, setHasUpdate,
    menuPos, setMenuPos, settingsMenuPos, setSettingsMenuPos, aboutMenuPos, setAboutMenuPos,
    modalType, setModalType, showGuide, setShowGuide, downloadPath, setDownloadPath,
    dlMode, setDlMode, videoQuality, setVideoQuality, audioQuality, setAudioQuality,
    inputRef, statusContainerRef, statusEndRef, theme, t,
    handleAnalyze, startDownload, reset, doSelectAll, doCopy, doCut, doPaste, checkCoreStatus, checkComponentUpdate, addLog,
    open, checkPathPermission
  }), [
    url, metadata, status, progress, dlStats, isAnalyzing, isDownloading, isProcessing,
    dlStatus, themeKey, lang, isMonitoring, isCoreOk, hasUpdate,
    menuPos, settingsMenuPos, aboutMenuPos, modalType, showGuide, downloadPath,
    dlMode, videoQuality, audioQuality,
    theme, t,
    handleAnalyze, startDownload, reset, doSelectAll, doCopy, doCut, doPaste, checkCoreStatus, checkComponentUpdate, addLog,
    open, checkPathPermission
  ]);
};