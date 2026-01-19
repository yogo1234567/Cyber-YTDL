# ⚡ Cyber-YTDL: 賽博Youtube影音下載器 (Cyber YouTube Downloader)

![Version](https://img.shields.io/github/v/release/yogo1234567/Cyber-YTDL?color=purple)
![Downloads](https://img.shields.io/github/downloads/yogo1234567/Cyber-YTDL/total?color=blue)
![License](https://img.shields.io/github/license/yogo1234567/Cyber-YTDL?style=for-the-badge)
![Tauri Version](https://img.shields.io/badge/Tauri-v2-FFC107?style=for-the-badge&logo=tauri)
![Visual Style](https://img.shields.io/badge/Style-Cyberpunk-00ff9f?style=for-the-badge)
![AI-Powered](https://img.shields.io/badge/Developed_with-Gemini_AI-blue?style=for-the-badge&logo=google-gemini)

---
程式畫面 / Program interface:

<img width="799" height="587" alt="2026-01-20_021822" src="https://github.com/user-attachments/assets/e56e66d8-7304-4b84-b06b-35f2876ab3b6" />
<img width="809" height="597" alt="2026-01-20_022702" src="https://github.com/user-attachments/assets/d778910e-e9f8-4b0c-896c-6877820a8dca" />
<img width="1564" height="1564" alt="IMG_20260120_023846" src="https://github.com/user-attachments/assets/9e45ed0c-198e-449b-aacd-08afa4e039d0" />

## 📖 Cyber-YTDL 使用指南 (全功能解析) / User Guide

### 📖 使用說明 (User Manual)
**為了讓您能順利駕馭這台下載引擎，請參考以下操作指南：**
*(To help you master this download engine, please refer to the following guide:)*

#### 1. 核心環境初始化 (第一次執行必做) / Environment Initialization
**由於開源規範限制，本程式不內建大型執行檔。請在首次啟動後：**
*(Due to open-source regulations, large binaries are not built-in. After the first launch:)*
* **點擊左側側邊欄最下方的 「核心修復 (Repair)」 圖標。**
  *(Click the "Repair" icon at the bottom of the left sidebar.)*
* **程式會自動連接至伺服器下載 yt-dlp.exe 與 ffmpeg.exe。**
  *(The program will auto-connect to download yt-dlp.exe and ffmpeg.exe.)*
* **注意：請確保您的網路環境通暢，下載完成後即可解鎖全功能。**
  *(Note: Ensure your internet is stable; all features unlock after download.)*

#### 2. 影片下載流程 / Download Process
* **手動下載 (Manual Download)：**
    * **將影片網址貼入上方的網址輸入框。** (Paste the video URL into the input box.)
    * **點擊 「Enter」 解析影片，Gemini 驅動的邏輯會自動提取所有可用的畫質與格式。** (Press Enter to parse; Gemini-driven logic will extract all formats.)
    * **在清單中選擇您想要的畫質或音質。(二擇一)** (Choose your desired video or audio quality.)
    * **點擊右側的 「下載」 按鈕。** (Click the "Download" button on the right.)
* **自動監控 (Cyber-Sense)：**
    * **開啟介面上的 「自動監控剪貼簿」 開關。** (Turn on the "Clipboard Monitor" switch.)
    * **您只需在瀏覽器複製任何Youtube影片網址，程式會自動完成解析並彈出提示，實現「零點擊」預備。** (Copy any YouTube URL; the app auto-parses and notifies you instantly.)

#### 3. 主題與語系自定義 / Themes & Languages
* **點擊 「主題切換」：可在 Cyber (霓虹綠)、Light (極簡白)、Dark (深沉黑) 之間即時切換。**
  *(Click "Theme Switch" to toggle between Cyber, Light, and Dark modes.)*
* **語系偵測：程式啟動時會自動偵測您的作業系統。若系統為中文則顯示繁體中文，其餘則自動切換為英文介面。**
  *(Auto-detection: Displays Traditional Chinese for Chinese systems, else defaults to English.)*

#### 4. 存檔路徑 / Storage Path
* **預設下載路徑為您電腦的 「下載 (Downloads)」 資料夾中的 Cyber-YTDL 子目錄。您可以隨時在介面中查看下載進度與檔案狀態。**
  *(Default path: `Downloads/Cyber-YTDL`. You can monitor status and progress in the UI.)*
* **亦可手動更換下載路徑🦾**
  *(Manual path selection is also supported! 🦾)*

---
## 🦾 開發者的真心話 / Developer's Monologue

**我自己不是程式設計者，完全是把我的想法告訴Gemini AI，雖然它時常會鬼打牆(自己刪減代碼，瘋狂找沒錯的地方說有錯@@)，搞得我快瘋了，但畢竟我整個程式介面UI代碼都是靠著Gemini AI做出的，下面就讓它吹噓一下它自己吧!!! 哈哈哈哈哈 希望這程式大家用的喜歡**

*(**English Translation:** I am not a programmer. I built this entirely by conveying my ideas to Gemini AI. Honestly, it was frustrating at times when the AI went in circles—unexpectedly deleting code or finding "errors" where there were none. But ultimately, the entire UI and logic were created by Gemini. This proves that if you have a vision, you can realize it even without coding knowledge. I hope you all enjoy it!)*

> **「代碼不是障礙，創意才是靈魂。」**
> **("Code is not a barrier; creativity is the soul.")**
> **這是一款由對程式碼一竅不通的開發者，在 Google Gemini AI 全力輔助下，從零到一構建出的下載工具。**
> *(A tool built from scratch by a non-coder, fully assisted by Google Gemini AI.)*

---

## 🦾 開發背後的故事：當創意遇上 AI / Development Story

**開發者 (CAIREN_TW)在完全不具備程式語言基礎的情況下，透過與 Google Gemini AI 的深度對話、邏輯辯論與持續優化，成功克服了以下難關：**
*(Developer CAIREN_TW, with zero coding background, overcame these challenges through deep dialogue and optimization with Gemini AI:)*

* **從零構建**: 從 Rust 環境配置到 React 前端框架，全程由 Gemini 指引完成。
  *(Built from zero: From Rust setup to React framework, all guided by Gemini.)*
* **邏輯精密**: 所有的功能邏輯（監聽剪貼簿、多語系切換、組件下載）皆經過 Gemini 精密的演算優化，確保代碼既穩健又優雅。
  *(Precise Logic: All features optimized by Gemini for stability and elegance.)*
* **人機一體**: 這不只是一個下載器，它是人類創意與當前最強大 AI 智慧結晶的完美融合。
  *(Human-AI Unity: More than a downloader; it's a fusion of creativity and AI.)*

---

## ✨ 功能亮點 / Features

* **🖥️ 自動監控剪貼簿**：複製網址即刻解析，這是我與 Gemini 共同開發出的最高效能監聽算法。
  *(Clipboard Monitor: High-performance sensing algorithm developed with Gemini.)*
* **🎨 賽博美學介面**：由 Gemini 協助調配出最具視覺衝擊力的霓虹色彩組合。
  *(Cyber Aesthetics: Neon color palettes tuned for visual impact by Gemini.)*
* **⚙️ 核心全自動化**：內建組件檢查，一鍵修復 `yt-dlp` 與 `FFmpeg`。
  *(Full Automation: One-click repair for yt-dlp and FFmpeg.)*
* **🌐 全球化支援**：支援繁體中文與英文，程式會自動讀取您的系統思維。
  *(Global Support: Supports Traditional Chinese and English auto-detection.)*

---

## 📦 技術堆棧 / Tech Stack

- **核心指令層 (Core)**: Rust (Tauri v2)
- **視覺呈現層 (Frontend)**: React 18 + Tailwind CSS
- **智慧大腦 (AI)**: Google Gemini AI (Responsible for 100% of code generation)

## 👨‍💻 核心團隊 / Team

* **總策劃 [CAIREN_TW] (臺灣人/Taiwanese) (https://github.com/yogo1234567) - 提供靈魂與設計方向 (The Soul & Vision).
* **首席架構師 (Architect)**: Google Gemini AI - 提供完美的邏輯與實作 (The Logic & Implementation).

---
*"Everything is possible when you have a vision and a powerful AI partner."*
