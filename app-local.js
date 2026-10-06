const FREE_LIMIT = 5;
const PLAN_ID = "P-6HT714478R159110WNLBOW4Q";
const STORAGE_KEY = "stackcut_tools";
const CATEGORY_KEY = "stackcut_category";
const SIMULATION_KEY = "stackcut_simulation";
const CATEGORIES = ["Essential", "Beloved", "Discretionary", "Thin Ice"];
const BILLING_CYCLES = ["daily", "weekly", "monthly", "quarterly", "yearly"];
const BILLING_UNITS = { daily: "day", weekly: "week", monthly: "mo", quarterly: "quarter", yearly: "year" };
const USAGE_FREQUENCIES = ["daily", "weekly", "monthly", "discretionary", "forgot"];
const DECISIONS = ["Keep", "Kill", "Test"];
const PRESET_PRICES = {
  "ChatGPT Plus": 20, "Claude Pro": 20, "Perplexity Pro": 20, Supergrok: 30,
  Midjourney: 30, Cursor: 20, Copilot: 10, Jasper: 49, "Notion AI": 10, "Canva Pro": 13
};
const DEFAULT_TOOLS = [
  { id: 1, name: "ChatGPT Plus", price: 20, billing: "monthly", use: "daily", category: "Essential", decision: "Keep" },
  { id: 2, name: "Claude Pro", price: 20, billing: "monthly", use: "weekly", category: "Beloved", decision: "Test" },
  { id: 3, name: "Perplexity Pro", price: 20, billing: "weekly", use: "monthly", category: "Discretionary", decision: "Test" },
  { id: 4, name: "Supergrok", price: 30, billing: "yearly", use: "forgot", category: "Thin Ice", decision: "Kill" },
  { id: 5, name: "Midjourney", price: 30, billing: "monthly", use: "discretionary", category: "Discretionary", decision: "Test" }
];

let tools = [];
let filter = "all";
let categoryFilter = "all";
let simulationMode = false;
let simulation = {};
let catalog = [];
let storageWarningShown = false;

function isPro() {
  try {
    return localStorage.getItem("stackcutify_pro") === "true"
      || localStorage.getItem("stackcut_pro") === "active";
  } catch (error) {
    if (!storageWarningShown) {
      storageWarningShown = true;
      showToast("Browser storage is unavailable. Changes may not persist.");
    }
    return false;
  }
}

function requirePro() {
  if (isPro()) return true;
  alert(PLAN_ID);
  window.location.href = `/pro.html?plan=${PLAN_ID}`;
  return false;
}

function showToast(message) {
  const node = document.getElementById("toast");
  if (!node) return;
  node.textContent = `✓ ${message}`;
  node.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => node.classList.add("hidden"), 2800);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function toMonthly(price, billing) {
  const cycle = String(billing || "monthly").toLowerCase();
  const amount = Number(price) || 0;
  if (cycle === "weekly") return amount * 4.333333;
  if (cycle === "yearly") return amount / 12;
  if (cycle === "quarterly") return amount / 3;
  if (cycle === "daily") return amount * 30.44;
  return amount;
}

function normalizeTool(tool, index) {
  if (!tool || typeof tool !== "object" || typeof tool.name !== "string" || !tool.name.trim()) return null;
  const price = Number(tool.price);
  const legacyBilling = tool.cycle;
  const billingValue = String(tool.billing ?? legacyBilling ?? "monthly").toLowerCase();
  const billing = BILLING_CYCLES.includes(billingValue) ? billingValue : "monthly";
  const legacyUse = tool.status === "used" ? "daily" : tool.status;
  const useValue = String(tool.use ?? legacyUse ?? "monthly").toLowerCase();
  return {
    id: String(tool.id ?? `tool-${index}-${Date.now()}`),
    name: tool.name.trim().slice(0, 100),
    price: Number.isFinite(price) && price >= 0 ? Math.min(price, 100000) : 0,
    billing,
    use: USAGE_FREQUENCIES.includes(useValue) ? useValue : "monthly",
    category: CATEGORIES.includes(tool.category) ? tool.category : "Discretionary",
    trial: tool.trial === true,
    renewalDate: typeof tool.renewalDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tool.renewalDate) ? tool.renewalDate : "",
    lastUsed: typeof tool.lastUsed === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tool.lastUsed) ? tool.lastUsed : "",
    decision: DECISIONS.includes(tool.decision) ? tool.decision : "Test"
  };
}

function load() {
  let migrationRequired = false;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      tools = DEFAULT_TOOLS.map(normalizeTool);
    } else {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) throw new Error("Saved subscriptions are not a list.");
      migrationRequired = parsed.some((tool) => tool && (
        !Object.prototype.hasOwnProperty.call(tool, "billing")
        || !Object.prototype.hasOwnProperty.call(tool, "use")
        || Object.prototype.hasOwnProperty.call(tool, "cycle")
        || Object.prototype.hasOwnProperty.call(tool, "status")
      ));
      tools = parsed.map(normalizeTool).filter(Boolean);
    }
    const savedSimulation = localStorage.getItem(SIMULATION_KEY);
    simulation = savedSimulation ? JSON.parse(savedSimulation) : {};
    if (!simulation || typeof simulation !== "object" || Array.isArray(simulation)) simulation = {};
    categoryFilter = CATEGORIES.includes(localStorage.getItem(CATEGORY_KEY)) ? localStorage.getItem(CATEGORY_KEY) : "all";
    if (migrationRequired) save();
  } catch (error) {
    tools = [];
    showToast(`Could not load saved data: ${error.message}`);
  }
  checkPro();
  renderCategoryFilters();
  render();
  renderAuditNudges();
  checkRenewalAlerts();
  loadCatalog();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
    localStorage.setItem(SIMULATION_KEY, JSON.stringify(simulation));
  } catch (error) {
    showToast(`Could not save changes: ${error.message}`);
  }
}

function checkPro() {
  const pro = isPro();
  const badge = document.getElementById("proStatus");
  badge.textContent = pro ? "PRO ACTIVE" : "PRO $8.84/mo";
  badge.className = pro
    ? "text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-white font-bold"
    : "text-[10px] px-2 py-0.5 rounded-full bg-black/5";
  document.getElementById("proBanner").classList.toggle("hidden", pro || tools.length < FREE_LIMIT);
}

function toolIncluded(tool) {
  return !simulationMode || simulation[tool.id] !== false;
}

function getBurn(included = tools.filter((tool) => toolIncluded(tool)
  && (categoryFilter === "all" || tool.category === categoryFilter))) {
  let total = 0;
  let waste = 0;
  included.forEach((tool) => {
    const monthly = toMonthly(tool.price, tool.billing);
    total += monthly;
    if ((tool.use || "").toLowerCase() === "forgot") waste += monthly;
  });
  return { total, waste };
}

function totals() {
  const included = tools.filter((tool) => toolIncluded(tool)
    && (categoryFilter === "all" || tool.category === categoryFilter));
  const { total: burn, waste } = getBurn(included);
  return { included, burn, waste, savable: Math.max(0, burn - waste) };
}

function renderCategoryFilters() {
  const root = document.getElementById("categoryFilters");
  root.innerHTML = ["all", ...CATEGORIES].map((category) => {
    const label = category === "all" ? "All categories" : category;
    return `<button type="button" data-category-filter="${escapeHtml(category)}" aria-pressed="${categoryFilter === category}">${label}</button>`;
  }).join("");
  root.querySelectorAll("[data-category-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      categoryFilter = button.dataset.categoryFilter;
      try {
        localStorage.setItem(CATEGORY_KEY, categoryFilter);
      } catch (error) {
        showToast(`Could not save filter: ${error.message}`);
      }
      renderCategoryFilters();
      render();
    });
  });
}

function render() {
  const list = document.getElementById("toolList");
  const filtered = tools.filter((tool) => (
    (filter === "all" || tool.use === filter)
    && (categoryFilter === "all" || tool.category === categoryFilter)
  ));
  const { included, burn, waste, savable } = totals();
  document.getElementById("burn").innerHTML = `${money(burn)}<span class="text-[16px] text-white/40">/mo</span>`;
  document.getElementById("waste").textContent = money(waste);
  document.getElementById("savable").textContent = money(savable);
  document.getElementById("badge").textContent = `${included.length} active / ${tools.length} total`;
  document.getElementById("footerInfo").textContent = `stackcutify • local-first • ${tools.length} tools • ${simulationMode ? "simulation" : "actual"} view`;
  document.getElementById("simulationMode").checked = simulationMode;
  document.getElementById("simulationNote").textContent = simulationMode
    ? "Simulation is on. Untick any tool below to preview its removal; your saved subscriptions and actual totals remain unchanged."
    : "Simulation is off. Your tracked subscriptions determine the totals.";
  checkPro();

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-stack"><strong>No tools in this filter</strong><span>Add AI subscriptions to start your local audit.</span></div>`;
    renderTax();
    renderAuditNudges();
    return;
  }

  list.innerHTML = filtered.map((tool) => {
    const monthly = toMonthly(tool.price, tool.billing);
    const includedInSimulation = toolIncluded(tool);
    const renewal = tool.renewalDate
      ? `<span class="tool-alert">${tool.trial ? "Trial ends" : "Renews"} ${escapeHtml(tool.renewalDate)}</span>` : "";
    const trial = tool.trial ? `<span class="tool-trial">FREE TRIAL</span>` : "";
    const dormant = daysSince(tool.lastUsed) >= 30
      ? `<span class="tool-alert">Not used in 30+ days</span>` : "";
    return `<article class="subscription-card ${includedInSimulation ? "" : "tool-simulated-off"}">
      <div class="subscription-main">
        <div class="tool-icon">${escapeHtml(tool.name.slice(0, 1).toUpperCase())}</div>
          <div class="subscription-title"><strong>${escapeHtml(tool.name)}</strong>
            <div class="subscription-meta"><span>Used ${escapeHtml(tool.use)}</span><span>${tool.billing === "monthly"
              ? `${money(tool.price)}/mo billed`
              : `${money(tool.price)}/${BILLING_UNITS[tool.billing]} billed (${money(monthly)}/mo)`}</span>${trial}${renewal}${dormant}</div>
          </div>
        <div class="subscription-actions"><div class="monthly-price"><strong>${money(monthly)}</strong><small>/mo</small></div>
          <button type="button" data-action="use" data-id="${escapeHtml(tool.id)}" aria-label="Cycle usage frequency for ${escapeHtml(tool.name)}">↻</button>
          <button type="button" data-action="delete" data-id="${escapeHtml(tool.id)}" aria-label="Remove ${escapeHtml(tool.name)}">✕</button>
        </div>
      </div>
      <div class="tool-control">
        <label>Billing price <input type="number" min="0" step="0.01" data-field="price" data-id="${escapeHtml(tool.id)}" value="${tool.price}"></label>
        <label>Billing <select data-field="billing" data-id="${escapeHtml(tool.id)}">${BILLING_CYCLES.map((value) => `<option value="${value}" ${value === tool.billing ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label>Usage <select data-field="use" data-id="${escapeHtml(tool.id)}">${USAGE_FREQUENCIES.map((value) => `<option value="${value}" ${value === tool.use ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label>Category <select data-field="category" data-id="${escapeHtml(tool.id)}">${CATEGORIES.map((value) => `<option ${value === tool.category ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label>Audit <select data-field="decision" data-id="${escapeHtml(tool.id)}">${DECISIONS.map((value) => `<option ${value === tool.decision ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label>Renewal <input type="date" data-field="renewalDate" data-id="${escapeHtml(tool.id)}" value="${escapeHtml(tool.renewalDate)}"></label>
        <label>Last used <input type="date" data-field="lastUsed" data-id="${escapeHtml(tool.id)}" value="${escapeHtml(tool.lastUsed)}"></label>
        <label><input type="checkbox" data-field="trial" data-id="${escapeHtml(tool.id)}" ${tool.trial ? "checked" : ""}> Free trial</label>
        ${simulationMode ? `<label><input type="checkbox" data-simulation="${escapeHtml(tool.id)}" ${includedInSimulation ? "checked" : ""}> Include in preview</label>` : ""}
      </div>
    </article>`;
  }).join("");

  list.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
    const tool = tools.find((item) => item.id === button.dataset.id);
    if (button.dataset.action === "delete") {
      tools = tools.filter((item) => item.id !== button.dataset.id);
      delete simulation[button.dataset.id];
    } else if (tool) {
      const index = USAGE_FREQUENCIES.indexOf(tool.use);
      tool.use = USAGE_FREQUENCIES[(index + 1) % USAGE_FREQUENCIES.length];
    }
    save();
    render();
    renderCatalog();
  }));
  list.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const tool = tools.find((item) => item.id === input.dataset.id);
      if (!tool) return;
      const field = input.dataset.field;
      if (field === "price") {
        const value = Number(input.value);
        if (!Number.isFinite(value) || value < 0 || input.value === "") {
          showToast("Enter a valid non-negative price.");
          input.value = String(tool.price);
          return;
        }
        tool.price = Math.min(value, 100000);
      } else if (field === "trial") {
        tool.trial = input.checked;
      } else if (field === "billing" && BILLING_CYCLES.includes(input.value)) {
        tool.billing = input.value;
      } else if (field === "use" && USAGE_FREQUENCIES.includes(input.value)) {
        tool.use = input.value;
      } else if (field === "category" && CATEGORIES.includes(input.value)) {
        tool.category = input.value;
      } else if (field === "decision" && DECISIONS.includes(input.value)) {
        tool.decision = input.value;
      } else if (field === "renewalDate" || field === "lastUsed") {
        tool[field] = input.value;
      }
      save();
      render();
    });
  });
  list.querySelectorAll("[data-simulation]").forEach((checkbox) => checkbox.addEventListener("change", () => {
    simulation[checkbox.dataset.simulation] = checkbox.checked;
    save();
    render();
  }));
  renderTax();
  renderAuditNudges();
}

function cents(value) {
  const amount = Number(value) || 0;
  return Math.trunc((amount + Math.sign(amount) * Number.EPSILON) * 100) / 100;
}

function money(value) {
  return `$${cents(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function addTool(source = null) {
  const name = (source?.name ?? document.getElementById("toolName").value).trim();
  if (!name) {
    showToast("Enter a tool name.");
    return false;
  }
  if (!isPro() && tools.length >= FREE_LIMIT) {
    showToast("Free: 5 tools max. Go Pro for unlimited.");
    document.getElementById("proBanner").classList.remove("hidden");
    return false;
  }
  const match = findDuplicate(name);
  if (match && !window.confirm(`This looks like a duplicate of “${match.name}”. Add it anyway?`)) return false;

  const rawPrice = source ? source.price : document.getElementById("toolPrice").value;
  const price = rawPrice === "" || rawPrice == null ? (PRESET_PRICES[name] ?? 20) : Number(rawPrice);
  if (!Number.isFinite(price) || price < 0) {
    showToast("Enter a valid non-negative price.");
    return false;
  }
  tools.push(normalizeTool({
    id: source ? `catalog-${source.id}` : `custom-${Date.now()}`,
    name,
    price,
    billing: source ? "monthly" : document.getElementById("toolBilling").value,
    use: source ? "monthly" : document.getElementById("toolUse").value,
    category: source ? "Discretionary" : document.getElementById("toolCategory").value,
    trial: source ? false : document.getElementById("toolTrial").checked,
    renewalDate: source ? "" : document.getElementById("toolRenewal").value,
    lastUsed: source ? "" : document.getElementById("toolLastUsed").value,
    decision: "Test"
  }, tools.length));
  save();
  render();
  renderCategoryFilters();
  if (!source) {
    document.getElementById("toolName").value = "";
    document.getElementById("toolPrice").value = "";
    document.getElementById("toolBilling").value = "monthly";
    document.getElementById("toolUse").value = "monthly";
    document.getElementById("toolRenewal").value = "";
    document.getElementById("toolLastUsed").value = "";
    document.getElementById("toolTrial").checked = false;
  }
  showToast(`${name} added${price === 0 ? " — set your actual price" : ""}.`);
  checkRenewalAlerts();
  return true;
}

function normalizedName(name) {
  return name.toLowerCase().replace(/\b(pro|plus|premium|standard|team|plan)\b/g, "").replace(/[^a-z0-9]/g, "");
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return row[b.length];
}

function findDuplicate(name) {
  const candidate = normalizedName(name);
  if (candidate.length < 4) return null;
  return tools.find((tool) => {
    const existing = normalizedName(tool.name);
    if (candidate === existing) return true;
    const distance = levenshtein(candidate, existing);
    return Math.min(candidate.length, existing.length) >= 5
      && distance <= 2
      && distance / Math.max(candidate.length, existing.length) <= 0.25;
  }) || null;
}

function renderCatalog() {
  const query = document.getElementById("catalogSearch").value.trim().toLowerCase();
  const matches = catalog.filter((tool) => !query || `${tool.name} ${tool.job}`.toLowerCase().includes(query)).slice(0, 60);
  document.getElementById("catalogList").innerHTML = matches.map((tool) => {
    const added = tools.some((item) => item.id === `catalog-${tool.id}`);
    return `<div class="catalog-item"><div><strong>${escapeHtml(tool.name)}</strong><small>${escapeHtml(tool.job)} · ${tool.price ? `~${money(tool.price)}/mo` : "price not listed"}</small></div><button type="button" data-add-catalog="${escapeHtml(tool.id)}" ${added ? "disabled" : ""}>${added ? "Added" : "Add"}</button></div>`;
  }).join("") || `<p class="local-note">No matching tools.</p>`;
  document.querySelectorAll("[data-add-catalog]").forEach((button) => button.addEventListener("click", () => {
    const item = catalog.find((tool) => tool.id === button.dataset.addCatalog);
    if (item && addTool(item)) renderCatalog();
  }));
}

async function loadCatalog() {
  const status = document.getElementById("catalogStatus");
  try {
    const response = await fetch("data/catalog.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
    const parsed = await response.json();
    if (!Array.isArray(parsed) || parsed.length < 100) throw new Error("Catalog data is incomplete.");
    catalog = parsed.filter((item) => item && typeof item.id === "string" && typeof item.name === "string"
      && typeof item.job === "string" && Number.isFinite(Number(item.price)));
    if (catalog.length < 100) throw new Error("Catalog has fewer than 100 valid entries.");
    status.textContent = `${catalog.length} catalog entries loaded. Reference prices are estimates; verify your actual plan price.`;
    renderCatalog();
  } catch (error) {
    status.textContent = `Catalog could not be loaded: ${error.message} You can still add subscriptions manually.`;
  }
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportData(format) {
  if (!requirePro()) return;
  const pro = isPro();
  const included = tools;
  if (format === "json") {
    const payload = pro
      ? { version: 2, exportedAt: new Date().toISOString(), tools: included }
      : {
        version: 2,
        redacted: true,
        exportedAt: new Date().toISOString(),
        summary: { toolCount: included.length, monthlyTotal: cents(included.reduce((sum, tool) => sum + toMonthly(tool.price, tool.billing), 0)) },
        tools: included.map((tool, index) => ({
          name: `Subscription ${index + 1}`,
          category: tool.category,
          use: tool.use,
          trial: tool.trial,
          decision: tool.decision
        }))
      };
    download("stackcutify-audit.json", JSON.stringify(payload, null, 2), "application/json");
  } else {
    const headers = pro
      ? ["name", "price", "billing", "use", "category", "trial", "renewal_date", "monthly_equivalent", "decision"]
      : ["name", "category", "use", "trial", "decision"];
    const rows = included.map((tool, index) => pro
      ? [tool.name, tool.price, tool.billing, tool.use, tool.category, tool.trial, tool.renewalDate, cents(toMonthly(tool.price, tool.billing)).toFixed(2), tool.decision]
      : [`Subscription ${index + 1}`, tool.category, tool.use, tool.trial, tool.decision]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    download("stackcutify-audit.csv", csv, "text/csv;charset=utf-8");
  }
  showToast(pro ? `${format.toUpperCase()} export downloaded.` : `Redacted ${format.toUpperCase()} export downloaded.`);
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function importUsageCsv(text) {
  const records = parseCsv(text);
  if (records.length < 2) throw new Error("The CSV has no usage rows.");
  const headers = records[0].map((header, index) => {
    const withoutBom = index === 0 ? header.replace(/^\uFEFF/, "") : header;
    return withoutBom.trim().toLowerCase().replace(/[\s-]+/g, "_");
  });
  const column = (...names) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  const dateColumn = column("date", "day", "timestamp", "created_at");
  const modelColumn = column("model", "model_name");
  const tokenColumn = column("tokens", "total_tokens");
  const inputColumn = column("input_tokens", "prompt_tokens");
  const outputColumn = column("output_tokens", "completion_tokens");
  const costColumn = column("cost_usd", "usd_cost", "cost");
  if (modelColumn < 0 || (dateColumn < 0 && (tokenColumn < 0 && inputColumn < 0 && outputColumn < 0)) || (tokenColumn < 0 && inputColumn < 0 && outputColumn < 0 && costColumn < 0)) {
    throw new Error("Could not find model, date (or token columns), and token or cost columns.");
  }
  const usage = new Map();
  records.slice(1).forEach((record, index) => {
    const model = String(record[modelColumn] || "").trim();
    if (!model) return;
    const rawDate = dateColumn >= 0 ? String(record[dateColumn] || "").trim() : "Undated";
    const day = rawDate ? rawDate.slice(0, 10) : "Undated";
    const tokens = tokenColumn >= 0
      ? Number(record[tokenColumn] || 0)
      : Number(record[inputColumn] || 0) + Number(record[outputColumn] || 0);
    const cost = Number(String(record[costColumn] || "0").replace(/[$,]/g, ""));
    if (!Number.isFinite(tokens) || !Number.isFinite(cost)) throw new Error(`Invalid number on CSV row ${index + 2}.`);
    const key = `${day}\u0000${model}`;
    const item = usage.get(key) || { day, model, tokens: 0, cost: 0 };
    item.tokens += tokens;
    item.cost += cost;
    usage.set(key, item);
  });
  if (!usage.size) throw new Error("No usable model rows were found.");
  return [...usage.values()].sort((a, b) => a.day.localeCompare(b.day) || a.model.localeCompare(b.model));
}

function renderUsage(rows) {
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
  const totalTokens = rows.reduce((sum, row) => sum + row.tokens, 0);
  document.getElementById("usageResults").innerHTML = `<p class="local-note">${rows.length} model/day rows · ${totalTokens.toLocaleString()} tokens · ${money(totalCost)} reported cost</p>
    <table class="usage-table"><thead><tr><th>Day</th><th>Model</th><th>Tokens</th><th>Cost</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.day)}</td><td>${escapeHtml(row.model)}</td><td>${row.tokens.toLocaleString()}</td><td>${money(row.cost)}</td></tr>`).join("")}</tbody></table>`;
}

function renderTax() {
  const values = Array.from(document.querySelectorAll(".tax-inputs input")).map((input) => Math.max(0, Number(input.value) || 0));
  const monthly = values.reduce((sum, value) => sum + value, 0);
  const delta = monthly - 8.84;
  document.getElementById("taxResult").textContent = `${money(monthly)}/mo (${money(monthly * 12)}/year) for this stack. Stackcutify Pro is $8.84/mo; the difference is ${money(delta)}/mo. This is a comparison, not a savings guarantee.`;
}

function daysSince(dateString) {
  if (!dateString) return -1;
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return -1;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function renderAuditNudges() {
  const root = document.getElementById("auditNudges");
  const stale = tools.filter((tool) => daysSince(tool.lastUsed) >= 30);
  let lastAudit = 0;
  try {
    lastAudit = Number(localStorage.getItem("stackcut_last_audit") || 0);
  } catch (error) {
    root.textContent = `Could not read the quarterly audit date: ${error.message}`;
    return;
  }
  const dueForAudit = !lastAudit || Date.now() - lastAudit >= 90 * 86400000;
  const reminder = dueForAudit
    ? `<div class="local-note">Quarterly audit nudge: review your stack and update each tool’s Keep, Kill, or Test decision.</div><button type="button" id="markAudit" class="local-pills">Mark quarterly audit complete</button>` : "";
  const suggestions = stale.map((tool) => `<p class="local-note">You haven’t marked ${escapeHtml(tool.name)} as used in 30 days — keep, kill, or test it?</p>`).join("");
  root.innerHTML = `${reminder}${suggestions || `<p class="local-note">No subscriptions have a last-used date older than 30 days. Add dates to get an audit nudge.</p>`}`;
  document.getElementById("markAudit")?.addEventListener("click", () => {
    try {
      localStorage.setItem("stackcut_last_audit", String(Date.now()));
      renderAuditNudges();
      showToast("Quarterly audit marked complete.");
    } catch (error) {
      showToast(`Could not save audit date: ${error.message}`);
    }
  });
}

function checkRenewalAlerts() {
  const status = document.getElementById("notificationStatus");
  if (!("Notification" in window)) {
    status.textContent = "Browser notifications are not supported here.";
    return;
  }
  if (Notification.permission !== "granted") {
    status.textContent = "Alerts are checked while this app is open, after you grant permission.";
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reminderDays = [30, 7, 1];
  let notices = 0;
  for (const tool of tools) {
    if (!tool.renewalDate) continue;
    const renewal = new Date(`${tool.renewalDate}T00:00:00`);
    if (Number.isNaN(renewal.getTime())) continue;
    const days = Math.round((renewal - today) / 86400000);
    if (!reminderDays.includes(days)) continue;
    const key = `stackcut_notice_${tool.id}_${tool.renewalDate}_${days}`;
    try {
      if (localStorage.getItem(key)) continue;
    } catch (error) {
      status.textContent = `Could not read notification history: ${error.message}`;
      return;
    }
    try {
      new Notification(`${tool.trial ? "Trial ending" : "Renewal coming up"}: ${tool.name}`, {
        body: days === 1 ? "Renewal is tomorrow." : `Renewal is in ${days} days.`
      });
      localStorage.setItem(key, "sent");
      notices += 1;
    } catch (error) {
      status.textContent = `Could not show renewal notification: ${error.message}`;
      return;
    }
  }
  status.textContent = notices
    ? `${notices} local notification${notices === 1 ? "" : "s"} sent. Alerts run when this app is open.`
    : "No 30-, 7-, or 1-day renewal reminders due. Alerts run when this app is open.";
}

function enableNotifications() {
  if (!("Notification" in window)) {
    showToast("This browser does not support notifications.");
    checkRenewalAlerts();
    return;
  }
  Notification.requestPermission().then((permission) => {
    if (permission !== "granted") {
      document.getElementById("notificationStatus").textContent = "Notification permission was not granted.";
      return;
    }
    checkRenewalAlerts();
  }).catch((error) => {
    document.getElementById("notificationStatus").textContent = `Could not enable notifications: ${error.message}`;
  });
}

function generateDrafts() {
  if (!requirePro()) return;
  const target = tools.filter((tool) => tool.decision === "Kill" || tool.use === "forgot");
  if (!target.length) {
    showToast("No Kill / forgotten subscriptions to draft.");
    return;
  }
  const content = target.map((tool) => `Subject: Cancel ${tool.name}\n\nPlease cancel my ${tool.name} subscription and confirm it will not renew.\n\nAccount email: [your email]\nName: [your name]`).join("\n\n---\n\n");
  navigator.clipboard.writeText(content).then(
    () => showToast(`${target.length} cancel draft${target.length === 1 ? "" : "s"} copied.`),
    () => showToast("Clipboard unavailable. Select and copy the generated text manually.")
  );
}

function clearAll() {
  if (!window.confirm("Clear all subscription data stored on this device?")) return;
  tools = [];
  simulation = {};
  simulationMode = false;
  categoryFilter = "all";
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (typeof key === "string" && (key === STORAGE_KEY || key === SIMULATION_KEY || key === CATEGORY_KEY
        || key === "stackcut_last_audit" || key.startsWith("stackcut_notice_"))) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem(STORAGE_KEY, "[]");
    localStorage.setItem(SIMULATION_KEY, "{}");
  } catch (error) {
    showToast(`Could not clear all browser data: ${error.message}`);
  }
  render();
  renderCategoryFilters();
  renderCatalog();
  showToast("Local data cleared.");
}

function setUsageFilter(value) {
  filter = value;
  document.querySelectorAll(".filterBtn").forEach((button) => {
    const active = button.getAttribute("onclick")?.includes(`'${value}'`);
    button.classList.toggle("bg-black", active);
    button.classList.toggle("text-white", active);
    button.classList.toggle("bg-black/5", !active);
  });
  render();
}

window.addTool = addTool;
window.render = render;
window.exportJSON = () => exportData("json");
window.exportCSV = () => exportData("csv");
window.generateDrafts = generateDrafts;
window.clearAll = clearAll;
window.del = (id) => {
  tools = tools.filter((tool) => tool.id !== String(id));
  save();
  render();
};
window.toggleUse = (id) => {
  const tool = tools.find((item) => item.id === String(id));
  if (!tool) return;
  const index = USAGE_FREQUENCIES.indexOf(tool.use);
  tool.use = USAGE_FREQUENCIES[(index + 1) % USAGE_FREQUENCIES.length];
  save();
  render();
};

document.querySelectorAll(".filterBtn").forEach((button) => {
  const match = button.getAttribute("onclick")?.match(/filter='([^']+)'/);
  if (match) button.addEventListener("click", () => setUsageFilter(match[1]));
});
document.getElementById("toolName").addEventListener("change", (event) => {
  const price = PRESET_PRICES[event.target.value.trim()];
  if (price !== undefined) document.getElementById("toolPrice").value = price;
});
document.getElementById("simulationMode").addEventListener("change", (event) => {
  simulationMode = event.target.checked;
  render();
});
document.getElementById("catalogSearch").addEventListener("input", renderCatalog);
document.getElementById("enableNotifications").addEventListener("click", enableNotifications);
document.querySelectorAll(".tax-inputs input").forEach((input) => input.addEventListener("input", renderTax));
document.getElementById("usageFile").addEventListener("change", async (event) => {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = "";
  if (!file) return;
  const output = document.getElementById("usageResults");
  if (file.size > 5_000_000) {
    output.textContent = "CSV is too large. Select a file smaller than 5 MB.";
    return;
  }
  try {
    renderUsage(importUsageCsv(await file.text()));
  } catch (error) {
    output.textContent = `Could not read usage CSV: ${error.message}`;
  }
});

renderTax();
load();
