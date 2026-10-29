const { test, expect } = require("@playwright/test");

test.describe("homepage navigation and controls", () => {
  test("Features dropdown opens, closes outside and on Escape, and updates ARIA", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Features" });
    const menu = page.locator("#featuresMenu");

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await page.getByRole("heading", { name: /Find duplicate subscriptions/ }).click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeHidden();

    await toggle.click();
    await menu.getByRole("link", { name: "Duplicate detection" }).click();
    await expect(page).toHaveURL(/#duplicate-detection$/);
    await expect(menu).toBeHidden();

    for (const href of ["#features", "#subscription-audit", "#transparent-savings"]) {
      await toggle.click();
      const link = menu.locator(`a[href="${href}"]`);
      await link.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`${href.replace("#", "#")}$`));
      await expect(menu).toBeHidden();
    }
  });

  test("primary, pricing, privacy, and comparison links reach their real destinations", async ({ page }) => {
    await page.goto("/");
    const primaryCtas = page.getByRole("link", { name: "Start free audit" });
    const visibleCtaIndexes = await primaryCtas.evaluateAll((links) =>
      links.flatMap((link, index) => link.getClientRects().length ? [index] : []),
    );
    expect(visibleCtaIndexes.length).toBeGreaterThanOrEqual(2);
    for (const index of visibleCtaIndexes) {
      await page.goto("/");
      await page.getByRole("link", { name: "Start free audit" }).nth(index).click();
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByRole("heading", { name: /Your subscription list stays on this device/ })).toBeVisible();
    }

    await page.goto("/");
    await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(/#pricing$/);
    await expect(page.locator("#pricing")).toBeInViewport();

    await page.goto("/");
    await page.locator("#pricing").getByRole("link", { name: "Open free app" }).click();
    await expect(page).toHaveURL(/\/app$/);

    await page.goto("/");
    await page.locator("#pricing").getByRole("link", { name: "Go Pro" }).click();
    await expect(page).toHaveURL(/\/pro$/);
    await expect(page).toHaveTitle(/Pro/);

    await page.goto("/");
    await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { name: "Subscription data stays in your browser." })).toBeVisible();

    await page.goto("/");
    await page.getByRole("link", { name: "Rocket Money comparison" }).click();
    await expect(page).toHaveURL(/\/vs\/rocket-money$/);
    await expect(page.getByRole("heading", { name: /StackCut vs Rocket Money/i })).toBeVisible();
  });

  test("mobile menu opens, closes with Escape, and navigates", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const toggle = page.locator(".mobile-toggle");
    const menu = page.locator("#mobileMenu");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveAttribute("aria-label", "Close menu");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-label", "Open menu");
    await expect(toggle).toBeFocused();

    await toggle.click();
    await page.locator('#mobileMenu a[href="/vs/rocket-money"]').evaluate((link) => {
      link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    });
    await menu.getByRole("link", { name: "Compare with Rocket Money" }).click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeHidden();

    await toggle.click();
    await menu.getByRole("link", { name: "Compare with Rocket Money" }).click();
    await expect(page).toHaveURL(/\/vs\/rocket-money$/);
    await expect(menu).toBeHidden();

    await page.goto("/");
    await toggle.click();
    await menu.getByRole("link", { name: "Start free audit" }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test("primary links and section links are keyboard activatable", async ({ page }) => {
    await page.goto("/");
    const features = page.getByRole("button", { name: "Features" });
    await features.focus();
    await page.keyboard.press("Enter");
    await expect(features).toHaveAttribute("aria-expanded", "true");
    const auditLink = page.locator("#featuresMenu").getByRole("link", { name: "Subscription audit" });
    await auditLink.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#subscription-audit$/);

    await page.goto("/");
    const howItWorks = page.getByRole("link", { name: "See how it works" });
    await howItWorks.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#how-it-works$/);

    await page.goto("/");
    const freeCta = page.locator(".hero-actions").getByRole("link", { name: "Start free audit" });
    await freeCta.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("all homepage internal routes and in-page targets resolve", async ({ page, request }) => {
    await page.goto("/");
    const hrefs = await page.locator("a[href]").evaluateAll((anchors) =>
      anchors.map((anchor) => anchor.getAttribute("href")),
    );
    const paths = [...new Set(hrefs.filter((href) => href?.startsWith("/") && !href.startsWith("#")))];
    for (const path of paths) {
      const response = await request.get(path);
      expect(response.status(), `${path} should resolve`).toBe(200);
      expect(response.headers()["content-type"]).toContain("text/html");
    }
    const anchors = [...new Set(hrefs.filter((href) => href?.startsWith("#")))];
    for (const href of anchors) {
      await expect(page.locator(href)).toHaveCount(1);
    }
  });

  test("every visible internal homepage link is keyboard activatable", async ({ page }) => {
    await page.goto("/");
    const links = await page.locator("a[href]").evaluateAll((anchors) =>
      anchors.flatMap((anchor, index) => {
        const href = anchor.getAttribute("href");
        return anchor.getClientRects().length && (href?.startsWith("/") || href?.startsWith("#"))
          ? [{ index, href }]
          : [];
      }),
    );

    for (const { index, href } of links) {
      await page.goto("/");
      const link = page.locator("a[href]").nth(index);
      if (!await link.isVisible()) continue;
      await link.focus();
      await page.keyboard.press("Enter");
      if (href.startsWith("#")) {
        await expect(page).toHaveURL(new RegExp(`${href}$`));
      } else {
        const destination = new URL(href, "http://127.0.0.1:4173");
        await expect(page).toHaveURL(new RegExp(`${destination.pathname.replaceAll("/", "\\/")}$`));
      }
    }

    const contactLink = page.getByRole("link", { name: "Contact" });
    await expect(contactLink).toHaveAttribute("href", "mailto:almoqri2019@gmail.com");
    await contactLink.focus();
    await expect(contactLink).toBeFocused();
  });

  for (const width of [320, 375, 430, 768, 1024, 1440]) {
    test(`homepage has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
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
    });
  }
});
