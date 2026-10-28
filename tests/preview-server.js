const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");
const port = 4173;
process.env.STACKCUT_PRO_SECRET = "e2e-only-entitlement-secret";
process.env.STACKCUT_PRO_LICENSE_ALLOWLIST = "E2E-SERVER-ALLOWLIST-TEST";
process.env.STACKCUT_PAYPAL_ENV = "sandbox";
process.env.STACKCUT_PAYPAL_CLIENT_ID = "e2e-paypal-client-id";
process.env.STACKCUT_PAYPAL_CLIENT_SECRET = "e2e-paypal-client-secret";
process.env.STACKCUT_PAYPAL_PLAN_ID = "E2E-PAYPAL-PLAN";
global.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.pathname === "/v1/oauth2/token") {
    if (options.headers?.Authorization !== `Basic ${Buffer.from(
      `${process.env.STACKCUT_PAYPAL_CLIENT_ID}:${process.env.STACKCUT_PAYPAL_CLIENT_SECRET}`,
    ).toString("base64")}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    return Response.json({ access_token: "e2e-access-token" });
  }
  if (url.pathname.startsWith("/v1/billing/subscriptions/")) {
    if (options.headers?.Authorization !== "Bearer e2e-access-token") {
      return new Response("Unauthorized", { status: 401 });
    }
    const subscriptionId = url.pathname.split("/").at(-1);
    if (subscriptionId === "I-E2E40400") return new Response("Not found", { status: 404 });
    if (subscriptionId === "I-E2EERROR00") return new Response("Provider error", { status: 503 });
    const status = subscriptionId === "I-E2ECANCEL" ? "CANCELLED" : "ACTIVE";
    const planId = subscriptionId === "I-E2EWRONGPLAN" ? "OTHER-PLAN" : "E2E-PAYPAL-PLAN";
    return Response.json({ id: subscriptionId, status, plan_id: planId });
  }
  throw new Error(`Unexpected external request in local tests: ${url.origin}`);
};
const proStatusHandler = require("../api/pro-status");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const routes = new Map([
  ["/", "/index.html"],
  ["/app", "/app.html"],
  ["/privacy", "/privacy.html"],
  ["/pro", "/pro.html"],
  ["/vs/rocket-money", "/vs/rocket-money.html"],
]);

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("ok");
    return;
  }
  if (url.pathname === "/api/pro-status") {
    await proStatusHandler(request, response);
    return;
  }

  const resolvedPath = routes.get(url.pathname) || url.pathname;
  const filePath = path.resolve(root, `.${resolvedPath}`);
  if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "content-type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    "content-security-policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "worker-src 'self'",
      "connect-src 'self' https://cdn.jsdelivr.net https://cdn.tailwindcss.com",
      "img-src 'self' data: https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://www.paypal.com",
      "frame-ancestors 'none'",
    ].join("; "),
    "x-content-type-options": "nosniff",
  });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Stackcut preview listening on http://127.0.0.1:${port}\n`);
});

process.on("SIGTERM", () => server.close());
