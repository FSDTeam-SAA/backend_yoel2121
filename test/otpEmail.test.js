import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import { generateOTP } from "../utils/generateOTP.js";
import { sendEmail } from "../utils/sendEmail.js";

test("OTP codes fit the app's six-digit input", () => {
  for (let i = 0; i < 1000; i++) {
    assert.match(generateOTP(), /^[1-9]\d{5}$/);
  }
});

test("email honors the configured SMTP host and sender", async (t) => {
  const env = { ...process.env };
  t.after(() => { process.env = env; });
  process.env.EMAIL_USER = "smtp-login@example.com";
  process.env.EMAIL_PASS = "test-password";
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.EMAIL_FROM = "sender@example.com";
  let transportOptions;
  let message;
  t.mock.method(nodemailer, "createTransport", (options) => {
    transportOptions = options;
    return { sendMail: async (mail) => {
      message = mail;
      return { accepted: [mail.to], rejected: [] };
    } };
  });
  await sendEmail("recipient@example.com", "Reset Password", "<p>123456</p>");
  assert.equal(transportOptions.host, "smtp.example.com");
  assert.equal(message.from, "sender@example.com");
  assert.match(message.text, /123456/);
});

test("SMTP authentication failure returns a safe, actionable service error", async (t) => {
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => {
      throw Object.assign(new Error("private provider response"), {
        code: "EAUTH", responseCode: 534, command: "AUTH PLAIN",
      });
    },
  }));
  await assert.rejects(sendEmail("recipient@example.com", "Reset", "123456"), (error) => {
    assert.equal(error.statusCode, 503);
    assert.match(error.message, /Unable to send email/);
    assert.doesNotMatch(error.message, /private provider/);
    return true;
  });
});

test("rejected recipients never report delivery success", async (t) => {
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => ({ accepted: [], rejected: ["recipient@example.com"] }),
  }));
  await assert.rejects(sendEmail("recipient@example.com", "Reset", "123456"), /not accepted/);
});
