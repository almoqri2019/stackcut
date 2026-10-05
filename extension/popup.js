const STORAGE_KEY = 'stackcut_tools';
const PRESET = {
  'ChatGPT Plus': 20,
  'Claude Pro': 20,
  'Perplexity Pro': 20,
  'Supergrok': 30,
  'Midjourney': 30,
  'Cursor': 20,
  'Copilot': 10,
  'Jasper': 49,
  'Notion AI': 8,
  'Canva Pro': 13
};

const toolForm = document.getElementById('toolForm');
const toolName = document.getElementById('toolName');
const toolPrice = document.getElementById('toolPrice');
const toolCycle = document.getElementById('toolCycle');
const toolStatus = document.getElementById('toolStatus');
const list = document.getElementById('list');
const burnEl = document.getElementById('burn');
const wasteEl = document.getElementById('waste');
const proBadge = document.getElementById('proBadge');
const message = document.getElementById('message');

function toMonthly(price, cycle) {
  if (cycle === 'weekly') return Number(price) * 4.333;
  if (cycle === 'yearly') return Number(price) / 12;
  if (cycle === 'quarterly') return Number(price) / 3;
  return Number(price);
}

function setMessage(str) {
  message.textContent = str;
}

function calcTotals(tools) {
  let burn = 0;
  let waste = 0;
  tools.forEach((tool) => {
    const monthly = toMonthly(tool.price, tool.cycle);
    burn += monthly;
    if (tool.status === 'forgot' || tool.status === 'weekly') waste += monthly;
  });
  return { burn, waste };
}

function saveTools(tools) {
  chrome.storage.local.set({ [STORAGE_KEY]: tools }, () => render());
}

function getTools() {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const tools = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    render(tools);
  });
}

function render(tools = []) {
  const { burn, waste } = calcTotals(tools);
  burnEl.textContent = `$${burn.toFixed(0)}`;
  wasteEl.textContent = `$${waste.toFixed(0)}`;
  document.getElementById('summary').textContent = `$${burn.toFixed(0)}/mo`;
  proBadge.textContent = tools.length > 5 ? 'PRO' : 'FREE';
  proBadge.className = `badge ${tools.length > 5 ? 'pro' : 'free'}`;

  if (!tools.length) {
    list.innerHTML = '<div class="item"><div><strong>No tools yet</strong><small>Add your first AI subscription</small></div></div>';
    return;
  }

  list.innerHTML = tools.map((tool) => {
    const badgeClass = tool.status === 'forgot' ? 'forgot' : tool.status === 'weekly' ? 'weekly' : 'used';
    const monthly = toMonthly(tool.price, tool.cycle);
    return `
      <div class="item">
        <div>
          <strong>${tool.name}</strong>
          <small>${tool.cycle} • $${tool.price}</small>
        </div>
        <div style="text-align:right;">
          <div><strong>$${monthly.toFixed(0)}</strong></div>
          <span class="badge-item ${badgeClass}">${tool.status}</span>
        </div>
      </div>
    `;
  }).join('');
}

function addCurrentTool() {
  const name = toolName.value.trim();
  const rawPrice = Number(toolPrice.value);
  const price = Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : (PRESET[name] || 20);
  const cycle = toolCycle.value || 'monthly';
  const status = toolStatus.value || 'used';

  if (!name) {
    setMessage('Enter a tool name');
    return;
  }

  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const tools = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    tools.push({ id: Date.now(), name, price, cycle, status });
    saveTools(tools);
    setMessage(`${name} added`);
    toolForm.reset();
  });
}

toolForm.addEventListener('submit', (event) => {
  event.preventDefault();
  addCurrentTool();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const text = JSON.stringify(result[STORAGE_KEY] || [], null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stackcutify-tools.json';
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Exported');
  });
});

document.getElementById('importBtn').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (Array.isArray(parsed)) {
          saveTools(parsed);
          setMessage('Imported');
        } else {
          setMessage('JSON must be an array');
        }
      } catch {
        setMessage('Invalid JSON');
      }
    };
    reader.readAsText(file);
  };
  input.click();
});

toolName.addEventListener('change', (event) => {
  const v = event.target.value.trim();
  if (PRESET[v]) toolPrice.value = PRESET[v];
});

getTools();
