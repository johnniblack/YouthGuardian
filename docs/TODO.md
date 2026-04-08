# YouthGuardian 实现任务列表

> 项目：青少年视频网站白名单限制插件
> 创建时间：2026-04-08
> 设计文档：`docs/superpowers/specs/2026-04-08-youth-guardian-design.md`

---

## 任务列表

| # | 任务名称 | 状态 | 说明 |
|---|---------|------|------|
| 1 | 项目脚手架搭建 | ✅ completed | 创建目录结构、package.json、tsconfig.json、manifest.json |
| 2 | 实现共享类型定义 | ✅ completed | types.ts - Platform、VideoItem、AllowedChannel 等 |
| 3 | 实现存储层 | ✅ completed | storage.ts - chrome.storage.local 封装 |
| 4 | 实现密码安全模块 | ✅ completed | security.ts - SHA-256 哈希、密码验证 |
| 5 | 实现白名单匹配逻辑 | ✅ completed | whitelist.ts - 频道ID生成、添加/删除/查询 |
| 6 | 实现消息通信层 | ✅ completed | messaging.ts - Popup/Background/Content 通信 |
| 7 | 实现平台检测工具 | ✅ completed | platform.ts - 检测 youtube/bilibili/unsupported |
| 8 | 实现YouTube页面适配器 | ✅ completed | youtube.ts - 视频卡片解析 |
| 9 | 实现Bilibili页面适配器 | ✅ completed | bilibili.ts - 视频卡片解析 |
| 10 | 实现内容脚本（页面过滤） | ✅ completed | content/index.ts + observer.ts - MutationObserver |
| 11 | 实现后台服务线程 | ✅ completed | service-worker.ts - 消息处理、状态管理 |
| 12 | 实现Popup界面 | ✅ completed | popup.html/ts/css - 标签页UI |
| 13 | 配置Manifest和图标 | ✅ completed | manifest.json、icons/ |

---

## 当前任务

**全部任务已完成！**

---

## 项目结构

```
src/
├── background/
│   └── service-worker.ts          ✅
├── content/
│   ├── index.ts                    ✅
│   ├── observer.ts                 ✅
│   └── adapters/
│       ├── youtube.ts              ✅
│       └── bilibili.ts             ✅
├── popup/
│   ├── popup.html                  ✅
│   ├── popup.ts                    ✅
│   └── popup.css                   ✅
├── shared/
│   ├── types.ts                    ✅
│   ├── storage.ts                  ✅
│   ├── messaging.ts                ✅
│   ├── whitelist.ts                ✅
│   ├── security.ts                 ✅
│   └── platform.ts                 ✅
└── styles/
    └── common.css                  ✅
```

---

## 技术决策记录

| 决策项 | 选择 |
|--------|------|
| 语言 | TypeScript |
| 布局 | 标签页切换（首页/视频/管理） |
| 密码引导 | 延迟引导 |
| 频道识别 | authorId优先 → authorUrl兜底 |
| 视觉风格 | 友好亲和（暖橙 #FFB347 + 暖白 #FFF8F0） |
| 页面过滤 | MutationObserver 持续监听 |
| 数据存储 | JSON数组集中存储 |

---

## 下一步

1. 安装依赖：`npm install`
2. 编译 TypeScript：`npm run build`
3. 准备图标文件（icons/ 目录）
4. 在 Chrome 中加载插件测试

---

## 备注

- 所有代码使用中文注释
- 密码使用 SHA-256 + 随机盐值存储
- 任务窗口中断后，可直接运行 `npm install && npm run build` 继续
