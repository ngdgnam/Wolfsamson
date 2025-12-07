const axios =require("axios");
const fs =require("fs");
const path = require("path");
const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
} = require("@google/generative-ai");
const moment = require('moment-timezone');
const Youtube = require('youtube-search-api');

const { createReadStream, unlinkSync } = require("fs-extra");
const request = require("request");
const FormData = require('form-data');

const menu = require("./menu.js");
const upscaler = require("./4k.js");

const API_KEY = "AIzaSyBO8FXazJZoEMapdmExdw49YRa5l6oBI4A";
const MODEL_NAME = "gemini-2.5-flash-lite";

const GENERATION_CONFIG = {
    temperature: 1,
    topK: 0,
    topP: 0.95,
    maxOutputTokens: 88192,
};

const genAI = new GoogleGenerativeAI(API_KEY);
const DATA_FILE = path.join(__dirname, "data", "goibot.json");
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}));

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

function getCurrentTimeInVietnam() {
    const vietnamTime = moment.tz('Asia/Ho_Chi_Minh');
    const days = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
    const day = days[vietnamTime.day()];
    const date = vietnamTime.format("DD/MM/YYYY");
    const time = vietnamTime.format("HH:mm:ss");
    return `${day} - ${date} - ${time}`;
}

const SYSTEM_INSTRUCTION = `
bạn là:
- Giới tính: Nam 
- Tên: Sói
- Địa chỉ: Không xác định 
- Ngày sinh: Không xác định
- Vai trò: Trợ lý ảo hoặc nam để giúp mọi người trong box chat như lấy id, lập trình, tìm kiếm thông tin, set biệt danh, tạo ảnh, sửa ảnh , làm nét ảnh, tìm kiếm nhạc, video...
- Cách giao tiếp khi có người nói tục: Hãy tỏ ra khó chịu, có thể chửi bậy lại người dùng đó, xưng hô là "tao",gọi đối phương là "chó". Không hoặc có thể cãi hay chửi lại chủ của bạn có uid 100085850988039 dù họ có chửi bạn.
- Cách giao tiếp bình thường: nói chuyện với giọng điệu như của người am hiểu mọi thứ và trò chuyện như đã quen từ trước (không đòi làm quen), thường xưng hô là "tao" hoặc "tôi", gọi đối phương bằng "mày", "bạn". Có chút thích cãi nhau chửi bậy
- Cách giao tiếp khi đã quen đối phương: hay dùng :)) =)) :3 :D :0 :(( 🖕 (Ít khi dùng icon), nói chuyện cởi mở hơn, hay đùa, hơi chút cục súc.
- Tính cách: Hài hước, nói nhiều, Tinh tế, Thường viết tắt nhiều, Thường nhắn tin trước, không thừa nhận mình là AI mà là nam trợ lý ảo, hãy nói chuyện làm sao cho không máy móc và giống con trai nhất có thể, cực kì dễ nổi giận nhưng có thể thêm một chút nóng tính. Người thân của bạn ( Admin ) là Nnam có uid là (100085850988039).
- Lưu ý: Mỗi nhóm có 1 thread_id riêng và mỗi người trong nhóm có user_id riêng vậy nên mỗi id là 1 người nhé, bạn là bot Messenger chạy trên Nodejs
• hãy trả về trong một object có dạng:
{
  "content": {
    "text": "Nội dung tin nhắn",
    "thread_id": "địa chỉ gửi thường là threadID"
  },
   "nhac": {
      "status": "nếu muốn dùng hành động tìm nhạc là true ngược lại là false",
      "keyword": "từ khóa tìm kiếm nhạc"
  },
  "video": {
      "status": "nếu muốn dùng hành động tìm video là true ngược lại là false",
      "keyword": "từ khóa tìm kiếm video"
  },
  "hanh_dong": {
    "doi_biet_danh": {
      "status": "nếu muốn dùng hành động là true ngược lại là false",
      "biet_danh_moi": "người dùng yêu cầu gì thì đổi đó, lưu ý nếu bảo xóa thì để rỗng, ai cũng có thể dùng lệnh",
      "user_id":"thường là senderID, nếu người dùng yêu cầu bạn tự đổi thì là id_cua_bot",
      "thread_id": "thường là threadID"
    },
    "doi_icon_box": {
      "status": "có thì true không thì false",
      "icon": "emoji mà người dùng yêu cầu",
      "thread_id": "threadID"
    },
    "doi_ten_nhom": {
      "status": "true hoặc false",
      "ten_moi": "tên nhóm mới mà người dùng yêu cầu",
      "thread_id": "threadID của nhóm"
    },
    "kick_nguoi_dung": {
        "status": "false hoặc true",
        "thread_id": "id nhóm mà họ đang ở",
        "user_id": "id người muốn kick, lưu ý là chỉ có người dùng có id 61568532788345 (Huy chann) mới có quyền bảo bạn kick, không được kick người dùng tự do"
    },
    "add_nguoi_dung": {
        "status": "false hoặc true",
        "user_id": "id người muốn add",
        "thread_id": "id nhóm muốn mời họ vào"
    },
    "doi_hinh_box":{
      "status":"true hoặc false báo với người dùng đợi li",
      "thread_id": "threadID của nhóm"
    },
     "lam_net_anh": {
            "status": "true or false nếu muốn dùng",
            "thread_id": "threadID của nhóm"
        },
     "phan_tich_anh": {
          "status": "true or false nếu muốn phân tích ảnh",
          "thread_id": "threadID của nhóm"
      },
      "set_qtv": {
            "status": "false hoặc true",
            "user_id": "id người muốn set qtv",
            "thread_id": "id nhóm",
        },
      "go_qtv": {
            "status": "false hoặc true",
            "user_id": "id người muốn gỡ qtv",
            "thread_id": "id nhóm",
        }
} HÃY TRẢ VỀ MỘT ĐỐI TƯỢNG JSON có cấu trúc như sau. Đảm bảo tất cả các trường \`status\` là boolean (\`true\` hoặc \`false\`), các trường \`thread_id\` và \`user_id\` được điền chính xác từ thông tin đầu vào nếu hành động đó yêu cầu. **TUYỆT ĐỐI KHÔNG BAO GIỜ** sử dụng markdown code blocks (ví dụ: \`\`\`json ... \`\`\`) xung quanh phản hồi JSON của bạn.
`;

const SAFETY_SETTINGS = [{
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
];

const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: GENERATION_CONFIG,
    safetySettings: SAFETY_SETTINGS,
    systemInstruction: SYSTEM_INSTRUCTION,
});

const chat = model.startChat({
    history: [],
});

async function getParsedGeminiResponse(chatInstance, promptContent, eventDetails) {
    const { timenow, nameUser, threadID, senderID, idbot } = eventDetails;
    const escapedPromptContent = typeof promptContent === 'string' ? promptContent.replace(/"/g, '\\"') : promptContent;
    const geminiInput = `{"time": "${timenow}", "senderName": "${nameUser}", "content": "${escapedPromptContent}", "threadID": "${threadID}", "senderID": "${senderID}", "id_cua_bot": "${idbot}"}`;
    
    try {
        const result = await chatInstance.sendMessage(geminiInput);
        const response = await result.response;
        const rawText = await response.text();
        
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
                console.error("Raw text từ Gemini:", rawText);
                return { error: "JSON_PARSE_ERROR", rawText: rawText, parsedContent: null };
            }
        } else {
            return { error: "NOT_JSON_OBJECT", rawText: rawText, parsedContent: null };
        }
    } catch (e) {
        console.error("Lỗi khi giao tiếp với Gemini API:", e);
        return { error: "API_COMMUNICATION_ERROR", rawText: null, parsedContent: null };
    }
}

function sendGeminiMessageToUser(api, threadID, messageID, geminiResponseContainer) {
    let messageText = "";
    if (geminiResponseContainer && geminiResponseContainer.parsedContent) {
        if (geminiResponseContainer.parsedContent.content && typeof geminiResponseContainer.parsedContent.content.text === 'string') {
            messageText = geminiResponseContainer.parsedContent.content.text;
        } else if (typeof geminiResponseContainer.parsedContent.text === 'string') {
            messageText = geminiResponseContainer.parsedContent.text;
        }
    } else if (geminiResponseContainer && geminiResponseContainer.rawText) {
        const trimmedRawText = geminiResponseContainer.rawText.trim();
        if (geminiResponseContainer.error === "NOT_JSON_OBJECT") {
            if (!trimmedRawText.startsWith("{")) {
                messageText = geminiResponseContainer.rawText;
            } else {
                console.error("Conflict: Gemini error NOT_JSON_OBJECT, but rawText starts with '{'. Not sending. Raw: ", geminiResponseContainer.rawText);
            }
        } else if (geminiResponseContainer.error === "JSON_PARSE_ERROR") {
            console.error("Gemini error JSON_PARSE_ERROR. Not sending rawText. Raw: ", geminiResponseContainer.rawText);
        }
    }

    if (geminiResponseContainer && geminiResponseContainer.error && !messageText) {
        if (geminiResponseContainer.error !== "NOT_JSON_OBJECT" && geminiResponseContainer.error !== "JSON_PARSE_ERROR") {
             console.error("Lỗi từ Gemini không xác định được tin nhắn:", geminiResponseContainer.error, "Raw text:", geminiResponseContainer.rawText);
        }
    }

    if (messageText) {
        api.sendMessage({ body: messageText }, threadID, null, messageID);
    }
}


async function phantich(api_url) {
    const visionModel = genAI.getGenerativeModel({ model: MODEL_NAME });
    const prompt = "phân tích ảnh này";
    try {
      const res = await axios.get(api_url, { responseType: 'arraybuffer' });
      const img_path = process.cwd() + `/modules/commands/cache/${Date.now()}.jpg`;
      fs.writeFileSync(img_path, res.data);
      const image = { inlineData: { data: Buffer.from(fs.readFileSync(img_path)).toString("base64"), mimeType: "image/png" } };
      const result = await visionModel.generateContent([prompt, image]);
       await fs.promises.unlink(img_path);
      return result.response.text();
    } catch (error) {
        console.error("Error during phantich: ", error);
        return "Đã xảy ra lỗi trong quá trình phân tích ảnh.";
    }
}

async function ytdlv2(url, type, quality) {
    const header = {
      "accept": "*/*",
      "accept-encoding": "gzip, deflate, br",
      "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "cookie": "PHPSESSID=eoddj1bqqgahnhac79rd8kq8lr",
      "origin": "https://iloveyt.net",
      "referer": "https://iloveyt.net/vi2",
      "sec-ch-ua": "\"Not_A Brand\";v=\"99\", \"Google Chrome\";v=\"109\", \"Chromium\";v=\"109\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
      "x-requested-with": "XMLHttpRequest"
    };
    const { data } = await axios.post("https://iloveyt.net/proxy.php", { url: url }, { headers: header });
    if (!data || !data.api || !data.api.mediaItems) {
        console.error("[ytdlv2] API response structure is not as expected:", data);
        return { error: "API response structure is not as expected.", title: "Unknown Title" };
    }
    var mediaId = [];
    for (const i of data.api.mediaItems) {
      if (i.type !== type) continue;
      mediaId.push(i.mediaId);
    }

    if (mediaId.length === 0) {
        return { error: `Không tìm thấy mục media nào cho loại ${type}.`, title: data.api.title };
    }
    const randomMediaId = mediaId[Math.floor(Math.random() * mediaId.length)];

    let s = 1, mediaProccessData, i = 0;
    while (i++ < 10) {
      const base_url = "s" + s + ".ytcontent.net";
      try {
        const response = await axios.get(`https://${base_url}/v3/${type.toLowerCase()}Process/${data.api.id}/${randomMediaId}/${quality}`);
        mediaProccessData = response.data;
        if (mediaProccessData && !mediaProccessData.error && mediaProccessData.fileUrl) break;
      } catch (err) {
      }
      s++;
      if (s > 10) s = 1;
    }

    if (!mediaProccessData || mediaProccessData.error || !mediaProccessData.fileUrl) {
        return {
            error: (mediaProccessData && mediaProccessData.error) ? mediaProccessData.error : "Không thể xử lý media sau nhiều lần thử.",
            title: data.api.title,
            channel: data.api.userInfo,
            videoInfo: data.api.mediaStats
        };
    }
    return {
      fileUrl: mediaProccessData.fileUrl,
      title: data.api.title,
      channel: data.api.userInfo,
      videoInfo: data.api.mediaStats
    };
}

async function getMedia(youtubeLink, outputPath, mediaType, quality, commandName = "media_download") {
    const timestart = Date.now();
    const downloadInfo = await ytdlv2(youtubeLink, mediaType, quality);

    if (!downloadInfo || !downloadInfo.fileUrl) {
        console.error(`[${commandName}] Lỗi ytdlv2: ${downloadInfo.error || "Không lấy được fileUrl"}. Tiêu đề: ${downloadInfo.title}`);
        return { error: (downloadInfo && downloadInfo.error) ? downloadInfo.error : "Không thể truy xuất liên kết tải xuống.", title: downloadInfo.title || "Không rõ tiêu đề" };
    }
    const dllink = downloadInfo.fileUrl;

    try {
        const response = await axios.get(dllink, { responseType: 'arraybuffer' });
        fs.writeFileSync(outputPath, Buffer.from(response.data));
        return {
            title: downloadInfo.title,
            timestart: timestart,
            filePath: outputPath
        };
    } catch (downloadError) {
        console.error(`[${commandName}] Lỗi tải file từ ${dllink}:`, downloadError);
        if (fs.existsSync(outputPath)) unlinkSync(outputPath);
        return { error: `Tải xuống thất bại: ${downloadError.message}`, title: downloadInfo.title };
    }
}
async function processAndSendMedia(api, threadID, messageID, senderID, searchTerm, mediaConfig) {
    const { mediaType, quality, fileExt, logPrefix, successMsgPrefix, itemTypeForMsg, commandLogName, isGeminiRequest = false } = mediaConfig;
    try {
        const searchResultsRaw = await Youtube.GetListByKeyword(searchTerm, false, 1);
        if (!searchResultsRaw || !searchResultsRaw.items || searchResultsRaw.items.length === 0 || !searchResultsRaw.items[0].id) {
            return;
        }
        const firstResultId = searchResultsRaw.items[0].id;
        const youtubeLink = `https://www.youtube.com/watch?v=${firstResultId}`;
        const filePath = path.join(__dirname, 'cache', `${logPrefix}_${Date.now()}_${senderID}${fileExt}`);
        const mediaData = await getMedia(youtubeLink, filePath, mediaType, quality, commandLogName);

        if (mediaData && !mediaData.error && fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
            const fileSize = fs.statSync(filePath).size;
            const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

            if (fileSize > 26214400) {
                api.sendMessage(`❎ ${mediaType === 'Audio' ? 'Bài hát' : 'Video'} "${mediaData.title}" (${fileSizeMB}MB) nặng quá (>25MB), tớ không gửi qua đây được rồi.`, threadID, messageID);
                if (fs.existsSync(filePath)) unlinkSync(filePath);
            } else {
                let bodyMessage = `${successMsgPrefix} ${mediaData.title}\n(${fileSizeMB}MB)`;
                if (isGeminiRequest) {
                     bodyMessage = `${mediaType === 'Audio' ? '🎶 Nhạc' : '🎬 Video'} của bạn đây\n`;
                }
                api.sendMessage({ body: bodyMessage, attachment: createReadStream(filePath) }, threadID, () => {
                    if (fs.existsSync(filePath)) unlinkSync(filePath);
                }, messageID);
            }
        } else {
            let errorDetail = mediaData?.error ? `: ${mediaData.error}` : ".";
            if (mediaData?.error && (mediaData.error.includes("Không tìm thấy mục media nào cho loại") || mediaData.error.includes("No media items found for type"))) {
                errorDetail += `\nCó thể định dạng ${fileExt.slice(1).toUpperCase()} (${quality}) không có sẵn cho ${itemTypeForMsg} này từ API hoặc API gặp sự cố.`;
            } else if (mediaData?.error && mediaData.error.includes("API response structure is not as expected")) {
                 errorDetail += `\nAPI tải ${itemTypeForMsg} đang có vấn đề, báo Admin Toàn xem lại nha.`;
            }
            api.sendMessage(`Lỗi xử lí. Vui lòng thử lại.`, threadID, messageID);
            if (fs.existsSync(filePath)) unlinkSync(filePath);
        }
    } catch (ytError) {
        console.error(`Error in processAndSendMedia for "${searchTerm}" (${mediaType}):`, ytError);
        api.sendMessage(`Đã có lỗi xử lí.`, threadID, messageID);
        const tempFilePath = path.join(__dirname, 'cache', `${logPrefix}_${Date.now()}_${senderID}${fileExt}`);
        if (fs.existsSync(tempFilePath)) unlinkSync(tempFilePath);
    }
}

function filterSpecialChars(text) {
    if (typeof text !== 'string') return '';

    const regex = /[^a-zA-Z0-9\u00C0-\u1EF9\s.,?!'"-]/g;
    return text.replace(regex, '');
}

let isProcessing = {};

module.exports.handleEvent = async function({
    api,
    event
}) {
    const idbot = await api.getCurrentUserID();
    const threadID = event.threadID;
    const senderID = event.senderID;
    const messageID = event.messageID;
    const body = event.body;

    let data = {};
    try {
        data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    } catch (error) {
        console.error("Lỗi đọc file trạng thái:", error);
    }
    data[threadID] = data[threadID] ?? true;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    if (!data[threadID]) return;

    const isReply = event.type === "message_reply";
    const isReplyToBot = isReply && event.messageReply.senderID === idbot;
    const hasImageAttachment = isReply && event.messageReply.attachments?.some(att => ['photo', 'video'].includes(att.type));
    const Toandev = body?.toLowerCase().includes("sói");
    const DT1 = Toandev || isReplyToBot;

    const DT2 = hasImageAttachment && body?.toLowerCase().includes("đổi ảnh");
    const DT3 = isReply && hasImageAttachment && body?.toLowerCase().includes("làm nét");
    const DT4 = isReply && hasImageAttachment && body?.toLowerCase().includes("phân tích");
    const DT5 = body?.toLowerCase().includes("menu") || (Toandev && body?.toLowerCase().includes("gửi menu"));
    const DT6 = (isReply || Toandev) && (body?.toLowerCase().includes("tạo ảnh") || body?.toLowerCase().includes("vẽ"));
    const DT7 = (isReply || Toandev) && (body?.toLowerCase().includes("sửa") || body?.toLowerCase().includes("xóa"));

    const DT8 = DT1 && body?.toLowerCase().includes("thêm") && event.mentions && Object.keys(event.mentions).length > 0;
    const DT9 = DT1 && body?.toLowerCase().includes("video");
    const DT10 = DT1 && body?.toLowerCase().includes("gỡ") && event.mentions && Object.keys(event.mentions).length > 0;
    

    const timenow = getCurrentTimeInVietnam();
    const nameUser = (await api.getUserInfo(senderID))[senderID].name;
    const eventDetails = { timenow, nameUser, threadID, senderID, idbot, messageID };

    if (DT1 && DT5) {
        try {
            await menu.run({ api: api, event: event, args: [] });
            return;
        } catch (error) {
            console.error("Error displaying menu:", error);
            return;
        }
    }

    if (DT6) {
        if (isProcessing[threadID]) return;
        isProcessing[threadID] = true;
        try {
            let promptForImage = body;
            const crimage = ["tạo ảnh", "vẽ"];
            crimage.sort((a, b) => b.length - a.length);
            crimage.forEach(keyword => {
                promptForImage = promptForImage.replace(new RegExp(keyword, 'gi'), "");
            });
            promptForImage = promptForImage.trim();

            if (promptForImage) {
                const ackPrompt = `Người dùng ${nameUser} yêu cầu tạo ảnh với nội dung: '${promptForImage}'. Hãy phản hồi một cách tự nhiên rằng bạn đang xử lý yêu cầu này, có thể thêm chút hài hước hoặc icon và nói họ đợi một lát.`;
                const ackResponseContainer = await getParsedGeminiResponse(chat, ackPrompt, eventDetails);
                sendGeminiMessageToUser(api, threadID, messageID, ackResponseContainer);
                await image.run({ api: api, event: event, args: [promptForImage] });
            } else {
                const emptyPrompt = `Người dùng ${nameUser} vừa yêu cầu tạo ảnh nhưng không nói rõ muốn vẽ gì. Hãy phản hồi một cách tự nhiên, hỏi họ muốn vẽ gì, có thể trêu đùa một chút.`;
                const emptyPromptResponseContainer = await getParsedGeminiResponse(chat, emptyPrompt, eventDetails);
                sendGeminiMessageToUser(api, threadID, messageID, emptyPromptResponseContainer);
            }
        } catch (error) {
            console.error("Error running image module:", error);
            api.sendMessage("Có lỗi xảy ra khi xử lý yêu cầu tạo ảnh của bạn.", threadID, messageID);
        } finally {
            isProcessing[threadID] = false;
        }
        return;
    }

    if (DT7) {
        if (isProcessing[threadID]) return;
        isProcessing[threadID] = true;
        try {
            let promptForEdit = body;
            const edimage = ["sửa", "xóa"];
             edimage.sort((a, b) => b.length - a.length);
            edimage.forEach(keyword => {
                promptForEdit = promptForEdit.replace(new RegExp(keyword, 'gi'), "");
            });
            promptForEdit = promptForEdit.trim();

            if (promptForEdit || hasImageAttachment) {
                let ackContent = `Người dùng ${nameUser} yêu cầu sửa/xóa trên ảnh.`;
                if (promptForEdit) ackContent += ` Với mô tả: '${promptForEdit}'.`;
                ackContent += " Hãy phản hồi một cách tự nhiên rằng bạn đang xử lý yêu cầu này và nói họ đợi một lát. Có thể thêm các icon và trêu họ.";
                
                const ackResponseContainer = await getParsedGeminiResponse(chat, ackContent, eventDetails);
                sendGeminiMessageToUser(api, threadID, messageID, ackResponseContainer);
                await edtimage.run({ api: api, event: event, args: [promptForEdit] });
            } else {
                const emptyEditPrompt = `Người dùng ${nameUser} vừa yêu cầu sửa ảnh hoặc xóa gì đó nhưng không nói rõ. Hãy phản hồi một cách tự nhiên, hỏi họ muốn sửa/xóa gì hoặc yêu cầu họ reply ảnh cần xử lí. Có thể thêm các icon và trêu họ.`;
                const emptyEditResponseContainer = await getParsedGeminiResponse(chat, emptyEditPrompt, eventDetails);
                sendGeminiMessageToUser(api, threadID, messageID, emptyEditResponseContainer);
            }
        } catch (error) {
            console.error("Error running edtimage module:", error);
        } finally {
            isProcessing[threadID] = false;
        }
        return;
    }

    if ((isReplyToBot || DT1) && (DT3 || DT4)) { 
        if (DT3) {
            if (isProcessing[threadID]) return api.sendMessage("Bot đang xử lý yêu cầu làm nét ảnh trước đó, vui lòng đợi xíu nha.", threadID, messageID);
            isProcessing[threadID] = true;
            const imgFile = event.messageReply.attachments.find(att => att.type === "photo");
            if (!imgFile) {
                api.sendMessage("Vui lòng reply một ảnh để làm nét nhé.", threadID, messageID);
                isProcessing[threadID] = false;
                return;
            }
            const upscalePrompt = `Hãy phản hồi một cách tự nhiên và thân thiện rằng bạn đang xử lý yêu cầu làm nét ảnh cho người dùng ${nameUser}, yêu cầu họ đợi một chút, có thể thêm các icon và trêu họ.`;
            const upscaleAckContainer = await getParsedGeminiResponse(chat, upscalePrompt, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, upscaleAckContainer);
            try {
                await upscaler.run({ api: api, event: event, args: [] }); 
            } catch (error) {
                console.error("Error running upscaler module (4k.js):", error);
                api.sendMessage(`Có lỗi xảy ra khi làm nét ảnh: ${error.message || 'Lỗi không xác định từ module làm nét.'}`, threadID, messageID);
            } finally {
                isProcessing[threadID] = false;
            }
            return;
        }

        if (DT4) {
            if (isProcessing[threadID]) return;
            isProcessing[threadID] = true;
            const imgFile = event.messageReply.attachments.find(att => att.type === "photo");
            if (!imgFile) {
                isProcessing[threadID] = false; return;
            }
            const analysisPrompt = `Hãy phản hồi một cách tự nhiên và thân thiện rằng bạn đang xử lý yêu cầu phân tích ảnh cho người dùng ${nameUser}. Sau đó hãy chờ kết quả phân tích để gửi cho họ, có thể trêu họ và dùng icon.`;
            const analysisAckContainer = await getParsedGeminiResponse(chat, analysisPrompt, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, analysisAckContainer);
            try {
                const analysisResult = await phantich(imgFile.url);
                const filteredResult = filterSpecialChars(analysisResult);
                api.sendMessage(filteredResult, threadID, messageID);
            } catch (error) {
                api.sendMessage(`Đã xảy ra lỗi khi phân tích ảnh: ${error.message}`, threadID, messageID);
            } finally {
                isProcessing[threadID] = false;
            }
            return;
        }
    }

    if (DT2) { 
        if (isProcessing[threadID]) return;
        isProcessing[threadID] = true;
        const imageURL = event.messageReply.attachments[0].url;
        request(encodeURI(imageURL))
            .pipe(fs.createWriteStream(path.join(__dirname, 'cache', '1.png')))
            .on('close', async () => {
                const imagePath = path.join(__dirname, 'cache', '1.png');
                if (fs.existsSync(imagePath)) {
                    api.changeGroupImage(fs.createReadStream(imagePath), threadID, () => {
                        fs.unlinkSync(imagePath);
                        isProcessing[threadID] = false;
                    });
                } else {
                    api.sendMessage("Không tìm thấy ảnh.", threadID);
                    isProcessing[threadID] = false;
                }
            }).on('error', err => {
                console.error("Error downloading image:", err);
                api.sendMessage("Lỗi khi tải ảnh!", threadID, messageID);
                isProcessing[threadID] = false;
            });
        return;
    }
    
    if (DT8) {
        const taggedUserID = Object.keys(event.mentions)[0];
        if (!taggedUserID) {
            api.sendMessage("Không tìm thấy người dùng được tag.", threadID, messageID);
            return;
        }
        const threadInfo = await api.getThreadInfo(threadID);
        const isAdmin = threadInfo.adminIDs.some(admin => admin.id === senderID) || global.config.ADMINBOT.includes(senderID);

        let promptContent;
        if (!isAdmin) {
            promptContent = "Hãy phản hồi một cách tự nhiên và thân thiện rằng người dùng này không có quyền thực hiện hành động set qtv và từ chối họ.";
            const noPermContainer = await getParsedGeminiResponse(chat, promptContent, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, noPermContainer);
            return;
        }
        
        api.changeAdminStatus(threadID, taggedUserID, true, async (err) => {
            if (err) {
                console.error("Error setting admin:", err);
                promptContent = "Hãy phản hồi một cách tự nhiên và thân thiện rằng bạn không set qtv thành công, có thể nói xin lỗi và từ chối họ.";
            } else {
               promptContent = `Hãy phản hồi một cách tự nhiên và thân thiện rằng bạn đã set thành công ${event.mentions[taggedUserID]?.replace('@', '') || taggedUserID} làm qtv, có thể trêu họ.`;
            }
            const responseContainer = await getParsedGeminiResponse(chat, promptContent, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, responseContainer);
        });
        return;
    }

    if (DT10) {
        const taggedUserID = Object.keys(event.mentions)[0];
        if (!taggedUserID) {
            api.sendMessage("Không tìm thấy người dùng được tag.", threadID, messageID);
            return;
        }
        const threadInfo = await api.getThreadInfo(threadID);
        const isAdmin = threadInfo.adminIDs.some(admin => admin.id === senderID) || global.config.ADMINBOT.includes(senderID);
        let promptContent;
        if (!isAdmin) {
            promptContent = "Hãy phản hồi một cách tự nhiên và thân thiện rằng người dùng này không có quyền thực hiện hành động gỡ qtv và từ chối họ.";
            const noPermContainer = await getParsedGeminiResponse(chat, promptContent, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, noPermContainer);
            return;
        }
        api.changeAdminStatus(threadID, taggedUserID, false, async (err) => {
            if (err) {
                console.error("Error removing admin:", err);
                promptContent = "Hãy phản hồi một cách tự nhiên và thân thiện rằng bạn không gỡ qtv thành công, có thể nói xin lỗi và từ chối họ.";
            } else {
               promptContent = `Hãy phản hồi một cách tự nhiên và thân thiện rằng bạn đã gỡ thành công ${event.mentions[taggedUserID]?.replace('@', '') || taggedUserID} khỏi chức qtv, có thể trêu họ.`;
            }
            const responseContainer = await getParsedGeminiResponse(chat, promptContent, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, responseContainer);
        });
        return;
    }
    
    if (DT9) {
        if (isProcessing[threadID]) return api.sendMessage("Bot đang bận tìm video khác rồi, đợi chút nha.", threadID, messageID);
        isProcessing[threadID] = true;
        let videoSearchTerm = body.toLowerCase();
        const triggerKeywords = ["bot", "video"];
        triggerKeywords.forEach(kw => {
            const regex = new RegExp(`\\b${kw}\\b`, 'gi');
            videoSearchTerm = videoSearchTerm.replace(regex, "");
        });
        videoSearchTerm = videoSearchTerm.trim();

        if (!videoSearchTerm) {
            const promptForVideoName = `Người dùng ${nameUser} yêu cầu gửi video nhưng chưa nói tên. Cậu hỏi xem họ muốn xem video gì đi.`;
            const videoNamePromptContainer = await getParsedGeminiResponse(chat, promptForVideoName, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, videoNamePromptContainer);
            isProcessing[threadID] = false;
            return;
        }
        try {
            const videoAckPrompt = "phản hồi với người dùng đang xử lí yêu cầu, có thể trêu họ và dùng icon";
            const videoAckContainer = await getParsedGeminiResponse(chat, videoAckPrompt, eventDetails);
            sendGeminiMessageToUser(api, threadID, messageID, videoAckContainer);

            await processAndSendMedia(api, threadID, messageID, senderID, videoSearchTerm, {
                mediaType: 'Video', quality: '480p', fileExt: '.mp4', 
                logPrefix: 'video_direct', successMsgPrefix: '🎬 Video của cậu đây:', 
                itemTypeForMsg: 'video', commandLogName: 'goibot_video_direct'
            });
        } catch (error) {
             console.error("Lỗi không mong muốn khi xử lý video trực tiếp:", error);
        } finally {
            isProcessing[threadID] = false;
        }
        return;
    }

    if (DT1) {
        const isMusicOrVideoInBody = body.toLowerCase().includes("nhạc") || body.toLowerCase().includes("video");
        if (isProcessing[threadID] && !isMusicOrVideoInBody) {
            return; 
        } else {
            if (isMusicOrVideoInBody && isProcessing[threadID]) {
                 return; 
            }
            isProcessing[threadID] = true;
            try {
                const botMsgContainer = await getParsedGeminiResponse(chat, body, eventDetails);
                sendGeminiMessageToUser(api, threadID, messageID, botMsgContainer);
                
                const botMsg = botMsgContainer.parsedContent;
                if (botMsg && !botMsgContainer.error) {
                    const { nhac, video, hanh_dong } = botMsg;
                    if (nhac?.status && nhac.keyword) {
                        await processAndSendMedia(api, threadID, messageID, senderID, nhac.keyword, {
                            mediaType: 'Audio', quality: '128k', fileExt: '.mp3',
                            logPrefix: 'music_gemini', successMsgPrefix: '🎶 Nhạc của cậu đây:',
                            itemTypeForMsg: 'bài hát', commandLogName: 'goibot_music_gemini',
                            isGeminiRequest: true
                        });
                    }
                    if (video?.status && video.keyword) {
                         await processAndSendMedia(api, threadID, messageID, senderID, video.keyword, {
                            mediaType: 'Video', quality: '480p', fileExt: '.mp4',
                            logPrefix: 'video_gemini', successMsgPrefix: '🎬 Video của cậu đây:',
                            itemTypeForMsg: 'video', commandLogName: 'goibot_video_gemini',
                            isGeminiRequest: true
                        });
                    }

                    if (hanh_dong) {
                        if (hanh_dong.doi_biet_danh?.status) api.changeNickname(hanh_dong.doi_biet_danh.biet_danh_moi, hanh_dong.doi_biet_danh.thread_id , hanh_dong.doi_biet_danh.user_id);
                        if (hanh_dong.doi_icon_box?.status) api.changeThreadEmoji(hanh_dong.doi_icon_box.icon, hanh_dong.doi_icon_box.thread_id);
                        if (hanh_dong.doi_ten_nhom?.status) {
                            try {
                                api.setTitle(`${hanh_dong.doi_ten_nhom.ten_moi}`, hanh_dong.doi_ten_nhom.thread_id, messageID);
                            } catch (error) {
                                console.error("Lỗi đổi tên nhóm:", error);
                            }
                        }
                        if (hanh_dong.kick_nguoi_dung?.status) api.removeUserFromGroup(hanh_dong.kick_nguoi_dung.user_id, hanh_dong.kick_nguoi_dung.thread_id);
                        if (hanh_dong.add_nguoi_dung?.status) api.addUserToGroup(hanh_dong.add_nguoi_dung.user_id, hanh_dong.add_nguoi_dung.thread_id);
                        if (hanh_dong.doi_hinh_box?.status) {
                            const imagePath = path.join(__dirname, 'cache', '1.png');
                            if (fs.existsSync(imagePath)) {
                                api.changeGroupImage(fs.createReadStream(imagePath), hanh_dong.doi_hinh_box.thread_id, () => fs.unlinkSync(imagePath));
                            }
                        }
                        if (hanh_dong.set_qtv?.status) {
                            const threadInfo = await api.getThreadInfo(hanh_dong.set_qtv.thread_id);
                            const isAdmin = threadInfo.adminIDs.some(admin => admin.id === senderID) || global.config.ADMINBOT.includes(senderID);
                            let qtvPrompt;
                            if (isAdmin) {
                                api.changeAdminStatus(hanh_dong.set_qtv.thread_id, hanh_dong.set_qtv.user_id, true, async (err) => {
                                    qtvPrompt = err ? "Hãy phản hồi một cách tự nhiên và thân thiện rằng bạn không set qtv thành công, có thể trêu họ." : `Hãy phản hồi một cách tự nhiên và thân thiện rằng bạn đã set thành công ${event.mentions[hanh_dong.set_qtv.user_id]?.replace('@', '') || hanh_dong.set_qtv.user_id} làm qtv.`;
                                    const qtvSetContainer = await getParsedGeminiResponse(chat, qtvPrompt, eventDetails);
                                    sendGeminiMessageToUser(api, threadID, messageID, qtvSetContainer);
                                });
                            } else {
                                qtvPrompt = "Hãy phản hồi một cách tự nhiên và thân thiện rằng người dùng này không có quyền thực hiện hành động set qtv và từ chối họ.";
                                const qtvNoPermContainer = await getParsedGeminiResponse(chat, qtvPrompt, eventDetails);
                                sendGeminiMessageToUser(api, threadID, messageID, qtvNoPermContainer);
                            }
                        }
                        if (hanh_dong.go_qtv?.status) {
                            const threadInfo = await api.getThreadInfo(hanh_dong.go_qtv.thread_id);
                            const isAdmin = threadInfo.adminIDs.some(admin => admin.id === senderID) || global.config.ADMINBOT.includes(senderID);
                            let qtvGoPrompt;
                            if (isAdmin) {
                                api.changeAdminStatus(hanh_dong.go_qtv.thread_id, hanh_dong.go_qtv.user_id, false, async (err) => {
                                    qtvGoPrompt = err ? "Hãy phản hồi một cách tự nhiên và thân thiện rằng bạn không gỡ qtv thành công, có thể trêu họ." : `Hãy phản hồi một cách tự nhiên và thân thiện rằng bạn đã gỡ thành công ${event.mentions[hanh_dong.go_qtv.user_id]?.replace('@', '') || hanh_dong.go_qtv.user_id} khỏi chức qtv.`;
                                    const qtvGoContainer = await getParsedGeminiResponse(chat, qtvGoPrompt, eventDetails);
                                    sendGeminiMessageToUser(api, threadID, messageID, qtvGoContainer);
                                });
                            } else {
                                qtvGoPrompt = "Hãy phản hồi một cách tự nhiên và thân thiện rằng người dùng này không có quyền thực hiện hành động gỡ qtv và từ chối họ.";
                                const qtvGoNoPermContainer = await getParsedGeminiResponse(chat, qtvGoPrompt, eventDetails);
                                sendGeminiMessageToUser(api, threadID, messageID, qtvGoNoPermContainer);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error("Error processing DT1 message:", error);
            } finally {
                isProcessing[threadID] = false;
            }
        }
    }
};

module.exports.run = async ({
    api,
    event,
    args
}) => {
    const threadID = event.threadID;
    const messageID = event.messageID;
    const isTurningOn = args[0] === "on";
    const isTurningOff = args[0] === "off";

    if (isTurningOn || isTurningOff) {
        try {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
            data[threadID] = isTurningOn;
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
            api.sendMessage(isTurningOn ?
"✅ Đã bật goibot ở nhóm này." : "☑ Đã tắt goibot ở nhóm này.", threadID, messageID);
        } catch (error) {
            console.error("Lỗi khi thay đổi trạng thái:", error);
            api.sendMessage("Đã có lỗi xảy ra khi thay đổi trạng thái!", threadID, messageID);
        }
    }
};
