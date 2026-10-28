# Stackcut — Production

Live expanded Stackcut = Rocket Money (all subscriptions) + AI engine.

**Domains:**
- Primary: https://stackcut.site
- Legacy domains `stackcut.online` and `stackcutify.vercel.app` redirect to `stackcut.site` via `vercel.json`.

**Stack:**
- 100% local vault stackcut-v2, stack_tools, audit_count, isPro, stackcut-license
- No bank login, no Plaid, 0 requests verifiable
- Free: 3 tools + 1 audit enforced live
- Pro: $2.84/mo PayPal Morocco-friendly — SC-PRO-XXXX license local

**Deploy:**
- Vercel: framework = Other, no build command, output = repository root

**Files:**
- index.html = landing LIVE production
- app.html = app LIVE production (polished Active Stack, Ghost bug fixed)
- privacy.html, pro.html, sitemap.xml, robots.txt, vercel.json

**Clean:**
Remove duplicate imported files only after confirming they are not needed:
```
find . -maxdepth 1 -type f -print
```
