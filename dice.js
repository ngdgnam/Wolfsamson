const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "dice",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Lăn xúc xắc (nâng cấp: cược tiền, multi-roll, lịch sử)",
    commandCategory: "Game",
    usages: "dice [roll <số xúc xắc> | bet <số> <số xúc xắc>]",
    cooldowns: 3
};

const historyPath = path.join(__dirname, "dice_history.json");

function loadHistory(userID) {
    if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, JSON.stringify({}, null, 2));
    const allHist = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    allHist[userID] = allHist[userID] || [];
    return allHist;
}

function saveHistory(data) {
    fs.writeFileSync(historyPath, JSON.stringify(data, null, 2));
}

function addToHistory(userID, rolls, bet = 0, win = false) {
    const hist = loadHistory(userID);
    hist[userID].unshift({ rolls, bet, win, time: new Date().toLocaleString('vi-VN') });
    hist[userID] = hist[userID].slice(0, 20); // Giữ 20 roll gần nhất
    saveHistory(hist);
}

// Giả sử tích hợp banking (getBankData từ banking module)
function getBankBalance(userID) {
    // Thay bằng code từ banking.js
    return 10000; // Giả sử số dư
}

function updateBank(userID, amount) {
    // Thay bằng code từ banking.js
    console.log(`Cập nhật bank ${userID}: +${amount}`);
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const name = await Users.getNameUser(senderID);
    const cmd = args[0]?.toLowerCase();
    const numDice = parseInt(args[1]) || 1; // Số xúc xắc
    const bet = parseInt(args[2]) || 0; // Cược nếu có

    if (numDice < 1 || numDice > 6) return api.sendMessage("Số xúc xắc: 1-6!", threadID, messageID);
    if (bet > 0 && getBankBalance(senderID) < bet) return api.sendMessage("Không đủ tiền cược!", threadID, messageID);

    // Lăn xúc xắc
    const rolls = [];
    for (let i = 0; i < numDice; i++) {
        rolls.push(Math.floor(Math.random() * 6) + 1);
    }
    const total = rolls.reduce((sum, r) => sum + r, 0);

    let msg = `🎲 DICE ROLL - ${name}\n\n`;
    msg += rolls.map(r => `🎯 ${r}`).join(" | ");
    msg += `\n📊 Tổng: ${total}/(số xúc xắc x 6 = ${numDice * 6})\n\n`;

    let win = false;
    if (bet > 0) {
        // Giả sử thắng nếu total >= 50% max (tùy chỉnh)
        win = total >= (numDice * 3.5);
        const payout = win ? bet * 2 : -bet;
        updateBank(senderID, payout);
        msg += win ? `🎉 Thắng! Nhận ${bet * 2} VNĐ (lợi nhuận ${bet})` : `😔 Thua! Mất ${bet} VNĐ`;
    }

    addToHistory(senderID, rolls, bet, win);

    return api.sendMessage(msg, threadID, messageID);
};

module.exports.handleEvent = async function({ api, event }) {
    // Tự động lưu history nếu cần, nhưng không cần ở đây
};
