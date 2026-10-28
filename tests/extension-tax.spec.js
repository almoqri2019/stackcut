const { test, expect } = require("@playwright/test");

test("extension popup loads its local engine and calculates with a server VAT reference", async ({ page }) => {
  await page.addInitScript(() => {
    const data = {};
    window.chrome = {
      storage: {
        local: {
          get(keys, callback) {
            const names = Array.isArray(keys) ? keys : [keys];
            const result = Object.fromEntries(names.map((key) => [key, data[key]]));
            callback?.(result);
            return Promise.resolve(result);
          },
          set(values, callback) {
            Object.assign(data, values);
            callback?.();
            return Promise.resolve();
          },
          remove(keys, callback) {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
            callback?.();
            return Promise.resolve();
          },
        },
      },
      tabs: { create() {} },
      downloads: { download() {} },
    };
  });
  await page.route("https://stackcut.site/api/pro-status", (route) => route.fulfill({
    json: { active: false, status: "inactive" },
  }));
  await page.route("https://stackcut.site/api/tax-rates?country=DE", (route) => route.fulfill({
    json: {
      status: "verified", taxType: "vat", jurisdiction: "DE", rate: 19,
      source: { provider: "VATcomply" }, retrievedAt: "2026-10-28T10:00:00Z",
    },
  }));
  await page.goto("/extension/popup.html");
  await expect(page.locator("#proBadge")).toHaveText("FREE");
  await page.locator(".tax-tool summary").click();
  await page.locator("#taxCountry").selectOption("DE");
  await page.locator("#taxType").selectOption("vat");
  await page.locator("#taxAmount").fill("100");
  await page.locator("#taxCurrency").fill("EUR");
  await page.locator("#taxConfirm").check();
  await page.locator("#taxForm button[type=submit]").click();
  await expect(page.locator("#taxResult")).toContainText("19.00");
  await expect(page.locator("#taxResult")).toContainText("VATcomply");
});
