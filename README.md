# Stackcut — Production

Live expanded Stackcut = Rocket Money (all subscriptions) + AI engine.

**Domains:**
- Primary: https://stackcut.site
- Legacy domains `stackcut.online` and `stackcutify.vercel.app` redirect to `stackcut.site` via `vercel.json`.

**Stack:**
- Subscription records are encrypted in a browser-local vault; imports are parsed locally.
- No bank login or Plaid connection.
- Free limits are browser-side UX limits, not server-enforced quotas.
- Pro is not available until PayPal server credentials and a plan ID are configured.
- The app checks PayPal subscription status on the server; browser storage and access-code formats are not proof of payment.

**Deploy:**
- Vercel: framework = Other, no build command, output = repository root

**Files:**
- index.html = landing page
- app.html = local subscription audit app
- tax-calculator.html = international software-subscription tax estimate
- shared/tax-engine.js = shared VAT/GST/sales-tax estimate calculations
- api/tax-rates.js = server-side EU standard VAT reference lookup
- api/pro-status.js = server-side entitlement verification
- privacy.html, pro.html, sitemap.xml, robots.txt, vercel.json

See [docs/BUTTON_AND_APP_AUDIT.md](./docs/BUTTON_AND_APP_AUDIT.md) for deployment comparison, tested workflows, and payment setup limitations.
See [docs/INTERNATIONAL_TAX_CALCULATOR.md](./docs/INTERNATIONAL_TAX_CALCULATOR.md) for tax-rate coverage, calculation behavior, and limitations.

**Clean:**
Remove duplicate imported files only after confirming they are not needed:
```
find . -maxdepth 1 -type f -print
```
