const crypto = require("node:crypto");
const { test, expect } = require("@playwright/test");

const SECRET = "e2e-only-entitlement-secret";

function signedToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SECRET).update(encoded).digest("hex");
  return `${encoded}.${signature}`;
}

test.describe("server-side Pro entitlement", () => {
  test("requires an active PayPal subscription on the configured plan", async ({ request }) => {
    const active = await request.get("/api/pro-status", {
      headers: { "X-Stackcut-Subscription-Id": "I-E2EACTIVE" },
    });
    expect(active.status()).toBe(200);
    await expect(active).toBeOK();
    expect(await active.json()).toMatchObject({
      active: true,
      status: "active",
      source: "paypal",
    });

    for (const subscriptionId of ["I-E2ECANCEL", "I-E2EWRONGPLAN", "I-E2E40400"]) {
      const response = await request.get("/api/pro-status", {
        headers: { "X-Stackcut-Subscription-Id": subscriptionId },
      });
      expect(response.status(), subscriptionId).toBe(200);
      expect(await response.json(), subscriptionId).toMatchObject({
        active: false,
        status: "inactive",
      });
    }

    const providerFailure = await request.get("/api/pro-status", {
      headers: { "X-Stackcut-Subscription-Id": "I-E2EERROR00" },
    });
    expect(providerFailure.status()).toBe(502);
    expect(await providerFailure.json()).toMatchObject({
      active: false,
      status: "unavailable",
    });
  });

  test("server allowlists and signed tokens are authoritative; expired or query tokens fail", async ({ request }) => {
    const allowlisted = await request.get("/api/pro-status", {
      headers: { "X-Stackcut-License": "E2E-SERVER-ALLOWLIST-TEST" },
    });
    expect(await allowlisted.json()).toMatchObject({
      active: true,
      status: "active",
      source: "server-allowlist",
    });

    const activeToken = signedToken({ active: true, expiresAt: Date.now() + 60_000 });
    const active = await request.get("/api/pro-status", {
      headers: { "X-Stackcut-Token": activeToken },
    });
    expect(await active.json()).toMatchObject({
      active: true,
      status: "active",
      source: "signed-token",
    });

    const expiredToken = signedToken({ active: true, expiresAt: Date.now() - 1 });
    const expired = await request.get("/api/pro-status", {
      headers: { "X-Stackcut-Token": expiredToken },
    });
    expect(await expired.json()).toMatchObject({ active: false, status: "inactive" });

    const queryToken = await request.get(`/api/pro-status?token=${encodeURIComponent(activeToken)}`);
    expect(await queryToken.json()).toMatchObject({
      active: false,
      status: "inactive",
      source: "none",
    });
  });

  test("the Pro page has local styling and never stores client-side entitlement flags", async ({ page }) => {
    const externalRequests = [];
    await page.route(/^https:\/\/(cdn\.tailwindcss\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com)/, (route) => route.abort());
    page.on("request", (request) => {
      if (/^https?:\/\/(?!127\.0\.0\.1)/.test(request.url())) externalRequests.push(request.url());
    });
    await page.goto("/pro");
    await expect(page.getByRole("heading", { name: "Pro access is verified with PayPal." })).toBeVisible();
    await expect(page.locator("#paypal-button-container")).toBeAttached();
    await expect(page.locator("#checkoutStatus")).toBeAttached();
    await expect(page.locator(".plan-grid")).toHaveCSS("display", "grid");

    await page.locator("#subscriptionId").fill("I-E2EACTIVE");
    await page.getByRole("button", { name: "Verify subscription" }).click();
    await expect(page.locator("#verifyStatus")).toContainText("PayPal verified this active subscription");
    expect(await page.evaluate(() => ({
      license: localStorage.getItem("stackcut-license"),
      pro: localStorage.getItem("isPro"),
      sessionPro: sessionStorage.getItem("stackcut_pro_status"),
    }))).toEqual({ license: null, pro: null, sessionPro: null });
    expect(externalRequests).toEqual([]);
    for (const width of [320, 375, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.clientWidth);
    }
  });
});
