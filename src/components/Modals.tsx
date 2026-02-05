import React from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ModalProps {
  theme: any;
  t: any;
  onClose: () => void;
  uiScale: number;
}

// 1. 關於與贊助彈窗
export const AboutModal: React.FC<ModalProps & {
  modalType: 'about' | 'support',
  onOpenModal?: (type: 'easyPay') => void
}> = ({ modalType, theme, t, onClose, onOpenModal, uiScale }) => (
  // 比例控製：pt-[20vh] (頂部), pb-[40vh] (底部為頂部兩倍)
  <div className="fixed inset-0 z-[100] flex justify-center bg-black/80 backdrop-blur-sm overflow-y-auto pt-[20vh] pb-[40vh] px-4">
    <div className="w-[500px] flex flex-col gap-3 relative animate-in fade-in zoom-in duration-300 my-auto"
      style={{ transform: `scale(${uiScale})`, transition: 'transform 0.2s ease-out', transformOrigin: 'center top' }}>

      <div className="border-[2px] p-2 rounded-t-2xl text-center font-black uppercase tracking-widest text-xs relative"
        style={{ borderColor: theme.main, backgroundColor: theme.bg, color: theme.main }}>

        {/* X 按鈕 - 飄在上方 */}
        <button onClick={onClose} className="absolute -top-20 -right-2 text-2xl hover:scale-125 transition-transform" style={{ color: theme.main }}>✕</button>

        {modalType === 'about' ? t.about_title : t.support_title}
      </div>

      <div className="border-x-[2px] p-6 min-h-[220px] shadow-[0_0_20px_rgba(0,240,255,0.1)]"
        style={{ borderColor: theme.muted, backgroundColor: `${theme.bg}EE`, color: theme.text }}>

        <div className="status-scrollbar" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '8px' }}>
          {modalType === 'about' ? (
            <div className="flex flex-col gap-4 whitespace-pre-wrap leading-relaxed text-sm font-mono text-left">
              <div>
                <p className="font-bold mb-2" style={{ color: theme.main }}>{t.tech_core}:</p>
                <div className="leading-7">
                  <p className="opacity-80">• {t.label_gui}: Tauri + Rust + React</p>
                  <p>
                    • {t.label_engine}: <button
                      onClick={(e) => { e.stopPropagation(); invoke('open_link', { url: 'https://github.com/yt-dlp/yt-dlp' }); }}
                      className="cursor-pointer text-cyan-400 hover:text-white underline decoration-dotted opacity-100 transition-colors"
                    >yt-dlp (Open Source)</button>
                  </p>
                  <p>
                    • {t.label_runtime}: <button
                      onClick={(e) => { e.stopPropagation(); invoke('open_link', { url: 'https://deno.com/' }); }}
                      className="cursor-pointer text-cyan-400 hover:text-white underline decoration-dotted opacity-100 transition-colors"
                    >Deno (JS/TS Runtime)</button>
                  </p>
                  <p>
                    • {t.label_processor}: <button
                      onClick={(e) => { e.stopPropagation(); invoke('open_link', { url: 'https://ffmpeg.org/' }); }}
                      className="cursor-pointer text-cyan-400 hover:text-white underline decoration-dotted opacity-100 transition-colors"
                    >FFmpeg (Open Source)</button>
                  </p>
                </div>
              </div>
              <div className="mt-2 border-t pt-4" style={{ borderColor: `${theme.muted}44` }}>
                <p className="font-bold mb-2 text-red-400">{t.disclaimer_title}:</p>
                <p className="text-[12px] opacity-70 leading-5">{t.disclaimer_content}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center gap-4 py-4 whitespace-pre-wrap leading-relaxed text-sm font-mono">
              <p className="leading-relaxed mb-2">{t.dev_speech}</p>
              <div className="flex flex-col items-center w-full gap-4 px-2">
                <button onClick={() => onOpenModal?.('easyPay')}
                  className="w-full max-w-[280px] py-4 rounded-full border-2 font-black tracking-widest transition-all hover:scale-105 active:scale-95 pulse-glow text-[10px]"
                  style={{ borderColor: theme.main, color: theme.main, backgroundColor: `${theme.main}11` }}>
                  {t.donate_easypay}
                </button>

                <button onClick={() => invoke('open_link', { url: 'https://www.paypal.me/funpeople623' })}
                  className="w-full max-w-[280px] py-4 rounded-full border-2 font-black tracking-widest transition-all hover:scale-105 active:scale-95 pulse-glow text-[10px]"
                  style={{ borderColor: theme.main, color: theme.main, backgroundColor: `${theme.main}11` }}>
                  {t.donate_intl}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-[2px] p-2 rounded-b-2xl flex justify-between items-center text-[9px] font-bold px-4"
        style={{ borderColor: theme.main, backgroundColor: theme.bg, color: theme.main }}>
        <span className="uppercase tracking-tighter">{t.thanks_msg}</span>
        <span className="uppercase tracking-tighter">{t.author_title}: {t.author_name}</span>
      </div>
    </div>
  </div>
);

// 2. 使用指南彈窗
export const GuideModal: React.FC<ModalProps> = ({ theme, t, onClose, uiScale }) => (
  // 同樣採用 pt-[20vh] pb-[40vh]
  <div className="fixed inset-0 z-[100] flex justify-center bg-black/80 backdrop-blur-sm overflow-y-auto pt-[20vh] pb-[40vh] px-4">
    <div className="w-[500px] my-auto flex flex-col gap-3 relative animate-in fade-in zoom-in duration-300"
      style={{ transform: `scale(${uiScale})`, transition: 'transform 0.2s ease-out', transformOrigin: 'center top' }}>

      <div className="border-[2px] p-2 rounded-t-2xl text-center font-black uppercase tracking-widest text-xs relative"
        style={{ borderColor: theme.main, backgroundColor: theme.bg, color: theme.main }}>
        <button onClick={onClose} className="absolute -top-20 -right-2 text-2xl hover:scale-125 transition-transform" style={{ color: theme.main }}>✕</button>
        {t.guide_title}
      </div>

      <div className="border-x-[2px] p-6 min-h-[220px] shadow-[0_0_20px_rgba(0,240,255,0.1)]"
        style={{ borderColor: theme.muted, backgroundColor: `${theme.bg}EE`, color: theme.text }}>

        <div className="status-scrollbar" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '8px' }}>
          <div className="whitespace-pre-wrap leading-relaxed text-sm font-mono text-left">
            {t.guide_content}
          </div>
        </div>
      </div>

      <div className="border-[2px] p-2 rounded-b-2xl flex justify-between items-center text-[9px] font-bold px-4"
        style={{ borderColor: theme.main, backgroundColor: theme.bg, color: theme.main }}>
        <span className="opacity-80">{t.guide_footer}</span>
        <span className="uppercase tracking-tighter">{t.author_name}</span>
      </div>
    </div>
  </div>
);