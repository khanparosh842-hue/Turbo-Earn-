// ================================================
// FILE PATH (GitHub এ ঠিক এই path/নামে বসাবেন): pages/api/bot.js
// ================================================

import { Telegraf } from "telegraf";
import { getDb, getSettings } from "../../lib/mongodb";
import { isAdmin } from "../../lib/telegram";

export const config = { api: { bodyParser: true } };

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- ইউজার রেজিস্ট্রেশন (start command, referral সহ) ----------
bot.start(async (ctx) => {
  const db = await getDb();
  const users = db.collection("users");
  const tgUser = ctx.from;
  const startPayload = ctx.startPayload;

  let user = await users.findOne({ telegramId: tgUser.id });

  if (!user) {
    const settings = await getSettings();
    let referredBy = null;

    if (startPayload && /^\d+$/.test(startPayload)) {
      const refId = Number(startPayload);
      if (refId !== tgUser.id) {
        const referrer = await users.findOne({ telegramId: refId });
        if (referrer) referredBy = refId;
      }
    }

    try {
      await users.insertOne({
        telegramId: tgUser.id,
        username: tgUser.username || "",
        firstName: tgUser.first_name || "",
        balance: 0,
        referredBy,
        referralCount: 0,
        wallet: "",
        completedTasks: [],
        adCounts: {},
        joinedAt: new Date(),
      });
    } catch (e) {
      // unique index এর কারণে duplicate insert হলে এখানে ধরা পড়বে, সমস্যা নেই
    }

    if (referredBy) {
      await users.updateOne(
        { telegramId: referredBy },
        { $inc: { balance: settings.referReward, referralCount: 1 } }
      );
      bot.telegram
        .sendMessage(
          referredBy,
          `🎉 আপনার রেফারেলে একজন নতুন ইউজার জয়েন করেছে! আপনি পেয়েছেন +${settings.referReward} Point।`
        )
        .catch(() => {});
    }
  }

  await ctx.reply(
    `স্বাগতম, ${tgUser.first_name || "বন্ধু"}! 👋\n\nTurbo Earn এ Play করে, Task করে এবং বন্ধুদের Refer করে Point আয় করুন।\n\nনিচের বাটনে ক্লিক করে অ্যাপ ওপেন করুন 👇`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Turbo Earn ওপেন করুন", web_app: { url: process.env.APP_URL } }],
        ],
      },
    }
  );
});

// ---------- Admin কমান্ড ----------
bot.command("stats", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const db = await getDb();
  const totalUsers = await db.collection("users").countDocuments();
  const totalTasks = await db.collection("tasks").countDocuments();
  const pendingWithdrawals = await db
    .collection("withdrawals")
    .countDocuments({ status: "pending" });
  const agg = await db
    .collection("users")
    .aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }])
    .toArray();
  const totalPoints = agg[0]?.total || 0;

  await ctx.reply(
    `📊 Stats\n\nমোট ইউজার: ${totalUsers}\nমোট Task: ${totalTasks}\nপেন্ডিং Withdrawal: ${pendingWithdrawals}\nমোট Point (সব ইউজার মিলিয়ে): ${totalPoints}`
  );
});

// ফরম্যাট: /addtask Title | https://link.com | 100
bot.command("addtask", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const text = ctx.message.text.replace("/addtask", "").trim();
  const parts = text.split("|").map((p) => p.trim());
  if (parts.length < 3) {
    return ctx.reply(
      "সঠিক ফরম্যাট: /addtask টাইটেল | লিংক | রিওয়ার্ড\nউদাহরণ: /addtask আমাদের চ্যানেল জয়েন করুন | https://t.me/example | 100"
    );
  }
  const [title, link, rewardStr] = parts;
  const reward = parseInt(rewardStr, 10);
  if (isNaN(reward) || reward <= 0 || reward > 1000000) {
    return ctx.reply("রিওয়ার্ড অবশ্যই ১ থেকে ১০,০০,০০০ এর মধ্যে একটি সংখ্যা হতে হবে।");
  }
  if (!/^https?:\/\//.test(link)) {
    return ctx.reply("লিংক অবশ্যই http:// বা https:// দিয়ে শুরু হতে হবে।");
  }

  const db = await getDb();
  const result = await db.collection("tasks").insertOne({
    title: title.slice(0, 200),
    link,
    reward,
    active: true,
    createdAt: new Date(),
  });
  await ctx.reply(`✅ Task তৈরি হয়েছে। ID: ${result.insertedId}`);
});

bot.command("tasks", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const db = await getDb();
  const tasks = await db.collection("tasks").find().sort({ createdAt: -1 }).toArray();
  if (!tasks.length) return ctx.reply("কোনো task নেই।");
  const lines = tasks.map(
    (t) =>
      `ID: ${t._id}\n${t.active ? "🟢" : "🔴"} ${t.title} — ${t.reward} Point\n${t.link}\n`
  );
  await ctx.reply(lines.join("\n"));
});

bot.command("deltask", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const id = ctx.message.text.replace("/deltask", "").trim();
  if (!id) return ctx.reply("ব্যবহার: /deltask <task_id>");
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  try {
    await db.collection("tasks").deleteOne({ _id: new ObjectId(id) });
    await ctx.reply("🗑️ Task ডিলিট হয়েছে।");
  } catch {
    await ctx.reply("ভুল id।");
  }
});

bot.command("toggletask", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const id = ctx.message.text.replace("/toggletask", "").trim();
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  try {
    const task = await db.collection("tasks").findOne({ _id: new ObjectId(id) });
    if (!task) return ctx.reply("Task পাওয়া যায়নি।");
    await db
      .collection("tasks")
      .updateOne({ _id: task._id }, { $set: { active: !task.active } });
    await ctx.reply(`Task এখন ${!task.active ? "🟢 চালু" : "🔴 বন্ধ"}।`);
  } catch {
    await ctx.reply("ভুল id।");
  }
});

bot.command("withdrawals", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const db = await getDb();
  const list = await db
    .collection("withdrawals")
    .find({ status: "pending" })
    .sort({ createdAt: 1 })
    .limit(30)
    .toArray();
  if (!list.length) return ctx.reply("কোনো পেন্ডিং withdrawal নেই।");
  const lines = list.map(
    (w) =>
      `ID: ${w._id}\nUser: ${w.telegramId} (@${w.username || "-"})\nPoint: ${w.points} (~$${w.usdValue.toFixed(2)})\nWallet: ${w.wallet}\n`
  );
  await ctx.reply(lines.join("\n"));
});

bot.command("approve", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const id = ctx.message.text.replace("/approve", "").trim();
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  try {
    const result = await db
      .collection("withdrawals")
      .findOneAndUpdate(
        { _id: new ObjectId(id), status: "pending" },
        { $set: { status: "approved", processedAt: new Date() } }
      );
    // mongodb driver v6: ফলাফল সরাসরি document, পুরনো ভার্সনে result.value
    const w = result && "value" in result ? result.value : result;
    if (!w) return ctx.reply("পেন্ডিং withdrawal পাওয়া যায়নি।");
    await ctx.reply("✅ Approved হয়েছে।");
    bot.telegram
      .sendMessage(
        w.telegramId,
        `✅ আপনার withdrawal (${w.points} Point ≈ $${w.usdValue.toFixed(2)}) approve করা হয়েছে। শীঘ্রই আপনার wallet এ পাঠানো হবে।`
      )
      .catch(() => {});
  } catch {
    await ctx.reply("ভুল id।");
  }
});

bot.command("reject", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const id = ctx.message.text.replace("/reject", "").trim();
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  try {
    const result = await db
      .collection("withdrawals")
      .findOneAndUpdate(
        { _id: new ObjectId(id), status: "pending" },
        { $set: { status: "rejected", processedAt: new Date() } }
      );
    const w = result && "value" in result ? result.value : result;
    if (!w) return ctx.reply("পেন্ডিং withdrawal পাওয়া যায়নি।");
    await db
      .collection("users")
      .updateOne({ telegramId: w.telegramId }, { $inc: { balance: w.points } });
    await ctx.reply("❌ Reject হয়েছে, Point ইউজারকে ফেরত দেওয়া হয়েছে।");
    bot.telegram
      .sendMessage(w.telegramId, `❌ আপনার withdrawal request টি reject হয়েছে। Point ফেরত দেওয়া হয়েছে।`)
      .catch(() => {});
  } catch {
    await ctx.reply("ভুল id।");
  }
});

bot.command("setrate", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const val = parseInt(ctx.message.text.replace("/setrate", "").trim(), 10);
  if (isNaN(val) || val <= 0) return ctx.reply("ব্যবহার: /setrate 50000");
  const db = await getDb();
  await db
    .collection("settings")
    .updateOne({ _id: "global" }, { $set: { pointsPerUSD: val } }, { upsert: true });
  await ctx.reply(`✅ রেট আপডেট হয়েছে: ${val} Point = 1 USD`);
});

bot.command("setrefer", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const val = parseInt(ctx.message.text.replace("/setrefer", "").trim(), 10);
  if (isNaN(val) || val <= 0) return ctx.reply("ব্যবহার: /setrefer 200");
  const db = await getDb();
  await db
    .collection("settings")
    .updateOne({ _id: "global" }, { $set: { referReward: val } }, { upsert: true });
  await ctx.reply(`✅ রেফার রিওয়ার্ড আপডেট হয়েছে: ${val} Point`);
});

bot.command("broadcast", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const text = ctx.message.text.replace("/broadcast", "").trim();
  if (!text) return ctx.reply("ব্যবহার: /broadcast আপনার মেসেজ");
  const db = await getDb();
  const users = await db.collection("users").find().toArray();
  await ctx.reply(`পাঠানো শুরু হচ্ছে... মোট ${users.length} জনকে।`);
  let sent = 0;
  for (const u of users) {
    try {
      await bot.telegram.sendMessage(u.telegramId, text);
      sent++;
    } catch {
      // ব্লক করা ইউজার স্কিপ
    }
  }
  await ctx.reply(`✅ ${sent} জনকে পাঠানো হয়েছে।`);
});

bot.command("help", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.reply(
    `Admin কমান্ডসমূহ:\n\n` +
      `/addtask টাইটেল | লিংক | রিওয়ার্ড\n/tasks\n/deltask <id>\n/toggletask <id>\n` +
      `/withdrawals\n/approve <id>\n/reject <id>\n` +
      `/setrate <points_per_usd>\n/setrefer <points>\n` +
      `/broadcast <message>\n/stats`
  );
});

// ---------- Vercel serverless handler ----------
export default async function handler(req, res) {
  // ব্রাউজারে এই URL এ ?secret=WEBHOOK_SECRET সহ ভিজিট করলে webhook সেট হয়ে যাবে।
  // এটাই আলাদা setup-webhook ফাইল না রেখে এখানেই রাখা হয়েছে (function সংখ্যা কম রাখতে)।
  if (req.method === "GET") {
    const secret = req.query?.secret;
    if (!secret || secret !== process.env.WEBHOOK_SECRET) {
      res.status(200).send("Turbo Earn bot webhook is alive.");
      return;
    }
    const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/setWebhook`;
    const webhookUrl = `${process.env.APP_URL}/api/bot`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: process.env.WEBHOOK_SECRET,
      }),
    });
    const data = await response.json();
    res.status(200).json({ webhookUrl, telegramResponse: data });
    return;
  }

  // Telegram থেকে আসা আসল আপডেট verify করা — secret_token header ছাড়া রিকোয়েস্ট বাতিল
  const secretHeader = req.headers["x-telegram-bot-api-secret-token"];
  if (process.env.WEBHOOK_SECRET && secretHeader !== process.env.WEBHOOK_SECRET) {
    res.status(401).send("unauthorized");
    return;
  }

  try {
    await bot.handleUpdate(req.body);
    res.status(200).send("ok");
  } catch (err) {
    console.error(err);
    res.status(200).send("ok"); // Telegram কে সবসময় 200 দিতে হয়, নাহলে retry করতে থাকবে
  }
}
