const fs = require('fs');
const chalk = require('chalk');
const moment = require('moment-timezone');

module.exports.config = {
  name: "console",
  version: "3.0.0",
  hasPermssion: 3,
  credits: "WolfBot Team", //thay cre lam cho nhe
  description: "Console kiểu khung, chống spam, lưu log",
  commandCategory: "Admin",
  usages: "",
  cooldowns: 0
};

// ====== BIẾN CHUNG ======
let isBlocked = false;            // Chế độ tắt console tạm thời khi spam  
let spamCount = {};               // Đếm spam theo group  
let LOG_BLOCK_TIME = 20000;       // 20 giây tắt console khi spam  
let SPAM_LIMIT = 15;              // 15 tin / 3s → spam  
let SPAM_WINDOW = 3000;           // 3 giây

// ====== GHI LOG ======
function writeLog(data) {
  fs.appendFileSync("console_log.txt", data + "\n", "utf8");
}

// ====== TỰ CLEAR CONSOLE ======
setInterval(() => {
  console.clear();
  console.log(chalk.green("🌿 Console đã được làm mới tự động"));
}, 60000);

// ====== HIỂN THỊ BẢNG KIỂU 1 ======
function showFrame({ threadName, senderName, message, time }) {
  console.log(
    chalk.hex("#DEADED")(`\n╭──────────────────────────⭓`) + "\n" +
    chalk.hex("#C0FFEE")(`├─ Nhóm: ${threadName}`) + "\n" +
    chalk.hex("#FFAACC")(`├─ User: ${senderName}`) + "\n" +
    chalk.hex("#A3FF00")(`├─ Nội dung: ${message}`) + "\n" +
    chalk.hex("#FFFF00")(`├─ Time: ${time}`) + "\n" +
    chalk.hex("#DEADED")(`╰──────────────────────────⭓\n`)
  );
}

module.exports.handleEvent = async function({ api, event, Users }) {
  const { threadID, senderID } = event;
  if (senderID === global.data.botID) return;

  const threadData = global.data.threadData.get(threadID) || {};
  if (threadData.console === true) return;

  // JSON thơ
  const poems = require('./../../includes/datajson/poem.json');
  const poem = poems[Math.floor(Math.random() * poems.length)].trim();

  // ====== CHECK SPAM ======
  let now = Date.now();
  if (!spamCount[threadID]) spamCount[threadID] = { count: 0, last: now };

  let data = spamCount[threadID];

  if (now - data.last <= SPAM_WINDOW) {
    data.count++;
    if (data.count >= SPAM_LIMIT) {
      if (!isBlocked) {
        console.log(chalk.red(`⚠️ Console tạm tắt 20 giây (phát hiện spam)`));
        isBlocked = true;
        setTimeout(() => {
          console.log(chalk.green(`✅ Console kích hoạt lại`));
          isBlocked = false;
        }, LOG_BLOCK_TIME);
      }
      data.last = now;
      return;
    }
  } else {
    data.count = 1;
  }

  data.last = now;

  if (isBlocked) return;

  // ====== LẤY THÔNG TIN ======
  const threadName = global.data.threadInfo.get(threadID)?.threadName || "Không xác định";
  const senderName = await Users.getNameUser(senderID);
  const message = event.body || "Ảnh/Video hoặc ký tự đặc biệt";
  const time = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss DD/MM/YYYY");

  // ====== HIỂN THỊ BẢNG ======
  showFrame({ threadName, senderName, message, time });

  // ====== RANDOM THƠ ======
  console.log(chalk.cyan(`[ ${poem} ]\n`));

  // ====== LƯU LOG ======
  writeLog(`[${time}] ${threadName} - ${senderName}: ${message}`);
};

module.exports.run = async () => {
  console.log(chalk.green("⚡ Console Module đã hoạt động!"));
};
