const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "ngl",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Hỏi đáp ẩn danh (NGL-style) trong group, hỗ trợ vote & lịch sử",
    commandCategory: "Tiện ích",
    usages: "ngl [ask <câu hỏi> | answer <ID> <trả lời> | top | history]",
    cooldowns: 5
};

const dataPath = path.join(__dirname, "ngl_data");
if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath);

function getNGLData(threadID) {
    const file = path.join(dataPath, `${threadID}.json`);
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify({ questions: [], votes: {} }, null, 2));
    }
    return JSON.parse(fs.readFileSync(file));
}

function saveNGLData(threadID, data) {
    const file = path.join(dataPath, `${threadID}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const cmd = args[0]?.toLowerCase();
    const data = getNGLData(threadID);
    const questions = data.questions;

    switch (cmd) {
        case "ask":
            const question = args.slice(1).join(" ");
            if (!question) return api.sendMessage("Câu hỏi không được để trống! Ví dụ: ngl ask Bạn thích màu gì?", threadID, messageID);
            const qID = Date.now();
            questions.unshift({ id: qID, question, asker: senderID, answers: [], votes: 0, timestamp: new Date().toISOString() });
            questions.length = Math.min(questions.length, 20); // Giữ 20 câu gần nhất
            saveNGLData(threadID, data);
            return api.sendMessage(`❓ Câu hỏi ẩn danh mới: "${question}"\n👤 ID: ${qID}\n👍 Reply "ngl answer ${qID} <trả lời>" để đáp.\n📊 Reply "ngl vote ${qID}" để vote up.`, threadID, messageID);

        case "answer":
            const qID = parseInt(args[1]);
            const answer = args.slice(2).join(" ");
            if (isNaN(qID) || !answer) return api.sendMessage("Cú pháp: ngl answer <ID> <trả lời>", threadID, messageID);
            const q = questions.find(q => q.id === qID);
            if (!q) return api.sendMessage("Không tìm thấy câu hỏi!", threadID, messageID);
            q.answers.push({ answer, answerer: senderID, timestamp: new Date().toISOString() });
            q.answers.length = Math.min(q.answers.length, 5); // Giới hạn 5 đáp án
            saveNGLData(threadID, data);
            const askerName = await Users.getNameUser(q.asker);
            return api.sendMessage(`💬 Trả lời ẩn danh cho "${q.question}":\n"${answer}"\n👤 Hỏi bởi: ${askerName} (ẩn ID)`, threadID, messageID);

        case "vote":
            const vID = parseInt(args[1]);
            if (isNaN(vID)) return api.sendMessage("Cú pháp: ngl vote <ID>", threadID, messageID);
            const vq = questions.find(q => q.id === vID);
            if (!vq) return api.sendMessage("Không tìm thấy câu hỏi!", threadID, messageID);
            vq.votes++;
            saveNGLData(threadID, data);
            return api.sendMessage(`👍 Đã vote up cho câu hỏi ID ${vID}! Tổng vote: ${vq.votes}`, threadID, messageID);

        case "top":
            const sorted = questions.sort((a, b) => b.votes - a.votes).slice(0, 5);
            let topMsg = "📊 TOP 5 CÂU HỎI HOT:\n\n";
            for (let i = 0; i < sorted.length; i++) {
                topMsg += `${i+1}. "${sorted[i].question}" (Vote: ${sorted[i].votes})\n`;
            }
            return api.sendMessage(topMsg, threadID, messageID);

        case "history":
            if (questions.length === 0) return api.sendMessage("Chưa có câu hỏi nào!", threadID, messageID);
            let histMsg = "📜 LỊCH SỬ 5 CÂU HỎI GẦN NHẤT:\n\n";
            for (let q of questions.slice(0, 5)) {
                const date = new Date(q.timestamp).toLocaleString('vi-VN');
                histMsg += `• ${date}: "${q.question}" (Vote: ${q.votes})\n`;
            }
            return api.sendMessage(histMsg, threadID, messageID);

        default:
            let listMsg = "❓ [ NGL - HỎI ĐÁP ẨN DANH ]\n\n";
            listMsg += "Lệnh:\n• ngl ask <câu hỏi> - Đặt câu hỏi ẩn danh\n• ngl answer <ID> <trả lời> - Trả lời\n• ngl vote <ID> - Vote up\n• ngl top - Top hot\n• ngl history - Lịch sử\n\n";
            listMsg += "Danh sách câu hỏi hiện tại:\n";
            if (questions.length === 0) {
                listMsg += "Chưa có câu hỏi nào.";
            } else {
                questions.slice(0, 5).forEach((q, i) => {
                    listMsg += `${i+1}. "${q.question}" (ID: ${q.id}, Vote: ${q.votes})\n`;
                });
            }
            return api.sendMessage(listMsg, threadID, messageID);
    }
};
