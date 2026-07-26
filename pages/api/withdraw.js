// ================================================
// FILE PATH (GitHub এ ঠিক এই path/নামে বসাবেন): pages/api/withdraw.js
// ================================================

import { getDb, getSettings } from "../../lib/mongodb";
import { verifyInitData, isValidTonAddress, checkRateLimit } from "../../lib/telegram";

export default async function handler(req, res) {
  const initData = req.headers["x-init-data"];
  const tgUser = verifyInitData(initData);
  if (!tgUser) return res.status(401).json({ error: "invalid init data" });

  if (!checkRateLimit(`withdraw:${tgUser.id}`, 10, 60_000)) {
    return res.status(429).json({ error: "একটু ধীরে করুন।" });
  }

  const db = await getDb();

  if (req.method === "POST") {
    const { points, wallet } = req.body || {};
    const settings = await getSettings();

    const pointsNum = Number(points);
    if (!Number.isFinite(pointsNum) || pointsNum <= 0) {
      return res.status(400).json({ error: "সঠিক পরিমাণ Point লিখুন।" });
    }
    if (!isValidTonAddress(wallet)) {
      return res.status(400).json({ error: "সঠিক TON/USDT wallet address দিন।" });
    }
    if (pointsNum < settings.minWithdrawPoints) {
      return res.status(400).json({
        error: `সর্বনিম্ন ${settings.minWithdrawPoints} Point withdraw করা যায়।`,
      });
    }

    const users = db.collection("users");

    // atomic: balance যথেষ্ট থাকলে তবেই deduct হবে — race condition এ negative
    // balance হওয়া বা ডাবল withdraw ঠেকায়
    const result = await users.updateOne(
      { telegramId: tgUser.id, balance: { $gte: pointsNum } },
      { $inc: { balance: -pointsNum }, $set: { wallet: wallet.trim() } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ error: "পর্যাপ্ত ব্যালেন্স নেই।" });
    }

    const user = await users.findOne({ telegramId: tgUser.id });

    await db.collection("withdrawals").insertOne({
      telegramId: tgUser.id,
      username: user?.username || "",
      points: pointsNum,
      usdValue: pointsNum / settings.pointsPerUSD,
      wallet: wallet.trim(),
      method: "TON/USDT (Tonkeeper)",
      status: "pending",
      createdAt: new Date(),
    });

    return res.status(200).json({ success: true });
  }

  if (req.method === "GET") {
    const list = await db
      .collection("withdrawals")
      .find({ telegramId: tgUser.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    return res.status(200).json(
      list.map((w) => ({
        id: w._id.toString(),
        points: w.points,
        usdValue: w.usdValue,
        status: w.status,
        createdAt: w.createdAt,
      }))
    );
  }

  res.status(405).end();
}
