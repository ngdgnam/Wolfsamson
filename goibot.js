/* goibot.js
   Hoàn thiện toàn bộ - hỗ trợ mọi hành vi AI JSON
   - Tích hợp Gemini (genAI) call (dựa trên phần bạn đã có)
   - Hỗ trợ hành vi: traloi, tagall, kick, nickname, image, multi_image,
     video, voice/audio, file, menu, rank, add, set_admin, remove_admin,
     change_title, change_emoji, change_thread_image, analyze_image, upscale, reply
*/

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const moment = require('moment-timezone');
const Youtube = require('youtube-search-api');
const { createReadStream, unlinkSync } = require("fs-extra");
const request = require("request");
const FormData = require('form-data');

const DATA_FILE = path.join(__dirname, "data", "goibot.json");
if (!fs.existsSync(path.join(__dirname, "data"))) fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}));

// Try to require optional modules; if not available, set to undefined
let image, edtimage, upscaler, menu;
try { image = require("./image"); } catch { image = undefined; }
try { edtimage = require("./edtimage"); } catch { edtimage = undefined; }
try { upscaler = require("./4k"); } catch { upscaler = undefined; }
try { menu = require("./menu"); } catch { menu = undefined; }

// --- Gemini / Google Generative AI setup (kept from your snippet) ---
let genAI, chat, model;
try {
    const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
    const API_KEY = "AIzaSyBO8FXazJZoEMapdmExdw49YRa5l6oBI4A"; // chỉnh nếu cần
    const MODEL_NAME = "gemini-2.5-flash-lite";
    const GENERATION_CONFIG = {
        temperature: 1,
        topK: 0,
        topP: 0.95,
        maxOutputTokens: 88192,
    };
    const SAFETY_SETTINGS = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];
    genAI = new GoogleGenerativeAI(API_KEY);
    model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: GENERATION_CONFIG,
        safetySettings: SAFETY_SETTINGS,
        // systemInstruction: SYSTEM_INSTRUCTION // nếu muốn giữ
    });
    chat = model.startChat({ history: [] });
} catch (e) {
    console.warn("Google Generative AI lib not available or failed init. Gemini features may not work.", e);
    genAI = null;
    chat = null;
}

// --- Helpers ---

function getCurrentTimeInVietnam() {
    const vietnamTime = moment.tz('Asia/Ho_Chi_Minh');
    const days = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
    const day = days[vietnamTime.day()];
    const date = vietnamTime.format("DD/MM/YYYY");
    const time = vietnamTime.format("HH:mm:ss");
    return `${day} - ${date} - ${time}`;
}

async function getParsedGeminiResponse(chatInstance, promptContent, eventDetails) {
    // nếu chatInstance không có (lib ko load) -> trả về lỗi
    if (!chatInstance) return { error: "NO_GEMINI_LIB" };

    const { timenow, nameUser, threadID, senderID, idbot } = eventDetails;
    const escapedPromptContent = typeof promptContent === 'string' ? promptContent.replace(/"/g, '\\"') : promptContent;
    const geminiInput = `{"time": "${timenow}", "senderName": "${nameUser}", "content": "${escapedPromptContent}", "threadID": "${threadID}", "senderID": "${senderID}", "id_cua_bot": "${idbot}"}`;

    try {
        const result = await chatInstance.sendMessage(geminiInput);
        const response = await result.response;
        const rawText = await response.text();
        // Try to extract JSON block if wrapped in ```json ... ```
        const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
        let stringToParse;
        if (jsonMatch && jsonMatch[1]) {
            stringToParse = jsonMatch[1].trim();
        } else {
            stringToParse = rawText.trim();
        }
        if (stringToParse.startsWith("{") && stringToParse.endsWith("}")) {
            try {
                return { parsedContent: JSON.parse(stringToParse), rawText: rawText, error: null };
            } catch (e) {
                console.error("Lỗi parse JSON từ Gemini:", e);
                console.error("String đã cố parse:", stringToParse);
                return { error: "JSON_PARSE_ERROR", rawText: rawText, parsedContent: null };
            }
        } else {
            // Not a JSON object
            return { error: "NOT_JSON_OBJECT", rawText: rawText, parsedContent: null };
        }
    } catch (e) {
        console.error("Lỗi khi giao tiếp với Gemini API:", e);
        return { error: "API_COMMUNICATION_ERROR", rawText: null, parsedContent: null };
    }
}

function sendGeminiMessageToUser(api, threadID, messageID, geminiResponseContainer) {
    if (!api || !geminiResponseContainer) return;
    let messageText = "";
    if (geminiResponseContainer.parsedContent) {
        if (geminiResponseContainer.parsedContent.content && typeof geminiResponseContainer.parsedContent.content.text === 'string') {
            messageText = geminiResponseContainer.parsedContent.content.text;
        } else if (typeof geminiResponseContainer.parsedContent.text === 'string') {
            messageText = geminiResponseContainer.parsedContent.text;
        } else if (geminiResponseContainer.parsedContent.TraLoi) {
            messageText = geminiResponseContainer.parsedContent.TraLoi;
        }
    } else if (geminiResponseContainer.rawText) {
        messageText = geminiResponseContainer.rawText;
    }
    if (messageText) {
        try { api.sendMessage({ body: messageText }, threadID, null, messageID); } catch (e) { console.error("sendGeminiMessageToUser error:", e); }
    }
}

// YTDL helper (kept from your snippet)
async function ytdlv2(url, type, quality) {
    const header = { "accept": "*/*", "accept-encoding": "gzip, deflate, br", "accept-language": "vi-VN,vi;q=0.9", "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "user-agent": "Mozilla/5.0" };
    try {
        const { data } = await axios.post("https://iloveyt.net/proxy.php", { url: url }, { headers: header });
        if (!data || !data.api || !data.api.mediaItems) {
            return { error: "API_RESPONSE_BAD", title: data?.api?.title || "Unknown" };
        }
        var mediaId = [];
        for (const i of data.api.mediaItems) {
            if (i.type !== type) continue;
            mediaId.push(i.mediaId);
        }
        if (mediaId.length === 0) {
            return { error: "NO_MEDIA_FOR_TYPE", title: data.api.title };
        }
        const randomMediaId = mediaId[Math.floor(Math.random() * mediaId.length)];
        let s = 1, mediaProccessData, i = 0;
        while (i++ < 10) {
            const base_url = "s" + s + ".ytcontent.net";
            try {
                const response = await axios.get(`https://${base_url}/v3/${type.toLowerCase()}Process/${data.api.id}/${randomMediaId}/${quality}`);
                mediaProccessData = response.data;
                if (mediaProccessData && !mediaProccessData.error && mediaProccessData.fileUrl) break;
            } catch (err) {}
            s++; if (s > 10) s = 1;
        }
        if (!mediaProccessData || mediaProccessData.error || !mediaProccessData.fileUrl) {
            return { error: "NO_FILEURL", title: data.api.title, channel: data.api.userInfo, videoInfo: data.api.mediaStats };
        }
        return { fileUrl: mediaProccessData.fileUrl, title: data.api.title, channel: data.api.userInfo, videoInfo: data.api.mediaStats };
    } catch (e) {
        console.error("ytdlv2 error:", e);
        return { error: "YTDL_FAILED" };
    }
}

async function getMedia(youtubeLink, outputPath, mediaType, quality, commandName = "media_download") {
    const timestart = Date.now();
    const downloadInfo = await ytdlv2(youtubeLink, mediaType, quality);
    if (!downloadInfo || !downloadInfo.fileUrl) {
        return { error: downloadInfo?.error || "NO_FILE_URL", title: downloadInfo?.title || "Unknown" };
    }
    const dllink = downloadInfo.fileUrl;
    try {
        const response = await axios.get(dllink, { responseType: 'arraybuffer' });
        fs.writeFileSync(outputPath, Buffer.from(response.data));
        return { title: downloadInfo.title, timestart, filePath: outputPath };
    } catch (downloadError) {
        if (fs.existsSync(outputPath)) unlinkSync(outputPath);
        return { error: "DOWNLOAD_FAILED", title: downloadInfo.title };
    }
}

async function processAndSendMedia(api, threadID, messageID, senderID, searchTerm, mediaConfig) {
    // mediaConfig: { mediaType, quality, fileExt, logPrefix, successMsgPrefix, itemTypeForMsg, commandLogName, isGeminiRequest }
    try {
        const searchResultsRaw = await Youtube.GetListByKeyword(searchTerm, false, 1);
        if (!searchResultsRaw || !searchResultsRaw.items || !searchResultsRaw.items[0] || !searchResultsRaw.items[0].id) {
            return { error: "NO_RESULTS" };
        }
        const firstResultId = searchResultsRaw.items[0].id;
        const youtubeLink = `https://www.youtube.com/watch?v=${firstResultId}`;
        const filePath = path.join(__dirname, 'cache', `${mediaConfig.logPrefix}_${Date.now()}_${senderID}${mediaConfig.fileExt}`);
        const mediaData = await getMedia(youtubeLink, filePath, mediaConfig.mediaType, mediaConfig.quality, mediaConfig.commandLogName);
        if (mediaData && !mediaData.error && fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
            const fileSize = fs.statSync(filePath).size;
            if (fileSize > 26214400) {
                if (fs.existsSync(filePath)) unlinkSync(filePath);
                await api.sendMessage(`❎ ${mediaConfig.itemTypeForMsg} "${mediaData.title}" quá nặng (>25MB).`, threadID, messageID);
                return { error: "TOO_LARGE" };
            } else {
                await api.sendMessage({ body: `${mediaConfig.successMsgPrefix} ${mediaData.title}`, attachment: createReadStream(filePath) }, threadID, () => {
                    if (fs.existsSync(filePath)) unlinkSync(filePath);
                }, messageID);
                return { ok: true };
            }
        } else {
            if (fs.existsSync(filePath)) unlinkSync(filePath);
            return { error: mediaData?.error || "MEDIA_DOWNLOAD_FAILED" };
        }
    } catch (ytError) {
        console.error("processAndSendMedia error:", ytError);
        return { error: "PROCESS_FAILED" };
    }
}

// Utility: remove file if exists
function safeUnlink(filePath) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
}

// Utility: filter special chars
function filterSpecialChars(text) {
    if (typeof text !== 'string') return '';
    const regex = /[^a-zA-Z0-9\u00C0-\u1EF9\s.,?!'"-:()]/g;
    return text.replace(regex, '');
}

// State for processing per thread
let isProcessing = {};

// --- Main exported handlers ---

module.exports.config = {
    name: "goibot",
    version: "2.3.4",
    hasPermssion: 1,
    credits: "Duy Toàn",
    description: "Trò chuyện Gemini cực thông minh (có lúc ngu)",
    commandCategory: "Tiện Ích",
    usages: "goibot [on/off]",
    cd: 2,
};

module.exports.handleEvent = async function({ api, event }) {
    // Guard basic
    if (!api || !event) return;
    const idbot = await (typeof api.getCurrentUserID === "function" ? api.getCurrentUserID() : Promise.resolve(null));
    const threadID = event.threadID;
    const senderID = event.senderID;
    const messageID = event.messageID;
    const body = typeof event.body === 'string' ? event.body : "";

    // Ensure data file thread state
    let data = {};
    try { data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")); } catch (e) { data = {}; }
    data[threadID] = data[threadID] ?? true;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    if (!data[threadID]) return;

    const isReply = event.type === "message_reply";
    const isReplyToBot = isReply && event.messageReply && event.messageReply.senderID == idbot;
    const hasImageAttachment = isReply && event.messageReply && event.messageReply.attachments && event.messageReply.attachments.some(att => ['photo','image','photo','png','jpg','jpeg'].includes(att.type) || att.type === 'photo');
    const invoked = body?.toLowerCase().includes("sói") || isReplyToBot;
    const createImageTrigger = (isReplyToBot || invoked) && (body?.toLowerCase().includes("tạo ảnh") || body?.toLowerCase().includes("vẽ"));
    const editImageTrigger = (isReplyToBot || invoked) && (body?.toLowerCase().includes("sửa") || body?.toLowerCase().includes("xóa") || body?.toLowerCase().includes("chuyển cảnh"));
    const menuTrigger = body?.toLowerCase().includes("menu") || (invoked && body?.toLowerCase().includes("gửi menu"));
    const upscalerTrigger = isReplyToBot && hasImageAttachment && body?.toLowerCase().includes("làm nét");
    const analyzeTrigger = isReplyToBot && hasImageAttachment && body?.toLowerCase().includes("phân tích");
    const addTrigger = invoked && body?.toLowerCase().includes("thêm") && event.mentions && Object.keys(event.mentions).length > 0;
    const kickTrigger = invoked && body?.toLowerCase().includes("kick") && event.mentions && Object.keys(event.mentions).length > 0;
    const videoTrigger = invoked && body?.toLowerCase().includes("video");
    const musicTrigger = invoked && body?.toLowerCase().includes("nhạc");

    const timenow = getCurrentTimeInVietnam();
    let nameUser = "Người dùng";
    try { nameUser = (await api.getUserInfo(senderID))[senderID].name; } catch (e) {}

    const eventDetails = { timenow, nameUser, threadID, senderID, idbot, messageID };

    // If menu requested
    if (menuTrigger) {
        try {
            if (menu && menu.run) return await menu.run({ api, event, args: [] });
            return api.sendMessage("Menu không khả dụng (module menu chưa cài).", threadID, messageID);
        } catch (e) { console.error("menu error:", e); return; }
    }

    // Image create flow
    if (createImageTrigger) {
        if (isProcessing[threadID]) return;
        isProcessing[threadID] = true;
        try {
            // extract prompt by removing keywords
            let prompt = body.replace(/tạo ảnh|vẽ/gi, "").trim();
            if (!prompt) {
                const ack = `Bạn vừa yêu cầu tạo ảnh nhưng chưa nói rõ nội dung. Muốn vẽ gì?`;
                const ackC = await getParsedGeminiResponse(chat, ack, eventDetails);
                sendGeminiMessageToUser(api, threadID, messageID, ackC);
                isProcessing[threadID] = false;
                return;
            }
            const ackPrompt = `Người dùng ${nameUser} yêu cầu tạo ảnh: "${prompt}". Đang xử lý...`;
            const ack = await getParsedGeminiResponse(chat, ackPrompt, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, ack);

            // use image.run if available else use fallback endpoint
            if (image && image.run) {
                await image.run({ api, event, args: [prompt] });
            } else {
                // fallback external API
                const ratio = "auto";
                const api_key = "satoru-deptrai-2025";
                const url = `https://gemini.satoru.site/prompt=${encodeURIComponent(prompt)}&ratio=${encodeURIComponent(ratio)}&api_key=${encodeURIComponent(api_key)}`;
                const res = await axios.get(url, { responseType: 'arraybuffer' });
                const tmp = path.join(__dirname, 'cache', `genimg_${Date.now()}.png`);
                if (!fs.existsSync(path.join(__dirname, 'cache'))) fs.mkdirSync(path.join(__dirname, 'cache'), { recursive: true });
                fs.writeFileSync(tmp, Buffer.from(res.data));
                await api.sendMessage({ body: "Ảnh của bạn đây", attachment: createReadStream(tmp) }, threadID, () => safeUnlink(tmp), messageID);
            }
        } catch (e) {
            console.error("createImage flow error:", e);
            api.sendMessage("Có lỗi khi tạo ảnh.", threadID, messageID);
        } finally { isProcessing[threadID] = false; }
        return;
    }

    // Edit image flow
    if (editImageTrigger) {
        if (isProcessing[threadID]) return;
        isProcessing[threadID] = true;
        try {
            let prompt = body.replace(/sửa|xóa|chuyển cảnh/gi, "").trim();
            // If reply with image, use that image
            let imagesParam = null;
            if (isReply && event.messageReply && event.messageReply.attachments && event.messageReply.attachments.length > 0) {
                imagesParam = event.messageReply.attachments.map(a => a.url).join(",");
            }
            const ackContent = `Đang xử lý yêu cầu sửa ảnh: "${prompt || '(không mô tả)'}"`;
            const ack = await getParsedGeminiResponse(chat, ackContent, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, ack);

            if (edtimage && edtimage.run) {
                await edtimage.run({ api, event, args: [prompt] });
            } else {
                // fallback external edit
                if (!imagesParam && !prompt) {
                    api.sendMessage("Cần reply ảnh hoặc cung cấp link ảnh và mô tả sửa", threadID, messageID);
                } else {
                    const api_key = "satoru-deptrai-2025";
                    const url = `https://gemini.satoru.site/prompt=${encodeURIComponent(prompt || "")}&images=${encodeURIComponent(imagesParam || "")}&ratio=auto&api_key=${encodeURIComponent(api_key)}`;
                    const res = await axios.get(url, { responseType: 'arraybuffer' });
                    const tmp = path.join(__dirname, 'cache', `editimg_${Date.now()}.png`);
                    if (!fs.existsSync(path.join(__dirname, 'cache'))) fs.mkdirSync(path.join(__dirname, 'cache'), { recursive: true });
                    fs.writeFileSync(tmp, Buffer.from(res.data));
                    await api.sendMessage({ body: "Ảnh đã chỉnh sửa", attachment: createReadStream(tmp) }, threadID, () => safeUnlink(tmp), messageID);
                }
            }
        } catch (e) {
            console.error("editImage flow error:", e);
            api.sendMessage("Có lỗi khi sửa ảnh.", threadID, messageID);
        } finally { isProcessing[threadID] = false; }
        return;
    }

    // Upscale (make sharp)
    if (upscalerTrigger) {
        if (isProcessing[threadID]) return api.sendMessage("Bot đang xử lý yêu cầu khác, đợi chút nhé.", threadID, messageID);
        isProcessing[threadID] = true;
        try {
            const ack = await getParsedGeminiResponse(chat, `Đang làm nét ảnh cho ${nameUser}`, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, ack);
            if (upscaler && upscaler.run) {
                await upscaler.run({ api, event, args: [] });
            } else {
                api.sendMessage("Module làm nét chưa có.", threadID, messageID);
            }
        } catch (e) {
            console.error("upscale error:", e);
            api.sendMessage("Làm nét ảnh thất bại.", threadID, messageID);
        } finally { isProcessing[threadID] = false; }
        return;
    }

    // Analyze image
    if (analyzeTrigger) {
        if (isProcessing[threadID]) return;
        isProcessing[threadID] = true;
        try {
            const imgFile = event.messageReply.attachments.find(att => att.type === "photo" || att.type === "image" || att.type === "png" || att.type === "jpg");
            if (!imgFile) { api.sendMessage("Vui lòng reply ảnh để phân tích.", threadID, messageID); isProcessing[threadID] = false; return; }
            const ack = await getParsedGeminiResponse(chat, `Đang phân tích ảnh cho ${nameUser}`, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, ack);
            const analysis = await phantich(imgFile.url);
            const filtered = filterSpecialChars(analysis);
            api.sendMessage(filtered, threadID, messageID);
        } catch (e) {
            console.error("analyze image error:", e);
            api.sendMessage("Phân tích ảnh thất bại.", threadID, messageID);
        } finally { isProcessing[threadID] = false; }
        return;
    }

    // Add / kick via mentions quick commands
    if (addTrigger) {
        const tagged = Object.keys(event.mentions)[0];
        if (!tagged) return api.sendMessage("Không tìm thấy người được tag.", threadID, messageID);
        try {
            await new Promise((res, rej) => api.addUserToGroup(tagged, threadID, (err) => err ? rej(err) : res()));
            api.sendMessage("Đã mời người được tag vào nhóm.", threadID, messageID);
        } catch (e) {
            console.error("addTrigger error:", e);
            api.sendMessage("Không thể mời người này.", threadID, messageID);
        }
        return;
    }

    if (kickTrigger) {
        const tagged = Object.keys(event.mentions)[0];
        if (!tagged) return api.sendMessage("Không tìm thấy người được tag.", threadID, messageID);
        try {
            const threadInfo = await api.getThreadInfo(threadID);
            const isAdmin = (threadInfo.adminIDs || []).some(a => String(a.id) === String(senderID)) || (global.config.ADMINBOT || []).includes(senderID);
            if (!isAdmin) return api.sendMessage("Bạn không có quyền kick.", threadID, messageID);
            await new Promise((res, rej) => api.removeUserFromGroup(tagged, threadID, (err) => err ? rej(err) : res()));
            api.sendMessage("Đã kick người được tag.", threadID, messageID);
        } catch (e) {
            console.error("kickTrigger error:", e);
            api.sendMessage("Không thể kick người này.", threadID, messageID);
        }
        return;
    }

    // Video / Music quick triggers
    if (videoTrigger) {
        if (isProcessing[threadID]) return api.sendMessage("Bot đang xử lý, đợi chút.", threadID, messageID);
        isProcessing[threadID] = true;
        try {
            let search = body.replace(/bot|sói|video/gi, "").trim();
            if (!search) {
                const ack = await getParsedGeminiResponse(chat, `Người dùng ${nameUser} muốn video nhưng chưa nói tên. Hỏi họ muốn xem gì.`, eventDetails);
                sendGeminiMessageToUser(api, threadID, messageID, ack);
                isProcessing[threadID] = false;
                return;
            }
            const ack = await getParsedGeminiResponse(chat, `Đang tìm video: ${search}`, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, ack);
            await processAndSendMedia(api, threadID, messageID, senderID, search, {
                mediaType: 'Video', quality: '480p', fileExt: '.mp4',
                logPrefix: 'video_direct', successMsgPrefix: '🎬 Video của bạn đây:', itemTypeForMsg: 'video', commandLogName: 'goibot_video_direct'
            });
        } catch (e) {
            console.error("video trigger error:", e);
            api.sendMessage("Lỗi khi gửi video.", threadID, messageID);
        } finally { isProcessing[threadID] = false; }
        return;
    }

    if (musicTrigger) {
        if (isProcessing[threadID]) return api.sendMessage("Bot đang xử lý, đợi chút.", threadID, messageID);
        isProcessing[threadID] = true;
        try {
            let search = body.replace(/bot|sói|nhạc/gi, "").trim();
            if (!search) {
                const ack = await getParsedGeminiResponse(chat, `Người dùng ${nameUser} muốn nhạc nhưng chưa nói tên. Hỏi họ muốn nghe gì.`, eventDetails);
                sendGeminiMessageToUser(api, threadID, messageID, ack);
                isProcessing[threadID] = false;
                return;
            }
            const ack = await getParsedGeminiResponse(chat, `Đang tìm nhạc: ${search}`, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, ack);
            await processAndSendMedia(api, threadID, messageID, senderID, search, {
                mediaType: 'Audio', quality: '128k', fileExt: '.mp3',
                logPrefix: 'music_direct', successMsgPrefix: '🎶 Nhạc của bạn đây:', itemTypeForMsg: 'bài hát', commandLogName: 'goibot_music_direct', isGeminiRequest: true
            });
        } catch (e) {
            console.error("music trigger error:", e);
            api.sendMessage("Lỗi khi gửi nhạc.", threadID, messageID);
        } finally { isProcessing[threadID] = false; }
        return;
    }

    // Fallback: use Gemini chat for general messages (only if invoked or addressed)
    if (invoked || isReplyToBot) {
        if (isProcessing[threadID]) return;
        isProcessing[threadID] = true;
        try {
            const botMsgContainer = await getParsedGeminiResponse(chat, body, eventDetails);
            // send immediate text reply (if parsed)
            sendGeminiMessageToUser(api, threadID, messageID, botMsgContainer);

            // Now process JSON actions fully (if any)
            let AI = botMsgContainer.parsedContent || null;
            if (!AI && botMsgContainer.rawText) {
                try { AI = JSON.parse(botMsgContainer.rawText); } catch { AI = null; }
            }
            if (!AI || typeof AI !== "object") {
                // already sent fallback text above
                isProcessing[threadID] = false;
                return;
            }

            // HANDLER: sử dụng đoạn xử lý AI tổng hợp (giống như đoạn bạn đã chốt)
            // Mình tái sử dụng phần xử lý toàn diện đã soạn sẵn ở bên dưới vào 1 hàm nhỏ để tái dùng.
            await (async function handleAIActions(AIobj) {
                const behavior = (AIobj.HanhVi || AIobj.hanh_dong || AIobj.action || AIobj.behavior || "traloi").toString().toLowerCase();
                const answer = AIobj.TraLoi || AIobj.traloi || AIobj.text || AIobj.message || "";
                const extra = AIobj.Json || AIobj.json || AIobj.data || {};

                async function safeSendText(txt) { if (!txt) return; try { await api.sendMessage(txt, threadID, messageID); } catch (e) { console.error("safeSendText error:", e); } }
                function resolveMentionId(m) {
                    if (!m) return null;
                    if (/^\d+$/.test(String(m))) return String(m);
                    if (event.mentions) {
                        for (const k of Object.keys(event.mentions)) {
                            const name = event.mentions[k];
                            if (name && String(name).includes(String(m).replace('@',''))) return k;
                        }
                    }
                    return null;
                }

                // Implement same behaviors as earlier (traloi, tagall, nickname, kick, add, set/remove admin,
                // change_title, change_emoji, change_thread_image, image, multi_image, video, audio, file, analyze_image, upscale, menu, rank)
                // For brevity we re-call many actions using helper code above.

                switch (behavior) {
                    case "traloi":
                    case "reply":
                        return await safeSendText(answer || botMsgContainer.rawText || "...");
                    case "tagall":
                        try {
                            const info = await api.getThreadInfo(threadID);
                            const pids = info.participantIDs || [];
                            const mentions = [];
                            let bodyText = (answer && answer.length ? answer + "\n\n" : "");
                            for (const id of pids) {
                                if (String(id) === String(await api.getCurrentUserID())) continue;
                                const nameObj = (info.userInfo && info.userInfo.find(u => u.id === id)) || {};
                                const name = nameObj.name || "Thành viên";
                                mentions.push({ tag: name, id });
                                bodyText += `@${name} `;
                            }
                            await api.sendMessage({ body: bodyText, mentions }, threadID, messageID);
                        } catch (e) { console.error("tagall error:", e); await safeSendText("Không thể tagall."); }
                        return;
                    case "nickname":
                    case "doi_biet_danh": {
                        const uid = extra.user_id || extra.id || resolveMentionId(extra.user || extra.user_id);
                        const newName = extra.biet_danh_moi || extra.name || extra.nick;
                        if (!uid || !newName) return await safeSendText("Thiếu dữ liệu JSON: cần { user_id, biet_danh_moi }");
                        try { await api.changeNickname(newName, threadID, uid); return await safeSendText(`✅ Đã đổi biệt danh: ${newName}`); } catch (e) { console.error("nickname error:", e); return await safeSendText("Không thể đổi biệt danh."); }
                    }
                    case "kick":
                    case "kick_nguoi_dung": {
                        const uid = extra.user_id || extra.id || resolveMentionId(extra.user || extra.user_id);
                        if (!uid) return await safeSendText("Thiếu dữ liệu JSON: cần { user_id }");
                        try {
                            const threadInfo = await api.getThreadInfo(threadID);
                            const isAdmin = (threadInfo.adminIDs || []).some(a => String(a.id) === String(senderID)) || (global.config.ADMINBOT || []).includes(senderID);
                            if (!isAdmin) return await safeSendText("Bạn không có quyền kick.");
                            await new Promise((res, rej) => api.removeUserFromGroup(uid, threadID, (err) => err ? rej(err) : res()));
                            return await safeSendText(`✅ Đã kick ${uid}`);
                        } catch (e) { console.error("kick action error:", e); return await safeSendText("Kick thất bại."); }
                    }
                    case "add":
                    case "add_nguoi_dung": {
                        const uid = extra.user_id || extra.id || resolveMentionId(extra.user || extra.user_id);
                        if (!uid) return await safeSendText("Thiếu dữ liệu JSON: cần { user_id }");
                        try { await new Promise((res, rej) => api.addUserToGroup(uid, threadID, (err) => err ? rej(err) : res())); return await safeSendText(`✅ Đã mời ${uid}`); } catch (e) { console.error("add error:", e); return await safeSendText("Mời thất bại."); }
                    }
                    case "set_admin":
                    case "set_qtv": {
                        const uid = extra.user_id || extra.id || resolveMentionId(extra.user || extra.user_id);
                        if (!uid) return await safeSendText("Thiếu dữ liệu JSON: cần { user_id }");
                        try { await new Promise((res, rej) => api.changeAdminStatus(threadID, uid, true, (err) => err ? rej(err) : res())); return await safeSendText(`✅ Đã set admin ${uid}`); } catch (e) { console.error("set admin error:", e); return await safeSendText("Set admin thất bại."); }
                    }
                    case "remove_admin":
                    case "go_qtv": {
                        const uid = extra.user_id || extra.id || resolveMentionId(extra.user || extra.user_id);
                        if (!uid) return await safeSendText("Thiếu dữ liệu JSON: cần { user_id }");
                        try { await new Promise((res, rej) => api.changeAdminStatus(threadID, uid, false, (err) => err ? rej(err) : res())); return await safeSendText(`✅ Đã gỡ admin ${uid}`); } catch (e) { console.error("remove admin error:", e); return await safeSendText("Gỡ admin thất bại."); }
                    }
                    case "change_title":
                    case "doi_ten_nhom": {
                        const title = extra.ten_moi || extra.title || extra.name;
                        if (!title) return await safeSendText("Thiếu dữ liệu JSON: cần { ten_moi }");
                        try { await api.setTitle(title, threadID, messageID); return await safeSendText(`✅ Đã đổi tên nhóm: ${title}`); } catch (e) { console.error("change_title error:", e); return await safeSendText("Đổi tên nhóm thất bại."); }
                    }
                    case "change_emoji":
                    case "doi_icon_box": {
                        const emoji = extra.icon;
                        if (!emoji) return await safeSendText("Thiếu dữ liệu JSON: cần { icon }");
                        try { await api.changeThreadEmoji(emoji, threadID); return await safeSendText(`✅ Đã đổi emoji: ${emoji}`); } catch (e) { console.error("change_emoji error:", e); return await safeSendText("Đổi emoji thất bại."); }
                    }
                    case "change_thread_image":
                    case "doi_hinh_box": {
                        const urlImg = extra.url || extra.image || (event.messageReply && event.messageReply.attachments && event.messageReply.attachments[0] && event.messageReply.attachments[0].url);
                        if (!urlImg) return await safeSendText("Thiếu dữ liệu: cần { url } hoặc reply ảnh");
                        try {
                            const res = await axios.get(encodeURI(urlImg), { responseType: 'arraybuffer' });
                            const tmp = path.join(__dirname, 'cache', `thread_img_${Date.now()}.jpg`);
                            if (!fs.existsSync(path.join(__dirname,'cache'))) fs.mkdirSync(path.join(__dirname,'cache'),{recursive:true});
                            fs.writeFileSync(tmp, Buffer.from(res.data));
                            await new Promise((res2,rej2) => api.changeGroupImage(fs.createReadStream(tmp), threadID, (err) => err ? rej2(err) : res2()));
                            safeUnlink(tmp);
                            return await safeSendText("✅ Đã đổi ảnh nhóm.");
                        } catch (e) { console.error("change_thread_image error:", e); return await safeSendText("Đổi ảnh nhóm thất bại."); }
                    }
                    case "image":
                    case "create_image":
                    case "tao_anh": {
                        const promptFor = extra.prompt || answer || extra.text || "";
                        if (!promptFor) return await safeSendText("Thiếu prompt để tạo ảnh.");
                        try {
                            if (image && image.run) { await image.run({ api, event, args: [promptFor] }); return; }
                            const ratio = extra.ratio || "auto";
                            const api_key = extra.api_key || "satoru-deptrai-2025";
                            const url = `https://gemini.satoru.site/prompt=${encodeURIComponent(promptFor)}&ratio=${encodeURIComponent(ratio)}&api_key=${encodeURIComponent(api_key)}`;
                            const res = await axios.get(url, { responseType: 'arraybuffer' });
                            const tmp = path.join(__dirname, 'cache', `genimg_${Date.now()}.png`);
                            if (!fs.existsSync(path.join(__dirname,'cache'))) fs.mkdirSync(path.join(__dirname,'cache'),{recursive:true});
                            fs.writeFileSync(tmp, Buffer.from(res.data));
                            await api.sendMessage({ body: "Ảnh của bạn đây", attachment: createReadStream(tmp) }, threadID, () => safeUnlink(tmp), messageID);
                            return;
                        } catch (e) { console.error("image action error:", e); return await safeSendText("Tạo ảnh thất bại."); }
                    }
                    case "multi_image":
                    case "multiimage":
                    case "multi": {
                        const images = extra.images || extra.urls || "";
                        const promptFor = extra.prompt || answer || "";
                        const ratio = extra.ratio || "auto";
                        const api_key = extra.api_key || "satoru-deptrai-2025";
                        try {
                            if (images && promptFor) {
                                const urls = Array.isArray(images) ? images.join(",") : images;
                                const url = `https://gemini.satoru.site/prompt=${encodeURIComponent(promptFor)}&images=${encodeURIComponent(urls)}&ratio=${encodeURIComponent(ratio)}&api_key=${encodeURIComponent(api_key)}`;
                                const res = await axios.get(url, { responseType: 'arraybuffer' });
                                const tmp = path.join(__dirname, 'cache', `editimg_${Date.now()}.png`);
                                if (!fs.existsSync(path.join(__dirname,'cache'))) fs.mkdirSync(path.join(__dirname,'cache'),{recursive:true});
                                fs.writeFileSync(tmp, Buffer.from(res.data));
                                await api.sendMessage({ body: "Ảnh đã chỉnh sửa", attachment: createReadStream(tmp) }, threadID, () => safeUnlink(tmp), messageID);
                                return;
                            } else if (promptFor) {
                                const url = `https://gemini.satoru.site/prompt=${encodeURIComponent(promptFor)}&ratio=${encodeURIComponent(ratio)}&api_key=${encodeURIComponent(api_key)}`;
                                const res = await axios.get(url, { responseType: 'arraybuffer' });
                                const tmp = path.join(__dirname, 'cache', `genimg_${Date.now()}.png`);
                                if (!fs.existsSync(path.join(__dirname,'cache'))) fs.mkdirSync(path.join(__dirname,'cache'),{recursive:true});
                                fs.writeFileSync(tmp, Buffer.from(res.data));
                                await api.sendMessage({ body: "Ảnh của bạn đây", attachment: createReadStream(tmp) }, threadID, () => safeUnlink(tmp), messageID);
                                return;
                            } else {
                                return await safeSendText("Dữ liệu images không hợp lệ.");
                            }
                        } catch (e) { console.error("multi_image error:", e); return await safeSendText("Xử lý ảnh đa ảnh thất bại."); }
                    }
                    case "video":
                    case "send_video": {
                        if (extra.keyword) {
                            await processAndSendMedia(api, threadID, messageID, senderID, extra.keyword, { mediaType: 'Video', quality: extra.quality || '360p', fileExt: '.mp4', logPrefix: 'video_gem', successMsgPrefix: '🎬 Video:', itemTypeForMsg: 'video', commandLogName: 'goibot_video_gem' });
                            return;
                        }
                        if (extra.url) {
                            try {
                                const res = await axios.get(encodeURI(extra.url), { responseType: 'arraybuffer' });
                                const tmp = path.join(__dirname, 'cache', `file_${Date.now()}.mp4`);
                                fs.writeFileSync(tmp, Buffer.from(res.data));
                                await api.sendMessage({ body: answer || "Video", attachment: createReadStream(tmp) }, threadID, () => safeUnlink(tmp), messageID);
                                return;
                            } catch (e) { console.error("send_video url error:", e); return await safeSendText("Không thể gửi video từ URL."); }
                        }
                        return;
                    }
                    case "voice":
                    case "audio":
                    case "send_audio": {
                        if (extra.keyword) {
                            await processAndSendMedia(api, threadID, messageID, senderID, extra.keyword, { mediaType: 'Audio', quality: extra.quality || '128k', fileExt: '.mp3', logPrefix: 'audio_gem', successMsgPrefix: '🎶 Audio:', itemTypeForMsg: 'bài hát', commandLogName: 'goibot_audio_gem', isGeminiRequest:true });
                            return;
                        }
                        if (extra.url) {
                            try {
                                const res = await axios.get(encodeURI(extra.url), { responseType: 'arraybuffer' });
                                const tmp = path.join(__dirname, 'cache', `audio_${Date.now()}.mp3`);
                                fs.writeFileSync(tmp, Buffer.from(res.data));
                                await api.sendMessage({ body: answer || "Audio", attachment: createReadStream(tmp) }, threadID, () => safeUnlink(tmp), messageID);
                                return;
                            } catch (e) { console.error("send_audio url error:", e); return await safeSendText("Không thể gửi audio từ URL."); }
                        }
                        return;
                    }
                    case "file":
                    case "send_file": {
                        if (!extra.url) return await safeSendText("Thiếu dữ liệu JSON: cần { url }");
                        try {
                            const res = await axios.get(encodeURI(extra.url), { responseType: 'arraybuffer' });
                            const fileName = extra.filename || `file_${Date.now()}`;
                            const tmp = path.join(__dirname, 'cache', fileName);
                            if (!fs.existsSync(path.join(__dirname,'cache'))) fs.mkdirSync(path.join(__dirname,'cache'),{recursive:true});
                            fs.writeFileSync(tmp, Buffer.from(res.data));
                            await api.sendMessage({ body: answer || "File", attachment: createReadStream(tmp) }, threadID, () => safeUnlink(tmp), messageID);
                            return;
                        } catch (e) { console.error("send_file error:", e); return await safeSendText("Không thể gửi file từ URL."); }
                    }
                    case "analyze_image":
                    case "phan_tich_anh": {
                        const imgurl = extra.url || (event.messageReply && event.messageReply.attachments && event.messageReply.attachments[0] && event.messageReply.attachments[0].url);
                        if (!imgurl) return await safeSendText("Cần reply ảnh hoặc cung cấp url trong JSON.");
                        try {
                            const analysis = await phantich(imgurl);
                            const filtered = filterSpecialChars(analysis);
                            return await safeSendText(filtered);
                        } catch (e) { console.error("analyze_image error:", e); return await safeSendText("Phân tích ảnh thất bại."); }
                    }
                    case "upscale":
                    case "lam_net_anh":
                    case "upscaler": {
                        try {
                            if (upscaler && upscaler.run) { await upscaler.run({ api, event, args: [] }); return; }
                            return await safeSendText("Module làm nét chưa cài.");
                        } catch (e) { console.error("upscale action error:", e); return await safeSendText("Làm nét thất bại."); }
                    }
                    case "menu": {
                        try { if (menu && menu.run) { await menu.run({ api, event, args: [] }); return; } return await safeSendText(answer || "Menu không khả dụng."); } catch (e) { console.error("menu action error:", e); return await safeSendText("Menu lỗi."); }
                    }
                    case "rank": {
                        try { const rankModule = require("./rank"); if (rankModule && rankModule.run) { await rankModule.run({ api, event, args: [] }); return; } return await safeSendText("Module rank chưa cài."); } catch (e) { console.error("rank error:", e); return await safeSendText("Rank lỗi."); }
                    }
                    default:
                        return await safeSendText(answer || botMsgContainer.rawText || "Bot đã nhận nhưng không hiểu hành vi.");
                }
            })(AI);
        } catch (e) {
            console.error("invoked fallback error:", e);
        } finally {
            isProcessing[threadID] = false;
        }
        return;
    }

    // End handleEvent
};

// Runner command: enable/disable per-thread
module.exports.run = async ({ api, event, args }) => {
    const threadID = event.threadID;
    const messageID = event.messageID;
    const isTurningOn = args[0] === "on";
    const isTurningOff = args[0] === "off";

    try {
        let data = {};
        try { data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")); } catch (e) { data = {}; }
        if (isTurningOn) {
            data[threadID] = true;
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
            return api.sendMessage("✅ Đã bật goibot ở nhóm này.", threadID, messageID);
        } else if (isTurningOff) {
            data[threadID] = false;
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
            return api.sendMessage("☑ Đã tắt goibot ở nhóm này.", threadID, messageID);
        } else {
            // toggle or show status
            const current = data[threadID] === undefined ? true : data[threadID];
            return api.sendMessage(`Trạng thái goibot: ${current ? "Bật" : "Tắt"}`, threadID, messageID);
        }
    } catch (error) {
        console.error("run command error:", error);
        return api.sendMessage("Đã có lỗi khi thay đổi trạng thái!", threadID, messageID);
    }
};

// ========== Additional utility functions used above ==========

// phantich function (image analysis) - simplified; uses genAI vision if available
async function phantich(api_url) {
    if (!genAI) {
        // fallback: download image and return basic info
        try {
            const res = await axios.get(api_url, { responseType: 'arraybuffer' });
            const img_path = path.join(__dirname, 'cache', `${Date.now()}.jpg`);
            if (!fs.existsSync(path.join(__dirname,'cache'))) fs.mkdirSync(path.join(__dirname,'cache'),{recursive:true});
            fs.writeFileSync(img_path, res.data);
            // simple fallback: return image size and path
            const stats = fs.statSync(img_path);
            const info = `Kích thước ảnh: ${(stats.size/1024).toFixed(2)} KB. (Phân tích nâng cao cần module genAI)`;
            safeUnlink(img_path);
            return info;
        } catch (e) {
            console.error("phantich fallback error:", e);
            return "Đã xảy ra lỗi trong quá trình phân tích ảnh.";
        }
    }
    try {
        const visionModel = genAI.getGenerativeModel({ model: model.model });
        const prompt = "phân tích ảnh này";
        const res = await axios.get(api_url, { responseType: 'arraybuffer' });
        const img_path = path.join(__dirname, `/cache/${Date.now()}.jpg`);
        fs.writeFileSync(img_path, res.data);
        const imageData = { inlineData: { data: Buffer.from(fs.readFileSync(img_path)).toString("base64"), mimeType: "image/png" } };
        const result = await visionModel.generateContent([prompt, imageData]);
        safeUnlink(img_path);
        return result?.response?.text() || "Không có kết quả phân tích.";
    } catch (error) {
        console.error("phantich error:", error);
        return "Đã xảy ra lỗi trong quá trình phân tích ảnh.";
    }
}
