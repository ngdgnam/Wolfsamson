const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");

module.exports.config = {
    name: "checkfilevt",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "Nnam x Grok",
    description: "Kiểm tra file upload độc hại sử dụng VirusTotal API",
    commandCategory: "group",
    usages: "checkfilevt (tự động khi upload file)",
    cooldowns: 10,
    dependencies: {
        "axios": "",
        "crypto": ""
    }
};

// API Key từ VirusTotal - User cần đăng ký tại https://www.virustotal.com/gui/join-us và lấy API key
const VIRUSTOTAL_API_KEY = process.env.VIRUSTOTAL_API_KEY || "YOUR_VIRUSTOTAL_API_KEY_HERE"; // Thay bằng key thực tế

const VT_FILE_REPORT_ENDPOINT = "https://www.virustotal.com/vtapi/v2/file/report";
const VT_FILE_SCAN_ENDPOINT = "https://www.virustotal.com/vtapi/v2/file/scan";

async function checkMaliciousFile(filePath) {
    if (!VIRUSTOTAL_API_KEY || VIRUSTOTAL_API_KEY === "YOUR_VIRUSTOTAL_API_KEY_HERE") {
        console.error("[CHECKFILEVT] Cần thiết lập VIRUSTOTAL_API_KEY");
        return { isMalicious: false, error: "API Key chưa được thiết lập" };
    }

    try {
        // Compute SHA256 hash
        const fileBuffer = fs.readFileSync(filePath);
        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // Check report by hash
        let response = await axios.get(VT_FILE_REPORT_ENDPOINT, {
            params: {
                apikey: VIRUSTOTAL_API_KEY,
                resource: hash
            }
        });

        const { response_code, scan_date, positives, total, permalink, message } = response.data;

        if (response_code === 1) {
            // Đã có report
            const isMalicious = positives > 0;
            if (isMalicious) {
                return {
                    isMalicious: true,
                    positives: positives,
                    total: total,
                    detectionRate: `${positives}/${total}`,
                    permalink: permalink,
                    scanDate: scan_date,
                    hash: hash
                };
            }
            return { isMalicious: false };
        } else if (response_code === 0) {
            // Chưa quét, gửi quét mới (post file, up to 32MB)
            const formData = new FormData();
            formData.append('file', fs.createReadStream(filePath));
            formData.append('apikey', VIRUSTOTAL_API_KEY);

            await axios.post(VT_FILE_SCAN_ENDPOINT, formData, {
                headers: formData.getHeaders()
            });
            return { isMalicious: false, message: "File đang được quét, kiểm tra lại sau bằng hash: " + hash };
        }

        return { isMalicious: false };
    } catch (error) {
        console.error("[CHECKFILEVT] Lỗi kiểm tra file:", error.message);
        return { isMalicious: false, error: error.message };
    }
}

module.exports.handleEvent = async function({ api, event, Users }) {
    const { attachments, threadID, senderID, messageID } = event;
    if (!attachments || !attachments.some(att => att.type === 'file')) return;

    const fileAtt = attachments.find(att => att.type === 'file');
    if (!fileAtt.url) return;

    // Download file to temp
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `upload_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileAtt.name ? path.extname(fileAtt.name) : 'dat'}`);

    try {
        const response = await axios.get(fileAtt.url, { responseType: 'arraybuffer' });
        fs.writeFileSync(tempFile, response.data);

        console.log(`[CHECKFILEVT] Kiểm tra file: ${fileAtt.name || 'unknown'} (${fileAtt.url})`);

        const result = await checkMaliciousFile(tempFile);
        if (result.isMalicious) {
            const senderName = await Users.getNameUser(senderID) || "Người dùng";
            const warningMsg = `⚠️ CẢNH BÁO VIRUSTOTAL: File "${fileAtt.name || 'unknown'}" bị phát hiện độc hại!\n\n` +
                              `👤 Người gửi: ${senderName}\n` +
                              `🔍 Phát hiện: ${result.detectionRate} (positives/${result.total})\n` +
                              `📅 Quét lần cuối: ${result.scanDate}\n` +
                              `🔗 Chi tiết: ${result.permalink}\n\n` +
                              `Không mở file này để tránh malware.`;

            await api.sendMessage(warningMsg, threadID);
            // Optional: Xóa tin nhắn gốc
            // api.unsendMessage(messageID);
        } else if (result.error) {
            console.log(`[CHECKFILEVT] Lỗi cho file: ${result.error}`);
        }

        // Cleanup
        fs.unlinkSync(tempFile);
    } catch (error) {
        console.error("[CHECKFILEVT] Lỗi tải/kiểm tra file:", error.message);
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
};

module.exports.run = async function({ api, event, args }) {
    const { threadID } = event;
    return api.sendMessage(
        "Module tự động kiểm tra file upload qua VirusTotal.\n" +
        "Nếu file độc hại, sẽ cảnh báo trong nhóm.\n" +
        "Lưu ý: Cần thiết lập VIRUSTOTAL_API_KEY và giới hạn file size <32MB.",
        threadID
    );
};
