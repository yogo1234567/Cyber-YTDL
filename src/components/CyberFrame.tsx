import React from 'react';

interface CyberFrameProps {
  borderColor: string;
  backgroundColor?: string; 
  children: React.ReactNode;
  dragRegion?: boolean;
  className?: string; 
  style?: React.CSSProperties; 
}

export const CyberFrame: React.FC<CyberFrameProps> = ({ 
  borderColor, 
  backgroundColor = '#000', 
  children, 
  dragRegion = true, 
  className = "", 
  style = {}      
}) => {
  return (
    <div 
      className={`cyber-frame ${className}`} 
      data-tauri-drag-region={dragRegion ? "" : undefined} 
      style={{ 
        boxSizing: 'border-box',
        // --- 核心修正：將縮寫 border 拆解為具體屬性 ---
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: borderColor, 
        // ---------------------------------------
        padding: '0', 
        background: backgroundColor, 
        borderRadius: '20px',
        boxShadow: `
          0 0 15px ${borderColor}cc,
          0 0 35px ${borderColor}b3,
          0 0 65px ${borderColor}22
        `,
        width: '100%',
        height: '100%',
        position: 'relative',
        color: '#fff',
        pointerEvents: 'auto',
        overflow: style.overflow || 'hidden',
        ...style 
      }}
    >
      {/* 裝飾線 - 同樣確保 background 使用單一顏色值 */}
      <div style={{ position: 'absolute', top: '10px', left: '40px', right: '40px', height: '1px', backgroundColor: borderColor, opacity: 0.3, pointerEvents: 'none', zIndex: 11 }} />
      
      {/* 內容層 */}
      <div 
        data-tauri-drag-region={dragRegion ? "" : undefined}
        style={{ 
          position: 'relative', 
          zIndex: 10,
          width: '100%',
          height: '100%',         
          boxSizing: 'border-box'
        }}>
        {children}      
      </div>
    </div>
  );
};