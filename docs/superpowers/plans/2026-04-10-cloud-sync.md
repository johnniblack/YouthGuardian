# 频道白名单云端同步功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现基于 chrome.storage.sync 的频道白名单云端永久保存功能，解决插件删除重装后数据丢失问题。

**Architecture:**
- `chrome.storage.sync` 作为权威数据源，所有频道读写操作都基于它
- `chrome.storage.local` 作为离线缓存，在 sync 不可用时提供备用读取
- 插件初始化时自动检查并同步 sync 数据到 local
- UI 右上角显示云端同步状态（已同步/未同步/同步失败）

**Tech Stack:** TypeScript, Chrome Extension API (chrome.storage.sync), Popup UI

---

## 文件变更映射

| 文件 | 变更类型 | 职责 |
|------|----------|------|
| `src/shared/types.ts` | 修改 | 新增 SyncMetadata 类型 |
| `src/shared/storage.ts` | 修改 | 新增 sync 读写方法 |
| `src/shared/whitelist.ts` | 修改 | 集成 sync 同步逻辑 |
| `src/popup/popup.html` | 修改 | 增加同步状态 DOM |
| `src/popup/popup.css` | 修改 | 增加同步状态样式 |
| `src/popup/popup.ts` | 修改 | 集成同步状态显示逻辑 |

---

## Task 1: 类型定义扩展

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: 添加 SyncMetadata 类型定义**

在 `STORAGE_KEYS` 后添加：

```typescript
/**
 * 同步元数据
 */
export interface SyncMetadata {
  lastSyncedAt: number;  // 最后同步时间戳
  version: number;       // 同步版本号
}
```

在 `STORAGE_KEYS` 中添加：

```typescript
export const STORAGE_KEYS = {
  ALLOWED_CHANNELS: 'allowed_channels',
  SETTINGS: 'settings',
  PASSWORD_META: 'password_meta',
  SYNC_METADATA: 'sync_metadata'  // 新增
} as const;
```

- [ ] **Step 2: 验证类型编译**

Run: `npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 3: 提交**

```bash
git add src/shared/types.ts
git commit -m "feat(sync): 添加 SyncMetadata 类型定义"
```

---

## Task 2: 存储层同步方法

**Files:**
- Modify: `src/shared/storage.ts`

- [ ] **Step 1: 添加 chrome.storage.sync 可用性检查函数**

在文件开头添加：

```typescript
/**
 * 检查 chrome.storage.sync 是否可用
 */
export async function isSyncAvailable(): Promise<boolean> {
  try {
    await chrome.storage.sync.get(['allowed_channels']);
    return true;
  } catch (error) {
    console.error('[Storage] chrome.storage.sync 不可用:', error);
    return false;
  }
}
```

- [ ] **Step 2: 添加从 sync 读取频道的方法**

```typescript
/**
 * 从 chrome.storage.sync 获取允许频道列表
 */
export async function getAllowedChannelsFromSync(): Promise<AllowedChannel[]> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.ALLOWED_CHANNELS);
    return result[STORAGE_KEYS.ALLOWED_CHANNELS] || [];
  } catch (error) {
    console.error('[Storage] 从 sync 读取失败:', error);
    return [];
  }
}
```

- [ ] **Step 3: 添加写入 sync 的方法**

```typescript
/**
 * 保存允许频道列表到 chrome.storage.sync
 */
export async function setAllowedChannelsToSync(channels: AllowedChannel[]): Promise<void> {
  try {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.ALLOWED_CHANNELS]: channels
    });
  } catch (error) {
    console.error('[Storage] 写入 sync 失败:', error);
    throw error;
  }
}
```

- [ ] **Step 4: 添加同步元数据操作方法**

```typescript
/**
 * 获取同步元数据
 */
export async function getSyncMetadata(): Promise<SyncMetadata | null> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.SYNC_METADATA);
    return result[STORAGE_KEYS.SYNC_METADATA] || null;
  } catch (error) {
    console.error('[Storage] 读取 sync 元数据失败:', error);
    return null;
  }
}

/**
 * 保存同步元数据
 */
export async function setSyncMetadata(metadata: SyncMetadata): Promise<void> {
  try {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.SYNC_METADATA]: metadata
    });
  } catch (error) {
    console.error('[Storage] 写入 sync 元数据失败:', error);
  }
}
```

- [ ] **Step 5: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 6: 提交**

```bash
git add src/shared/storage.ts
git commit -m "feat(sync): 添加 chrome.storage.sync 读写方法"
```

---

## Task 3: 白名单模块集成同步

**Files:**
- Modify: `src/shared/whitelist.ts`

- [ ] **Step 1: 更新 import 语句，添加新方法**

修改 import：

```typescript
import {
  getAllowedChannels,
  setAllowedChannels,
  getAllowedChannelsFromSync,
  setAllowedChannelsToSync,
  getSyncMetadata,
  setSyncMetadata,
  isSyncAvailable
} from './storage';
```

- [ ] **Step 2: 修改 addChannel 函数，同时写入 sync**

找到 `addChannel` 函数，修改为：

```typescript
export async function addChannel(
  channel: Omit<AllowedChannel, 'id' | 'createdAt' | 'source'>
): Promise<AllowedChannel> {
  const channels = await getAllowedChannelsFromSync(); // 优先从 sync 读取
  const id = generateChannelId(channel);

  const exists = channels.some(c => c.id === id);
  if (exists) {
    return channels.find(c => c.id === id)!;
  }

  const newChannel: AllowedChannel = {
    ...channel,
    id,
    createdAt: Date.now(),
    source: 'manual'
  };

  channels.push(newChannel);

  // 同时写入 local 和 sync
  await setAllowedChannels(channels);
  await setAllowedChannelsToSync(channels);
  await setSyncMetadata({ lastSyncedAt: Date.now(), version: 1 });

  return newChannel;
}
```

- [ ] **Step 3: 修改 removeChannel 函数，同时删除 sync**

找到 `removeChannel` 函数，修改为：

```typescript
export async function removeChannel(id: string): Promise<void> {
  const channels = await getAllowedChannelsFromSync();
  const filtered = channels.filter(c => c.id !== id);

  // 同时更新 local 和 sync
  await setAllowedChannels(filtered);
  await setAllowedChannelsToSync(filtered);
  await setSyncMetadata({ lastSyncedAt: Date.now(), version: 1 });
}
```

- [ ] **Step 4: 修改 clearAllChannels 函数，同时清空 sync**

找到 `clearAllChannels` 函数，修改为：

```typescript
export async function clearAllChannels(): Promise<void> {
  // 同时清空 local 和 sync
  await setAllowedChannels([]);
  await setAllowedChannelsToSync([]);
  await setSyncMetadata({ lastSyncedAt: Date.now(), version: 1 });
}
```

- [ ] **Step 5: 添加初始化同步函数**

在文件末尾添加：

```typescript
/**
 * 初始化同步 - 插件打开时调用
 * 从 sync 同步数据到 local
 */
export async function initSync(): Promise<'synced' | 'unsynced' | 'failed'> {
  const syncAvailable = await isSyncAvailable();
  if (!syncAvailable) {
    return 'failed';
  }

  const syncChannels = await getAllowedChannelsFromSync();
  const localChannels = await getAllowedChannels();

  if (syncChannels.length > 0) {
    // sync 有数据，同步到 local
    await setAllowedChannels(syncChannels);
    await setSyncMetadata({ lastSyncedAt: Date.now(), version: 1 });
    return 'synced';
  } else if (localChannels.length > 0) {
    // local 有数据但 sync 没有，首次启用同步
    await setAllowedChannelsToSync(localChannels);
    await setSyncMetadata({ lastSyncedAt: Date.now(), version: 1 });
    return 'unsynced';
  } else {
    // 两者都为空
    return 'unsynced';
  }
}

/**
 * 获取同步状态
 */
export async function getSyncStatus(): Promise<'synced' | 'unsynced' | 'failed'> {
  const syncAvailable = await isSyncAvailable();
  if (!syncAvailable) {
    return 'failed';
  }

  const syncChannels = await getAllowedChannelsFromSync();
  if (syncChannels.length > 0) {
    return 'synced';
  }
  return 'unsynced';
}
```

- [ ] **Step 6: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 7: 提交**

```bash
git add src/shared/whitelist.ts
git commit -m "feat(sync): 集成 sync 同步逻辑到白名单模块"
```

---

## Task 4: UI - 同步状态 DOM

**Files:**
- Modify: `src/popup/popup.html`

- [ ] **Step 1: 在状态卡片中添加同步状态 DOM**

找到 `<div class="status-info">` 部分，修改为：

```html
<div class="status-info">
  <p class="channel-count">已允许频道：<span id="channel-count">0</span> 个</p>
  <div class="sync-status" id="sync-status" data-status="unsynced">
    <span class="sync-icon">☁️</span>
    <span class="sync-text">未同步</span>
  </div>
</div>
```

- [ ] **Step 2: 验证 HTML 语法正确**

打开文件确认修改正确

- [ ] **Step 3: 提交**

```bash
git add src/popup/popup.html
git commit -m "feat(sync): 添加同步状态 DOM 到 popup.html"
```

---

## Task 5: UI - 同步状态样式

**Files:**
- Modify: `src/popup/popup.css`

- [ ] **Step 1: 在 CSS 文件末尾添加同步状态样式**

```css
/* 同步状态 */
.sync-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  background: rgba(90, 74, 58, 0.06);
  transition: all 0.3s ease;
}

.sync-status[data-status="synced"] {
  color: var(--color-success);
  background: rgba(39, 174, 96, 0.1);
}

.sync-status[data-status="unsynced"] {
  color: var(--color-text-light);
  background: rgba(90, 74, 58, 0.08);
}

.sync-status[data-status="failed"] {
  color: var(--color-danger);
  background: rgba(231, 76, 60, 0.1);
}

.sync-icon {
  font-size: 14px;
}

.sync-text {
  font-weight: 500;
}
```

- [ ] **Step 2: 验证 CSS 语法正确**

Run: `npx tsc --noEmit` (CSS 无编译检查，跳过)
Expected: 确认文件保存成功

- [ ] **Step 3: 提交**

```bash
git add src/popup/popup.css
git commit -m "feat(sync): 添加同步状态样式到 popup.css"
```

---

## Task 6: UI - 集成同步状态显示

**Files:**
- Modify: `src/popup/popup.ts`

- [ ] **Step 1: 添加同步状态元素引用**

找到 `elements` 对象，添加：

```typescript
elements = {
  // ... 现有元素
  syncStatus: document.getElementById('sync-status') as HTMLDivElement,
  syncIcon: document.querySelector('.sync-icon') as HTMLSpanElement,
  syncText: document.querySelector('.sync-text') as HTMLSpanElement,
  // ...
}
```

- [ ] **Step 2: 添加更新同步状态的函数**

在工具函数区域添加：

```typescript
function updateSyncStatusUI(status: 'synced' | 'unsynced' | 'failed'): void {
  if (!elements.syncStatus) return;

  elements.syncStatus.dataset.status = status;

  const statusConfig = {
    synced: { icon: '☁️', text: '已同步', colorClass: 'synced' },
    unsynced: { icon: '☁️', text: '未同步', colorClass: 'unsynced' },
    failed: { icon: '☁️', text: '同步失败', colorClass: 'failed' }
  };

  const config = statusConfig[status];
  if (elements.syncIcon) elements.syncIcon.textContent = config.icon;
  if (elements.syncText) elements.syncText.textContent = config.text;
}
```

- [ ] **Step 3: 修改 init 函数，在开头调用初始化同步**

找到 `init` 函数，修改为：

```typescript
async function init(): Promise<void> {
  console.log('YouthGuardian popup init');

  // 初始化同步
  const syncStatus = await initSync();
  updateSyncStatusUI(syncStatus);

  await loadStatus();
  await loadChannels();
  setupEventListeners();

  // 确保 content script 已加载
  const tab = await getCurrentTab();
  if (tab?.id && tab?.url) {
    await ensureContentScriptLoaded(tab.id, tab.url);
  }

  renderVideoList();
}
```

- [ ] **Step 4: 在每次频道操作后更新同步状态**

找到 `addChannelToWhitelist` 函数，在成功添加后添加：

```typescript
async function addChannelToWhitelist(channel: { authorName: string; authorId?: string; authorUrl?: string; videoUrl?: string; platform: 'youtube' | 'bilibili' }, button: HTMLButtonElement): Promise<void> {
  try {
    // ... 现有代码 ...

    // 操作成功后更新同步状态为已同步
    updateSyncStatusUI('synced');
  } catch (error) {
    console.error('添加频道失败:', error);
  }
}
```

找到 `removeChannel` 函数，在成功删除后添加：

```typescript
async function removeChannel(id: string): Promise<void> {
  showPasswordModal('删除频道', '请输入密码以确认删除', async (password) => {
    const valid = await verifyPassword(password);
    if (!valid) { showModalError('密码错误'); return; }
    hidePasswordModal();
    const channels = await getAllowedChannels();
    const filtered = channels.filter(c => c.id !== id);
    await setAllowedChannels(filtered);
    await setAllowedChannelsToSync(filtered);
    currentChannels = filtered;
    elements.channelCount.textContent = currentChannels.length.toString();
    renderChannelList();
    updateSyncStatusUI('synced');
  });
}
```

找到 `clearAllChannels` 函数，在成功清空后添加：

```typescript
async function clearAllChannels(): Promise<void> {
  showPasswordModal('清空全部', '请输入密码以确认清空所有允许频道', async (password) => {
    const valid = await verifyPassword(password);
    if (!valid) { showModalError('密码错误'); return; }
    hidePasswordModal();
    await setAllowedChannels([]);
    await setAllowedChannelsToSync([]);
    currentChannels = [];
    elements.channelCount.textContent = '0';
    renderChannelList();
    updateSyncStatusUI('synced');
  });
}
```

找到 `clearYoutubeChannels` 函数，在成功清空后添加：

```typescript
async function clearYoutubeChannels(): Promise<void> {
  showPasswordModal('清空YouTube', '请输入密码以确认清空所有YouTube允许频道', async (password) => {
    const valid = await verifyPassword(password);
    if (!valid) { showModalError('密码错误'); return; }
    hidePasswordModal();
    const filtered = currentChannels.filter(c => c.platform !== 'youtube');
    await setAllowedChannels(filtered);
    await setAllowedChannelsToSync(filtered);
    currentChannels = filtered;
    elements.channelCount.textContent = currentChannels.length.toString();
    renderChannelList();
    updateSyncStatusUI('synced');
  });
}
```

找到 `clearBilibiliChannels` 函数，在成功清空后添加：

```typescript
async function clearBilibiliChannels(): Promise<void> {
  showPasswordModal('清空Bilibili', '请输入密码以确认清空所有Bilibili允许频道', async (password) => {
    const valid = await verifyPassword(password);
    if (!valid) { showModalError('密码错误'); return; }
    hidePasswordModal();
    const filtered = currentChannels.filter(c => c.platform !== 'bilibili');
    await setAllowedChannels(filtered);
    await setAllowedChannelsToSync(filtered);
    currentChannels = filtered;
    elements.channelCount.textContent = currentChannels.length.toString();
    renderChannelList();
    updateSyncStatusUI('synced');
  });
}
```

- [ ] **Step 5: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无编译错误

- [ ] **Step 6: 提交**

```bash
git add src/popup/popup.ts
git commit -m "feat(sync): 集成同步状态显示到 popup"
```

---

## Task 7: 构建和测试

- [ ] **Step 1: 构建项目**

Run: `npm run build`
Expected: 构建成功，生成 dist 目录

- [ ] **Step 2: 加载扩展到 Chrome 测试**

1. 打开 Chrome 的 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目的 `dist` 目录
5. 打开 YouTube 或 Bilibili 页面测试功能

- [ ] **Step 3: 验证同步功能**

测试场景：
1. 添加频道 → 检查 sync storage 是否写入
2. 删除频道 → 检查 sync storage 是否更新
3. 清空频道 → 检查 sync storage 是否清空
4. 删除扩展 → 重新加载 → 检查数据是否从 sync 恢复

- [ ] **Step 4: 提交所有更改**

```bash
git add -A
git commit -m "feat: 完成云端同步功能实现"
```

---

## 自检清单

- [ ] spec 覆盖：每个设计需求都有对应的任务实现
- [ ] 无占位符：所有步骤都包含实际代码，无 TBD/TODO
- [ ] 类型一致性：方法签名在整个计划中保持一致
- [ ] 文件路径正确：所有文件路径与项目结构匹配
