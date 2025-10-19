const fs = require("fs-extra");

module.exports.config = {
    name: "boxinfo",
    version: "1.0.4",
    hasPermssion: 0,
    credits: "Kenne400k & Grok (improved) && Nnam mod",
    description: "Xem thông tin chi tiết nhóm chat (nâng cấp: thêm thống kê tin nhắn từ check module)",
    commandCategory: "Nhóm",
    usages: "boxinfo",
    cooldowns: 5
};

module.exports.run = async function({ api, event, Users, Threads }) {
    const { threadID, messageID } = event;
    const threadInfo = await Threads.getInfo(threadID);
    const admins = threadInfo.adminIDs.length;
    const members = threadInfo.participantIDs.length;
    const pending = threadInfo.pendingMemberIDs ? threadInfo.pendingMemberIDs.length : 0;
    const createdTime = threadInfo.threadCreationTime ? new Date(threadInfo.threadCreationTime).toLocaleDateString('vi-VN') : "Không rõ";

    // Thêm thống kê thành viên hoạt động (giả sử dựa trên lastActiveTime nếu có)
    let activeMembers = 0;
    for (let member of threadInfo.participantIDs) {
        if (threadInfo.userInfos[member]?.lastActiveTime > Date.now() - 7 * 24 * 60 * 60 * 1000) { // Hoạt động trong 7 ngày
            activeMembers++;
        }
    }

    // Thống kê tin nhắn từ module check (nếu có file data)
    const checkPath = path.join(__dirname, 'checktt', `${threadID}.json`);
    let totalMsg = 0, avgMsg = 0, topUser = "Không có dữ liệu";
    if (fs.existsSync(checkPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(checkPath, 'utf8'));
            totalMsg = data.total ? data.total.reduce((sum, u) => sum + u.count, 0) : 0;
            avgMsg = totalMsg > 0 ? Math.round(totalMsg / members) : 0;
            if (data.total && data.total.length > 0) {
                const top = data.total.sort((a, b) => b.count - a.count)[0];
                const topName = await Users.getNameUser(top.id);
                topUser = `${topName} (${top.count} tin)`;
            }
        } catch (e) {
            console.error("[BOXINFO] Lỗi đọc dữ liệu check:", e);
        }
    }

    let msg = `📋 THÔNG TIN NHÓM:\n\n`;
    msg += `👥 Tên nhóm: ${threadInfo.threadName}\n`;
    msg += `🆔 ID nhóm: ${threadID}\n`;
    msg += `👥 Số thành viên: ${members}\n`;
    msg += `📊 Thành viên hoạt động (7 ngày): ${activeMembers}\n`;
    msg += `🔒 Số admin: ${admins}\n`;
    msg += `⏳ Đợi duyệt: ${pending}\n`;
    msg += `📅 Tạo ngày: ${createdTime}\n\n`;
    msg += `💬 THỐNG KÊ TIN NHẮN:\n`;
    msg += `📈 Tổng tin nhắn: ${totalMsg}\n`;
    msg += `📊 TB tin/người: ${avgMsg}\n`;
    msg += `🥇 Top user: ${topUser}\n\n`;
    msg += `📊 Danh sách admin:\n`;
    for (let admin of threadInfo.adminIDs) {
        const name = await Users.getNameUser(admin.id);
        msg += `• ${name} (ID: ${admin.id})\n`;
    }

    return api.sendMessage(msg, threadID, messageID);
};
