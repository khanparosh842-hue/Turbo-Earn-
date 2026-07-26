// ================================================
// FILE PATH (GitHub এ ঠিক এই path/নামে বসাবেন): pages/api/earn.js
// ================================================

import { getDb, getSettings } from "../../lib/mongodb";
import { verifyInitData, checkRateLimit } from "../../lib/telegram";

const DAILY_AD_LIMIT_PER_NETWORK = 20;
const SPIN_REWARDS = [20, 30, 50, 80, 100, 150, 200, 500]; // চাইলে রেঞ্জ বদলাতে পারেন
const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const VALID_NETWORKS = ["gigapub", "monetag", "adsgram"];

export default async function handler(req, res) {
  const initData = req.headers["x-init-data"];
  const tgUser = verifyInitData(initData);
  if (!tgUser) return res.status(401).json({ error: "invalid init data" });

  if (!checkRateLimit(`earn:${tgUser.id}`, 20, 60_000)) {
    return res.status(429).json({ error: "একটু ধীরে করুন।" });
  }

  const db = await getDb();
  const users = db.collection("users");

  // ---- স্পিন গেমের বর্তমান অবস্থা দেখা: GET /api/earn?spin=1 ----
  if (req.method === "GET" && req.query.spin) {
    const user = await users.findOne({ telegramId: tgUser.id });
    const lastSpin = user?.lastSpinAt ? new Date(user.lastSpinAt).getTime() : 0;
    const remaining = SPIN_COOLDOWN_MS - (Date.now() - lastSpin);
    return res.status(200).json({
      canSpin: remaining <= 0,
      msRemaining: Math.max(0, remaining),
    });
  }

  if (req.method !== "POST") return res.status(405).end();

  const { type, network } = req.body || {};

  // ---- বিজ্ঞাপন দেখে reward (placeholder, পরে আসল SDK callback থেকে কল হবে) ----
  if (type === "ad") {
    if (!VALID_NETWORKS.includes(network)) {
      return res.status(400).json({ error: "invalid network" });
    }
    const settings = await getSettings();
    const today = new Date().toISOString().slice(0, 10);
    const counterField = `adCounts.${network}.${today}`;

    // atomic: counter এখনো লিমিটের নিচে থাকলেই তবে reward+increment হবে
    const result = await users.updateOne(
      {
        telegramId: tgUser.id,
        $or: [
          { [counterField]: { $exists: false } },
          { [counterField]: { $lt: DAILY_AD_LIMIT_PER_NETWORK } },
        ],
      },
      { $inc: { balance: settings.adWatchReward, [counterField]: 1 } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ error: "আজকের জন্য এই নেটওয়ার্কের সীমা শেষ।" });
    }
    return res.status(200).json({ success: true, reward: settings.adWatchReward });
  }

  // ---- Daily Lucky Spin গেম ----
  if (type === "spin") {
    const cutoff = new Date(Date.now() - SPIN_COOLDOWN_MS);
    const reward = SPIN_REWARDS[Math.floor(Math.random() * SPIN_REWARDS.length)];

    // atomic: lastSpinAt না থাকলে বা cooldown পার হলে তবেই spin+reward হবে
    const result = await users.updateOne(
      {
        telegramId: tgUser.id,
        $or: [{ lastSpinAt: { $exists: false } }, { lastSpinAt: { $lt: cutoff } }],
      },
      { $inc: { balance: reward }, $set: { lastSpinAt: new Date() } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ error: "আজকের স্পিন ব্যবহার হয়ে গেছে। কাল আবার আসুন।" });
    }
    return res.status(200).json({ reward });
  }

  return res.status(400).json({ error: "invalid type" });
}

/*
  আসল Ad network যুক্ত করার ধাপ (পরে করবেন):
  1. GigaPub/Monetag/Adsgram থেকে আপনার zone/site id নিয়ে তাদের JS SDK
     pages/_document.js এ script ট্যাগ দিয়ে যোগ করুন।
  2. ইউজার বাটনে ক্লিক করলে তাদের SDK এর showAd()/showRewardedAd() ফাংশন কল করুন।
  3. Ad সম্পূর্ণ দেখা শেষ হলে (onComplete/onReward callback এ) এই এন্ডপয়েন্টে
     { type: "ad", network } পাঠিয়ে reward claim করুন।
*/
