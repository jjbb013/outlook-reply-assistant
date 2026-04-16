// 设置页面逻辑

// API 类型配置
const API_CONFIGS = {
  openai: {
    name: 'OpenAI 兼容',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    placeholder: {
      baseUrl: 'https://api.openai.com/v1 或第三方代理地址',
      model: 'gpt-4o, gpt-4-turbo 等'
    }
  },
  anthropic: {
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    placeholder: {
      baseUrl: 'https://api.anthropic.com/v1 或第三方代理地址',
      model: 'claude-sonnet-4-20250514 等'
    }
  },
  gemini: {
    name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    placeholder: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-2.0-flash, gemini-1.5-pro 等'
    }
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // 加载已有设置
  await loadSettings();

  // 绑定事件
  bindEvents();
}

// 加载设置
async function loadSettings() {
  const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });

  if (settings.apiType) {
    document.querySelector(`input[name="apiType"][value="${settings.apiType}"]`).checked = true;
    updateFormByApiType(settings.apiType);
  }

  if (settings.apiKey) {
    document.getElementById('apiKey').value = settings.apiKey;
  }

  if (settings.baseUrl) {
    document.getElementById('baseUrl').value = settings.baseUrl;
  } else {
    // 设置默认值
    const apiType = document.querySelector('input[name="apiType"]:checked').value;
    document.getElementById('baseUrl').value = API_CONFIGS[apiType].defaultBaseUrl;
  }

  if (settings.model) {
    document.getElementById('model').value = settings.model;
  } else {
    const apiType = document.querySelector('input[name="apiType"]:checked').value;
    document.getElementById('model').value = API_CONFIGS[apiType].defaultModel;
  }

  if (settings.outputFormat) {
    document.querySelector(`input[name="outputFormat"][value="${settings.outputFormat}"]`).checked = true;
  }

  if (settings.language) {
    document.querySelector(`input[ name="language"][value="${settings.language}"]`).checked = true;
  }
}

// 根据 API 类型更新表单
function updateFormByApiType(apiType) {
  const config = API_CONFIGS[apiType];

  document.getElementById('baseUrl').placeholder = config.placeholder.baseUrl;
  document.getElementById('model').placeholder = config.placeholder.model;

  // 如果用户没有自定义设置过 baseUrl，则使用默认值
  const currentBaseUrl = document.getElementById('baseUrl').value;
  if (!currentBaseUrl || currentBaseUrl === API_CONFIGS.openai.defaultBaseUrl ||
      currentBaseUrl === API_CONFIGS.anthropic.defaultBaseUrl ||
      currentBaseUrl === API_CONFIGS.gemini.defaultBaseUrl) {
    document.getElementById('baseUrl').value = config.defaultBaseUrl;
  }

  const currentModel = document.getElementById('model').value;
  if (!currentModel) {
    document.getElementById('model').value = config.defaultModel;
  }
}

// 绑定事件
function bindEvents() {
  // API 类型变更
  document.querySelectorAll('input[name="apiType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      updateFormByApiType(e.target.value);
    });
  });

  // 保存设置
  document.getElementById('saveBtn').addEventListener('click', saveSettings);

  // 测试 API
  document.getElementById('testApiBtn').addEventListener('click', testApi);

  // 导出数据
  document.getElementById('exportBtn').addEventListener('click', exportData);

  // 导入数据
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', importData);

  // 清空数据
  document.getElementById('clearBtn').addEventListener('click', confirmClearData);
}

// 保存设置
async function saveSettings() {
  const settings = {
    apiType: document.querySelector('input[name="apiType"]:checked').value,
    apiKey: document.getElementById('apiKey').value.trim(),
    baseUrl: document.getElementById('baseUrl').value.trim(),
    model: document.getElementById('model').value.trim(),
    outputFormat: document.querySelector('input[name="outputFormat"]:checked').value,
    language: document.querySelector('input[name="language"]:checked').value
  };

  if (!settings.apiKey) {
    showToast('请输入 API Key', 'error');
    return;
  }

  if (!settings.baseUrl) {
    showToast('请输入 Base URL', 'error');
    return;
  }

  if (!settings.model) {
    showToast('请输入模型 ID', 'error');
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      action: 'saveSettings',
      settings: settings
    });
    showToast('设置已保存', 'success');
  } catch (error) {
    showToast(`保存失败: ${error.message}`, 'error');
  }
}

// 测试 API 连接
async function testApi() {
  const settings = {
    apiType: document.querySelector('input[name="apiType"]:checked').value,
    apiKey: document.getElementById('apiKey').value.trim(),
    baseUrl: document.getElementById('baseUrl').value.trim(),
    model: document.getElementById('model').value.trim()
  };

  if (!settings.apiKey || !settings.baseUrl || !settings.model) {
    showToast('请填写完整的 API 配置', 'error');
    return;
  }

  const btn = document.getElementById('testApiBtn');
  btn.disabled = true;
  btn.textContent = '测试中...';

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'testApi',
      settings: settings
    });

    if (result.success) {
      showToast('API 连接成功!', 'success');
    } else {
      showToast(`连接失败: ${result.error}`, 'error');
    }
  } catch (error) {
    showToast(`测试失败: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '测试 API 连接';
  }
}

// 导出数据
async function exportData() {
  try {
    const templates = await chrome.runtime.sendMessage({ action: 'getTemplates' });
    const history = await chrome.storage.local.get('email_history');
    const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });

    // 不导出敏感信息
    const safeSettings = { ...settings, apiKey: '' };

    const data = {
      version: '1.0.0',
      exportTime: new Date().toISOString(),
      templates: templates,
      history: history.email_history || [],
      settings: safeSettings
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `outlook-reply-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast('数据导出成功', 'success');

  } catch (error) {
    showToast(`导出失败: ${error.message}`, 'error');
  }
}

// 导入数据
async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (data.templates) {
      await chrome.storage.local.set({ email_templates: data.templates });
    }

    if (data.history) {
      await chrome.storage.local.set({ email_history: data.history });
    }

    showToast('数据导入成功', 'success');

  } catch (error) {
    showToast(`导入失败: ${error.message}`, 'error');
  }

  // 清空文件输入
  event.target.value = '';
}

// 确认清空数据
function confirmClearData() {
  if (confirm('确定要清空所有数据吗？此操作不可撤销。')) {
    clearData();
  }
}

// 清空数据
async function clearData() {
  try {
    await chrome.storage.local.remove(['email_templates', 'email_history']);
    showToast('数据已清空', 'success');
  } catch (error) {
    showToast(`清空失败: ${error.message}`, 'error');
  }
}

// Toast 提示
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), 3000);
}