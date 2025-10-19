const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "say",
    version: "2.1.0",
    hasPermssion: 0,
    credits: "Kenne400k & Grok (improved with gTTS) && Nnam mod",
    description: "Chuyển văn bản thành giọng nói (TTS) - hỗ trợ đa ngôn ngữ & tốc độ",
    commandCategory: "Tiện ích",
    usages: "say <text> [lang: vi/en/ja/ko/fr/de/es] [speed: slow/normal]",
    cooldowns: 5,
    dependencies: {
        "axios": "",
        "fs-extra": ""
    }
};

module.exports.run = async function({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    if (args.length < 1) {
        return api.sendMessage(
            "🗣️ [ SAY - TEXT TO SPEECH ]\n\n" +
            "Sử dụng: say <text> [lang] [speed]\n" +
            "• lang: vi (Việt), en (Anh), ja (Nhật), ko (Hàn), fr (Pháp), de (Đức), es (Tây Ban Nha)\n" +
            "• speed: slow (chậm) / normal (bình thường - mặc định)\n" +
            "• Giới hạn: Text ≤ 200 ký tự\nVí dụ: say Xin chào thế giới en slow",
            threadID, messageID
        );
    }

    const text = args.slice(0, -2).join(" "); // Lấy text trước lang và speed
    if (text.length > 200) {
        return api.sendMessage("❌ Text quá dài (>200 ký tự)! Hãy rút gọn.", threadID, messageID);
    }

    const langArg = args[args.length - 2] || "vi";
    const speedArg = args[args.length - 1] || "normal";
    const supportedLang = {
        "vi": "vi", "en": "en", "ja": "ja", "ko": "ko",
        "fr": "fr", "de": "de", "es": "es"
    };
    const langCode = supportedLang[langArg] || "vi";
    const speed = speedArg === "slow" ? 0.5 : 1; // Slow: tts chậm hơn (thao tác rate nếu cần, nhưng gTTS cơ bản)

    const cachePath = path.join(__dirname, "cache", `say-${senderID}-${Date.now()}.mp3`);

    try {
        // gTTS URL với lang và text (slow/fast qua param nếu API hỗ trợ, hoặc dùng rate post-process nếu cần)
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${langCode}&client=tw-ob&q=${encodeURIComponent(text)}&ttsspeed=${speed}`;
        const res = await axios.get(url, { responseType: "arraybuffer" });
        fs.writeFileSync(cachePath, res.data);

        const langName = { "vi": "Tiếng Việt", "en": "Tiếng Anh", "ja": "Tiếng Nhật", "ko": "Tiếng Hàn", "fr": "Tiếng Pháp", "de": "Tiếng Đức", "es": "Tiếng Tây Ban Nha" }[langCode] || langCode;

        api.sendMessage({
            body: `🗣️ "${text}"\n🌍 Ngôn ngữ: ${langName}\n⚡ Tốc độ: ${speedArg}\n(Độ dài: ${text.length}/200 ký tự)`,
            attachment: fs.createReadStream(cachePath)
        }, threadID, () => fs.unlinkSync(cachePath), messageID);
    } catch (e) {
        console.error("[SAY] Lỗi TTS:", e);
        if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
        api.sendMessage(`❌ Lỗi tạo giọng nói: ${e.message}\nKiểm tra text/lang hợp lệ!`, threadID, messageID);
    }
};
