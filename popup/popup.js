// Popup 逻辑 - 处理 UI 交互和消息传递

let currentEmail = null;
let currentReply = '';

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

async function init() {
  showLoading();

  try {
    // 1. 检查是否已配置 API Key
    const settings = await getSettings();
    if (!settings.apiType || !settings.apiKey) {
      showError('请先在设置中配置 API Key');
      document.getElementById('settingsBtn').addEventListener('click', openSettings);
      return;
    }

    // 2. 获取当前邮件内容
    const emailData = await getEmailContent();

    if (!emailData || !emailData.subject) {
      showNoEmail();
      return;
    }

    currentEmail = emailData;

    // 3. 显示邮件信息
    displayEmailInfo(emailData);

    // 4. 生成回复建议
    await generateReply(emailData);

    // 5. 加载历史模板
    await loadTemplates();

    showMainContent();

  } catch (error) {
    console.error('初始化失败:', error);
    showError(error.message);
  }
}

// 获取邮件内容
async function getEmailContent() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        reject(new Error('无法获取当前标签页'));
        return;
      }

      const tab = tabs[0];

      // 检查 URL 是否在支持的域名范围内
      const supportedHosts = ['outlook.live.com', 'outlook.office.com', 'outlook.office365.com'];
      let urlObj;
      try {
        urlObj = new URL(tab.url);
      } catch (e) {
        reject(new Error('无法解析页面 URL'));
        return;
      }
      const isSupported = supportedHosts.some(host => urlObj.hostname.includes(host));

      if (!isSupported) {
        reject(new Error('请在 Outlook 网页版 (outlook.office.com / outlook.live.com) 中使用此插件'));
        return;
      }

      // 首先 ping 一下检查 content script 是否加载
      chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script 未加载，尝试动态注入
          console.log('[邮件智能答复助手] Content script 未加载，尝试动态注入...');
          injectContentScript(tab.id)
            .then(() => {
              setTimeout(() => getEmailContentWithRetry(tab.id, 0, resolve, reject), 500);
            })
            .catch(err => {
              reject(new Error('无法加载脚本，请刷新 Outlook 页面后重试'));
            });
        } else {
          getEmailContentWithRetry(tab.id, 0, resolve, reject);
        }
      });
    });
  });
}

// 带重试的获取邮件内容
function getEmailContentWithRetry(tabId, attempt, resolve, reject) {
  chrome.tabs.sendMessage(tabId, { action: 'getEmailContent' }, (response) => {
    if (chrome.runtime.lastError) {
      if (attempt < 2) {
        setTimeout(() => getEmailContentWithRetry(tabId, attempt + 1, resolve, reject), 500);
      } else {
        reject(new Error('无法获取邮件内容，请刷新页面后重试'));
      }
    } else if (response && response.subject) {
      resolve(response);
    } else if (response) {
      reject(new Error('未找到邮件内容，请确保已打开一封邮件'));
    } else {
      reject(new Error('无法读取邮件，请确保已打开一封邮件'));
    }
  });
}

// 动态注入 content script
async function injectContentScript(tabId) {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== 'undefined' && chrome.scripting) {
      chrome.scripting.executeScript(
        { target: { tabId: tabId }, files: ['content/content.js'] },
        (results) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(results);
          }
        }
      );
    } else {
      reject(new Error('scripting API 不可用'));
    }
  });
}

// 获取设置
async function getSettings() {
  return await chrome.runtime.sendMessage({ action: 'getSettings' });
}

// 显示邮件信息
function displayEmailInfo(emailData) {
  document.getElementById('emailSubject').textContent = emailData.subject || '-';
  document.getElementById('emailSender').textContent = emailData.sender || '-';

  const langBadge = document.getElementById('emailLanguage');
  langBadge.textContent = emailData.language === 'zh' ? '中文' : 'English';
  langBadge.className = `badge badge-${emailData.language}`;
}

// 生成回复
async function generateReply(emailData, forceAI = false) {
  showTyping();

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'generateReply',
      emailData: emailData
    });

    if (response.error) {
      throw new Error(response.error);
    }

    currentReply = response.content;

    // 显示回复内容
    const replyContent = document.getElementById('replyContent');
    replyContent.textContent = response.content;

    // 显示来源
    const sourceBadge = document.getElementById('replySource');
    if (response.type === 'database') {
      sourceBadge.textContent = '模板匹配';
      sourceBadge.className = 'badge badge-source database';
    } else {
      sourceBadge.textContent = 'AI 生成';
      sourceBadge.className = 'badge badge-source ai';
    }

  } catch (error) {
    console.error('生成回复失败:', error);
    const replyContent = document.getElementById('replyContent');
    replyContent.textContent = `生成回复失败: ${error.message}`;
  }
}

// 加载历史模板
async function loadTemplates() {
  try {
    const templates = await chrome.runtime.sendMessage({ action: 'getTemplates' });

    const templateList = document.getElementById('templateList');
    const templateCount = document.getElementById('templateCount');
    templateCount.textContent = `(${templates.length})`;

    if (!templates || templates.length === 0) {
      templateList.innerHTML = '<p class="empty-text">暂无保存的模板</p>';
      return;
    }

    templateList.innerHTML = templates.map(t => `
      <div class="template-item" data-id="${t.id}">
        <div class="delete-btn" title="删除" onclick="deleteTemplate(event, ${t.id})">✕</div>
        <div class="template-subject">${escapeHtml(t.subject)}</div>
        <div class="template-preview">${escapeHtml(t.reply_content)}</div>
        <div class="template-meta">
          <span class="badge">${getQuestionTypeName(t.question_type)}</span>
          <span class="badge badge-${t.language}">${t.language === 'zh' ? '中文' : 'EN'}</span>
        </div>
      </div>
    `).join('');

    // 添加点击事件
    document.querySelectorAll('.template-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) return;
        const templateId = parseInt(item.dataset.id);
        const template = templates.find(t => t.id === templateId);
        if (template) {
          currentReply = template.reply_content;
          document.getElementById('replyContent').textContent = template.reply_content;
          showToast('已加载模板', 'success');
        }
      });
    });

  } catch (error) {
    console.error('加载模板失败:', error);
  }
}

// 删除模板
async function deleteTemplate(event, id) {
  event.stopPropagation();

  try {
    await chrome.runtime.sendMessage({
      action: 'deleteTemplate',
      id: id
    });

    // 重新加载模板列表
    await loadTemplates();
    showToast('模板已删除', 'success');
  } catch (error) {
    console.error('删除模板失败:', error);
    showToast('删除失败', 'error');
  }
}

// 保存为模板
async function saveAsTemplate() {
  if (!currentEmail || !currentReply) return;

  try {
    await chrome.runtime.sendMessage({
      action: 'saveTemplate',
      template: {
        subject: currentEmail.subject,
        content_summary: currentEmail.body.substring(0, 200),
        reply_content: currentReply,
        language: currentEmail.language
      }
    });

    // 重新加载模板列表
    await loadTemplates();
    showToast('已保存为模板', 'success');

  } catch (error) {
    console.error('保存模板失败:', error);
    showToast(`保存失败: ${error.message}`, 'error');
  }
}

// 复制回复
async function copyReply() {
  if (!currentReply) return;

  try {
    await navigator.clipboard.writeText(currentReply);
    showToast('已复制到剪贴板', 'success');
  } catch (error) {
    console.error('复制失败:', error);
    showToast('复制失败', 'error');
  }
}

// 填充到 Outlook 邮件窗口
async function fillToOutlook() {
  if (!currentReply) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'fillToOutlook',
      content: currentReply
    });

    if (response.success) {
      showToast('已填充到邮件窗口', 'success');
    } else {
      showToast(response.error || '填充失败', 'error');
    }
  } catch (error) {
    console.error('填充失败:', error);
    showToast('填充失败: ' + error.message, 'error');
  }
}

// 打开设置页面
function openSettings() {
  chrome.runtime.sendMessage({ action: 'openOptionsPage' });
}

// UI 状态管理
function showLoading() {
  document.getElementById('loading').style.display = 'flex';
  document.getElementById('noEmail').style.display = 'none';
  document.getElementById('error').style.display = 'none';
  document.getElementById('mainContent').style.display = 'none';
}

function showNoEmail() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('noEmail').style.display = 'flex';
  document.getElementById('error').style.display = 'none';
  document.getElementById('mainContent').style.display = 'none';
}

function showError(message) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('noEmail').style.display = 'none';
  document.getElementById('error').style.display = 'flex';
  document.getElementById('errorMessage').textContent = message;
  document.getElementById('mainContent').style.display = 'none';
}

function showMainContent() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('noEmail').style.display = 'none';
  document.getElementById('error').style.display = 'none';
  document.getElementById('mainContent').style.display = 'flex';
}

function showTyping() {
  const replyContent = document.getElementById('replyContent');
  replyContent.innerHTML = `
    <div class="typing-indicator">
      <span></span><span></span><span></span>
    </div>
    <p>AI 正在生成回复...</p>
  `;
  document.getElementById('replySource').textContent = '';
  document.getElementById('replySource').className = 'badge badge-source';
}

// Toast 提示
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// 工具函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getQuestionTypeName(type) {
  const types = {
    meeting_invite: '会议邀请',
    question: '询问',
    request: '请求',
    thank: '感谢',
    notification: '通知',
    urgent: '紧急',
    info: '信息',
    reply: '回复',
    other: '其他'
  };
  return types[type] || '其他';
}

// 绑定按钮事件
document.getElementById('copyBtn').addEventListener('click', copyReply);
document.getElementById('fillBtn').addEventListener('click', fillToOutlook);
document.getElementById('saveBtn').addEventListener('click', saveAsTemplate);
document.getElementById('refreshBtn').addEventListener('click', () => {
  if (currentEmail) generateReply(currentEmail, true);
});
document.getElementById('settingsBtn').addEventListener('click', openSettings);