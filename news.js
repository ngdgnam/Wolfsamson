const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const moment = require("moment-timezone");

module.exports.config = {
    name: "news",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Tin tức realtime (nâng cấp: RSS feed VN/global, filter category, lưu đọc sau)",
    commandCategory: "Tiện ích",
    usages: "news [category: vn/world/tech | latest | saved]",
    cooldowns: 10,
    dependencies: {
        "axios": "",
        "moment-timezone": ""
    }
};

const savedPath = path.join(__dirname, "news_saved.json");
const rssSources = {
    vn: "https://vnexpress.net/rss/tin-moi-nhat.rss", // VNExpress
    world: "https://vnexpress.net/rss/the-gioi.rss",
    tech: "https://vnexpress.net/rss/so-hoa.rss"
};

if (!fs.existsSync(savedPath)) fs.writeFileSync(savedPath, JSON.stringify({}, null, 2));

function loadSaved(userID) {
    const allSaved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
    return allSaved[userID] || [];
}

function saveSaved(data) {
    fs.writeFileSync(savedPath, JSON.stringify(data, null, 2));
}

function addToSaved(userID, article) {
    const saved = loadSaved(userID);
    saved.unshift(article);
    saved.length = Math.min(saved.length, 20); // Giữ 20 bài gần nhất
    const allSaved = { [userID]: saved }; // Update only this user
    Object.assign(allSaved, JSON.parse(fs.readFileSync(savedPath, 'utf8')));
    saveSaved(allSaved);
}

async function fetchRSS(url) {
    try {
        const res = await axios.get(url);
        const parser = new DOMParser(); // Cần thêm xml2js hoặc rss-parser: npm i rss-parser
        const feed = await parseString(res.data); // Giả sử dùng rss-parser
        return feed.items.slice(0, 5); // 5 bài mới nhất
    } catch (e) {
        return null;
    }
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const category = args[0]?.toLowerCase() || "vn";
    const name = await Users.getNameUser(senderID);

    if (category === "saved") {
        const saved = loadSaved(senderID);
        if (saved.length === 0) return api.sendMessage("Chưa lưu bài nào! Reply 'save' dưới bài tin để lưu.", threadID, messageID);
        let savedMsg = "📰 BÀI ĐÃ LUU (5 gần nhất):\n\n";
        for (let article of saved.slice(0, 5)) {
            const time = moment(article.pubDate).tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY HH:mm');
            savedMsg += `• ${time}: ${article.title.substring(0, 50)}...\n${article.link}\n\n`;
        }
        return api.sendMessage(savedMsg, threadID, messageID);
    }

    const source = rssSources[category] || rssSources.vn;
    const articles = await fetchRSS(source);
    if (!articles) return api.sendMessage(`❌ Lỗi lấy tin ${category}!`, threadID, messageID);

    let newsMsg = `📰 TIN TỨC ${category.toUpperCase()} (5 bài mới nhất):\n\n`;
    articles.forEach((article, i) => {
        const time = moment(article.pubDate).tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY HH:mm');
        newsMsg += `${i+1}. ${article.title}\n⏰ ${time}\n🔗 ${article.link}\n\n`;
        newsMsg += `Reply "${i+1} save" để lưu bài này.`;
    });

    return api.sendMessage(newsMsg, threadID, (err, info) => {
        if (err) return;
        global.client.handleReply.push({
            name: module.exports.config.name,
            messageID: info.messageID,
            author: senderID,
            articles
        });
    }, messageID);
};

module.exports.handleReply = async function({ api, event, handleReply }) {
    const { threadID, messageID, senderID, body } = event;
    if (event.senderID !== handleReply.author) return;

    const match = body.match(/^(\d+)\s+save$/i);
    if (match) {
        const idx = parseInt(match[1]) - 1;
        const article = handleReply.articles[idx];
        if (!article) return api.sendMessage("Bài không tồn tại!", threadID, messageID);
        addToSaved(senderID, article);
        return api.sendMessage(`✅ Đã lưu "${article.title.substring(0, 50)}..." vào yêu thích!`, threadID, messageID);
    }
};
