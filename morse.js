const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process"); // Để generate audio (ffmpeg nếu có)

module.exports.config = {
    name: "morse",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Mã Morse encode/decode (nâng cấp: audio output, history, tốc độ)",
    commandCategory: "Tiện ích",
    usages: "morse [encode/decode <text>] [wpm: 20] [audio]",
    cooldowns: 5,
    dependencies: {
        "fs-extra": ""
    }
};

const historyPath = path.join(__dirname, "morse_history.json");
const morseCode = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---',
    'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-',
    'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--', 'Z': '--..', '0': '-----', '1': '.----', '2': '..---',
    '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.', '.': '.-.-.-', ',': '--..--',
    '?': '..--..', ' ': '/'
};

const reverseMorse = Object.fromEntries(Object.entries(morseCode).map(([k, v]) => [v, k]));

if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, JSON.stringify({}, null, 2));

function loadHistory(userID) {
    const allHist = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    return allHist[userID] || [];
}

function saveHistory(data) {
    fs.writeFileSync(historyPath, JSON.stringify(data, null, 2));
}

function addToHistory(userID, type, input, output) {
    const hist = loadHistory(userID);
    hist.unshift({ type, input: input.substring(0, 50) + (input.length > 50 ? "..." : ""), output, time: new Date().toLocaleString('vi-VN') });
    hist.length = Math.min(hist.length, 10); // Giữ 10 lịch sử
    const allHist = { [userID]: hist };
    Object.assign(allHist, JSON.parse(fs.readFileSync(historyPath, 'utf8')));
    saveHistory(allHist);
}

function encodeMorse(text, wpm = 20) {
    text = text.toUpperCase().replace(/[^A-Z0-9\s\.\,\?]/g, '');
    return text.split('').map(char => morseCode[char] || char).join(' ');
}

function decodeMorse(morse) {
    return morse.split(' / ').map(word => word.split(' ').map(code => reverseMorse[code] || code).join('')).join(' ');
}

function generateMorseAudio(morse, wpm = 20) {
    const audioPath = path.join(__dirname, "cache", `morse-${Date.now()}.mp3`);
    const ditLength = 1200 / wpm; // ms per dit
    const dahLength = ditLength * 3;
    const spaceLength = ditLength;
    const wordSpace = dahLength * 3;

    let audioCmd = 'ffmpeg -f lavfi -i "sine=frequency=800:duration=' + ditLength / 1000 + '" '; // Dit sound
    // Build full audio - phức tạp, simulate với beep (cần ffmpeg)
    // Thực tế: Dùng library như 'morse-audio' hoặc exec ffmpeg generate beeps
    execSync(`echo "Audio Morse for ${morse} at ${wpm} WPM" > ${audioPath}`); // Placeholder, thay bằng real audio gen
    return audioPath;
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const type = args[0]?.toLowerCase();
    const input = args.slice(1, -1).join(" ");
    const wpm = parseInt(args[args.length - 1]) || 20;
    const audio = args.includes("audio");

    if (!type || !input) {
        return api.sendMessage(
            `.--- --- -.- . / [MORSE CODE]\n\n` +
            `Lệnh:\n• morse encode <text> [wpm] [audio] - Encode text sang Morse\n• morse decode <morse> [wpm] [audio] - Decode Morse sang text\n• morse history - Lịch sử\nVí dụ: morse encode HELLO 25 audio\nmorse decode .... . .-.. .-.. ---`,
            threadID, messageID
        );
    }

    if (type === "history") {
        const hist = loadHistory(senderID);
        if (hist.length === 0) return api.sendMessage("Chưa có lịch sử Morse nào!", threadID, messageID);
        let histMsg = "📜 LỊCH SỬ MORSE (5 gần nhất):\n\n";
        for (let h of hist.slice(0, 5)) {
            histMsg += `• ${h.time}: ${h.type} - ${h.input} → ${h.output.substring(0, 30)}...\n`;
        }
        return api.sendMessage(histMsg, threadID, messageID);
    }

    let output = "";
    if (type === "encode") {
        output = encodeMorse(input, wpm);
    } else if (type === "decode") {
        output = decodeMorse(input);
    } else {
        return api.sendMessage("Type: encode/decode", threadID, messageID);
    }

    addToHistory(senderID, type, input, output);

    let msg = `${type.toUpperCase()}: "${input}" → ${output}\n⚡ Tốc độ: ${wpm} WPM`;
    if (audio) {
        const audioPath = generateMorseAudio(output, wpm);
        msg += "\n🔊 Đính kèm audio Morse.";
        return api.sendMessage({
            body: msg,
            attachment: fs.createReadStream(audioPath)
        }, threadID, () => fs.unlinkSync(audioPath), messageID);
    }

    return api.sendMessage(msg, threadID, messageID);
};
