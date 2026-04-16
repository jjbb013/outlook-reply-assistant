// Content Script - 用于注入 Outlook 网页版读取邮件内容

(function() {
  'use strict';

  // 防止重复注入
  if (window.__outlookMailReaderInjected) return;
  window.__outlookMailReaderInjected = true;

  // 监听来自后台的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getEmailContent') {
      const emailData = extractEmailContent();
      sendResponse(emailData);
    }
    return true;
  });

  // 提取邮件内容
  function extractEmailContent() {
    const result = {
      subject: '',
      sender: '',
      recipient: '',
      body: '',
      language: 'en',
      rawHtml: '',
      timestamp: Date.now()
    };

    // 尝试多种选择器来获取邮件内容
    // Outlook 2024+ 使用新的 React 架构

    // 1. 获取主题
    const subjectSelectors = [
      '[data-testid="subject"]',
      '.subject-line',
      '[role="heading"][aria-level="1"]',
      'h1[aria-label*="Subject"]',
      '.x_subject',
      '[class*="subject"]'
    ];
    result.subject = getTextContent(subjectSelectors);

    // 2. 获取发件人
    const senderSelectors = [
      '[data-testid="sender"]',
      '.sender',
      '[aria-label*="From"]',
      '.x_sender',
      '[class*="sender"]'
    ];
    result.sender = getTextContent(senderSelectors);

    // 3. 获取收件人
    const recipientSelectors = [
      '[data-testid="to"]',
      '.recipients',
      '[aria-label*="To"]',
      '.x_recipient',
      '[class*="recipient"]'
    ];
    result.recipient = getTextContent(recipientSelectors);

    // 4. 获取邮件正文 - 多种方法尝试
    result.body = getEmailBody();

    // 5. 检测语言
    result.language = detectLanguage(result.body || result.subject);

    // 6. 保存原始 HTML 用于调试
    const bodyContainer = document.querySelector('[data-testid="message-body"], [role="document"], .message-body-content');
    if (bodyContainer) {
      result.rawHtml = bodyContainer.innerHTML;
    }

    return result;
  }

  // 尝试多种选择器获取文本内容
  function getTextContent(selectors) {
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      } catch (e) {
        // 忽略无效选择器
      }
    }
    return '';
  }

  // 获取邮件正文
  function getEmailBody() {
    // 方法1: 标准 Outlook 选择器
    const bodySelectors = [
      '[data-testid="message-body"]',
      '[role="document"]',
      '.message-body-content',
      '.x_body',
      '[class*="bodyContent"]'
    ];

    for (const selector of bodySelectors) {
      const element = document.querySelector(selector);
      if (element) {
        return cleanText(element.innerText || element.textContent);
      }
    }

    // 方法2: 查找阅读窗格中的内容
    const readingPaneSelectors = [
      '.ReadingPane',
      '#ReadingPane',
      '[role="main"]',
      '[aria-label*="message"]'
    ];

    for (const selector of readingPaneSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.innerText || element.textContent;
        if (text && text.length > 50) {
          return cleanText(text);
        }
      }
    }

    // 方法3: 查找包含邮件内容的 iframe
    const iframes = document.querySelectorAll('iframe[src*="outlook"]');
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const body = iframeDoc.body;
        if (body && body.innerText && body.innerText.length > 50) {
          return cleanText(body.innerText);
        }
      } catch (e) {
        // 跨域无法访问
      }
    }

    return '';
  }

  // 清理文本
  function cleanText(text) {
    if (!text) return '';
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim()
      .substring(0, 5000); // 限制长度
  }

  // 语言检测
  function detectLanguage(text) {
    if (!text) return 'en';

    // 统计中文字符数量
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const totalChars = text.replace(/\s/g, '').length;

    if (totalChars === 0) return 'en';

    // 如果中文字符超过 20%，认为是中文邮件
    return chineseChars / totalChars > 0.2 ? 'zh' : 'en';
  }

  // 检测是否在邮件阅读视图
  function isReadingEmail() {
    return document.querySelector('[data-testid="message-body"], [role="document"], .message-body-content, .ReadingPane') !== null;
  }

  // 通知后台脚本邮件视图已加载
  function notifyBackground() {
    chrome.runtime.sendMessage({
      action: 'emailViewChanged',
      isReading: isReadingEmail()
    }).catch(() => {
      // 忽略后台连接错误
    });
  }

  // 初始化 MutationObserver 监听页面变化
  const observer = new MutationObserver((mutations) => {
    if (isReadingEmail()) {
      notifyBackground();
    }
  });

  // 页面加载完成后启动观察
  if (document.readyState === 'complete') {
    setTimeout(() => notifyBackground(), 1000);
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    window.addEventListener('load', () => {
      setTimeout(() => notifyBackground(), 1000);
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  console.log('[邮件智能答复助手] Content script 已加载');
})();