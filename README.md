# 邮件智能答复助手

<p align="center">
  <img src="icons/icon.svg" width="64" height="64" alt="Logo">
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/邮件智能答复助手">Chrome Web Store</a> •
  <a href="#功能">功能</a> •
  <a href="#安装">安装</a> •
  <a href="#使用说明">使用说明</a> •
  <a href="#API配置">API 配置</a> •
  <a href="#技术栈">技术栈</a>
</p>

## 简介

一款专为 Outlook 网页版设计的 Chrome 扩展插件，智能分析邮件内容并提供 AI 答复建议。

**版本**: 1.0.2

## 功能

### 核心功能

- **邮件内容读取**: 自动解析 Outlook 网页版中的邮件主题、发件人和正文
- **语言识别**: 自动检测邮件语言（中文/英文），智能生成对应语言的回复
- **AI 智能回复**: 调用大模型 API 生成专业的回复建议
- **模板匹配**: 从本地历史模板库中智能匹配相似问题的回复
- **一键复制**: 将生成的回复复制到剪贴板
- **填充到邮件**: 直接将回复内容填充到 Outlook 回复窗口
- **模板保存**: 将优质回复保存为模板，供后续使用

### AI 模型支持

- OpenAI 兼容 API (GPT-4o, GPT-4 Turbo 等)
- Anthropic Claude API (Claude Sonnet, Claude Haiku 等)
- Google Gemini API (Gemini 2.0 Flash, Gemini 1.5 Pro 等)
- 支持第三方代理服务

### 数据管理

- 本地模板存储（使用 chrome.storage）
- 历史记录自动保存
- 数据导出/导入
- 支持清空数据

## 安装

### 方法一：从 Chrome 应用商店安装

> 商店上架后提供链接

### 方法二：开发者模式安装

1. 下载本项目源码
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择项目目录 `邮件答复Chrome 插件`

## 使用说明

### 首次配置

1. 点击插件图标，打开设置页面
2. 选择 API 类型（OpenAI/Anthropic/Gemini）
3. 输入 API Key
4. 根据需要自定义 Base URL 和模型 ID
5. 点击「测试 API 连接」验证配置
6. 点击「保存设置」

### 使用流程

1. 打开 Outlook 网页版 (outlook.office.com / outlook.live.com / outlook.office365.com / outlook.cloud.microsoft.com)
2. 打开一封邮件
3. 点击插件图标
4. 插件会自动读取邮件内容并生成回复建议
5. 使用按钮进行操作：
   - **填充到邮件**: 直接填充到 Outlook 回复框
   - **复制**: 复制到剪贴板
   - **保存**: 保存为模板
   - **刷新**: 重新生成回复

### 模板匹配逻辑

插件会优先从本地模板库中匹配相似问题：

1. 匹配相同语言的模板
2. 匹配邮件主题相似的模板
3. 匹配邮件内容关键词
4. 按匹配分数排序，返回最高分模板

如果匹配分数 > 30，直接使用模板回复；否则调用 AI 生成。

## API 配置

### OpenAI 兼容

| 配置项 | 值 |
|--------|-----|
| API 类型 | OpenAI 兼容 |
| Base URL | `https://api.openai.com/v1` (或第三方代理) |
| 模型 ID | `gpt-4o`, `gpt-4-turbo` 等 |

### Anthropic

| 配置项 | 值 |
|--------|-----|
| API 类型 | Anthropic |
| Base URL | `https://api.anthropic.com/v1` (或第三方代理) |
| 模型 ID | `claude-sonnet-4-20250514` 等 |

### Google Gemini

| 配置项 | 值 |
|--------|-----|
| API 类型 | Google Gemini |
| Base URL | `https://generativelanguage.googleapis.com/v1beta` |
| 模型 ID | `gemini-2.0-flash` 等 |

### 第三方代理

如果你使用第三方代理服务（如 OpenRouter、OpenAI 代理等），需要修改 Base URL 为实际的 API 地址。

## 项目结构

```
邮件答复Chrome 插件/
├── manifest.json          # 扩展配置文件
├── README.md              # 项目文档
├── CLAUDE.md              # AI 开发指南
├── .gitignore             # Git 忽略配置
├── popup/                 # 弹窗界面
│   ├── popup.html         # 弹窗 HTML
│   ├── popup.js           # 弹窗逻辑
│   └── popup.css          # 弹窗样式
├── content/               # Content Script
│   └── content.js         # 注入脚本（读取邮件）
├── background/            # Background Script
│   └── background.js      # 后台逻辑（API调用、存储）
├── options/               # 设置页面
│   ├── options.html       # 设置页面 HTML
│   ├── options.js         # 设置逻辑
│   └── options.css        # 设置页面样式
└── icons/                 # 图标
    └── icon.svg           # 扩展图标
```

## 技术栈

- **Manifest V3**: Chrome 扩展标准
- **Vanilla JavaScript**: 无框架依赖
- **chrome.storage.local**: 本地数据存储
- **chrome.scripting**: 页面内容注入
- **AI API**: OpenAI / Anthropic / Gemini 兼容接口

## 兼容性

- **支持的 Outlook 域名**:
  - outlook.office.com
  - outlook.live.com
  - outlook.office365.com
  - outlook.cloud.microsoft.com
- Chrome 88+
- Edge 88+
- 理论上支持 Safari 15+ (需签名)

## 更新日志

### v1.0.2 (2026-04-17)

- 新增 outlook.cloud.microsoft.com 支持

- 修复 Outlook 新版 React 架构邮件内容读取问题
- 新增 `.body-100` 选择器支持新版 Outlook
- 新增 `[role="heading"]` 和 `.JdFsz` 选择器支持邮件主题
- 更新 `isReadingEmail()` 检测函数

### v1.0.0 (2025-04-17)

- 初始版本发布
- 支持 OpenAI/Anthropic/Gemini API
- 支持自定义 Base URL 和模型 ID
- 支持一键复制和填充到邮件
- 支持模板保存和匹配

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！