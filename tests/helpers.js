const { expect } = require("@playwright/test");

const PASSPHRASE = "correct-horse-battery";

async function openApp(page) {
  await page.goto("/app");
  if (await page.locator("#vaultGate").isVisible()) {
    await page.locator("#vaultPassphrase").fill(PASSPHRASE);
    if (await page.locator("#vaultConfirmGroup").isVisible()) {
      await page.locator("#vaultConfirm").fill(PASSPHRASE);
    }
    await page.getByRole("button", { name: /Create encrypted vault|Unlock vault/ }).click();
  }
  await expect(page.locator("#appContent")).toBeVisible();
  await expect(page.locator("#proStatus")).not.toHaveText("Checking plan…");
}

async function addSubscription(page, name = "Test subscription", price = "12.34") {
  await page.locator("#newName").fill(name);
  await page.locator("#newPrice").fill(price);
  await page.locator("#addForm").getByRole("button", { name: "Add subscription" }).click();
}

async function chooseCsv(page, name, content) {
  await page.locator("#btnUpload").click();
  await page.locator("#csvFile").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(content),
  });
  await page.locator("#btnParse").click();
}

module.exports = { PASSPHRASE, openApp, addSubscription, chooseCsv };
