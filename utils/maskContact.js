// Masks phone/email until a job is awarded to and paid for by a tradesperson.

export function maskPhone(phone = "") {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 6) return "*".repeat(digits.length);
  return `${digits.slice(0, 3)}*****${digits.slice(-3)}`;
}

export function maskEmail(email = "") {
  const value = String(email || "");
  const [local, domain] = value.split("@");
  if (!domain) return value ? "*****" : "";
  const visible = local.slice(-3);
  return `*****${visible}@${domain}`;
}
