const crypto = require('crypto');

function verifySignedToken(token, secret) {
  if (!secret || typeof token !== 'string' || token.length > 4096) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadPart, signaturePart] = parts;
  if (!payloadPart || !/^[a-f0-9]{64}$/i.test(signaturePart)) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payloadPart)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signaturePart, 'hex'), Buffer.from(expected, 'hex'));
}

function decodePayload(token) {
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

function getAllowList() {
  return (process.env.STACKCUT_PRO_LICENSE_ALLOWLIST || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

function writeJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.end(JSON.stringify(body));
}

async function verifyPayPalSubscription(subscriptionId) {
  const clientId = process.env.STACKCUT_PAYPAL_CLIENT_ID || '';
  const clientSecret = process.env.STACKCUT_PAYPAL_CLIENT_SECRET || '';
  const planId = process.env.STACKCUT_PAYPAL_PLAN_ID || '';
  if (!clientId || !clientSecret || !planId) {
    return { configured: false, active: false };
  }

  const environment = process.env.STACKCUT_PAYPAL_ENV || 'live';
  if (environment !== 'live' && environment !== 'sandbox') {
    return { configured: false, active: false };
  }
  const apiRoot = environment === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const authResponse = await fetch(`${apiRoot}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!authResponse.ok) throw new Error('PayPal authentication failed.');
  const authData = await authResponse.json();
  if (typeof authData.access_token !== 'string' || !authData.access_token) {
    throw new Error('PayPal did not return an access token.');
  }

  const subscriptionResponse = await fetch(
    `${apiRoot}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      headers: { Authorization: `Bearer ${authData.access_token}` },
      cache: 'no-store',
    },
  );
  if (subscriptionResponse.status === 404) {
    return { configured: true, active: false, status: 'inactive' };
  }
  if (!subscriptionResponse.ok) {
    throw new Error('PayPal could not verify the subscription.');
  }
  const subscription = await subscriptionResponse.json();
  const active = subscription.status === 'ACTIVE' && subscription.plan_id === planId;
  return {
    configured: true,
    active,
    status: active ? 'active' : 'inactive',
  };
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    writeJson(response, 405, {
      active: false,
      status: 'invalid',
      reason: 'Use GET to check subscription status.',
    });
    return;
  }

  const subscriptionId = request.headers['x-stackcut-subscription-id'] || '';
  const license = request.headers['x-stackcut-license'] || '';
  const token = request.headers['x-stackcut-token'] || '';

  if (subscriptionId) {
    if (typeof subscriptionId !== 'string' || !/^I-[A-Z0-9]{8,32}$/.test(subscriptionId)) {
      writeJson(response, 400, {
        active: false,
        status: 'invalid',
        reason: 'Enter a valid PayPal subscription ID.',
      });
      return;
    }

    try {
      const entitlement = await verifyPayPalSubscription(subscriptionId);
      if (!entitlement.configured) {
        writeJson(response, 503, {
          active: false,
          status: 'unavailable',
          reason: 'PayPal subscription verification is not configured on this server.',
        });
        return;
      }
      writeJson(response, 200, {
        active: entitlement.active,
        status: entitlement.status,
        source: 'paypal',
        reason: entitlement.active
          ? 'PayPal confirms an active subscription for the configured plan.'
          : 'PayPal did not confirm an active subscription for the configured plan.',
      });
    } catch {
      writeJson(response, 502, {
        active: false,
        status: 'unavailable',
        reason: 'PayPal could not verify this subscription. Try again later.',
      });
    }
    return;
  }

  if (license && typeof license === 'string' && getAllowList().includes(license.trim().toUpperCase())) {
    writeJson(response, 200, {
      active: true,
      status: 'active',
      source: 'server-allowlist',
      reason: 'Verified against a server-managed entitlement allowlist.',
    });
    return;
  }

  if (token) {
    const secret = process.env.STACKCUT_PRO_SECRET || '';
    const payload = decodePayload(token);
    const expiresAt = payload?.expiresAt;
    const active = verifySignedToken(token, secret)
      && payload?.active === true
      && typeof expiresAt === 'number'
      && Number.isFinite(expiresAt)
      && expiresAt > Date.now();

    writeJson(response, 200, {
      active,
      status: active ? 'active' : 'inactive',
      source: active ? 'signed-token' : 'invalid-token',
      reason: active
        ? 'Verified by a trusted server-signed entitlement.'
        : 'No active server-signed entitlement was verified.',
    });
    return;
  }

  writeJson(response, 200, {
    active: false,
    status: 'inactive',
    source: 'none',
    reason: 'No server-side entitlement verified. Browser storage is never authoritative for paid access.',
  });
};
