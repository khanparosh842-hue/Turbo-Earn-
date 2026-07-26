// ================================================
// FILE PATH (GitHub এ ঠিক এই path/নামে বসাবেন): pages/api/tasks.js
// ================================================

import { ObjectId } from "mongodb";
import { getDb } from "../../lib/mongodb";
import { verifyInitData, checkRateLimit } from "../../lib/telegram";

export default async function handler(req, res) {
  const initData = req.headers["x-init-data"];
  const tgUser = verifyInitData(initData);
  if (!tgUser) return res.status(401).json({ error: "invalid init data" });

  if (!checkRateLimit(`tasks:${tgUser.id}`, 30, 60_000)) {
    return res.status(429).json({ error: "একটু ধীরে করুন।" });
  }

  const db = await getDb();

  if (req.method === "GET") {
    const tasks = await db
      .collection("tasks")
      .find({ active: true })
      .sort({ createdAt: -1 })
      .toArray();
    const user = await db.collection("users").findOne({ telegramId: tgUser.id });
    const completed = (user?.completedTasks || []).map(String);
    return res.status(200).json(
      tasks.map((t) => ({
        id: t._id.toString(),
        title: t.title,
        link: t.link,
        reward: t.reward,
        completed: completed.includes(t._id.toString()),
      }))
    );
  }

  if (req.method === "POST") {
    const { taskId } = req.body || {};
    if (!taskId || typeof taskId !== "string") {
      return res.status(400).json({ error: "taskId required" });
    }

    let objId;
    try {
      objId = new ObjectId(taskId);
    } catch {
      return res.status(400).json({ error: "invalid taskId" });
    }

    const task = await db.collection("tasks").findOne({ _id: objId, active: true });
    if (!task) return res.status(404).json({ error: "task not found" });

    // atomic update: completedTasks এ taskId না থাকলে তবেই reward দেওয়া হবে।
    // এতে কেউ একই সময়ে বার বার (parallel script দিয়ে) কল করলেও ডাবল reward পাবে না।
    const result = await db.collection("users").updateOne(
      { telegramId: tgUser.id, completedTasks: { $ne: objId } },
      { $inc: { balance: task.reward }, $push: { completedTasks: objId } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ error: "এই task টি ইতিমধ্যে সম্পন্ন হয়েছে।" });
    }

    return res.status(200).json({ success: true, reward: task.reward });
  }

  res.status(405).end();
}
