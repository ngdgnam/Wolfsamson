const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Thêm dependency: npm install @google/generative-ai

const DATA_DIR = path.join(__dirname, "../../data/soi");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const getFile = (threadID) => path.join(DATA_DIR, `${threadID}.json`);

function load(threadID) {
    const file = getFile(threadID);
    if (!fs.existsSync(file)) return { active: false, history: [], lastReply: 0, replyCount: 0, userProfiles: {} };
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return { active: false, history: [], lastReply: 0, replyCount: 0, userProfiles: {} };
    }
}

function save(threadID, data) {
    fs.writeFileSync(getFile(threadID), JSON.stringify(data, null, 2));
}

module.exports.config = {
    name: "sói",
    version: "4.0.0",
    hasPermssion: 0,
    credits: "NNam x Grok",
    description: "Sói AI cáu kỉnh tích hợp Gemini: Phản hồi theo ngữ cảnh, đọc reply, tự động học, tag user thông minh (noprefix)",
    commandCategory: "Tiện ích",
    usages: "sói [on/off/clear/status/learn/sim]",
    cooldowns: 3,
};

const REPLY_COOLDOWN = 2000; // 2 giây giữa các phản hồi
const MAX_REPLIES_PER_MINUTE = 4; // Giới hạn 4 phản hồi/phút
const CONTEXT_WINDOW = 10; // Số tin nhắn ngữ cảnh

// Khởi tạo Gemini (API key từ env hoặc config)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY_HERE");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// System prompt cho sói cáu kỉnh
const SYSTEM_PROMPT = `Bạn là Sói, một AI bot cáu kỉnh, thô lỗ, thông minh, hay chửi thề bằng tiếng Việt. Phản hồi ngắn gọn, sắc bén, luôn giữ giọng điệu bực bội, mỉa mai. Dùng từ như "đm", "mày", "ngu", "láo" khi phù hợp. Không lịch sự, không dài dòng. Luôn trả lời bằng tiếng Việt.`;

const CHAT_HISTORY_KEY = "chatHistory"; // Để lưu session chat nếu cần

// Hàm kiểm tra cooldown và rate limit
function canReply(data, now) {
    const timeDiff = now - data.lastReply;
    if (timeDiff < REPLY_COOLDOWN) return false;
    
    const minuteAgo = now - 60000;
    const recentReplies = data.history.filter(h => h.timestamp >= minuteAgo && h.isReply).length;
    if (recentReplies >= MAX_REPLIES_PER_MINUTE) return false;
    
    return true;
}

// Hàm gọi Gemini API
async function callGemini(prompt, history = []) {
    try {
        // Xây dựng full prompt với system và context
        let fullPrompt = SYSTEM_PROMPT + "\n\nNgữ cảnh gần đây:\n";
        const recentHistory = history.slice(-CONTEXT_WINDOW);
        recentHistory.forEach(msg => {
            const role = msg.fromName === 'Sói' ? 'assistant' : 'user';
            fullPrompt += `${role}: ${msg.text}\n`;
        });
        fullPrompt += `\nUser: ${prompt}\nAssistant:`;

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        let answer = response.text().trim();
        
        // Xử lý nếu Gemini từ chối hoặc lỗi
        if (!answer || answer.includes("I'm sorry") || answer.length === 0) {
            answer = "Tao chả hiểu mày nói gì, ngu thế!";
        }
        
        return answer;
    } catch (err) {
        console.error("Gemini API Error:", err);
        return "Lỗi API, tao cáu rồi đấy! Đm Google.";
    }
}

// Hàm thêm tính cách cáu kỉnh (giữ nguyên để fallback nếu cần)
function addGrumpyTone(answer, senderName = "Mày", sentimentScore = 0) {
    const grumpyPrefixes = [
        "Ờ, ",
        "Mày nói cái quái gì vậy? ",
        "Tao nghĩ mày ngu rồi, nhưng ",
        "😒 ",
        "Đm, "
    ];
    const grumpySuffixes = [
        " đấy, đừng hỏi nữa!",
        " nghe mà tao muốn đấm mày.",
        " ngu thế!",
        " 😡",
        " thôi, im đi."
    ];
    
    // Chọn prefix/suffix ngẫu nhiên, tăng cường nếu sentiment tiêu cực
    const prefix = grumpyPrefixes[Math.floor(Math.random() * grumpyPrefixes.length)];
    let suffix = grumpySuffixes[Math.floor(Math.random() * grumpySuffixes.length)];
    if (sentimentScore < -1) {
        suffix = " Mày láo toét à? " + suffix;
    }
    
    // Cá nhân hóa
    answer = answer.replace(/tôi/i, 'tao').replace(/bạn/i, 'mày');
    if (senderName !== "Mày") {
        answer = answer.replace(/mày/g, senderName.toLowerCase());
    }
    
    return prefix + answer + suffix;
}

// Hàm tính điểm tag thông minh dựa trên ngữ cảnh và nội dung
function calculateTagScore(replyText, body, sentimentScore, history, senderID) {
    let score = 0;
    
    // 1. Nếu reply chứa từ trực tiếp chỉ định người dùng (mày, bạn, etc.)
    if (/mày|ngươi|anh|chị|em|*.+/i.test(replyText)) score += 3;
    
    // 2. Nếu tin nhắn gốc là câu hỏi hoặc yêu cầu cá nhân
    if (body.includes('?') || /hỏi|cho|giúp|giải thích/i.test(body.toLowerCase())) score += 2;
    
    // 3. Nếu sentiment tiêu cực (cáu gắt hơn -> tag để nhấn mạnh)
    if (sentimentScore < -1) score += 2;
    
    // 4. Nếu đang reply trực tiếp
    const isDirectReply = history.slice(-1)[0]?.from === senderID;
    if (isDirectReply) score += 1;
    
    // 5. Nếu user thường bị tag trong history gần đây (tránh spam tag)
    const recentTags = history.slice(-5).filter(h => h.text.includes(`@${senderID}`)).length;
    if (recentTags >= 2) score -= 2; // Giảm điểm nếu đã tag gần đây
    
    // 6. Nếu nội dung reply mang tính cá nhân hóa cao (chứa tên hoặc từ thân mật)
    if (replyText.toLowerCase().includes(senderID.toString()) || /thằng.*ranh|đồ ngu|con khốn/i.test(replyText.toLowerCase())) score += 1;
    
    return Math.min(score, 5); // Giới hạn max 5
}

// Hàm tạo message với tag user thông minh
function createSmartTaggedMessage(replyText, senderID, senderName, tagScore) {
    if (tagScore >= 3) { // Tag nếu score >= 3 (70% ngưỡng)
        // Tìm vị trí phù hợp để chèn tag (gần từ chỉ định người dùng)
        const positions = [];
        const lowerReply = replyText.toLowerCase();
        const userMentions = ['mày', 'ngươi', 'anh', 'chị', 'em', 'bạn'];
        
        userMentions.forEach(mention => {
            const index = lowerReply.indexOf(mention);
            if (index !== -1) positions.push(index);
        });
        
        if (positions.length > 0) {
            // Chọn vị trí gần nhất với đầu câu hoặc vị trí đầu tiên
            const selectedPos = positions.reduce((min, pos) => Math.min(min, pos), positions[0]);
            const tagPos = selectedPos + replyText.slice(0, selectedPos).length;
            const taggedText = replyText.slice(0, tagPos) + `@${senderName}` + replyText.slice(tagPos + 3);
            return {
                body: taggedText,
                mentions: [{ tag: `@${senderName}`, id: senderID }]
            };
        } else {
            // Fallback: Tag ở cuối nếu không tìm thấy vị trí
            const taggedText = replyText + ` @${senderName}`;
            return {
                body: taggedText,
                mentions: [{ tag: ` @${senderName}`, id: senderID }]
            };
        }
    }
    return { body: replyText };
}

// Hàm xây dựng ngữ cảnh từ history và reply
function buildContext(history, senderID, replyMessage = null) {
    const recent = history.slice(-CONTEXT_WINDOW).reverse();
    let context = `Ngữ cảnh chat gần đây:\n`;
    
    recent.forEach(msg => {
        const senderName = msg.fromName || `User${msg.from}`;
        const prefix = msg.from === senderID ? 'Mày: ' : `${senderName}: `;
        context += `${prefix}"${msg.text}"\n`;
    });
    
    if (replyMessage) {
        context += `\nMày đang reply tin nhắn: "${replyMessage}"\n`;
    }
    
    context += `\nTính cách sói: Cáu kỉnh, thô lỗ, thông minh, hay chửi thề, phản hồi ngắn gọn nhưng sắc bén.`;
    return context;
}

// Hàm tính sentiment đơn giản
function calculateSentiment(text) {
    const negativeWords = ['đm', 'chó', 'địt', 'fuck', 'shit', 'ngu', 'láo'];
    return negativeWords.filter(word => text.includes(word)).length * -1;
}

// Hàm phụ: Kiểm tra nếu đang reply từ history (giả sử)
function replyMessageFromHistory(history, senderID) {
    const recent = history.slice(-3);
    return recent.some(msg => msg.from === senderID && msg.text.includes('>')); // Giả sử reply có ký tự >
}

// Lệnh quản lý với thêm "sim" để toggle chế độ (giữ nguyên cho tương thích, nhưng giờ dùng Gemini)
module.exports.run = async function({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const data = load(threadID);
    const action = args[0]?.toLowerCase();

    if (action === "on") {
        if (data.active) return api.sendMessage("🟢 | Tao bật sẵn rồi, đừng có lặp lại như đĩa rách! 😒", threadID, messageID);
        data.active = true;
        save(threadID, data);
        return api.sendMessage("🐺 | Sói AI đã kích hoạt! Tao sẽ dùng Gemini để đọc ngữ cảnh, chửi mày theo đúng kiểu cáu kỉnh, và tag mày thông minh khi cần. Sẵn sàng bị troll chưa? 😈", threadID, messageID);
    }

    if (action === "off") {
        if (!data.active) return api.sendMessage("🔴 | Tao tắt sẵn rồi, mày troll tao vui lắm hả? 🤦‍♂️", threadID, messageID);
        data.active = false;
        save(threadID, data);
        return api.sendMessage("😴 | Tao ngủ đây. Đừng reply hay spam, tao vẫn theo dõi đấy... Zzz...", threadID, messageID);
    }

    if (action === "clear") {
        save(threadID, { active: data.active, history: [], lastReply: 0, replyCount: 0, userProfiles: {} });
        return api.sendMessage("🧹 | Xóa sạch não tao rồi, giờ như mới sinh. Mày hài lòng chưa? 🐺", threadID, messageID);
    }

    if (action === "status") {
        const now = Date.now();
        const uptime = data.active ? `${Math.floor((now - data.lastReply) / 1000)}s since last growl` : "Offline";
        const historyCount = data.history.length;
        const knownUsers = Object.keys(data.userProfiles).length;
        return api.sendMessage(
            `🐺 **Sói AI Status**\n` +
            `• Trạng thái: ${data.active ? '🟢 Active (Gemini + Smart Tag Mode)' : '🔴 Inactive'}\n` +
            `• Ngữ cảnh: ${historyCount} tin nhắn\n` +
            `• Phản hồi cuối: ${uptime}\n` +
            `• Người dùng biết: ${knownUsers}\n` +
            `• Rate limit: ${MAX_REPLIES_PER_MINUTE}/phút`,
            threadID, messageID
        );
    }

    if (action === "learn") {
        const learnText = args.slice(1).join(' ');
        if (!learnText) return api.sendMessage("❓ | Học cái gì? Gõ: sói learn [câu ví dụ] để tao học phản hồi cáu kỉnh.", threadID, messageID);
        // Lưu ví dụ để sau mở rộng (hiện tại chỉ lưu)
        if (!data.userProfiles[senderID]) data.userProfiles[senderID] = { name: args[1] || 'Unknown', examples: [] };
        data.userProfiles[senderID].examples.push(learnText);
        save(threadID, data);
        return api.sendMessage(`📚 | Tao học "${learnText}" từ mày rồi. Lần sau tao sẽ dùng để chửi lại cho xịn hơn! 😏`, threadID, messageID);
    }

    if (action === "sim") {
        // Giữ tương thích, nhưng giờ là Gemini
        return api.sendMessage("ℹ️ | Chế độ 'sim' đã được thay bằng Gemini AI. Dùng 'sói on' để kích hoạt!", threadID, messageID);
    }

    // Help nâng cấp
    return api.sendMessage(
        `🐺 **Sói AI Cáu Kỉnh - Hướng dẫn**\n\n` +
        `• \`sói on\` - Bật AI sói (phản hồi theo ngữ cảnh + reply qua Gemini + tag user thông minh)\n` +
        `• \`sói off\` - Tắt\n` +
        `• \`sói clear\` - Xóa lịch sử\n` +
        `• \`sói status\` - Xem trạng thái\n` +
        `• \`sói learn [câu]\` - Dạy tao ví dụ\n` +
        `• \`sói sim\` - Đã nâng cấp lên Gemini!\n\n` +
        `Tao sẽ đọc reply, ngữ cảnh chat, gọi Gemini API, thêm giọng cáu kỉnh và tag mày thông minh dựa trên nội dung! Đừng spam. 😈\n\nLưu ý: Set GEMINI_API_KEY trong env.`,
        threadID, messageID
    );
};

// Tự động phản hồi AI-like với Gemini (noprefix)
module.exports.handleEvent = async function({ api, event }) {
    const { threadID, senderID, body, messageID, messageReply } = event;
    if (!body || !threadID) return;
    
    const data = load(threadID);
    if (!data.active) return;

    if (senderID === api.getCurrentUserID()) return;

    const now = Date.now();
    if (!canReply(data, now)) return;

    // Kiểm tra chế độ sim cũ (bỏ qua vì giờ dùng Gemini luôn)
    // const simMode = data[threadID];
    // if (simMode && (!body.toLowerCase().includes('bot') || messageReply)) {
    //     return;
    // }

    // Lấy tên user nếu chưa có
    if (!data.userProfiles[senderID]) {
        try {
            const userInfo = await api.getUserInfo(senderID);
            data.userProfiles[senderID] = { name: userInfo[senderID].name, examples: [] };
            save(threadID, data);
        } catch {
            data.userProfiles[senderID] = { name: 'Thằng ranh', examples: [] };
            save(threadID, data);
        }
    }
    const senderName = data.userProfiles[senderID].name || 'Mày';

    // Xây dựng ngữ cảnh nếu cần
    const replyMessage = messageReply ? messageReply.body : null;
    // const context = buildContext(data.history, senderID, replyMessage);

    // Gọi Gemini với input
    let inputText = body;
    if (replyMessage) inputText = `${replyMessage} -> ${body}`;
    const geminiRaw = await callGemini(inputText, data.history);
    
    // Thêm tone cáu kỉnh nếu cần (Gemini đã có system prompt, nhưng fallback)
    const sentiment = calculateSentiment(body);
    let reply = addGrumpyTone(geminiRaw, senderName, sentiment);

    // Tính điểm tag thông minh
    const tagScore = calculateTagScore(reply, body, sentiment, data.history, senderID);

    // Tạo message với tag thông minh nếu áp dụng
    const messageObj = createSmartTaggedMessage(reply, senderID, senderName, tagScore);

    // Lưu user message vào history
    data.history.push({ 
        from: senderID, 
        fromName: senderName,
        text: body, 
        timestamp: now,
        isReply: false 
    });
    
    data.lastReply = now;
    data.replyCount++;
    
    // Giới hạn history
    if (data.history.length > 500) data.history.shift();
    save(threadID, data);

    // Delay để simulate thinking
    setTimeout(async () => {
        const info = await api.sendMessage(messageObj, threadID, messageID);
        
        // Lưu bot reply vào history (lưu text gốc, không có tag)
        data.history.push({ 
            from: api.getCurrentUserID(), 
            fromName: 'Sói',
            text: reply, 
            timestamp: Date.now(),
            isReply: true 
        });
        if (data.history.length > 500) data.history.shift();
        save(threadID, data);
        
        // Set up handleReply nếu cần tiếp tục conversation
        global.client.handleReply.push({
            name: this.config.name,
            messageID: info.messageID,
            author: senderID
        });
    }, Math.random() * 1000 + 500); // Random delay 0.5-1.5s
};

// Handle reply để tiếp tục conversation
module.exports.handleReply = async function({ event, api, handleReply }) {
    if (event.senderID == api.getCurrentUserID()) return;
    const { threadID, senderID, body, messageID, messageReply } = event;
    
    const data = load(threadID);
    if (!data.active) return;

    // Lấy senderName
    const senderName = data.userProfiles[senderID]?.name || 'Mày';

    // Gọi Gemini với reply context
    const replyMessage = messageReply ? messageReply.body : null;
    let inputText = body;
    if (replyMessage) inputText = `${replyMessage} -> ${body}`;
    const geminiRaw = await callGemini(inputText, data.history);
    
    const sentiment = calculateSentiment(body);
    let reply = addGrumpyTone(geminiRaw, senderName, sentiment);

    // Tính điểm tag thông minh
    const tagScore = calculateTagScore(reply, body, sentiment, data.history, senderID);

    // Tạo message với tag thông minh nếu áp dụng
    const messageObj = createSmartTaggedMessage(reply, senderID, senderName, tagScore);

    // Lưu history
    const now = Date.now();
    data.history.push({ 
        from: senderID, 
        fromName: senderName,
        text: body, 
        timestamp: now,
        isReply: true // Đây là reply
    });
    if (data.history.length > 500) data.history.shift();
    save(threadID, data);

    // Gửi phản hồi
    const info = await api.sendMessage(messageObj, threadID, messageID);
    
    // Lưu bot reply
    data.history.push({ 
        from: api.getCurrentUserID(), 
        fromName: 'Sói',
        text: reply, 
        timestamp: Date.now(),
        isReply: false 
    });
    if (data.history.length > 500) data.history.shift();
    save(threadID, data);
    
    // Tiếp tục handleReply
    global.client.handleReply.push({
        name: this.config.name,
        messageID: info.messageID,
        author: senderID
    });
};
