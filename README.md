# stackcut.online — Production

Live expanded Stackcut = Rocket Money (all subscriptions) + AI engine.

**Domains:**
- Primary: https://stackcut.online (new repo, $0.99 promo)
- Secondary: https://stackcut.site (Active till 2027-10-21, redirects to .online via vercel.json)
- Old: stackcutify.vercel.app → redirects to .online

**Stack:**
- 100% local vault stackcut-v2, stack_tools, audit_count, isPro, stackcut-license
- No bank login, no Plaid, 0 requests verifiable
- Free: 3 tools + 1 audit enforced live
- Pro: $2.84/mo PayPal Morocco-friendly — SC-PRO-XXXX license local

**Deploy:**
- Vercel: import repo stackcut.online, framework = Other, no build command, output = root
- Hostinger: Buy stackcut.online $0.99, set DNS to Vercel NS or CNAME to cname.vercel-dns.com

**Files:**
- index.html = landing LIVE production
- app.html = app LIVE production (polished Active Stack, Ghost bug fixed)
- privacy.html, pro.html, sitemap.xml, robots.txt, vercel.json

**Clean:**
Run in Codespace terminal to fix duplicate (2) names:
```
cd /workspaces/stackcut.online
rm -f "App (2).html" "Stackcut-V1-Index (2).html" "Sitemap (1).xml" "Vercel.json" "Privacy.html" "Pro.html" "Robots.txt"
ls -la
```
Then copy from /mnt/data/stackcut.online/ folder or git add clean files.

