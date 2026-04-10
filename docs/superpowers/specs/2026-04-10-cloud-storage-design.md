# Chrome Extension 云端存储方案

> 本文档记录 chrome.storage.sync 的使用方案、限制和实现注意事项。

## 一、chrome.storage.sync 特性

### 1.1 核心特性
- 数据存储在用户的 Google 账号中
- 用户登录 Chrome 后自动同步，无需额外 OAuth 配置
- 适合存储用户偏好设置、小型配置数据

### 1.2 存储限制
| 指标 | 限制 |
|------|------|
| 单条数据大小 | 最大 8KB |
| 总存储量 | 最大 512KB |
| 单次写入 | 建议不超过 4 条 key |

### 1.3 数据绑定特性（关键）
**chrome.storage.sync 的数据与 extension ID 绑定。**

- 从 **Chrome Web Store** 安装的扩展：删除重装后 extension ID 不变，数据可恢复
- 从 **开发者模式加载源代码**：每次"删除再加载"会生成新的 extension ID，**之前存储的数据无法访问**

## 二、实现方案

### 2.1 架构设计

```
┌─────────────────────────────────────────────────────┐
│                    Popup/Content                     │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              chrome.storage.local                    │
│         (离线缓存，优先读写)                         │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼ (定期同步或关键操作时同步)
┌─────────────────────────────────────────────────────┐
│              chrome.storage.sync                    │
│         (云端备份，依赖 extension ID)                 │
└─────────────────────────────────────────────────────┘
```

### 2.2 同步策略

#### 方案 A：完全以 sync 为权威数据源（推荐）
- 所有读写操作基于 `chrome.storage.sync`
- `chrome.storage.local` 仅作为离线缓存
- 初始化时从 sync 读取并同步到 local

#### 方案 B：local 优先，sync 作为备份
- 正常读写基于 `chrome.storage.local`
- 每次修改时同时写入 sync（作为备份）
- 初始化时检查 sync 是否有更新数据

### 2.3 关键操作流程

```typescript
// 1. 初始化 - 打开 popup 时执行
async function initStorage(): Promise<SyncStatus> {
  const syncData = await chrome.storage.sync.get('allowed_channels');

  if (syncData.allowed_channels?.length > 0) {
    // sync 有数据，同步到 local
    await chrome.storage.local.set({ allowed_channels: syncData.allowed_channels });
    return 'synced';
  }

  const localData = await chrome.storage.local.get('allowed_channels');
  if (localData.allowed_channels?.length > 0) {
    // local 有数据但 sync 没有，上传到 sync
    await chrome.storage.sync.set({ allowed_channels: localData.allowed_channels });
    return 'unsynced';
  }

  return 'empty';
}

// 2. 添加频道
async function addChannel(channel: Channel): Promise<void> {
  const channels = await getChannelsFromSync(); // 优先从 sync 读取
  channels.push(channel);
  await chrome.storage.sync.set({ allowed_channels: channels });
  await chrome.storage.local.set({ allowed_channels: channels }); // 同步到 local
}

// 3. 删除频道
async function removeChannel(id: string): Promise<void> {
  const channels = await getChannelsFromSync();
  const filtered = channels.filter(c => c.id !== id);
  await chrome.storage.sync.set({ allowed_channels: filtered });
  await chrome.storage.local.set({ allowed_channels: filtered });
}
```

## 三、UI 状态设计

### 3.1 状态类型
| 状态 | 条件 | 样式 |
|------|------|------|
| 已同步 | sync 有数据且操作正常 | 绿色云图标 |
| 未同步 | sync 无数据 | 灰色云图标 |
| 同步失败 | sync 读取/写入失败 | 红色云图标 |

### 3.2 状态显示位置
在管理页面顶部状态卡片中，「已允许频道：X 个」右侧显示同步状态。

## 四、已知限制与注意事项

### 4.1 开发者模式限制（重要）
```
┌────────────────────────────────────────────────────────────┐
│  ⚠️  开发者模式加载时，每次删除重装会导致 extension ID 变化  │
│      导致无法访问之前存储在 sync 中的数据                   │
└────────────────────────────────────────────────────────────┘
```

**影响：**
- 删除扩展后重新加载 → extension ID 改变 → 无法读取之前的 sync 数据
- 刷新扩展（不删除）→ extension ID 不变 → 数据保持

**解决方案：**
1. 使用"刷新"按钮而非删除重装
2. 提供手动导出/导入备份功能
3. 从 Chrome Web Store 安装（需要发布费）

### 4.2 用户未登录 Chrome
如果用户未登录 Chrome 账号：
- `chrome.storage.sync` 会回退到 `chrome.storage.local` 的行为
- 但数据不会同步到云端
- 状态应显示为"同步失败"或"未登录"

### 4.3 存储配额
- 确保频道数据（每条约 200-500 字节）不超过 512KB 限制
- 约可存储 1000-2000 个频道

## 五、代码实现要点

### 5.1 manifest.json 需要声明
```json
{
  "permissions": ["storage"]
}
```

### 5.2 推荐的文件结构
```
src/
├── shared/
│   ├── storage.ts      # 存储操作（local + sync）
│   ├── whitelist.ts    # 白名单逻辑
│   └── types.ts        # 类型定义
├── popup/
│   ├── popup.ts        # UI 逻辑
│   ├── popup.html
│   └── popup.css
└── background/
    └── service-worker.ts
```

### 5.3 错误处理
```typescript
async function syncToCloud(channels: Channel[]): Promise<boolean> {
  try {
    await chrome.storage.sync.set({ allowed_channels: channels });
    return true;
  } catch (error) {
    if (error.message.includes('QUOTA_BYTES')) {
      console.error('存储配额超出限制');
    }
    console.error('同步失败:', error);
    return false;
  }
}
```

## 六、测试清单

### 6.1 功能测试
- [ ] 添加频道后 sync 有数据
- [ ] 删除频道后 sync 更新
- [ ] 清空频道后 sync 为空
- [ ] 刷新扩展后数据保持

### 6.2 边界测试
- [ ] 删除重装后数据丢失（开发者模式限制）
- [ ] 用户未登录 Chrome 时的行为
- [ ] 存储配额超出时的错误处理
- [ ] 网络离线时的降级处理

## 七、相关资源

- [Chrome Storage API 文档](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Storage Sync API 限制](https://developer.chrome.com/docs/extensions/reference/storage/#property-sync)
