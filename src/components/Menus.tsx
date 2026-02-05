import React from 'react';

interface MenuProps {
  theme: any;
  lang: string;
  uiScale: number; // 接收拉桿數值
  onClose: () => void;
}

// 建立一個樣式產生器
const getDynMenuButtonStyle = (uiScale: number, theme: any) => ({
  color: theme.text,
  fontSize: `${13 * uiScale}px`, // 👈 這裡就是讓文字變大的關鍵！基準 13px
  padding: `${8 * uiScale}px ${16 * uiScale}px`, // 讓間距也跟著放大，不然字大會擠在一起
  display: 'block',
  width: '100%',
  textAlign: 'left' as const,
  transition: 'all 0.1s ease-out'
});

// 1. 通用選單容器
const MenuContainer: React.FC<{ pos: { x: number, y: number }, theme: any, uiScale: number, children: React.ReactNode }> = ({ pos, theme, uiScale, children }) => (
  <div className="custom-context-menu" 
       style={{ 
         top: pos.y, left: pos.x, 
         backgroundColor: theme.bg, borderColor: theme.main, color: theme.text,
         minWidth: `${120 * uiScale}px`, // 連選單寬度都自動縮放
         zIndex: 9999
       }}>
    {children}
  </div>
);

// 2. 右鍵選單
export const ContextMenu: React.FC<MenuProps & { pos: { x: number, y: number, type: 'input' | 'status' }, doCut: any, doCopy: any, doPaste: any, doSelectAll: any, doDelete: any }> = 
({ pos, theme, lang, uiScale, doCut, doCopy, doPaste, doSelectAll, doDelete }) => (
  <MenuContainer pos={pos} theme={theme} uiScale={uiScale}>
    {pos.type === 'input' ? (
      <>
        <button onClick={doCut} style={getDynMenuButtonStyle(uiScale, theme)}>{lang === 'zh_TW' ? '剪下' : 'Cut'}</button>
        <button onClick={doCopy} style={getDynMenuButtonStyle(uiScale, theme)}>{lang === 'zh_TW' ? '複製' : 'Copy'}</button>
        <button onClick={doPaste} style={getDynMenuButtonStyle(uiScale, theme)}>{lang === 'zh_TW' ? '貼上' : 'Paste'}</button>
        <button onClick={doSelectAll} style={getDynMenuButtonStyle(uiScale, theme)}>{lang === 'zh_TW' ? '全選' : 'Select All'}</button>
        <button onClick={doDelete} style={getDynMenuButtonStyle(uiScale, theme)} className="delete-action">{lang === 'zh_TW' ? '刪除' : 'Delete'}</button>
      </>
    ) : (
      <>
        <button onClick={doSelectAll} style={getDynMenuButtonStyle(uiScale, theme)}>{lang === 'zh_TW' ? '全選文字' : 'Select All'}</button>
        <button onClick={doCopy} style={getDynMenuButtonStyle(uiScale, theme)}>{lang === 'zh_TW' ? '複製選取文字' : 'Copy Selected Text'}</button>
      </>
    )}
  </MenuContainer>
);

// 3. 設定選單
export const SettingsMenu: React.FC<MenuProps & { pos: { x: number, y: number }, t: any, onSelectPath: any, onShowGuide: any }> = 
({ pos, theme, lang, uiScale, t, onSelectPath, onShowGuide }) => (
  <MenuContainer pos={pos} theme={theme} uiScale={uiScale}>
    <button onClick={onSelectPath} style={getDynMenuButtonStyle(uiScale, theme)}>{t.set_path}</button>
    <button onClick={onShowGuide} style={getDynMenuButtonStyle(uiScale, theme)}>{t.user_guide}</button>
  </MenuContainer>
);

// 4. 關於/贊助選單
export const AboutTriggerMenu: React.FC<MenuProps & { pos: { x: number, y: number }, t: any, onOpenModal: (type: 'about' | 'support') => void }> = 
({ pos, theme, lang, uiScale, t, onOpenModal }) => (
  <MenuContainer pos={pos} theme={theme} uiScale={uiScale}>
    <button onClick={() => onOpenModal('about')} style={getDynMenuButtonStyle(uiScale, theme)}>{t.about_menu_item}</button>
    <button onClick={() => onOpenModal('support')} style={getDynMenuButtonStyle(uiScale, theme)}>{t.support_menu_item}</button>
  </MenuContainer>
);