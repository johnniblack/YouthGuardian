// Bilibili 页面适配器
// 解析 Bilibili 页面的视频卡片

import { VideoItem } from '../../shared/types';

/**
 * Bilibili 视频卡片选择器
 */
const BILIBILI_SELECTORS = {
  // 视频卡片容器
  videoCard: '.bili-video-card, .video-item, .video-card',
  // 标题
  title: '.bili-video-card__info--title a, .video-item a, .video-card a',
  // UP主
  author: '.bili-video-card__info--author, .video-item__owner .name, .up-name',
  // 时长
  duration: '.bili-video-card__info--duration, .video-item .duration',
  // 链接
  link: 'a[href*="/video/"]'
};

/**
 * 从 Bilibili 卡片中提取视频信息
 */
function parseBilibiliCard(card: Element): VideoItem | null {
  try {
    // 获取标题和链接
    const titleEl = card.querySelector('a[href*="/video/"]') as HTMLAnchorElement;
    const title = titleEl?.textContent?.trim() ||
                  card.querySelector('.bili-video-card__info--title')?.textContent?.trim() || '';

    if (!title) return null;

    // 获取视频ID
    const videoUrl = titleEl?.href || '';
    const videoIdMatch = videoUrl.match(/\/video\/([^/?]+)/);
    const videoId = videoIdMatch?.[1] || '';

    // 获取UP主名
    const authorEl = card.querySelector('.bili-video-card__info--author, .up-name, .author') as HTMLElement;
    const authorName = authorEl?.textContent?.trim() || '';

    // 获取UP主主页链接
    const authorLinkEl = card.querySelector('.bili-video-card__info--author a, a.up-name, a[href*="/channel/"]') as HTMLAnchorElement;
    const authorUrl = authorLinkEl?.href || '';

    // 获取UP主ID（从URL提取mid）
    const authorIdMatch = authorUrl.match(/\/mid\/([^/?]+)/);
    const authorId = authorIdMatch?.[1] || '';

    // 获取时长
    const durationEl = card.querySelector('.bili-video-card__info--duration, .duration, .video-time');
    const duration = durationEl?.textContent?.trim() || '';

    return {
      id: videoId,
      platform: 'bilibili',
      title,
      authorName,
      authorId,
      authorUrl,
      duration,
      videoUrl
    };
  } catch {
    return null;
  }
}

/**
 * 扫描页面上可见的视频
 */
export function scanBilibiliVideos(container: HTMLElement): VideoItem[] {
  const videos: VideoItem[] = [];

  // 选择器适配不同页面
  const selectors = [
    '.bili-video-card',
    '.video-item',
    '.video-card',
    '#video-list .video-item',
    '.channel-video-list .video-item'
  ];

  for (const selector of selectors) {
    try {
      const cards = Array.from(container.querySelectorAll(selector));
      for (const card of cards) {
        const video = parseBilibiliCard(card);
        if (video && video.id) {
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
 * 扫描 Bilibili 搜索结果页
 */
export function scanSearchResults(): VideoItem[] {
  const container = document.querySelector('.video-list, #search-result, .search-result') || document.body;
  return scanBilibiliVideos(container as HTMLElement);
}

/**
 * 扫描 Bilibili 首页推荐
 */
export function scanHomeFeed(): VideoItem[] {
  const container = document.querySelector('.recommend-list, .home-recommend, #bili-recommend') || document.body;
  return scanBilibiliVideos(container as HTMLElement);
}
