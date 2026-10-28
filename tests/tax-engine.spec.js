const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const tax = require("../shared/tax-engine");

const input = { amount: 100, currency: "USD", taxType: "vat", jurisdiction: "DE", interval: "monthly", treatment: "exclusive" };
const verified = { status: "verified", rate: 19, jurisdiction: "DE", taxType: "vat", source: { provider: "Fixture" }, retrievedAt: "2026-10-28T00:00:00Z" };

test("the extension bundles an identical local copy of the shared engine", () => {
  expect(fs.readFileSync(path.join(__dirname, "../extension/tax-engine.js"))).toEqual(
    fs.readFileSync(path.join(__dirname, "../shared/tax-engine.js")),
  );
});
test("calculates exclusive and inclusive tax and preserves source metadata", () => {
  expect(tax.calculate(input, verified)).toMatchObject({ subtotal: 100, tax: 19, total: 119, source: verified.source, retrievedAt: verified.retrievedAt });
  expect(tax.calculate({ ...input, amount: 120, treatment: "inclusive" }, { ...verified, rate: 20 })).toMatchObject({ subtotal: 100, tax: 20, total: 120 });
});
test("known zero differs from unavailable; manual rates are visibly user supplied", () => {
  expect(tax.calculate(input, { ...verified, rate: 0 })).toMatchObject({ status: "verified", tax: 0 });
  expect(tax.calculate(input, { status: "unsupported", reason: "No rate" })).toMatchObject({ status: "unavailable", reason: "No rate" });
  expect(tax.calculate(input, { status: "manual", rate: 8.25, jurisdiction: "DE", taxType: "vat", userSupplied: true })).toMatchObject({ status: "manual", tax: 8.25, rateSource: "User-supplied manual rate", source: null });
});
test("rejects malformed amounts, invalid rates, unsupported currency, and mismatched jurisdiction", () => {
  for (const amount of [-1, "NaN", ""]) expect(() => tax.calculate({ ...input, amount }, verified)).toThrow();
  for (const rate of [-1, 101, Infinity, null, ""]) expect(() => tax.calculate(input, { ...verified, rate })).toThrow();
  expect(() => tax.calculate({ ...input, currency: "ZZZ" }, verified)).toThrow(/currency/);
  expect(() => tax.calculate(input, { ...verified, jurisdiction: "FR" })).toThrow(/jurisdiction/);
});
test("rounds to currency precision and normalizes intervals without conversion", () => {
  expect(tax.calculate({ ...input, amount: 100, currency: "JPY" }, { ...verified, rate: 10 }).tax).toBe(10);
  expect(tax.calculate({ ...input, amount: 1, currency: "KWD" }, { ...verified, rate: 5 }).tax).toBe(0.05);
  expect(tax.calculate({ ...input, amount: 120, interval: "annual", currency: "EUR", taxType: "vat" }, { ...verified, rate: 0 }).monthlyEquivalent).toBe(10);
  expect(tax.toMonthlyEquivalent(10, "USD", "weekly")).toBe(43.33);
});
test("normalizes Greece EL code and refuses stale rates", () => {
  expect(tax.normalizeCountryCode("el")).toBe("GR");
  expect(tax.calculate({ ...input, jurisdiction: "EL" }, { ...verified, jurisdiction: "GR", rate: 24 })).toMatchObject({ jurisdiction: "GR", tax: 24 });
  expect(tax.calculate(input, { status: "stale", reason: "Stale" })).toMatchObject({ status: "stale", reason: "Stale" });
});
