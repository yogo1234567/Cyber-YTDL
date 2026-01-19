export interface VideoFormat {
  id: string;
  ext: string;
  resolution: string;
}

export interface VideoMetadata {
  title: string;
  thumbnail: string;
  formats: VideoFormat[]; 
}

export interface DownloadPayload {
  progress: number;
  speed?: string;
  eta?: string;
}

// [2026-01-19 新增] 用於懸浮窗通訊的數據結構
export interface FloatControlPayload {
  mode: 'OFF' | 'ON' | 'DL';
  progress: number;
  speed?: string;
  isDownloading: boolean;
}