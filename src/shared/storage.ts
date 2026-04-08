// YouthGuardian 存储层
// 封装 chrome.storage.local 操作

import { AllowedChannel, Settings, PasswordMeta, STORAGE_KEYS } from './types';

/**
 * 获取允许频道列表
 */
export async function getAllowedChannels(): Promise<AllowedChannel[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ALLOWED_CHANNELS);
  return result[STORAGE_KEYS.ALLOWED_CHANNELS] || [];
}

/**
 * 保存允许频道列表
 */
export async function setAllowedChannels(channels: AllowedChannel[]): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.ALLOWED_CHANNELS]: channels
  });
}

/**
 * 获取全局设置
 */
export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return result[STORAGE_KEYS.SETTINGS] || {
    restrictionEnabled: false,
    passwordEnabled: false
  };
}

/**
 * 保存全局设置
 */
export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: settings
  });
}

/**
 * 获取密码元数据
 */
export async function getPasswordMeta(): Promise<PasswordMeta | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PASSWORD_META);
  return result[STORAGE_KEYS.PASSWORD_META] || null;
}

/**
 * 保存密码元数据
 */
export async function setPasswordMeta(meta: PasswordMeta): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.PASSWORD_META]: meta
  });
}
