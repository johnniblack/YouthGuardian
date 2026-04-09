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
  // 查找对应的视频卡片元素
  const videoElements = findVideoElements(video);

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

  for (const element of videoElements) {
    // 强制检查：即使 WeakSet 中有记录，如果 DOM 上没有属性标记，也重新处理一次
    if (processedElements.has(element) && element.getAttribute('data-youth-guardian-processed') === 'true') continue;

    // 如果是 WeakSet 中有但 DOM 没有标记的情况，从集合中移除，以便重新处理
    if (processedElements.has(element)) {
      processedElements.delete(element);
    }

    processedElements.add(element);

    element.setAttribute('data-youth-guardian-processed', 'true');

    // 直播视频特殊处理：只有在白名单中才放行，不在白名单就隐藏
    if (video.isLive) {
      element.style.display = isAllowed ? '' : 'none';
    } else {
      // 普通视频：不在白名单就隐藏
      element.style.display = isAllowed ? '' : 'none';
    }
  }
}

/**
 * 查找视频卡片元素
 */
function findVideoElements(video: VideoItem): HTMLElement[] {
  const platform = getCurrentPlatform();
  const results: HTMLElement[] = [];
  const videoIdRegex = /[?&]v=([^&]+)/;

  if (platform === 'youtube') {
    // 方法1：直接通过链接 + closest 查找（适用于主页、搜索页）
    // 遍历所有链接，用正则匹配视频 ID
    const allLinks = Array.from(document.querySelectorAll('a[href*="/watch?v="]')) as HTMLAnchorElement[];
    for (const link of allLinks) {
      const href = link.getAttribute('href') || '';
      const match = href.match(videoIdRegex);
      if (match && match[1] === video.id) {
        // 向上查找 ytd-rich-item-renderer 或 ytd-video-renderer
        let parent = link.closest('ytd-rich-item-renderer');
        if (parent instanceof HTMLElement) {
          results.push(parent);
        }
        if (!results.includes(parent as HTMLElement)) {
          parent = link.closest('ytd-video-renderer');
          if (parent instanceof HTMLElement) {
            results.push(parent);
          }
        }
        break;
      }
    }

    // 方法2：如果方法1找不到（播放页的 yt-lockup-view-model），用容器遍历方式
    if (results.length === 0) {
      const containers = Array.from(document.querySelectorAll('yt-lockup-view-model')) as HTMLElement[];
      for (const container of containers) {
        const links = container.querySelectorAll('a[href*="/watch?v="]');
        for (const link of Array.from(links)) {
          const href = link.getAttribute('href') || '';
          const match = href.match(videoIdRegex);
          if (match && match[1] === video.id) {
            results.push(container);
            break;
          }
        }
        if (results.length > 0) break;
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
 * 隐藏 YouTube 直播卡片（双保险）
 * 直接通过 DOM 特征检测正在直播的视频
 * 注意：这里只处理"正在直播"的情况，直播回放由 parseVideoRenderer 标记后通过 filterVideo 处理
 */
function hideYouTubeLiveStreams(): void {
  // 直播卡片特征：包含 .yt-spec-avatar-shape__live-badge 或 .yt-live-badge
  // 注意：这里只隐藏正在直播的卡片，直播回放（已结束的直播）由 filterVideo 的白名单逻辑处理
  const liveSelectors = [
    '.yt-spec-avatar-shape__live-badge', // 直播徽章（正在直播）
    'yt-live-badge',                     // 直播标签
  ];

  for (const selector of liveSelectors) {
    const liveElements = Array.from(document.querySelectorAll(selector));
    for (const el of liveElements) {
      // 向上查找 ytd-rich-item-renderer 或 ytd-video-renderer 父元素
      const card = el.closest('ytd-rich-item-renderer, ytd-video-renderer');
      if (card instanceof HTMLElement && !processedElements.has(card)) {
        processedElements.add(card);
        card.setAttribute('data-youth-guardian-live', 'true');
        card.style.display = 'none';
      }
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

  // YouTube 首页或播放页检测
  const isYouTube = getCurrentPlatform() === 'youtube';
  const isYouTubeHome = isYouTube && !!document.querySelector('ytd-rich-grid-renderer');
  const isYouTubeWatch = isYouTube && !!document.querySelector('ytd-watch-flexy');

  for (const video of videos) {
    filterVideo(video, allowedChannels);
  }

  // 增加 YouTube 首页或播放页兜底重试机制
  if (isYouTubeHome || isYouTubeWatch) {
    setTimeout(() => {
      console.log(`[YouthGuardian] 执行 YouTube ${isYouTubeHome ? '首页' : '播放页'}兜底扫描...`);
      const retryVideos = scanFn(document.body);
      for (const video of retryVideos) {
        filterVideo(video, allowedChannels);
      }
    }, 1000);
  }

  // B站 特别处理
  if (getCurrentPlatform() === 'bilibili') {
    hideLiveStreams();
    hideNonVideoContent();
  }

  // YouTube 特别处理 - 直接隐藏直播卡片和自动合辑播放列表（双保险）
  if (getCurrentPlatform() === 'youtube') {
    hideYouTubeLiveStreams();
    hideYouTubePlaylists();
  }
}

/**
 * 隐藏 YouTube 自动合辑列表
 */
function hideYouTubePlaylists(): void {
  const playlistSelectors = [
    'ytd-playlist-panel-renderer',    // 播放页右侧自动播放列表
    'ytd-compact-autoplay-renderer'   // 部分旧版或不同类型的自动播放组件
  ];

  for (const selector of playlistSelectors) {
    const playlists = Array.from(document.querySelectorAll(selector));
    for (const playlist of playlists) {
      if (playlist instanceof HTMLElement) {
        playlist.style.setProperty('display', 'none', 'important');
        playlist.setAttribute('data-youth-guardian-playlist', 'true');

        if (!processedElements.has(playlist)) {
          processedElements.add(playlist);
        }
      }
    }
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
