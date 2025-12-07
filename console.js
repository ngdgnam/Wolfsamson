const fs = require('fs');
const chalk = require('chalk');
const moment = require('moment-timezone');

module.exports.config = {
  name: "console",
  version: "3.1.0",
  hasPermssion: 3,
  credits: "WolfBot Team",  //Thay cre làm chó nhé các tình yêu
  description: "Console kiểu bảng đẹp, chống spam",
  commandCategory: "Admin",
  usages: "",
  cooldowns: 0
};

// ====== Biến chống spam ======
let isBlocked = false;
let spamCount = {};
const SPAM_LIMIT = 15;        // 15 tin / 3 giây
const SPAM_WINDOW = 3000;     // 3 giây
const BLOCK_TIME = 20000;     // Tắt console 20 giây khi spam

// ====== Ghi log ======
function writeLog(data) {
  fs.appendFileSync("console_log.txt", data + "\n", "utf8");
}

// ====== Auto Clear ======
setInterval(() => {
  console.clear();
  console.log(chalk.green("🌿 Console tự làm mới"));
}, 60000);

// ====== Khung console ======
function showFrame({ threadName, senderName, message, time }) {
  console.log(
    chalk.hex("#DEADED")(`\n========= WolfBot Console Log ==============`) + "\n" +
    chalk.hex("#C0FFEE")(`├─ Nhóm: ${threadName}`) + "\n" +
    chalk.hex("#FFAACC")(`├─ User: ${senderName}`) + "\n" +
    chalk.hex("#A3FF00")(`├─ Nội dung: ${message}`) + "\n" +
    chalk.hex("#FFFF00")(`├─ Time: ${time}`) + "\n" +
    chalk.hex("#DEADED")(`==============================================\n`)
  );
}

module.exports.handleEvent = async function({ api, event, Users }) {
  const { threadID, senderID } = event;
  if (senderID === global.data.botID) return;

  const threadData = global.data.threadData.get(threadID) || {};
  if (threadData.console === true) return;

  // ====== chống spam ======
  let now = Date.now();
  if (!spamCount[threadID]) spamCount[threadID] = { count: 0, last: now };

  let data = spamCount[threadID];

  if (now - data.last <= SPAM_WINDOW) {
    data.count++;
    if (data.count >= SPAM_LIMIT) {
      if (!isBlocked) {
        console.log(chalk.red(`⚠️ Console đã tắt 20 giây (phát hiện spam)`));
        isBlocked = true;

        setTimeout(() => {
          console.log(chalk.green(`✅ Console kích hoạt lại`));
          isBlocked = false;
        }, BLOCK_TIME);
      }
      data.last = now;
      return;
    }
  } else {
    data.count = 1;
  }

  data.last = now;

  if (isBlocked) return;

  // ====== lấy thông tin ======
  const threadName = global.data.threadInfo.get(threadID)?.threadName || "Không xác định";
  const senderName = await Users.getNameUser(senderID);
  const message = event.body || "Ảnh/Video hoặc ký tự đặc biệt";
  const time = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss DD/MM/YYYY");

  // ====== in bảng ======
  showFrame({ threadName, senderName, message, time });

  // ====== lưu log ======
  writeLog(`[${time}] ${threadName} - ${senderName}: ${message}`);
};

module.exports.run = async () => {
  console.log(chalk.green("⚡ Console Module đã chạy!"));
};
