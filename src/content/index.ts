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
  if (message.type === 'RESTRICTION_CHANGED') {
    if (message.payload.restrictionEnabled) {
      filterCurrentPage();
    } else {
      // 解除限制，显示所有视频
      document.querySelectorAll('[data-youth-guardian-processed="true"]').forEach(el => {
        (el as HTMLElement).style.display = '';
        el.removeAttribute('data-youth-guardian-processed');
      });
    }
  }

  if (message.type === 'SCAN_VIDEOS') {
    // 扫描当前页面的视频
    const scanFn = getScanFunction();
    const videos = scanFn(document.body);
    sendResponse({ videos });
    return true;
  }
});

// 页面加载完成后执行初始过滤
document.addEventListener('DOMContentLoaded', async () => {
  await filterCurrentPage();
  observePageChanges();
});

// 如果 DOM 已经加载完成，立即执行
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(async () => {
    await filterCurrentPage();
    observePageChanges();
  }, 100);
}

// 导出给 popup 调用
export { filterCurrentPage };
