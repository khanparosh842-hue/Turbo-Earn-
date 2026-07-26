// ================================================
// FILE PATH (GitHub এ ঠিক এই path/নামে বসাবেন): lib/telegram.js
// ================================================

import crypto from "crypto";

const MAX_INITDATA_AGE_SECONDS = 12 * 60 * 60; // 12 ঘন্টা — এর চেয়ে পুরনো initData রিজেক্ট হবে

// Telegram WebApp থেকে পাঠানো initData verify করে, যাতে কেউ devtools/Termux দিয়ে
// fake user id বসিয়ে API call করতে না পারে, এবং পুরনো/copy করা initData replay
// করতে না পারে (auth_date চেক করে)।
// বিস্তারিত: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData) {
  if (!initData || !process.env.BOT_TOKEN) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckArr = [];
  for (const [key, value] of [...params.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(process.env.BOT_TOKEN)
    .digest();

  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  // timing-safe compare — সাধারণ === compare timing attack এর সামান্য সুযোগ রাখে
  const a = Buffer.from(computedHash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > MAX_INITDATA_AGE_SECONDS) {
    return null; // পুরনো/replay করা initData
  }

  const userJson = params.get("user");
  if (!userJson) return null;

  try {
    const user = JSON.parse(userJson);
    if (!user?.id) return null;
    return user;
  } catch {
    return null;
  }
}

export function isAdmin(telegramId) {
  const admins = (process.env.ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return admins.includes(String(telegramId));
}

// খুব সাধারণ TON wallet address ফরম্যাট চেক (পুরোপুরি validation নয়, তবে
// আজেবাজে/অতিরিক্ত লম্বা ইনপুট আটকায়)
export function isValidTonAddress(address) {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed.length < 40 || trimmed.length > 70) return false;
  return /^[A-Za-z0-9_-]+$/.test(trimmed);
}

// --- হালকা in-memory rate limiter ---
// serverless function গুলো cold start হলে মেমরি রিসেট হয়ে যায়, তাই এটা
// পুরোপুরি সমাধান না, কিন্তু একই instance এ কেউ script দিয়ে দ্রুত বার বার
// একই action কল করলে সেটা আটকাতে সাহায্য করে। মূল সুরক্ষা থাকে ডাটাবেজের
// atomic condition চেক এ (প্রতিটা api ফাইলে দেখুন)।
const hits = global._rateHits || new Map();
global._rateHits = hits;

export function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.start > windowMs) {
    hits.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  if (entry.count > limit) return false;
  return true;
}
