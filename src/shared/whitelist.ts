// YouthGuardian 白名单匹配逻辑
// 三级降级策略：authorId > authorUrl > authorName

import { AllowedChannel, Platform } from './types';
import { getAllowedChannels, setAllowedChannels } from './storage';

/**
 * 对字符串进行简单哈希（用于生成短ID）
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * 生成频道唯一ID
 * 三级降级策略：
 * 1. platform + authorId
 * 2. platform + authorUrl（哈希）
 * 3. platform + authorName（哈希）
 */
export function generateChannelId(channel: Partial<AllowedChannel>): string {
  const platform = channel.platform;

  if (channel.authorId) {
    return `${platform}_id_${channel.authorId}`;
  }

  if (channel.authorUrl) {
    return `${platform}_url_${hashString(channel.authorUrl)}`;
  }

  return `${platform}_name_${hashString(channel.authorName || '')}`;
}

/**
 * 检查频道是否在白名单中
 */
export async function isChannelAllowed(channel: Partial<AllowedChannel>): Promise<boolean> {
  const channels = await getAllowedChannels();
  const id = generateChannelId(channel);
  return channels.some(c => c.id === id);
}

/**
 * 添加频道到白名单
 */
export async function addChannel(
  channel: Omit<AllowedChannel, 'id' | 'createdAt' | 'source'>
): Promise<AllowedChannel> {
  const channels = await getAllowedChannels();
  const id = generateChannelId(channel);

  // 检查是否已存在
  const exists = channels.some(c => c.id === id);
  if (exists) {
    return channels.find(c => c.id === id)!;
  }

  const newChannel: AllowedChannel = {
    ...channel,
    id,
    createdAt: Date.now(),
    source: 'manual'
  };

  channels.push(newChannel);
  await setAllowedChannels(channels);

  return newChannel;
}

/**
 * 从白名单删除频道
 */
export async function removeChannel(id: string): Promise<void> {
  const channels = await getAllowedChannels();
  const filtered = channels.filter(c => c.id !== id);
  await setAllowedChannels(filtered);
}

/**
 * 清空全部白名单
 */
export async function clearAllChannels(): Promise<void> {
  await setAllowedChannels([]);
}

/**
 * 获取所有白名单频道
 */
export async function getAllowedChannelsList(): Promise<AllowedChannel[]> {
  return getAllowedChannels();
}

/**
 * 按平台筛选白名单
 */
export async function getAllowedChannelsByPlatform(platform: Platform): Promise<AllowedChannel[]> {
  const channels = await getAllowedChannels();
  return channels.filter(c => c.platform === platform);
}
