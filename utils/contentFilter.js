// Detects emails, phone numbers and other personal-contact info hidden in free text,
// including common obfuscations (spaced-out digits/letters, "dot"/"at" instead of "." / "@",
// spelled-out numbers, social-media handles and contact links).

const EMAIL_REGEX =
  /[a-zA-Z0-9._%+-]+\s*(@|\(at\)|\[at\]|\bat\b)\s*[a-zA-Z0-9.-]+\s*(\.|\(dot\)|\[dot\]|\bdot\b)\s*[a-zA-Z]{2,}/i;

// 7+ consecutive digits once common separators (space, dash, dot, parens, plus) are stripped.
const PHONE_REGEX = /(?:\d[\s.\-()]*){7,}\d/;

const CONTACT_KEYWORD_REGEX =
  /\b(whatsapp|whats app|wa\.me|telegram|viber|wechat|skype|imo|signal app|signal|discord|snapchat|snap chat|instagram|insta|facebook|messenger|linkedin|tiktok|twitter|phone number|phone no|my phone|mobile number|cell number|call me|text me|contact me|reach me|dm me|message me on|add me on|find me on|follow me on|my email|my number|my contact)\b/i;

// Platforms that are commonly used to move a conversation off-platform.
const SOCIAL_PLATFORM_REGEX =
  /\b(whatsapp|whats app|wa\.me|t\.me|telegram|viber|wechat|skype|imo|signal|discord|snapchat|snap chat|instagram|insta|facebook|fb|messenger|linkedin|tiktok|twitter|x\.com)\b/i;

// Social-media style "@handle" mentions, e.g. "telegram @johndoe" or "ig: @john_doe".
const HANDLE_REGEX = /(?:^|\s|:)@[a-zA-Z0-9][a-zA-Z0-9_.]{2,}/;

// Direct links to contact/social profiles.
const URL_CONTACT_REGEX =
  /\b(?:wa\.me|t\.me|instagram\.com|facebook\.com|fb\.com|fb\.me|snapchat\.com|discord\.gg|discord\.com|linkedin\.com\/in|tiktok\.com|twitter\.com|x\.com)\/[a-zA-Z0-9_.\-\/]*/i;

// Spelled-out phone numbers, e.g. "zero one seven one two three four five six seven eight".
const NUMBER_WORD =
  "(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|double|triple)";
const NUMBER_WORDS_REGEX = new RegExp(
  `\\b${NUMBER_WORD}\\b(?:[\\s,-]+(?:and\\s+)?${NUMBER_WORD}\\b){5,}`,
  "i"
);

// Explicit "platform id/username/account is X" or "platform: X" sharing patterns.
const SOCIAL_HANDLE_SHARE_REGEX = new RegExp(
  `\\b(whatsapp|telegram|skype|discord|snapchat|instagram|insta|facebook|fb|wechat|viber|imo|signal|linkedin|tiktok|twitter)\\b` +
    `[^.?!\\n]{0,20}?\\b(id|username|handle|profile|account|number|name)?\\b` +
    `[^.?!\\n]{0,5}(?:is|:|-)\\s*[a-zA-Z0-9_.#]{3,}`,
  "i"
);

export function containsPersonalContactInfo(text = "") {
  if (!text || typeof text !== "string") return false;

  // Collapse whitespace to defeat letter/digit-spaced obfuscation, e.g.
  // "j o h n @ g m a i l . c o m" or "0 1 7 1 2 3 4 5 6 7 8".
  const compressed = text.replace(/\s+/g, "");

  if (EMAIL_REGEX.test(text) || EMAIL_REGEX.test(compressed)) return true;
  if (PHONE_REGEX.test(text) || PHONE_REGEX.test(compressed)) return true;
  if (NUMBER_WORDS_REGEX.test(text)) return true;
  if (URL_CONTACT_REGEX.test(text)) return true;
  if (SOCIAL_HANDLE_SHARE_REGEX.test(text)) return true;

  // Any mention of a messaging/social platform name is blocked.
  // On this marketplace there is no legitimate reason to reference them —
  // users name the platform before sharing their handle or number.
  if (SOCIAL_PLATFORM_REGEX.test(text)) return true;

  // Explicit contact-sharing phrases are blocked standalone (no digit required).
  if (CONTACT_KEYWORD_REGEX.test(text)) return true;

  return false;
}
