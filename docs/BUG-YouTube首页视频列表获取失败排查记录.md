# BUG 排查记录：YouTube 首页视频列表获取失败

**日期**：2026-04-08
**问题**：YouTube 首页无法获取视频列表
**影响**：扩展无法扫描和过滤视频

---

## 问题现象

打开 YouTube 首页后，popup 显示"视频"列表为空，但页面明显有视频内容。

```
popup.ts:298 scan response: {videos: Array(0)}
```

---

## 排查过程

### 1. 确认 DOM 结构存在

在 YouTube 首页 Console 执行：

```javascript
document.querySelectorAll('ytd-rich-item-renderer').length
// 结果：24（说明 DOM 元素存在）
```

### 2. 发现 `data-video-id` 属性不存在

```javascript
const firstCard = document.querySelector('ytd-rich-item-renderer');
firstCard.getAttribute('data-video-id')
// 结果：null
```

**问题1**：`observer.ts` 中的 `findVideoElements` 使用 `ytd-rich-item-renderer[data-video-id="${video.id}"]` 选择器，但该属性不存在。

**修复**：改用 `a[href*="/watch?v=${video.id}"]` 通过链接查找，再 `closest('ytd-rich-item-renderer')` 向上查找父元素。

### 3. 发现选择器全部失效

```javascript
const selectors = [
  'h3 a#video-title',
  'a#video-title',
  'a#video-title-link',
  'h3.ytd-video-name-link',
  '.yt-simple-endpoint'
];
// 结果：全部不匹配
```

**问题2**：`youtube.ts` 中的 `parseVideoRenderer` 使用旧版选择器。

### 4. 分析实际 DOM 结构

第一个 `ytd-rich-item-renderer` 的 innerHTML：

```
ytd-rich-item-renderer
└─ div#content
   └─ yt-lockup-view-model
      └─ div.yt-lockup-view-model
         ├─ yt-touch-feedback-shape
         ├─ a.yt-lockup-view-model__content-image  ← 视频链接
         │   href="/watch?v=uCrq3x1DyOg&list=..."
         └─ ...（频道信息在更深层级）
```

**关键发现**：
- 旧结构：`ytd-rich-item-renderer > h3 > a#video-title`
- 新结构：`ytd-rich-item-renderer > div > yt-lockup-view-model > a.yt-lockup-view-model__content-image`

### 5. 修复 `parseVideoRenderer` 函数

改用以下策略获取视频信息：

```javascript
// 1. 视频链接：从 a[href*="/watch?v="] 获取
// 2. 视频 ID：从 URL 正则匹配 /[?&]v=([^&]+)/
// 3. 频道名：查找所有链接，筛选出 /channel/、/@、/c/、/user/ 格式的链接
// 4. 合辑判断：URL 包含 &list= 或 ?list= 参数
```

### 6. 频道名解析问题

部分视频显示"8:19"（时长）而非频道名。

**原因**：视频链接 URL 包含 `&pp=` 参数，如：
```
/watch?v=POE3hD2KMJA&pp=ugUEEgJ6aNIHCQnZCgGHKiGM7w%3D%3D
```

原来的检查 `href.includes('/watch?v=')` 只检查了基本格式，没有处理带 `&pp=` 参数的情况。

**修复**：增加 `href.includes('googleadservices.com')` 排除广告链接。

### 7. 合辑（Mix）视频

部分视频（如用户截图中的"合辑"）没有频道信息。

**分析**：合辑视频的 URL 包含 `list=` 参数，但没有单一频道。

**处理**：检测到 `&list=` 或 `?list=` 时，将频道名设为"合辑"。

---

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/content/observer.ts` | 修复 `findVideoElements`，改用链接查找而非 data-video-id 属性 |
| `src/content/adapters/youtube.ts` | 重写 `parseVideoRenderer`，适配新版 DOM 结构；支持 @ 格式频道；合辑视频显示"合辑" |
| `src/shared/types.ts` | `VideoItem` 增加 `thumbnailUrl` 字段 |
| `src/popup/popup.ts` | 显示视频缩略图 |
| `src/popup/popup.css` | 添加 `.video-thumbnail` 样式 |

---

## YouTube DOM 结构总结（2026-04）

### 首页视频卡片结构

```html
<ytd-rich-item-renderer>
  <div id="content">
    <yt-lockup-view-model>
      <div class="yt-lockup-view-model">
        <!-- 视频链接 -->
        <a class="yt-lockup-view-model__content-image"
           href="/watch?v=VIDEO_ID&list=...">
          <yt-thumbnail-view-model>...</yt-thumbnail-view-model>
        </a>
        <!-- 频道信息 -->
        <a class="..." href="/@ChannelName">频道名</a>
      </div>
    </yt-lockup-view-model>
  </div>
</ytd-rich-item-renderer>
```

### 关键选择器

| 用途 | 选择器 |
|------|--------|
| 视频链接 | `a[href*="/watch?v="]` |
| 频道链接 | `a[href*="/@"]` 或 `a[href*="/channel/"]` |
| 容器 | `ytd-rich-item-renderer` |

### 合辑判断

```javascript
videoUrl.includes('&list=') || videoUrl.includes('?list=')
```

---

## 经验总结

1. **YouTube DOM 结构经常变化**：选择器可能在新版本中失效
2. **data-video-id 属性**：部分组件有，部分没有，不能作为唯一标识
3. **链接查找更可靠**：视频 ID 在 URL 中，通过链接查找更稳定
4. **广告视频**：需要排除 googleadservices.com 链接
5. **特殊视频类型**：合辑、直播等没有单一频道，需要特殊处理

---

## 参考

- YouTube 首页选择器可能随版本更新，建议定期检查
- Agent Browser 工具可用于自动化测试页面结构
