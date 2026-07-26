// ================================================
// FILE PATH (GitHub এ ঠিক এই path/নামে বসাবেন): lib/mongodb.js
// ================================================

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = "turboearn";

if (!uri) {
  console.warn("MONGODB_URI is not set. Set it in your environment variables.");
}

let cachedClient = global._mongoClient;
let cachedDb = global._mongoDb;
let indexesEnsured = global._indexesEnsured || false;

export async function getDb() {
  if (cachedDb && indexesEnsured) return cachedDb;

  if (!cachedClient) {
    cachedClient = new MongoClient(uri, {
      maxPoolSize: 10, // free tier / serverless এর জন্য কানেকশন সংখ্যা সীমিত রাখা
    });
    global._mongoClient = cachedClient;
  }

  if (!cachedClient.topology || !cachedClient.topology.isConnected()) {
    await cachedClient.connect();
  }

  cachedDb = cachedClient.db(dbName);
  global._mongoDb = cachedDb;

  if (!indexesEnsured) {
    // telegramId এ unique index — ডুপ্লিকেট ইউজার/রেস-কন্ডিশনে ডাটা নষ্ট হওয়া থেকে বাঁচায়
    await cachedDb.collection("users").createIndex({ telegramId: 1 }, { unique: true });
    await cachedDb.collection("users").createIndex({ balance: -1 });
    await cachedDb.collection("tasks").createIndex({ active: 1, createdAt: -1 });
    await cachedDb.collection("withdrawals").createIndex({ telegramId: 1, createdAt: -1 });
    await cachedDb.collection("withdrawals").createIndex({ status: 1 });
    indexesEnsured = true;
    global._indexesEnsured = true;
  }

  return cachedDb;
}

export async function getSettings() {
  const db = await getDb();
  let settings = await db.collection("settings").findOne({ _id: "global" });
  if (!settings) {
    settings = {
      _id: "global",
      pointsPerUSD: 50000,
      referReward: 200,
      minWithdrawPoints: 100000,
      adWatchReward: 50,
    };
    await db.collection("settings").insertOne(settings);
  }
  return settings;
}
