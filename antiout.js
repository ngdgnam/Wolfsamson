const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "antiout",
    version: "1.1.0",
    hasPermssion: 2, // Admin only
    credits: "Kenne400k && Nnam mod",
    description: "Chống out group (nâng cấp: auto kick low activity, log kick)",
    commandCategory: "Nhóm",
    usages: "antiout [on/off | set <ngày không chat> | log]",
    cooldowns: 10
};

const antioutDataPath = path.join(__dirname, "antiout_data.json");
const logPath = path.join(__dirname, "antiout_logs.json");

if (!fs.existsSync(antioutDataPath)) fs.writeFileSync(antioutDataPath, JSON.stringify({}, null, 2));
if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, JSON.stringify({}, null, 2));

function loadAntioutData(threadID) {
    const data = JSON.parse(fs.readFileSync(antioutDataPath, 'utf8'));
    return data[threadID] || { enabled: false, daysInactive: 7 };
}

function saveAntioutData(threadID, data) {
    const allData = JSON.parse(fs.readFileSync(antioutDataPath, 'utf8'));
    allData[threadID] = data;
    fs.writeFileSync(antioutDataPath, JSON.stringify(allData, null, 2));
}

function addLog(threadID, kickedID, reason) {
    const logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    logs[threadID] = logs[threadID] || [];
    logs[threadID].unshift({ kickedID, reason, time: new Date().toISOString() });
    logs[threadID] = logs[threadID].slice(0, 50); // Giữ 50 log gần nhất
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
}

module.exports.run = async function({ api, event, args, Threads, Users }) {
    const { threadID, messageID, senderID } = event;
    const cmd = args[0]?.toLowerCase();
    const threadInfo = await Threads.getInfo(threadID);
    if (!threadInfo.adminIDs.some(admin => admin.id === senderID)) return api.sendMessage("❌ Chỉ admin!", threadID, messageID);

    const data = loadAntioutData(threadID);

    switch (cmd) {
        case "on":
            data.enabled = true;
            saveAntioutData(threadID, data);
            return api.sendMessage(`✅ Đã bật antiout (kick sau ${data.daysInactive} ngày không chat).`, threadID, messageID);

        case "off":
            data.enabled = false;
            saveAntioutData(threadID, data);
            return api.sendMessage("✅ Đã tắt antiout.", threadID, messageID);

        case "set":
            const days = parseInt(args[1]);
            if (isNaN(days) || days < 1 || days > 30) return api.sendMessage("Số ngày không chat: 1-30!", threadID, messageID);
            data.daysInactive = days;
            saveAntioutData(threadID, data);
            return api.sendMessage(`✅ Đã set kick sau ${days} ngày không chat.`, threadID, messageID);

        case "log":
            const logs = JSON.parse(fs.readFileSync(logPath, 'utf8'))[threadID] || [];
            if (logs.length === 0) return api.sendMessage("Chưa có log kick nào!", threadID, messageID);
            let logMsg = "📜 LOG KICK ANTI-OUT (10 gần nhất):\n\n";
            for (let l of logs.slice(0, 10)) {
                const kickedName = await Users.getNameUser(l.kickedID);
                const time = new Date(l.time).toLocaleString('vi-VN');
                logMsg += `• ${time}: Kick ${kickedName} (${l.kickedID}) - Lý do: ${l.reason}\n`;
            }
            return api.sendMessage(logMsg, threadID, messageID);

        default:
            return api.sendMessage(
                `🚫 [ ANTI-OUT - CHỐNG OUT GROUP ]\n\n` +
                `Tình trạng: ${data.enabled ? "✅ Bật" : "❌ Tắt"} (kick sau ${data.daysInactive} ngày không chat)\n\n` +
                `Lệnh:\n• antiout on/off - Bật/tắt\n• antiout set <ngày> - Set thời gian (1-30)\n• antiout log - Xem log kick\n\n` +
                `Tự động kick user không chat > X ngày (dựa trên last seen).`,
                threadID, messageID
            );
    }
};

module.exports.handleEvent = async function({ api, event, Threads, Users }) {
    const { threadID } = event;
    const data = loadAntioutData(threadID);
    if (!data.enabled) return;

    const threadInfo = await Threads.getInfo(threadID);
    const inactiveThreshold = data.daysInactive * 24 * 60 * 60 * 1000; // ms

    for (let memberID of threadInfo.participantIDs) {
        if (memberID === api.getCurrentUserID()) continue; // Không kick bot
        const userInfo = threadInfo.userInfos[memberID];
        if (!userInfo || !userInfo.lastActiveTime) continue;

        if (Date.now() - userInfo.lastActiveTime > inactiveThreshold) {
            try {
                await api.removeUserFromGroup(memberID, threadID);
                const kickedName = await Users.getNameUser(memberID);
                api.sendMessage(`🚫 Đã kick ${kickedName} (${memberID}) vì không hoạt động ${data.daysInactive} ngày.`, threadID);
                addLog(threadID, memberID, `Không hoạt động ${data.daysInactive} ngày`);
            } catch (e) {
                console.error("[ANTI-OUT] Lỗi kick:", e);
            }
        }
    }

    // Chạy mỗi 1 giờ (setInterval global nếu cần, hoặc cron)
    // Ở đây simulate qua event, thực tế dùng setInterval(..., 3600000);
};
