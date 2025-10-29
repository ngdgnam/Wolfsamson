const moment = require("moment-timezone");
const os = require("os");
const fs = require("fs-extra");
const table = require("text-table"); // npm i text-table

let startTime = Date.now();
let commandCount = 0; // Tổng lệnh toàn cục
const statsPath = path.join(__dirname, "upt_stats.json");

if (!fs.existsSync(statsPath)) {
    fs.writeFileSync(statsPath, JSON.stringify({ total: 0, commands: {} }, null, 2));
}

function loadStats() {
    return JSON.parse(fs.readFileSync(statsPath, 'utf8'));
}

function saveStats(stats) {
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
}

function incrementCommand(cmdName) {
    commandCount++;
    const stats = loadStats();
    stats.total = commandCount;
    stats.commands[cmdName] = (stats.commands[cmdName] || 0) + 1;
    saveStats(stats);
}

module.exports.config = {
    name: "upt",
    version: "1.0.5",
    hasPermssion: 0,
    credits: "Kenne400k & Grok (improved) && Nnam mod",
    description: "Uptime + stats chi tiết (RAM/CPU/lệnh/top cmds)",
    commandCategory: "Hệ thống",
    usages: "upt [stats]",
    cooldowns: 5,
    dependencies: {
        "moment-timezone": "",
        "text-table": ""
    }
};

module.exports.run = async function({ api, event, args }) {
    const { threadID, messageID } = event;
    const subCmd = args[0]?.toLowerCase();
    const uptime = Date.now() - startTime;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

    const currentTime = moment().tz("Asia/Ho_Chi_Minh").format("HH:mm:ss DD/MM/YYYY");
    const ramUsed = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100; // MB
    const cpuUsage = process.cpuUsage();
    const stats = loadStats();
    const topCmds = Object.entries(stats.commands)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([cmd, count]) => [cmd, count]);

    let msg = `⏰ UPTIME BOT:\n\n`;
    msg += `🕐 Thời gian hoạt động: ${days}d ${hours}h ${minutes}m ${seconds}s\n`;
    msg += `📅 Thời gian hiện tại: ${currentTime}\n`;
    msg += `💻 RAM sử dụng: ${ramUsed} MB\n`;
    msg += `⚡ CPU: User ${Math.round(cpuUsage.user / 1000000)}ms / System ${Math.round(cpuUsage.system / 1000000)}ms\n`;
    msg += `📊 Tổng lệnh: ${stats.total}\n`;

    if (subCmd === "stats" || args.length > 0) {
        msg += `\n📈 BẢNG THỐNG KÊ TOP 10 LỆNH:\n`;
        msg += table([
            ["STT", "LỆNH", "SỐ LẦN DÙNG"],
            ...topCmds.map(([cmd, count], i) => [i + 1, cmd, count])
        ]);
    } else {
        msg += `\n💡 Reply 'stats' để xem bảng top lệnh.`;
    }

    incrementCommand("upt");
    return api.sendMessage(msg, threadID, messageID);
};
