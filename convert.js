const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "convert",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Chuyển đổi đơn vị (nâng cấp: crypto, thời gian, auto-detect)",
    commandCategory: "Tiện ích",
    usages: "convert [temp <C/F> | currency <USD/VND> <số> | crypto <BTC/USD> <số> | time <UTC/VN>]",
    cooldowns: 3,
    dependencies: {
        "axios": ""
    }
};

const historyPath = path.join(__dirname, "convert_history.json");

function loadHistory(userID) {
    if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, JSON.stringify({}, null, 2));
    const allHist = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    allHist[userID] = allHist[userID] || [];
    return allHist;
}

function saveHistory(data) {
    fs.writeFileSync(historyPath, JSON.stringify(data, null, 2));
}

function addToHistory(userID, type, input, output) {
    const hist = loadHistory(userID);
    hist[userID].unshift({ type, input, output, time: new Date().toLocaleString('vi-VN') });
    hist[userID] = hist[userID].slice(0, 10); // Giữ 10 lịch sử gần nhất
    saveHistory(hist);
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const cmd = args[0]?.toLowerCase();
    const value = parseFloat(args[2]) || 1;
    if (isNaN(value) || value <= 0) return api.sendMessage("Số lượng phải > 0!", threadID, messageID);

    let result = "";
    let type = "";

    switch (cmd) {
        case "temp":
        case "nhiệt độ":
            const fromTemp = args[1]?.toUpperCase();
            if (!["c", "f"].includes(fromTemp)) return api.sendMessage("Đơn vị: C (Celsius) hoặc F (Fahrenheit)", threadID, messageID);
            const toTemp = fromTemp === "c" ? "F" : "C";
            const converted = fromTemp === "c" ? (value * 9/5 + 32) : ((value - 32) * 5/9);
            result = `${value}°${fromTemp} = ${converted.toFixed(2)}°${toTemp}`;
            type = "nhiệt độ";
            break;

        case "currency":
        case "tiền tệ":
            const fromCurr = args[1]?.toUpperCase();
            const toCurr = args[3]?.toUpperCase() || "VND"; // Mặc định VND
            if (!["usd", "vnd", "eur"].includes(fromCurr) || !["usd", "vnd", "eur"].includes(toCurr)) return api.sendMessage("Đơn vị: USD/EUR/VND", threadID, messageID);
            // Giả sử rate cố định (thực tế dùng API như exchangerate-api.com)
            let rate = 1;
            if (fromCurr === "usd" && toCurr === "vnd") rate = 25000;
            else if (fromCurr === "vnd" && toCurr === "usd") rate = 1/25000;
            else if (fromCurr === "usd" && toCurr === "eur") rate = 0.92;
            // ... thêm rate khác
            const convertedCurr = value * rate;
            result = `${value} ${fromCurr} = ${convertedCurr.toFixed(2)} ${toCurr}`;
            type = "tiền tệ";
            break;

        case "crypto":
            const fromCrypto = args[1]?.toUpperCase();
            const toCrypto = args[3]?.toUpperCase() || "USD";
            if (!["btc", "eth"].includes(fromCrypto) || !["usd", "vnd"].includes(toCrypto)) return api.sendMessage("Crypto: BTC/ETH to USD/VND", threadID, messageID);
            try {
                const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${fromCrypto}&vs_currencies=${toCrypto.toLowerCase()}`);
                const price = res.data[fromCrypto.toLowerCase()][toCrypto.toLowerCase()];
                const convertedCrypto = value * price;
                result = `1 ${fromCrypto} = ${price.toFixed(2)} ${toCrypto}\n${value} ${fromCrypto} = ${convertedCrypto.toFixed(2)} ${toCrypto}`;
                type = "crypto";
            } catch (e) {
                return api.sendMessage("Lỗi lấy giá crypto!", threadID, messageID);
            }
            break;

        case "time":
            const timeZone = args[1]?.toUpperCase();
            if (!["utc", "vn"].includes(timeZone)) return api.sendMessage("Múi giờ: UTC hoặc VN (Asia/Ho_Chi_Minh)", threadID, messageID);
            const now = new Date();
            const utcTime = now.toUTCString();
            const vnTime = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
            result = `🕐 UTC: ${utcTime}\n🇻🇳 VN: ${vnTime}`;
            type = "thời gian";
            break;

        default:
            return api.sendMessage(
                `🔄 [ CONVERT - CHUYỂN ĐỔI ]\n\n` +
                `Lệnh:\n• convert temp <C/F> <số> - Nhiệt độ\n• convert currency <USD/VND/EUR> <số> [to VND/USD/EUR]\n• convert crypto <BTC/ETH> <số> [to USD/VND]\n• convert time <UTC/VN> - Thời gian\n• convert history - Lịch sử cá nhân\nVí dụ: convert temp C 30\nconvert crypto BTC 0.1 USD`,
                threadID, messageID
            );
    }

    addToHistory(senderID, type, args.slice(1).join(" "), result);
    return api.sendMessage(`✅ Kết quả: ${result}\n💡 Lưu vào lịch sử cá nhân.`, threadID, messageID);
};

// Thêm handleReply cho history nếu cần
module.exports.handleReply = async function({ api, event, handleReply }) {
    const { threadID, messageID, senderID, body } = event;
    if (body.toLowerCase() === "history") {
        const hist = loadHistory(senderID);
        if (hist[senderID].length === 0) return api.sendMessage("Chưa có lịch sử chuyển đổi!", threadID, messageID);
        let histMsg = "📜 LỊCH SỬ CHUYỂN ĐỔI (5 gần nhất):\n\n";
        for (let h of hist[senderID].slice(0, 5)) {
            histMsg += `• ${h.time}: ${h.type} - ${h.input} → ${h.output}\n`;
        }
        return api.sendMessage(histMsg, threadID, messageID);
    }
};
