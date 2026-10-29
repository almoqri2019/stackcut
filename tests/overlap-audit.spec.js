const { test, expect } = require("@playwright/test");
const {
  annualCost,
  stablePairId,
  analyze
} = require("../shared/overlap-audit.js");

test("annualizes monthly, weekly, quarterly, and annual prices", () => {
  expect(annualCost({ price: 10, currency: "USD", billingInterval: "monthly" })).toBe(120);
  expect(annualCost({ price: 10, currency: "USD", billingInterval: "weekly" })).toBe(520);
  expect(annualCost({ price: 10, currency: "USD", billingInterval: "quarterly" })).toBe(40);
  expect(annualCost({ price: 120, currency: "USD", billingInterval: "annual" })).toBe(120);
});

test("rejects invalid amounts and intervals", () => {
  expect(annualCost({ price: -5, currency: "USD", billingInterval: "monthly" })).toBeNull();
  expect(annualCost({ price: "bad", currency: "USD", billingInterval: "monthly" })).toBeNull();
  expect(annualCost({ price: 5, currency: "USD", billingInterval: "daily" })).toBeNull();
});

test("flags identical normalized names with an explanation", () => {
  const results = analyze([
    { id: "a", name: "Example Pro", price: 10, currency: "USD", billingInterval: "monthly", category: "Other" },
    { id: "b", name: " example-pro ", price: 100, currency: "USD", billingInterval: "annual", category: "Other" }
  ]);

  expect(results).toHaveLength(1);
  expect(results[0].confidence).toBe("high");
  expect(results[0].combinedAnnualCost).toBe(220);
  expect(results[0].explanation).toContain("same normalized name");
});

test("same known category creates a low-confidence candidate", () => {
  const results = analyze([
    { id: "a", name: "Alpha", price: 10, currency: "USD", billingInterval: "monthly", category: "Design" },
    { id: "b", name: "Beta", price: 5, currency: "USD", billingInterval: "monthly", category: "design" }
  ]);

  expect(results).toHaveLength(1);
  expect(results[0].confidence).toBe("low");
  expect(results[0].explanation).toContain("does not prove redundancy");
});

test("unknown categories alone do not create a candidate", () => {
  const results = analyze([
    { id: "a", name: "Alpha", price: 10, currency: "USD", billingInterval: "monthly", category: "Unknown" },
    { id: "b", name: "Beta", price: 5, currency: "USD", billingInterval: "monthly", category: "Unknown" }
  ]);

  expect(results).toHaveLength(0);
});

test("does not combine prices across currencies", () => {
  const results = analyze([
    { id: "a", name: "Same Tool", price: 10, currency: "USD", billingInterval: "monthly", category: "Other" },
    { id: "b", name: "Same Tool", price: 10, currency: "EUR", billingInterval: "monthly", category: "Other" }
  ]);

  expect(results).toHaveLength(1);
  expect(results[0].combinedAnnualCost).toBeNull();
  expect(results[0].currency).toBeNull();
});

test("pair IDs stay stable regardless of input order", () => {
  expect(stablePairId("a", "b")).toBe(stablePairId("b", "a"));
});

test("retains a valid saved decision", () => {
  const records = [
    { id: "a", name: "Same Tool", price: 10, currency: "USD", billingInterval: "monthly", category: "Other" },
    { id: "b", name: "Same Tool", price: 20, currency: "USD", billingInterval: "monthly", category: "Other" }
  ];

  const id = stablePairId("a", "b");
  const results = analyze(records, { [id]: { status: "rejected" } });

  expect(results[0].decision).toBe("rejected");
});


test("resets a saved review decision when price or other evidence changes", () => {
  const records = [
    { id: "a", name: "Same Tool", price: 10, currency: "USD", billingInterval: "monthly", category: "Other" },
    { id: "b", name: "Same Tool", price: 20, currency: "USD", billingInterval: "monthly", category: "Other" }
  ];

  const first = analyze(records)[0];
  const saved = {
    [first.id]: { status: "confirmed", fingerprint: first.fingerprint }
  };

  expect(analyze(records, saved)[0].decision).toBe("confirmed");

  const changed = records.map((item) => ({ ...item }));
  changed[0].price = 15;

  expect(analyze(changed, saved)[0].decision).toBe("pending");
});
