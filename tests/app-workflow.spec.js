const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const { test, expect } = require("@playwright/test");
const { PASSPHRASE, openApp, addSubscription, chooseCsv } = require("./helpers");

test.describe("app vault and subscription workflow", () => {
  test("stores explicit tax details and renders a sourced estimate without converting currencies", async ({ page }) => {
    await page.route("**/api/tax-rates?country=DE", (route) => route.fulfill({
      json: {
        status: "verified", taxType: "vat", jurisdiction: "DE", rate: 19,
        source: { provider: "VATcomply" }, retrievedAt: "2026-10-28T10:00:00Z",
      },
    }));
    await openApp(page);
    await page.locator("#newName").fill("Taxable service");
    await page.locator("#newPrice").fill("100");
    await page.locator("#newCurrency").selectOption("EUR");
    await page.locator("#newCountry").selectOption("DE");
    await page.locator("#newTaxType").selectOption("vat");
    await page.locator("#newTreatment").selectOption("exclusive");
    await page.locator("#btnAdd").click();
    const row = page.locator(".subscription-row", { hasText: "Taxable service" });
    await expect(row.locator(".subscription-tax-summary")).toContainText("19.00");
    await expect(row.locator(".subscription-tax-summary")).toContainText("VATcomply");
    const saved = await page.evaluate(async () => {
      const envelope = JSON.parse(localStorage.getItem("stackcut-v4"));
      const material = await crypto.subtle.importKey("raw", new TextEncoder().encode("correct-horse-battery"), "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: Uint8Array.from(atob(envelope.salt), (c) => c.charCodeAt(0)), iterations: 210000, hash: "SHA-256" },
        material, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
      );
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: Uint8Array.from(atob(envelope.iv), (c) => c.charCodeAt(0)) },
        key, Uint8Array.from(atob(envelope.ciphertext), (c) => c.charCodeAt(0)),
      );
      return JSON.parse(new TextDecoder().decode(plaintext)).subscriptions[0];
    });
    expect(saved).toMatchObject({ currency: "EUR", billingInterval: "monthly", jurisdiction: "DE", taxType: "vat", taxTreatment: "exclusive", taxRateSource: null });
  });

  test("every app runtime DOM reference exists in the document", async ({ page }) => {
    const appHtml = fs.readFileSync(path.join(__dirname, "..", "app.html"), "utf8");
    const runtime = fs.readFileSync(path.join(__dirname, "..", "app-runtime.js"), "utf8");
    const referencedIds = [...runtime.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]);
    const missingIds = [...new Set(referencedIds)].filter((id) => !appHtml.includes(`id="${id}"`));
    expect(missingIds).toEqual([]);
    await page.goto("/app");
    expect(await page.evaluate((ids) => ids.filter((id) => !document.getElementById(id)), referencedIds)).toEqual([]);
  });

  test("creates, encrypts, restores, and unlocks local data", async ({ page }) => {
    await openApp(page);
    await addSubscription(page, "Restored service", "16.25");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("stackcut-v4")));
    expect(saved.version).toBe(4);
    expect(JSON.stringify(saved)).not.toContain("Restored service");
    expect(await page.evaluate(() => sessionStorage.getItem("stackcut_vault_seed"))).toBeNull();

    await page.reload();
    await expect(page.locator("#vaultGate")).toBeVisible();
    await page.locator("#vaultPassphrase").fill("incorrect-passphrase");
    await page.getByRole("button", { name: "Unlock vault" }).click();
    await expect(page.locator("#vaultStatus")).toContainText("incorrect");

    await page.locator("#vaultPassphrase").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Unlock vault" }).click();
    await expect(page.getByText("Restored service")).toBeVisible();
  });

  test("migrates readable v2 data without carrying fabricated usage metadata", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("stackcut-v2", JSON.stringify([
        { id: "legacy", name: "Old subscription", price: 8.5, job: "Chat", lastUsed: 2, projects: 1 },
      ]));
    });
    await openApp(page);
    await expect(page.getByText("Old subscription")).toBeVisible();
    await expect(page.getByText(/Usage history not provided/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("stackcut-v2"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("stackcut-v4"))).toContain('"version":4');
  });

  test("migrates a recoverable session-key v3 vault", async ({ page }) => {
    const seed = webcrypto.getRandomValues(new Uint8Array(32));
    const material = await webcrypto.subtle.importKey("raw", seed, "PBKDF2", false, ["deriveKey"]);
    const key = await webcrypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode("stackcut-session-vault-v3"),
        iterations: 100000,
        hash: "SHA-256",
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const cipher = await webcrypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify([
        { id: "legacy-v3", name: "Old encrypted tool", price: 18, job: "Chat", lastUsed: 1, projects: 1 },
      ])),
    );
    const combined = new Uint8Array(iv.length + cipher.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(cipher), iv.length);
    const seedBase64 = Buffer.from(seed).toString("base64");
    const vaultBase64 = Buffer.from(combined).toString("base64");
    await page.addInitScript(({ seedValue, vaultValue }) => {
      sessionStorage.setItem("stackcut_vault_seed", seedValue);
      localStorage.setItem("stackcut-v3", vaultValue);
    }, { seedValue: seedBase64, vaultValue: vaultBase64 });
    await openApp(page);
    await expect(page.getByText("Old encrypted tool")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("stackcut-v3"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("stackcut-v4"))).toContain('"version":4');
  });

  test("keeps an unrecoverable legacy ciphertext untouched when creating a separate vault", async ({ page }) => {
    const oldCiphertext = "legacy-session-ciphertext";
    await page.addInitScript((value) => localStorage.setItem("stackcut-v3", value), oldCiphertext);
    await page.goto("/app");
    await expect(page.locator("#vaultStatus")).toContainText("session-only key");
    await page.getByRole("button", { name: "Create a new vault without deleting old data" }).click();
    await page.locator("#vaultPassphrase").fill(PASSPHRASE);
    await page.locator("#vaultConfirm").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Create encrypted vault" }).click();
    await expect(page.locator("#appContent")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("stackcut-v3"))).toBe(oldCiphertext);
    await expect(page.locator("#subCount")).toHaveText("0");
  });

  test("manual addition validates fields and honors the three-item Free limit", async ({ page }) => {
    await openApp(page);
    await page.locator("#newName").fill("A");
    await page.locator("#newPrice").fill("5");
    await page.locator("#addForm").getByRole("button", { name: "Add subscription" }).click();
    await expect(page.locator("#addStatus")).toContainText("2–64 character");
    await expect(page.locator("#subCount")).toHaveText("0");

    await page.locator("#newName").fill("Valid name");
    await page.locator("#newPrice").fill("0");
    await page.locator("#btnAdd").click();
    expect(await page.locator("#newPrice").evaluate((input) => input.validity.rangeUnderflow)).toBe(true);
    await expect(page.locator("#subCount")).toHaveText("0");
    await page.locator("#newPrice").fill("10001");
    await page.locator("#btnAdd").click();
    expect(await page.locator("#newPrice").evaluate((input) => input.validity.rangeOverflow)).toBe(true);
    await expect(page.locator("#subCount")).toHaveText("0");

    await addSubscription(page, "First tool", "10");
    await addSubscription(page, "Second tool", "12");
    await addSubscription(page, "Third tool", "14");
    await expect(page.locator("#subCount")).toHaveText("3");
    await page.locator("#newName").fill("Fourth tool");
    await page.locator("#newPrice").fill("16");
    await page.locator("#btnAdd").click();
    await expect(page.locator("#paywallDialog")).toBeVisible();
    await expect(page.locator("#paywallMessage")).toContainText("three subscriptions");
    await expect(page.locator("#subCount")).toHaveText("3");
  });

  test("sample data is deterministic, bounded by plan limits, and marked as sample", async ({ page }) => {
    await openApp(page);
    await page.locator("#btnUpload").click();
    await page.locator("#btnSample").click();
    await expect(page.locator("#subCount")).toHaveText("3");
    await expect(page.locator("#csvStatus")).toContainText("Sample data is not verified usage history");
    await expect(page.getByText("Example streaming plan")).toBeVisible();
    await expect(page.getByText(/Usage history not provided/).first()).toBeVisible();
    const countBefore = await page.locator("#subCount").textContent();
    await page.locator("#btnUpload").click();
    await page.locator("#btnSample").click();
    await expect(page.locator("#subCount")).toHaveText(countBefore);
    await expect(page.locator("#paywallDialog")).toBeVisible();
  });

  test("keep, cut, edit, and confirmed remove actions match their labels", async ({ page }) => {
    await openApp(page);
    await addSubscription(page, "Manage me", "10");
    const row = page.locator(".subscription-row", { hasText: "Manage me" });
    await row.getByRole("button", { name: "Mark cut" }).click();
    await expect(page.locator("#potentialSavings")).toContainText("10.00");
    await row.getByRole("button", { name: "Clear decision" }).click();
    await expect(page.locator("#potentialSavings")).toContainText("0.00");
    await expect(row).not.toContainText("Marked to cut");
    await row.getByRole("button", { name: "Mark cut" }).click();
    await expect(page.locator("#potentialSavings")).toContainText("10.00");
    await row.getByRole("button", { name: "Keep" }).click();
    await expect(page.locator("#potentialSavings")).toContainText("0.00");

    await row.getByRole("button", { name: "Manage" }).click();
    await expect(page.locator("#editDialog")).toBeVisible();
    await page.locator("#editName").fill("Managed service");
    await page.locator("#editPrice").fill("25");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Managed service")).toBeVisible();
    await expect(page.locator("#monthlySpend")).toContainText("25.00");

    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator(".subscription-row").getByRole("button", { name: "Remove" }).click();
    await expect(page.locator("#subCount")).toHaveText("1");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".subscription-row").getByRole("button", { name: "Remove" }).click();
    await expect(page.locator("#subCount")).toHaveText("0");
  });

  test("audit usage increments, persists, and blocks a second Free audit", async ({ page }) => {
    await openApp(page);
    await page.locator("#btnRunAudit").click();
    await expect(page.locator("#auditUsage")).toHaveText("1 of 1 free audits used");
    const stored = await page.evaluate(async () => {
      const record = JSON.parse(localStorage.getItem("stackcut-v4"));
      return record.version;
    });
    expect(stored).toBe(4);
    await page.locator("#btnRunAudit").click();
    await expect(page.locator("#paywallDialog")).toBeVisible();
    await expect(page.locator("#paywallMessage")).toContainText("one audit");
    await page.getByRole("button", { name: "Close Pro access dialog" }).click();
    await expect(page.locator("#paywallDialog")).toBeHidden();
    await page.locator("#btnRunAudit").click();
    await expect(page.locator("#paywallDialog")).toBeVisible();
    await page.locator("#btnContinueFree").click();
    await expect(page.locator("#paywallDialog")).toBeHidden();
    await expect(page.locator("#auditUsage")).toHaveText("1 of 1 free audits used");
  });

  test("paywall accepts only a PayPal-verified active subscription", async ({ page }) => {
    await openApp(page);
    await page.locator("#btnUnlock").click();
    await page.locator("#subscriptionId").fill("I-E2ECANCEL");
    await page.getByRole("button", { name: "Verify subscription with server" }).click();
    await expect(page.locator("#entitlementStatus")).toContainText("did not confirm an active subscription");
    await expect(page.locator("#proStatus")).toHaveText("Free");
    await expect(page.locator("#paywallDialog")).toBeVisible();

    await page.locator("#subscriptionId").fill("I-E2EACTIVE");
    await page.getByRole("button", { name: "Verify subscription with server" }).click();
    await expect(page.locator("#proStatus")).toHaveText("Pro — PayPal verified for this session");
    await expect(page.locator("#paywallDialog")).toBeHidden();
    expect(await page.evaluate(() => ({
      license: localStorage.getItem("stackcut-license"),
      pro: localStorage.getItem("isPro"),
      sessionPro: sessionStorage.getItem("stackcut_pro_status"),
    }))).toEqual({ license: null, pro: null, sessionPro: null });
  });

  test("paywall Pro and Free destinations work, including Escape close", async ({ page }) => {
    await openApp(page);
    await page.locator("#btnUnlock").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#paywallDialog")).toBeHidden();

    await page.locator("#btnUnlock").click();
    await page.getByRole("link", { name: "View Pro options" }).click();
    await expect(page).toHaveURL(/\/pro$/);
    await page.getByRole("link", { name: "Open free app" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await openApp(page);
    await expect(page.locator("#subCount")).toHaveText("0");
  });

  test("CSV modal opens and closes; unsupported, oversized, and empty files are rejected", async ({ page }) => {
    await openApp(page);
    await page.locator("#btnUpload").click();
    await expect(page.locator("#uploadDialog")).toBeVisible();
    await page.getByRole("button", { name: "Close CSV import" }).click();
    await expect(page.locator("#uploadDialog")).toBeHidden();

    await page.locator("#btnUpload").click();
    await page.locator("#csvFile").setInputFiles({
      name: "data.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("not csv"),
    });
    await page.locator("#btnParse").click();
    await expect(page.locator("#csvStatus")).toContainText("Unsupported file type");

    await page.locator("#csvFile").setInputFiles({
      name: "large.csv",
      mimeType: "text/csv",
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 65),
    });
    await page.locator("#btnParse").click();
    await expect(page.locator("#csvStatus")).toContainText("larger than the 10 MB limit");

    await page.locator("#csvFile").setInputFiles({
      name: "empty.csv",
      mimeType: "text/csv",
      buffer: Buffer.alloc(0),
    });
    await page.locator("#btnParse").click();
    await expect(page.locator("#csvStatus")).toContainText("file is empty");
    await expect(page.locator("#subCount")).toHaveText("0");
  });

  test("imports unusual headers, quoted fields, and preserves missing usage as unknown", async ({ page }) => {
    await openApp(page);
    await chooseCsv(
      page,
      "unusual.csv",
      "Service Name,Charge Amount,Transaction Date,Team\n\"Dev, Tools\",29.99,2025-01-02,Engineering\n",
    );
    await expect(page.locator("#subCount")).toHaveText("1");
    const row = page.locator(".subscription-row", { hasText: "Dev, Tools" });
    await expect(row).toContainText("$29.99/mo");
    await expect(row).toContainText("Engineering");
    await expect(row).toContainText("Usage history not provided");
    await expect(row).not.toContainText("verified");
    await expect(page.locator("#csvStatus")).toContainText("Imported 1 row.");
  });

  test("rejects malformed rows without a partial import", async ({ page }) => {
    await openApp(page);
    await chooseCsv(page, "malformed.csv", 'Name,Amount\n"Unclosed,20\n');
    await expect(page.locator("#csvStatus")).toContainText("Unclosed quoted field");
    await expect(page.locator("#subCount")).toHaveText("0");
  });

  test("refund and negative rows remain negative and are skipped, not converted to spend", async ({ page }) => {
    await openApp(page);
    await chooseCsv(
      page,
      "refunds.csv",
      "Service,Amount,Category\nPositive plan,29.99,Chat\nRefunded plan,-15.00,Chat\nCredit plan,($8.50),Chat\nUnclear amount,not-a-price,Chat\n",
    );
    await expect(page.locator("#subCount")).toHaveText("1");
    await expect(page.locator("#csvStatus")).toContainText("Skipped 2 refund or zero-value rows");
    await expect(page.locator("#csvStatus")).toContainText("Skipped 1 row with missing or invalid amounts");
    await expect(page.locator(".subscription-row")).toContainText("$29.99/mo");
    await expect(page.locator("#monthlySpend")).toContainText("29.99");
  });

  test("Free import limits are atomic and do not silently truncate rows", async ({ page }) => {
    await openApp(page);
    await chooseCsv(
      page,
      "over-limit.csv",
      "Name,Amount\nOne,1\nTwo,2\nThree,3\nFour,4\n",
    );
    await expect(page.locator("#csvStatus")).toContainText("only 3 Free slots remain");
    await expect(page.locator("#subCount")).toHaveText("0");
  });

  test("imports all batches up to the supported row cap after server entitlement verification", async ({ page }) => {
    await openApp(page);
    await page.locator("#btnUnlock").click();
    await page.locator("#subscriptionId").fill("I-E2EACTIVE");
    await page.locator("#btnActivate").click();
    await expect(page.locator("#proStatus")).toContainText("Pro — PayPal verified");
    await expect(page.locator("#paywallDialog")).toBeHidden();

    const rows = ["Subscription,Monthly Amount,Category"];
    for (let index = 0; index < 501; index += 1) {
      rows.push(`Service ${index},${(index + 1).toFixed(2)},Tools`);
    }
    await chooseCsv(page, "large-batch.csv", rows.join("\n"));
    await expect(page.locator("#csvStatus")).toContainText("Imported 501 rows", { timeout: 30000 });
    await expect(page.locator("#subCount")).toHaveText("501");
    expect(await page.locator(".subscription-row").count()).toBeGreaterThan(0);
  });

  test("rejects CSVs above the supported row count without partially importing", async ({ page }) => {
    await openApp(page);
    await page.locator("#btnUnlock").click();
    await page.locator("#subscriptionId").fill("I-E2EACTIVE");
    await page.locator("#btnActivate").click();
    await expect(page.locator("#proStatus")).toContainText("Pro — PayPal verified");
    const rows = ["Subscription,Amount"];
    for (let index = 0; index < 5001; index += 1) rows.push(`Service ${index},1`);
    await chooseCsv(page, "over-maximum.csv", rows.join("\n"));
    await expect(page.locator("#csvStatus")).toContainText("more than 5,000 positive rows", { timeout: 30000 });
    await expect(page.locator("#subCount")).toHaveText("0");
  });

  test("browser-edited Pro flags do not grant paid access", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("stackcut_pro_status", JSON.stringify({ active: true, expiresAt: Date.now() + 999999999 }));
      localStorage.setItem("stackcut-license", "SC-PRO-FAKE");
      sessionStorage.setItem("stackcut_pro_status", JSON.stringify({ active: true, expiresAt: Date.now() + 999999999 }));
    });
    await openApp(page);
    await expect(page.locator("#proStatus")).toHaveText("Free");
    await page.locator("#btnUnlock").click();
    await page.locator("#subscriptionId").fill("I-E2E40400");
    await page.locator("#btnActivate").click();
    await expect(page.locator("#entitlementStatus")).toContainText("did not confirm an active subscription");
    await expect(page.locator("#proStatus")).toHaveText("Free");
  });

  test("reset cancellation preserves data and confirmed reset clears records and audit count", async ({ page }) => {
    await openApp(page);
    await addSubscription(page, "Keep through cancel", "11");
    await page.locator("#btnRunAudit").click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("#btnReset").click();
    await expect(page.locator("#subCount")).toHaveText("1");
    await expect(page.locator("#auditUsage")).toHaveText("1 of 1 free audits used");

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#btnReset").click();
    await expect(page.locator("#subCount")).toHaveText("0");
    await expect(page.locator("#auditUsage")).toHaveText("0 of 1 free audits used");
  });

  test("JSON download is valid plaintext and accurately labeled", async ({ page }) => {
    await openApp(page);
    await addSubscription(page, "Exported service", "7.25");
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#btnExport").click();
    const download = await downloadPromise;
    const output = path.join("/tmp", download.suggestedFilename());
    await download.saveAs(output);
    const exported = JSON.parse(fs.readFileSync(output, "utf8"));
    expect(exported.format).toBe("stackcut-plaintext-export");
    expect(exported.subscriptions[0].name).toBe("Exported service");
    expect(exported.notice).toContain("plaintext");
    expect(exported).not.toHaveProperty("isPro");
    fs.unlinkSync(output);
  });

  test("worker load failure is visible and does not freeze unrelated app controls", async ({ page }) => {
    await page.route("**/parser.worker.js", (route) => route.abort());
    await openApp(page);
    await chooseCsv(page, "worker.csv", "Name,Amount\nA,1\n");
    await expect(page.locator("#csvStatus")).toContainText("CSV parser failed to load or run");
    await expect(page.locator("#subCount")).toHaveText("0");
    await page.getByRole("button", { name: "Close CSV import" }).click();
    await addSubscription(page, "Still works", "3");
    await expect(page.locator("#subCount")).toHaveText("1");
  });

  test("app has no external CSS or script dependency and survives entitlement endpoint failure", async ({ page }) => {
    const externalRequests = [];
    await page.route(/^https:\/\/(cdn\.tailwindcss\.com|cdn\.jsdelivr\.net)/, (route) => route.abort());
    page.on("request", (request) => {
      if (/^https?:\/\/(?!127\.0\.0\.1)/.test(request.url())) externalRequests.push(request.url());
    });
    await page.route("**/api/pro-status**", (route) => route.abort());
    await openApp(page);
    await expect(page.locator("#proStatus")).toHaveText("Free — verification unavailable");
    await addSubscription(page, "Offline works", "5");
    await expect(page.locator("#subCount")).toHaveText("1");
    expect(externalRequests).toEqual([]);
    await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute("href", "/app.css");
  });

  test("homepage and app load without browser console, CSP, or failed-request errors", async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push(request.url()));
    await page.goto("/");
    await expect(page.locator(".hero-info-card")).toBeVisible();
    await openApp(page);
    await expect(page.locator("#proStatus")).toHaveText("Free");
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test("captures styled homepage and app screenshots from the local preview", async ({ page }) => {
    const screenshots = path.join(__dirname, "..", "docs", "screenshots");
    fs.mkdirSync(screenshots, { recursive: true });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await expect(page.locator(".hero-info-card")).toBeVisible();
    await page.screenshot({ path: path.join(screenshots, "homepage-audit.png"), fullPage: true });

    await openApp(page);
    await page.locator("#btnUpload").click();
    await page.locator("#btnSample").click();
    await page.screenshot({ path: path.join(screenshots, "app-audit.png"), fullPage: true });
  });

  for (const width of [320, 375, 430, 768, 1024, 1440]) {
    test(`app has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 920 });
      await openApp(page);
      await page.locator("#btnUpload").click();
      await page.locator("#btnSample").click();
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.clientWidth);
      const clippedText = await page.evaluate(() =>
        [...document.querySelectorAll("h1, h2, h3, p, label, button, a")]
          .filter((element) => element.getClientRects().length)
          .filter((element) => {
            const style = getComputedStyle(element);
            return style.overflow !== "visible"
              && (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2);
          })
          .map((element) => element.textContent.trim()),
      );
      expect(clippedText).toEqual([]);

      for (const [dialogId, closeName] of [
        ["uploadDialog", "Close CSV import"],
        ["paywallDialog", "Close Pro access dialog"],
      ]) {
        if (dialogId === "uploadDialog") await page.locator("#btnUpload").click();
        else await page.locator("#btnUnlock").click();
        const dialogMetrics = await page.locator(`#${dialogId}`).evaluate((dialog) => {
          const dialogRect = dialog.getBoundingClientRect();
          const controls = [...dialog.querySelectorAll("button, a, input")].filter((control) =>
            !control.hidden && getComputedStyle(control).display !== "none",
          );
          const outsideControls = controls.filter((control) => {
            const rect = control.getBoundingClientRect();
            return rect.left < dialogRect.left || rect.right > dialogRect.right;
          });
          const interactive = controls.filter((control) =>
            control.matches("button, a, input") && control.getClientRects().length,
          );
          const overlappingControls = [];
          for (let index = 0; index < interactive.length; index += 1) {
            for (const other of interactive.slice(index + 1)) {
              const first = interactive[index].getBoundingClientRect();
              const second = other.getBoundingClientRect();
              if (first.left < second.right && first.right > second.left
                && first.top < second.bottom && first.bottom > second.top) {
                overlappingControls.push([interactive[index].textContent.trim(), other.textContent.trim()]);
              }
            }
          }
          return {
            left: dialogRect.left,
            right: dialogRect.right,
            top: dialogRect.top,
            bottom: dialogRect.bottom,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            clientWidth: dialog.clientWidth,
            scrollWidth: dialog.scrollWidth,
            outsideControls: outsideControls.map((control) => control.outerHTML),
            overlappingControls,
          };
        });
        expect(dialogMetrics.left).toBeGreaterThanOrEqual(0);
        expect(dialogMetrics.right).toBeLessThanOrEqual(dialogMetrics.viewportWidth);
        expect(dialogMetrics.top).toBeGreaterThanOrEqual(0);
        expect(dialogMetrics.bottom).toBeLessThanOrEqual(dialogMetrics.viewportHeight);
        expect(dialogMetrics.scrollWidth).toBeLessThanOrEqual(dialogMetrics.clientWidth);
        expect(dialogMetrics.outsideControls).toEqual([]);
        expect(dialogMetrics.overlappingControls).toEqual([]);
        await page.getByRole("button", { name: closeName }).click();
      }
    });
  }
});
