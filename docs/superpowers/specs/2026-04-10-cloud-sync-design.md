# 频道白名单云端同步功能设计

## 1. 需求概述

解决插件删除重装后频道白名单数据丢失的问题，实现基于 `chrome.storage.sync` 的云端永久保存功能。

## 2. 设计原则

- **`chrome.storage.sync` 作为权威数据源**，所有读写操作都基于它
- **`chrome.storage.local` 仅作为离线缓存**，在 sync 不可用时提供备用读取
- 用户登录 Chrome 后，数据自动同步到 Google 账号，无需额外 OAuth 配置

## 3. 架构设计

### 3.1 存储层结构

**Storage Keys:**
```typescript
STORAGE_KEYS = {
  ALLOWED_CHANNELS: 'allowed_channels',    // 频道白名单
  SETTINGS: 'settings',                    // 全局设置
  PASSWORD_META: 'password_meta',          // 密码元数据
  SYNC_METADATA: 'sync_metadata'           // 同步元数据（新增）
}
```

**SyncMetadata 元数据：**
```typescript
interface SyncMetadata {
  lastSyncedAt: number;      // 最后同步时间戳
  version: number;           // 同步版本号
}
```

### 3.2 同步流程

#### 初始化流程（popup 打开时）
```
1. 检查 chrome.storage.sync 是否有数据
2. 如果 sync 有数据：
   - 将 sync 数据同步到 local
   - 更新 lastSyncedAt 时间戳
   - 设置状态为"已同步"
3. 如果 sync 无数据：
   - 尝试从 local 读取（作为备用）
   - 如果 local 有数据，说明之前未启用同步
   - 设置状态为"未同步"
```

#### 添加频道流程
```
1. 直接写入 chrome.storage.sync
2. 同时更新 local 缓存
3. 更新 lastSyncedAt
4. 设置状态为"已同步"
```

#### 删除频道流程
```
1. 直接从 chrome.storage.sync 删除
2. 同时更新 local 缓存
3. 更新 lastSyncedAt
4. 设置状态为"已同步"
```

#### 清空频道流程
```
1. 直接清空 chrome.storage.sync
2. 同时清空 local 缓存
3. 更新 lastSyncedAt
4. 设置状态为"已同步"
```

### 3.3 错误处理

- **sync 写入失败**：回退到 local 写入，状态标记为"同步失败"
- **sync 读取失败**：从 local 读取，状态标记为"同步失败"
- **sync 不可用**（用户未登录 Chrome）：使用 local 操作，状态标记为"未同步"

## 4. UI 设计

### 4.1 同步状态标识位置

在管理页面顶部状态卡片中，「已允许频道：X 个」右侧增加云端同步状态标志。

### 4.2 状态类型与样式

| 状态 | 条件 | 样式 | 图标 |
|------|------|------|------|
| 已同步 | sync 有数据且操作正常 | 绿色云图标 + "已同步" | ☁️ ✓ |
| 未同步 | sync 无数据 | 灰色云图标 + "未同步" | ☁️ |
| 同步失败 | sync 读取/写入失败 | 红色云图标 + "同步失败" | ☁️ ✗ |

### 4.3 视觉样式

```html
<!-- 状态卡片布局 -->
<div class="status-info">
  <p class="channel-count">已允许频道：<span id="channel-count">0</span> 个</p>
  <div class="sync-status" id="sync-status" data-status="synced">
    <span class="sync-icon">☁️</span>
    <span class="sync-text">已同步</span>
  </div>
</div>
```

```css
/* 同步状态样式 */
.sync-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  background: rgba(90, 74, 58, 0.06);
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

## 5. 文件变更

### 5.1 新增文件
- `src/shared/cloud-sync.ts` - 云端同步核心逻辑

### 5.2 修改文件
- `src/shared/storage.ts` - 封装同步存储操作
- `src/shared/types.ts` - 新增 SyncMetadata 类型
- `src/popup/popup.ts` - 集成同步状态显示
- `src/popup/popup.css` - 同步状态样式
- `src/popup/popup.html` - 同步状态 DOM 结构

## 6. 实现步骤

1. **存储层改造**
   - 在 `storage.ts` 中增加 `getAllowedChannelsFromSync()` 和 `setAllowedChannelsToSync()` 方法
   - 在 `whitelist.ts` 中增加同步封装函数

2. **新增云端同步模块**
   - 创建 `cloud-sync.ts`，实现初始化同步和状态检查逻辑

3. **UI 改造**
   - 在 `popup.html` 中增加同步状态 DOM
   - 在 `popup.css` 中增加同步状态样式
   - 在 `popup.ts` 中集成同步状态显示逻辑

4. **功能测试**
   - 验证双写双读逻辑
   - 验证删除重装后的数据恢复
   - 验证状态显示正确性
