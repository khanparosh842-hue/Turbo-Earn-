// FILE PATH: api/mining.js

import { getDb } from '../lib/mongodb.js';
import { verifyTelegramInit } from '../lib/auth.js';

// Gold Mine — mine Gold every 4 hours, reward is a random amount of Gold
// between MIN and MAX. No ad required.
const COOLDOWN_MS = 4 * 3600000; // 4 hours
const MIN_REWARD = 100;
const MAX_REWARD = 500;

function rollMiningReward() {
  return MIN_REWARD + Math.floor(Math.random() * (MAX_REWARD - MIN_REWARD + 1));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://turbo-earn.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const telegramId = req.query?.telegramId || req.body?.telegramId;
  const initData   = req.query?.initData   || req.body?.initData || '';

  if (!telegramId) return res.status(400).json({ error: 'telegramId required' });

  const tgUser = verifyTelegramInit(initData);
  if (!tgUser || String(tgUser.id) !== String(telegramId)) {
    return res.status(403).json({ error: 'Invalid Telegram session' });
  }

  const tgId = String(telegramId);
  const now = new Date();

  try {
    const db = await getDb();
    const users = db.collection('users');
    const user = await users.findOne({ telegramId: tgId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isBanned) return res.status(403).json({ error: 'Account banned' });

    const lastMined = user.mining?.lastMined ? new Date(user.mining.lastMined) : null;
    const readyAt = lastMined ? lastMined.getTime() + COOLDOWN_MS : 0;
    const canMine = !lastMined || now.getTime() >= readyAt;
    const nextMs = canMine ? 0 : Math.max(0, readyAt - now.getTime());

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        canMine,
        nextMs,
        totalMined: user.mining?.totalMined || 0,
        totalGoldFromMining: user.mining?.totalGold || 0,
        minReward: MIN_REWARD,
        maxReward: MAX_REWARD,
        cooldownHours: COOLDOWN_MS / 3600000,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action } = req.body;
    if (action !== 'mine') return res.status(400).json({ error: 'Invalid action. Use: mine' });

    // Atomic: only succeeds if the cooldown has genuinely elapsed at the
    // moment of the update — prevents double-mine from concurrent taps.
    const cutoff = new Date(now.getTime() - COOLDOWN_MS);
    const reward = rollMiningReward();
    const result = await users.findOneAndUpdate(
      {
        telegramId: tgId,
        $or: [
          { 'mining.lastMined': { $exists: false } },
          { 'mining.lastMined': null },
          { 'mining.lastMined': { $lte: cutoff } },
        ],
      },
      {
        $set: { 'mining.lastMined': now },
        $inc: { goldBalance: reward, 'mining.totalMined': 1, 'mining.totalGold': reward },
      },
      { returnDocument: 'after' }
    );
    const updated = result?.value || result;
    if (!updated) {
      const remaining = Math.ceil((readyAt - now.getTime()) / 60000);
      return res.status(400).json({ error: `Mine not ready yet. ${Math.max(remaining, 1)} minutes left.` });
    }

    // Referral milestone (mirror of the check in tasks.js) — either a task
    // completion or a mine action can be the action that completes the
    // "5 tasks + 3 mines" pair, so both files check the same two
    // fields on the just-updated document.
    if (
      (updated.mining?.totalMined || 0) >= 3 &&
      (updated.completedTasks?.length || 0) >= 5 &&
      updated.referredBy &&
      !updated.referralValidPaid
    ) {
      const flagged = await users.findOneAndUpdate(
        { telegramId: tgId, referralValidPaid: { $ne: true } },
        { $set: { referralValidPaid: true } },
        { returnDocument: 'after' }
      );
      if (flagged?.value || flagged) {
        await users.updateOne(
          { telegramId: updated.referredBy },
          { $inc: { egBalance: 100, totalRefEarnedEG: 100 } }
        );
      }
    }

    return res.status(200).json({ success: true, reward });
  } catch (err) {
    console.error('mining.js error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
