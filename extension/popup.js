const STORAGE_KEY = 'stackcut_tools';
const PRO_STATUS_KEY = 'stackcut_pro_status';
const PRO_STATUS_TTL_MS = 300000;
const PRO_STATUS_ENDPOINT = 'https://stackcut.site/api/pro-status';
const CANONICAL_SITE_URL = 'https://stackcut.site';
const FREE_LIMIT = 3;

async function getCachedProStatus() {
  try {
    const result = await chrome.storage.local.get(PRO_STATUS_KEY);
    const status = result[PRO_STATUS_KEY];
    if (!status || !status.active || Number(status.expiresAt) <= Date.now()) {
      return false;
    }
    return true;
  } catch (error) {
    return false;
  }
}

async function refreshProStatus() {
  try {
    const response = await fetch(PRO_STATUS_ENDPOINT, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) {
      await chrome.storage.local.remove(PRO_STATUS_KEY);
      return false;
    }
    const payload = await response.json();
    const active = Boolean(payload && payload.active === true && payload.status === 'active');
    await chrome.storage.local.set({ [PRO_STATUS_KEY]: { active, expiresAt: Date.now() + PRO_STATUS_TTL_MS } });
    return active;
  } catch (error) {
    await chrome.storage.local.remove(PRO_STATUS_KEY);
    return false;
  }
}

async function isPro() {
  return (await getCachedProStatus()) || (await refreshProStatus());
}

function toast(msg) {
  let node = document.getElementById('pro-toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'pro-toast';
    node.className = 'pro-toast';
    document.body.appendChild(node);
  }
  node.textContent = msg;
  node.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    node.style.display = 'none';
  }, 3000);
}

async function requirePro(feature) {
  if (await isPro()) return true;
  toast(`Go Pro to unlock ${feature} — $2.84/mo`);
  setTimeout(() => chrome.tabs.create({ url: `${CANONICAL_SITE_URL}/#pricing` }), 800);
  return false;
}

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
let tools = [];

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

function render(nextTools = tools) {
  tools = nextTools;
  const { burn, waste } = calcTotals(tools);
  burnEl.textContent = `$${burn.toFixed(0)}`;
  wasteEl.textContent = `$${waste.toFixed(0)}`;
  document.getElementById('summary').textContent = `$${burn.toFixed(0)}/mo`;
  isPro().then((pro) => {
    proBadge.textContent = pro ? 'PRO' : 'FREE';
    proBadge.className = `badge ${pro ? 'pro' : 'free'}`;
    document.getElementById('proOffer').classList.toggle('hidden', pro);
    document.getElementById('proActive').classList.toggle('hidden', !pro);
  });

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

  chrome.storage.local.get([STORAGE_KEY], async (result) => {
    tools = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    if (tools.length >= FREE_LIMIT) {
      if (!await isPro()) {
        toast('Free limit 3 — Go Pro');
        document.getElementById('freeBanner').classList.remove('hidden');
        return;
      }
    }
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

document.getElementById('exportBtn').onclick = async () => {
  if (!await requirePro('Export')) return;
  const blob = new Blob([JSON.stringify(tools, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  if (chrome.downloads?.download) {
    chrome.downloads.download({ url, filename: 'stackcutify-export.json' });
  } else {
    window.open(url);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

document.getElementById('openApp').onclick = () => {
  chrome.tabs.create({ url: `${CANONICAL_SITE_URL}/app` });
};

document.getElementById('proUpgrade').onclick = () => {
  chrome.tabs.create({ url: `${CANONICAL_SITE_URL}/pro` });
};

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

const taxForm = document.getElementById('taxForm');
const taxCountry = document.getElementById('taxCountry');
const taxManual = document.getElementById('taxManualEnabled');
const taxManualRate = document.getElementById('taxManualRate');
const taxMessage = document.getElementById('taxMessage');
const taxResult = document.getElementById('taxResult');

for (const country of window.StackcutTax.countries) {
  const option = document.createElement('option');
  option.value = country.code;
  const support = window.StackcutTax.euVatCountries.includes(country.code)
    ? 'EU standard VAT reference'
    : 'manual only / unsupported';
  option.textContent = `${country.name} (${country.code}) — ${support}`;
  taxCountry.append(option);
}
taxManual.addEventListener('change', () => {
  taxManualRate.disabled = !taxManual.checked;
  taxManualRate.required = taxManual.checked;
});
taxForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  taxResult.hidden = true;
  const jurisdiction = taxCountry.value;
  const input = {
    amount: document.getElementById('taxAmount').value,
    currency: document.getElementById('taxCurrency').value.trim().toUpperCase(),
    interval: document.getElementById('taxInterval').value,
    taxType: document.getElementById('taxType').value,
    treatment: document.getElementById('taxTreatment').value,
    jurisdiction,
    jurisdictionDetail: document.getElementById('taxLocation').value.trim(),
  };
  try {
    let rateInfo;
    if (taxManual.checked) {
      rateInfo = {
        status: 'manual', rate: taxManualRate.value, jurisdiction,
        taxType: input.taxType, userSupplied: true,
      };
    } else if (input.taxType === 'vat') {
      taxMessage.textContent = 'Looking up a public standard VAT reference…';
      const response = await fetch(
        `https://stackcut.site/api/tax-rates?country=${encodeURIComponent(jurisdiction)}`,
        { headers: { Accept: 'application/json' }, credentials: 'omit' },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.reason || `Rate lookup returned HTTP ${response.status}.`);
      rateInfo = data;
    } else {
      rateInfo = { status: 'unsupported', reason: 'Automated lookup covers EU standard VAT only. No rate was assumed.' };
    }
    const calculation = window.StackcutTax.calculate(input, rateInfo);
    if (!['verified', 'manual'].includes(calculation.status)) {
      taxMessage.textContent = calculation.reason || 'No rate available; no zero rate was assumed.';
      return;
    }
    const money = (value) => window.StackcutTax.formatMoney(value, calculation.currency);
    const provider = calculation.status === 'manual'
      ? 'Manual, user-supplied rate.'
      : `VATcomply standard-rate reference, retrieved ${calculation.retrievedAt || 'at unknown time'}.`;
    taxResult.textContent =
      `Tax: ${money(calculation.tax)} per ${calculation.interval}; total: ${money(calculation.total)}; ` +
      `monthly: ${money(calculation.monthlyEquivalent)}; annual: ${money(calculation.annualEquivalent)}. ${provider} Estimate only; invoice may differ.`;
    taxResult.hidden = false;
    taxMessage.textContent = 'Calculated locally. Only the selected country code was sent for rate lookup.';
  } catch (error) {
    taxMessage.textContent = `Could not calculate: ${error.message}`;
  }
});

getTools();
