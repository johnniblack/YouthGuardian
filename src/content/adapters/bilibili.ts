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
    console.log('[parseBilibiliCard] 开始解析卡片');
    // 获取视频链接 - 支持多种情况
    let videoUrl = '';

    // 情况1: 新版B站使用 .bili-video-card__image--link
    let linkEl = card.querySelector('.bili-video-card__image--link') as HTMLAnchorElement;
    videoUrl = linkEl?.href || '';

    // 情况2: 搜索结果页 - 卡片本身是 <a> 标签
    if (!videoUrl && card instanceof HTMLAnchorElement) {
      videoUrl = card.href;
    }

    // 情况3: 搜索结果页 - 从卡片内的 <a> 标签获取链接
    if (!videoUrl) {
      linkEl = card.querySelector('a[href*="/video/"]') as HTMLAnchorElement;
      videoUrl = linkEl?.href || '';
    }

    // 规范化URL（B站链接可能是//www.bilibili.com格式）
    const normalizedUrl = videoUrl.startsWith('//') ? 'https:' + videoUrl : videoUrl;

    // 提取视频ID
    const videoIdMatch = normalizedUrl.match(/\/video\/([^/?]+)/);
    const videoId = videoIdMatch?.[1] || '';

    if (!videoId) return null;

    // 获取标题 - 多种方式适配过时和新版卡片
    let title = '';

    // 方式1: 从 .bili-video-card__info--tit 内的链接获取
    const titleLink = card.querySelector('.bili-video-card__info--tit a') as HTMLAnchorElement;
    if (titleLink) {
      title = titleLink.textContent?.trim() || '';
    }

    // 方式2: 直接从 .bili-video-card__info--tit 获取（搜索结果页）
    if (!title) {
      const titleEl = card.querySelector('.bili-video-card__info--tit');
      title = titleEl?.textContent?.trim() || '';
    }

    // 方式3: 从卡片顶部大链接的 title 属性或第一个链接的 title 属性
    if (!title) {
      const linkWithTitle = (card.querySelector('a[title*="宝宝"]') ||
                            card.querySelector('a[title]')) as HTMLAnchorElement | null;
      title = linkWithTitle?.title?.trim() || '';
    }

    if (!title) return null;

    // 获取UP主名 - 从 .bili-video-card__info--author 获取
    const authorNameEl = card.querySelector('.bili-video-card__info--author') as HTMLElement;
    const authorName = authorNameEl?.textContent?.trim() || '';

    // 获取UP主ID - 多途径尝试
    let authorId = '';
    let authorUrl = '';

    // 方法1: 从卡片元素或其子元素的 data 属性中提取
    authorId = (card as HTMLElement).getAttribute('data-mid') ||
              (card as HTMLElement).getAttribute('data-upid') ||
              authorNameEl?.getAttribute('data-mid') ||
              authorNameEl?.getAttribute('data-upid') || '';

    // 方法2: 尝试找 UP 主链接
    if (!authorId || !authorUrl) {
      // 2a. .bili-video-card__info--owner 本身就是链接
      let authorLinkEl = card.querySelector('.bili-video-card__info--owner') as HTMLAnchorElement | null;

      // 2b. 如果没有，尝试找任何 href 包含 /space/ 的链接
      if (!authorLinkEl) {
        authorLinkEl = card.querySelector('a[href*="/space/"]') as HTMLAnchorElement | null;
      }

      authorUrl = authorLinkEl?.href || '';

      // 从链接的 data 属性提取 ID
      if (!authorId && authorLinkEl) {
        authorId = authorLinkEl.getAttribute('data-mid') ||
                  authorLinkEl.getAttribute('data-upid') || '';
      }

      // 规范化URL格式（统一为 https: 前缀）
      if (authorUrl && !authorUrl.startsWith('http')) {
        authorUrl = authorUrl.startsWith('//') ? 'https:' + authorUrl : 'https://' + authorUrl;
      }

      // 从URL中提取authorId
      if (!authorId && authorUrl) {
        // B站UP主链接格式：https://space.bilibili.com/123456
        const authorIdMatch = authorUrl.match(/space\.bilibili\.com\/(\d+)/);
        authorId = authorIdMatch?.[1] || '';
      }
    }

    // 获取缩略图 - 从 picture 内的 source 标签提取
    let thumbnailUrl = '';
    const sourceEl = card.querySelector('.bili-video-card__cover source[srcset]') as HTMLSourceElement;
    if (sourceEl?.srcset) {
      // srcset 格式可能包含多个URL，取第一个
      const srcsetMatch = sourceEl.srcset.match(/^(.*?)(?:\s|$)/);
      thumbnailUrl = srcsetMatch?.[1] || '';
      // 确保是完整URL
      if (thumbnailUrl && !thumbnailUrl.startsWith('http')) {
        thumbnailUrl = thumbnailUrl.startsWith('//') ? 'https:' + thumbnailUrl : 'https://' + thumbnailUrl;
      }
    }

    // 如果没有从source获取，尝试从img标签获取
    if (!thumbnailUrl) {
      const imgEl = card.querySelector('.bili-video-card__cover img') as HTMLImageElement;
      thumbnailUrl = imgEl?.src || '';
    }

    const result: VideoItem = {
      id: videoId,
      platform: 'bilibili',
      title,
      authorName,
      authorId,
      authorUrl,
      videoUrl: normalizedUrl,
      thumbnailUrl
    };
    console.log('[parseBilibiliCard] 解析成功:', result.id, result.title);
    return result;
  } catch (e) {
    console.log('[parseBilibiliCard] 解析异常:', e);
    return null;
  }
}

/**
 * 扫描页面上可见的视频
 */
export function scanBilibiliVideos(container: HTMLElement): VideoItem[] {
  const videos: VideoItem[] = [];
  const seen = new Set<string>();

  // 选择器适配不同页面
  const selectors = [
    '.bili-video-card:not(.is-rcmd)',  // 排除推荐卡片的骨架屏
    '.bili-video-card.is-rcmd',        // 新版推荐流视频卡片
    '.video-item',
    '.video-card',
    '#video-list .video-item',
    '.channel-video-list .video-item'
  ];

  console.log('[scanBilibiliVideos] 开始扫描，选择器数量:', selectors.length);

  for (const selector of selectors) {
    try {
      const cards = Array.from(container.querySelectorAll(selector));
      console.log(`[scanBilibiliVideos] 选择器 "${selector}" 找到 ${cards.length} 张卡片`);

      for (const card of cards) {
        // 检查是否为真正的内容卡片（不是骨架屏）
        // .bili-video-card__wrap 是真实内容的容器，骨架屏时不会有这个元素显示
        const contentWrapper = card.querySelector('.bili-video-card__wrap');
        if (!contentWrapper) {
          console.log('[scanBilibiliVideos] 跳过骨架屏（无内容容器）');
          continue;
        }

        const video = parseBilibiliCard(card);
        if (video && video.id && !seen.has(video.id)) {
          console.log('[scanBilibiliVideos] 添加视频:', video.id, video.title);
          seen.add(video.id);
          videos.push(video);
        } else if (!video) {
          console.log('[scanBilibiliVideos] 解析失败，返回 null');
        }
      }
    } catch (e) {
      console.log(`[scanBilibiliVideos] 选择器 "${selector}" 出错:`, e);
    }
  }

  console.log('[scanBilibiliVideos] 扫描完成，找到', videos.length, '个视频');
  return videos;
}

/**
 * 扫描 Bilibili 搜索结果页
 */
export function scanSearchResults(): VideoItem[] {
  // 新版搜索页的结果容器选择器
  const container = document.querySelector(
    '.video-list, #search-result, .search-result, main, [role="main"]'
  ) || document.body;
  return scanBilibiliVideos(container as HTMLElement);
}

/**
 * 扫描 Bilibili 首页推荐
 */
export function scanHomeFeed(): VideoItem[] {
  const container = document.querySelector('.recommend-list, .home-recommend, #bili-recommend') || document.body;
  return scanBilibiliVideos(container as HTMLElement);
}
