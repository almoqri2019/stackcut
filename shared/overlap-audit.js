(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.StackcutOverlapAudit = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const UNKNOWN_CATEGORIES = new Set(["", "unknown", "other", "n/a", "none"]);

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function normalizeCategory(value) {
    const category = normalizeText(value);

    return UNKNOWN_CATEGORIES.has(category) ? "" : category;
  }

  function annualCost(item) {
    const amount = Number(item?.price);
    const currency = String(item?.currency || "USD").toUpperCase();
    const interval = String(
      item?.billingInterval || item?.interval || "monthly"
    ).toLowerCase();

    const multipliers = {
      weekly: 52,
      monthly: 12,
      quarterly: 4,
      annual: 1,
      yearly: 1
    };

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 100000000 ||
      !Object.prototype.hasOwnProperty.call(multipliers, interval)
    ) {
      return null;
    }

    let digits;

    try {
      digits = new Intl.NumberFormat("en", {
        style: "currency",
        currency
      }).resolvedOptions().maximumFractionDigits;
    } catch {
      return null;
    }

    const result = amount * multipliers[interval];
    const factor = 10 ** digits;

    return Math.round((result + Number.EPSILON) * factor) / factor;
  }

  function editSimilarity(a, b) {
    if (a === b) return 1;
    if (!a || !b) return 0;

    const longest = Math.max(a.length, b.length);
    if (longest < 5) return 0;

    let previous = Array.from(
      { length: b.length + 1 },
      (_, index) => index
    );

    for (let i = 1; i <= a.length; i++) {
      const current = [i];

      for (let j = 1; j <= b.length; j++) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }

      previous = current;
    }

    return 1 - previous[b.length] / longest;
  }

  function stablePairId(firstId, secondId) {
    const ids = [String(firstId), String(secondId)].sort();

    return `overlap:${encodeURIComponent(ids[0])}:${encodeURIComponent(ids[1])}`;
  }

  function analyze(subscriptions, decisions = {}) {
    if (!Array.isArray(subscriptions)) {
      throw new TypeError("Subscriptions must be an array.");
    }

    const candidates = [];

    for (let i = 0; i < subscriptions.length; i++) {
      const a = subscriptions[i];

      for (let j = i + 1; j < subscriptions.length; j++) {
        const b = subscriptions[j];

        if (!a || !b || !a.id || !b.id || String(a.id) === String(b.id)) {
          continue;
        }

        const nameA = normalizeText(a.name);
        const nameB = normalizeText(b.name);

        if (!nameA || !nameB) continue;

        const signals = [];

        if (nameA === nameB) {
          signals.push({
            type: "same-name",
            strength: "high",
            explanation: "Both subscriptions have the same normalized name."
          });
        } else if (editSimilarity(nameA.replace(/\s/g, ""), nameB.replace(/\s/g, "")) >= 0.88) {
          signals.push({
            type: "similar-name",
            strength: "medium",
            explanation: "The subscription names are very similar; check whether these are duplicate records."
          });
        }

        const categoryA = normalizeCategory(a.category);
        const categoryB = normalizeCategory(b.category);

        if (categoryA && categoryA === categoryB) {
          signals.push({
            type: "same-category",
            strength: "low",
            explanation: `Both records use the "${a.category}" category. This suggests possible functional overlap but does not prove redundancy.`
          });
        }

        if (!signals.length) continue;

        const costA = annualCost(a);
        const costB = annualCost(b);
        const sameCurrency =
          String(a.currency || "USD").toUpperCase() ===
          String(b.currency || "USD").toUpperCase();

        const combinedAnnualCost =
          costA !== null && costB !== null && sameCurrency
            ? Math.round((costA + costB + Number.EPSILON) * 100) / 100
            : null;

        const hasStrongNameSignal = signals.some(
          signal => signal.type === "same-name"
        );

        const hasSimilarNameSignal = signals.some(
          signal => signal.type === "similar-name"
        );

        const confidence = hasStrongNameSignal
          ? "high"
          : hasSimilarNameSignal
            ? "medium"
            : "low";

        const [firstId, secondId] = [
          String(a.id),
          String(b.id)
        ].sort();

        const id = stablePairId(firstId, secondId);
        const fingerprint = JSON.stringify(
          [a, b]
            .slice()
            .sort((left, right) => String(left.id).localeCompare(String(right.id)))
            .map((item) => ({
              id: String(item.id),
              name: normalizeText(item.name),
              price: Number(item.price),
              currency: String(item.currency || "USD").toUpperCase(),
              interval: String(item.billingInterval || item.interval || "monthly").toLowerCase(),
              category: normalizeCategory(item.category),
            })),
        );
        const savedDecision = decisions[id];
        const savedFingerprint =
          savedDecision && typeof savedDecision === "object"
            ? savedDecision.fingerprint
            : "";
        const fingerprintMatches =
          !savedFingerprint || savedFingerprint === fingerprint;

        const validDecision = ["pending", "confirmed", "rejected", "later"]
          .includes(
            typeof savedDecision === "string"
              ? savedDecision
              : savedDecision?.status
          )
          ? typeof savedDecision === "string"
            ? savedDecision
            : savedDecision.status
          : "pending";

        candidates.push({
          id,
          subscriptionIds: [firstId, secondId],
          subscriptions: [a, b],
          annualCosts: [costA, costB],
          currency: sameCurrency
            ? String(a.currency || "USD").toUpperCase()
            : null,
          combinedAnnualCost,
          confidence,
          signals,
          explanation: signals.map(signal => signal.explanation).join(" "),
          decision: fingerprintMatches ? validDecision : "pending",
          fingerprint
        });
      }
    }

    // Rank only within each currency. Never compare nominal values
    // across currencies as though they had the same purchasing value.
    candidates.sort((a, b) => {
      if (a.currency === null && b.currency !== null) return 1;
      if (a.currency !== null && b.currency === null) return -1;

      if (a.currency !== b.currency) {
        return String(a.currency).localeCompare(String(b.currency));
      }

      return (
        (b.combinedAnnualCost ?? -1) -
        (a.combinedAnnualCost ?? -1)
      );
    });

    const ranks = new Map();

    for (const candidate of candidates) {
      if (candidate.currency === null) {
        candidate.rank = null;
        continue;
      }

      const nextRank = (ranks.get(candidate.currency) || 0) + 1;
      ranks.set(candidate.currency, nextRank);
      candidate.rank = nextRank;
    }

    // Render only the highest-ranked recommendations. Large subscription
    // imports can produce many category-based pairs; rendering every pair
    // would overwhelm the UI.
    const totalCount = candidates.length;
    const ranked = candidates.slice(0, 40);
    Object.defineProperty(ranked, "totalCount", { value: totalCount });
    return ranked;
  }

  return {
    annualCost,
    normalizeText,
    stablePairId,
    analyze
  };
});
