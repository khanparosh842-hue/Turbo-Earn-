// ================================================
// FILE PATH (GitHub এ ঠিক এই path/নামে বসাবেন): pages/api/user.js
// ================================================

import { getDb, getSettings } from "../../lib/mongodb";
import { verifyInitData, isValidTonAddress, checkRateLimit } from "../../lib/telegram";

export default async function handler(req, res) {
  const initData = req.headers["x-init-data"];
  const tgUser = verifyInitData(initData);
  if (!tgUser) return res.status(401).json({ error: "invalid init data" });

  if (!checkRateLimit(`user:${tgUser.id}`, 30, 60_000)) {
    return res.status(429).json({ error: "একটু ধীরে করুন, অনেক বেশি রিকোয়েস্ট হচ্ছে।" });
  }

  const db = await getDb();
  const users = db.collection("users");

  // ---- লিডারবোর্ড (GET /api/user?leaderboard=1) ----
  if (req.method === "GET" && req.query.leaderboard) {
    const top = await users
      .find({ balance: { $gt: 0 } })
      .sort({ balance: -1 })
      .limit(20)
      .project({ firstName: 1, username: 1, balance: 1 })
      .toArray();
    return res.status(200).json(
      top.map((u, i) => ({
        rank: i + 1,
        name: u.firstName || u.username || "User",
        balance: u.balance,
      }))
    );
  }

  let user = await users.findOne({ telegramId: tgUser.id });
  if (!user) {
    const doc = {
      telegramId: tgUser.id,
      username: tgUser.username || "",
      firstName: tgUser.first_name || "",
      balance: 0,
      referredBy: null,
      referralCount: 0,
      wallet: "",
      completedTasks: [],
      adCounts: {},
      joinedAt: new Date(),
    };
    try {
      await users.insertOne(doc);
    } catch {
      // unique index এর কারণে parallel request এ duplicate insert error হতে পারে, সমস্যা নেই
    }
    user = await users.findOne({ telegramId: tgUser.id });
  }

  if (req.method === "POST") {
    const { wallet } = req.body || {};
    if (typeof wallet === "string" && wallet.trim()) {
      if (!isValidTonAddress(wallet)) {
        return res.status(400).json({ error: "Wallet address সঠিক ফরম্যাটে নেই।" });
      }
      await users.updateOne({ telegramId: tgUser.id }, { $set: { wallet: wallet.trim() } });
      user.wallet = wallet.trim();
    }
  }

  const settings = await getSettings();
  const rank = (await users.countDocuments({ balance: { $gt: user.balance } })) + 1;

  res.status(200).json({
    telegramId: user.telegramId,
    firstName: user.firstName,
    username: user.username,
    balance: user.balance,
    usdValue: user.balance / settings.pointsPerUSD,
    referralCount: user.referralCount,
    wallet: user.wallet,
    rank,
    referReward: settings.referReward,
    pointsPerUSD: settings.pointsPerUSD,
    minWithdrawPoints: settings.minWithdrawPoints,
    botUsername: process.env.BOT_USERNAME || "",
  });
}
