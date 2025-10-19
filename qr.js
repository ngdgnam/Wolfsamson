const QRCode = require("qrcode"); // Cần cài: npm i qrcode
const fs = require("fs-extra");
const path = require("path");
const { createCanvas, loadImage, Canvas } = require("canvas"); // Để thêm watermark nếu cần

module.exports.config = {
    name: "qr",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Tạo QR code từ text/URL (nâng cấp: màu sắc, watermark, lịch sử)",
    commandCategory: "Tiện ích",
    usages: "qr <text/URL> [color: #hex] [history]",
    cooldowns: 5,
    dependencies: {
        "qrcode": "",
        "canvas": "",
        "fs-extra": ""
    }
};

const historyPath = path.join(__dirname, "qr_history.json");

function loadHistory(userID) {
    if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, JSON.stringify({}, null, 2));
    const allHist = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    allHist[userID] = allHist[userID] || [];
    return allHist;
}

function saveHistory(data) {
    fs.writeFileSync(historyPath, JSON.stringify(data, null, 2));
}

function addToHistory(userID, text, color = "#000000") {
    const hist = loadHistory(userID);
    hist[userID].unshift({ text: text.substring(0, 50) + (text.length > 50 ? "..." : ""), color, time: new Date().toLocaleString('vi-VN') });
    hist[userID] = hist[userID].slice(0, 10); // Giữ 10 QR gần nhất
    saveHistory(hist);
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const name = await Users.getNameUser(senderID);
    const text = args.slice(0, -1).join(" "); // Text trước color
    const colorArg = args[args.length - 1];

    if (args.length === 0 || text.length === 0) {
        return api.sendMessage(
            `📱 [ QR CODE GENERATOR ]\n\n` +
            `Sử dụng: qr <text/URL> [màu: #hex]\n` +
            `• Màu mặc định: #000000 (đen)\n` +
            `• Ví dụ: qr https://google.com #FF0000 (đỏ)\n` +
            `• qr history - Xem lịch sử QR của bạn\n\n` +
            `QR sẽ scan về text gốc!`,
            threadID, messageID
        );
    }

    if (text === "history") {
        const hist = loadHistory(senderID);
        if (hist[senderID].length === 0) return api.sendMessage("Chưa tạo QR nào!", threadID, messageID);
        let histMsg = "📜 LỊCH SỬ QR (5 gần nhất):\n\n";
        for (let h of hist[senderID].slice(0, 5)) {
            histMsg += `• ${h.time}: ${h.text} (Màu: ${h.color})\n`;
        }
        return api.sendMessage(histMsg, threadID, messageID);
    }

    const color = colorArg.startsWith("#") ? colorArg : "#000000"; // Mặc định đen

    const qrPath = path.join(__dirname, "cache", `qr-${senderID}-${Date.now()}.png`);

    try {
        // Tạo QR cơ bản
        await QRCode.toFile(qrPath, text, {
            width: 256,
            color: {
                dark: color,  // Màu QR
                light: "#FFFFFF"  // Nền trắng
            },
            margin: 1
        });

        // Thêm watermark (tùy chọn, dùng Canvas)
        const canvas = createCanvas(256, 256 + 50); // Thêm chỗ cho watermark
        const ctx = canvas.getContext("2d");
        const qrImg = await loadImage(qrPath);
        ctx.drawImage(qrImg, 0, 0, 256, 256);
        ctx.fillStyle = "#000000";
        ctx.font = "bold 16px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`Made by ${name}`, 128, 256 + 30); // Watermark dưới

        const finalBuffer = canvas.toBuffer("image/png");
        fs.writeFileSync(qrPath, finalBuffer);

        addToHistory(senderID, text, color);

        api.sendMessage({
            body: `✅ QR Code cho "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"\n🎨 Màu: ${color}\n📱 Scan để lấy text gốc!`,
            attachment: fs.createReadStream(qrPath)
        }, threadID, () => fs.unlinkSync(qrPath), messageID);
    } catch (e) {
        console.error("[QR] Lỗi tạo:", e);
        return api.sendMessage(`❌ Lỗi tạo QR: ${e.message}\nKiểm tra text/màu hợp lệ!`, threadID, messageID);
    }
};
