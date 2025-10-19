const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "random",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Random quotes/images/memes (nâng cấp: API realtime, lưu yêu thích)",
    commandCategory: "Tiện ích",
    usages: "random [quote|image|meme|fav|help]",
    cooldowns: 3,
    dependencies: {
        "axios": ""
    }
};

const favPath = path.join(__dirname, "random_fav.json");

function loadFav(userID) {
    if (!fs.existsSync(favPath)) fs.writeFileSync(favPath, JSON.stringify({}, null, 2));
    const allFav = JSON.parse(fs.readFileSync(favPath, 'utf8'));
    allFav[userID] = allFav[userID] || [];
    return allFav;
}

function saveFav(data) {
    fs.writeFileSync(favPath, JSON.stringify(data, null, 2));
}

function addToFav(userID, type, content) {
    const fav = loadFav(userID);
    fav[userID].unshift({ type, content, time: new Date().toLocaleString('vi-VN') });
    fav[userID] = fav[userID].slice(0, 20); // Giữ 20 yêu thích gần nhất
    saveFav(fav);
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const type = args[0]?.toLowerCase() || "quote";
    const name = await Users.getNameUser(senderID);

    switch (type) {
        case "quote":
            try {
                const res = await axios.get("https://api.quotable.io/random?tags=inspirational");
                const quote = res.data.content;
                const author = res.data.author;
                const msg = `💭 Quote ngẫu nhiên:\n"${quote}"\n\n👤 ${author}\n\nReply "random fav quote" để lưu yêu thích.`;
                addToHistory(senderID, "quote", quote); // Nếu có history module
                return api.sendMessage(msg, threadID, (err, info) => {
                    if (err) return;
                    global.client.handleReply.push({
                        name: module.exports.config.name,
                        messageID: info.messageID,
                        author: senderID,
                        content: { type: "quote", text: quote }
                    });
                }, messageID);
            } catch (e) {
                return api.sendMessage("❌ Lỗi lấy quote!", threadID, messageID);
            }

        case "image":
            try {
                const subreddits = ["EarthPorn", "NatureIsFuckingLit"]; // Random nature images
                const randomSub = subreddits[Math.floor(Math.random() * subreddits.length)];
                const res = await axios.get(`https://www.reddit.com/r/${randomSub}/random.json`);
                const post = res.data[0].data.children[0].data;
                const imgUrl = post.url_overridden_by_dest || post.preview?.images[0]?.source?.url?.replace(/&amp;/g, '&');
                const msg = `🖼️ Hình ảnh ngẫu nhiên từ r/${randomSub}:\n${post.title}\n\nReply "random fav image" để lưu.`;
                return api.sendMessage({
                    body: msg,
                    attachment: await downloadImage(imgUrl, senderID)
                }, threadID, messageID);
            } catch (e) {
                return api.sendMessage("❌ Lỗi lấy hình ảnh!", threadID, messageID);
            }

        case "meme":
            try {
                const res = await axios.get("https://meme-api.com/gimme");
                const meme = res.data;
                const msg = `😂 Meme ngẫu nhiên:\n${meme.title}\n\nReply "random fav meme" để lưu.`;
                return api.sendMessage({
                    body: msg,
                    attachment: await downloadImage(meme.url, senderID)
                }, threadID, messageID);
            } catch (e) {
                return api.sendMessage("❌ Lỗi lấy meme!", threadID, messageID);
            }

        case "fav":
        case "yêu thích":
            const favType = args[1]?.toLowerCase();
            const fav = loadFav(senderID);
            if (fav[senderID].length === 0) return api.sendMessage("Chưa có yêu thích nào!", threadID, messageID);
            let favMsg = "❤️ YÊU THÍCH CỦA BẠN (5 gần nhất):\n\n";
            for (let f of fav[senderID].slice(0, 5)) {
                favMsg += `• ${f.time}: ${f.type} - ${f.content.substring(0, 50)}...\n`;
            }
            return api.sendMessage(favMsg, threadID, messageID);

        case "help":
        default:
            return api.sendMessage(
                `🎲 [ RANDOM - NGẪU NHIÊN ]\n\n` +
                `Lệnh:\n• random quote - Quote truyền cảm hứng\n• random image - Hình ảnh đẹp\n• random meme - Meme hài hước\n• random fav - Xem yêu thích\n\nReply "random fav <type>" để lưu item hiện tại.\nVí dụ: random quote`,
                threadID, messageID
            );
    }
};

async function downloadImage(url, senderID) {
    const imgPath = path.join(__dirname, "cache", `random-${senderID}-${Date.now()}.jpg`);
    const res = await axios.get(url, { responseType: "arraybuffer" });
    fs.writeFileSync(imgPath, res.data);
    return fs.createReadStream(imgPath);
}

module.exports.handleReply = async function({ api, event, handleReply }) {
    const { threadID, messageID, senderID, body } = event;
    if (body.toLowerCase().startsWith("random fav")) {
        const favType = body.split(" ")[2] || "quote";
        const content = handleReply.content.text || "Item hiện tại";
        addToFav(senderID, favType, content);
        return api.sendMessage(`✅ Đã lưu "${content.substring(0, 30)}..." vào yêu thích (${favType})!`, threadID, messageID);
    }
};
