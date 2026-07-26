// ================================================
// FILE PATH (GitHub এ ঠিক এই path/নামে বসাবেন): pages/index.js
// ================================================

import { useEffect, useState, useCallback } from "react";
import Head from "next/head";

function getInitData() {
  if (typeof window === "undefined") return "";
  return window.Telegram?.WebApp?.initData || "";
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-init-data": getInitData(),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "কিছু একটা ভুল হয়েছে");
  return data;
}

export default function Home() {
  const [tab, setTab] = useState("home");
  const [user, setUser] = useState(null);
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const loadUser = useCallback(async () => {
    try {
      const u = await api("/api/user");
      setUser(u);
    } catch (e) {
      // initData না থাকলে (যেমন ব্রাউজারে সরাসরি টেস্ট করলে) কিছু হবে না
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
    loadUser();
  }, [loadUser]);

  return (
    <>
      <Head>
        <title>Turbo Earn</title>
      </Head>
      <div className="app-shell">
        <div className="top-bar">
          <div className="brand">
            Turbo<span>Earn</span>
          </div>
          {user && (
            <div className="reward-pill">{user.balance.toLocaleString()} P</div>
          )}
        </div>

        <div className="page">
          {tab === "home" && <HomeTab user={user} refresh={loadUser} showToast={showToast} />}
          {tab === "task" && <TaskTab showToast={showToast} refreshUser={loadUser} />}
          {tab === "refer" && <ReferTab user={user} showToast={showToast} />}
          {tab === "earn" && <EarnTab showToast={showToast} refreshUser={loadUser} />}
          {tab === "play" && <PlayTab showToast={showToast} refreshUser={loadUser} />}
        </div>

        <nav className="bottom-nav">
          <NavBtn active={tab === "home"} onClick={() => setTab("home")} icon="🏠" label="Home" />
          <NavBtn active={tab === "task"} onClick={() => setTab("task")} icon="📋" label="Task" />
          <NavBtn active={tab === "refer"} onClick={() => setTab("refer")} icon="🤝" label="Refer" />
          <NavBtn active={tab === "earn"} onClick={() => setTab("earn")} icon="💰" label="Earning" />
          <NavBtn active={tab === "play"} onClick={() => setTab("play")} icon="🎮" label="Play" />
        </nav>

        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

function NavBtn({ active, onClick, icon, label }) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ---------------- HOME ----------------
function HomeTab({ user, refresh, showToast }) {
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [wallet, setWallet] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.wallet) setWallet(user.wallet);
  }, [user?.wallet]);

  if (!user) return <div className="empty-state">লোড হচ্ছে...</div>;

  async function saveWallet() {
    setSaving(true);
    try {
      await api("/api/user", { method: "POST", body: JSON.stringify({ wallet }) });
      showToast("✅ Wallet সেভ হয়েছে");
      refresh();
    } catch (e) {
      showToast(e.message);
    }
    setSaving(false);
  }

  async function requestWithdraw() {
    const points = parseInt(amount, 10);
    if (!points) return showToast("সঠিক পরিমাণ Point লিখুন");
    try {
      await api("/api/withdraw", {
        method: "POST",
        body: JSON.stringify({ points, wallet }),
      });
      showToast("✅ Withdraw request পাঠানো হয়েছে, রিভিউ চলছে");
      setAmount("");
      refresh();
    } catch (e) {
      showToast(e.message);
    }
  }

  return (
    <>
      <div className="card profile-row">
        <div className="avatar">{(user.firstName || "U")[0].toUpperCase()}</div>
        <div>
          <div className="profile-name">{user.firstName || user.username}</div>
          <div className="profile-id">User ID: {user.telegramId}</div>
        </div>
      </div>

      <div className="card balance-card">
        <div className="label">টোটাল ব্যালেন্স</div>
        <div className="points">{user.balance.toLocaleString()} Point</div>
        <div className="usd">≈ ${user.usdValue.toFixed(4)} USD</div>
      </div>

      <div className="grid-2" style={{ marginBottom: 14 }}>
        <button className="btn btn-secondary" onClick={() => setShowLeaderboard(true)}>
          🏆 Leaderboard
        </button>
        <button className="btn btn-secondary" onClick={() => showToast(`আপনার Rank: #${user.rank}`)}>
          📊 Statistics
        </button>
      </div>

      <div className="card">
        <div className="section-title">Withdrawal Wallet</div>
        <input
          type="text"
          placeholder="আপনার TON/USDT wallet address (Tonkeeper)"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={saveWallet} disabled={saving}>
          {saving ? "সেভ হচ্ছে..." : "💾 Wallet সেভ করুন"}
        </button>
      </div>

      <div className="card">
        <div className="section-title">Withdraw Method: TON / USDT (Tonkeeper)</div>
        <input
          type="text"
          placeholder={`পরিমাণ (Point) — সর্বনিম্ন ${user.minWithdrawPoints}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button className="btn btn-primary" onClick={requestWithdraw}>
          🏧 Withdraw Request পাঠান
        </button>
      </div>

      <div className="card">
        <div className="section-title">Statistics</div>
        <div className="list-item">
          <span className="title">মোট Referral</span>
          <span className="reward-pill">{user.referralCount}</span>
        </div>
        <div className="list-item">
          <span className="title">Leaderboard Rank</span>
          <span className="reward-pill">#{user.rank}</span>
        </div>
        <div className="list-item">
          <span className="title">Exchange Rate</span>
          <span className="reward-pill">{user.pointsPerUSD.toLocaleString()} P = $1</span>
        </div>
      </div>

      {showLeaderboard && <LeaderboardModal onClose={() => setShowLeaderboard(false)} />}
    </>
  );
}

function LeaderboardModal({ onClose }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    api("/api/user?leaderboard=1").then(setList).catch(() => setList([]));
  }, []);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 30,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxHeight: "70vh", overflowY: "auto", borderRadius: "20px 20px 0 0" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-title">🏆 Top Earners</div>
        {list === null && <div className="empty-state">লোড হচ্ছে...</div>}
        {list && list.length === 0 && <div className="empty-state">এখনো কেউ নেই</div>}
        {list &&
          list.map((u) => (
            <div className="leaderboard-row" key={u.rank}>
              <span className="leaderboard-rank">#{u.rank}</span>
              <span style={{ flex: 1 }}>{u.name}</span>
              <span className="reward-pill">{u.balance.toLocaleString()} P</span>
            </div>
          ))}
        <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={onClose}>
          বন্ধ করুন
        </button>
      </div>
    </div>
  );
}

// ---------------- TASK ----------------
function TaskTab({ showToast, refreshUser }) {
  const [tasks, setTasks] = useState(null);

  const load = useCallback(() => {
    api("/api/tasks").then(setTasks).catch(() => setTasks([]));
  }, []);

  useEffect(load, [load]);

  async function openAndClaim(task) {
    if (task.link) {
      window.Telegram?.WebApp?.openLink
        ? window.Telegram.WebApp.openLink(task.link)
        : window.open(task.link, "_blank");
    }
    try {
      const r = await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ taskId: task.id }),
      });
      showToast(`✅ +${r.reward} Point পেয়েছেন!`);
      load();
      refreshUser();
    } catch (e) {
      showToast(e.message);
    }
  }

  return (
    <>
      <div className="section-title">Available Tasks</div>
      {tasks === null && <div className="empty-state">লোড হচ্ছে...</div>}
      {tasks && tasks.length === 0 && (
        <div className="empty-state">এখন কোনো task নেই। পরে আবার চেক করুন।</div>
      )}
      {tasks &&
        tasks.map((t) => (
          <div className="list-item" key={t.id}>
            <div>
              <div className="title">{t.title}</div>
              <div className="sub">{t.completed ? "✅ সম্পন্ন হয়েছে" : "লিংকে ভিজিট করুন"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="reward-pill" style={{ marginBottom: 6 }}>
                +{t.reward} P
              </div>
              <button
                className="btn btn-primary"
                style={{ padding: "8px 14px", width: "auto" }}
                disabled={t.completed}
                onClick={() => openAndClaim(t)}
              >
                {t.completed ? "Done" : "Go"}
              </button>
            </div>
          </div>
        ))}
    </>
  );
}

// ---------------- REFER ----------------
function ReferTab({ user, showToast }) {
  if (!user) return <div className="empty-state">লোড হচ্ছে...</div>;
  const link = `https://t.me/${user.botUsername || "your_bot"}?start=${user.telegramId}`;

  function copyLink() {
    navigator.clipboard
      ?.writeText(link)
      .then(() => showToast("✅ লিংক কপি হয়েছে"))
      .catch(() => showToast("কপি করা যায়নি, ম্যানুয়ালি কপি করুন"));
  }

  function shareLink() {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
      link
    )}&text=${encodeURIComponent("Turbo Earn এ জয়েন করুন আর Point আয় করুন! 🚀")}`;
    window.Telegram?.WebApp?.openTelegramLink
      ? window.Telegram.WebApp.openTelegramLink(shareUrl)
      : window.open(shareUrl, "_blank");
  }

  return (
    <>
      <div className="card balance-card">
        <div className="label">প্রতি রেফারে পাবেন</div>
        <div className="points">{user.referReward} Point</div>
      </div>
      <div className="card">
        <div className="section-title">আপনার রেফারেল লিংক</div>
        <input type="text" value={link} readOnly />
        <div className="grid-2">
          <button className="btn btn-secondary" onClick={copyLink}>
            📋 Copy
          </button>
          <button className="btn btn-primary" onClick={shareLink}>
            📤 Share
          </button>
        </div>
      </div>
      <div className="card">
        <div className="list-item">
          <span className="title">মোট Referral</span>
          <span className="reward-pill">{user.referralCount}</span>
        </div>
      </div>
    </>
  );
}

// ---------------- EARNING ----------------
function EarnTab({ showToast, refreshUser }) {
  const [loading, setLoading] = useState("");

  async function watch(network, label) {
    setLoading(network);
    try {
      // TODO: আসল ad network SDK যোগ হলে এখানে তাদের showAd()/showRewardedAd()
      // কল করে, সম্পূর্ণ হওয়ার পর নিচের api কল করবেন — pages/api/earn.js এর কমেন্ট দেখুন
      const r = await api("/api/earn", {
        method: "POST",
        body: JSON.stringify({ type: "ad", network }),
      });
      showToast(`✅ ${label} থেকে +${r.reward} Point পেয়েছেন!`);
      refreshUser();
    } catch (e) {
      showToast(e.message);
    }
    setLoading("");
  }

  const networks = [
    { key: "gigapub", label: "GigaPub Ads", emoji: "📺" },
    { key: "monetag", label: "Monetag Ads", emoji: "🎬" },
    { key: "adsgram", label: "Adsgram Ads", emoji: "📽️" },
  ];

  return (
    <>
      <div className="section-title">বিজ্ঞাপন দেখে Point আয় করুন</div>
      {networks.map((n) => (
        <div className="list-item" key={n.key}>
          <div>
            <div className="title">
              {n.emoji} {n.label}
            </div>
            <div className="sub">Placeholder — SDK যোগ করার পর সক্রিয় হবে</div>
          </div>
          <button
            className="btn btn-green"
            style={{ padding: "8px 14px", width: "auto" }}
            disabled={loading === n.key}
            onClick={() => watch(n.key, n.label)}
          >
            {loading === n.key ? "..." : "Watch"}
          </button>
        </div>
      ))}
    </>
  );
}

// ---------------- PLAY ----------------
function PlayTab({ showToast, refreshUser }) {
  const [spin, setSpin] = useState(null);
  const [spinning, setSpinning] = useState(false);

  const load = useCallback(() => {
    api("/api/earn?spin=1").then(setSpin).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function doSpin() {
    setSpinning(true);
    try {
      const r = await api("/api/earn", {
        method: "POST",
        body: JSON.stringify({ type: "spin" }),
      });
      showToast(`🎉 আপনি জিতেছেন +${r.reward} Point!`);
      refreshUser();
      load();
    } catch (e) {
      showToast(e.message);
    }
    setSpinning(false);
  }

  return (
    <>
      <div className="section-title">Play & Earn</div>

      <div className="game-card">
        <div className="game-emoji">🎡</div>
        <div style={{ flex: 1 }}>
          <div className="title">Daily Lucky Spin</div>
          <div className="sub">দিনে একবার স্পিন করে ফ্রি Point জিতুন</div>
        </div>
      </div>
      <button className="btn btn-primary" disabled={spinning || (spin && !spin.canSpin)} onClick={doSpin}>
        {spin && !spin.canSpin ? "⏳ আগামীকাল আবার আসুন" : spinning ? "স্পিন হচ্ছে..." : "🎡 Spin করুন"}
      </button>

      <div style={{ height: 16 }} />

      <div className="game-card" style={{ opacity: 0.6 }}>
        <div className="game-emoji">🎲</div>
        <div style={{ flex: 1 }}>
          <div className="title">Lucky Dice</div>
          <div className="sub">শীঘ্রই আসছে</div>
        </div>
      </div>
      <div className="game-card" style={{ opacity: 0.6 }}>
        <div className="game-emoji">🪙</div>
        <div style={{ flex: 1 }}>
          <div className="title">Coin Flip Challenge</div>
          <div className="sub">শীঘ্রই আসছে</div>
        </div>
      </div>
    </>
  );
}
