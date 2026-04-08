// YouthTube 页面适配器
// 解析 YouTube 页面的视频卡片

import { VideoItem } from '../../shared/types';

/**
 * YouTube 视频卡片选择器
 */
const YOUTUBE_SELECTORS = {
  // 搜索结果页视频卡片
  videoRenderer: 'ytd-video-renderer, ytd-rich-item-renderer',
  // 视频信息
  title: 'h3 a#video-title, h3.ytd-video-name-link, a#video-title',
  author: 'ytd-channel-name a, #channel-name a, .ytd-channel-name a',
  authorInfo: '.ytd-channel-name, #channel-name',
  metadata: '.ytd-video-meta-block',
  duration: 'span.ytd-thumbnail-overlay-time-status-renderer, span.ytd-badge-supported-renderer',
  thumbnail: 'yt-img-shadow',
  link: 'a#video-title, h3 a'
};

/**
 * 从 YouTube 卡片中提取视频信息
 */
function parseVideoRenderer(card: Element): VideoItem | null {
  try {
    // 获取视频链接 - 新的 YouTube DOM 结构使用 yt-lockup-view-model
    let videoLinkEl = card.querySelector('a[href*="/watch?v="]') as HTMLAnchorElement;
    let title = '';
    let videoUrl = videoLinkEl?.href || '';

    // 从 URL 提取视频 ID
    const videoIdMatch = videoUrl.match(/[?&]v=([^&]+)/);
    const videoId = videoIdMatch?.[1] || '';

    if (!videoId) return null;

    // 获取标题 - 尝试多种选择器
    // 旧版：h3 a#video-title
    // 新版：yt-lockup-view-model 内部
    const titleSelectors = [
      'h3 a#video-title',
      'a#video-title',
      'yt-formatted-string#title',
      '.yt-lockup-view-model__title',
      '[aria-label*="video"]'
    ];

    for (const sel of titleSelectors) {
      const el = card.querySelector(sel);
      if (el?.textContent?.trim()) {
        title = el.textContent.trim();
        break;
      }
    }

    // 如果还是找不到，尝试从视频链接的 title 属性获取
    if (!title && videoLinkEl?.title) {
      title = videoLinkEl.title;
    }

    // 获取频道信息
    let authorName = '';
    let authorUrl = '';
    let authorId = '';
    let isPlaylist = false; // 是否是合辑视频

    // 检查是否是合辑/混剪视频（链接包含 list= 参数）
    if (videoUrl.includes('&list=') || videoUrl.includes('?list=')) {
      isPlaylist = true;
    }

    // 直接查找所有链接，筛选出频道链接（非视频链接）
    const allLinks = card.querySelectorAll('a');
    for (const link of Array.from(allLinks)) {
      const href = link.getAttribute('href') || '';
      const text = link.textContent?.trim() || '';
      // 跳过视频链接（包含 /watch?v= 或为空/外部链接）和空文本
      if (!href || !text) continue;
      // 排除外部链接和视频链接（可能有 &pp= 等参数）
      if (href.includes('/watch?v=') || href.includes('googleadservices.com')) continue;
      // 找到频道链接（/channel/ 或 /@ 或 /c/ 或 /user/）
      if (href.includes('/channel/') || href.includes('/@') || href.includes('/c/') || href.includes('/user/')) {
        authorUrl = href;
        authorName = text;
        // 提取频道 ID（如果有）
        const channelMatch = authorUrl.match(/\/channel\/([^/?]+)/);
        const userMatch = authorUrl.match(/\/user\/([^/?]+)/);
        authorId = channelMatch?.[1] || userMatch?.[1] || '';
        break;
      }
    }

    // 如果没找到，检查是否是合辑
    if (!authorName) {
      if (isPlaylist) {
        authorName = '合辑'; // 合辑视频没有频道
      } else {
        // 尝试从 lockup 组件获取
        const lockup = card.querySelector('.yt-lockup-view-model');
        if (lockup) {
          // 查找副标题中的链接
          const subtitleLink = lockup.querySelector('.yt-lockup-view-model__subtitle a');
          if (subtitleLink) {
            authorUrl = subtitleLink.getAttribute('href') || '';
            authorName = subtitleLink.textContent?.trim() || '';
          } else {
            // 直接从副标题获取文本
            const subtitle = lockup.querySelector('.yt-lockup-view-model__subtitle');
            if (subtitle) {
              authorName = subtitle.textContent?.trim() || '';
            }
          }
        }
      }
    }

    // 获取时长
    let duration = '';
    const durationSelectors = [
      'span.ytd-thumbnail-overlay-time-status-renderer',
      'yt-thumbnail-view-model .badge-time',
      '.ytp-time-duration'
    ];
    for (const sel of durationSelectors) {
      const el = card.querySelector(sel);
      if (el?.textContent?.trim()) {
        duration = el.textContent.trim();
        break;
      }
    }

    // 如果还是没有作者信息，从 lockup 组件尝试
    if (!authorName) {
      const lockup = card.querySelector('.yt-lockup-view-model');
      if (lockup) {
        const subtitle = lockup.querySelector('.yt-lockup-view-model__subtitle');
        if (subtitle) {
          const link = subtitle.querySelector('a');
          if (link) {
            authorUrl = link.getAttribute('href') || '';
            authorName = link.textContent?.trim() || '';
          } else {
            authorName = subtitle.textContent?.trim() || '';
          }
        }
      }
    }

    // 获取缩略图 URL
    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    return {
      id: videoId,
      platform: 'youtube',
      title,
      authorName,
      authorId,
      authorUrl,
      duration,
      videoUrl,
      thumbnailUrl
    };
  } catch {
    return null;
  }
}

/**
 * 扫描页面上可见的视频
 */
export function scanVisibleVideos(container: HTMLElement): VideoItem[] {
  const videos: VideoItem[] = [];
  const seen = new Set<string>();

  // 选择器适配不同页面
  const selectors = [
    'ytd-video-renderer',
    'ytd-rich-item-renderer',
    'ytd-shelf-renderer',
    '.ytp-video-list-item-renderer'
  ];

  for (const selector of selectors) {
    try {
      const cards = Array.from(container.querySelectorAll(selector));
      for (const card of cards) {
        const video = parseVideoRenderer(card);
        if (video && video.id && !seen.has(video.id)) {
          seen.add(video.id);
          videos.push(video);
        }
      }
    } catch {
      // 选择器可能无效，跳过
    }
  }

  return videos;
}

/**
 * 扫描 YouTube 搜索结果页
 */
export function scanSearchResults(): VideoItem[] {
  const container = document.getElementById('contents') || document.body;
  return scanVisibleVideos(container as HTMLElement);
}

/**
 * 扫描 YouTube 首页推荐
 */
export function scanHomeFeed(): VideoItem[] {
  const container = document.querySelector('ytd-rich-grid-renderer') || document.body;
  return scanVisibleVideos(container as HTMLElement);
}
