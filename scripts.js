(() => {
  const toggle = document.querySelector(".mobile-toggle");
  const menu = document.getElementById("mobileMenu");
  const featureToggle = document.querySelector(".nav-dropdown-toggle");
  const featureMenu = document.getElementById("featuresMenu");

  if (toggle && menu) {
    function setMenuOpen(isOpen) {
      menu.classList.toggle("hidden", !isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
    }

    toggle.addEventListener("click", () => {
      setMenuOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    menu.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) {
        setMenuOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setMenuOpen(false);
        toggle.focus();
      }
    });
  }

  if (!featureToggle || !featureMenu) return;

  function setFeaturesOpen(isOpen) {
    featureMenu.classList.toggle("hidden", !isOpen);
    featureToggle.setAttribute("aria-expanded", String(isOpen));
  }

  featureToggle.addEventListener("click", () => {
    setFeaturesOpen(featureToggle.getAttribute("aria-expanded") !== "true");
  });

  featureMenu.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      setFeaturesOpen(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && !event.target.closest(".nav-dropdown")) {
      setFeaturesOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && featureToggle.getAttribute("aria-expanded") === "true") {
      setFeaturesOpen(false);
      featureToggle.focus();
    }
  });
})();



/* STACKCUT_BURN_CALCULATOR */
(() => {
  "use strict";

  const form = document.getElementById("burnCalculatorForm");
  if (!form) return;

  const error = document.getElementById("burnError");
  const results = document.getElementById("burnResults");
  const annualTotal = document.getElementById("burnAnnualTotal");
  const annualReview = document.getElementById("burnAnnualReview");
  const breakdown = document.getElementById("burnBreakdown");
  const currencySelect = document.getElementById("burnCurrency");

  const annualMultipliers = {
    weekly: 52,
    monthly: 12,
    quarterly: 4,
    annual: 1
  };

  function money(value, currency) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(value);
  }

  function annualize(amount, interval) {
    return Math.round((amount * annualMultipliers[interval] + Number.EPSILON) * 100) / 100;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    error.hidden = true;
    error.textContent = "";

    const currency = currencySelect.value;
    const rows = Array.from(form.querySelectorAll(".burn-item"));
    const subscriptions = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const name = row.querySelector("[data-burn-name]").value.trim();
      const price = row.querySelector("[data-burn-price]").valueAsNumber;
      const interval = row.querySelector("[data-burn-interval]").value;
      const usage = row.querySelector("[data-burn-usage]").value;

      if (!name) {
        error.textContent = `Enter a name for subscription ${index + 1}.`;
        error.hidden = false;
        row.querySelector("[data-burn-name]").focus();
        return;
      }

      if (!Number.isFinite(price) || price <= 0 || price > 100000000) {
        error.textContent = `Enter a valid positive cost for "${name}".`;
        error.hidden = false;
        row.querySelector("[data-burn-price]").focus();
        return;
      }

      const multiplier = annualMultipliers[interval];
      if (!multiplier) {
        error.textContent = `Choose a supported billing interval for "${name}".`;
        error.hidden = false;
        return;
      }

      subscriptions.push({
        name,
        annual: annualize(price, interval),
        usage
      });
    }

    const total = Math.round(
      subscriptions.reduce((sum, item) => sum + item.annual, 0) * 100
    ) / 100;

    const review = Math.round(
      subscriptions
        .filter((item) => item.usage === "rarely" || item.usage === "unused")
        .reduce((sum, item) => sum + item.annual, 0) * 100
    ) / 100;

    annualTotal.textContent = money(total, currency);
    annualReview.textContent = money(review, currency);
    breakdown.replaceChildren();

    for (const item of subscriptions) {
      const li = document.createElement("li");
      const label = item.usage === "unused"
        ? "marked as no longer used"
        : item.usage === "rarely"
          ? "marked as rarely used"
          : "marked as used regularly";
      li.textContent = `${item.name}: ${money(item.annual, currency)} per year — ${label}.`;
      breakdown.append(li);
    }

    results.hidden = false;
    results.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  });
})();
