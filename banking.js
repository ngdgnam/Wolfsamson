const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "banking",
    version: "2.0.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Ngân hàng ảo (nâng cấp: vay nợ, lãi suất, lịch sử giao dịch)",
    commandCategory: "Economy",
    usages: "bank [balance|deposit|withdraw|transfer|loan|top|history]",
    cooldowns: 3
};

const dataPath = path.join(__dirname, "banking_data");
if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath);

function getUserData(userID) {
    const file = path.join(dataPath, `${userID}.json`);
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify({ balance: 0, loan: 0, history: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(file));
}

function saveUserData(userID, data) {
    const file = path.join(dataPath, `${userID}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function addHistory(userID, type, amount, note = "") {
    const data = getUserData(userID);
    data.history.unshift({ type, amount, date: new Date().toISOString(), note });
    data.history = data.history.slice(0, 50); // Giữ 50 giao dịch gần nhất
    saveUserData(userID, data);
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const name = await Users.getNameUser(senderID);
    const data = getUserData(senderID);
    const cmd = args[0]?.toLowerCase();

    switch (cmd) {
        case "balance":
        case "số dư":
            return api.sendMessage(`💰 Số dư của ${name}: ${data.balance.toLocaleString()} VNĐ\n🪙 Nợ: ${data.loan.toLocaleString()} VNĐ (Lãi: ${data.loan * 0.05} VNĐ/ngày)`, threadID, messageID);

        case "deposit":
        case "nạp":
            const depositAmt = parseInt(args[1]);
            if (isNaN(depositAmt) || depositAmt <= 0) return api.sendMessage("Số tiền nạp phải > 0!", threadID, messageID);
            data.balance += depositAmt;
            addHistory(senderID, "deposit", depositAmt, "Nạp tiền");
            saveUserData(senderID, data);
            return api.sendMessage(`✅ Đã nạp ${depositAmt.toLocaleString()} VNĐ. Số dư mới: ${data.balance.toLocaleString()} VNĐ`, threadID, messageID);

        case "withdraw":
        case "rút":
            const withdrawAmt = parseInt(args[1]);
            if (isNaN(withdrawAmt) || withdrawAmt <= 0 || withdrawAmt > data.balance) return api.sendMessage("Số tiền rút không hợp lệ hoặc vượt số dư!", threadID, messageID);
            data.balance -= withdrawAmt;
            addHistory(senderID, "withdraw", -withdrawAmt, "Rút tiền");
            saveUserData(senderID, data);
            return api.sendMessage(`✅ Đã rút ${withdrawAmt.toLocaleString()} VNĐ. Số dư mới: ${data.balance.toLocaleString()} VNĐ`, threadID, messageID);

        case "transfer":
        case "chuyển":
            const targetID = args[1];
            const transferAmt = parseInt(args[2]);
            if (!targetID || isNaN(transferAmt) || transferAmt <= 0 || transferAmt > data.balance) return api.sendMessage("Cú pháp: bank transfer <ID> <số tiền>", threadID, messageID);
            const targetData = getUserData(targetID);
            data.balance -= transferAmt;
            targetData.balance += transferAmt;
            addHistory(senderID, "transfer_out", -transferAmt, `Chuyển cho ${targetID}`);
            addHistory(targetID, "transfer_in", transferAmt, `Nhận từ ${senderID}`);
            saveUserData(senderID, data);
            saveUserData(targetID, targetData);
            const targetName = await Users.getNameUser(targetID);
            return api.sendMessage(`✅ Đã chuyển ${transferAmt.toLocaleString()} VNĐ cho ${targetName}. Số dư mới: ${data.balance.toLocaleString()} VNĐ`, threadID, messageID);

        case "loan":
        case "vay":
            const loanAmt = parseInt(args[1]);
            if (isNaN(loanAmt) || loanAmt <= 0) return api.sendMessage("Số tiền vay phải > 0!", threadID, messageID);
            if (data.loan > 0) return api.sendMessage("Bạn đang có nợ chưa trả! Trả nợ trước.", threadID, messageID);
            data.balance += loanAmt;
            data.loan = loanAmt;
            addHistory(senderID, "loan", loanAmt, "Vay tiền (lãi 5%/ngày)");
            saveUserData(senderID, data);
            return api.sendMessage(`✅ Đã vay ${loanAmt.toLocaleString()} VNĐ (lãi 5%/ngày). Số dư mới: ${data.balance.toLocaleString()} VNĐ`, threadID, messageID);

        case "repay":
        case "trả nợ":
            if (data.loan === 0) return api.sendMessage("Bạn không có nợ!", threadID, messageID);
            const interest = Math.round(data.loan * 0.05); // Lãi 5%
            const totalRepay = data.loan + interest;
            if (data.balance < totalRepay) return api.sendMessage(`Số dư không đủ! Cần ${totalRepay.toLocaleString()} VNĐ (gốc + lãi ${interest.toLocaleString()})`, threadID, messageID);
            data.balance -= totalRepay;
            data.loan = 0;
            addHistory(senderID, "repay", -totalRepay, "Trả nợ (gốc + lãi)");
            saveUserData(senderID, data);
            return api.sendMessage(`✅ Đã trả nợ ${totalRepay.toLocaleString()} VNĐ (gốc ${data.loan} + lãi ${interest}). Số dư mới: ${data.balance.toLocaleString()} VNĐ`, threadID, messageID);

        case "top":
            const allUsers = fs.readdirSync(dataPath).map(f => path.parse(f).name);
            const richList = allUsers.map(id => ({ id, ...getUserData(id), net: getUserData(id).balance - getUserData(id).loan }))
                .sort((a, b) => b.net - a.net)
                .slice(0, 10);
            let topMsg = "🏆 TOP 10 GIÀU NHẤT:\n\n";
            for (let i = 0; i < richList.length; i++) {
                const uname = await Users.getNameUser(richList[i].id);
                topMsg += `${i+1}. ${uname} (ID: ${richList[i].id})\n💰 Tài sản ròng: ${(richList[i].net).toLocaleString()} VNĐ\n\n`;
            }
            return api.sendMessage(topMsg, threadID, messageID);

        case "history":
        case "lịch sử":
            if (data.history.length === 0) return api.sendMessage("Chưa có giao dịch nào!", threadID, messageID);
            let histMsg = "📜 LỊCH SỬ GIAO DỊCH (5 gần nhất):\n\n";
            for (let h of data.history.slice(0, 5)) {
                const date = new Date(h.date).toLocaleString('vi-VN');
                histMsg += `• ${date}: ${h.type} ${h.amount.toLocaleString()} VNĐ - ${h.note}\n`;
            }
            return api.sendMessage(histMsg, threadID, messageID);

        default:
            return api.sendMessage(
                `🏦 NGÂN HÀNG ẢO\n\n` +
                `Số dư: ${data.balance.toLocaleString()} VNĐ | Nợ: ${data.loan.toLocaleString()} VNĐ\n\n` +
                `Lệnh:\n• bank balance - Xem số dư\n• bank deposit <số> - Nạp tiền\n• bank withdraw <số> - Rút tiền\n• bank transfer <ID> <số> - Chuyển tiền\n• bank loan <số> - Vay tiền\n• bank repay - Trả nợ\n• bank top - Top giàu\n• bank history - Lịch sử`,
                threadID, messageID
            );
    }
};
