// YouthGuardian 类型定义
// 青少年视频网站白名单限制插件

// ==================== 基础类型 ====================

export type Platform = 'youtube' | 'bilibili';

// ==================== 数据模型 ====================

/**
 * 视频信息
 */
export interface VideoItem {
  id: string;
  platform: Platform;
  title: string;
  authorName: string;
  authorId?: string;
  authorUrl?: string;
  duration?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
}

/**
 * 允许的频道
 */
export interface AllowedChannel {
  id: string;
  platform: Platform;
  authorName: string;
  authorId?: string;
  authorUrl?: string;
  videoUrl?: string; // 合辑时用于精确匹配
  createdAt: number;
  source: 'manual' | 'page-detected';
}

/**
 * 全局设置
 */
export interface Settings {
  restrictionEnabled: boolean;
  passwordEnabled: boolean;
}

/**
 * 密码元数据
 */
export interface PasswordMeta {
  passwordHash: string;
  salt: string;
  updatedAt: number;
}

// ==================== 消息类型 ====================

// Popup -> Background
export type PopupToBackgroundMessage =
  | { type: 'GET_RESTRICTION_STATUS' }
  | { type: 'TOGGLE_RESTRICTION'; payload: { enabled: boolean; password: string } }
  | { type: 'GET_ALLOWED_CHANNELS' }
  | { type: 'ADD_CHANNEL'; payload: { channel: Omit<AllowedChannel, 'id' | 'createdAt' | 'source'> } }
  | { type: 'REMOVE_CHANNEL'; payload: { id: string; password: string } }
  | { type: 'CLEAR_CHANNELS'; payload: { password: string } }
  | { type: 'SET_PASSWORD'; payload: { password: string } }
  | { type: 'CHECK_PASSWORD_SET' };

// Background -> Popup
export type BackgroundToPopupMessage =
  | { restrictionEnabled: boolean }
  | { channels: AllowedChannel[] }
  | { success: boolean; error?: string }
  | { passwordEnabled: boolean };

// Content Script -> Background / Popup
export type ContentToBackgroundMessage =
  | { type: 'GET_RESTRICTION_STATUS' }
  | { type: 'RESTRICTION_CHANGED'; payload: { restrictionEnabled: boolean } };

// ==================== 存储 Keys ====================

export const STORAGE_KEYS = {
  ALLOWED_CHANNELS: 'allowed_channels',
  SETTINGS: 'settings',
  PASSWORD_META: 'password_meta'
} as const;
