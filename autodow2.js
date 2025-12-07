const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "autodown",
    version: "2.0.0",
    hasPermssion: 0,
    credits: "WolfBot Team",
    description: "Tự động tải nền tảng",
    commandCategory: "Tiện ích",
    usages: "[link] hoặc bật/tắt",
    cooldowns: 3
};

// ====== TẠO CACHE + STATE ======
const cacheDir = path.join(__dirname, "cache");
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

const stateFile = path.join(cacheDir, "autodown_state.json");
if (!fs.existsSync(stateFile)) fs.writeFileSync(stateFile, "{}");

const loadState = () => JSON.parse(fs.readFileSync(stateFile));
const saveState = (data) => fs.writeFileSync(stateFile, JSON.stringify(data, null, 4));

// ====== BẬT / TẮT ======
module.exports.run = async ({ api, event }) => {
    const threadID = event.threadID;
    let state = loadState();

    if (!state[threadID]) state[threadID] = { enabled: true };
    state[threadID].enabled = !state[threadID].enabled;

    saveState(state);

    return api.sendMessage(
        `⚡ AutoDown: ${state[threadID].enabled ? "BẬT" : "TẮT"} thành công.`,
        threadID
    );
};

// ====== XỬ LÝ TỰ ĐỘNG ======
module.exports.handleEvent = async ({ api, event }) => {
    const { threadID, messageID, body } = event;

    if (!body) return;

    // Trạng thái
    let state = loadState();
    if (!state[threadID]) state[threadID] = { enabled: true };
    if (!state[threadID].enabled) return;

    // Phát hiện link
    const links = body.match(/(https?:\/\/[^\s]+)/g);
    if (!links) return;

    const url = links[0];

    // Các nền tảng hỗ trợ
    const supported = [
        "tiktok.com", "douyin.com", "facebook.com", "instagram.com",
        "threads.net", "youtube.com", "youtu.be", "capcut.com"
    ];

    if (!supported.some(domain => url.includes(domain))) return;

    console.log("› [AUTODOWN] Detect:", url);

    // ====== API DOWNLOAD (CHỈ SỬA 1 DÒNG) ======
    const apiURL = `https://api.lunarkrystal.site/download?url=${encodeURIComponent(url)}`;

    try {
        const res = await axios.get(apiURL);
        const data = res.data.data;

        if (!data) return;

        const medias = data.media_urls || data.medias || [];
        const images = [];
        let video = null;

        const download = async (link, ext) => {
            const file = path.join(cacheDir, `${Date.now()}.${ext}`);
            const buff = await axios.get(link, { responseType: "arraybuffer" });
            fs.writeFileSync(file, buff.data);
            return fs.createReadStream(file);
        };

        for (const m of medias) {
            if (m.type === "image") images.push(await download(m.url, "jpg"));
            if (m.type === "video" && !video) video = await download(m.url, "mp4");
        }

        const head = `[${(data.source || "UNKNOWN").toUpperCase()}] AUTODOWN`;

        // Ảnh
        if (images.length) {
            await api.sendMessage(
                {
                    body: `${head}\n\nẢnh của: ${data.author || "Không rõ"}`,
                    attachment: images
                },
                threadID, messageID
            );
        }

        // Video
        if (video) {
            await api.sendMessage(
                {
                    body: `${head}\n\nVideo: ${data.title || "Không tiêu đề"}`,
                    attachment: video
                },
                threadID, messageID
            );
        }

        console.log("› [AUTODOWN] Done:", url);

    } catch (err) {
        console.log("[AUTODOWN] ERROR:", err);
    }
};
