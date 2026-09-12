import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import jwt from "jsonwebtoken";

import { verifyAppleTokenWithKeys } from "../utils/verifyAppleToken.js";

const audience = "com.zentrofix.app";
const rawNonce = "unit-test-nonce-that-is-long-enough";
const nonce = crypto.createHash("sha256").update(rawNonce).digest("hex");
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const appleKey = {
  ...publicKey.export({ format: "jwk" }),
  alg: "RS256",
  kid: "test-apple-key",
  use: "sig",
};

const makeToken = (overrides = {}, options = {}) =>
  jwt.sign(
    {
      email: "private-relay@privaterelay.appleid.com",
      email_verified: "true",
      is_private_email: "true",
      nonce,
      ...overrides,
    },
    privateKey,
    {
      algorithm: "RS256",
      audience: options.audience || audience,
      ...(options.withoutExpiration ? {} : { expiresIn: options.expiresIn ?? "5m" }),
      issuer: options.issuer || "https://appleid.apple.com",
      keyid: "test-apple-key",
      subject: options.subject ?? "apple-user-123",
    },
  );

test("accepts a correctly signed Apple identity token", () => {
  const identity = verifyAppleTokenWithKeys(makeToken(), [appleKey], {
    audience,
    rawNonce,
  });

  assert.deepEqual(identity, {
    appleId: "apple-user-123",
    email: "private-relay@privaterelay.appleid.com",
    emailVerified: true,
    isPrivateEmail: true,
  });
});

test("rejects a token issued for a different app", () => {
  assert.throws(
    () =>
      verifyAppleTokenWithKeys(
        makeToken({}, { audience: "com.example.other" }),
        [appleKey],
        { audience, rawNonce },
      ),
    /audience invalid/,
  );
});

for (const [label, claims, options, expected] of [
  ["expired", {}, { expiresIn: -1 }, /jwt expired/],
  ["missing expiration", {}, { withoutExpiration: true }, /missing its expiration/],
  ["wrong issuer", {}, { issuer: "https://example.com" }, /issuer invalid/],
  ["empty subject", {}, { subject: "" }, /missing a subject/],
  ["missing nonce", { nonce: undefined }, {}, /missing its nonce/],
  ["unverified email", { email_verified: false }, {}, /not verified/],
]) {
  test(`rejects ${label} identity tokens`, () => {
    assert.throws(
      () => verifyAppleTokenWithKeys(makeToken(claims, options), [appleKey], { audience, rawNonce }),
      expected,
    );
  });
}

test("accepts a returning Apple identity without an email claim", () => {
  const identity = verifyAppleTokenWithKeys(
    makeToken({ email: undefined, email_verified: undefined }),
    [appleKey],
    { audience, rawNonce },
  );
  assert.equal(identity.appleId, "apple-user-123");
  assert.equal(identity.email, null);
});

test("rejects a token whose nonce does not match the native request", () => {
  assert.throws(
    () =>
      verifyAppleTokenWithKeys(makeToken(), [appleKey], {
        audience,
        rawNonce: "a-different-nonce-that-is-long-enough",
      }),
    /nonce does not match/,
  );
});

test("rejects an identity token signed by an untrusted key", () => {
  const otherPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const forgedToken = jwt.sign(
    { email: "attacker@example.com", email_verified: "true", nonce },
    otherPair.privateKey,
    {
      algorithm: "RS256",
      audience,
      expiresIn: "5m",
      issuer: "https://appleid.apple.com",
      keyid: "test-apple-key",
      subject: "attacker",
    },
  );

  assert.throws(
    () =>
      verifyAppleTokenWithKeys(forgedToken, [appleKey], {
        audience,
        rawNonce,
      }),
    /invalid signature/,
  );
});
