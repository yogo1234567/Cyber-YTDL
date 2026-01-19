import React from 'react';

interface MenuProps {
  theme: any;
  lang: string;
  onClose: () => void;
}

// 1. 通用選單容器 (維持原本樣式)
const MenuContainer: React.FC<{ pos: { x: number, y: number }, theme: any, children: React.ReactNode }> = ({ pos, theme, children }) => (
  <div className="custom-context-menu" 
       style={{ 
         top: pos.y, left: pos.x, 
         backgroundColor: theme.bg, borderColor: theme.main, color: theme.text 
       }}>
    {children}
  </div>
);

// 2. 右鍵選單 (輸入框與狀態欄)
export const ContextMenu: React.FC<MenuProps & { pos: { x: number, y: number, type: 'input' | 'status' }, doCut: any, doCopy: any, doPaste: any, doSelectAll: any, doDelete: any }> = 
({ pos, theme, lang, doCut, doCopy, doPaste, doSelectAll, doDelete }) => (
  <MenuContainer pos={pos} theme={theme}>
    {pos.type === 'input' ? (
      <>
        <button onClick={doCut} style={{ color: theme.text }}>{lang === 'zh_TW' ? '剪下' : 'Cut'}</button>
        <button onClick={doCopy} style={{ color: theme.text }}>{lang === 'zh_TW' ? '複製' : 'Copy'}</button>
        <button onClick={doPaste} style={{ color: theme.text }}>{lang === 'zh_TW' ? '貼上' : 'Paste'}</button>
        <button onClick={doSelectAll} style={{ color: theme.text }}>{lang === 'zh_TW' ? '全選' : 'Select All'}</button>
        <button onClick={doDelete} className="delete-action">{lang === 'zh_TW' ? '刪除' : 'Delete'}</button>
      </>
    ) : (
      <>
        <button onClick={doSelectAll} style={{ color: theme.text }}>{lang === 'zh_TW' ? '全選文字' : 'Select All'}</button>
        <button onClick={doCopy} style={{ color: theme.text }}>{lang === 'zh_TW' ? '複製選取文字' : 'Copy Selected Text'}</button>
      </>
    )}
  </MenuContainer>
);

// 3. 設定選單
export const SettingsMenu: React.FC<MenuProps & { pos: { x: number, y: number }, t: any, onSelectPath: any, onShowGuide: any }> = 
({ pos, theme, t, onSelectPath, onShowGuide }) => (
  <MenuContainer pos={pos} theme={theme}>
    <button onClick={onSelectPath} style={{ color: theme.text }}>{t.set_path}</button>
    <button onClick={onShowGuide} style={{ color: theme.text }}>{t.user_guide}</button>
  </MenuContainer>
);

// 4. 關於/贊助選單
export const AboutTriggerMenu: React.FC<MenuProps & { pos: { x: number, y: number }, t: any, onOpenModal: (type: 'about' | 'support') => void }> = 
({ pos, theme, t, onOpenModal }) => (
  <MenuContainer pos={pos} theme={theme}>
    <button onClick={() => onOpenModal('about')} style={{ color: theme.text }}>{t.about_menu_item}</button>
    <button onClick={() => onOpenModal('support')} style={{ color: theme.text }}>{t.support_menu_item}</button>
  </MenuContainer>
);