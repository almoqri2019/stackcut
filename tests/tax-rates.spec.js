const { test, expect } = require("@playwright/test");
const handler = require("../api/tax-rates");

test("rate endpoint scopes EU VAT, maps Greece EL, and marks unsupported countries", async ({ request }) => {
  handler.__resetCache();
  const deResponse = await request.get("/api/tax-rates?country=DE");
  const de = await deResponse.json();
  expect(deResponse.status()).toBe(200);
  expect(de).toMatchObject({ status: "verified", jurisdiction: "DE", rate: 19, source: { provider: "VATcomply" } });
  expect(de.retrievedAt).toBeTruthy();
  expect((await (await request.get("/api/tax-rates?country=GR")).json())).toMatchObject({ jurisdiction: "GR", providerJurisdiction: "EL", rate: 24 });
  expect((await (await request.get("/api/tax-rates?country=US")).json()).status).toBe("unsupported");
  expect((await request.get("/api/tax-rates?country=nope")).status()).toBe(400);
});

test("rate cache returns stale status only on upstream error and expires after seven days", async () => {
  handler.__resetCache();
  const now = Date.UTC(2026, 9, 28);
  const rows = [{ country_code: "DE", standard_rate: 19, member_state: true }];
  const fresh = await handler.__loadRates(async () => Response.json(rows), now);
  expect(fresh.stale).toBe(false);
  const stale = await handler.__loadRates(async () => { throw new Error("offline"); }, now + 2 * 60 * 60 * 1000);
  expect(stale.stale).toBe(true);
  await expect(handler.__loadRates(async () => { throw new Error("offline"); }, now + 8 * 86400000)).rejects.toThrow("offline");
  handler.__resetCache();
});
