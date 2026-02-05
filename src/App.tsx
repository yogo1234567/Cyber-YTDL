import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { ask } from '@tauri-apps/plugin-dialog';
import { CyberFrame } from './components/CyberFrame';
import { THEMES } from './constants';
import { MonitorIcon, ResetIcon, SettingsIcon, DownloadIcon } from './components/Icons';
import { ContextMenu, SettingsMenu, AboutTriggerMenu } from './components/Menus';
import { AboutModal, GuideModal } from './components/Modals';

import easyPayQr from './assets/easy_pay_qr.png';
import { useVideoApp } from './hooks/useVideoApp';

const appWindow = getCurrentWindow();

// --- 定義統一的最小尺寸常量 ---
const MIN_W = 940;
const MIN_H = 740;

const App: React.FC = () => {
  const logic = useVideoApp();
  const { theme, t, themeKey, lang, dlStatus, startDownload, isCoreOk, isProcessing } = logic;
  const [isRepairing, setIsRepairing] = React.useState(false);
  const [showBorder, setShowBorder] = React.useState(false);

  const showBorderRef = React.useRef(showBorder);
  const containerRef = React.useRef<HTMLDivElement>(null); // [新增] 用於監控內容大小

  React.useEffect(() => {
    showBorderRef.current = showBorder;
  }, [showBorder]);

  React.useEffect(() => {
    const handleResize = async () => {
      // 1. 檢查是否最大化，如果是則不強制調整
      if (await appWindow.isMaximized()) return;

      if (containerRef.current) {
        // [新增] 核心邏輯：檢測是否溢出 (Clipping Check)
        // scrollWidth 代表「內容實際需要的寬度」，innerWidth 代表「視窗目前能顯示的寬度」
        // 如果內容大於視窗，代表被切到了
        const contentW = containerRef.current.scrollWidth;
        const contentH = containerRef.current.scrollHeight;
        const windowW = window.innerWidth;
        const windowH = window.innerHeight;

        // [2026-02-04 修正] 針對高 DPI (150%+) 的 агрессив (Aggressive) 補償
        // 當縮放比例越高，瀏覽器渲染誤差越大，需要給更多的 Buffer
        const ratio = window.devicePixelRatio || 1;
        const baseBuffer = 4;
        const buffer = ratio > 1.5 ? baseBuffer * ratio * 2 : baseBuffer;

        if (contentW > windowW + buffer || contentH > windowH + buffer) {
          const currentSize = await appWindow.innerSize();
          const factor = await appWindow.scaleFactor();
          const logicalSize = currentSize.toLogical(factor);

          // 計算差額，並針對高縮放環境多加一點點「安全餘裕」，防止剛好切齊又被四捨五入吃掉
          const extraSafety = ratio > 1.5 ? 10 : 0;
          const diffW = Math.max(0, contentW - windowW) + (contentW > windowW ? extraSafety : 0);
          const diffH = Math.max(0, contentH - windowH) + (contentH > windowH ? extraSafety : 0);

          if (diffW > 0 || diffH > 0) {
            // 將差額補上，並設為新的視窗大小
            await appWindow.setSize(new LogicalSize(logicalSize.width + diffW, logicalSize.height + diffH));
          }
        }
      }
    };

    // 啟動 ResizeObserver 監控內容變化
    const observer = new ResizeObserver(() => {
      // 使用 debounce 或 requestAnimationFrame 避免過度頻繁觸發
      requestAnimationFrame(() => handleResize());
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    // 視窗本身的變化也要監聽，防止被使用者拉太小
    const unlistenScale = appWindow.onScaleChanged(() => handleResize());

    return () => {
      observer.disconnect();
      unlistenScale.then(f => f());
    };
  }, []);

  const [uiScale, setUiScale] = React.useState(1.0);
  const [glowMode, setGlowMode] = React.useState(0);

  const getDynamicStyle = (basePx: number) => ({
    fontSize: `${basePx * uiScale}px`,
    transition: 'font-size 0.2s ease-out'
  });

  const globalScaleStyle = {
    fontSize: `${uiScale}rem`,
    transition: 'font-size 0.2s ease-out'
  } as React.CSSProperties;

  const handleRequestClose = async () => {
    const confirm = await ask(
      lang === 'zh_TW' ? '確定要關閉程式嗎？\n(若有下載任務將會中止)' : 'Are you sure you want to exit?\n(Active downloads will be cancelled)',
      { title: lang === 'zh_TW' ? '關閉確認' : 'Close Confirmation', kind: 'warning' }
    );
    if (confirm) {
      if (dlStatus !== 'idle') {
        try { await invoke('cancel_download', { lang }); } catch (e) { console.error(e); }
      }
      await appWindow.close();
    }
  };

  // --- 1. 防止右鍵菜單 ---
  useEffect(() => {
    const handleSystemContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT';
      const isStatus = target.closest('.status-scrollbar');
      if (!isInput && !isStatus) e.preventDefault();
    };
    document.addEventListener('contextmenu', handleSystemContextMenu);
    return () => document.removeEventListener('contextmenu', handleSystemContextMenu);
  }, []);

  // --- 4. 點擊空白處關閉選單 ---
  useEffect(() => {
    const closeAll = () => {
      logic.setMenuPos(null);
      logic.setSettingsMenuPos(null);
      logic.setAboutMenuPos(null);
    };
    window.addEventListener('click', closeAll);
    return () => window.removeEventListener('click', closeAll);
  }, [logic.setMenuPos, logic.setSettingsMenuPos, logic.setAboutMenuPos]);

  const handleSafeReset = async () => {
    if (!isCoreOk) return;
    await logic.reset();
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
        } else { logic.addLog(t.path_error); }
      }
    } catch (err) { console.error(err); }
    logic.setSettingsMenuPos(null);
  };

  // --- 修改後的解析攔截邏輯 ---
  const handleAnalyzeClick = (inputUrl?: string) => {
    // 1. 攔截：暫停狀態
    if (dlStatus === 'paused') {
      const pauseWarnMsg = lang === 'zh_TW'
        ? "目前有下載暫停中無法解析，請繼續下載或中止下載"
        : "Download is paused. Resume or Cancel before analyzing.";
      logic.addLog(pauseWarnMsg);
      return;
    }

    // 2. 攔截：正在下載中
    if (dlStatus !== 'idle') {
      const busyWarnMsg = lang === 'zh_TW'
        ? "目前正在下載中無法解析，請等待或中止下載"
        : "Downloading in progress. Please wait or cancel before analyzing.";
      logic.addLog(busyWarnMsg);
      return;
    }

    // 若通過以上檢查，才執行正常解析
    logic.handleAnalyze(inputUrl);
  };

  const handleRepairCore = async () => {
    if (dlStatus !== 'idle') return;
    setIsRepairing(true);
    logic.setIsCoreOk(false);
    logic.addLog(t.repairing);
    logic.setProgress(0);
    logic.setDlStatus('downloading');
    try {
      const result = await invoke<string>('download_components', { lang });
      logic.addLog(result);
      logic.setProgress(100);
      logic.setHasUpdate(false);
    } catch (err) {
      logic.addLog(`${t.repair_fail}: ${err}`);
      logic.setIsCoreOk(false);
    } finally {
      setTimeout(async () => {
        logic.setDlStatus('idle');
        await logic.checkCoreStatus();
        await logic.checkComponentUpdate();
        setIsRepairing(false);
      }, 500);
    }
  };

  const isCoreBusy = isRepairing || (!isCoreOk && dlStatus !== 'idle');

  return (
    <div
      style={{
        ...globalScaleStyle,
        backgroundColor: 'transparent',
        pointerEvents: 'auto',
        minWidth: `${MIN_W}px`,
        minHeight: `${MIN_H}px`,
      }}
      className={`w-full h-full flex items-center justify-center ${showBorder ? "overflow-auto" : "overflow-hidden"}`}
      ref={containerRef} // [綁定] 監控最外層容器
    >
      <style dangerouslySetInnerHTML={{
        __html: `
        .cyber-slider::-webkit-slider-runnable-track { height: 2px; background: ${theme.main}44; }
        .cyber-slider::-webkit-slider-thumb { 
          appearance: none; height: 12px; width: 8px; 
          background: ${theme.main}; 
          border-width: 1px;
          border-style: solid;
          border-color: white;
          border-radius: 1px; 
          margin-top: -5px; 
          box-shadow: 0 0 8px ${theme.main};
        }
        @keyframes cyber-pulse {
          0%, 100% { box-shadow: 0 0 10px ${theme.main}66, inset 0 0 5px ${theme.main}44; }
          50% { box-shadow: 0 0 25px ${theme.main}, inset 0 0 12px ${theme.main}88; }
        }
        @keyframes cyber-flow-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .glow-pulse { animation: cyber-pulse 3s infinite ease-in-out; }

        @keyframes cyber-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .glow-flow-layer {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
          border-radius: 15px;
        }

        .glow-flow-layer::before {
          content: ''; 
          position: absolute; 
          width: 200%; 
          height: 200%; 
          top: -50%; 
          left: -50%;
          background: conic-gradient(
            from 0deg, 
            transparent 0%, 
            transparent 70%, 
            ${theme.main} 90%, 
            ${theme.main} 100%
          );
          animation: cyber-flow-rotate 2.5s linear infinite;
        }

        .glow-flow-layer::after {
          content: ''; 
          position: absolute; 
          inset: 3px; 
          background: ${theme.bg}; 
          border-radius: 12px;
          z-index: 1;
        }
      ` }} />

      {/* 選單與彈窗區 */}
      {logic.menuPos && <ContextMenu pos={logic.menuPos} theme={theme} lang={lang} uiScale={uiScale} doCut={logic.doCut} doCopy={logic.doCopy} doPaste={logic.doPaste} doSelectAll={logic.doSelectAll} doDelete={() => logic.setUrl('')} onClose={() => logic.setMenuPos(null)} />}

      {logic.settingsMenuPos && (
        <SettingsMenu
          pos={logic.settingsMenuPos}
          theme={theme}
          lang={lang}
          t={t}
          uiScale={uiScale}
          onSelectPath={handleSelectPath}
          onShowGuide={() => logic.setShowGuide(true)}
          onClose={() => logic.setSettingsMenuPos(null)}
        />
      )}

      {logic.aboutMenuPos && (
        <AboutTriggerMenu
          pos={logic.aboutMenuPos}
          theme={theme}
          lang={lang}
          t={t}
          uiScale={uiScale}
          onOpenModal={(type) => logic.setModalType(type)}
          onClose={() => logic.setAboutMenuPos(null)}
        />
      )}

      {/* 彈窗部分保持原樣，但確認 logic.modalType 的切換正常 */}
      {logic.modalType === 'about' && <AboutModal modalType="about" theme={theme} t={t} uiScale={uiScale} onClose={() => logic.setModalType(null)} />}
      {logic.modalType === 'support' && (
        <AboutModal modalType="support" theme={theme} t={t} uiScale={uiScale} onClose={() => logic.setModalType(null)} onOpenModal={(type) => logic.setModalType(type)} />
      )}

      {logic.modalType === 'easyPay' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => logic.setModalType('support')}>
          <div className="p-6 rounded-2xl border-2 flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300" style={{ backgroundColor: theme.bg, borderColor: theme.main, boxShadow: `0 0 30px ${theme.main}44`, transform: `scale(${uiScale})`, transition: 'transform 0.2s ease-out' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black" style={{ color: theme.main }}>{lang === 'zh_TW' ? '悠遊付贊助 (台灣專用)' : 'EasyPay Support (Taiwan Only)'}</h3>
            <div className="bg-white p-3 rounded-xl shadow-inner"><img src={easyPayQr} alt="Easy Wallet QR" className="w-48 h-48 object-contain" /></div>
            <div className="flex flex-col items-center gap-2">
              <p style={{ ...getDynamicStyle(10), opacity: 0.7, color: theme.text }}>{lang === 'zh_TW' ? '請使用 悠遊付 App 掃描上方條碼' : 'Please scan with Easy Wallet App'}</p>
              <button onClick={() => invoke('open_link', { url: 'https://easywallet.easycard.com.tw/download/' })} className="underline decoration-dotted transition-opacity hover:opacity-100" style={{ ...getDynamicStyle(10), color: theme.main, opacity: 0.8 }}>{lang === 'zh_TW' ? '👉 點此前往悠遊付下載網址' : '👉 Download Easy Wallet App'}</button>
            </div>
            <button onClick={() => logic.setModalType('support')} className="px-6 py-2 rounded-full font-bold transition-all hover:scale-105" style={{ ...getDynamicStyle(14), backgroundColor: `${theme.main}22`, color: theme.main, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.main }}>{lang === 'zh_TW' ? '返回' : 'Back'}</button>
          </div>
        </div>
      )}
      {logic.showGuide && <GuideModal theme={theme} uiScale={uiScale} t={t} onClose={() => logic.setShowGuide(false)} />}

      {/* 主畫布區 */}
      <div
        className="relative flex items-center justify-center w-full h-full"
        style={{
          // 牆的寬度保持不變
          padding: '70px 80px',
          boxSizing: 'border-box',
          overflow: 'hidden',
          // 加上這兩行，當有外框時，這層容器最少要撐開到 940x740
          minWidth: `${MIN_W}px`,
          minHeight: `${MIN_H}px`,
        }}
      >
        <CyberFrame
          borderColor={glowMode === 2 ? 'transparent' : theme.main}
          backgroundColor={theme.bg}
          className={glowMode === 1 ? 'glow-pulse' : ''}
          dragRegion={true}
          style={{
            position: 'relative',
            // 使用 minWidth/minHeight 確保尺寸不會被擠壓
            width: '780px',
            height: '600px',
            minWidth: '780px',
            minHeight: '600px',
            // 關鍵：防止 flex 佈局壓縮此元件
            flexShrink: 0,
            borderWidth: '3px',
            borderStyle: 'solid',
            borderColor: glowMode === 2 ? 'transparent' : theme.main,
            zIndex: 1,
            overflow: 'hidden',
            transition: 'none',
            padding: 0,
            boxShadow: `0 0 20px ${theme.main}cc, 0 0 40px ${theme.main}44`,
            display: 'flex',
            flexDirection: 'column'
          } as React.CSSProperties}
        >
          {glowMode === 2 && <div className="glow-flow-layer" />}

          <div
            data-tauri-drag-region
            style={{
              position: 'relative',
              zIndex: 10,
              flex: 1,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: '20px',
              boxSizing: 'border-box',
              overflow: 'hidden'
            }}
          >
            {/* 1. 功能鍵標籤區 */}
            <div className="flex justify-end items-start gap-6 -mb-2 pt-2">
              {[
                { icon: <MonitorIcon color={logic.isMonitoring ? theme.main : theme.muted} />, label: t.mon_label, active: logic.isMonitoring, onClick: () => logic.setIsMonitoring(!logic.isMonitoring), disabled: isCoreBusy },
                { icon: <ResetIcon color={(isCoreBusy || isRepairing) ? theme.muted : (dlStatus !== 'idle' ? '#ff4d4f' : theme.main)} />, label: isCoreBusy ? (lang === 'zh_TW' ? "建置中" : "BUILDING") : (dlStatus !== 'idle' ? t.cancel_label : t.reset_label), active: false, onClick: handleSafeReset, disabled: isCoreBusy },
                { icon: <SettingsIcon color={theme.muted} />, label: t.set_label, active: false, onClick: (e: any) => { e.stopPropagation(); if (e.nativeEvent) e.nativeEvent.stopImmediatePropagation(); const rect = e.currentTarget.getBoundingClientRect(); logic.setSettingsMenuPos({ x: rect.left - 100, y: rect.bottom + 10 }); }, disabled: isCoreBusy },
              ].map((item, idx) => (
                <div key={idx} className={`flex flex-col items-center group ${item.disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}>
                  <button
                    onClick={item.onClick}
                    disabled={item.disabled}
                    className={`p-2 transition-all duration-300 rounded-lg mb-1 ${item.disabled ? '' : 'hover:scale-110'}`}
                    style={{
                      backgroundColor: themeKey === 'white' ? 'transparent' : `${theme.main}15`,
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: item.active ? theme.main : 'transparent'
                    }}
                  >
                    {item.icon}
                  </button>
                  <span className="uppercase font-black tracking-widest px-2 py-0.5 rounded" style={{ ...getDynamicStyle(12), color: item.active ? "#FFFFFF" : (themeKey === 'white' ? "#666666" : (dlStatus !== 'idle' && idx === 1 ? '#ff4d4f' : theme.main)), backgroundColor: item.active ? theme.main : (themeKey === 'white' ? 'transparent' : `${theme.main}22`) }}>
                    {item.label}
                  </span>
                </div>
              ))}
              <div className="flex gap-4 ml-6 pt-2">
                <button onClick={() => appWindow.minimize()} className="text-xl font-bold hover:scale-125 transition-transform" style={{ color: theme.main }}>—</button>
                <button onClick={handleRequestClose} className="text-xl font-bold hover:text-red-500 hover:scale-125 transition-transform" style={{ color: theme.main }}>✕</button>
              </div>
            </div>

            {/* 2. 預覽狀態區 */}
            <div className="flex gap-6 mb-3 overflow-hidden mt-2">
              <div className="w-[300px] h-[170px] rounded-2xl overflow-hidden relative flex items-center justify-center transition-colors shrink-0" style={{ backgroundColor: theme.bg, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.muted }}>
                {logic.metadata?.thumbnail ? <img src={logic.metadata.thumbnail} alt="thumbnail" className="w-full h-full object-cover" /> : <div className="font-mono tracking-widest pulse-cyan" style={{ ...getDynamicStyle(14), color: theme.main }}>{logic.isAnalyzing ? t.parsing : t.preview}</div>}
              </div>
              <div className="flex flex-col justify-between py-2 min-w-0 flex-1 h-[170px] overflow-hidden">
                <div className="status-scrollbar overflow-y-auto pr-2 flex-1">
                  <h2 className="font-bold leading-relaxed mt-1" style={{ ...getDynamicStyle(16), color: theme.text, wordBreak: 'break-all' }}>{logic.metadata ? logic.metadata.title : "..."}</h2>
                </div>
                <div className="flex flex-col items-start gap-2 pt-2">
                  {!logic.isCoreOk ? (
                    <div className="flex items-center gap-3 group cursor-pointer" onClick={handleRepairCore}>
                      <div className="w-8 h-4 flex items-center justify-center overflow-visible"><div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" /></div>
                      <span className="font-black uppercase tracking-wider hover:text-red-300 transition-colors" style={{ ...getDynamicStyle(13), color: '#f87171' }}>{lang === 'zh_TW' ? '核心組件缺失' : 'Core missing'}</span>
                      <div className="p-1 rounded-full bg-red-500/20 group-hover:bg-red-500/40 transition-all border border-red-500/30"><DownloadIcon color="#f87171" /></div>
                    </div>
                  ) : logic.hasUpdate ? (
                    <div className="flex items-center gap-3 group cursor-pointer" onClick={handleRepairCore}>
                      <div className="w-8 h-4 flex items-center justify-center overflow-visible"><div className="w-3 h-3 rounded-full pulse-cyan" style={{ backgroundColor: theme.main }} /></div>
                      <span className="font-black uppercase tracking-wider leading-tight" style={{ ...getDynamicStyle(13), color: theme.main }}>{lang === 'zh_TW' ? '✨ 發現核心新版本' : '✨ New core version'}</span>
                      <div className="p-1 rounded-full bg-cyan-500/20 group-hover:bg-cyan-500/40 transition-all border border-cyan-500/30"><DownloadIcon color={theme.main} /></div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-4 flex items-center justify-center overflow-visible"><div className="w-3 h-3 rounded-full pulse-cyan ml-1" style={{ backgroundColor: theme.main }} /></div>
                      <span className="opacity-60 uppercase tracking-wider" style={{ ...getDynamicStyle(13), color: theme.main }}>{t.core_ready}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 4. 網址輸入框 */}
            <div className={`relative mb-2 w-full flex items-center group transition-all duration-500 rounded-full ${logic.isAnalyzing ? 'p-[2px]' : 'p-0'}`}
              style={{ background: logic.isAnalyzing ? `linear-gradient(90deg, transparent, ${theme.main}44, transparent)` : 'transparent', boxShadow: logic.isAnalyzing ? `0 0 15px ${theme.main}33` : 'none' }}>
              {logic.isAnalyzing && (
                <div className="absolute inset-0 rounded-full pointer-events-none" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: `${theme.main}44`, overflow: 'hidden' }} >
                  <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, transparent, ${theme.main}66, #ffffff88, ${theme.main}66, transparent)`, animation: 'cyber-shimmer 2.5s infinite linear', opacity: 0.5 }} />
                </div>
              )}
              <input
                ref={logic.inputRef} type="text" value={logic.url} onChange={(e) => logic.setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeClick()}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); logic.setMenuPos({ x: e.clientX, y: e.clientY, type: 'input' }); }}
                placeholder={t.placeholder}
                className="w-full h-12 rounded-full pl-6 pr-36 font-mono focus:outline-none transition-all shadow-[inset_0_0_10px_rgba(0,0,0,0.1)] relative z-10"
                style={{ ...getDynamicStyle(16), backgroundColor: theme.bg, borderWidth: '1px', borderStyle: 'solid', borderColor: logic.isAnalyzing ? theme.main : theme.muted, color: theme.text, boxSizing: 'border-box' }}
              />
              <div className="absolute right-0 flex items-center justify-center" style={{ zIndex: 100, top: 0, bottom: 0, paddingRight: '8px' }}>
                <button onClick={(e) => { e.stopPropagation(); handleAnalyzeClick(); }} disabled={!logic.url || logic.isAnalyzing}
                  className={`px-4 h-9 rounded-full transition-all duration-300 flex items-center justify-center overflow-hidden ${(!logic.url) ? 'opacity-30 grayscale cursor-not-allowed' : 'hover:brightness-125 active:scale-95'}`}
                  style={{ backgroundColor: `${theme.main}22`, color: theme.main, borderWidth: '1px', borderStyle: 'solid', borderColor: `${theme.main}88`, boxShadow: logic.isAnalyzing ? `0 0 15px ${theme.main}66` : `0 0 10px ${theme.main}22`, minWidth: '70px', position: 'relative' }}>
                  <span className="relative z-20 font-black tracking-widest whitespace-nowrap" style={getDynamicStyle(13)}>
                    {logic.isAnalyzing ? '...' : (lang === 'zh_TW' ? '開始解析' : 'ANALYZE')}
                  </span>
                  {logic.isAnalyzing && <div className="absolute inset-0 z-10 pointer-events-none"><div className="absolute inset-0" style={{ background: `linear-gradient(90deg, transparent 0%, ${theme.main} 50%, transparent 100%)`, animation: 'cyber-shimmer 1.2s infinite linear', opacity: 0.8 }} /></div>}
                </button>
              </div>
            </div>

            {/* 5. 品質選擇框 */}
            <div className="flex gap-4 mb-2">
              <div className={`flex-1 h-12 rounded-2xl flex items-center px-4 relative transition-all min-w-0 ${(!logic.metadata || logic.isAnalyzing || logic.dlMode !== 'audio') ? 'opacity-100' : 'opacity-30'}`} style={{ backgroundColor: theme.bg, borderWidth: '1px', borderStyle: 'solid', borderColor: logic.dlMode === 'video' ? theme.main : theme.muted }}>
                <select value={logic.videoQuality} onChange={(e) => { logic.setVideoQuality(e.target.value); logic.setDlMode('video'); }} onFocus={() => logic.setDlMode('video')} disabled={dlStatus !== 'idle'} className="bg-transparent w-full outline-none cursor-pointer appearance-none" style={{ ...getDynamicStyle(16), color: (logic.dlMode === 'video' || logic.dlMode === null) ? theme.main : theme.muted }}>
                  <option value="best" style={{ backgroundColor: theme.bg }}>{t.auto_select}</option>
                  {logic.metadata?.formats.filter(f => f.ext === 'mp4').map((f, i) => (<option key={i} value={f.id} style={{ backgroundColor: theme.bg }}>{f.resolution}</option>))}
                </select>
                <span className="absolute right-4 font-bold pointer-events-none" style={{ ...getDynamicStyle(12), color: theme.muted }}>{t.v_quality}</span>
              </div>
              <div className={`flex-1 h-12 rounded-2xl flex items-center px-4 relative transition-all min-w-0 ${(!logic.metadata || logic.isAnalyzing || logic.dlMode !== 'video') ? 'opacity-100' : 'opacity-30'}`} style={{ backgroundColor: theme.bg, borderWidth: '1px', borderStyle: 'solid', borderColor: logic.dlMode === 'audio' ? theme.main : theme.muted }}>
                <select value={logic.audioQuality} onChange={(e) => { logic.setAudioQuality(e.target.value); logic.setDlMode('audio'); }} onFocus={() => logic.setDlMode('audio')} disabled={dlStatus !== 'idle'} className="bg-transparent w-full outline-none cursor-pointer appearance-none" style={{ ...getDynamicStyle(16), color: logic.dlMode === 'audio' ? theme.main : theme.muted }}>
                  <option value="bestaudio" style={{ backgroundColor: theme.bg }}>{t.auto_select}</option>
                  {logic.metadata?.formats.filter(f => f.ext === 'mp3').map((f, i) => (<option key={i} value={f.id} style={{ backgroundColor: theme.bg }}>{f.resolution}</option>))}
                </select>
                <span className="absolute right-4 font-bold pointer-events-none" style={{ ...getDynamicStyle(12), color: theme.muted }}>{t.a_quality}</span>
              </div>
            </div>

            {/* 6. 日誌與下載按鈕 + 底部導覽 */}
            <div className="mt-auto">
              <div className="flex flex-col mb-4">
                <div className="flex justify-between items-end mb-1 w-full gap-4 relative overflow-hidden">
                  <div ref={logic.statusContainerRef} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); logic.setMenuPos({ x: e.clientX, y: e.clientY, type: 'status' }); }} className="status-scrollbar overflow-y-auto h-12 font-mono pr-2" style={{ flex: '1 1 0%', minWidth: 0, wordBreak: 'break-all', color: theme.main, scrollbarWidth: 'thin', scrollbarColor: `${theme.main} transparent` } as React.CSSProperties}>
                    {logic.status.map((log, i) => <div key={i} className="mb-0.5 leading-tight" style={getDynamicStyle(13)}>{log}</div>)}
                    <div ref={logic.statusEndRef} />
                  </div>
                  <button
                    onClick={startDownload}
                    disabled={!logic.metadata || isCoreBusy || isRepairing}
                    className={`bg-transparent rounded-full w-[180px] py-3 font-black uppercase transition-all shrink-0 ${logic.metadata && !isCoreBusy ? 'pulse-glow' : 'opacity-50 cursor-not-allowed'}`}
                    style={{ ...getDynamicStyle(18), borderWidth: '3px', borderStyle: 'solid', borderColor: theme.main, color: theme.main }}
                  >
                    {isCoreBusy ? (lang === 'zh_TW' ? '核心建置中' : 'WAITING...') : dlStatus === 'idle' ? t.dl_btn : dlStatus === 'downloading' ? t.btn_pause : t.btn_resume}
                  </button>
                </div>
                <div className="flex justify-between items-center px-1 h-5 overflow-hidden">
                  <div className="font-bold tracking-tighter w-[50%] truncate" style={{ ...getDynamicStyle(9), color: theme.main }}>{dlStatus !== 'idle' && logic.dlStats.speed ? `⚡ SPEED: ${logic.dlStats.speed}` : ''}</div>
                  <div className="font-bold tracking-tighter w-[50%] text-right truncate" style={{ ...getDynamicStyle(9), color: theme.main }}>{dlStatus !== 'idle' && logic.dlStats.eta ? `⌛ ETA: ${logic.dlStats.eta}` : ''}</div>
                </div>
                <div className="relative h-4 rounded-full overflow-hidden transition-colors" style={{ backgroundColor: theme.bg, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.muted }}>
                  <div className="absolute top-0 left-0 h-full transition-all" style={{ width: `${logic.progress}%`, backgroundColor: theme.main, boxShadow: `0 0 15px ${theme.main}` }}>{dlStatus !== 'idle' && logic.progress > 0 && logic.progress < 100 && <div className="cyber-progress-glow" />}</div>
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black" style={{ ...getDynamicStyle(9), color: themeKey === 'white' ? '#333333' : theme.text, mixBlendMode: themeKey === 'white' ? 'normal' : 'difference' }}>{logic.progress}%</span>
                </div>
              </div>

              <div className="grid grid-cols-3 items-center pt-4 pb-2 border-t" style={{ borderColor: `${theme.main}44` }}>
                <div className="flex gap-3 ml-2 items-center justify-start">
                  <div className="flex gap-3 bg-black/20 p-1.5 rounded-full border" style={{ borderColor: `${theme.main}33` }}>
                    {(['cyber', 'white', 'black'] as const).map(k => (
                      <button key={k} title={lang === 'zh_TW' ? `切換至 ${k} 主題` : `Switch to ${k} theme`} onClick={() => logic.setThemeKey(k)}
                        className={`w-4 h-4 rounded-full transition-all ${themeKey === k ? 'scale-125 shadow-[0_0_10px_white]' : 'opacity-50 hover:opacity-100'}`}
                        style={{ backgroundColor: THEMES[k].main, borderWidth: '2px', borderStyle: 'solid', borderColor: themeKey === k ? '#FFFFFF' : 'transparent', boxShadow: themeKey === k ? `0 0 8px ${THEMES[k].main}` : 'none' }}
                      />
                    ))}
                  </div>
                  <button onClick={() => setGlowMode((glowMode + 1) % 3)} title={lang === 'zh_TW' ? ['靜止模式', '呼吸燈模式', '流光模式'][glowMode] : ['still mode', 'Pulse Mode', 'Flow Mode'][glowMode]} className="ml-2 w-7 h-7 rounded border flex items-center justify-center transition-all hover:scale-110 active:scale-95" style={{ borderColor: `${theme.main}66`, backgroundColor: `${theme.main}11`, color: theme.main, boxShadow: glowMode !== 0 ? `0 0 8px ${theme.main}33` : 'none' }}>
                    <span className="text-[14px] font-black">{glowMode === 0 ? '—' : glowMode === 1 ? '≈' : '≋'}</span>
                  </button>
                </div>
                <div className="flex justify-center items-center">
                  <span
                    onClick={(e: any) => {
                      e.stopPropagation();
                      if (e.nativeEvent) e.nativeEvent.stopImmediatePropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      logic.setAboutMenuPos({ x: rect.left - 20, y: rect.top - 80 });
                    }}
                    className="cursor-pointer font-black px-3 py-1 rounded-md transition-all hover:scale-105"
                    style={{ ...getDynamicStyle(12), color: theme.main, borderWidth: '1px', borderStyle: 'solid', borderColor: `${theme.main}66`, backgroundColor: `${theme.main}11` }}
                  >
                    {t.about_label}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-4 mr-2">
                  <div className="flex items-center gap-2">
                    <button onClick={async () => { const nextState = !showBorder; setShowBorder(nextState); try { await invoke('adjust_window_size', { resizable: nextState }); } catch (e) { console.error(e); } }}
                      title={lang === 'zh_TW' ? (showBorder ? '隱藏外框' : '顯示外框') : (showBorder ? 'Hide Border' : 'Show Border')}
                      className="w-4 h-4 rounded-full transition-all hover:scale-110 relative group"
                      style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: theme.main, backgroundColor: showBorder ? theme.main : 'transparent', boxShadow: showBorder ? `0 0 10px ${theme.main}` : 'none' }} />
                    <span style={{ ...getDynamicStyle(10), color: theme.main, fontWeight: 'bold' }}>A</span>
                    <input type="range" min="0.8" max="1.5" step="0.05" value={uiScale} onChange={(e) => setUiScale(parseFloat(e.target.value))} className="w-16 h-1 appearance-none bg-transparent cursor-pointer cyber-slider" />
                    <span style={{ ...getDynamicStyle(16), color: theme.main, fontWeight: 'bold' }}>A</span>
                  </div>
                  <div className="flex gap-2 mr-2 bg-black/20 p-1 rounded-lg border" style={{ borderColor: `${theme.main}33` }}>
                    <button onClick={() => logic.setLang('zh_TW')} className={`px-2 py-0.5 font-black rounded transition-all ${lang === 'zh_TW' ? 'bg-[#00F0FF] text-black' : 'text-gray-400'}`} style={getDynamicStyle(10)}>繁</button>
                    <button onClick={() => logic.setLang('en')} className={`px-2 py-0.5 font-black rounded transition-all ${lang === 'en' ? 'bg-[#00F0FF] text-black' : 'text-gray-400'}`} style={getDynamicStyle(10)}>EN</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CyberFrame>
      </div>
    </div>
  );
};

export default App;