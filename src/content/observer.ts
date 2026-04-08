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
    // 方法1：通过视频链接找到卡片容器（推荐）
    const watchLink = document.querySelector(`a[href*="/video/${video.id}"]`) as HTMLAnchorElement;
    if (watchLink) {
      // 优先查找 .bili-video-card 容器（传统视频卡片）
      let parent = watchLink.closest('.bili-video-card');
      if (parent instanceof HTMLElement) {
        results.push(parent);
      } else {
        // 备选：如果卡片本身是 <a> 标签（搜索结果页），则直接使用
        if (watchLink instanceof HTMLElement && watchLink.href.includes(`/video/${video.id}`)) {
          results.push(watchLink);
        }
      }
    }

    // 方法2：通过 authorId 查找该UP主的所有视频卡片
    if (results.length === 0 && video.authorId) {
      // 搜索传统卡片
      const cards = Array.from(document.querySelectorAll('.bili-video-card')) as HTMLElement[];
      for (const card of cards) {
        const authorLink = card.querySelector(
          `a[href*="/space/${video.authorId}"], [data-mid="${video.authorId}"]`
        );
        if (authorLink) {
          results.push(card);
        }
      }

      // 搜索搜索结果页卡片
      if (results.length === 0) {
        const searchCards = Array.from(
          document.querySelectorAll(`a[href*="/video/"][target="_blank"]`)
        ) as HTMLAnchorElement[];
        for (const card of searchCards) {
          const authorLink = card.querySelector(
            `a[href*="/space/${video.authorId}"], [data-mid="${video.authorId}"]`
          );
          if (authorLink) {
            results.push(card);
          }
        }
      }
    }

    // 方法3：通过频道名查找（备用）
    if (results.length === 0 && video.authorName) {
      // 搜索传统卡片
      const cards = Array.from(document.querySelectorAll('.bili-video-card')) as HTMLElement[];
      for (const card of cards) {
        const authorEl = card.querySelector('.bili-video-card__info--author');
        if (authorEl?.textContent?.includes(video.authorName)) {
          results.push(card);
        }
      }

      // 搜索搜索结果页卡片
      if (results.length === 0) {
        const searchCards = Array.from(
          document.querySelectorAll(`a[href*="/video/"][target="_blank"]`)
        ) as HTMLAnchorElement[];
        for (const card of searchCards) {
          const authorEl = card.querySelector('.bili-video-card__info--author');
          if (authorEl?.textContent?.includes(video.authorName)) {
            results.push(card);
          }
        }
      }
    }
  }

  return results;
}

/**
 * 隐藏 B站 直播卡片
 */
function hideLiveStreams(): void {
  // 找到所有直播链接
  const liveLinks = Array.from(
    document.querySelectorAll('a[href*="live.bilibili.com/"]')
  ) as HTMLAnchorElement[];

  for (const link of liveLinks) {
    // 向上查找卡片容器，尝试多种可能的选择器
    let container: Element | null = null;

    // 尝试 1: .floor-single-card (较旧的直播卡片格式)
    container = link.closest('.floor-single-card');

    // 尝试 2: .bili-live-card (新的推荐流直播卡片格式)
    if (!container) {
      container = link.closest('.bili-live-card');
    }

    // 尝试 3: .bili-feed-card (直播卡片外层容器)
    if (!container) {
      container = link.closest('.bili-feed-card');
    }

    // 尝试 4: 向上查找任何包含 data-v-* 的容器再找 card
    if (!container) {
      const parent = link.closest('[data-v-d3a529ce]');
      if (parent) {
        container = parent.closest('[class*="card"]');
      }
    }

    if (container instanceof HTMLElement) {
      if (!processedElements.has(container)) {
        processedElements.add(container);
        container.setAttribute('data-youth-guardian-live', 'true');
        container.style.display = 'none';
      }
    }
  }
}

/**
 * 隐藏 B站 非视频内容（番剧、话题等）
 */
function hideNonVideoContent(): void {
  // 查找所有单卡片容器
  const cards = Array.from(document.querySelectorAll('.floor-single-card')) as HTMLElement[];

  for (const card of cards) {
    // 检查卡片内是否有视频链接（/video/ 路径）
    const videoLink = card.querySelector('a[href*="/video/"]');

    // 检查是否已被处理过（已通过白名单过滤）
    const alreadyProcessed = card.getAttribute('data-youth-guardian-processed') === 'true';

    // 如果不是视频卡片，也不是已处理过的直播卡片，就隐藏
    if (!videoLink && !alreadyProcessed && !processedElements.has(card)) {
      processedElements.add(card);
      card.setAttribute('data-youth-guardian-non-video', 'true');
      card.style.display = 'none';
    }
  }
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

  // B站 特别处理
  if (getCurrentPlatform() === 'bilibili') {
    hideLiveStreams();
    hideNonVideoContent();
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
