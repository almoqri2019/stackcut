const { test, expect } = require("@playwright/test");

const deRate = {
  status: "verified", jurisdiction: "DE", taxType: "vat", rate: 20, rateKind: "standard",
  source: { provider: "VATcomply" }, retrievedAt: "2026-10-28T10:00:00Z",
};

test("direct route and homepage calculator link work; VAT result includes equivalents and source", async ({ page }) => {
  await page.route("**/api/tax-rates?country=DE", (route) => route.fulfill({ json: deRate }));
  await page.goto("/");
  await page.getByRole("link", { name: "Tax calculator", exact: true }).click();
  await expect(page).toHaveURL(/tax-calculator/);
  await expect(page.getByRole("heading", { name: "International Tax Calculator for Software Subscriptions" })).toBeVisible();
  await page.getByLabel("Country or jurisdiction").fill("Germany");
  await page.getByLabel("Tax type").selectOption("vat");
  await page.getByLabel("Subscription amount").fill("120");
  await page.getByLabel("Currency (ISO 4217)").fill("EUR");
  await page.getByLabel("Billing interval").selectOption("annual");
  await page.getByLabel("Price treatment").selectOption("inclusive");
  await page.getByRole("button", { name: "Calculate estimate" }).click();
  await expect(page.locator("#resultBase")).toContainText("100.00");
  await expect(page.locator("#resultTax")).toContainText("20.00");
  await expect(page.locator("#resultTotal")).toContainText("120.00");
  await expect(page.locator("#resultMonthly")).toContainText("10.00");
  await expect(page.locator("#resultAnnual")).toContainText("120.00");
  await expect(page.locator("#resultSource")).toContainText("VATcomply");
});

test("manual tax is labeled; provider failure is not converted into zero", async ({ page }) => {
  await page.route("**/api/tax-rates?country=US", (route) => route.fulfill({ status: 502, json: { reason: "Provider unavailable. No rate was assumed." } }));
  await page.goto("/tax-calculator");
  await page.getByLabel("Country or jurisdiction").fill("US");
  await page.getByLabel("Tax type").selectOption("vat");
  await page.getByLabel("Subscription amount").fill("100");
  await page.getByLabel("Price treatment").selectOption("exclusive");
  await page.getByLabel("Use a manual rate I have independently verified").check();
  await page.getByLabel("Manual tax rate (%)").fill("8.25");
  await page.getByRole("button", { name: "Calculate estimate" }).click();
  await expect(page.locator("#resultRate")).toContainText("Manual rate supplied by you");
  await expect(page.locator("#resultTax")).toContainText("8.25");
  await page.getByLabel("Use a manual rate I have independently verified").uncheck();
  await page.getByRole("button", { name: "Calculate estimate" }).click();
  await expect(page.locator("#taxStatus")).toContainText("Provider unavailable. No rate was assumed.");
  await expect(page.locator("#taxResult")).toBeHidden();
});

test("calculator has no horizontal overflow at target widths", async ({ page }) => {
  for (const width of [320, 375, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tax-calculator");
    const sizes = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sizes[0], `overflow at ${width}px`).toBeLessThanOrEqual(sizes[1] + 1);
  }
});
