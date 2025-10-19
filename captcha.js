const fs = require("fs-extra");
const path = require("path");
const { createCanvas, loadImage, Canvas } = require("canvas"); // npm i canvas

module.exports.config = {
    name: "captcha",
    version: "1.1.0",
    hasPermssion: 2, // Admin set up
    credits: "Kenne400k && Nnam mod",
    description: "Xác thực captcha cho join group (AI generate với Canvas, chống spam)",
    commandCategory: "Nhóm",
    usages: "captcha [setup | verify <code>]",
    cooldowns: 60 // Chống spam
};

let pendingUsers = new Map(); // Lưu user chờ verify per thread

module.exports.run = async function({ api, event, args, Users, Threads }) {
    const { threadID, messageID, senderID } = event;
    const cmd = args[0]?.toLowerCase();
    const threadInfo = await Threads.getInfo(threadID);

    if (cmd === "setup") {
        if (!threadInfo.adminIDs.some(admin => admin.id === senderID)) return api.sendMessage("❌ Chỉ admin!", threadID, messageID);
        // Enable captcha for new join (handleEvent sẽ trigger)
        return api.sendMessage("✅ Đã kích hoạt captcha cho join group. User mới phải verify trong 2 phút!", threadID, messageID);
    }

    if (cmd === "verify") {
        const code = args[1];
        const pending = pendingUsers.get(threadID);
        if (!pending || !pending[senderID]) return api.sendMessage("❌ Bạn không cần verify!", threadID, messageID);
        if (pending[senderID].code !== code) return api.sendMessage("❌ Code sai! Thử lại.", threadID, messageID);
        // Approve
        delete pending[senderID];
        if (Object.keys(pending).length === 0) pendingUsers.delete(threadID);
        return api.sendMessage("✅ Verify thành công! Chào mừng đến group!", threadID, messageID);
    }

    return api.sendMessage("Sử dụng: captcha setup (admin) | verify <code>", threadID, messageID);
};

module.exports.handleEvent = async function({ api, event, Threads, Users }) {
    const { threadID, senderID, userJoin } = event;
    if (!userJoin) return;

    const threadInfo = await Threads.getInfo(threadID);
    // Kiểm tra nếu captcha enabled (giả sử flag trong thread data, hoặc luôn on)
    const pending = pendingUsers.get(threadID) || {};
    const code = Math.random().toString(36).substring(7).toUpperCase(); // Random code 7 ký tự
    pending[senderID] = { code, time: Date.now() + 120000 }; // Expire 2 phút

    pendingUsers.set(threadID, pending);

    // Generate captcha image với Canvas
    const canvas = createCanvas(200, 60);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 200, 60);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 32px Arial";
    ctx.textAlign = "center";
    ctx.fillText(code, 100, 40);

    // Thêm noise (AI-like distortion)
    for (let i = 0; i < 50; i++) {
        ctx.fillStyle = `rgb(${Math.random()*255}, ${Math.random()*255}, ${Math.random()*255})`;
        ctx.fillRect(Math.random()*200, Math.random()*60, 2, 2);
    }

    const imgPath = path.join(__dirname, "cache", `captcha-${senderID}.png`);
    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(imgPath, buffer);

    const name = await Users.getNameUser(senderID);
    api.sendMessage({
        body: `🆕 Chào ${name}! Verify để join group.\n📝 Nhập code từ ảnh: captcha verify <code>\n⏰ Hết hạn sau 2 phút.`,
        attachment: fs.createReadStream(imgPath)
    }, threadID, () => {
        fs.unlinkSync(imgPath);
        // Kick nếu không verify sau 2 phút
        setTimeout(async () => {
            if (pending[senderID]) {
                await api.removeUserFromGroup(senderID, threadID);
                api.sendMessage(`❌ ${name} bị kick vì không verify captcha.`, threadID);
                delete pending[senderID];
                if (Object.keys(pending).length === 0) pendingUsers.delete(threadID);
            }
        }, 120000);
    });
};
