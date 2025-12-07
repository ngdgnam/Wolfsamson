
const  axios  = require("axios"); 
const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");
const Youtube = require("youtube-search-api");
const { createReadStream, unlinkSync } = require("fs-extra");
const request = require("request");
const FormData = require("form-data");

// Các module khác
let menu, image, edtimage, upscaler;
try { menu = require("./menu"); } catch {}
try { image = require("./image"); } catch {}
try { edtimage = require("./edtimage"); } catch {}
try { upscaler = require("./4k"); } catch {}

// Cấu hình dữ liệu
const DATA_FILE = path.join(__dirname, "data", "goibot.json");
if (!fs.existsSync(path.join(__dirname, "data"))) fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}));

// Cấu hình Gemini
let genAI, chat, model;
try {
    const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
    const API_KEY = "YOUR_API_KEY"; // Thay bằng API của bạn
    const MODEL_NAME = "gemini-2.5-flash-lite";

    const SAFETY_SETTINGS = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    const GENERATION_CONFIG = {
        temperature: 1,
        topK: 0,
        topP: 0.95,
        maxOutputTokens: 88192,
    };

    genAI = new GoogleGenerativeAI(API_KEY);
    model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        safetySettings: SAFETY_SETTINGS,
        generationConfig: GENERATION_CONFIG,
    });
    chat = model.startChat({ history: [] });
} catch (e) {
    console.warn("Không load được Gemini lib hoặc lỗi init.", e);
}

// Helper: lấy giờ VN
function getCurrentTimeInVietnam() {
    const vietnamTime = moment.tz('Asia/Ho_Chi_Minh');
    const days = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
    const day = days[vietnamTime.day()];
    const date = vietnamTime.format("DD/MM/YYYY");
    const time = vietnamTime.format("HH:mm:ss");
    return `${day} - ${date} - ${time}`;
}

// Hàm gọi Gemini
async function getParsedGeminiResponse(chatInstance, promptContent, eventDetails) {
    if (!chatInstance) return { error: "NO_GEMINI_LIB" };
    const { timenow, nameUser, threadID, senderID, idbot } = eventDetails;
    const escapedPrompt = typeof promptContent === 'string' ? promptContent.replace(/"/g, '\\"') : promptContent;
    const geminiInput = `{"time": "${timenow}", "senderName": "${nameUser}", "content": "${escapedPrompt}", "threadID": "${threadID}", "senderID": "${senderID}", "id_cua_bot": "${idbot}"}`;
    try {
        const result = await chat.sendMessage(geminiInput);
        const response = await result.response;
        const rawText = await response.text();

        const match = rawText.match(/```json\s*([\s\S]*?)\s*```/);
        let jsonString = match ? match[1].trim() : rawText.trim();

        if (jsonString.startsWith("{") && jsonString.endsWith("}")) {
            try {
                return { parsedContent: JSON.parse(jsonString), rawText, error: null };
            } catch (e) {
                console.error("Lỗi parse JSON Gemini:", e);
                return { error: "JSON_PARSE_ERROR", rawText, parsedContent: null };
            }
        } else {
            return { error: "NOT_JSON_OBJECT", rawText, parsedContent: null };
        }
    } catch (e) {
        console.error("Lỗi giao tiếp Gemini:", e);
        return { error: "API_COMMUNICATION_ERROR", rawText: null, parsedContent: null };
    }
}

// Gửi phản hồi Gemini
function sendGeminiMessageToUser(api, threadID, messageID, geminiResponseContainer) {
    if (!api || !geminiResponseContainer) return;
    let messageText = "";
    if (geminiResponseContainer.parsedContent) {
        if (typeof geminiResponseContainer.parsedContent.content?.text === 'string') {
            messageText = geminiResponseContainer.parsedContent.content.text;
        } else if (typeof geminiResponseContainer.parsedContent.text === 'string') {
            messageText = geminiResponseContainer.parsedContent.text;
        }
    } else if (geminiResponseContainer.rawText) {
        messageText = geminiResponseContainer.rawText;
    }
    if (messageText) {
        api.sendMessage({ body: messageText }, threadID, null, messageID);
    }
}

// Phân tích ảnh
async function phantich(api_url) {
    if (!genAI) {
        try {
            const res = await axios.get(api_url, { responseType: 'arraybuffer' });
            const imgPath = path.join(__dirname, 'cache', `${Date.now()}.jpg`);
            if (!fs.existsSync(path.join(__dirname, 'cache'))) fs.mkdirSync(path.join(__dirname, 'cache'));
            fs.writeFileSync(imgPath, res.data);
            const stats = fs.statSync(imgPath);
            const info = `Kích thước ảnh: ${(stats.size / 1024).toFixed(2)} KB`;
            unlinkSync(imgPath);
            return info;
        } catch (e) {
            return "Lỗi phân tích ảnh.";
        }
    }
    try {
        const visionModel = genAI.getGenerativeModel({ model: model.model });
        const prompt = "phân tích ảnh này";
        const res = await axios.get(api_url, { responseType: 'arraybuffer' });
        const imgPath = path.join(__dirname, 'cache', `${Date.now()}.jpg`);
        fs.writeFileSync(imgPath, res.data);
        const imageData = { inlineData: { data: Buffer.from(fs.readFileSync(imgPath)).toString("base64"), mimeType: "image/png" } };
        const result = await visionModel.generateContent([prompt, imageData]);
        unlinkSync(imgPath);
        return result?.response?.text() || "Không có kết quả.";
    } catch (e) {
        return "Lỗi phân tích ảnh.";
    }
}

// Tải video từ YouTube
async function ytdlv2(url, type, quality) {
    const header = { /* headers như trong code của bạn */ };
    const { data } = await axios.post("https://iloveyt.net/proxy.php", { url }, { headers: header });
    if (!data || !data.api || !data.api.mediaItems) {
        return { error: "API_BAD", title: data?.api?.title || "Unknown" };
    }
    const mediaIds = [];
    for (const item of data.api.mediaItems) {
        if (item.type === type) mediaIds.push(item.mediaId);
    }
    if (mediaIds.length === 0) return { error: "NO_MEDIA", title: data.api.title };
    const selectedId = mediaIds[Math.floor(Math.random() * mediaIds.length)];
    // Thực hiện lấy link media
    let s = 1, mediaData;
    for (let i = 0; i < 10; i++) {
        const baseUrl = `s${s}.ytcontent.net`;
        try {
            const resp = await axios.get(`https://${baseUrl}/v3/${type.toLowerCase()}Process/${data.api.id}/${selectedId}/${quality}`);
            mediaData = resp.data;
            if (mediaData && !mediaData.error && mediaData.fileUrl) break;
        } catch {}
        s++;
        if (s > 10) s = 1;
    }
    if (!mediaData || mediaData.error || !mediaData.fileUrl) {
        return { error: mediaData?.error || "NO_FILE", title: data.api.title, channel: data.api.userInfo, videoInfo: data.api.mediaStats };
    }
    return { fileUrl: mediaData.fileUrl, title: data.api.title, channel: data.api.userInfo, videoInfo: data.api.mediaStats };
}

// Tải media từ YouTube
async function getMedia(youtubeLink, outputPath, mediaType, quality, commandName = "media_download") {
    const timestart = Date.now();
    const info = await ytdlv2(youtubeLink, mediaType, quality);
    if (!info || !info.fileUrl) return { error: info?.error || "NO_FILE_URL", title: info?.title || "Unknown" };
    try {
        const resp = await axios.get(info.fileUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(outputPath, Buffer.from(resp.data));
        return { title: info.title, timestart, filePath: outputPath };
    } catch (e) {
        if (fs.existsSync(outputPath)) unlinkSync(outputPath);
        return { error: "DOWNLOAD_FAIL", title: info.title };
    }
}

// Xử lý media: tìm kiếm và gửi
async function processAndSendMedia(api, threadID, messageID, senderID, searchTerm, mediaConfig) {
    try {
        const results = await Youtube.GetListByKeyword(searchTerm, false, 1);
        if (!results || !results.items || results.items.length === 0 || !results.items[0].id) return { error: "NO_RESULT" };
        const videoId = results.items[0].id;
        const youtubeLink = `https://www.youtube.com/watch?v=${videoId}`;
        const filePath = path.join(__dirname, 'cache', `${mediaConfig.logPrefix}_${Date.now()}_${senderID}${mediaConfig.fileExt}`);
        const mediaRes = await getMedia(youtubeLink, filePath, mediaConfig.mediaType, mediaConfig.quality);
        if (mediaRes && !mediaRes.error && fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
            const sizeMB = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
            if (sizeMB > 25) {
                api.sendMessage(`❎ ${mediaConfig.itemTypeForMsg} "${mediaRes.title}" quá lớn (${sizeMB}MB).`, threadID, messageID);
                if (fs.existsSync(filePath)) unlinkSync(filePath);
                return { error: "TOO_BIG" };
            } else {
                await api.sendMessage({ body: `${mediaConfig.successMsgPrefix} ${mediaRes.title}\n(${sizeMB}MB)`, attachment: createReadStream(filePath) }, threadID, () => {
                    if (fs.existsSync(filePath)) unlinkSync(filePath);
                }, messageID);
                return { success: true };
            }
        } else {
            if (fs.existsSync(filePath)) unlinkSync(filePath);
            return { error: mediaRes?.error || "FAIL" };
        }
    } catch (e) {
        return { error: "ERROR", message: e.message };
    }
}

// Đọc file trạng thái
function readData() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    } catch {
        return {};
    }
}
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Biến trạng thái xử lý
let isProcessing = {};

// Xu lý event
module.exports.handleEvent = async ({ api, event }) => {
    const threadID = event.threadID;
    const senderID = event.senderID;
    const messageID = event.messageID;
    const body = event.body || "";
    const data = readData();

    // Kiểm tra bật/tắt bot
    if (data[threadID] === false) return;
    if (typeof data[threadID] !== 'boolean') data[threadID] = true;

    // Thông tin người dùng
    const nameUser = (await api.getUserInfo(senderID))[senderID]?.name || "Người dùng";
    const timenow = getCurrentTimeInVietnam();

    const eventDetails = { threadID, senderID, messageID, body, nameUser, timenow, idbot: await api.getCurrentUserID() };

    // Các trigger
    const isReply = event.type === "message_reply";
    const replyMsg = isReply ? event.messageReply || {} : {};
    const hasImageAttachment = isReply && replyMsg.attachments && replyMsg.attachments.some(att => ['photo', 'image'].includes(att.type));
    const bodyLower = body.toLowerCase();

    const invoked = bodyLower.includes("sói");
    const triggerCreateImage = (invoked || (isReply && replyMsg.senderID == eventDetails.idbot)) && (bodyLower.includes("tạo ảnh") || bodyLower.includes("vẽ"));
    const triggerEditImage = (invoked || (isReply && replyMsg.senderID == eventDetails.idbot)) && (bodyLower.includes("sửa") || bodyLower.includes("xóa") || bodyLower.includes("chuyển cảnh"));
    const triggerMenu = bodyLower.includes("menu") || (invoked && bodyLower.includes("gửi menu"));
    const triggerUpscale = (isReply && replyMsg.attachments && hasImageAttachment && bodyLower.includes("làm nét"));
    const triggerAnalyze = (isReply && replyMsg.attachments && hasImageAttachment && bodyLower.includes("phân tích"));
    const triggerAdd = invoked && bodyLower.includes("thêm") && event.mentions && Object.keys(event.mentions).length > 0;
    const triggerKick = invoked && bodyLower.includes("kick") && event.mentions && Object.keys(event.mentions).length > 0;
    const triggerVideo = invoked && bodyLower.includes("video");
    const triggerMusic = invoked && bodyLower.includes("nhạc");

    // Xử lý menu
    if (triggerMenu) {
        if (menu && menu.run) return await menu.run({ api, event, args: [] });
        return api.sendMessage("Menu không khả dụng.", threadID, messageID);
    }

    // Tạo ảnh
    if (triggerCreateImage) {
        if (isProcessing[threadID]) return;
        isProcessing[threadID] = true;
        try {
            let prompt = body.replace(/tạo ảnh|vẽ/gi, "").trim();
            if (!prompt) {
                const ack = `Bạn yêu cầu tạo ảnh nhưng chưa rõ nội dung. Vẽ gì vậy?`;
                const ackContainer = await getParsedGeminiResponse(chat, ack, eventDetails);
                sendGeminiMessageToUser(api, threadID, messageID, ackContainer);
                return;
            }
            const ackPrompt = `Người dùng ${nameUser} yêu cầu tạo ảnh: "${prompt}". Đang xử lý...`;
            const ackContainer = await getParsedGeminiResponse(chat, ackPrompt, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, ackContainer);
            if (image && image.run) {
                await image.run({ api, event, args: [prompt] });
            } else {
                // fallback API
                const url = `https://gemini.satoru.site/prompt=${encodeURIComponent(prompt)}&ratio=auto&api_key=satoru-deptrai-2025`;
                const res = await axios.get(url, { responseType: 'arraybuffer' });
                const tmpPath = path.join(__dirname, 'cache', `genimg_${Date.now()}.png`);
                if (!fs.existsSync(path.join(__dirname, 'cache'))) fs.mkdirSync(path.join(__dirname, 'cache'));
                fs.writeFileSync(tmpPath, Buffer.from(res.data));
                await api.sendMessage({ body: "Ảnh của bạn đây", attachment: createReadStream(tmpPath) }, threadID, () => unlinkSync(tmpPath), messageID);
            }
        } catch (e) {
            api.sendMessage("Lỗi tạo ảnh.", threadID, messageID);
        } finally { isProcessing[threadID] = false; }
        return;
    }

    // Sửa ảnh
    if (triggerEditImage) {
        if (isProcessing[threadID]) return;
        isProcessing[threadID] = true;
        try {
            let prompt = body.replace(/sửa|xóa|chuyển cảnh/gi, "").trim();
            let imagesParam = null;
            if (isReply && replyMsg.attachments && replyMsg.attachments.length > 0) {
                imagesParam = replyMsg.attachments.map(a => a.url).join(",");
            }
            const ack = `Đang xử lý yêu cầu sửa ảnh: "${prompt || '(không mô tả)'}"`;
            const ackContainer = await getParsedGeminiResponse(chat, ack, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, ackContainer);
            if (edtimage && edtimage.run) {
                await edtimage.run({ api, event, args: [prompt] });
            } else {
                // fallback
                if (!imagesParam && !prompt) {
                    api.sendMessage("Cần reply ảnh hoặc cung cấp link mô tả sửa.", threadID, messageID);
                } else {
                    const url = `https://gemini.satoru.site/prompt=${encodeURIComponent(prompt || "")}&images=${encodeURIComponent(imagesParam || "")}&ratio=auto&api_key=satoru-deptrai-2025`;
                    const res = await axios.get(url, { responseType: 'arraybuffer' });
                    const tmpPath = path.join(__dirname, 'cache', `editimg_${Date.now()}.png`);
                    if (!fs.existsSync(path.join(__dirname, 'cache'))) fs.mkdirSync(path.join(__dirname, 'cache'));
                    fs.writeFileSync(tmpPath, Buffer.from(res.data));
                    await api.sendMessage({ body: "Ảnh đã chỉnh sửa", attachment: createReadStream(tmpPath) }, threadID, () => unlinkSync(tmpPath), messageID);
                }
            }
        } catch (e) {
            api.sendMessage("Lỗi sửa ảnh.", threadID, messageID);
        } finally { isProcessing[threadID] = false; }
        return;
    }

    // Làm nét ảnh (upscaler)
    if (triggerUpscale) {
        if (isProcessing[threadID]) return api.sendMessage("Bot đang xử lý yêu cầu khác, đợi chút nhé.", threadID, messageID);
        isProcessing[threadID] = true;
        try {
            const ack = await getParsedGeminiResponse(chat, `Đang làm nét ảnh cho ${nameUser}`, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, ack);
            if (upscaler && upscaler.run) {
                await upscaler.run({ api, event, args: [] });
            } else {
                api.sendMessage("Module làm nét chưa cài.", threadID, messageID);
            }
        } catch (e) {
            api.sendMessage("Làm nét thất bại.", threadID, messageID);
        } finally { isProcessing[threadID] = false; }
        return;
    }

    // Phân tích ảnh
    if (triggerAnalyze) {
        if (isProcessing[threadID]) return;
        isProcessing[threadID] = true;
        try {
            const img = replyMsg.attachments?.find(a => ['photo', 'image'].includes(a.type));
            if (!img) { api.sendMessage("Reply ảnh để phân tích.", threadID, messageID); return; }
            const ack = await getParsedGeminiResponse(chat, `Đang phân tích ảnh cho ${nameUser}`, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, ack);
            const analysis = await phantich(img.url);
            const filtered = filterSpecialChars(analysis);
            api.sendMessage(filtered, threadID, messageID);
        } catch (e) {
            api.sendMessage("Phân tích ảnh thất bại.", threadID, messageID);
        } finally { isProcessing[threadID] = false; }
        return;
    }

    // Thêm, kick
    if (triggerAdd) {
        const taggedID = Object.keys(event.mentions)[0];
        if (!taggedID) return api.sendMessage("Không tìm thấy người tag.", threadID, messageID);
        try {
            await new Promise((res, rej) => api.addUserToGroup(taggedID, threadID, (err) => err ? rej(err) : res()));
            api.sendMessage("Đã mời vào nhóm.", threadID, messageID);
        } catch {
            api.sendMessage("Không thể mời người này.", threadID, messageID);
        }
        return;
    }
    if (triggerKick) {
        const taggedID = Object.keys(event.mentions)[0];
        if (!taggedID) return api.sendMessage("Không tìm thấy người tag.", threadID, messageID);
        try {
            const threadInfo = await api.getThreadInfo(threadID);
            const isAdmin = (threadInfo.adminIDs || []).some(a => String(a.id) === String(senderID)) || (global.config?.ADMINBOT || []).includes(senderID);
            if (!isAdmin) return api.sendMessage("Bạn không có quyền kick.", threadID, messageID);
            await new Promise((res, rej) => api.removeUserFromGroup(taggedID, threadID, (err) => err ? rej(err) : res()));
            api.sendMessage("Đã kick người tag.", threadID, messageID);
        } catch {
            api.sendMessage("Gỡ người này thất bại.", threadID, messageID);
        }
        return;
    }

    // Video / Nhạc
    if (triggerVideo || triggerMusic) {
        if (isProcessing[threadID]) return;
        isProcessing[threadID] = true;
        try {
            let search = body;
            ["bot", "sói", "video", "nhạc"].forEach(w => { search = search.replace(new RegExp(`\\b${w}\\b`, 'gi'), ''); });
            search = search.trim();
            if (!search) {
                const ack = await getParsedGeminiResponse(chat, `Hỏi xem mấy bạn muốn gì (video hoặc nhạc).`, eventDetails);
                sendGeminiMessageToUser(api, threadID, messageID, ack);
                return;
            }
            const ack = await getParsedGeminiResponse(chat, `Đang tìm ${triggerVideo ? "video" : "nhạc"}: ${search}`, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, ack);
            await processAndSendMedia(api, threadID, messageID, senderID, search, {
                mediaType: triggerVideo ? 'Video' : 'Audio',
                quality: '480p',
                fileExt: triggerVideo ? '.mp4' : '.mp3',
                logPrefix: triggerVideo ? 'video_direct' : 'music_direct',
                successMsgPrefix: triggerVideo ? '🎬 Video:' : '🎶 Nhạc:',
                itemTypeForMsg: triggerVideo ? 'video' : 'bài hát',
                commandLogName: triggerVideo ? 'goibot_video_direct' : 'goibot_music_direct'
            });
        } catch {}
        finally { isProcessing[threadID] = false; }
        return;
    }

    // Giao tiếp Gemini chung
    if (invoked || isReply) {
        if (isProcessing[threadID]) return;
        isProcessing[threadID] = true;
        try {
            const botResp = await getParsedGeminiResponse(chat, body, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, botResp);
            // Xử lý JSON hành vi
            let AI = botResp.parsedContent || null;
            if (!AI && botResp.rawText) {
                try { AI = JSON.parse(botResp.rawText); } catch {}
            }
            if (!AI || typeof AI !== 'object') return;
            // Xử lý hành vi dựa trên AI
            await handleAIBehaviors(api, threadID, messageID, event, AI, eventDetails);
        } catch {}
        finally { isProcessing[threadID] = false; }
        return;
    }
};

// Hàm xử lý hành vi AI
async function handleAIBehaviors(api, threadID, messageID, event, AI, eventDetails) {
    const behavior = (AI.HanhVi || AI.hanh_dong || AI.action || AI.behavior || "traloi").toString().toLowerCase();
    const answer = AI.TraLoi || AI.traloi || AI.text || AI.message || "";
    const extra = AI.Json || AI.json || AI.data || {};

    const safeSend = async (txt) => { if (txt) await api.sendMessage(txt, threadID, messageID); };
    const resolveMentionId = (m) => {
        if (!m) return null;
        if (/^\d+$/.test(String(m))) return String(m);
        if (event.mentions) {
            for (const k of Object.keys(event.mentions)) {
                const name = event.mentions[k];
                if (name && String(name).includes(String(m).replace('@',''))) return k;
            }
        }
        return null;
    };

    switch (behavior) {
        case "traloi":
        case "reply":
            await safeSend(answer || "...");
            break;
        case "tagall":
            try {
                const info = await api.getThreadInfo(threadID);
                const pids = info.participantIDs || [];
                const mentions = [];
                let bodyText = (answer && answer.length ? answer + "\n\n" : "");
                for (const id of pids) {
                    if (String(id) === String(await api.getCurrentUserID())) continue;
                    const name = (info.userInfo || []).find(u => u.id == id)?.name || "Thành viên";
                    mentions.push({ tag: name, id });
                    bodyText += `@${name} `;
                }
                await api.sendMessage({ body: bodyText, mentions }, threadID, messageID);
            } catch { await api.sendMessage("Không tag được.", threadID, messageID); }
            break;
        case "doi_biet_danh":
        case "nickname": {
            const uid = extra.user_id || extra.id || resolveMentionId(extra.user || extra.user_id);
            const newName = extra.biet_danh_moi || extra.name || extra.nick;
            if (!uid || !newName) return await safeSend("Thiếu dữ liệu JSON");
            try { await api.changeNickname(newName, threadID, uid); await safeSend(`Đổi biệt danh: ${newName}`); } catch { await safeSend("Không đổi được biệt danh."); }
            break;
        }
        case "kick": {
            const uid = extra.user_id || extra.id || resolveMentionId(extra.user || extra.user_id);
            if (!uid) return await safeSend("Thiếu dữ liệu JSON");
            try {
                const threadInfo = await api.getThreadInfo(threadID);
                const isAdmin = (threadInfo.adminIDs || []).some(a => String(a.id) === String(await api.getCurrentUserID())) || (global.config?.ADMINBOT || []).includes(await api.getCurrentUserID());
                if (!isAdmin) return await safeSend("Không quyền kick");
                await new Promise((res, rej) => api.removeUserFromGroup(uid, threadID, (err) => err ? rej(err) : res()));
                await safeSend("Đã kick");
            } catch { await safeSend("Không kick được."); }
            break;
        }
        case "add": {
            const uid = extra.user_id || extra.id || resolveMentionId(extra.user || extra.user_id);
            if (!uid) return await safeSend("Thiếu dữ liệu JSON");
            try { await new Promise((res, rej) => api.addUserToGroup(uid, threadID, (err) => err ? rej(err) : res())); await safeSend("Đã mời"); } catch { await safeSend("Không mời được."); }
            break;
        }
        case "set_admin": {
            const uid = extra.user_id || extra.id || resolveMentionId(extra.user || extra.user_id);
            if (!uid) return await safeSend("Thiếu dữ liệu JSON");
            try { await new Promise((res, rej) => api.changeAdminStatus(threadID, uid, true, (err) => err ? rej(err) : res())); await safeSend("Đã set admin"); } catch { await safeSend("Không set được admin."); }
            break;
        }
        case "remove_admin": {
            const uid = extra.user_id || extra.id || resolveMentionId(extra.user || extra.user_id);
            if (!uid) return await safeSend("Thiếu dữ liệu JSON");
            try { await new Promise((res, rej) => api.changeAdminStatus(threadID, uid, false, (err) => err ? rej(err) : res())); await safeSend("Gỡ admin"); } catch { await safeSend("Gỡ admin thất bại."); }
            break;
        }
        case "change_title": {
            const title = extra.ten_moi || extra.title || extra.name;
            if (!title) return await safeSend("Thiếu dữ liệu JSON");
            try { await api.setTitle(title, threadID, messageID); await safeSend("Đổi tên nhóm"); } catch { await safeSend("Không đổi được tên."); }
            break;
        }
        case "change_emoji": {
            const emoji = extra.icon;
            if (!emoji) return await safeSend("Thiếu dữ liệu JSON");
            try { await api.changeThreadEmoji(emoji, threadID); await safeSend("Đổi emoji"); } catch { await safeSend("Không đổi emoji."); }
            break;
        }
        case "doi_hinh_box": {
            const urlImg = extra.url || (event.messageReply?.attachments?.[0]?.url);
            if (!urlImg) return await safeSend("Thiếu dữ liệu");
            try {
                const res = await axios.get(encodeURI(urlImg), { responseType: 'arraybuffer' });
                const tmpPath = path.join(__dirname, 'cache', `thread_img_${Date.now()}.jpg`);
                if (!fs.existsSync(path.join(__dirname, 'cache'))) fs.mkdirSync(path.join(__dirname, 'cache'));
                fs.writeFileSync(tmpPath, Buffer.from(res.data));
                await new Promise((res2, rej2) => api.changeGroupImage(fs.createReadStream(tmpPath), threadID, (err) => err ? rej2(err) : res2()));
                unlinkSync(tmpPath);
                await safeSend("Thay ảnh nhóm thành công");
            } catch { await safeSend("Lỗi đổi ảnh nhóm"); }
            break;
        }
        case "image": case "tao_anh": case "create_image": {
            const prompt = extra.prompt || answer || "";
            if (!prompt) return await safeSend("Thiếu prompt");
            try {
                if (image && image.run) { await image.run({ api, event, args: [prompt] }); return; }
                const url = `https://gemini.satoru.site/prompt=${encodeURIComponent(prompt)}&ratio=auto&api_key=satoru-deptrai-2025`;
                const res = await axios.get(url, { responseType: 'arraybuffer' });
                const tmpPath = path.join(__dirname, 'cache', `genimg_${Date.now()}.png`);
                if (!fs.existsSync(path.join(__dirname, 'cache'))) fs.mkdirSync(path.join(__dirname, 'cache'));
                fs.writeFileSync(tmpPath, Buffer.from(res.data));
                await api.sendMessage({ body: "Ảnh của bạn đây", attachment: createReadStream(tmpPath) }, threadID, () => unlinkSync(tmpPath), messageID);
            } catch { await safeSend("Tạo ảnh thất bại"); }
            break;
        }
        // Các hành vi khác như "multi_image", "video", "audio", "file", "analyze_image", "upscale", "menu", "rank" tương tự
        default:
            await safeSend(answer || "Bot đã nhận, nhưng không hiểu hành vi.");
    }
}

// Lệnh bật tắt bot
module.exports.run = async ({ api, event, args }) => {
    const threadID = event.threadID;
    const messageID = event.messageID;
    const data = readData();
    if (args[0] === "on") {
        data[threadID] = true;
        writeData(data);
        api.sendMessage("✅ Bật goibot.", threadID, messageID);
    } else if (args[0] === "off") {
        data[threadID] = false;
        writeData(data);
        api.sendMessage("☑ Tắt goibot.", threadID, messageID);
    } else {
        // Hiển thị trạng thái
        const status = data[threadID] === false ? "Tắt" : "Bật";
        api.sendMessage(`Trạng thái: ${status}`, threadID, messageID);
    }
};
