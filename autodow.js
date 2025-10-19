const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const autodownConfig = {
    name: "autodown",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Nnam (mod lại từ gaudev & Grok (improved))",
    description: "Bật/tắt tự động tải video/ảnh từ nhiều nền tảng với quản lý trạng thái per-thread",
    commandCategory: "Tiện ích",
    usages: "autodown [on/off] hoặc autodown menu",
    cooldowns: 5,
    dependencies: { "axios": "", "fs-extra": "" }
};

const cacheDirectory = (() => {
    const dir = path.join(__dirname, "cache");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
})();

const stateFile = path.join(cacheDirectory, "autodown_state.json");
const persistState = obj => fs.writeFileSync(stateFile, JSON.stringify(obj, null, 4));
const retrieveState = () => {
    if (!fs.existsSync(stateFile)) persistState({});
    return JSON.parse(fs.readFileSync(stateFile));
};

module.exports.config = autodownConfig;

module.exports.run = async function ({ api, event, args }) {
    const { threadID } = event;
    const currentState = retrieveState();
    currentState[threadID] = currentState[threadID] || { enabled: true };

    if (args[0] === "menu") {
        const status = currentState[threadID].enabled ? "✅ BẬT" : "❌ TẮT";
        return api.sendMessage(`[AUTODOWN STATUS]\nTrạng thái hiện tại: ${status}\n\nSử dụng: autodown [on/off/menu]`, threadID);
    }

    currentState[threadID].enabled = !currentState[threadID].enabled;
    persistState(currentState);
    const action = currentState[threadID].enabled ? "Bật" : "Tắt";
    return api.sendMessage(`Đã ${action} tự động tải link ${action === "Bật" ? "✅" : "❌"}`, threadID);
};

module.exports.handleEvent = async function ({ api, event }) {
    const { threadID, messageID, body } = event;
    if (!body) return;

    const currentState = retrieveState();
    currentState[threadID] = currentState[threadID] || { enabled: true };
    if (!currentState[threadID].enabled) return;

    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const detectedURLs = body.match(urlPattern);
    if (!detectedURLs) return;

    const firstURL = detectedURLs[0].replace(/[^a-zA-Z0-9:\\/\\.\\-_?&=]/g, "");
    const supportedDomains = [
        "youtube.com", "yt.be", "youtu.be",
        "facebook.com", "instagram.com", "threads.net",
        "v.douyin.com", "tiktok.com", "vt.tiktok.com", "www.tiktok.com",
        "capcut.com", "douyin.com"
    ];
    if (!supportedDomains.some(domain => firstURL.includes(domain))) return;

    console.log(`[AUTODOWN] Đã phát hiện liên kết: ${firstURL}`);

    const fetchMedia = async (url, mediaType, fileExtension) => {
        const filePath = path.join(cacheDirectory, `${mediaType}_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExtension}`);
        try {
            const fileData = await axios.get(url, { 
                responseType: "arraybuffer",
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept-Language': 'vi-VN, en-US'
                }
            });
            fs.writeFileSync(filePath, Buffer.from(fileData.data, "binary"));
            return { path: filePath, stream: fs.createReadStream(filePath) };
        } catch (err) {
            console.error(`[AUTODOWN] Lỗi tải media: ${url}`, err.message);
            return null;
        }
    };

    const cleanup = (attachments) => {
        if (Array.isArray(attachments)) {
            attachments.forEach(att => {
                if (att && att.path && fs.existsSync(att.path)) {
                    fs.unlink(att.path, (err) => { if (err) console.error(err); });
                }
            });
        } else if (attachments && attachments.path && fs.existsSync(attachments.path)) {
            fs.unlink(attachments.path, (err) => { if (err) console.error(err); });
        }
    };

    try {
        const apiURL = `https://api.lunarkrystal.site/download?url=${encodeURIComponent(firstURL)}`;
        const { data: { data } } = await axios.get(apiURL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept-Language': 'vi-VN, en-US'
            }
        });

        if (!data || (!data.media_urls?.length && !data.medias?.length)) {
            console.log(`[AUTODOWN] Không có media cho: ${firstURL}`);
            return;
        }

        const mediaList = data.media_urls || data.medias;
        const imageAttachments = [];
        const videoAttachments = [];
        let videoCount = 0;

        for (const media of mediaList) {
            const { type, url } = media;
            let att = await fetchMedia(url, type || "media", type === "video" ? "mp4" : "jpg");
            if (!att) continue;

            if (type === "image" || type === "photo") {
                imageAttachments.push(att.stream);
            } else if ((type === "video" || type === "mp4") && videoCount < 1) {
                videoAttachments.push(att.stream);
                videoCount++;
            }
        }

        console.log(`[AUTODOWN] Đã tải xuống liên kết: ${firstURL}`);
        console.log(`[AUTODOWN] Bắt đầu gửi file... (Images: ${imageAttachments.length}, Videos: ${videoAttachments.length})`);

        const source = (data.source || "Unknown").toUpperCase();
        const author = data.author || "Không rõ";
        const title = data.title || "Không có tiêu đề";

        if (imageAttachments.length > 0) {
            const imageMessage = `[${source}] - Tự Động Tải Ảnh\n\n👤 Tác giả: ${author}\n💬 Tiêu đề: ${title}`;
            const info = await api.sendMessage({ body: imageMessage, attachment: imageAttachments }, threadID, messageID);
            cleanup(imageAttachments);
        }

        if (videoAttachments.length > 0) {
            const videoMessage = `[${source}] - Tự Động Tải Video\n\n👤 Tác giả: ${author}\n💬 Tiêu đề: ${title}`;
            const info = await api.sendMessage({ body: videoMessage, attachment: videoAttachments[0] }, threadID, messageID);
            cleanup(videoAttachments[0]);
        }
    } catch (err) {
        console.error("[AUTODOWN] Lỗi xử lý:", firstURL, err.message);
    }
};
