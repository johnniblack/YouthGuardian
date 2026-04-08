// YouthGuardian 内容脚本入口
// 页面扫描、过滤、DOM 监听

import { VideoItem } from '../shared/types';
import { getSettings } from '../shared/storage';
import { getAllowedChannelsList } from '../shared/whitelist';
import { getCurrentPlatform } from '../shared/platform';
import { scanVisibleVideos } from './adapters/youtube';
import { scanBilibiliVideos } from './adapters/bilibili';
import { filterVideo, observePageChanges } from './observer';

// 当前平台
const platform = getCurrentPlatform();

// 选择对应的扫描函数
function getScanFunction(): (container: HTMLElement) => VideoItem[] {
  switch (platform) {
    case 'youtube':
      return scanVisibleVideos;
    case 'bilibili':
      return scanBilibiliVideos;
    default:
      return () => [];
  }
}

// 过滤当前页面所有视频
async function filterCurrentPage(): Promise<void> {
  const settings = await getSettings();

  if (!settings.restrictionEnabled) {
    return;
  }

  const allowedChannels = await getAllowedChannelsList();
  const container = document.body;
  const scanFn = getScanFunction();

  const videos = scanFn(container);

  for (const video of videos) {
    filterVideo(video, allowedChannels);
  }
}

// 监听限制状态变化和扫描请求
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === 'PING') {
      sendResponse({ pong: true });
      return true;
    }

    if (message.type === 'RESTRICTION_CHANGED') {
      if (message.payload.restrictionEnabled) {
        filterCurrentPage().catch(err => console.error('Filter error:', err));
      } else {
        // 解除限制，显示所有内容
        document.querySelectorAll('[data-youth-guardian-processed="true"]').forEach(el => {
          (el as HTMLElement).style.display = '';
          el.removeAttribute('data-youth-guardian-processed');
        });
        // 显示直播卡片
        document.querySelectorAll('[data-youth-guardian-live="true"]').forEach(el => {
          (el as HTMLElement).style.display = '';
          el.removeAttribute('data-youth-guardian-live');
        });
        // 显示非视频内容（番剧、话题等）
        document.querySelectorAll('[data-youth-guardian-non-video="true"]').forEach(el => {
          (el as HTMLElement).style.display = '';
          el.removeAttribute('data-youth-guardian-non-video');
        });
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'SCAN_VIDEOS') {
      // 扫描当前页面的视频
      const scanFn = getScanFunction();
      const videos = scanFn(document.body);
      sendResponse({ videos });
      return true;
    }

    sendResponse({ error: 'Unknown message type' });
  } catch (error) {
    console.error('Message handler error:', error);
    try {
      sendResponse({ error: String(error) });
    } catch (e) {
      // Ignore errors sending error response
    }
  }
});

// 页面加载完成后执行初始过滤
async function initializeFiltering() {
  try {
    await filterCurrentPage();
    observePageChanges();
  } catch (error) {
    console.error('Failed to initialize filtering:', error);
  }
}

// 使用 readyState 检查来确定何时初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFiltering);
} else {
  // DOM 已经加载
  initializeFiltering();
}

// 导出给 popup 调用
export { filterCurrentPage };
