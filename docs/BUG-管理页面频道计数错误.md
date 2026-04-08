# BUG 修复记录：管理页面频道计数错误

**日期**: 2026-04-08  
**状态**: ✅ 已修复  
**优先级**: 中

---

## 问题描述

在管理页面（管理标签）中，"已允许频道"的计数显示不正确。

### 复现步骤

1. 在 YouTube 上添加 2 个频道，此时显示数量为 2 个 ✅
2. 切换到 B 站（Bilibili）
3. **问题**：管理页面显示"已允许频道：2 个"，但 B 站上从未添加过任何频道 ❌
4. **预期**：应显示"已允许频道：0 个"

### 现象

- YouTube 上添加的频道数量显示正常
- 切换平台后，计数仍然显示为全部平台的频道总数，而非当前平台的频道数

---

## 根本原因

**位置**：`src/popup/popup.ts` 第 298 行的 `renderChannelList()` 函数

**问题代码**：
```typescript
function renderChannelList(): void {
  // ...
  // 更新总计数
  elements.channelCount.textContent = currentChannels.length.toString();  // ❌ 错误
  // ...
}
```

**问题分析**：
- `currentChannels.length` 返回的是**全部频道的数量**（包含 YouTube 和 Bilibili）
- 该代码没有根据当前页面所在的平台进行过滤
- 导致无论用户在哪个平台，看到的都是全部频道总数

---

## 解决方案

### 修改方案

1. **`renderChannelList()` 函数改为异步**
   - 获取当前标签页的 URL 以确定平台
   - 只统计当前平台的频道数量

2. **更新相关调用处**
   - `loadChannels()` - 调整为异步
   - `setupEventListeners()` - 标签切换时重新计算
   - `addChannelToWhitelist()` - 添加频道后重新渲染

### 修改代码

#### 修改 1：`renderChannelList()` 函数

```typescript
async function renderChannelList(): Promise<void> {
  // 按平台分组
  const youtubeChannels = currentChannels.filter(c => c.platform === 'youtube');
  const bilibiliChannels = currentChannels.filter(c => c.platform === 'bilibili');

  // 获取当前平台，更新为仅显示当前平台的频道数量
  const tab = await getCurrentTab();
  const url = tab?.url || '';
  let platform: 'youtube' | 'bilibili' | 'unsupported' = 'unsupported';
  if (url.includes('youtube.com')) platform = 'youtube';
  else if (url.includes('bilibili.com')) platform = 'bilibili';
  const platformChannels = currentChannels.filter(c => c.platform === platform);
  elements.channelCount.textContent = platformChannels.length.toString();  // ✅ 修复后
  
  // ... 后续渲染逻辑不变
}
```

#### 修改 2：`loadChannels()` 函数简化

```typescript
async function loadChannels(): Promise<void> {
  try {
    currentChannels = await getAllowedChannels();
    await renderChannelList();  // 移除重复的平台判断逻辑
  } catch (error) {
    console.error('加载频道失败:', error);
  }
}
```

#### 修改 3：标签切换事件更新

```typescript
function setupEventListeners(): void {
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      const tabId = tab.dataset.tab;
      elements.tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      elements.panels.forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabId}`);
      });
      if (tabId === 'videos') await renderVideoList();
      if (tabId === 'manage') await renderChannelList();  // ✅ 切换到管理标签时重新计算
    });
  });
  // ...
}
```

#### 修改 4：添加频道后更新计数

```typescript
async function addChannelToWhitelist(channel: { ... }, button: HTMLButtonElement): Promise<void> {
  try {
    await addChannel(channel);
    button.textContent = '已允许';
    button.disabled = true;
    currentChannels = await getAllowedChannels();
    await renderChannelList();  // ✅ 重新渲染确保计数更新
  } catch (error) {
    console.error('添加频道失败:', error);
  }
}
```

---

## 修复验证

### 编译检查
✅ TypeScript 编译通过，无错误

### 修复后行为

| 场景 | 修复前 | 修复后 |
|-----|------|------|
| YouTube 添加 2 个频道 | 显示 2 个 ✅ | 显示 2 个 ✅ |
| 切换到 B 站 | 显示 2 个 ❌ | 显示 0 个 ✅ |
| B 站添加 1 个频道后 | 显示 3 个 ❌ | 显示 1 个 ✅ |
| 切换回 YouTube | 显示 3 个 ❌ | 显示 2 个 ✅ |

---

## 涉及文件

- `src/popup/popup.ts`

## 技术细节

- **根本原因**：逻辑混淆，混合了全局计数和平台特定计数
- **解决策略**：将计数逻辑下沉到 `renderChannelList()`，每次渲染时动态获取当前平台
- **风险级别**：低（仅 UI 逻辑修改，不涉及数据存储）

---

## 关键改进

1. **代码精简**：移除了 `loadChannels()` 中重复的平台判断逻辑
2. **一致性**：与 `loadStatus()` 中的平台检测逻辑保持一致
3. **可维护性**：集中管理平台计数逻辑在 `renderChannelList()` 中

