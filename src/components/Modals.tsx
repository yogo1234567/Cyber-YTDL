import React from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ModalProps {
  theme: any;
  t: any;
  onClose: () => void;
}

// 1. 關於與贊助彈窗
// [2026-01-18 修改] 擴充 AboutModal 接收 setModalType，以便在贊助頁面切換到悠遊付 QR Code
export const AboutModal: React.FC<ModalProps & { 
  modalType: 'about' | 'support', 
  onOpenModal?: (type: 'easyPay') => void 
}> = ({ modalType, theme, t, onClose, onOpenModal }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-10">
    <div className="w-[500px] flex flex-col gap-3 relative animate-in fade-in zoom-in duration-300">
      <button onClick={onClose} className="absolute -top-10 -right-2 text-2xl hover:scale-125 transition-transform" style={{ color: theme.main }}>✕</button>
      
      <div className="border-[2px] p-2 rounded-t-2xl text-center font-black uppercase tracking-widest text-xs"
           style={{ borderColor: theme.main, backgroundColor: theme.bg, color: theme.main }}>
        {modalType === 'about' ? t.about_title : t.support_title}
      </div>

      <div className="border-[2px] p-6 min-h-[220px] whitespace-pre-wrap leading-relaxed text-sm font-mono shadow-[0_0_20px_rgba(0,240,255,0.1)]"
           style={{ borderColor: theme.muted, backgroundColor: `${theme.bg}EE`, color: theme.text }}>
        {modalType === 'about' ? (
          <div className="flex flex-col gap-4">
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
          <div className="flex flex-col items-center text-center gap-4 py-4">
            <p className="leading-relaxed mb-2">{t.dev_speech}</p>
            <div className="flex flex-col items-center w-full gap-4 px-2">
              {/* [2026-01-18 修改] 悠遊付按鈕 */}
              <button onClick={() => onOpenModal?.('easyPay')}
                className="w-full max-w-[280px] py-4 rounded-full border-2 font-black tracking-widest transition-all hover:scale-105 active:scale-95 pulse-glow text-[10px]"
                style={{ borderColor: theme.main, color: theme.main, backgroundColor: `${theme.main}11` }}>
                {t.donate_easypay}
              </button>

              {/* [2026-01-18 修改] PayPal 按鈕：將顏色、發光與透明度修正，與悠遊付完全統一 */}
              <button onClick={() => invoke('open_link', { url: 'https://www.paypal.me/funpeople623' })}
                className="w-full max-w-[280px] py-4 rounded-full border-2 font-black tracking-widest transition-all hover:scale-105 active:scale-95 pulse-glow text-[10px]"
                style={{ borderColor: theme.main, color: theme.main, backgroundColor: `${theme.main}11` }}>
                {t.donate_intl}
              </button>
            </div>
          </div>
        )}
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
export const GuideModal: React.FC<ModalProps> = ({ theme, t, onClose }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-10">
    <div className="w-[500px] flex flex-col gap-3 relative animate-in fade-in zoom-in duration-300">
      <button onClick={onClose} className="absolute -top-10 -right-2 text-2xl hover:scale-125 transition-transform" style={{ color: theme.main }}>✕</button>
      
      <div className="border-[2px] p-2 rounded-t-2xl text-center font-black uppercase tracking-widest text-xs"
           style={{ borderColor: theme.main, backgroundColor: theme.bg, color: theme.main }}>
        {t.guide_title}
      </div>

      <div className="border-[2px] p-6 min-h-[220px] whitespace-pre-wrap leading-relaxed text-sm font-mono shadow-[0_0_20px_rgba(0,240,255,0.1)]"
           style={{ borderColor: theme.muted, backgroundColor: `${theme.bg}EE`, color: theme.text }}>
        {t.guide_content}
      </div>

      <div className="border-[2px] p-2 rounded-b-2xl flex justify-between items-center text-[9px] font-bold px-4"
           style={{ borderColor: theme.main, backgroundColor: theme.bg, color: theme.main }}>
        <span className="opacity-80">{t.guide_footer}</span>
        <span className="uppercase tracking-tighter">{t.author_name}</span>
      </div>
    </div>
  </div>
);