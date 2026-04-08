// YouthGuardian MutationObserver 监听器
// 监听 DOM 变化，对新增视频卡片进行过滤

import { VideoItem, AllowedChannel } from '../shared/types';
import { getSettings } from '../shared/storage';
import { getAllowedChannelsList } from '../shared/whitelist';
import { getCurrentPlatform } from '../shared/platform';
import { scanVisibleVideos } from './adapters/youtube';
import { scanBilibiliVideos } from './adapters/bilibili';

// 节流定时器
let throttleTimer: ReturnType<typeof setTimeout> | null = null;
const THROTTLE_DELAY = 300;

// 已处理的元素集合（用于避免重复处理）
const processedElements = new WeakSet<Element>();

/**
 * 选择对应的扫描函数
 */
function getScanFunction(): (container: HTMLElement) => VideoItem[] {
  const platform = getCurrentPlatform();
  switch (platform) {
    case 'youtube':
      return scanVisibleVideos;
    case 'bilibili':
      return scanBilibiliVideos;
    default:
      return () => [];
  }
}

/**
 * 过滤单个视频
 */
export function filterVideo(video: VideoItem, allowedChannels: AllowedChannel[]): void {
  // 检查是否在白名单中
  const isAllowed = allowedChannels.some(channel => {
    if (channel.platform !== video.platform) return false;

    // 优先精确匹配 videoUrl（合辑/特殊视频）
    if (channel.videoUrl && video.videoUrl && channel.videoUrl === video.videoUrl) return true;
    if (channel.authorId && channel.authorId === video.authorId) return true;
    if (channel.authorUrl && channel.authorUrl === video.authorUrl) return true;
    // 合辑没有 authorId/authorUrl，只精确匹配 videoUrl
    if (video.authorName === '合辑') return false;
    if (channel.authorName === video.authorName) return true;

    return false;
  });

  // 找到对应的视频卡片元素并隐藏
  const videoElements = findVideoElements(video);

  for (const element of videoElements) {
    if (processedElements.has(element)) continue;
    processedElements.add(element);

    element.setAttribute('data-youth-guardian-processed', 'true');
    element.style.display = isAllowed ? '' : 'none';
  }
}

/**
 * 查找视频卡片元素
 * 这个函数需要根据平台选择器来查找
 */
function findVideoElements(video: VideoItem): HTMLElement[] {
  const platform = getCurrentPlatform();
  const results: HTMLElement[] = [];

  if (platform === 'youtube') {
    // YouTube 视频卡片选择器
    // 注意：ytd-rich-item-renderer 本身没有 data-video-id 属性，需要通过链接查找
    // 找到包含视频链接的元素，然后向上查找 ytd-rich-item-renderer 父元素
    const watchLink = document.querySelector(`a[href*="/watch?v=${video.id}"]`) as HTMLAnchorElement;
    if (watchLink) {
      // 向上查找 ytd-rich-item-renderer 父元素
      let parent = watchLink.closest('ytd-rich-item-renderer');
      if (parent instanceof HTMLElement) {
        results.push(parent);
      }
      // 也可能是 ytd-video-renderer
      if (!parent) {
        parent = watchLink.closest('ytd-video-renderer');
        if (parent instanceof HTMLElement) {
          results.push(parent);
        }
      }
    }
    // 通过频道名查找（备用）
    if (results.length === 0 && video.authorName) {
      const channelEls = Array.from(document.querySelectorAll(`[data-author-name="${video.authorName}"]`));
      for (const el of channelEls) {
        const parent = el.closest('ytd-rich-item-renderer') || el.closest('ytd-video-renderer');
        if (parent instanceof HTMLElement) {
          results.push(parent);
        }
      }
    }
  } else if (platform === 'bilibili') {
    // Bilibili 视频卡片选择器
    const selectors = [
      `.bili-video-card[data-id="${video.id}"]`,
      `.video-item a[href*="/video/${video.id}"]`,
      `[data-aid="${video.id}"]`
    ];

    for (const selector of selectors) {
      try {
        const elements = Array.from(document.querySelectorAll(selector));
        for (const el of elements) {
          if (el instanceof HTMLElement) {
            results.push(el);
          }
        }
      } catch {
        // 无效选择器，跳过
      }
    }
  }

  return results;
}

/**
 * 过滤新增的节点
 */
async function filterNewNodes(): Promise<void> {
  const settings = await getSettings();

  if (!settings.restrictionEnabled) {
    return;
  }

  const allowedChannels = await getAllowedChannelsList();
  const scanFn = getScanFunction();

  // 扫描整个页面
  const videos = scanFn(document.body);

  for (const video of videos) {
    filterVideo(video, allowedChannels);
  }
}

/**
 * 节流处理
 */
function throttleFilter(): void {
  if (throttleTimer) {
    clearTimeout(throttleTimer);
  }

  throttleTimer = setTimeout(() => {
    filterNewNodes();
    throttleTimer = null;
  }, THROTTLE_DELAY);
}

/**
 * 开始监听页面变化
 */
export function observePageChanges(): void {
  const observer = new MutationObserver((mutations) => {
    // 检查是否有新增节点
    const hasNewNodes = mutations.some(mutation => mutation.addedNodes.length > 0);

    if (hasNewNodes) {
      throttleFilter();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}
