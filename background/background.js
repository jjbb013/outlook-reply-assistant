// Background Script - 处理 API 调用和消息传递

// ========== 使用 chrome.storage 的存储模块 ==========
const Storage = {
  async get(key, defaultValue = null) {
    const result = await chrome.storage.local.get(key);
    return result[key] !== undefined ? result[key] : defaultValue;
  },

  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },

  async remove(key) {
    await chrome.storage.local.remove(key);
  }
};

// 模板存储键名
const TEMPLATES_KEY = 'email_templates';
const HISTORY_KEY = 'email_history';

// 模板操作
async function getAllTemplates() {
  return await Storage.get(TEMPLATES_KEY, []);
}

async function addTemplate(template) {
  const templates = await getAllTemplates();
  const newTemplate = {
    ...template,
    id: Date.now(),
    created_at: Date.now()
  };
  templates.push(newTemplate);
  await Storage.set(TEMPLATES_KEY, templates);
  return newTemplate;
}

async function deleteTemplate(id) {
  const templates = await getAllTemplates();
  const filtered = templates.filter(t => t.id !== id);
  await Storage.set(TEMPLATES_KEY, filtered);
}

async function findMatchingTemplates(emailContent, options = {}) {
  const templates = await getAllTemplates();
  const { language = 'en' } = options;

  let filtered = templates.filter(t => t.language === language);

  // 计算匹配分数
  const subjectLower = (emailContent.subject || '').toLowerCase();
  filtered = filtered.map(t => {
    let score = 0;
    const tSubject = (t.subject || '').toLowerCase();

    if (tSubject && subjectLower.includes(tSubject)) {
      score += 50;
    }

    if (emailContent.body && t.content_summary) {
      const contentWords = new Set(emailContent.body.toLowerCase().split(/\s+/));
      const summaryWords = new Set(t.content_summary.toLowerCase().split(/\s+/));
      const intersection = [...contentWords].filter(w => summaryWords.has(w));
      score += intersection.length * 5;
    }

    return { ...t, matchScore: score };
  });

  filtered.sort((a, b) => b.matchScore - a.matchScore);
  return filtered.slice(0, 5);
}

// 历史记录操作
async function getHistory() {
  return await Storage.get(HISTORY_KEY, []);
}

async function addHistory(history) {
  const historyList = await getHistory();
  const newHistory = {
    ...history,
    id: Date.now(),
    created_at: Date.now()
  };
  historyList.unshift(newHistory);
  // 只保留最近 100 条
  await Storage.set(HISTORY_KEY, historyList.slice(0, 100));
  return newHistory;
}

// ========== 核心逻辑 ==========

// 问题类型分类
const QUESTION_TYPES = {
  MEETING_INVITE: 'meeting_invite',
  QUESTION: 'question',
  REQUEST: 'request',
  THANK: 'thank',
  NOTIFICATION: 'notification',
  URGENT: 'urgent',
  INFO: 'info',
  REPLY: 'reply',
  OTHER: 'other'
};

// 消息监听
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true;
});

// 处理各种消息
async function handleMessage(request, sender) {
  const { action } = request;

  switch (action) {
    case 'generateReply':
      return await generateReply(request.emailData);

    case 'classifyQuestion':
      return await classifyQuestion(request.content);

    case 'saveTemplate':
      return await saveTemplate(request.template);

    case 'getTemplates':
      return await getTemplates(request.options);

    case 'deleteTemplate':
      return await deleteTemplate(request.id);

    case 'getSettings':
      return await getSettings();

    case 'saveSettings':
      return await saveSettings(request.settings);

    case 'testApi':
      return await testApiConnection(request.settings);

    case 'openOptionsPage':
      return await chrome.runtime.openOptionsPage();

    case 'fillToOutlook':
      return await fillToOutlook(request.content);

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// 加载设置
async function getSettings() {
  const keys = ['apiType', 'apiKey', 'baseUrl', 'model', 'outputFormat', 'language'];
  const result = await chrome.storage.local.get(keys);
  return result;
}

// 保存设置
async function saveSettings(settings) {
  await chrome.storage.local.set(settings);
  return { success: true };
}

// 测试 API 连接
async function testApiConnection(settings) {
  const { apiType, apiKey, baseUrl, model } = settings;

  try {
    let response;
    if (apiType === 'openai') {
      response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
    } else if (apiType === 'anthropic') {
      response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'hi' }]
        })
      });
    } else if (apiType === 'gemini') {
      response = await fetch(`${baseUrl}/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'hi' }] }]
        })
      });
    }

    if (response && response.ok) {
      return { success: true };
    } else {
      const error = await response?.json().catch(() => ({}));
      return { success: false, error: error.error?.message || `HTTP ${response?.status}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 生成回复
async function generateReply(emailData) {
  const settings = await getSettings();

  if (!settings.apiType || !settings.apiKey || !settings.baseUrl || !settings.model) {
    throw new Error('请先在设置中配置 API');
  }

  // 1. 先尝试从数据库匹配模板
  const templates = await findMatchingTemplates(
    { subject: emailData.subject, body: emailData.body },
    { language: emailData.language }
  );

  if (templates.length > 0 && templates[0].matchScore > 30) {
    // 保存到历史记录
    await addHistory({
      subject: emailData.subject,
      content: emailData.body,
      reply_used: templates[0].reply_content,
      source: 'database'
    });

    return {
      type: 'database',
      content: templates[0].reply_content,
      template: templates[0]
    };
  }

  // 2. 使用 AI 生成回复
  const prompt = buildPrompt(emailData, settings);

  let result;
  if (settings.apiType === 'openai') {
    result = await callOpenAIAPI(settings, prompt);
  } else if (settings.apiType === 'anthropic') {
    result = await callAnthropicAPI(settings, prompt);
  } else if (settings.apiType === 'gemini') {
    result = await callGeminiAPI(settings, prompt);
  }

  // 保存到历史记录
  await addHistory({
    subject: emailData.subject,
    content: emailData.body,
    reply_used: result,
    source: 'ai'
  });

  return {
    type: 'ai',
    content: result
  };
}

// 构建提示词
function buildPrompt(emailData, settings) {
  const language = emailData.language === 'zh' ? '中文' : '英文';
  const langInstruction = emailData.language === 'zh'
    ? '请用中文回复'
    : 'Please reply in English';

  return `你是一个专业的邮件助手。请根据以下邮件内容，生成一封合适的回复。

邮件信息：
- 主题：${emailData.subject || '无主题'}
- 发件人：${emailData.sender || '未知'}
- 语言：${language}

邮件内容：
${emailData.body || '（无正文）'}

要求：
1. ${langInstruction}
2. 回复要专业、简洁、有礼貌
3. 适当回应邮件中提出的问题或请求
4. 长度控制在 100-200 字
5. 如果是会议邀请，需要确认是否参加
6. 直接输出回复内容，不需要额外解释

回复内容：`; // 末尾留空让 AI 续写
}

// 调用 OpenAI 兼容 API
async function callOpenAIAPI(settings, prompt) {
  const { baseUrl, apiKey, model, outputFormat } = settings;
  const maxTokens = 1000;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API 请求失败: ${response.status}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || '';

  // 如果是 JSON 格式输出，尝试解析
  if (outputFormat === 'json') {
    try {
      const parsed = JSON.parse(content);
      content = parsed.reply || parsed.text || parsed.content || JSON.stringify(parsed, null, 2);
    } catch (e) {
      // 解析失败，返回原始内容
    }
  }

  return content;
}

// 调用 Anthropic API
async function callAnthropicAPI(settings, prompt) {
  const { baseUrl, apiKey, model, outputFormat } = settings;
  const maxTokens = 1024;

  // 如果使用第三方兼容接口，可能需要调整端点
  const endpoint = baseUrl.includes('anthropic.com')
    ? `${baseUrl}/messages`
    : `${baseUrl}/messages`;

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API 请求失败: ${response.status}`);
  }

  const data = await response.json();
  let content = data.content?.[0]?.text || '';

  if (outputFormat === 'json') {
    try {
      const parsed = JSON.parse(content);
      content = parsed.reply || parsed.text || parsed.content || JSON.stringify(parsed, null, 2);
    } catch (e) {
      // 解析失败，返回原始内容
    }
  }

  return content;
}

// 调用 Google Gemini API
async function callGeminiAPI(settings, prompt) {
  const { baseUrl, apiKey, model, outputFormat } = settings;

  // Gemini API 端点格式
  const endpoint = `${baseUrl}/models/${model}:generateContent`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      contents: [
        { parts: [{ text: prompt }] }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000
      }
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API 请求失败: ${response.status}`);
  }

  const data = await response.json();
  let content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (outputFormat === 'json') {
    try {
      const parsed = JSON.parse(content);
      content = parsed.reply || parsed.text || parsed.content || JSON.stringify(parsed, null, 2);
    } catch (e) {
      // 解析失败，返回原始内容
    }
  }

  return content;
}

// 分类问题类型
async function classifyQuestion(content) {
  const settings = await getSettings();

  if (!settings.apiType || !settings.apiKey) {
    return QUESTION_TYPES.OTHER;
  }

  const prompt = `分析以下邮件内容，判断它属于哪种类型：

邮件内容：${content.substring(0, 500)}

类型选项：
- meeting_invite: 会议邀请
- question: 询问问题
- request: 请求帮助/资源
- thank: 感谢信
- notification: 通知
- urgent: 紧急事项
- info: 信息分享
- reply: 普通回复
- other: 其他

直接输出类型名称，不要输出其他内容。`;

  try {
    let result;
    if (settings.apiType === 'openai') {
      result = await callOpenAIAPI(settings, prompt);
    } else if (settings.apiType === 'anthropic') {
      result = await callAnthropicAPI(settings, prompt);
    } else if (settings.apiType === 'gemini') {
      result = await callGeminiAPI(settings, prompt);
    }

    const type = result.trim().toLowerCase().replace(/["']/g, '');
    return QUESTION_TYPES[type] || QUESTION_TYPES.OTHER;
  } catch (e) {
    console.error('分类失败:', e);
    return QUESTION_TYPES.OTHER;
  }
}

// 保存模板
async function saveTemplate(template) {
  const questionType = await classifyQuestion(template.content_summary || template.subject);
  return await addTemplate({
    ...template,
    question_type: questionType
  });
}

// 获取模板列表
async function getTemplates(options = {}) {
  return await getAllTemplates();
}

// 填充内容到 Outlook 邮件窗口
async function fillToOutlook(content) {
  // 注入脚本到 Outlook 页面
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) {
    throw new Error('无法获取当前标签页');
  }

  const tab = tabs[0];

  // 检查是否在 Outlook 页面
  if (!tab.url || !tab.url.includes('outlook')) {
    throw new Error('请在 Outlook 页面中使用此功能');
  }

  // 使用 scripting API 执行脚本
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => {
        // Outlook Web 的回复输入框选择器
        const selectors = [
          // 新版 Outlook
          '[role="textbox"][aria-label*="compose"]',
          '[data-legacy-placeholder]',
          // 旧版 Outlook
          '.compose-content [role="textbox"]',
          '#ComposeBody',
          // 通用
          '[contenteditable="true"]',
          'div[role="textbox"]'
        ];

        for (const selector of selectors) {
          const editor = document.querySelector(selector);
          if (editor) {
            // 尝试多种方式填充内容
            if (editor.innerHTML !== undefined) {
              editor.innerHTML = text.replace(/\n/g, '<br>');
            } else {
              editor.value = text;
            }

            // 触发 input 事件以确保 Outlook 识别输入
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));

            return { success: true };
          }
        }

        return { success: false, error: '未找到回复输入框' };
      },
      args: [content]
    });

    if (results && results[0] && results[0].result) {
      if (results[0].result.success) {
        return { success: true };
      } else {
        throw new Error(results[0].result.error || '填充失败');
      }
    } else {
      throw new Error('脚本执行失败');
    }
  } catch (error) {
    if (error.message.includes('Cannot access')) {
      throw new Error('无法访问页面，请确保在 Outlook 页面中');
    }
    throw error;
  }
}

// 初始化日志
console.log('[邮件智能答复助手] Background script 已加载');