# YouthGuardian 插件修复日志

## 修复内容

### 1. Service Worker 和 Content Script 通信错误处理

**问题**：
- Popup 向 Content Script 发送 `SCAN_VIDEOS` 消息时没有错误处理
- 当 Content Script 未加载或页面上下文无效时，导致未捕获的异常
- Content Script 消息监听器没有始终调用 `sendResponse`

**修复位置**：
- `src/popup/popup.ts` (第 413-423 行)：添加 try-catch 包装 `chrome.tabs.sendMessage` 调用
- `src/content/index.ts` (第 46-85 行)：改进消息监听器的错误处理和响应确保

**修复详情**：
```typescript
// 之前（未处理错误）
const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_VIDEOS' });

// 之后（添加错误处理）
let response: { videos: VideoItem[] } | undefined;
try {
  response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_VIDEOS' });
} catch (err) {
  console.error('Failed to send SCAN_VIDEOS message:', err);
  showVideoEmpty();
  return;
}
```

### 2. Content Script 初始化优化

**问题**：
- 使用 `setTimeout` 延迟初始化可能不可靠
- `DOMContentLoaded` 可能已在 `run_at: document_end` 时触发

**修复**：
```typescript
// 之前
document.addEventListener('DOMContentLoaded', async () => { ... });
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(async () => { ... }, 100);
}

// 之后
async function initializeFiltering() {
  try {
    await filterCurrentPage();
    observePageChanges();
  } catch (error) {
    console.error('Failed to initialize filtering:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFiltering);
} else {
  initializeFiltering();
}
```

### 3. Manifest 配置改进

**修复**：
- 添加 `default_title` 到 `action` 配置
- 确保正确指定 Service Worker 在 ESM 模块中

### 4. 消息监听器健壮性

**改进**：
- 所有消息监听器现在都被 try-catch 包装
- 所有消息类型都会调用 `sendResponse`
- 改进了 `RESTRICTION_CHANGED` 消息处理的异步特性

## 测试步骤

1. **重新加载插件**：
   - 进入 `chrome://extensions/`
   - 关闭并重新打开 YouthGuardian 插件

2. **验证 Service Worker**：
   - 检查 `chrome://extensions/` 中是否显示 Service Worker 状态正常

3. **验证功能**：
   - 访问 YouTube 或 Bilibili
   - 点击插件 Popup 的"重新扫描"按钮
   - 检查是否能正常加载视频列表

4. **查看控制台日志**：
   - 打开开发者工具（F12）
   - 检查 Console 日志以验证没有错误

## 相关文件变更

- `src/popup/popup.ts`：添加消息发送错误处理
- `src/content/index.ts`：改进消息监听和初始化逻辑
- `manifest.json`：添加 `default_title`、修复 manifest 结构
- 所有编译输出自动更新到 `dist/` 目录
