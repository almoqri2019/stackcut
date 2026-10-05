const STORAGE_KEY = 'stackcut_tools';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    if (!result[STORAGE_KEY]) {
      chrome.storage.local.set({
        [STORAGE_KEY]: [
          { id: 1, name: 'ChatGPT Plus', price: 20, cycle: 'monthly', status: 'used' },
          { id: 2, name: 'Claude Pro', price: 20, cycle: 'monthly', status: 'forgot' },
          { id: 3, name: 'Perplexity Pro', price: 20, cycle: 'weekly', status: 'forgot' }
        ]
      });
    }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'readTools') {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      sendResponse({ tools: result[STORAGE_KEY] || [] });
    });
    return true;
  }

  if (message.type === 'saveTools') {
    chrome.storage.local.set({ [STORAGE_KEY]: message.tools || [] }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'detectTool') {
    const host = message.host || '';
    const map = {
      'openai.com': 'ChatGPT Plus',
      'chatgpt.com': 'ChatGPT Plus',
      'claude.ai': 'Claude Pro',
      'perplexity.ai': 'Perplexity Pro',
      'midjourney.com': 'Midjourney',
      'cursor.com': 'Cursor'
    };
    const match = Object.entries(map).find(([key]) => host.includes(key));
    sendResponse({ name: match ? match[1] : null });
    return true;
  }
});
