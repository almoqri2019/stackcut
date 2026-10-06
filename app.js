const CATALOG = [
  { id: "chatgpt-plus", name: "ChatGPT Plus", job: "Chat", price: 20, cancel: "https://chatgpt.com/#settings" },
  { id: "chatgpt-pro", name: "ChatGPT Pro", job: "Chat", price: 200, cancel: "https://chatgpt.com/#settings" },
  { id: "claude-pro", name: "Claude Pro", job: "Chat", price: 20, cancel: "https://claude.ai/settings" },
  { id: "claude-max", name: "Claude Max", job: "Chat", price: 100, cancel: "https://claude.ai/settings" },
  { id: "google-ai-pro", name: "Google AI Pro", job: "Chat", price: 20, cancel: "https://one.google.com/about/plans" },
  { id: "supergrok", name: "SuperGrok", job: "Chat", price: 30, cancel: "https://grok.com" },
  { id: "perplexity", name: "Perplexity Pro", job: "Search", price: 20, cancel: "https://www.perplexity.ai/settings" },
  { id: "m365-copilot", name: "Microsoft 365 Copilot", job: "Chat", price: 21, cancel: "https://account.microsoft.com/services" },
  { id: "cursor", name: "Cursor Pro", job: "Code", price: 20, cancel: "https://cursor.com/settings" },
  { id: "copilot", name: "GitHub Copilot", job: "Code", price: 10, cancel: "https://github.com/settings/copilot" },
  { id: "windsurf", name: "Windsurf Pro", job: "Code", price: 15, cancel: "https://codeium.com/windsurf" },
  { id: "midjourney", name: "Midjourney Standard", job: "Image", price: 30, cancel: "https://www.midjourney.com/account" },
  { id: "firefly", name: "Adobe Firefly", job: "Image", price: 10, cancel: "https://account.adobe.com/plans" },
  { id: "leonardo", name: "Leonardo", job: "Image", price: 12, cancel: "https://app.leonardo.ai" },
  { id: "ideogram", name: "Ideogram", job: "Image", price: 8, cancel: "https://ideogram.ai" },
  { id: "otter", name: "Otter Pro", job: "Meetings", price: 17, cancel: "https://otter.ai" },
  { id: "fireflies", name: "Fireflies", job: "Meetings", price: 18, cancel: "https://app.fireflies.ai" },
  { id: "granola", name: "Granola", job: "Meetings", price: 18, cancel: "https://www.granola.ai" },
  { id: "tldv", name: "tl;dv", job: "Meetings", price: 18, cancel: "https://tldv.io" },
  { id: "jasper", name: "Jasper", job: "Writing", price: 49, cancel: "https://app.jasper.ai" },
  { id: "grammarly", name: "Grammarly Pro", job: "Writing", price: 12, cancel: "https://account.grammarly.com" },
  { id: "notion-ai", name: "Notion AI", job: "Writing", price: 10, cancel: "https://www.notion.so" },
  { id: "descript", name: "Descript", job: "Video", price: 24, cancel: "https://web.descript.com" },
  { id: "runway", name: "Runway", job: "Video", price: 15, cancel: "https://app.runwayml.com" },
  { id: "heygen", name: "HeyGen", job: "Video", price: 29, cancel: "https://app.heygen.com" },
  { id: "eleven", name: "ElevenLabs", job: "Voice", price: 22, cancel: "https://elevenlabs.io/app/subscription" }
];

const JOBS = ["Chat", "Search", "Code", "Image", "Meetings", "Writing", "Video", "Voice", "Other"];
const KEY = "stackcut-v2";
const PLAN_ID = "P-6HT714478R159110WNLBOW4Q";
const BILLING_CYCLES = ["daily", "weekly", "monthly", "quarterly", "yearly"];
const BILLING_UNITS = { daily: "day", weekly: "week", monthly: "mo", quarterly: "quarter", yearly: "year" };
const USAGE_FREQUENCIES = ["daily", "weekly", "monthly", "discretionary", "forgot"];
const isPro = localStorage.getItem("stackcut_pro") === "active";
const state = load();

function cleanPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 100000) : 0;
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

function requirePro() {
  if (isPro) return true;
  alert(PLAN_ID);
  window.location.href = `/pro.html?plan=${PLAN_ID}`;
  return false;
}

// Accepts anything (localStorage, imported file) and returns a safe state object.
function sanitize(parsed) {
  const out = { selected: {}, custom: [], decisions: {} };
  if (!parsed || typeof parsed !== "object") return out;
  if (Array.isArray(parsed.custom)) {
    parsed.custom.forEach((tool) => {
      if (!tool || typeof tool.id !== "string" || typeof tool.name !== "string") return;
      out.custom.push({
        id: tool.id,
        name: tool.name.slice(0, 80),
        job: JOBS.includes(tool.job) ? tool.job : "Other",
        price: cleanPrice(tool.price),
        cancel: ""
      });
    });
  }
  const known = new Set(CATALOG.concat(out.custom).map((tool) => tool.id));
  if (parsed.selected && typeof parsed.selected === "object") {
    Object.keys(parsed.selected).forEach((id) => {
      const entry = parsed.selected[id];
      if (!known.has(id) || !entry || typeof entry !== "object") return;
      out.selected[id] = {
        price: cleanPrice(entry.price),
        billing: BILLING_CYCLES.includes(entry.billing) ? entry.billing : "monthly",
        use: USAGE_FREQUENCIES.includes(entry.use) ? entry.use : "monthly"
      };
    });
  }
  if (parsed.decisions && typeof parsed.decisions === "object") {
    Object.keys(parsed.decisions).forEach((id) => {
      if (known.has(id) && ["keep", "cut"].includes(parsed.decisions[id])) out.decisions[id] = parsed.decisions[id];
    });
  }
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem("stackcut-v1");
    if (raw) return sanitize(JSON.parse(raw));
  } catch (err) {}
  return sanitize(null);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    if (!save.warned) {
      save.warned = true;
      toast("Can't save in this browser. Export to keep your stack.");
    }
  }
}

function catalog() {
  return CATALOG.concat(state.custom);
}

function cents(value) {
  const amount = Number(value) || 0;
  return Math.trunc((amount + Math.sign(amount) * Number.EPSILON) * 100) / 100;
}

function money(value) {
  return "$" + cents(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function toast(text) {
  const node = document.getElementById("toast");
  if (!node) return;
  node.textContent = text;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
}

function selectedTools() {
  return catalog().filter((tool) => state.selected[tool.id]).map((tool) => ({
    ...tool,
    price: cleanPrice(state.selected[tool.id].price),
    billing: state.selected[tool.id].billing || "monthly",
    use: state.selected[tool.id].use || "monthly",
    decision: state.decisions[tool.id] || "auto"
  }));
}

function getBurn() {
  let total = 0;
  let waste = 0;
  Object.values(state.selected).forEach((tool) => {
    const monthly = toMonthly(tool.price, tool.billing);
    total += monthly;
    if ((tool.use || "").toLowerCase() === "forgot") waste += monthly;
  });
  return { total, waste };
}

function plan() {
  const tools = selectedTools();
  const { total: burn, waste } = getBurn();
  const groups = JOBS.map((job) => {
    const members = tools.filter((tool) => tool.job === job);
    if (members.length < 2) return null;
    const rank = (tool) => tool.decision === "keep" ? 0 : tool.use === "weekly" ? 1 : tool.use === "monthly" ? 2 : 3;
    // An explicit "Cut" is always honoured, so it can never be picked as the tool to keep.
    const candidates = members.filter((tool) => tool.decision !== "cut");
    const keep = candidates.slice().sort((a, b) => rank(a) - rank(b) || a.price - b.price)[0] || null;
    const cut = members.filter((tool) => (!keep || tool.id !== keep.id) && tool.decision !== "keep" && (tool.decision === "cut" || tool.use !== "weekly"));
    const saved = cut.reduce((sum, tool) => sum + toMonthly(tool.price, tool.billing), 0);
    return { job, members, keep, cut, saved };
  }).filter(Boolean);
  const saved = groups.reduce((sum, group) => sum + group.saved, 0);
  return { tools, burn, waste, groups, saved, left: burn - saved };
}

function query() {
  return document.getElementById("search")?.value.trim().toLowerCase() || "";
}

function renderPicker() {
  const q = query();
  const root = document.getElementById("stack");
  if (!root) return;
  root.innerHTML = JOBS.map((job) => {
    const tools = catalog().filter((tool) => tool.job === job && (!q || tool.name.toLowerCase().includes(q)));
    if (!tools.length) return "";
    return `<div class="group"><h2>${job}</h2><div class="grid">${tools.map(card).join("")}</div></div>`;
  }).join("");
  root.querySelectorAll(".tool").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest(".editor")) return;
      toggle(node.dataset.id);
    });
    node.addEventListener("keydown", (event) => {
      if (event.target !== node || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      toggle(node.dataset.id);
      const again = document.querySelector(`.tool[data-id="${node.dataset.id}"]`);
      if (again) again.focus();
    });
  });
  root.querySelectorAll("[data-field]").forEach((node) => {
    node.addEventListener("keydown", (event) => event.stopPropagation());
  });
  root.querySelectorAll("[data-field]").forEach((node) => {
    node.addEventListener("click", (event) => event.stopPropagation());
    node.addEventListener("input", onEdit);
    node.addEventListener("change", onEdit);
  });
}

function card(tool) {
  const on = state.selected[tool.id];
  const price = on ? on.price : tool.price;
  const billing = on ? on.billing || "monthly" : "monthly";
  const use = on ? on.use : "monthly";
  const monthly = toMonthly(price, billing);
  return `<article class="tool ${on ? "on" : ""}" data-id="${escapeHtml(tool.id)}" role="button" tabindex="0" aria-pressed="${on ? "true" : "false"}">
    <div class="name">${escapeHtml(tool.name)}</div>
    <div class="meta"><span>${tool.job}</span><span>list ${money(tool.price)}</span></div>
    <div class="meta"><span>${money(price)}/${BILLING_UNITS[billing]} billed</span><span>${money(monthly)}/mo</span></div>
    <div class="editor">
      <label>You pay<input data-field="price" data-id="${tool.id}" type="number" min="0" step="0.01" value="${price}" /></label>
      <label>Billing cycle
        <select data-field="billing" data-id="${tool.id}">
          ${BILLING_CYCLES.map((cycle) => `<option value="${cycle}" ${billing === cycle ? "selected" : ""}>${cycle}</option>`).join("")}
        </select>
      </label>
      <label>Usage frequency
        <select data-field="use" data-id="${tool.id}">
          ${USAGE_FREQUENCIES.map((frequency) => `<option value="${frequency}" ${use === frequency ? "selected" : ""}>${frequency}</option>`).join("")}
        </select>
      </label>
    </div>
  </article>`;
}

function escapeHtml(value) {
  const named = { "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" };
  return String(value).replace(/[&<>"']/g, (ch) => "&" + named[ch] + ";");
}

function toggle(id) {
  if (state.selected[id]) {
    delete state.selected[id];
    delete state.decisions[id];
  } else {
    if (Object.keys(state.selected).length >= 5 && !isPro) {
      requirePro();
      return;
    }
    const tool = catalog().find((item) => item.id === id);
    state.selected[id] = { price: tool.price, billing: "monthly", use: "monthly" };
  }
  save();
  draw();
}

function onEdit(event) {
  const id = event.target.dataset.id;
  if (!state.selected[id]) return;
  const field = event.target.dataset.field;
  state.selected[id][field] = field === "price" ? cleanPrice(event.target.value) : event.target.value;
  save();
  renderStats();
  renderLedger();
  renderCuts();
  renderLetters();
  renderReport();
  if (event.type === "change") renderPicker();
}

function renderStats() {
  const result = plan();
  const jobs = new Set(result.groups.map((group) => group.job)).size;
  const root = document.getElementById("stats");
  if (!root) return;
  root.innerHTML = [
    [`${money(result.burn)}/mo`, "paid each month"],
    [`${money(result.waste)}/mo`, "wasted each month"],
    [String(result.tools.length), "tools selected"],
    [money(result.saved), "ready to cut"],
    [money(result.saved * 12), "over a year"]
  ].map(([value, label]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`).join("") +
    (jobs ? "" : "");
}

function renderLedger() {
  const result = plan();
  const root = document.getElementById("ledger");
  if (!root) return;
  if (!result.tools.length) {
    root.innerHTML = `<h2>Ledger</h2><p class="muted">Nothing selected. Load a typical stack or pick two chat tools.</p>`;
    return;
  }
  root.innerHTML = `<h2>Ledger</h2><ul>${result.tools.map((tool) => {
    const monthly = toMonthly(tool.price, tool.billing);
    const price = tool.billing === "monthly"
      ? `${money(tool.price)}/mo`
      : `${money(tool.price)}/${BILLING_UNITS[tool.billing]} billed (${money(monthly)}/mo)`;
    return `<li><span>${escapeHtml(tool.name)}</span><span>${price}</span></li>`;
  }).join("")}</ul><p><strong>${money(result.burn)}/mo</strong> <span class="muted">this month · ${money(result.left)}/mo if you take the cuts</span></p>`;
}

function renderCuts() {
  const result = plan();
  const root = document.getElementById("cuts");
  if (!root) return;
  if (!result.groups.length) {
    root.innerHTML = `<p class="muted">No duplicate jobs yet. Two tools in the same job create a decision.</p>`;
    return;
  }
  root.innerHTML = result.groups.map((group) => `<article class="cut-card">
    <header><div><strong>${group.job}</strong><div class="keep">${group.keep ? "Keep " + escapeHtml(group.keep.name) : "Cutting every tool in this job"}</div></div><div class="save">${money(group.saved)}<div class="muted">/ month</div></div></header>
    ${group.members.map((tool) => `<div class="row"><span>${escapeHtml(tool.name)} · ${money(toMonthly(tool.price, tool.billing))}/mo</span><span class="muted">${tool.use}</span>
      <select data-decision="${tool.id}">
        <option value="auto" ${tool.decision === "auto" ? "selected" : ""}>Auto</option>
        <option value="keep" ${tool.decision === "keep" ? "selected" : ""}>Keep</option>
        <option value="cut" ${tool.decision === "cut" ? "selected" : ""}>Cut</option>
      </select>
    </div>`).join("")}
  </article>`).join("");
  root.querySelectorAll("[data-decision]").forEach((node) => {
    node.addEventListener("change", () => {
      state.decisions[node.dataset.decision] = node.value;
      save();
      draw();
    });
  });
}

function letter(tool) {
  return `Subject: Cancel ${tool.name}

Hello,

Please cancel my ${tool.name} subscription at the end of the current billing period and confirm by email that it will not renew.

Please make the cancellation in this thread. I do not want a retention call.

Account email: [your email]
Name: [your name]

Thank you.`;
}

function renderLetters() {
  const cuts = plan().groups.flatMap((group) => group.cut);
  const root = document.getElementById("letters");
  if (!root) return;
  if (!cuts.length) {
    root.innerHTML = `<p class="muted">Accepted cuts land here as notes you send yourself.</p>`;
    return;
  }
  root.innerHTML = cuts.map((tool) => `<article class="letter">
    <header><strong>${escapeHtml(tool.name)}</strong><button type="button" class="copy" data-copy="${escapeHtml(tool.id)}">Copy draft</button></header>
    <p class="muted">${tool.cancel ? `Vendor account page: <a href="${escapeHtml(tool.cancel)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tool.cancel)}</a>` : "No public cancel page on file. Cancel in the account you pay from."}</p>
    <pre data-letter="${escapeHtml(tool.id)}">${escapeHtml(letter(tool))}</pre>
  </article>`).join("");
  root.querySelectorAll(".copy").forEach((button) => {
    button.addEventListener("click", () => {
      const pre = Array.from(root.querySelectorAll("pre")).find((node) => node.dataset.letter === button.dataset.copy);
      copyText(pre ? pre.textContent : "", "Draft copied");
    });
  });
}

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
    return;
  } catch (err) {}
  // Fallback for browsers or contexts without the async clipboard API.
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (err) {}
  area.remove();
  toast(ok ? done : "Couldn't copy. Select the text and copy it by hand.");
}

function reportText() {
  const result = plan();
  const lines = [
    "Stackcut report",
    `Monthly burn: ${money(result.burn)}`,
    `Monthly waste: ${money(result.waste)}`,
    `Ready to cut: ${money(result.saved)}`,
    `Left if you cut: ${money(result.left)}`,
    `Year returned: ${money(result.saved * 12)}`,
    "",
    "Stack"
  ];
  result.tools.forEach((tool) => lines.push(`- ${tool.name} (${tool.job}) ${money(tool.price)}/${BILLING_UNITS[tool.billing]} billed (${money(toMonthly(tool.price, tool.billing))}/mo) / ${tool.use}`));
  result.groups.forEach((group) => {
    lines.push("", group.keep ? `${group.job}: keep ${group.keep.name}` : `${group.job}: cut all`);
    group.cut.forEach((tool) => lines.push(`  cut ${tool.name} ${money(toMonthly(tool.price, tool.billing))}/mo`));
  });
  return lines.join("\n");
}

function renderReport() {
  const result = plan();
  const width = result.burn ? Math.min(100, Math.round((result.saved / result.burn) * 100)) : 0;
  const root = document.getElementById("report");
  if (!root) return;
  root.innerHTML = `
    <p class="kicker">Local snapshot</p>
    <h2 class="report-title">${money(result.saved)} / month can go</h2>
    <div class="bar"><span style="width:${width}%"></span></div>
    <p>${width}% of this stack is overlap. ${money(result.left)} remains if you take every cut.</p>
    <h3>Keep</h3>
    <ul>${result.tools.filter((tool) => !result.groups.some((group) => group.cut.find((cut) => cut.id === tool.id))).map((tool) => `<li>${escapeHtml(tool.name)} · ${money(toMonthly(tool.price, tool.billing))}/mo</li>`).join("") || "<li>None yet</li>"}</ul>
    <h3>Cut</h3>
    <ul>${result.groups.flatMap((group) => group.cut).map((tool) => `<li>${escapeHtml(tool.name)} · ${money(toMonthly(tool.price, tool.billing))}/mo · ${tool.job}</li>`).join("") || "<li>None yet</li>"}</ul>`;
}

function draw() {
  renderPicker();
  renderStats();
  renderLedger();
  renderCuts();
  renderLetters();
  renderReport();
}

document.querySelectorAll(".nav").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav").forEach((item) => item.classList.remove("on"));
    button.classList.add("on");
    ["stack", "cuts", "letters", "report"].forEach((view) => {
      document.getElementById("view-" + view)?.classList.toggle("hidden", button.dataset.view !== view);
    });
  });
});

document.getElementById("search")?.addEventListener("input", renderPicker);
document.getElementById("add-open")?.addEventListener("click", () => {
  document.getElementById("add-form")?.classList.toggle("hidden");
});
const jobSelect = document.querySelector("#add-form select");
if (jobSelect) jobSelect.innerHTML = JOBS.map((job) => `<option>${job}</option>`).join("");
document.getElementById("add-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  const tool = {
    id: "custom-" + Date.now(),
    name: String(data.get("name")).trim(),
    job: data.get("job"),
    price: cleanPrice(data.get("price")),
    cancel: ""
  };
  tool.name = tool.name.slice(0, 80);
  if (!tool.name) return;
  if (Object.keys(state.selected).length >= 5 && !isPro) {
    requirePro();
    return;
  }
  state.custom.push(tool);
  state.selected[tool.id] = {
    price: tool.price,
    billing: BILLING_CYCLES.includes(data.get("billing")) ? data.get("billing") : "monthly",
    use: USAGE_FREQUENCIES.includes(data.get("use")) ? data.get("use") : "monthly"
  };
  save();
  event.target.reset();
  draw();
  toast("Tool added");
});

document.getElementById("load-sample")?.addEventListener("click", () => {
  if (Object.keys(state.selected).length >= 5 && !isPro) {
    requirePro();
    return;
  }
  const typicalStack = {
    "chatgpt-plus": { price: 20, billing: "monthly", use: "weekly" },
    "claude-pro": { price: 20, billing: "monthly", use: "monthly" },
    "supergrok": { price: 30, billing: "monthly", use: "forgot" },
    "perplexity": { price: 20, billing: "monthly", use: "weekly" },
    cursor: { price: 20, billing: "monthly", use: "weekly" },
    copilot: { price: 10, billing: "monthly", use: "forgot" },
    midjourney: { price: 30, billing: "monthly", use: "monthly" },
    firefly: { price: 10, billing: "monthly", use: "forgot" },
    otter: { price: 17, billing: "monthly", use: "monthly" },
    fireflies: { price: 18, billing: "monthly", use: "forgot" }
  };
  state.selected = isPro ? typicalStack : Object.fromEntries(Object.entries(typicalStack).slice(0, 5));
  save();
  draw();
  toast("Typical stack loaded");
});

document.getElementById("reset")?.addEventListener("click", () => {
  if (!state.custom.length && !Object.keys(state.selected).length) return;
  if (!window.confirm("Clear your whole stack, including tools you added? Export first if you want a copy.")) return;
  state.selected = {};
  state.decisions = {};
  state.custom = [];
  save();
  draw();
  toast("Cleared");
});

document.getElementById("export")?.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "stackcut.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

document.getElementById("import")?.addEventListener("click", () => document.getElementById("import-file")?.click());
document.getElementById("import-file")?.addEventListener("change", async (event) => {
  const input = event.currentTarget;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error("too big");
    const next = sanitize(JSON.parse(await file.text()));
    if (!Object.keys(next.selected).length && !next.custom.length) throw new Error("empty");
    if (Object.keys(state.selected).length && !window.confirm("Replace your current stack with the imported one?")) return;
    state.selected = next.selected;
    state.custom = next.custom;
    state.decisions = next.decisions;
    save();
    draw();
    toast("Stack imported");
  } catch (err) {
    toast("That file isn't a Stackcut export.");
  }
});

document.getElementById("print")?.addEventListener("click", () => window.print());
document.getElementById("copy-report")?.addEventListener("click", () => copyText(reportText(), "Report copied"));
draw();