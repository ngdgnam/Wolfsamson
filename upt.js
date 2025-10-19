const moment = require("moment-timezone");
const os = require("os"); // Để lấy RAM và CPU
const fs = require("fs-extra");
const path = require("path");

let startTime = Date.now();
let commandCount = 0; // Đếm lệnh toàn cục (có thể tăng qua event nếu tích hợp)

const statsFile = path.join(__dirname, "command_stats.json"); // File lưu stats lệnh

// Khởi tạo file stats nếu chưa có
if (!fs.existsSync(statsFile)) {
    fs.writeFileSync(statsFile, JSON.stringify({}, null, 2));
}

// Hàm tăng count lệnh (gọi từ global nếu cần)
function incrementCommand(commandName) {
    commandCount++;
    let stats = {};
    if (fs.existsSync(statsFile)) {
        stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
    }
    stats[commandName] = (stats[commandName] || 0) + 1;
    fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
}

// Hàm lấy top lệnh
function getTopCommands(limit = 10) {
    let stats = {};
    if (fs.existsSync(statsFile)) {
        stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
    }
    const sorted = Object.entries(stats)
        .sort(([,a], [,b]) => b - a)
        .slice(0, limit)
        .map(([cmd, count]) => `${cmd}: ${count}`);
    return sorted.length > 0 ? sorted.join("\n") : "Chưa có dữ liệu thống kê.";
}

module.exports.config = {
    name: "upt",
    version: "1.0.4",
    hasPermssion: 0,
    credits: "Kenne400k & Grok (improved) && Nnam mod",
    description: "Xem thời gian bot hoạt động (nâng cấp: thêm RAM, CPU, thống kê lệnh chi tiết)",
    commandCategory: "Hệ thống",
    usages: "upt [top]",
    cooldowns: 5,
    dependencies: {
        "moment-timezone": ""
    }
};

module.exports.run = async function({ api, event, args }) {
    const { threadID, messageID } = event;
    const uptime = Date.now() - startTime;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

    const currentTime = moment().tz("Asia/Ho_Chi_Minh").format("HH:mm:ss DD/MM/YYYY");
    const ramUsed = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100; // RAM sử dụng (MB)
    const cpuUsage = process.cpuUsage(); // CPU usage (user/system)

    let msg = `⏰ UPTIME BOT:\n\n`;
    msg += `🕐 Thời gian hoạt động: ${days} ngày ${hours} giờ ${minutes} phút ${seconds} giây\n`;
    msg += `📅 Thời gian hiện tại: ${currentTime}\n`;
    msg += `💻 RAM sử dụng: ${ramUsed} MB\n`;
    msg += `⚡ CPU: User ${Math.round(cpuUsage.user / 1000000)}ms / System ${Math.round(cpuUsage.system / 1000000)}ms\n`;
    msg += `📊 Tổng lệnh đã dùng: ${commandCount}\n`;

    // Thêm thống kê lệnh chi tiết nếu có args "top"
    if (args[0] && args[0].toLowerCase() === "top") {
        msg += `\n📈 TOP 10 LỆNH ĐƯỢC SỬ DỤNG:\n`;
        msg += getTopCommands(10);
    } else {
        msg += `\n👉 Reply 'top' để xem thống kê lệnh chi tiết.`;
    }

    return api.sendMessage(msg, threadID, messageID);
};

// Để tích hợp tăng count: Gọi incrementCommand("upt") ở cuối run()
incrementCommand("upt");
