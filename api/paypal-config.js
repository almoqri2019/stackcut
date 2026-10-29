module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    return res.end(JSON.stringify({
      configured: false,
      reason: "Method not allowed."
    }));
  }

  const clientId = process.env.STACKCUT_PAYPAL_CLIENT_ID || "";
  const clientSecret = process.env.STACKCUT_PAYPAL_CLIENT_SECRET || "";
  const planId = process.env.STACKCUT_PAYPAL_PLAN_ID || "";
  const environment = process.env.STACKCUT_PAYPAL_ENV || "live";

  const configured =
    Boolean(clientId && clientSecret && planId) &&
    ["live", "sandbox"].includes(environment);

  if (!configured) {
    res.statusCode = 503;
    return res.end(JSON.stringify({
      configured: false,
      reason: "PayPal checkout is not configured on the server."
    }));
  }

  // Client ID and plan ID are public SDK configuration.
  // Never return the client secret.
  res.statusCode = 200;
  return res.end(JSON.stringify({
    configured: true,
    clientId,
    planId,
    environment
  }));
};