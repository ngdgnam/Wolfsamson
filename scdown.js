const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "scdown",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "Nguyễn Đức Tài && Nnam mod (JS port from Python)",
    description: "Tải file nhạc từ link SoundCloud (dùng HungDev API)",
    commandCategory: "Media",
    usages: "scdown <link SoundCloud>",
    cooldowns: 5,
    dependencies: {
        "axios": "",
        "fs-extra": ""
    }
};

async function getFileSize(url) {
    try {
        const response = await axios.head(url, { timeout: 10000 });
        const size = response.headers.get('Content-Length');
        return size ? parseInt(size, 10) : null;
    } catch {
        return null;
    }
}

module.exports.run = async function({ api, event, args, Threads, Users }) {
    const { threadID, messageID, senderID } = event;
    const content = args.join(" ").trim();
    const apiUrl = "http://www.hungdev.id.vn/media/downaio";
    const apiKey = "HUNGDEV_0gqPbq769Z";

    if (content.length < 2) {
        return api.sendMessage("Vui lòng nhập một đường link SoundCloud hợp lệ.", threadID, messageID);
    }

    const linksound = content.trim();
    if (!linksound.startsWith("https://")) {
        return api.sendMessage("Vui lòng nhập một đường link SoundCloud hợp lệ.", threadID, messageID);
    }

    try {
        const response = await axios.get(apiUrl, {
            params: {
                apikey: apiKey,
                url: linksound
            },
            timeout: 15000
        });

        const data = response.data;
        if (!data.success) {
            return api.sendMessage("API trả về kết quả không thành công. Thử link khác.", threadID, messageID);
        }

        const medias = data.data.medias || [];
        if (!Array.isArray(medias) || medias.length === 0) {
            return api.sendMessage("Không tìm thấy file nhạc từ link này.", threadID, messageID);
        }

        const media = medias[0];
        const voiceUrl = media.url;
        const extension = media.extension || "mp3";
        const duration = data.data.duration || "0:00";
        const titlesound = data.data.title || "Không có tiêu đề";

        const sendtitle = `Tiêu đề: ${titlesound}.${extension} (Thời lượng: ${duration})\nBot đang tiến hành gửi file nhạc vui lòng chờ :3 :3 :3`;

        await api.sendMessage(sendtitle, threadID);

        const fileSize = await getFileSize(voiceUrl);
        const fileName = `${titlesound}.${extension}`;

        // Gửi file từ URL
        await api.sendMessage({
            body: "Đã tải thành công!",
            attachment: [{
                url: voiceUrl,
                filename: fileName,
                contentType: `audio/${extension}`,
                fileSize: fileSize || undefined
            }]
        }, threadID, messageID);

    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            return api.sendMessage("Timeout khi gọi API. Thử lại sau.", threadID, messageID);
        }
        console.error("[SCDOWN] Lỗi:", error.message);
        return api.sendMessage(`Đã xảy ra lỗi: ${error.message}`, threadID, messageID);
    }
};
