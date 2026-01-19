import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event'; // [2026-01-17 新增] 用於監聽後端事件
import { ask } from '@tauri-apps/plugin-dialog'; // [2026-01-17 新增] 用於彈出系統確認視窗
import { CyberFrame } from './components/CyberFrame';
import { THEMES } from './constants';
import { MonitorIcon, ResetIcon, SettingsIcon, DownloadIcon } from './components/Icons';
import { ContextMenu, SettingsMenu, AboutTriggerMenu } from './components/Menus';
import { AboutModal, GuideModal } from './components/Modals';

// [2026-01-18 新增] 引入悠遊付 QR Code 圖片 (請確保圖片放在 assets 資料夾)
import easyPayQr from './assets/easy_pay_qr.png';

// [才人提示] 引用新分離的邏輯 Hook
import { useVideoApp } from './hooks/useVideoApp';

const appWindow = getCurrentWindow();

const App: React.FC = () => {
  const logic = useVideoApp();
  const { theme, t, themeKey, lang } = logic;

  // [2026-01-20 新增] 自動偵測系統語言並設定介面語系
  useEffect(() => {
    // 取得系統語言 (例如: "zh-TW", "en-US")
    const systemLang = navigator.language.toLowerCase();
    // 檢查 localStorage 是否已有記錄，若無則進行自動判斷
    const savedLang = localStorage.getItem('app_lang'); 

    if (!savedLang) {
      if (systemLang.includes('zh')) {
        // 中文系統 (繁體/簡體) 均顯示繁體中文
        logic.setLang('zh_TW');
      } else {
        // 其餘顯示英文
        logic.setLang('en');
      }
    }
  }, []);

  // [2026-01-17 修改] 監聽後端傳來的「下載中嘗試關閉」事件
  useEffect(() => {
    const unlisten = listen('close-requested-while-downloading', async () => {
      // 根據當前語言設定對話框內容
      const title = lang === 'zh_TW' ? '確認退出' : 'Confirm Exit';
      const message = lang === 'zh_TW' 
        ? '目前正在下載中，強行關閉可能導致檔案損壞。確定要退出嗎？' 
        : 'Download in progress. Forced closure may cause file corruption. Are you sure you want to exit?';
      
      // 彈出系統確認視窗
      const confirmed = await ask(message, {
        title: title,
        kind: 'warning',
        okLabel: lang === 'zh_TW' ? '確定退出' : 'Exit Anyway',
        cancelLabel: lang === 'zh_TW' ? '取消' : 'Cancel',
      });

      if (confirmed) {
        // [2026-01-17 修正] 直接調用後端核心命令強制退出進程（包含清理 yt-dlp）
        await invoke('exit_app'); 
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [lang]); // 監聽語言變化，確保彈窗語系正確

  // 處理點擊外部關閉選單
  useEffect(() => {
    const closeAll = () => {
      logic.setMenuPos(null);
      logic.setSettingsMenuPos(null);
      logic.setAboutMenuPos(null);
    };
    window.addEventListener('click', closeAll);
    return () => window.removeEventListener('click', closeAll);
  }, [logic]);

  // [2026-01-17 新增保險] 強化版重置邏輯
  const handleSafeReset = () => {
    if (logic.isMonitoring) {
      logic.addLog(lang === 'zh_TW' ? "⚠️ 自動監控開啟時無法重置，請先關閉。" : "⚠️ Cannot reset while Auto-Monitor is ON.");
      return;
    }
    if (logic.isDownloading) {
      logic.addLog(lang === 'zh_TW' ? "⚠️ 下載進行中無法重置。" : "⚠️ Cannot reset during download.");
      return;
    }
    // 調用 hook 原有的重置邏輯
    logic.reset();
    logic.addLog(lang === 'zh_TW' ? "已清空重置。" : "Cleared.");
  };

  const handleSelectPath = async () => {
    try {
      const selected = await logic.open({ directory: true, multiple: false, title: t.select_folder });
      if (selected && typeof selected === 'string') {
        const hasPermission = await logic.checkPathPermission(selected);
        if (hasPermission) {
          logic.setDownloadPath(selected);
          localStorage.setItem('dl_path', selected);
          logic.addLog(`${t.path_updated} ${selected}`);
        } else {
          logic.addLog(t.path_error);
        }
      }
    } catch (err) { 
      console.error(err); 
    }
    logic.setSettingsMenuPos(null);
  };

  const handleRepairCore = async () => {
    if (logic.isDownloading) return;
    logic.addLog(t.repairing);
    logic.setProgress(0);
    logic.setIsDownloading(true);
    try {
      const result = await invoke<string>('download_components', { lang });
      logic.addLog(result);
      logic.checkCoreStatus();
      logic.setProgress(100);
      // [2026-01-18 新增] 修復完成後重置更新狀態
      logic.setHasUpdate(false);
    } catch (err) { 
      logic.addLog(`${t.repair_fail}: ${err}`); 
    } finally {
      setTimeout(() => logic.setIsDownloading(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent overflow-visible">
      {logic.menuPos && <ContextMenu pos={logic.menuPos} theme={theme} lang={lang} doCut={logic.doCut} doCopy={logic.doCopy} doPaste={logic.doPaste} doSelectAll={logic.doSelectAll} doDelete={() => logic.setUrl('')} onClose={() => logic.setMenuPos(null)} />}
      {logic.showSettingsMenu && <SettingsMenu pos={logic.showSettingsMenu} theme={theme} lang={lang} t={t} onSelectPath={handleSelectPath} onShowGuide={() => logic.setShowGuide(true)} onClose={() => logic.setSettingsMenuPos(null)} />}
      {logic.showAboutMenu && <AboutTriggerMenu pos={logic.showAboutMenu} theme={theme} lang={lang} t={t} onOpenModal={(type) => logic.setModalType(type)} onClose={() => logic.setAboutMenuPos(null)} />}
      
      {/* [2026-01-18 修改] 整合 AboutModal 點擊跳轉 easyPay 的邏輯 */}
      {logic.modalType === 'about' && <AboutModal modalType="about" theme={theme} t={t} onClose={() => logic.setModalType(null)} />}
      {logic.modalType === 'support' && (
        <AboutModal 
          modalType="support" 
          theme={theme} 
          t={t} 
          onClose={() => logic.setModalType(null)} 
          onOpenModal={(type) => logic.setModalType(type)} 
        />
      )}
      
      {/* [2026-01-18 修改] 悠遊付 QR Code 彈窗邏輯：強制跟隨 lang 狀態切換中英文 */}
      {logic.modalType === 'easyPay' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => logic.setModalType('support')}>
          <div 
            className="p-6 rounded-2xl border-2 flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300"
            style={{ backgroundColor: theme.bg, borderColor: theme.main, boxShadow: `0 0 30px ${theme.main}44` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 標題強制判斷 */}
            <h3 className="text-lg font-black" style={{ color: theme.main }}>
              {lang === 'zh_TW' ? '悠遊付贊助 (台灣專用)' : 'EasyPay Support (Taiwan Only)'}
            </h3>
            
            <div className="bg-white p-3 rounded-xl shadow-inner">
               <img src={easyPayQr} alt="Easy Wallet QR" className="w-48 h-48 object-contain" />
            </div>
            
            <div className="flex flex-col items-center gap-2">
              {/* 提示文字強制判斷 */}
              <p className="text-[10px] opacity-70" style={{ color: theme.text }}>
                {lang === 'zh_TW' ? '請使用 悠遊付 App 掃描上方條碼' : 'Please scan with Easy Wallet App'}
              </p>
              
              {/* 下載連結按鈕強制判斷 */}
              <button 
                onClick={() => invoke('open_link', { url: 'https://easywallet.easycard.com.tw/download/' })}
                className="text-[10px] underline decoration-dotted transition-opacity hover:opacity-100"
                style={{ color: theme.main, opacity: 0.8 }}
              >
                {lang === 'zh_TW' ? '👉 點此前往悠遊付下載網址' : '👉 Download Easy Wallet App'}
              </button>
            </div>

            {/* 返回按鈕強制判斷 */}
            <button 
              onClick={() => logic.setModalType('support')}
              className="px-6 py-2 rounded-full font-bold text-sm transition-all hover:scale-105"
              style={{ backgroundColor: `${theme.main}22`, color: theme.main, border: `1px solid ${theme.main}` }}
            >
              {lang === 'zh_TW' ? '返回' : 'Back'}
            </button>
          </div>
        </div>
      )}

      {logic.showGuide && <GuideModal theme={theme} t={t} onClose={() => logic.setShowGuide(false)} />}

      <div className="relative w-full flex items-center justify-center p-20 overflow-visible">
        <div className="w-[680px] shrink-0 mx-auto overflow-visible relative">
          <CyberFrame borderColor={theme.main} backgroundColor={theme.bg} dragRegion={true}>
            {/* 頂部按鈕區 */}
            <div className="flex justify-end items-start gap-6 -mb-2 pt-4">
              {/* [2026-01-20 修改] 已移除懸浮窗三態切換按鈕區塊 */}

              {[
                { 
                  icon: <MonitorIcon color={logic.isMonitoring ? theme.main : theme.muted} />, 
                  label: t.mon_label, 
                  active: logic.isMonitoring, 
                  onClick: () => logic.setIsMonitoring(!logic.isMonitoring),
                  disabled: false 
                },
                { 
                  icon: <ResetIcon color={(logic.isMonitoring || logic.isDownloading) ? theme.muted : theme.main} />, 
                  label: t.reset_label, 
                  active: false, 
                  onClick: handleSafeReset,
                  // [2026-01-17 UI 保險] 滿足條件則按鈕視覺上禁用
                  disabled: logic.isMonitoring || logic.isDownloading 
                },
                { 
                  icon: <SettingsIcon color={theme.muted} />, 
                  label: t.set_label, 
                  active: false, 
                  onClick: (e: any) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); logic.setSettingsMenuPos({ x: rect.left - 100, y: rect.bottom + 10 }); },
                  disabled: false
                },
              ].map((item, idx) => (
                <div key={idx} className={`flex flex-col items-center group ${item.disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}>
                  <button 
                    onClick={item.onClick} 
                    disabled={item.disabled}
                    className={`p-2 transition-all duration-300 rounded-lg mb-1 ${item.disabled ? '' : 'hover:scale-110'}`} 
                    style={{ 
                      backgroundColor: themeKey === 'white' ? 'transparent' : `${theme.main}15`, 
                      border: `1px solid ${item.active ? theme.main : 'transparent'}` 
                    }}
                  >
                    {item.icon}
                  </button>
                  <span className="text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded" style={{ color: item.active ? "#FFFFFF" : (themeKey === 'white' ? "#666666" : theme.main), backgroundColor: item.active ? theme.main : (themeKey === 'white' ? 'transparent' : `${theme.main}22`) }}>
                    {item.label}
                  </span>
                </div>
              ))}
              <div className="flex gap-4 ml-6 pt-2">
                <button onClick={() => appWindow.minimize()} className="text-xl font-bold hover:scale-125 transition-transform" style={{ color: theme.main }}>—</button>
                <button onClick={() => appWindow.close()} className="text-xl font-bold hover:text-red-500 hover:scale-125 transition-transform" style={{ color: theme.main }}>✕</button>
              </div>
            </div>

            {/* 縮圖與標題區 */}
            <div className="flex gap-6 mb-3 overflow-hidden">
              <div className="w-[300px] h-[170px] border rounded-2xl overflow-hidden relative flex items-center justify-center transition-colors shrink-0" style={{ backgroundColor: theme.bg, borderColor: theme.muted }}>
                {logic.metadata?.thumbnail ? <img src={logic.metadata.thumbnail} alt="thumbnail" className="w-full h-full object-cover" /> : <div className="font-mono text-sm tracking-widest pulse-cyan" style={{ color: theme.main }}>{logic.isAnalyzing ? "ANALYZING..." : t.preview}</div>}
              </div>
              <div className="flex flex-col justify-start py-2 min-w-0 flex-1 overflow-hidden">
                <h2 className="text-sm font-bold leading-relaxed mt-1" style={{ color: theme.text, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-all' }}>
                  {logic.metadata ? logic.metadata.title : "..."}
                </h2>
                
                {/* [2026-01-18 修改] 核心狀態顯示區：整合更新提示與換行邏輯 */}
                <div className="flex flex-col items-start gap-2 mt-auto mb-2">
                  {!logic.isCoreOk ? (
                    // 1. 核心缺失優先顯示
                    <div className="flex items-center gap-2 group cursor-pointer" onClick={handleRepairCore}>
                      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                      <span className="text-[11px] text-red-400 font-black uppercase tracking-wider hover:text-red-300 transition-colors">
                        {lang === 'zh_TW' ? '核心組件缺失' : 'Core missing'}
                      </span>
                      <div className="p-1 rounded-full bg-red-500/20 group-hover:bg-red-500/40 transition-all border border-red-500/30"><DownloadIcon color="#f87171" /></div>
                    </div>
                  ) : logic.hasUpdate ? (
                    // 2. 發現更新時顯示 (支援自動換行)
                    <div className="flex flex-col items-start gap-1">
                      <div className="flex items-center gap-2 group cursor-pointer" onClick={handleRepairCore}>
                        <div className="w-3 h-3 rounded-full pulse-cyan" style={{ backgroundColor: theme.main }} />
                        <span className="text-[11px] font-black uppercase tracking-wider leading-tight" style={{ color: theme.main, wordBreak: 'break-word', whiteSpace: 'normal' }}>
                          {lang === 'zh_TW' ? '✨ 發現核心新版本，建議更新' : '✨ New core version found'}
                        </span>
                        <div className="p-1 rounded-full bg-cyan-500/20 group-hover:bg-cyan-500/40 transition-all border border-cyan-500/30"><DownloadIcon color={theme.main} /></div>
                      </div>
                    </div>
                  ) : (
                    // 3. 正常就緒狀態
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full pulse-cyan" style={{ backgroundColor: theme.main }} />
                      <span className="text-[11px] opacity-60 uppercase tracking-wider" style={{ color: theme.main }}>{t.core_ready}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 輸入框 */}
            <div className="relative mb-2">
              <input ref={logic.inputRef} type="text" value={logic.url} onChange={(e) => logic.setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && logic.handleAnalyze()} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); logic.setMenuPos({ x: e.clientX, y: e.clientY, type: 'input' }); }} placeholder={t.placeholder} className="w-full h-12 border rounded-full px-6 font-mono text-sm focus:outline-none transition-all" style={{ backgroundColor: theme.bg, borderColor: theme.muted, color: theme.text }} />
            </div>

            {/* 品質選擇區 */}
            <div className="flex gap-4 mb-2">
              <div className={`flex-1 h-12 border rounded-2xl flex items-center px-4 relative transition-all min-w-0 ${logic.dlMode === 'audio' ? 'opacity-30' : 'opacity-100'}`} style={{ backgroundColor: theme.bg, borderColor: logic.dlMode === 'video' ? theme.main : theme.muted }}>
                <select value={logic.videoQuality} onChange={(e) => { logic.setVideoQuality(e.target.value); logic.setDlMode('video'); }} onFocus={() => logic.setDlMode('video')} disabled={logic.isDownloading} className="bg-transparent w-full text-sm outline-none cursor-pointer appearance-none" style={{ color: logic.dlMode === 'video' || logic.dlMode === null ? theme.main : theme.muted }}>
                  <option value="best" style={{ backgroundColor: theme.bg }}>{t.auto_select}</option>
                  {logic.metadata?.formats.filter(f => f.ext === 'mp4').map((f, i) => (<option key={i} value={f.id} style={{ backgroundColor: theme.bg }}>{f.resolution}</option>))}
                </select>
                <span className="absolute right-4 text-[10px] font-bold pointer-events-none" style={{ color: theme.muted }}>{t.v_quality}</span>
              </div>
              <div className={`flex-1 h-12 border rounded-2xl flex items-center px-4 relative transition-all min-w-0 ${logic.dlMode === 'video' ? 'opacity-30' : 'opacity-100'}`} style={{ backgroundColor: theme.bg, borderColor: logic.dlMode === 'audio' ? theme.main : theme.muted }}>
                <select value={logic.audioQuality} onChange={(e) => { logic.setAudioQuality(e.target.value); logic.setDlMode('audio'); }} onFocus={() => logic.setDlMode('audio')} disabled={logic.isDownloading} className="bg-transparent w-full text-sm outline-none cursor-pointer appearance-none" style={{ color: logic.dlMode === 'audio' || logic.dlMode === null ? theme.main : theme.muted }}>
                  <option value="bestaudio" style={{ backgroundColor: theme.bg }}>{t.auto_select}</option>
                  {logic.metadata?.formats.filter(f => f.ext === 'mp3').map((f, i) => (<option key={i} value={f.id} style={{ backgroundColor: theme.bg }}>{f.resolution}</option>))}
                </select>
                <span className="absolute right-4 text-[10px] font-bold pointer-events-none" style={{ color: theme.muted }}>{t.a_quality}</span>
              </div>
            </div>

            {/* 日誌與下載按鈕 */}
            <div className="mt-auto flex flex-col mb-4">
              <div className="flex justify-between items-end mb-1 w-full gap-4 relative overflow-hidden">
                <div ref={logic.statusContainerRef} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); logic.setMenuPos({ x: e.clientX, y: e.clientY, type: 'status' }); }} className="status-scrollbar overflow-y-auto h-12 text-[11px] font-mono pr-2" style={{ flex: '1 1 0%', minWidth: 0, wordBreak: 'break-all', color: theme.main, scrollbarWidth: 'thin', scrollbarColor: `${theme.main} transparent` } as React.CSSProperties}>
                  {logic.status.map((log, i) => <div key={i} className="mb-0.5 leading-tight">{log}</div>)}
                  <div ref={logic.statusEndRef} />
                </div>
                <button onClick={logic.startDownload} disabled={!logic.metadata || logic.isDownloading} className={`bg-transparent border-[3px] rounded-full w-[180px] py-3 text-lg font-black uppercase transition-all shrink-0 ${logic.metadata && !logic.isDownloading ? 'pulse-glow' : 'opacity-50 cursor-not-allowed'}`} style={{ borderColor: theme.main, color: theme.main }}>
                  {logic.isDownloading ? (lang === 'zh_TW' ? '下載中' : 'DL...') : t.dl_btn}
                </button>
              </div>
              <div className="flex justify-between items-center px-1 h-5 overflow-hidden">
                  <div className="text-[9px] font-bold tracking-tighter w-[50%] truncate" style={{ color: theme.main }}>{logic.isDownloading && logic.dlStats.speed ? `⚡ SPEED: ${logic.dlStats.speed}` : ''}</div>
                  <div className="text-[9px] font-bold tracking-tighter w-[50%] text-right truncate" style={{ color: theme.main }}>{logic.isDownloading && logic.dlStats.eta ? `⌛ ETA: ${logic.dlStats.eta}` : ''}</div>
              </div>
              <div className="relative h-4 border rounded-full overflow-hidden transition-colors" style={{ backgroundColor: theme.bg, borderColor: theme.muted }}>
                <div className="absolute top-0 left-0 h-full transition-all" style={{ width: `${logic.progress}%`, backgroundColor: theme.main, boxShadow: `0 0 15px ${theme.main}` }}>
                  {logic.isDownloading && logic.progress > 0 && logic.progress < 100 && <div className="cyber-progress-glow" />}
                </div>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black" style={{ color: themeKey === 'white' ? '#333333' : theme.text, mixBlendMode: themeKey === 'white' ? 'normal' : 'difference' }}>{logic.progress}%</span>
              </div>
            </div>

            {/* 底部主題/關於/語言 */}
            <div className="flex justify-between items-center mt-4 pt-4 pb-2 border-t" style={{ borderColor: `${theme.main}44` }}>
              <div className="flex gap-3 ml-2 bg-black/20 p-1.5 rounded-full border" style={{ borderColor: `${theme.main}33` }}>
                {(['cyber', 'white', 'black'] as const).map(k => (
                  <button key={k} onClick={() => logic.setThemeKey(k)} className={`w-4 h-4 rounded-full border-2 transition-all ${themeKey === k ? 'scale-125 shadow-[0_0_10px_white]' : 'opacity-50 hover:opacity-100'}`} style={{ backgroundColor: THEMES[k].main, borderColor: themeKey === k ? '#FFFFFF' : 'transparent', boxShadow: themeKey === k ? `0 0 8px ${THEMES[k].main}` : 'none' }} />
                ))}
              </div>
              <div className="relative">
                 <span onClick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); logic.setAboutMenuPos({ x: rect.left - 20, y: rect.top - 80 }); }} className="cursor-pointer font-black text-[12px] px-3 py-1 rounded-md transition-all hover:scale-105" style={{ color: theme.main, border: `1px solid ${theme.main}66`, backgroundColor: `${theme.main}11` }}>{t.about_label}</span>
              </div>
              <div className="flex gap-2 mr-2 bg-black/20 p-1 rounded-lg border" style={{ borderColor: `${theme.main}33` }}>
                  <button onClick={() => logic.setLang('zh_TW')} className={`px-2 py-0.5 text-[10px] font-black rounded transition-all ${lang === 'zh_TW' ? 'bg-[#00F0FF] text-black' : 'text-gray-400'}`}>繁</button>
                  <button onClick={() => logic.setLang('en')} className={`px-2 py-0.5 text-[10px] font-black rounded transition-all ${lang === 'en' ? 'bg-[#00F0FF] text-black' : 'text-gray-400'}`}>EN</button>
              </div>
            </div>
          </CyberFrame>
        </div>
      </div>
    </div>
  );
};

export default App;