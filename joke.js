const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "joke",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Truyện cười random (nâng cấp: VN/EN, category, lưu yêu thích)",
    commandCategory: "Fun",
    usages: "joke [vn/en] [category: dadjoke/pun/programming/general] [fav]",
    cooldowns: 3,
    dependencies: {
        "axios": ""
    }
};

const favPath = path.join(__dirname, "joke_fav.json");
const vnJokes = [ // Local VN jokes (thêm nhiều hơn nếu cần)
    "Tại sao gà qua đường? Để sang bên kia! 😂",
    "Con cá hỏi con cá khác: 'Mày bơi giỏi thế?' - 'Tao bơi từ nhỏ!' 🐟",
    "Lập trình viên sợ nhất gì? - Bug! 💻"
];

if (!fs.existsSync(favPath)) fs.writeFileSync(favPath, JSON.stringify({}, null, 2));

function loadFav(userID) {
    const allFav = JSON.parse(fs.readFileSync(favPath, 'utf8'));
    return allFav[userID] || [];
}

function saveFav(data) {
    fs.writeFileSync(favPath, JSON.stringify(data, null, 2));
}

function addToFav(userID, joke, category) {
    const fav = loadFav(userID);
    fav.unshift({ joke, category, time: new Date().toLocaleString('vi-VN') });
    fav.length = Math.min(fav.length, 20); // Giữ 20 joke yêu thích
    const allFav = { [userID]: fav };
    Object.assign(allFav, JSON.parse(fs.readFileSync(favPath, 'utf8')));
    saveFav(allFav);
}

async function getJoke(lang = "en", category = "general") {
    if (lang === "vn") {
        return vnJokes[Math.floor(Math.random() * vnJokes.length)]; // Local random
    }
    try {
        const res = await axios.get(`https://v2.jokeapi.dev/joke/${category}?lang=en&type=single`);
        return res.data.joke;
    } catch (e) {
        return "Lỗi lấy joke! Thử lại nhé 😂";
    }
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const lang = args[0]?.toLowerCase() || "en";
    const category = args[1]?.toLowerCase() || "general";
    const cmd = args[args.length - 1]?.toLowerCase();

    if (cmd === "fav" || cmd === "yêu thích") {
        const fav = loadFav(senderID);
        if (fav.length === 0) return api.sendMessage("Chưa có joke yêu thích nào! Reply 'save' dưới joke để lưu.", threadID, messageID);
        let favMsg = "😂 JOKE YÊU THÍCH (5 gần nhất):\n\n";
        for (let f of fav.slice(0, 5)) {
            favMsg += `• ${f.time}: ${f.joke.substring(0, 50)}...\n(${f.category})\n\n`;
        }
        return api.sendMessage(favMsg, threadID, messageID);
    }

    if (!["vn", "en"].includes(lang)) return api.sendMessage("Ngôn ngữ: vn/en", threadID, messageID);
    if (!["general", "dadjoke", "pun", "programming"].includes(category)) return api.sendMessage("Category: general/dadjoke/pun/programming", threadID, messageID);

    const joke = await getJoke(lang, category);
    const emoji = lang === "vn" ? "😂🇻🇳" : "😂🇺🇸";
    const catEmoji = category === "dadjoke" ? "👨‍🦳" : category === "pun" ? "🧠" : category === "programming" ? "💻" : "🎭";

    let msg = `${emoji} JOKE ${lang.toUpperCase()} (${category}):\n\n"${joke}"\n\n${catEmoji} Reply "save" để lưu yêu thích!`;

    return api.sendMessage(msg, threadID, (err, info) => {
        if (err) return;
        global.client.handleReply.push({
            name: module.exports.config.name,
            messageID: info.messageID,
            author: senderID,
            joke: { text: joke, category }
        });
    }, messageID);
};

module.exports.handleReply = async function({ api, event, handleReply }) {
    const { threadID, messageID, senderID, body } = event;
    if (event.senderID !== handleReply.author) return;

    if (body.toLowerCase() === "save") {
        const { text, category } = handleReply.joke;
        addToFav(senderID, text, category);
        return api.sendMessage(`✅ Đã lưu joke "${text.substring(0, 30)}..." (${category}) vào yêu thích!`, threadID, messageID);
    }
};
