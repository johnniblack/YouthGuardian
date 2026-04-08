# 青少年视频网站白名单限制插件 — 设计文档

## 1. 项目概述

- **项目名称**：YouthGuardian（青少年守护）
- **项目类型**：Chrome Extension（Manifest V3）
- **核心功能**：在 YouTube/Bilibili 页面中建立频道白名单，仅展示允许频道的视频内容
- **目标用户**：家长/监护人
- **被管控对象**：儿童及16岁以下青少年

---

## 2. 技术选型

| 项目 | 选择 |
|------|------|
| 语言 | TypeScript |
| 构建 | 原生 DOM + 少量工具函数 |
| 密码哈希 | Web Crypto API（SHA-256） |
| 存储 | chrome.storage.local（JSON数组集中存储） |
| 架构 | Manifest V3（Service Worker + Content Script + Popup） |

---

## 3. 项目结构

```
src/
├── background/
│   └── service-worker.ts      # 后台服务线程：状态同步、消息转发
├── content/
│   ├── index.ts               # 内容脚本入口
│   ├── observer.ts            # MutationObserver 监听与过滤
│   └── adapters/
│       ├── youtube.ts         # YouTube 页面解析适配器
│       └── bilibili.ts        # Bilibili 页面解析适配器
├── popup/
│   ├── popup.html
│   ├── popup.ts
│   └── popup.css
├── shared/
│   ├── types.ts               # 共享类型定义
│   ├── storage.ts             # 存储层封装
│   ├── messaging.ts           # 消息通信封装
│   ├── whitelist.ts           # 白名单匹配逻辑
│   ├── security.ts            # 密码哈希与验证
│   └── platform.ts            # 平台检测工具
└── styles/
    └── common.css             # 通用样式
```

---

## 4. 数据模型

### 4.1 AllowedChannel（允许频道）

```typescript
interface AllowedChannel {
  id: string;                  // 唯一ID：${platform}_${authorId || authorUrl || authorName}
  platform: 'youtube' | 'bilibili';
  authorName: string;
  authorId?: string;
  authorUrl?: string;
  createdAt: number;           // Unix timestamp
  source: 'manual' | 'page-detected';
}
```

### 4.2 Settings（设置）

```typescript
interface Settings {
  restrictionEnabled: boolean;  // 全局限流开关
  passwordEnabled: boolean;     // 是否启用了密码保护
}
```

### 4.3 PasswordMeta（密码元数据）

```typescript
interface PasswordMeta {
  passwordHash: string;        // SHA-256 哈希值
  salt: string;                // 盐值
  updatedAt: number;
}
```

### 4.4 Storage Keys

| Key | 类型 | 说明 |
|-----|------|------|
| `allowed_channels` | `AllowedChannel[]` | 允许频道列表 |
| `settings` | `Settings` | 全局设置 |
| `password_meta` | `PasswordMeta` | 密码元数据 |

---

## 5. 核心模块设计

### 5.1 Content Script（内容脚本）

**职责**：
- 扫描页面视频卡片
- 执行白名单过滤
- 监听页面动态变化

**工作流程**：
1. 从 `chrome.storage.local` 读取 `allowed_channels` 和 `settings`
2. 若 `restrictionEnabled === true`，执行初始过滤
3. 启动 `MutationObserver` 监听 DOM 变化
4. 变化时，对新增视频卡片执行过滤
5. 使用节流（300ms）避免频繁处理

**已处理元素标记**：
- 使用 `data-youth-guardian-processed="true"` 标记已处理卡片
- 避免重复处理

### 5.2 Popup（弹窗界面）

**布局**：标签页切换（3个标签）

| 标签 | 内容 |
|------|------|
| 首页 | 状态总览 + 快速开关 |
| 视频 | 当前页面扫描列表 + 允许操作 |
| 管理 | 已允许频道列表 + 设置 |

**标签页说明**：

1. **首页**
   - 当前平台 + 限制状态
   - 开启/解除限制按钮（受密码保护）
   - 统计数据（已允许频道数）

2. **视频**
   - 扫描当前页面可见视频
   - 每条显示：标题、频道名、时长
   - 按钮：允许此频道 / 已允许

3. **管理**
   - 已允许频道列表
   - 删除操作（受密码保护）
   - 清空全部（受密码保护）
   - 设置密码 / 修改密码

### 5.3 白名单匹配策略

匹配优先级（三级降级）：

```
1. platform + authorId（最优先）
2. platform + authorUrl（第一候补）
3. platform + authorName（最终兜底）
```

唯一ID生成规则：
```typescript
function generateChannelId(channel: Partial<AllowedChannel>): string {
  if (channel.authorId) return `${channel.platform}_id_${channel.authorId}`;
  if (channel.authorUrl) return `${channel.platform}_url_${hashString(channel.authorUrl)}`;
  return `${channel.platform}_name_${hashString(channel.authorName)}`;
}
```

### 5.4 密码保护

**首次设置**：
- 用户主动触发（延迟引导）
- 输入密码（≥4位，推荐≥6位）+ 确认密码
- 使用 Web Crypto API 生成盐值并哈希存储

**验证流程**：
- 弹出密码输入框
- 输入 → SHA-256(输入 + 盐值) → 与存储哈希比对
- 错误提示"密码错误"，正确则继续执行

**保护操作**（需验证密码）：
- 解除限制观看
- 删除单条允许频道
- 清空全部允许频道
- 修改密码

### 5.5 页面过滤（MutationObserver）

```typescript
const observer = new MutationObserver((mutations) => {
  const hasNewNodes = mutations.some(m => m.addedNodes.length > 0);
  if (hasNewNodes) {
    throttle(filterPageVideos, 300)();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
```

---

## 6. 视觉风格

**友好亲和风格**（已选定）：

| 元素 | 样式 |
|------|------|
| 背景色 | #FFF8F0（暖白） |
| 主色调 | #FFB347（暖橙） |
| 文字色 | #5A4A3A（深棕） |
| 卡片背景 | #FFF3E0（淡橙） |
| 圆角 | 12-16px（圆润） |
| 图标风格 | 圆润柔和 |
| 按钮 | 圆角矩形，主色填充 |

---

## 7. 消息通信设计

Popup ↔ Content Script ↔ Background Service Worker

```
Popup ──chrome.runtime.sendMessage──▶  Background
                                          │
                                     content script
                                          │
Popup ◀──chrome.runtime.sendMessage── Background◀──tab.id
```

| 消息类型 | 方向 | 说明 |
|----------|------|------|
| `GET_RESTRICTION_STATUS` | Popup→Background | 获取当前限制状态 |
| `TOGGLE_RESTRICTION` | Popup→Background | 切换限制（需密码） |
| `GET_ALLOWED_CHANNELS` | Popup→Background | 获取白名单 |
| `ADD_CHANNEL` | Popup→Background | 添加频道 |
| `REMOVE_CHANNEL` | Popup→Background | 删除频道（需密码） |
| `CLEAR_CHANNELS` | Popup→Background | 清空白名单（需密码） |
| `SCAN_VIDEOS` | Popup→Content | 让Content扫描当前页 |
| `VIDEOS_SCANNED` | Content→Popup | 返回扫描结果 |

---

## 8. 安全考量

1. **密码不明文存储**：使用 SHA-256 + 随机盐值
2. **密码验证在后台完成**：不在 Popup 中暴露验证逻辑
3. **受保护操作统一拦截**：所有敏感操作经过 `security.verifyPassword()`
4. **本地数据局限**：无服务器，数据仅在本地

---

## 9. 错误处理

| 场景 | 处理 |
|------|------|
| 页面无法识别视频 | 提示"当前页面未识别到可管理视频" |
| 频道已在白名单 | 按钮显示"已允许"，不可重复添加 |
| 密码错误 | 提示"密码错误，请重试" |
| 无法获取 authorId | 降级使用 authorUrl 或 authorName |
| MutationObserver 失败 | 回退到定时扫描（3秒间隔） |

---

## 10. 后续扩展预留

以下接口已预留，MVP 暂不实现：

- `export_whitelist()` / `import_whitelist()`（导入导出）
- `search_channels()`（频道搜索）
- `password_attempts`（密码错误次数限制）
- 平台独立开关（YouTube/Bilibili 单独控制）

---

*设计文档版本：V1.0*
*创建日期：2026-04-08*
