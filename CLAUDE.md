# CLAUDE.md - AI 开发指南

本文件为 AI 开发助手提供项目上下文和开发指南。

## 项目概述

- **项目名称**: 邮件智能答复助手
- **项目类型**: Chrome 浏览器扩展 (Manifest V3)
- **核心功能**: 监听 Outlook 网页版，自动分析邮件内容并提供 AI 答复建议
- **目标用户**: 使用 Outlook 网页版的办公人员
- **版本**: 1.0.0

## 技术架构

### 文件结构

```
邮件答复Chrome 插件/
├── manifest.json          # 扩展配置 (权限、host_permissions、content_scripts)
├── popup/                 # 弹窗 (用户主要交互界面)
│   ├── popup.html         # 弹窗 HTML 结构
│   ├── popup.js           # 弹窗逻辑 (UI 交互、消息传递)
│   └── popup.css          # 弹窗样式
├── content/               # Content Script (注入到 Outlook 页面)
│   └── content.js         # DOM 解析、邮件内容提取
├── background/            # Background Script (Service Worker)
│   └── background.js      # 核心逻辑 (API调用、存储、模板匹配)
├── options/               # 设置页面
│   ├── options.html       # 设置页面 HTML
│   ├── options.js         # 设置逻辑 (API 配置)
│   └── options.css        # 设置页面样式
└── icons/                 # 扩展图标
    └── icon.svg           # SVG 图标
```

### 核心模块

#### 1. manifest.json
- `permissions`: storage, activeTab, scripting, tabs, nativeMessaging
- `host_permissions`: *://outlook.office.com/*, *://outlook.live.com/*, *://outlook.office365.com/*
- `content_scripts`: 注入到 Outlook 页面运行

#### 2. content/content.js
- 负责从 Outlook DOM 中提取邮件内容
- 包含多种选择器适配不同版本的 Outlook
- 实现语言检测 (中/英)
- 使用 MutationObserver 监听页面变化

#### 3. background/background.js
- 核心逻辑入口
- 存储模块: 使用 chrome.storage.local
- API 调用: 支持 OpenAI/Anthropic/Gemini 格式
- 模板匹配算法: 基于主题和内容的匹配分数
- fillToOutlook: 使用 chrome.scripting.executeScript 注入内容

#### 4. popup/popup.js
- UI 状态管理 (loading, noEmail, error, mainContent)
- 与 background 脚本通过 chrome.runtime.sendMessage 通信
- 按钮事件绑定

#### 5. options/options.js
- API 配置 (类型、Key、Base URL、模型)
- 测试 API 连接
- 数据导出/导入/清空

## 关键数据流

```
用户点击插件图标
    ↓
popup.js → chrome.runtime.sendMessage({ action: 'getSettings' })
    ↓
background.js → handleMessage('getSettings')
    ↓
popup.js ← chrome.runtime.sendMessage({ action: 'getEmailContent' })
    ↓
content.js → extractEmailContent() → 返回 { subject, sender, body, language }
    ↓
popup.js → chrome.runtime.sendMessage({ action: 'generateReply', emailData })
    ↓
background.js → generateReply()
    ├─ 优先: findMatchingTemplates() → 模板匹配
    └─ 备选: callOpenAIAPI() / callAnthropicAPI() / callGeminiAPI()
    ↓
popup.js ← { type: 'database'|'ai', content: '...' }
    ↓
显示回复内容
```

## API 消息协议

### popup → background

| Action | 参数 | 返回 |
|--------|------|------|
| getSettings | - | { apiType, apiKey, baseUrl, model, outputFormat, language } |
| generateReply | { emailData } | { type, content, template? } |
| getTemplates | { options? } | Template[] |
| deleteTemplate | { id } | { success } |
| saveTemplate | { template } | Template |
| fillToOutlook | { content } | { success, error? } |
| saveSettings | { settings } | { success } |
| testApiConnection | { settings } | { success, error? } |
| openOptionsPage | - | - |

## 存储结构

### chrome.storage.local

```javascript
{
  apiType: 'openai' | 'anthropic' | 'gemini',
  apiKey: 'sk-xxx',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  outputFormat: 'text' | 'json',
  language: 'auto' | 'zh' | 'en',

  // 模板 (email_templates)
  email_templates: [
    {
      id: 123456789,
      subject: '邮件主题',
      content_summary: '内容摘要...',
      question_type: 'question|meeting_invite|request|...',
      reply_content: '回复内容...',
      language: 'zh' | 'en',
      created_at: 123456789
    }
  ],

  // 历史记录 (email_history)
  email_history: [
    {
      id: 123456789,
      subject: '邮件主题',
      content: '原始内容...',
      reply_used: '使用的回复',
      source: 'ai' | 'database',
      created_at: 123456789
    }
  ]
}
```

## 开发注意事项

### 1. 选择器适配
Outlook 网页版的 DOM 结构可能会随版本更新变化。content.js 中使用了多个备选选择器，如果新版 Outlook 结构变化，需要更新选择器列表。

### 2. Service Worker 限制
- Background Script 运行在 Service Worker 中
- 不能使用 IndexedDB (使用 chrome.storage.local 代替)
- 不能访问 DOM (通过 content script 注入)

### 3. 跨域请求
- Background Script 可以直接发起 fetch 请求
- 不受同源策略限制（已在 manifest 中配置权限）

### 4. 模板匹配阈值
- 匹配分数 > 30 才使用模板回复
- 否则调用 AI 生成
- 匹配算法: 主题匹配 + 关键词重叠计算

## 常用开发命令

```bash
# 在 Chrome 中重新加载扩展
# 访问 chrome://extensions/ → 点击刷新按钮

# 测试 API
# 在设置页面点击"测试 API 连接"

# 调试
# 查看扩展的背景页: chrome://extensions/ → "service worker" 链接
```

## 版本管理

- 主版本号: 重大功能变更
- 次版本号: 新功能添加
- 修订号: bug 修复和优化

当前版本: **1.0.0**

## 后续迭代方向

1. **问题类型分类**: 使用 AI 自动分类邮件类型
2. **多语言支持**: 扩展更多语言检测
3. **模板编辑**: 支持编辑已保存的模板
4. **快捷键**: 添加键盘快捷操作
5. **统计功能**: 使用次数、成功率统计
6. **Outlook 桌面版**: 考虑支持 Outlook 客户端