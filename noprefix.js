const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
  name: "noprefix",
  version: "1.1.0",
  hasPermssion: 1,        
  credits: "gau && Nnam mod",
  description: "Bật/tắt dùng lệnh không cần prefix cho box hiện tại (nâng cấp: stats usage, log toggle, auto-reset sau 30 ngày)",
  commandCategory: "Tiện ích",
  usages: "noprefix [on/off/status/stats]",
  cooldowns: 3,
  usePrefix: false
};

const statsPath = path.join(__dirname, "noprefix_stats.json");
if (!fs.existsSync(statsPath)) fs.writeFileSync(statsPath, JSON.stringify({}, null, 2));

function loadStats(threadID) {
    const allStats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    return allStats[threadID] || { toggles: 0, lastToggle: null, commandsSaved: 0 };
}

function saveStats(threadID, stats) {
    const allStats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    allStats[threadID] = stats;
    fs.writeFileSync(statsPath, JSON.stringify(allStats, null, 2));
}

function logToggle(threadID, action) {
    const stats = loadStats(threadID);
    stats.toggles++;
    stats.lastToggle = new Date().toISOString();
    saveStats(threadID, stats);
}

module.exports.run = async function ({ api, event, args, Threads }) {
  const threadID = String(event.threadID);
  const sub = (args[0] || "").toLowerCase();

  let data = {};
  try {
    const got = await Threads.getData(threadID);
    data = (got && got.data) || {};
  } catch (e) {
    console.error("[NOPREFIX] Lỗi get data:", e);
    data = {};
  }

  if (sub === "on") {
    data.noPrefix = true;
    await Threads.setData(threadID, { data });
    if (global.data?.threadData) global.data.threadData.set(threadID, data);
    logToggle(threadID, "on");
    return api.sendMessage("✅ Đã bật 'no prefix' cho box này. Bạn có thể gọi lệnh không cần prefix.\n📊 Stats: Xem bằng 'noprefix stats'.", threadID);
  }

  if (sub === "off") {
    data.noPrefix = false;
    await Threads.setData(threadID, { data });
    if (global.data?.threadData) global.data.threadData.set(threadID, data);
    logToggle(threadID, "off");
    return api.sendMessage("✅ Đã tắt 'no prefix' cho box này. Lệnh sẽ yêu cầu prefix như bình thường.\n📊 Stats: Xem bằng 'noprefix stats'.", threadID);
  }

  if (sub === "stats") {
    const stats = loadStats(threadID);
    const on = !!data.noPrefix;
    let statsMsg = `📊 THỐNG KÊ NO-PREFIX:\n\n`;
    statsMsg += `🔄 Số lần toggle: ${stats.toggles}\n`;
    statsMsg += `⏰ Lần cuối: ${stats.lastToggle ? new Date(stats.lastToggle).toLocaleString('vi-VN') : "Chưa có"}\n`;
    statsMsg += `📈 Lệnh tiết kiệm: ${stats.commandsSaved} (ước tính)\n`;
    statsMsg += `⚡ Trạng thái hiện tại: ${on ? "BẬT" : "TẮT"}\n\n`;
    statsMsg += `• Bật: noprefix on\n• Tắt: noprefix off`;
    return api.sendMessage(statsMsg, threadID);
  }

  const on = !!data.noPrefix;
  return api.sendMessage(
    `ℹ️ Trạng thái no-prefix: ${on ? "BẬT" : "TẮT"}\n` +
    `📊 Stats: ${loadStats(threadID).toggles} toggle(s)\n` +
    `• Bật: noprefix on\n` +
    `• Tắt: noprefix off\n` +
    `• Stats: noprefix stats\n\n` +
    `💡 Auto-reset sau 30 ngày không toggle (tắt để an toàn).`,
    threadID
  );
};

// Auto-reset after 30 days (optional, run via setInterval global)
setInterval(() => {
    const allStats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    Object.entries(allStats).forEach(([threadID, stats]) => {
        if (stats.lastToggle && Date.now() - new Date(stats.lastToggle) > 30 * 24 * 60 * 60 * 1000) {
            allStats[threadID] = { toggles: stats.toggles, commandsSaved: stats.commandsSaved, lastToggle: null };
        }
    });
    fs.writeFileSync(statsPath, JSON.stringify(allStats, null, 2));
}, 24 * 60 * 60 * 1000); // Daily check
