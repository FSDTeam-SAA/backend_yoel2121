import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = `${APPLE_ISSUER}/auth/keys`;
const DEFAULT_CACHE_SECONDS = 60 * 60;
const MAX_CACHE_SECONDS = 24 * 60 * 60;

let keyCache = { keys: [], expiresAt: 0 };

const getCacheSeconds = (cacheControl) => {
  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl || '');
  const seconds = match ? Number(match[1]) : DEFAULT_CACHE_SECONDS;
  return Math.min(Math.max(seconds, 60), MAX_CACHE_SECONDS);
};

const fetchAppleKeys = async (forceRefresh = false) => {
  if (!forceRefresh && keyCache.keys.length && keyCache.expiresAt > Date.now()) {
    return keyCache.keys;
  }

  const response = await fetch(APPLE_KEYS_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Unable to fetch Apple public keys (${response.status})`);
  }

  const body = await response.json();
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error('Apple returned no public keys');
  }

  const cacheSeconds = getCacheSeconds(response.headers.get('cache-control'));
  keyCache = {
    keys: body.keys,
    expiresAt: Date.now() + cacheSeconds * 1000,
  };
  return keyCache.keys;
};

const decodeTokenHeader = (identityToken) => {
  const decoded = jwt.decode(identityToken, { complete: true });
  if (
    !decoded ||
    typeof decoded !== 'object' ||
    !decoded.header ||
    typeof decoded.header.kid !== 'string' ||
    decoded.header.alg !== 'RS256'
  ) {
    throw new Error('Invalid Apple identity token header');
  }
  return decoded.header;
};

const normalizeBooleanClaim = (value) => value === true || value === 'true';

export const verifyAppleTokenWithKeys = (
  identityToken,
  keys,
  { rawNonce, audience = process.env.APPLE_CLIENT_ID || 'com.zentrofix.app' } = {},
) => {
  if (typeof identityToken !== 'string' || identityToken.length === 0) {
    throw new Error('Apple identity token is required');
  }
  if (typeof rawNonce !== 'string' || rawNonce.length < 16 || rawNonce.length > 128) {
    throw new Error('A valid Apple sign-in nonce is required');
  }

  const header = decodeTokenHeader(identityToken);
  const appleKey = keys.find(
    (key) => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig',
  );
  if (!appleKey) {
    const error = new Error('No matching Apple public key');
    error.code = 'APPLE_KEY_NOT_FOUND';
    throw error;
  }

  const publicKey = crypto.createPublicKey({ key: appleKey, format: 'jwk' });
  const payload = jwt.verify(identityToken, publicKey, {
    algorithms: ['RS256'],
    issuer: APPLE_ISSUER,
    audience,
  });

  if (!payload || typeof payload !== 'object' || typeof payload.sub !== 'string' || !payload.sub.trim()) {
    throw new Error('Apple identity token is missing a subject');
  }
  // jsonwebtoken checks expiration when present, but does not require it.
  if (!Number.isFinite(payload.exp)) {
    throw new Error('Apple identity token is missing its expiration');
  }

  const expectedNonce = crypto.createHash('sha256').update(rawNonce).digest('hex');
  if (typeof payload.nonce !== 'string') {
    throw new Error('Apple identity token is missing its nonce');
  }
  const expectedNonceBuffer = Buffer.from(expectedNonce);
  const actualNonceBuffer = Buffer.from(payload.nonce);
  if (
    expectedNonceBuffer.length !== actualNonceBuffer.length ||
    !crypto.timingSafeEqual(expectedNonceBuffer, actualNonceBuffer)
  ) {
    throw new Error('Apple identity token nonce does not match');
  }

  const email = typeof payload.email === 'string'
    ? payload.email.trim().toLowerCase()
    : null;
  const emailVerified = normalizeBooleanClaim(payload.email_verified);
  if (email && !emailVerified) {
    throw new Error('Apple email address is not verified');
  }

  return {
    appleId: payload.sub,
    email,
    emailVerified,
    isPrivateEmail: normalizeBooleanClaim(payload.is_private_email),
  };
};

const verifyAppleToken = async (identityToken, rawNonce) => {
  let keys = await fetchAppleKeys();

  try {
    return verifyAppleTokenWithKeys(identityToken, keys, { rawNonce });
  } catch (error) {
    // Apple rotates signing keys. If a valid-looking token references a new
    // key, refresh the cached JWKS once before rejecting it.
    if (error?.code !== 'APPLE_KEY_NOT_FOUND') throw error;
    keys = await fetchAppleKeys(true);
    return verifyAppleTokenWithKeys(identityToken, keys, { rawNonce });
  }
};

export default verifyAppleToken;
