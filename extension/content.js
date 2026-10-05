const TOOL_HOSTS = {
  'openai.com': 'ChatGPT Plus',
  'chatgpt.com': 'ChatGPT Plus',
  'claude.ai': 'Claude Pro',
  'perplexity.ai': 'Perplexity Pro',
  'midjourney.com': 'Midjourney',
  'cursor.com': 'Cursor'
};

function detectToolFromHost() {
  const host = location.hostname || '';
  const match = Object.entries(TOOL_HOSTS).find(([key]) => host.includes(key));
  return match ? match[1] : null;
}

const toolName = detectToolFromHost();
if (toolName) {
  chrome.storage.local.get(['stackcut_tools'], (result) => {
    const tools = Array.isArray(result.stackcut_tools) ? result.stackcut_tools : [];
    const existing = tools.find((t) => t.name === toolName);
    if (!existing) {
      tools.push({ id: Date.now(), name: toolName, price: 20, cycle: 'monthly', status: 'used' });
      chrome.storage.local.set({ stackcut_tools: tools });
    }
  });
}
