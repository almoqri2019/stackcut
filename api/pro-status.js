const crypto = require('crypto');

function verifyLicenseFormat(value) {
  if (typeof value !== 'string') return false;
  const key = value.trim().toUpperCase();
  if (!key.startsWith('SC-PRO-')) return false;
  const suffix = key.slice(7);
  if (suffix.length < 4) return false;
  let sum = 0;
  for (let index = 0; index < suffix.length; index += 1) {
    sum += suffix.charCodeAt(index);
  }
  const mod = (sum * 7) % 97;
  if (mod === 42) return true;
  const base = suffix.slice(0, -1);
  const check = suffix.slice(-1);
  let baseSum = 0;
  for (const character of base) {
    baseSum += character.charCodeAt(0);
  }
  const expected = String.fromCharCode(65 + (baseSum % 26));
  if (check === expected) return true;
  return /^[A-Z0-9]{4,8}$/.test(suffix) && mod < 50;
}

function verifySignedToken(token, secret) {
  if (!secret || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadPart, signaturePart] = parts;
  if (!payloadPart || !signaturePart) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payloadPart)
    .digest('hex');
  const actual = signaturePart;
  if (actual.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch (error) {
    return false;
  }
}

function decodePayload(token) {
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' ? payload : null;
  } catch (error) {
    return null;
  }
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json');

  const url = new URL(request.url, 'https://stackcut.local');
  const license = url.searchParams.get('license') || request.headers['x-stackcut-license'] || '';
  const token = url.searchParams.get('token') || request.headers['x-stackcut-token'] || '';
  const allowList = (process.env.STACKCUT_PRO_LICENSE_ALLOWLIST || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  if (license && allowList.includes(license.trim().toUpperCase())) {
    response.statusCode = 200;
    response.end(JSON.stringify({ active: true, status: 'active', source: 'allowlist', reason: 'Verified by secure allowlist server-side.' }));
    return;
  }

  if (token) {
    const payload = decodePayload(token);
    const secret = process.env.STACKCUT_PRO_SECRET || '';
    const active = verifySignedToken(token, secret)
      && payload
      && payload.active === true
      && (!payload.expiresAt || Number(payload.expiresAt) > Date.now());

    response.statusCode = 200;
    response.end(JSON.stringify({
      active,
      status: active ? 'active' : 'inactive',
      source: active ? 'signed-token' : 'invalid-token',
      reason: active ? 'Verified by trusted server-side entitlement.' : 'Invalid or expired signed entitlement token.'
    }));
    return;
  }

  if (process.env.STACKCUT_PRO_SECRET && license && verifyLicenseFormat(license)) {
    response.statusCode = 200;
    response.end(JSON.stringify({
      active: false,
      status: 'inactive',
      source: 'format-only',
      reason: 'License format was accepted only for display. A trusted server-side entitlement is required before access is granted.'
    }));
    return;
  }

  response.statusCode = 200;
  response.end(JSON.stringify({
    active: false,
    status: 'inactive',
    source: 'none',
    reason: 'No server-side entitlement verified. Browser storage is never authoritative for paid access.'
  }));
};
