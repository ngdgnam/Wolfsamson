const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "cc",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Tạo/kiểm tra số thẻ tín dụng giả (dùng Luhn algorithm - mục đích giáo dục)",
    commandCategory: "Tiện ích",
    usages: "cc [gen <số thẻ> | check <số thẻ>]",
    cooldowns: 5
};

// Thuật toán Luhn để validate CC (giáo dục, không dùng cho fraud)
function luhnCheck(cardNumber) {
    const digits = cardNumber.replace(/\D/g, '').split('').map(Number);
    if (digits.length < 13) return false;
    let sum = 0;
    let isEven = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let digit = digits[i];
        if (isEven) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        isEven = !isEven;
    }
    return sum % 10 === 0;
}

// Tạo CC giả dựa trên BIN (mục đích test, không real)
function generateCC(bin = "4532", length = 16) {
    let cc = bin;
    while (cc.length < length - 1) {
        cc += Math.floor(Math.random() * 10);
    }
    let sum = 0;
    let isEven = false;
    for (let i = cc.length - 1; i >= 0; i--) {
        let digit = parseInt(cc[i]);
        if (isEven) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        isEven = !isEven;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return cc + checkDigit;
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const cmd = args[0]?.toLowerCase();
    const input = args.slice(1).join(" ");

    if (!cmd) {
        return api.sendMessage(
            `💳 [ THẺ TÍN DỤNG - GIÁO DỤC ]\n\n` +
            `⚠️ CHỈ DÙNG CHO MỤC ĐÍCH HỌC TẬP/TEST, KHÔNG DÙNG CHO GIAO DỊCH THỰC!\n\n` +
            `Lệnh:\n• cc gen [BIN] - Tạo CC giả (mặc định BIN 4532, Visa)\n• cc check <số thẻ> - Kiểm tra hợp lệ (Luhn algo)\nVí dụ: cc gen 4111\ncc check 4532017112830366`,
            threadID, messageID
        );
    }

    switch (cmd) {
        case "gen":
            const bin = input || "4532"; // Mặc định Visa
            if (bin.length < 4 || bin.length > 6) return api.sendMessage("BIN phải 4-6 chữ số!", threadID, messageID);
            const ccNum = generateCC(bin);
            return api.sendMessage(`✅ CC giả tạo thành công:\n💳 Số thẻ: ${ccNum}\n🏦 BIN: ${bin} (Visa/Master - giả lập)\n⚠️ Nhớ: Chỉ dùng test, không real!`, threadID, messageID);

        case "check":
            if (!input || input.length < 13) return api.sendMessage("Nhập số thẻ đầy đủ (13-19 chữ số)!", threadID, messageID);
            const isValid = luhnCheck(input);
            return api.sendMessage(
                `🔍 Kiểm tra thẻ: ${input}\n` +
                `✅ Hợp lệ (Luhn): ${isValid ? "Có" : "Không"}\n` +
                `💡 Thuật toán Luhn chỉ kiểm tra format, không xác thực thực tế.`,
                threadID, messageID
            );

        default:
            return api.sendMessage("Lệnh không hợp lệ! Dùng: cc gen/check", threadID, messageID);
    }
};
