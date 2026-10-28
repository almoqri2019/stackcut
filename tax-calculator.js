(() => {
  "use strict";
  const engine = window.StackcutTax;
  const form = document.getElementById("taxForm");
  const countryInput = document.getElementById("taxCountry");
  const options = document.getElementById("taxCountries");
  const manual = document.getElementById("manualRateEnabled");
  const manualField = document.getElementById("manualRateField");
  const manualRate = document.getElementById("manualRate");
  const result = document.getElementById("taxResult");
  const status = document.getElementById("taxStatus");
  if (!engine) {
    status.textContent = "The local calculation engine failed to load. Reload the page and try again.";
    status.dataset.state = "error";
    form.querySelector('[type="submit"]').disabled = true;
    return;
  }
  const countryByName = new Map(engine.countries.map((country) => [country.name.toLowerCase(), country.code]));
  for (const country of engine.countries) {
    const option = document.createElement("option");
    option.value = country.name;
    option.label = `${country.code} — ${engine.euVatCountries.includes(country.code) ? "EU standard VAT reference" : "manual only / unsupported"}`;
    options.append(option);
  }
  const selectedCountry = () => {
    const value = countryInput.value.trim();
    const code = engine.normalizeCountryCode(value);
    return engine.countries.some((country) => country.code === code) ? code : countryByName.get(value.toLowerCase()) || "";
  };
  function setStatus(message, error = false) {
    status.textContent = message;
    status.dataset.state = error ? "error" : "info";
  }
  function setManualState() {
    manualField.hidden = !manual.checked;
    manualRate.disabled = !manual.checked;
    manualRate.required = manual.checked;
  }
  function display(calculation) {
    if (!["verified", "manual"].includes(calculation.status)) {
      result.hidden = true;
      setStatus(calculation.reason || "No rate available; no zero rate was assumed.", true);
      return;
    }
    for (const [id, value] of Object.entries({
      resultBase: calculation.subtotal,
      resultTax: calculation.tax,
      resultTotal: calculation.total,
      resultMonthly: calculation.monthlyEquivalent,
      resultAnnual: calculation.annualEquivalent,
    })) document.getElementById(id).textContent = engine.formatMoney(value, calculation.currency);
    document.getElementById("resultRate").textContent =
      `${calculation.rate}% ${calculation.taxType.toUpperCase()} — ${calculation.status === "manual" ? "Manual rate supplied by you" : "Verified-rate reference (standard rate)"}`;
    document.getElementById("resultSource").textContent = calculation.status === "manual"
      ? "Source: user supplied; StackCut has not independently verified this rate."
      : `Source: ${calculation.source?.provider || "rate provider"} · Retrieved ${calculation.retrievedAt || "time unavailable"} · Updated ${calculation.updatedAt || "not provided"} · Effective date ${calculation.effectiveDate || "not provided"}.`;
    document.getElementById("resultWarning").textContent = calculation.warning;
    result.hidden = false;
    setStatus("Estimate calculated; this does not confirm the vendor invoice.");
  }
  manual.addEventListener("change", setManualState);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    result.hidden = true;
    const jurisdiction = selectedCountry();
    if (!jurisdiction) return setStatus("Choose a listed country or valid two-letter country code.", true);
    const input = {
      amount: document.getElementById("taxAmount").value,
      currency: document.getElementById("taxCurrency").value,
      taxType: document.getElementById("taxType").value,
      jurisdiction,
      interval: document.getElementById("taxInterval").value,
      treatment: document.getElementById("taxTreatment").value,
    };
    try {
      let rateInfo;
      if (manual.checked) {
        rateInfo = { status: "manual", rate: manualRate.value, jurisdiction, taxType: input.taxType, userSupplied: true };
      } else if (input.taxType === "vat") {
        setStatus("Looking up the jurisdiction's standard VAT reference…");
        const response = await fetch(`/api/tax-rates?country=${encodeURIComponent(jurisdiction)}`, {
          headers: { Accept: "application/json" }, credentials: "same-origin",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.reason || `Rate lookup returned HTTP ${response.status}.`);
        rateInfo = data;
      } else {
        rateInfo = { status: "unsupported", reason: "Automated lookup covers EU standard VAT only. No GST or sales-tax rate was assumed." };
      }
      display(engine.calculate(input, rateInfo));
    } catch (error) {
      setStatus(`Could not calculate: ${error.message}`, true);
    }
  });
  form.addEventListener("reset", () => window.setTimeout(() => {
    result.hidden = true;
    setStatus("");
    setManualState();
  }));
  setManualState();
})();
