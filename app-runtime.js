(() => {
  "use strict";

  const VAULT_KEY = "stackcut-v4";
  const LEGACY_KEYS = ["stackcut-v3", "stackcut-v2"];
  const PBKDF2_ITERATIONS = 210000;
  const FREE_SUBSCRIPTION_LIMIT = 3;
  const FREE_AUDIT_LIMIT = 1;
  const MAX_SUBSCRIPTIONS = 5000;
  const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
  const MAX_IMPORT_ROWS = 5000;
  const taxRateCache = new Map();
  const $ = (id) => document.getElementById(id);

  let state = { subscriptions: [], auditCount: 0, overlapDecisions: {} };
  let vaultKey = null;
  let vaultSalt = null;
  let proActive = false;
  let worker = null;
  let currentImportId = null;
  let toastTimer = 0;
  let ignoreLegacyVault = false;
  let legacyState = null;
  let legacyError = "";

  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.dataset.state = isError ? "error" : "info";
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 3500);
  }

  function formatMoney(value, currency = "USD") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(Number(value) || 0);
  }

  function formatCurrencyTotals(totals) {
    if (!totals.size) return formatMoney(0);
    return Array.from(totals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, value]) => formatMoney(value, currency))
      .join(" · ");
  }

  function toBase64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  function fromBase64(value) {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }

  async function deriveVaultKey(passphrase, salt) {
    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async function encryptVault(value, key, salt) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    );
    return JSON.stringify({
      version: 4,
      salt: toBase64(salt),
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ciphertext)),
    });
  }

  async function decryptVault(raw, passphrase) {
    const record = JSON.parse(raw);
    if (
      !record ||
      record.version !== 4 ||
      typeof record.salt !== "string" ||
      typeof record.iv !== "string" ||
      typeof record.ciphertext !== "string"
    ) {
      throw new Error("The saved vault format is not recognized.");
    }
    const salt = fromBase64(record.salt);
    const key = await deriveVaultKey(passphrase, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(record.iv) },
      key,
      fromBase64(record.ciphertext),
    );
    return {
      data: JSON.parse(new TextDecoder().decode(plaintext)),
      key,
      salt,
    };
  }

  function normalizeSubscription(item, index = 0) {
    const name = String(item?.name ?? "").trim().slice(0, 64);
    const price = Number(item?.price);
    if (!name || !Number.isFinite(price) || price <= 0 || price > 10000) {
      throw new Error(`Saved subscription ${index + 1} has invalid data.`);
    }
    const currency = String(item.currency || "USD").trim().toUpperCase();
    window.StackcutTax.currencyDigits(currency);
    const intervalValue = String(item.billingInterval || item.interval || "monthly").toLowerCase();
    const billingInterval = intervalValue === "yearly" ? "annual" : intervalValue;
    if (!["monthly", "annual", "weekly", "quarterly"].includes(billingInterval)) {
      throw new Error(`Saved subscription ${index + 1} has an unsupported billing interval.`);
    }
    const jurisdiction = window.StackcutTax.normalizeCountryCode(item.jurisdiction);
    if (jurisdiction && !window.StackcutTax.countries.some((country) => country.code === jurisdiction)) {
      throw new Error(`Saved subscription ${index + 1} has an invalid jurisdiction.`);
    }
    const taxRateSource = item.taxRateSource === "manual" ? "manual" : null;
    const taxRate = taxRateSource ? Number(item.taxRate) : null;
    if (taxRateSource && (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100)) {
      throw new Error(`Saved subscription ${index + 1} has an invalid manual tax rate.`);
    }
    return {
      id: String(item.id || crypto.randomUUID()),
      name,
      price: window.StackcutTax.roundCurrency(price, currency),
      currency,
      billingInterval,
      category: String(item.category ?? item.job ?? "Unknown").slice(0, 32) || "Unknown",
      transactionDate: String(item.transactionDate ?? "").slice(0, 32),
      decision: ["keep", "cut"].includes(item.decision ?? item.keep)
        ? item.decision ?? item.keep
        : null,
      jurisdiction,
      jurisdictionDetail: String(item.jurisdictionDetail ?? "").slice(0, 80),
      taxType: ["vat", "gst", "sales tax"].includes(item.taxType) ? item.taxType : "",
      taxTreatment: ["inclusive", "exclusive"].includes(item.taxTreatment) ? item.taxTreatment : "unknown",
      taxRateSource,
      taxRate,
    };
  }

  function normalizeState(value) {
    if (Array.isArray(value)) value = { subscriptions: value, auditCount: 0 };
    if (!value || !Array.isArray(value.subscriptions)) {
      throw new Error("The saved vault does not contain a subscription list.");
    }
    if (value.subscriptions.length > MAX_SUBSCRIPTIONS) {
      throw new Error(`The vault exceeds the ${MAX_SUBSCRIPTIONS.toLocaleString()} item limit.`);
    }
    const savedDecisions =
      value.overlapDecisions && typeof value.overlapDecisions === "object"
        ? value.overlapDecisions
        : {};
    const overlapDecisions = {};
    for (const [id, entry] of Object.entries(savedDecisions)) {
      const status = typeof entry === "string" ? entry : entry?.status;
      if (
        !id.startsWith("overlap:") ||
        !["pending", "confirmed", "rejected", "later"].includes(status)
      ) continue;
      overlapDecisions[id] = {
        status,
        fingerprint:
          typeof entry?.fingerprint === "string" ? entry.fingerprint : "",
      };
    }
    return {
      subscriptions: value.subscriptions.map(normalizeSubscription),
      auditCount: Number.isInteger(Number(value.auditCount))
        ? Math.max(0, Number(value.auditCount))
        : 0,
      overlapDecisions,
    };
  }

  async function readLegacyData() {
    const oldV2 = localStorage.getItem("stackcut-v2");
    if (oldV2) {
      const parsed = JSON.parse(oldV2);
      if (!Array.isArray(parsed)) {
        throw new Error("The older local data is malformed and was not changed.");
      }
      return normalizeState({
        subscriptions: parsed,
        auditCount: Number(localStorage.getItem("audit_count") || 0),
      });
    }

    const oldV3 = localStorage.getItem("stackcut-v3");
    if (!oldV3) return { subscriptions: [], auditCount: 0 };
    const trimmedV3 = oldV3.trim();
    if (trimmedV3.startsWith("[") || trimmedV3.startsWith("{")) {
      const parsed = JSON.parse(trimmedV3);
      return normalizeState({
        subscriptions: Array.isArray(parsed) ? parsed : parsed.subscriptions,
        auditCount: parsed.auditCount ?? Number(localStorage.getItem("audit_count") || 0),
      });
    }

    const legacySeed = sessionStorage.getItem("stackcut_vault_seed");
    if (!legacySeed) {
      throw new Error(
        "This older vault used a browser-session-only key that is no longer available. Its saved data is untouched. You can create a separate new vault below.",
      );
    }
    const seedBytes = fromBase64(legacySeed);
    if (seedBytes.length !== 32) {
      throw new Error(
        "The older vault key is invalid. Its saved data is untouched; create a separate new vault to continue.",
      );
    }
    const material = await crypto.subtle.importKey(
      "raw",
      seedBytes,
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode("stackcut-session-vault-v3"),
        iterations: 100000,
        hash: "SHA-256",
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const combined = fromBase64(oldV3);
    if (combined.length <= 12) {
      throw new Error("The older vault is incomplete and was not changed.");
    }
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: combined.slice(0, 12) },
      key,
      combined.slice(12),
    );
    return normalizeState(JSON.parse(new TextDecoder().decode(plaintext)));
  }

  function setVaultMode(mode, message = "") {
    const isUnlock = mode === "unlock";
    const title = $("vaultTitle");
    const description = $("vaultDescription");
    const confirmGroup = $("vaultConfirmGroup");
    const confirmInput = $("vaultConfirm");
    const submit = $("vaultSubmit");
    const freshButton = $("startFresh");

    if (isUnlock) {
      title.textContent = "Unlock your local vault.";
      description.textContent =
        "Enter the passphrase you created for this device. It is not stored or sent to a server.";
      confirmGroup.hidden = true;
      confirmInput.required = false;
      submit.textContent = "Unlock vault";
      freshButton.hidden = true;
    } else {
      title.textContent = "Your subscription list stays on this device.";
      description.textContent =
        "Create a passphrase to encrypt your local data. The passphrase is not saved; you will need it again when you return.";
      confirmGroup.hidden = false;
      confirmInput.required = true;
      submit.textContent = "Create encrypted vault";
      freshButton.hidden = !message.includes("older vault used a browser-session-only key");
    }
    if (message) setStatus($("vaultStatus"), message, true);
  }

  async function persist() {
    if (!vaultKey || !vaultSalt) {
      throw new Error("Unlock the local vault before saving changes.");
    }
    const encrypted = await encryptVault(state, vaultKey, vaultSalt);
    localStorage.setItem(VAULT_KEY, encrypted);
  }

  function isPro() {
    return proActive;
  }

  function subscriptionLimit() {
    return isPro() ? MAX_SUBSCRIPTIONS : FREE_SUBSCRIPTION_LIMIT;
  }

  function auditLimit() {
    return isPro() ? Number.POSITIVE_INFINITY : FREE_AUDIT_LIMIT;
  }

  async function refreshProStatus() {
    const status = $("proStatus");
    try {
      const response = await fetch("/api/pro-status", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error(`Entitlement check returned HTTP ${response.status}.`);
      }
      const data = await response.json();
      proActive = data?.active === true && data?.status === "active";
      status.textContent = proActive ? "Pro — server verified" : "Free";
      render();
    } catch (error) {
      proActive = false;
      status.textContent = "Free — verification unavailable";
      showToast(`Could not verify Pro access: ${error.message}`);
    }
  }

  function getKnownCategoryCounts() {
    const counts = new Map();
    for (const item of state.subscriptions) {
      if (item.category !== "Unknown") {
        counts.set(item.category, (counts.get(item.category) || 0) + 1);
      }
    }
    return counts;
  }

  function createActionButton(label, action, id) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.id = id;
    return button;
  }

  async function fetchTaxRate(jurisdiction) {
    if (taxRateCache.has(jurisdiction)) return taxRateCache.get(jurisdiction);
    const request = fetch(`/api/tax-rates?country=${encodeURIComponent(jurisdiction)}`, {
      headers: { Accept: "application/json" }, credentials: "same-origin",
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data?.reason || `Rate lookup returned HTTP ${response.status}.`);
      return data;
    });
    taxRateCache.set(jurisdiction, request);
    try { return await request; } catch (error) {
      taxRateCache.delete(jurisdiction);
      throw error;
    }
  }

  async function updateTaxSummary(item, output) {
    if (!item.jurisdiction || !item.taxType || item.taxTreatment === "unknown") {
      output.textContent = "Tax estimate unavailable: jurisdiction, tax type, or price treatment is unknown.";
      return;
    }
    let rateInfo;
    if (item.taxRateSource === "manual") {
      rateInfo = {
        status: "manual", rate: item.taxRate, jurisdiction: item.jurisdiction,
        taxType: item.taxType, userSupplied: true,
      };
    } else if (item.taxType === "vat") {
      try { rateInfo = await fetchTaxRate(item.jurisdiction); }
      catch (error) {
        output.textContent = `Verified rate unavailable (${error.message}); no zero rate was assumed.`;
        return;
      }
    } else {
      output.textContent = "No automated rate is available for this tax type. Enter a manual rate you have verified.";
      return;
    }
    const calculation = window.StackcutTax.calculate({
      amount: item.price, currency: item.currency, interval: item.billingInterval,
      taxType: item.taxType, jurisdiction: item.jurisdiction, treatment: item.taxTreatment,
    }, rateInfo);
    if (!["verified", "manual"].includes(calculation.status)) {
      output.textContent = calculation.reason || "No rate is available; no zero rate was assumed.";
      return;
    }
    const source = calculation.status === "manual"
      ? "Manual, user-supplied rate"
      : `Verified VATcomply standard-rate reference retrieved ${calculation.retrievedAt || "at unknown time"}`;
    const region = item.jurisdictionDetail ? `${item.jurisdiction} · ${item.jurisdictionDetail}` : item.jurisdiction;
    output.textContent =
      `Estimated ${item.taxType.toUpperCase()} for ${region}: tax ${formatMoney(calculation.tax, item.currency)} per ${item.billingInterval}; ` +
      `total ${formatMoney(calculation.total, item.currency)}; monthly ${formatMoney(calculation.monthlyEquivalent, item.currency)}; ` +
      `annual ${formatMoney(calculation.annualEquivalent, item.currency)}. ${source}. Estimate only, not a confirmed invoice charge.`;
  }

  function renderSubscriptions() {
    const list = $("subscriptionList");
    const empty = $("listEmpty");
    list.replaceChildren();
    empty.hidden = state.subscriptions.length > 0;
    const categoryCounts = getKnownCategoryCounts();

    for (const item of state.subscriptions) {
      const row = document.createElement("article");
      row.className = "subscription-row";
      row.dataset.id = item.id;
      row.dataset.decision = item.decision || "review";

      const main = document.createElement("div");
      main.className = "subscription-main";
      const name = document.createElement("div");
      name.className = "subscription-name";
      name.textContent = item.name;
      const meta = document.createElement("div");
      meta.className = "subscription-meta";
      const interval = item.billingInterval === "monthly" ? "mo" : item.billingInterval;
      const details = [`${formatMoney(item.price, item.currency)}/${interval}`, item.category];
      details.push("Usage history not provided");
      if (item.transactionDate) details.push(`Transaction date: ${item.transactionDate}`);
      meta.textContent = details.join(" · ");
      const taxSummary = document.createElement("p");
      taxSummary.className = "subscription-tax-summary";
      taxSummary.textContent = "Loading tax estimate…";
      main.append(name, meta, taxSummary);
      void updateTaxSummary(item, taxSummary).catch(() => {
        taxSummary.textContent = "Tax estimate unavailable; no rate was assumed.";
      });

      if (item.category !== "Unknown" && categoryCounts.get(item.category) > 1) {
        const overlap = document.createElement("span");
        overlap.className = "review-tag";
        overlap.textContent = "Possible category overlap — review";
        main.append(overlap);
      }
      if (item.decision) {
        const decision = document.createElement("span");
        decision.className = "unknown-tag";
        decision.textContent = item.decision === "keep" ? "Marked to keep" : "Marked to cut";
        main.append(decision);
      }

      const actions = document.createElement("div");
      actions.className = "subscription-actions";
      actions.append(
        createActionButton("Keep", "keep", item.id),
        createActionButton("Mark cut", "cut", item.id),
        ...(item.decision
          ? [createActionButton("Clear decision", "clear", item.id)]
          : []),
        createActionButton("Manage", "edit", item.id),
        createActionButton("Remove", "remove", item.id),
      );
      row.append(main, actions);
      list.append(row);
    }
  }

  function renderCategoryBreakdown() {
    const container = $("categoryBreakdown");
    const empty = $("categoryEmpty");
    container.replaceChildren();
    const totals = new Map();
    for (const item of state.subscriptions) {
      if (item.category === "Unknown") continue;
      if (!totals.has(item.category)) totals.set(item.category, new Map());
      const byCurrency = totals.get(item.category);
      const monthly = window.StackcutTax.toMonthlyEquivalent(item.price, item.currency, item.billingInterval);
      byCurrency.set(item.currency, (byCurrency.get(item.currency) || 0) + monthly);
    }
    const entries = Array.from(totals.entries()).flatMap(([category, currencies]) =>
      Array.from(currencies, ([currency, total]) => ({ category, currency, total })),
    );
    empty.hidden = entries.length > 0;
    const maxima = new Map();
    for (const entry of entries) maxima.set(entry.currency, Math.max(maxima.get(entry.currency) || 0, entry.total));
    for (const { category, currency, total } of entries) {
      const line = document.createElement("div");
      line.className = "category-line";
      const label = document.createElement("span");
      label.textContent = `${category} · ${currency}`;
      const amount = document.createElement("strong");
      amount.textContent = formatMoney(total, currency);
      const track = document.createElement("div");
      track.className = "category-track";
      const fill = document.createElement("div");
      fill.className = "category-fill";
      fill.style.width = `${Math.max(3, (total / maxima.get(currency)) * 100)}%`;
      track.append(fill);
      line.append(label, amount, track);
      container.append(line);
    }
  }

  function renderAuditReport() {
    const list = $("auditRankedList");
    const empty = $("auditEmpty");
    if (!list || !empty || !window.StackcutOverlapAudit) return;

    list.replaceChildren();

    const candidates = window.StackcutOverlapAudit.analyze(
      state.subscriptions,
      state.overlapDecisions || {},
    );
    const visible = isPro() || state.auditCount > 0;

    $("auditCandidateCount").textContent =
      visible ? String(candidates.totalCount ?? candidates.length) : "—";
    $("auditPendingCount").textContent = visible
      ? String(candidates.filter((item) =>
          ["pending", "later"].includes(item.decision),
        ).length)
      : "—";

    if (!visible) {
      empty.hidden = false;
      empty.textContent = "Run your first audit to review possible overlaps.";
      return;
    }

    empty.hidden = candidates.length > 0;
    empty.textContent = candidates.length
      ? ""
      : "No possible overlaps were found using the available names and categories. This does not guarantee that every subscription is unique.";

    function makeButton(label, action, recommendationId, extra = {}) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-secondary audit-action";
      button.textContent = label;
      button.dataset.overlapAction = action;
      button.dataset.recommendationId = recommendationId;
      for (const [key, value] of Object.entries(extra)) {
        button.dataset[key] = value;
      }
      return button;
    }

    for (const item of candidates) {
      const card = document.createElement("article");
      card.className = "audit-candidate";

      const heading = document.createElement("div");
      heading.className = "audit-candidate-heading";

      const title = document.createElement("h3");
      title.textContent = item.subscriptions
        .map((subscription) => subscription.name)
        .join(" + ");

      const confidence = document.createElement("span");
      confidence.className = "audit-confidence";
      confidence.textContent = `${item.confidence} evidence`;

      heading.append(title, confidence);
      card.append(heading);

      const services = document.createElement("div");
      services.className = "audit-service-grid";

      item.subscriptions.forEach((subscription, index) => {
        const service = document.createElement("div");
        service.className = "audit-service";

        const name = document.createElement("strong");
        name.textContent = subscription.name;

        const currency = String(subscription.currency || "USD").toUpperCase();
        const annual = document.createElement("p");
        const annualValue = item.annualCosts[index];
        annual.textContent = annualValue === null
          ? "Annual cost unavailable"
          : `${formatMoney(annualValue, currency)} / year`;

        const category = document.createElement("p");
        category.textContent = `Category: ${subscription.category || "Unknown"}`;

        service.append(name, annual, category);
        services.append(service);
      });

      card.append(services);

      const cost = document.createElement("p");
      cost.className = "audit-combined-cost";
      cost.textContent =
        item.combinedAnnualCost !== null && item.currency
          ? `Combined annual cost under review: ${formatMoney(item.combinedAnnualCost, item.currency)}. This is not potential savings.`
          : "Combined cost not totaled because currencies differ or an amount is unavailable.";
      card.append(cost);

      const explanation = document.createElement("ul");
      explanation.className = "audit-evidence";
      for (const signal of item.signals) {
        const line = document.createElement("li");
        line.textContent = signal.explanation;
        explanation.append(line);
      }
      card.append(explanation);

      const status = document.createElement("p");
      status.className = "audit-decision-status";
      const statusLabels = {
        pending: "Awaiting your review",
        confirmed: "You confirmed a possible overlap",
        rejected: "You marked this recommendation as not redundant",
        later: "You chose to decide later",
      };
      status.textContent = statusLabels[item.decision] || statusLabels.pending;
      card.append(status);

      const actions = document.createElement("div");
      actions.className = "audit-actions";

      actions.append(
        makeButton("Confirm overlap", "decision", item.id, { decision: "confirmed" }),
        makeButton("Not redundant", "decision", item.id, { decision: "rejected" }),
        makeButton("Decide later", "decision", item.id, { decision: "later" }),
      );

      if (item.decision !== "pending") {
        actions.append(
          makeButton("Undo review decision", "decision", item.id, { decision: "pending" }),
        );
      }

      if (item.decision === "confirmed") {
        item.subscriptions.forEach((subscription) => {
          const alreadyCut = subscription.decision === "cut";
          actions.append(
            makeButton(
              alreadyCut
                ? `Undo planned cut: ${subscription.name}`
                : `Plan to cut: ${subscription.name}`,
              "plan-cut",
              item.id,
              { subscriptionId: String(subscription.id) },
            ),
          );
        });
      }

      card.append(actions);
      list.append(card);
    }
  }

  function render() {
    const items = state.subscriptions;
    const monthly = new Map();
    const savings = new Map();
    for (const item of items) {
      const value = window.StackcutTax.toMonthlyEquivalent(item.price, item.currency, item.billingInterval);
      monthly.set(item.currency, (monthly.get(item.currency) || 0) + value);
      if (item.decision === "cut") savings.set(item.currency, (savings.get(item.currency) || 0) + value);
    }
    const categories = getKnownCategoryCounts();
    const overlaps = Array.from(categories.values()).filter((count) => count > 1).length;
    $("monthlySpend").textContent = formatCurrencyTotals(monthly);
    $("subCount").textContent = String(items.length);
    $("overlapCount").textContent = String(overlaps);
    $("potentialSavings").textContent = formatCurrencyTotals(savings);
    $("auditUsage").textContent = isPro()
      ? `${state.auditCount} audits completed`
      : `${state.auditCount} of ${FREE_AUDIT_LIMIT} free audits used`;
    $("planNote").textContent =
      `Free limits are applied in this browser; this static app has no authenticated server quota. ` +
      `${items.length}/${subscriptionLimit()} subscriptions.`;
    renderSubscriptions();
    renderCategoryBreakdown();
    renderAuditReport();
  }

  function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog(dialog) {
    if (dialog.open) dialog.close();
  }

  function showLimitDialog(message) {
    $("paywallMessage").textContent = message;
    openDialog($("paywallDialog"));
  }

  async function saveAndRender(successMessage) {
    try {
      await persist();
      render();
      if (successMessage) showToast(successMessage);
      return true;
    } catch (error) {
      showToast(`Could not save your changes: ${error.message}`);
      return false;
    }
  }

  function validName(name) {
    return name.length >= 2 && name.length <= 64 && /^[\p{L}\p{N} .+\-_()]+$/u.test(name);
  }

  function readTaxDetails(prefix) {
    const currency = $(`${prefix}Currency`).value.trim().toUpperCase();
    window.StackcutTax.currencyDigits(currency);
    const jurisdiction = window.StackcutTax.normalizeCountryCode($(`${prefix}Country`).value);
    const taxType = $(`${prefix}TaxType`).value;
    const taxTreatment = $(`${prefix}Treatment`).value;
    const manual = $(`${prefix}ManualEnabled`).checked;
    const rawRate = $(`${prefix}ManualRate`).value;
    let taxRate = null;
    if (manual) {
      taxRate = Number(rawRate);
      if (!jurisdiction || !taxType || taxTreatment === "unknown") {
        throw new Error("Choose jurisdiction, tax type, and price treatment for a manual rate.");
      }
      if (!rawRate.trim() || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
        throw new Error("Enter a manual rate from 0 to 100%; it will be labeled user-supplied.");
      }
    }
    return {
      currency,
      billingInterval: $(`${prefix}Interval`).value,
      jurisdiction,
      taxType,
      taxTreatment,
      jurisdictionDetail: $(`${prefix}JurisdictionDetail`).value.trim(),
      taxRateSource: manual ? "manual" : null,
      taxRate,
    };
  }

  async function addSubscription(event) {
    event.preventDefault();
    const name = $("newName").value.trim();
    const rawPrice = $("newPrice").value;
    const price = Number(rawPrice);
    const category = $("newJob").value || "Unknown";
    if (!validName(name)) {
      setStatus($("addStatus"), "Use a 2–64 character name with letters, numbers, spaces, or . + - _ ( ).", true);
      return;
    }
    if (!rawPrice.trim() || !Number.isFinite(price) || price <= 0 || price > 10000) {
      setStatus($("addStatus"), "Enter a positive amount no more than 10,000 per billing interval.", true);
      return;
    }
    let taxDetails;
    try { taxDetails = readTaxDetails("new"); } catch (error) {
      setStatus($("addStatus"), error.message, true);
      return;
    }
    if (state.subscriptions.length >= subscriptionLimit()) {
      showLimitDialog("The Free experience supports three subscriptions in this browser. Remove an item or review Pro options to continue.");
      return;
    }
    if (state.subscriptions.length >= MAX_SUBSCRIPTIONS) {
      setStatus($("addStatus"), `The ${MAX_SUBSCRIPTIONS.toLocaleString()} item storage limit has been reached.`, true);
      return;
    }
    const previous = state.subscriptions;
    state.subscriptions = [
      ...previous,
      normalizeSubscription({ id: crypto.randomUUID(), name, price, category, ...taxDetails }),
    ];
    if (await saveAndRender(`${name} added.`)) {
      $("addForm").reset();
      setStatus($("addStatus"), "Subscription added.");
    } else {
      state.subscriptions = previous;
      render();
    }
  }

  async function runAudit() {
    if (state.auditCount >= auditLimit()) {
      showLimitDialog("The Free experience includes one audit in this browser. Review Pro options to continue.");
      return;
    }
    const previousCount = state.auditCount;
    state.auditCount += 1;
    if (await saveAndRender("Audit completed. Review the possible overlaps and your decisions.")) {
      return;
    }
    state.auditCount = previousCount;
    render();
  }

  async function setDecision(id, decision) {
    const item = state.subscriptions.find((entry) => entry.id === id);
    if (!item) return;
    const previous = item.decision;
    item.decision = item.decision === decision ? null : decision;
    if (!(await saveAndRender("Your review decision was saved."))) {
      item.decision = previous;
      render();
    }
  }

  function openEdit(id) {
    const item = state.subscriptions.find((entry) => entry.id === id);
    if (!item) return;
    $("editId").value = item.id;
    $("editName").value = item.name;
    $("editPrice").value = String(item.price);
    $("editJob").value = item.category;
    $("editCurrency").value = item.currency;
    $("editInterval").value = item.billingInterval;
    $("editCountry").value = item.jurisdiction;
    $("editTaxType").value = item.taxType;
    $("editTreatment").value = item.taxTreatment;
    $("editJurisdictionDetail").value = item.jurisdictionDetail;
    $("editManualEnabled").checked = item.taxRateSource === "manual";
    $("editManualRate").value = item.taxRateSource === "manual" ? String(item.taxRate) : "";
    $("editManualRate").disabled = !$("editManualEnabled").checked;
    setStatus($("editStatus"), "");
    openDialog($("editDialog"));
    $("editName").focus();
  }

  async function saveEdit(event) {
    event.preventDefault();
    const item = state.subscriptions.find((entry) => entry.id === $("editId").value);
    if (!item) return;
    const name = $("editName").value.trim();
    const rawPrice = $("editPrice").value;
    const price = Number(rawPrice);
    if (!validName(name)) {
      setStatus($("editStatus"), "Enter a valid 2–64 character name.", true);
      return;
    }
    if (!rawPrice.trim() || !Number.isFinite(price) || price <= 0 || price > 10000) {
      setStatus($("editStatus"), "Enter a positive amount no more than 10,000 per billing interval.", true);
      return;
    }
    let taxDetails;
    try { taxDetails = readTaxDetails("edit"); } catch (error) {
      setStatus($("editStatus"), error.message, true);
      return;
    }
    const previous = { ...item };
    item.name = name;
    item.price = window.StackcutTax.roundCurrency(price, taxDetails.currency);
    item.category = $("editJob").value || "Unknown";
    Object.assign(item, taxDetails);
    if (await saveAndRender("Subscription updated.")) {
      closeDialog($("editDialog"));
    } else {
      Object.assign(item, previous);
    }
  }

  async function removeSubscription(id) {
    const item = state.subscriptions.find((entry) => entry.id === id);
    if (!item || !window.confirm(`Remove "${item.name}" from your list?`)) return;
    const previous = state.subscriptions;
    state.subscriptions = previous.filter((entry) => entry.id !== id);
    if (!(await saveAndRender(`${item.name} removed.`))) {
      state.subscriptions = previous;
      render();
    }
  }

  async function resetAll() {
    if (!window.confirm("Remove all subscriptions and reset audit usage for this vault?")) return;
    const previous = state;
    state = { subscriptions: [], auditCount: 0, overlapDecisions: {} };
    if (!(await saveAndRender("Your list and audit count were reset."))) {
      state = previous;
      render();
    }
  }

  async function exportJSON() {
    const data = {
      format: "stackcut-plaintext-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      auditCount: state.auditCount,
      subscriptions: state.subscriptions,
      notice: "This JSON export is plaintext and is not encrypted.",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stackcut-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Plaintext JSON export downloaded.");
  }

  function stopWorker() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    currentImportId = null;
  }

  function updateImportProgress(count) {
    const progress = $("csvProgress");
    progress.value = Math.min(95, Math.max(progress.value, Math.round((count / MAX_IMPORT_ROWS) * 95)));
    setStatus($("csvStatus"), `Parsed ${count.toLocaleString()} positive rows…`);
  }

  function canImportCount(count) {
    const total = state.subscriptions.length + count;
    if (total > MAX_SUBSCRIPTIONS) {
      return `Import would exceed the ${MAX_SUBSCRIPTIONS.toLocaleString()} subscription storage limit. No rows were added.`;
    }
    if (total > subscriptionLimit()) {
      return `Import contains ${count} rows, but only ${Math.max(0, subscriptionLimit() - state.subscriptions.length)} Free slots remain. No rows were added.`;
    }
    return "";
  }

  async function applyImport(rows, refundCount = 0, invalidCount = 0) {
    const limitError = canImportCount(rows.length);
    if (limitError) {
      setStatus($("csvStatus"), limitError, true);
      return false;
    }
    const previous = state.subscriptions;
    state.subscriptions = [
      ...previous,
      ...rows.map((row) =>
        normalizeSubscription({
          id: crypto.randomUUID(),
          name: row.vendor,
          price: row.amount,
          category: row.category || "Unknown",
          transactionDate: row.date || "",
        }),
      ),
    ];
    if (!(await saveAndRender())) {
      state.subscriptions = previous;
      render();
      setStatus($("csvStatus"), "The import could not be saved. Existing data was preserved.", true);
      return false;
    }
    $("csvProgress").value = 100;
    setStatus(
      $("csvStatus"),
      `Imported ${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"}.${refundCount ? ` Skipped ${refundCount.toLocaleString()} refund or zero-value row${refundCount === 1 ? "" : "s"}.` : ""}${invalidCount ? ` Skipped ${invalidCount.toLocaleString()} row${invalidCount === 1 ? "" : "s"} with missing or invalid amounts.` : ""}`,
    );
    return true;
  }

  function handleWorkerMessage(event, collectedRows, importId) {
    const message = event.data;
    if (!message || message.id !== importId || currentImportId !== importId) return;
    if (message.type === "progress") {
      updateImportProgress(message.count || 0);
      return;
    }
    if (message.type === "batch") {
      if (!Array.isArray(message.rows)) {
        setStatus($("csvStatus"), "The CSV parser returned an invalid batch.", true);
        stopWorker();
        return;
      }
      collectedRows.push(...message.rows);
      updateImportProgress(collectedRows.length);
      return;
    }
    if (message.type === "error") {
      setStatus($("csvStatus"), message.message || "The CSV parser could not read this file.", true);
      $("csvProgress").value = 0;
      stopWorker();
      return;
    }
    if (message.type !== "complete") {
      setStatus($("csvStatus"), "The CSV parser returned an unknown response.", true);
      stopWorker();
      return;
    }
    if (message.count !== collectedRows.length) {
      setStatus($("csvStatus"), "Import stopped because the parser row count did not match its batches.", true);
      stopWorker();
      return;
    }
    $("fuzzyMap").textContent =
      `Columns: amount “${message.map.amount}”, name “${message.map.vendor}”, category “${message.map.category || "not provided"}”.`;
    if (!message.count) {
      const detail = message.refundCount
        ? `No positive spend rows were found; ${message.refundCount} refund or zero-value rows were skipped.`
        : message.invalidCount
          ? `No positive spend rows were found; ${message.invalidCount} row${message.invalidCount === 1 ? "" : "s"} had missing or invalid amounts.`
          : "No importable rows were found. Check that the file has a header row and positive amounts.";
      setStatus($("csvStatus"), detail, true);
      $("csvProgress").value = 0;
      stopWorker();
      return;
    }
    void applyImport(
      collectedRows,
      message.refundCount || 0,
      message.invalidCount || 0,
    ).then((success) => {
      if (success) closeDialog($("uploadDialog"));
      stopWorker();
    });
  }

  function startCsvImport() {
    const file = $("csvFile").files?.[0];
    $("csvProgress").value = 0;
    $("fuzzyMap").textContent = "";
    if (!file) {
      setStatus($("csvStatus"), "Choose a CSV or TXT file first.", true);
      return;
    }
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setStatus($("csvStatus"), "Unsupported file type. Choose a .csv or .txt file.", true);
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setStatus($("csvStatus"), "This file is larger than the 10 MB limit.", true);
      return;
    }
    if (file.size === 0) {
      setStatus($("csvStatus"), "This file is empty. Choose a CSV with a header and data rows.", true);
      return;
    }
    setStatus($("csvStatus"), "Reading file…");
    const reader = new FileReader();
    reader.onerror = () => {
      setStatus($("csvStatus"), "The browser could not read this file. Try another local CSV.", true);
    };
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.trim()) {
        setStatus($("csvStatus"), "This file is empty or could not be decoded as text.", true);
        return;
      }
      try {
        stopWorker();
        worker = new Worker("/parser.worker.js");
        currentImportId = crypto.randomUUID();
        const importId = currentImportId;
        const rows = [];
        worker.onmessage = (event) => handleWorkerMessage(event, rows, importId);
        worker.onerror = (event) => {
          event.preventDefault();
          setStatus($("csvStatus"), `CSV parser failed to load or run: ${event.message || "unknown worker error"}.`, true);
          $("csvProgress").value = 0;
          stopWorker();
        };
        worker.onmessageerror = () => {
          setStatus($("csvStatus"), "The CSV parser returned unreadable data. No rows were imported.", true);
          $("csvProgress").value = 0;
          stopWorker();
        };
        setStatus($("csvStatus"), "Parsing CSV in a local worker…");
        worker.postMessage({ type: "parse", id: importId, text: reader.result });
      } catch (error) {
        setStatus($("csvStatus"), `Could not start the CSV parser: ${error.message}`, true);
        stopWorker();
      }
    };
    reader.readAsText(file);
  }

  async function loadSampleData() {
    const sample = [
      { name: "Example streaming plan", price: 12.99, category: "Streaming" },
      { name: "Example design tool", price: 18, category: "Design" },
      { name: "Example project tool", price: 9, category: "Project management" },
    ];
    const available = Math.max(0, subscriptionLimit() - state.subscriptions.length);
    if (!available) {
      setStatus($("csvStatus"), "No subscription slots remain. No sample data was added.", true);
      showLimitDialog("There are no Free subscription slots available for sample data.");
      return;
    }
    const records = sample.slice(0, available);
    const success = await applyImport(records.map((item) => ({
      vendor: item.name,
      amount: item.price,
      category: item.category,
      date: "",
    })));
    if (success) {
      setStatus($("csvStatus"), `Loaded ${records.length} sample records. Sample data is not verified usage history.`);
      closeDialog($("uploadDialog"));
    }
  }

  async function verifyProAccess() {
    const subscriptionId = $("subscriptionId").value.trim();
    if (!subscriptionId) {
      setStatus($("entitlementStatus"), "Enter a PayPal subscription ID to check it with the server.", true);
      return;
    }
    setStatus($("entitlementStatus"), "Checking the subscription with PayPal…");
    try {
      const response = await fetch("/api/pro-status", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "X-Stackcut-Subscription-Id": subscriptionId },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.reason || `Server returned HTTP ${response.status}.`);
      }
      if (data?.active !== true || data?.status !== "active" || data?.source !== "paypal") {
        proActive = false;
        $("proStatus").textContent = "Free";
        render();
        setStatus(
          $("entitlementStatus"),
          data?.reason || "The server did not verify an active entitlement. No paid features were unlocked.",
          true,
        );
        return;
      }
      proActive = true;
      $("proStatus").textContent = "Pro — PayPal verified for this session";
      $("subscriptionId").value = "";
      render();
      setStatus($("entitlementStatus"), "PayPal verified this subscription for this session. The ID was not saved in this browser.");
      closeDialog($("paywallDialog"));
    } catch (error) {
      proActive = false;
      $("proStatus").textContent = "Free — verification unavailable";
      render();
      setStatus($("entitlementStatus"), `Could not verify access: ${error.message}`, true);
    }
  }

  function setupDialogs() {
    $("btnUpload").addEventListener("click", () => {
      $("csvProgress").value = 0;
      openDialog($("uploadDialog"));
    });
    $("btnParse").addEventListener("click", startCsvImport);
    $("btnSample").addEventListener("click", () => void loadSampleData());
    $("btnUnlock").addEventListener("click", () => openDialog($("paywallDialog")));
    $("btnContinueFree").addEventListener("click", () => closeDialog($("paywallDialog")));
    $("btnActivate").addEventListener("click", () => void verifyProAccess());
    $("uploadDialog").addEventListener("close", stopWorker);
    $("editDialog").addEventListener("click", (event) => {
      if (event.target === $("editDialog")) closeDialog($("editDialog"));
    });
    $("btnCancelEdit").addEventListener("click", () => closeDialog($("editDialog")));
  }

  function setupAppEvents() {
    for (const id of ["newCountry", "editCountry"]) {
      for (const country of window.StackcutTax.countries) {
        const option = document.createElement("option");
        option.value = country.code;
        const availability = window.StackcutTax.euVatCountries.includes(country.code)
          ? "EU standard VAT reference"
          : "manual only / unsupported";
        option.textContent = `${country.name} (${country.code}) — ${availability}`;
        $(id).append(option);
      }
    }
    for (const prefix of ["new", "edit"]) {
      const toggle = $(`${prefix}ManualEnabled`);
      const rate = $(`${prefix}ManualRate`);
      const sync = () => {
        rate.disabled = !toggle.checked;
        rate.required = toggle.checked;
      };
      toggle.addEventListener("change", sync);
      if (prefix === "new") $("addForm").addEventListener("reset", () => window.setTimeout(sync));
      sync();
    }
    $("btnExport").addEventListener("click", exportJSON);
    $("btnReset").addEventListener("click", () => void resetAll());
    $("btnRunAudit").addEventListener("click", () => void runAudit());
    $("addForm").addEventListener("submit", (event) => void addSubscription(event));
    $("editForm").addEventListener("submit", (event) => void saveEdit(event));
    $("subscriptionList").addEventListener("click", (event) => {
      const button = event.target instanceof Element
        ? event.target.closest("button[data-action]")
        : null;
      if (!button) return;
      const { action, id } = button.dataset;
      if (action === "keep" || action === "cut") void setDecision(id, action);
      if (action === "clear") void setDecision(id, null);
      if (action === "edit") openEdit(id);
      if (action === "remove") void removeSubscription(id);
    });

    $("auditRankedList").addEventListener("click", async (event) => {
      const button = event.target instanceof Element
        ? event.target.closest("button[data-overlap-action]")
        : null;
      if (!button) return;

      const action = button.dataset.overlapAction;
      const recommendationId = button.dataset.recommendationId;
      const candidates = window.StackcutOverlapAudit.analyze(
        state.subscriptions,
        state.overlapDecisions || {},
      );
      const candidate = candidates.find((item) => item.id === recommendationId);
      if (!candidate) {
        showToast("This recommendation changed. Run the audit again.");
        renderAuditReport();
        return;
      }

      if (action === "decision") {
        const previous = state.overlapDecisions[recommendationId];
        state.overlapDecisions[recommendationId] = {
          status: button.dataset.decision,
          fingerprint: candidate.fingerprint || "",
        };
        if (!(await saveAndRender("Review decision saved in your local vault."))) {
          if (previous === undefined) delete state.overlapDecisions[recommendationId];
          else state.overlapDecisions[recommendationId] = previous;
          render();
        }
        return;
      }

      if (action === "plan-cut") {
        const subscription = state.subscriptions.find(
          (item) => String(item.id) === button.dataset.subscriptionId,
        );
        if (!subscription) return;

        if (
          subscription.decision !== "cut" &&
          !window.confirm(
            `Mark "${subscription.name}" as a planned cut? This will not cancel the service.`,
          )
        ) return;

        await setDecision(subscription.id, "cut");
      }
    });
  }

  async function unlockOrCreateVault(event) {
    event.preventDefault();
    const passphrase = $("vaultPassphrase").value;
    if (passphrase.length < 12) {
      setStatus($("vaultStatus"), "Use a passphrase with at least 12 characters.", true);
      return;
    }
    const stored = localStorage.getItem(VAULT_KEY);
    if (stored) {
      try {
        const unlocked = await decryptVault(stored, passphrase);
        state = normalizeState(unlocked.data);
        vaultKey = unlocked.key;
        vaultSalt = fromBase64(JSON.parse(stored).salt);
      } catch {
        setStatus($("vaultStatus"), "The passphrase was incorrect or the encrypted vault could not be read. Saved data was not changed.", true);
        return;
      }
    } else {
      if ($("vaultConfirm").value !== passphrase) {
        setStatus($("vaultStatus"), "The passphrases do not match.", true);
        return;
      }
      if (legacyError && !ignoreLegacyVault) {
        setStatus($("vaultStatus"), "The older vault could not be migrated. Choose “Create a new vault without deleting old data” to continue safely.", true);
        return;
      }
      try {
        const initialData = ignoreLegacyVault
          ? { subscriptions: [], auditCount: 0 }
          : legacyState || await readLegacyData();
        state = normalizeState(initialData);
        vaultSalt = crypto.getRandomValues(new Uint8Array(16));
        vaultKey = await deriveVaultKey(passphrase, vaultSalt);
        await persist();
        if (!ignoreLegacyVault) {
          for (const key of LEGACY_KEYS) localStorage.removeItem(key);
          localStorage.removeItem("audit_count");
        }
      } catch (error) {
        vaultKey = null;
        vaultSalt = null;
        setStatus($("vaultStatus"), `Could not create or migrate the encrypted vault: ${error.message}. Existing data was not deliberately removed.`, true);
        return;
      }
    }

    $("vaultPassphrase").value = "";
    $("vaultConfirm").value = "";
    $("vaultGate").hidden = true;
    $("appContent").hidden = false;
    setupDialogs();
    setupAppEvents();
    render();
    void refreshProStatus();
  }

  function setupVaultForm() {
    $("vaultForm").addEventListener("submit", (event) => void unlockOrCreateVault(event));
    $("startFresh").addEventListener("click", () => {
      ignoreLegacyVault = true;
      legacyError = "";
      setVaultMode("create", "A new vault will be created separately. The older data remains untouched in browser storage.");
      $("vaultPassphrase").focus();
    });
  }

  async function boot() {
    setupVaultForm();
    const stored = localStorage.getItem(VAULT_KEY);
    if (stored) {
      setVaultMode("unlock");
      $("vaultPassphrase").focus();
      return;
    }
    try {
      const legacy = await readLegacyData();
      legacyState = legacy;
      setVaultMode("create");
    } catch (error) {
      legacyError = error.message;
      setVaultMode("create", error.message);
    }
  }

  void boot().catch((error) => {
    setStatus($("vaultStatus"), `The app could not initialize safely: ${error.message}`, true);
  });
})();
