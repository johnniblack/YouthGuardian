# YouthGuardian BUG 修复总结

## 问题描述

YouTube 主页视频在 F5 刷新后无法被过滤，大量不在白名单的视频仍然显示。同时播放页右侧推荐列表也无法过滤。

## 根本原因

### 1. URL 匹配问题
- 原始代码使用 `href*="/watch?v=${video.id}"` 精确匹配
- 但 YouTube URL 常包含额外参数（如 `&t=`, `&list=`, `&pp=`），导致匹配失败
- 例如：`/watch?v=xxx&t=941s` 无法匹配 `/watch?v=xxx`

### 2. Shadow DOM 穿透问题
- `querySelector` 获取的链接元素在 Shadow DOM 内部
- `closest()` 无法穿透 Shadow Boundary 向上查找父元素
- 导致 `foundCount: 0`，视频卡片无法被隐藏

### 3. 播放页 DOM 结构差异
- 播放页右侧推荐列表使用 `yt-lockup-view-model` 作为容器
- 主页、搜索页使用 `ytd-rich-item-renderer`、`ytd-video-renderer`
- 不同页面结构需要不同的查找策略

## 解决方案

### 1. URL 匹配改用正则表达式
```typescript
// 旧代码
document.querySelector(`a[href*="/watch?v=${video.id}"]`)

// 新代码：遍历所有链接，用正则提取视频 ID
const videoIdRegex = /[?&]v=([^&]+)/;
const allLinks = document.querySelectorAll('a[href*="/watch?v="]');
for (const link of allLinks) {
  const href = link.getAttribute('href') || '';
  const match = href.match(videoIdRegex);
  if (match && match[1] === video.id) { ... }
}
```

### 2. 双策略查找（兼容主页和播放页）

**方法1**：链接 + `closest()`（适用于主页、搜索页）
```typescript
const allLinks = document.querySelectorAll('a[href*="/watch?v="]');
for (const link of allLinks) {
  const href = link.getAttribute('href') || '';
  const match = href.match(videoIdRegex);
  if (match && match[1] === video.id) {
    let parent = link.closest('ytd-rich-item-renderer');
    if (parent instanceof HTMLElement) results.push(parent);
    // 也尝试 ytd-video-renderer
    parent = link.closest('ytd-video-renderer');
    if (parent instanceof HTMLElement) results.push(parent);
  }
}
```

**方法2**：容器遍历（适用于播放页的 `yt-lockup-view-model`）
```typescript
// 如果方法1找不到，使用容器遍历方式
const containers = document.querySelectorAll('yt-lockup-view-model');
for (const container of containers) {
  const links = container.querySelectorAll('a[href*="/watch?v="]');
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    const match = href.match(videoIdRegex);
    if (match && match[1] === video.id) {
      results.push(container);
    }
  }
}
```

### 3. youtube.ts 扫描器更新
添加 `yt-lockup-view-model` 选择器以支持播放页：
```typescript
const selectors = [
  'ytd-video-renderer',
  'ytd-rich-item-renderer',
  'ytd-shelf-renderer',
  'yt-lockup-view-model',  // 视频播放页右侧推荐列表
  '.ytp-video-list-item-renderer'
];
```

## 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/content/observer.ts` | 重写 `findVideoElements` 函数，采用双策略查找 |
| `src/content/adapters/youtube.ts` | 添加 `yt-lockup-view-model` 选择器 |

## 验证结果

- [x] 主页视频过滤正常
- [x] 搜索页视频过滤正常
- [x] 播放页右侧推荐列表过滤正常
- [x] F5 刷新后过滤正常

## 经验总结

1. **不要过早优化**：先让代码工作，再针对特定问题优化
2. **页面结构差异**：主页、搜索页、播放页的 DOM 结构可能不同，需要针对性处理
3. **Shadow DOM**：Web Components 的 Shadow DOM 会阻止 `closest()` 穿透，需要改变查找策略
4. **URL 参数**：YouTube URL 经常包含额外参数，精确匹配会失败，必须用正则提取视频 ID
