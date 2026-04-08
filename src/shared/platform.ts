// YouthGuardian 平台检测工具
// 检测当前页面是 YouTube、Bilibili 还是不支持的网站

import { Platform } from './types';

/**
 * 平台检测结果
 */
export interface PlatformInfo {
  platform: Platform | 'unsupported';
  isSupported: boolean;
}

/**
 * 从 URL 检测平台
 */
export function detectPlatformFromUrl(url: string): PlatformInfo {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return { platform: 'youtube', isSupported: true };
  }

  if (url.includes('bilibili.com')) {
    return { platform: 'bilibili', isSupported: true };
  }

  return { platform: 'unsupported', isSupported: false };
}

/**
 * 从当前标签页检测平台
 */
export async function detectPlatform(): Promise<PlatformInfo> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url) {
    return { platform: 'unsupported', isSupported: false };
  }

  return detectPlatformFromUrl(tab.url);
}

/**
 * 检测页面是否支持内容脚本
 */
export function isPageSupported(): boolean {
  return typeof window !== 'undefined' && (
    window.location.hostname.includes('youtube.com') ||
    window.location.hostname.includes('bilibili.com')
  );
}

/**
 * 获取当前页面平台
 */
export function getCurrentPlatform(): Platform | 'unsupported' {
  const hostname = window.location.hostname;

  if (hostname.includes('youtube.com')) {
    return 'youtube';
  }

  if (hostname.includes('bilibili.com')) {
    return 'bilibili';
  }

  return 'unsupported';
}
