const axios = require("axios");
const fs = require("fs-extra");

// SOUND CLOUD API KEY RANDOM
const scApiKeys = ["jn6PoPho", "WKd4XzHX", "FI6bX3kC"];
const scApi = scApiKeys[Math.floor(Math.random() * scApiKeys.length)];

module.exports.config = {
    name: "autodow",
    aliases: ["ad", "download", "dl"],
    version: "3.0",
    author: "NamGPT x WolfBot",
    role: 0,
    shortDescription: "Auto tải video từ mọi nền tảng",
    longDescription: "Hỗ trợ TikTok, Instagram, Facebook, YouTube, CapCut, SoundCloud…",
    category: "media",
    guide: "{pn} <link>",
    cooldowns: 2
};

// 📌 STREAM URL → TẢI FILE
const streamURL = async (url, type) => {
    const path = `${__dirname}/cache/${Date.now()}.${type}`;
    const buffer = await axios.get(url, { responseType: "arraybuffer" });
    fs.writeFileSync(path, buffer.data);
    setTimeout(() => fs.unlinkSync(path), 60000);
    return fs.createReadStream(path);
};

// 📌 LẤY INFO TIKTOK
const infoPostTT = async (url) => {
    const res = await axios.post("https://tikwm.com/api/", { url }, {
        headers: { "content-type": "application/json" }
    });
    return res.data.data;
};

module.exports.handleEvent = async function (ctx) {
    try {
        const text = ctx.event.body;
        if (!text) return;

        const send = (msg, at) => ctx.api.sendMessage(msg, ctx.event.threadID, at);
        const links = text.match(/https?:\/\/\S+/g) || [];

        for (const url of links) {

            // ============================
            // 🔥 1. AUTO DOWNLOAD SOUNDCLOUD
            // ============================
            if (/soundcloud/.test(url)) {
                try {
                    const api = `https://nguyenmanh.name.vn/api/scDL?url=${url}&apikey=${scApi}`;
                    const res = await axios.get(api);
                    const s = res.data.result;

                    const path = `${__dirname}/cache/${Date.now()}.mp3`;
                    const audio = await axios.get(s.audio, { responseType: "arraybuffer" });
                    fs.writeFileSync(path, Buffer.from(audio.data));

                    send({
                        body: `[ SOUNDCLOUD ] - DOWNLOAD\n\n📝: ${s.title}\n👍 Like: ${s.data.likes_count}\n💬 Comment: ${s.data.comment_count}\n⏰ Time: ${s.duration}\n\n✔ Tính năng tự động SoundCloud`,
                        attachment: fs.createReadStream(path)
                    });

                    setTimeout(() => fs.unlinkSync(path), 60000);
                } catch (err) {}
            }

            // ============================
            // 🔥 2. AUTO DOWNLOAD TIKTOK
            // ============================
            if (/tiktok\.com/.test(url) || /vm\.tiktok/.test(url)) {
                try {
                    const json = await infoPostTT(url);
                    let attachment = [];

                    if (json.images) {
                        for (const img of json.images) {
                            attachment.push(await streamURL(img, "png"));
                        }
                    } else {
                        attachment = await streamURL(json.play, "mp4");
                    }

                    send({
                        body:
`[ TIKTOK ] - DOWNLOAD

👤 ${json.author.nickname}
📝 ${json.title}

👍 Thả cảm xúc để lấy link tải mp3.
──────────────────────
Tính năng Auto Tiktok.`,
                        attachment
                    }, (err, info) => {
                        global.client.handleReaction.push({
                            name: module.exports.config.name,
                            messageID: info.messageID,
                            author: ctx.event.senderID,
                            data: json
                        });
                    });

                } catch (err) {}
            }

        }

    } catch (err) {}
};


// =========================
// 👍 LẤY NHẠC KHI REACT
// =========================
module.exports.handleReaction = async function (ctx) {
    if (ctx.event.reaction !== "👍") return;
    const data = ctx.handleReaction.data;

    ctx.api.sendMessage({
        body:
`[ TIKTOK ] - MP3

🎵 ${data.music_info.title}
⏰ ${data.music_info.duration}s
🔗 Link: ${data.music_info.play}`,
        attachment: await streamURL(data.music, "mp3")
    }, ctx.event.threadID, ctx.event.messageID);
};


// =========================
// ⚡ LỆNH CHÍNH: /autodow <link>
// =========================
module.exports.onStart = async function ({ message, args }) {

    const url = args[0];
    if (!url) return message.reply("❌ | Vui lòng nhập link cần tải!");

    message.reply("⏳ | Đang tự động tải…");

    try {
        const api = `https://api.vihangayt.com/downloader/allinone?url=${encodeURIComponent(url)}`;
        const res = await axios.get(api);

        if (!res.data || !res.data.data) return message.reply("❌ | Không thể tải!");

        const d = res.data.data;
        let msg =
`✅ TẢI THÀNH CÔNG!

📌 Tiêu đề: ${d.title}
📥 Nguồn: ${d.source}

`;

        if (d?.videos?.[0]?.url) msg += `🎥 Video: ${d.videos[0].url}\n`;
        if (d?.audios?.[0]?.url) msg += `🎵 Audio: ${d.audios[0].url}\n`;

        message.reply(msg);

    } catch {
        message.reply("❌ | API lỗi hoặc đang quá tải!");
    }
};
