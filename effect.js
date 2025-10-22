const fs = require("fs-extra");

module.exports.config = {
    name: "effect",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "Nnam mod (Messenger power_up effects)",
    description: "Gửi tin nhắn với hiệu ứng Messenger (Lửa, Trái tim, Quà, Lấp lánh)",
    commandCategory: "Tiện ích",
    usages: "effect [fire|heart|gift|sparkle] <text>",
    cooldowns: 5
};

const effects = {
    fire: { power_up_style: 4, emoji: "🔥", name: "Lửa" },
    heart: { power_up_style: 1, emoji: "💖", name: "Trái tim" },
    gift: { power_up_style: 2, emoji: "🎁", name: "Quà" },
    sparkle: { power_up_style: 3, emoji: "✨", name: "Lấp lánh" }
};

module.exports.run = async function({ api, event, args }) {
    const { threadID, messageID } = event;
    const effectType = args[0]?.toLowerCase();
    const text = args.slice(1).join(" ");

    if (!effectType || !effects[effectType] || !text) {
        let helpMsg = `✨ [ HIỆU ỨNG TIN NHẮN MESSENGER ]\n\n`;
        helpMsg += `Sử dụng: effect [fire|heart|gift|sparkle] <text>\n\n`;
        Object.entries(effects).forEach(([key, val]) => {
            helpMsg += `• ${key}: ${val.emoji} ${val.name}\n`;
        });
        helpMsg += `\nVí dụ: effect fire Chúc mừng sinh nhật!\n\n⚠️ Hiệu ứng dựa power_up payload (có thể fail nếu FB update).`;
        return api.sendMessage(helpMsg, threadID, messageID);
    }

    const { power_up_style, emoji, name } = effects[effectType];
    const metadata = {
        power_up: {
            power_up_style: power_up_style
        }
    };

    try {
        await api.sendMessage({
            body: `${emoji} ${text}`,
            metadata: metadata
        }, threadID);
        return api.sendMessage(`✅ Đã gửi "${text}" với hiệu ứng ${name}! (Style ID: ${power_up_style})`, threadID);
    } catch (error) {
        console.error("[EFFECT] Lỗi gửi:", error);
        // Fallback: Gửi text + emoji
        await api.sendMessage(`${emoji} ${text}`, threadID);
        return api.sendMessage(`⚠️ Power_up metadata fail (FB update?): ${error.message}. Dùng fallback emoji.`, threadID);
    }
};
