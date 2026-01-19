import { invoke } from '@tauri-apps/api/core';
import { VideoMetadata } from '../types';

export const analyzeYouTubeUrl = async (url: string): Promise<VideoMetadata | null> => {
  try {
    // 這裡我們改用 Tauri 的 invoke 功能，去呼叫 Rust 後端，
    // 再由 Rust 轉向呼叫你的 Python 引擎
    const result = await invoke<VideoMetadata>('analyze_video', { url });
    return result;
  } catch (error) {
    console.error("解析失敗:", error);
    throw error;
  }
};