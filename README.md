# ⚡ Cyber-YTDL: 賽博Youtube影音下載器 (Cyber YouTube Downloader)

![Version](https://img.shields.io/github/v/release/yogo1234567/Cyber-YTDL?color=purple)
![Downloads](https://img.shields.io/github/downloads/yogo1234567/Cyber-YTDL/total?color=blue)
![License](https://img.shields.io/github/license/yogo1234567/Cyber-YTDL?style=for-the-badge)
![Tauri Version](https://img.shields.io/badge/Tauri-v2-FFC107?style=for-the-badge&logo=tauri)
![Visual Style](https://img.shields.io/badge/Style-Cyberpunk-00ff9f?style=for-the-badge)
![AI-Powered](https://img.shields.io/badge/Developed_with-Gemini_AI-blue?style=for-the-badge&logo=google-gemini)

---
程式畫面 / Program interface:

<table align="center">
  <tr>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/20ae2391-2565-4f7b-bbcb-bf541605ad9c" width="380px"/><br/> 
      <b>中文主下載介面
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/6a344769-3862-4fb9-9fc3-091a73475b9e" width="380px"/><br/>
      <b>English main UI
    </td>
  </tr>
</table>

<table align="center">
  <tr>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/054d9173-a189-4096-9754-a2fe47cd157a"width="380px"/><br/>     
      <b>缺失核心下載畫面</b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/27ab6cd6-4669-426d-8a12-66fa2e4771ef" width="380px"/><br/>
      <b>The core download interface is missing.</b>
    </td>
  </tr>
</table>

<table align="center">
  <tr>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/b11d9552-dab3-41f6-af14-5653edf78cf1" width="380px"/><br/>
      <b>介面模式功能介紹 / Function Introduction </b>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/befc408d-b1d9-4a33-b579-385e21b2d248" width="380px"/><br/>
      <b>使用說明 / use </b>
    </td>
  </tr>
</table>

<p align="center">
  <img src="https://github.com/user-attachments/assets/b913b204-02c6-4b2e-9090-ed854d5317a9" width="800" alt="Main Demo">
  <br>
  <b>監控展示 / Monitor Demo</b>
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/9e45ed0c-198e-449b-aacd-08afa4e039d0" width="600" alt="Cyber-YTDL Preview">
  <br>
  <em>Cyber-YTDL 介面預覽 / Interface Preview</em>
</p>

📖 Cyber-YTDL 使用指南 (全功能解析) / User Guide
📖 使用說明 (User Manual)
1. 核心環境初始化 (第一次執行必做)

    點擊左側側邊欄最下方的 「核心修復 (Repair)」 圖標。

    程式會自動連接至伺服器下載最新的下載核心 (yt-dlp, ffmpeg)。

2. 下載控制 (Download Control)

    ⏸️ 暫停與續傳 (Pause & Resume): 在下載過程中，下載按鈕會變為「暫停」。點擊可中止目前任務，再次點擊則會從上次的進度繼續下載，無須重頭來過。

    網址解析: 支援自動監控剪貼簿或手動貼上。解析成功後，影像預覽區會自動展開。

3. 介面視覺調整 (UI Customization)

    📏 智慧 UI 拉桿 (Scaling): 位於右下角的 A--A 拖動拉桿，可即時縮放全軟體的文字大小與 UI 比例，完美適配高解析度 4K 螢幕。

    ✨ 賽博發光模式 (Glow Modes): 點擊右下角的發光圖標，可切換三種模式：

        靜止模式 (Still): 極簡邊框。

        呼吸燈 (Pulse): 律動感的明滅效果。

        動態流光 (Flow): 華麗的霓虹流束旋轉運動。

    📐 內容感應視窗: 視窗會自動根據預覽內容的大小調整高度，確保視覺上始終保持美觀與對稱。

✨ 功能亮點 / Features

    ⏸️ 支援暫停續傳 (Breakpoint Resume)： 業界首創 AI 驅動的下載控制邏輯，下載影片再也不怕網路斷線。 (Breakpoint-resume support ensures you never lose download progress again.)

    📏 自由字體縮放 (Dynamic UI Scaling)： 專為視力友善與高解析度螢幕設計，輕鬆滑動拉桿即可調整介面比例。 (Smooth slider for real-time UI and font scaling, optimized for 4K displays.)

    ✨ 三重發光氛圍 (Neon Glow Modes)： 內建靜態、呼吸、流光三種賽博視覺效果。 (Includes Still, Pulse, and Flow neon lighting effects for the ultimate cyberpunk feel.)

    🖥️ 智慧監控剪貼簿 (Smart Monitor)： 複製即解析，高效率的零點擊體驗。 (Clipboard Sensing: High-performance auto-parse algorithm.)

    🎨 賽博美學介面 (Cyberpunk Aesthetics)： 完美融合霓虹綠、極簡白與深沉黑三種視覺語系。

    ⚙️ 核心自動維護 (Auto-Core Maintenance)： 一鍵全自動檢查並安裝下載核心元件。

🦾 開發者的真心話 / Developer's Monologue

    我自己不是程式設計者，完全是把我的想法告訴 Gemini AI。開發過程中它雖然偶爾會跟我「鬼打牆」(自己刪減代碼，或是瘋狂找明明沒錯的地方說有錯)，搞得我快瘋了，但畢竟這整個程式從 UI 到複雜的 Rust 後端邏輯，全都是我跟 Gemini 聯手做出的。我希望這款程式能讓大家感覺到，只要有創意，AI 就能幫你實現代碼的夢想！

    (I built this entirely by conveying my ideas to Gemini AI. Even though we had our "loopy" moments where the AI edited things unexpectedly, we ultimately built a complete UI and logic system from scratch. This tool proves that with a vision, anything is possible!)

    「代碼不是障礙，創意才是靈魂。」

📦 技術堆棧 / Tech Stack

    核心 (Core): Rust (Tauri v2) - 輕量化、極速、安全。

    視覺 (Frontend): React 18 + Tailwind CSS - 現代化動態 UI。

    大腦 (AI): Google Gemini AI - 負責 100% 的代碼生成與除錯。

👨‍💻 核心團隊 / Team

    總策劃 [CAIREN_TW] - 提供靈魂、美學設計與反覆測試。

    首席架構師: Google Gemini AI - 負責底層邏輯實作。

    "Everything is possible when you have a vision and a powerful AI partner."
