import React from 'react';

interface CyberFrameProps {
  borderColor: string;
  // [2026-01-13] 新增 backgroundColor 屬性，用來接收 App.tsx 傳來的 theme.bg
  backgroundColor?: string; 
  children: React.ReactNode;
  dragRegion?: boolean; 
}

export const CyberFrame: React.FC<CyberFrameProps> = ({ 
  borderColor, 
  backgroundColor = '#000', // 預設值給黑色，確保相容性
  children, 
  dragRegion = false 
}) => {
  return (
    <div 
      className="cyber-frame" 
      data-tauri-drag-region={dragRegion ? "" : undefined} 
      style={{ 
        border: `2px solid ${borderColor}`, 
        // [修改] 增加底部 padding (50px)，讓主題切換按鈕不被圓角切到
        padding: '10px 20px 20px 20px', 
        // [重點修改] 將原本死板的 '#000' 改成接收動態的 backgroundColor
        background: backgroundColor, 
        borderRadius: '35px',
        boxShadow: `0 0 30px ${borderColor}33`,
        minWidth: '780px',
        position: 'relative',
        color: '#fff',
        pointerEvents: 'auto',
        transition: 'background 0.5s ease, border-color 0.5s ease' // 讓變色過程滑順一點
      }}
    >
      {/* 裝飾線條 */}
      <div style={{ position: 'absolute', top: '10px', left: '40px', right: '40px', height: '1px', background: borderColor, opacity: 0.3 }} />
      
      <div style={{ position: 'relative', zIndex: 10 }}>
        {children}
      </div>
    </div>
  );
};