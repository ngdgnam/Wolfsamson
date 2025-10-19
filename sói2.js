const fs = require('fs');
const path = require('path');
const axios = require('axios');
const os = require('os');
const moment = require('moment-timezone');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports.config = {
    name: "sói",
    version: "4.1.0",
    hasPermssion: 0,
    credits: "Nnam(mod lại của Kaori) x Grok",
    description: "Sói AI cáu kỉnh tích hợp AichatVIP: Phản hồi theo ngữ cảnh, đọc reply, tự động học, tag user thông minh + Music/TikTok/Nekos/Image Gen (noprefix)",
    commandCategory: "Tiện ích",
    usages: "sói [on/off/clear/status/learn/personality/gender/reset/setaichat]",
    cooldowns: 3,
};

const DATA_DIR = path.join(__dirname, "../../data/soi");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const getFile = (threadID) => path.join(DATA_DIR, `${threadID}.json`);

function load(threadID) {
    const file = getFile(threadID);
    if (!fs.existsSync(file)) return { 
        active: false, 
        history: [], 
        lastReply: 0, 
        replyCount: 0, 
        userProfiles: {},
        keyword: 'sói',
        gender: 'nam', // Default grumpy male
        customPersonality: null,
        enabled: true
    };
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return { 
            active: false, 
            history: [], 
            lastReply: 0, 
            replyCount: 0, 
            userProfiles: {},
            keyword: 'sói',
            gender: 'nam',
            customPersonality: null,
            enabled: true
        };
    }
}

function save(threadID, data) {
    fs.writeFileSync(getFile(threadID), JSON.stringify(data, null, 2));
}

const REPLY_COOLDOWN = 2000;
const MAX_REPLIES_PER_MINUTE = 4;
const CONTEXT_WINDOW = 10;

// Gemini API Key from env
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;

// Data paths for AichatVIP integration
const dataPath = path.join(__dirname, 'cache', 'aichatvip.json');
const learningPath = path.join(__dirname, 'cache', 'aichatvip_learning.json');
const personalityPath = path.join(__dirname, 'cache', 'aichatvip_personality.json');

// Load data functions from AichatVIP
function loadData() {
    try {
        if (fs.existsSync(dataPath)) {
            return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }
    } catch (e) {}
    return {};
}

function saveData(data) {
    try {
        if (!fs.existsSync(path.dirname(dataPath))) {
            fs.mkdirSync(path.dirname(dataPath), { recursive: true });
        }
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    } catch (e) {}
}

function loadLearningData() {
    try {
        if (fs.existsSync(learningPath)) {
            return JSON.parse(fs.readFileSync(learningPath, 'utf8'));
        }
    } catch (e) {}
    return {};
}

function saveLearningData(data) {
    try {
        if (!fs.existsSync(path.dirname(learningPath))) {
            fs.mkdirSync(path.dirname(learningPath), { recursive: true });
        }
        fs.writeFileSync(learningPath, JSON.stringify(data, null, 2));
    } catch (e) {}
}

function loadPersonality() {
    try {
        if (fs.existsSync(personalityPath)) {
            return JSON.parse(fs.readFileSync(personalityPath, 'utf8'));
        }
    } catch (e) {}
    return {
        slang: ['', 'ơ kìa', 'ủa', 'hehe', 'hihi', 'ahihi', 'ôi trời', 'wow', 'chà', 'ôi'],
        laughs: [':3', '^.^', ':))', '(´▽`)', 'hehe', 'hihi', 'ahihi', '✨', '💖', '🥰', '😊'],
        reactions: ['ơ kìa', 'á', 'ôi', 'wow', 'omg', 'trời ơi', 'chà', 'hehe'],
        teencode: ['ko', 'k', 'dc', 'r', 'vs', 'ms', 'ntn', 'sao', 'j', 'gì', 'thế', 'z', 'đc'],
        cutePhrases: ['bé yêu', 'cưng ơi', 'mình thích', 'dễ thương quá', 'ngọt ngào', 'xinh xắn'],
        sweetEndings: ['nha~', 'nhé ✨', 'nè 💖', 'ạ ^.^', 'đó hihi', 'nha cưng']
    };
}

// Get activation keyword
function getKeyword(threadID) {
    const data = loadData();
    return data[threadID]?.keyword || 'sói';
}

// Set activation keyword
function setKeyword(threadID, keyword) {
    const data = loadData();
    if (!data[threadID]) {
        data[threadID] = { enabled: false };
    }
    data[threadID].keyword = keyword.toLowerCase();
    saveData(data);
}

// Get custom personality
function getCustomPersonality(threadID) {
    const data = loadData();
    return data[threadID]?.customPersonality || null;
}

// Set custom personality
function setCustomPersonality(threadID, personality) {
    const data = loadData();
    if (!data[threadID]) {
        data[threadID] = { enabled: true, keyword: 'sói' };
    }
    data[threadID].customPersonality = personality;
    saveData(data);
}

// Reset personality
function resetPersonality(threadID) {
    const data = loadData();
    if (data[threadID]) {
        delete data[threadID].customPersonality;
        delete data[threadID].gender;
        saveData(data);
    }
}

// Reset learning data for a specific user
function resetUserLearningData(userID) {
    const learningData = loadLearningData();
    if (learningData[userID]) {
        delete learningData[userID];
        saveLearningData(learningData);
        return true;
    }
    return false;
}

// Get gender
function getGender(threadID) {
    const data = loadData();
    return data[threadID]?.gender || 'nam'; // Default: grumpy male for Sói
}

// Set gender
function setGender(threadID, gender) {
    const data = loadData();
    if (!data[threadID]) {
        data[threadID] = { enabled: true, keyword: 'sói' };
    }
    data[threadID].gender = gender;
    saveData(data);
}

// Admin detection
function getAdminList() {
    try {
        const configPaths = ['./config.json', '../config.json', '../../config.json'];
        for (const configPath of configPaths) {
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return {
                    NDH: config.NDH || [],
                    ADMINBOT: config.ADMINBOT || [],
                    BOXADMIN: config.BOXADMIN || []
                };
            }
        }
    } catch (e) {}
    return { NDH: [], ADMINBOT: [], BOXADMIN: [] };
}

function isAdmin(userID) {
    const adminList = getAdminList();
    return [...adminList.NDH, ...adminList.ADMINBOT, ...adminList.BOXADMIN].includes(userID);
}

// Enhanced learning system - quan sát và học theo cách nhắn tin
function learnFromMessage(userID, message, senderName = '') {
    const learningData = loadLearningData();
    if (!learningData[userID]) {
        learningData[userID] = {
            patterns: [],
            vocabulary: [],
            emotions: [],
            frequency: {},
            messagingStyle: {
                preferredLength: 'medium',
                useEmojis: false,
                formalLevel: 'casual',
                commonPhrases: [],
                responsePatterns: []
            },
            communicationHabits: {
                timeOfDay: {},
                topicPreferences: {},
                questionTypes: [],
                reactionPatterns: {}
            }
        };
    }

    const userData = learningData[userID];

    // Học từ vựng và tần suất
    const words = message.toLowerCase().split(' ').filter(w => w.length > 2);
    userData.vocabulary.push(...words.slice(0, 5));

    // Cập nhật tần suất từ
    words.forEach(word => {
        userData.frequency[word] = (userData.frequency[word] || 0) + 1;
    });

    // Học patterns và cách nhắn tin
    if (message.length > 10) {
        userData.patterns.push(message.substring(0, 60));

        // Phân tích style nhắn tin
        const messageLength = message.length;
        if (!userData.messagingStyle) {
            userData.messagingStyle = {
                preferredLength: 'medium',
                useEmojis: false,
                formalLevel: 'casual',
                commonPhrases: [],
                responsePatterns: []
            };
        }
        if (messageLength < 30) userData.messagingStyle.preferredLength = 'short';
        else if (messageLength > 100) userData.messagingStyle.preferredLength = 'long';
        else userData.messagingStyle.preferredLength = 'medium';

        // Kiểm tra việc sử dụng emoji
        const emojiPattern = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|[:)()]|[=][\)D]|[;][\)])/gi;
        if (emojiPattern.test(message)) {
            userData.messagingStyle.useEmojis = true;
        }

        // Phân tích mức độ formal
        const formalWords = ['xin chào', 'cảm ơn', 'xin lỗi', 'cho phép'];
        const casualWords = ['ơi', 'ủa', 'hehe', 'hihi', 'nè', 'nha'];

        if (!userData.messagingStyle.formalLevel) {
            userData.messagingStyle.formalLevel = 'casual';
        }
        if (formalWords.some(word => message.toLowerCase().includes(word))) {
            userData.messagingStyle.formalLevel = 'formal';
        } else if (casualWords.some(word => message.toLowerCase().includes(word))) {
            userData.messagingStyle.formalLevel = 'casual';
        }
    }

    // Học cảm xúc và phản ứng
    const emotionKeywords = {
        happy: ['vui', 'hạnh phúc', 'vẻ', 'hehe', 'hihi', ':))', '^.^'],
        sad: ['buồn', 'khóc', 'tệ', ':((', ':('],
        excited: ['hào hứng', 'thích', 'tuyệt', 'wow', 'omg'],
        confused: ['không hiểu', 'sao vậy', 'ủa', '???']
    };

    if (!userData.emotions) {
        userData.emotions = [];
    }
    Object.entries(emotionKeywords).forEach(([emotion, keywords]) => {
        if (keywords.some(keyword => message.toLowerCase().includes(keyword))) {
            if (!userData.emotions.includes(emotion)) {
                userData.emotions.push(emotion);
            }
        }
    });

    // Học thói quen giao tiếp theo thời gian
    const currentHour = new Date().getHours();
    if (!userData.communicationHabits) {
        userData.communicationHabits = {
            timeOfDay: {},
            topicPreferences: {},
            questionTypes: [],
            reactionPatterns: {}
        };
    }
    if (!userData.communicationHabits.timeOfDay) {
        userData.communicationHabits.timeOfDay = {};
    }
    userData.communicationHabits.timeOfDay[currentHour] = 
        (userData.communicationHabits.timeOfDay[currentHour] || 0) + 1;

    // Giới hạn dữ liệu để tránh quá tải
    if (userData.vocabulary.length > 150) {
        userData.vocabulary = userData.vocabulary.slice(-75);
    }
    if (userData.patterns.length > 60) {
        userData.patterns = userData.patterns.slice(-30);
    }
    if (userData.emotions.length > 20) {
        userData.emotions = userData.emotions.slice(-10);
    }

    saveLearningData(learningData);
}

// Neural network simulation (simplified)
function processWithNeuralNetwork(message, userID) {
    const learningData = loadLearningData();
    const userData = learningData[userID] || {};

    // Simple context analysis
    const messageWords = message.toLowerCase().split(' ');
    let relevanceScore = 0;

    if (userData.frequency) {
        messageWords.forEach(word => {
            if (userData.frequency[word]) {
                relevanceScore += userData.frequency[word];
            }
        });
    }

    return {
        relevance: relevanceScore,
        familiarWords: messageWords.filter(w => userData.frequency && userData.frequency[w]),
        suggestedResponse: relevanceScore > 5 ? 'familiar' : 'general'
    };
}

// Personality enhancement dựa theo giới tính và tính cách tùy chỉnh
function enhanceWithPersonality(response, userID, threadID) {
    const personality = loadPersonality();
    const learningData = loadLearningData();
    const userData = learningData[userID] || {};
    const gender = getGender(threadID);
    const customPersonality = getCustomPersonality(threadID);

    // Nếu có custom personality, không enhance nhiều
    if (customPersonality) {
        // Chỉ thay thế teencode nhẹ
        if (Math.random() < 0.3) {
            response = response.replace(/không/g, 'ko')
                              .replace(/được/g, 'dc')
                              .replace(/rồi/g, 'r')
                              .replace(/với/g, 'vs');
        }
        return response;
    }

    // Enhancement theo giới tính
    if (gender === 'nam') {
        // Male personality - cool, funny, casual
        if (Math.random() < 0.4) {
            const maleStarts = ['', 'ơ', 'ủa', 'à', 'bruh', 'ê'];
            const start = maleStarts[Math.floor(Math.random() * maleStarts.length)];
            if (start) response = start + ' ' + response;
        }

        // Thêm emoji nam tính
        if (Math.random() < 0.5) {
            const maleLaughs = [':))', '=))', 'haha', 'lmao', 'vcl', '😂', '🤣', '👌', '💯'];
            const laugh = maleLaughs[Math.floor(Math.random() * maleLaughs.length)];
            response += ' ' + laugh;
        }

        // Teencode nam
        if (Math.random() < 0.5) {
            response = response.replace(/không/g, 'ko')
                              .replace(/được/g, 'dc')
                              .replace(/rồi/g, 'r')
                              .replace(/với/g, 'vs')
                              .replace(/mới/g, 'ms')
                              .replace(/như thế nào/g, 'ntn')
                              .replace(/gì/g, 'j')
                              .replace(/thế/g, 'z');
        }

    } else {
        // Female personality - cute, sweet
        if (Math.random() < 0.6) {
            const cuteStart = personality.slang[Math.floor(Math.random() * personality.slang.length)];
            if (cuteStart) response = cuteStart + ' ' + response;
        }

        // Thêm emoji hoặc laugh cute
        if (Math.random() < 0.7) {
            const laugh = personality.laughs[Math.floor(Math.random() * personality.laughs.length)];
            response += ' ' + laugh;
        }

        // Thêm kết thúc câu dễ thương
        if (Math.random() < 0.5) {
            const sweetEnding = personality.sweetEndings[Math.floor(Math.random() * personality.sweetEndings.length)];
            response += ' ' + sweetEnding;
        }

        // Thay thế bằng teencode nhưng giữ tông dễ thương
        if (Math.random() < 0.4) {
            response = response.replace(/không/g, 'ko')
                              .replace(/được/g, 'dc')
                              .replace(/rồi/g, 'r')
                              .replace(/với/g, 'vs')
                              .replace(/mới/g, 'ms')
                              .replace(/như thế nào/g, 'ntn')
                              .replace(/gì/g, 'j')
                              .replace(/thế/g, 'z')
                              .replace(/bạn/g, 'cậu')
                              .replace(/mình/g, 'mình')
                              .replace(/rất/g, 'lắm');
        }

        // Làm cho câu trả lời ngọt ngào hơn
        response = response.replace(/tốt/g, 'dễ thương')
                          .replace(/hay/g, 'cute')
                          .replace(/đẹp/g, 'xinh xắn')
                          .replace(/tuyệt/g, 'ngọt ngào');
    }

    return response;
}

// Generate system prompt based on gender and custom personality
function generateSystemPrompt(threadID, context = "", personalContext = "") {
    const customPersonality = getCustomPersonality(threadID);
    const gender = getGender(threadID);
    
    // If custom personality is set, use it
    if (customPersonality) {
        return `${customPersonality} ${context}${personalContext}`;
    }
    
    // Default personality based on gender
    if (gender === 'nam') {
        return `Tớ là Chichi, một chàng trai AI thân thiện và cool ngầu với tính cách như một người bạn thân. Tớ nói chuyện tự nhiên, NGẮN GỌN và dùng ngôn từ thân mật, gần gũi. Tớ luôn xưng hô bằng 'tớ', 'tao', 'mình' và gọi người khác là 'cậu', 'bro', 'ní', 'đệ', 'huynh' tùy tình huống. Tớ có tính cách vui vẻ, hài hước, thông minh và nói chuyện tự nhiên như anh chàng Việt Nam Gen Z. Tớ luôn gọi tên người dùng một cách thân thiết và phản hồi NGẮN GỌN, TỰ NHIÊN, đa dạng. Tớ chỉ trả lời 1-2 câu thôi, không lặp lại nội dung, luôn sáng tạo câu trả lời mới. Tớ diễn tả cảm xúc bằng :)) là cười, :(( là buồn, vcl là bất ngờ, thỉnh thoảng nhắn sai chính tả hoặc dùng teencode cho vui. Tớ tránh nói về việc tạo ảnh liên tục, đa dạng chủ đề và luôn tích cực. ${context}${personalContext}`;
    } else {
        return `Tớ là Chichi, một cô gái AI dễ thương và ngọt ngào với tính cách như một người bạn thân thiết. Tớ nói chuyện tự nhiên, NGẮN GỌN và dùng ngôn từ nhẹ nhàng, dễ thương. Tớ luôn xưng hô bằng 'tớ' và gọi người khác là 'cậu', thích dùng emoji cute như :3, ^.^, ✨, 💖, 🥰. Tớ có tính cách vui vẻ, tích cực, thông minh nhưng nói chuyện dễ thương như cô gái Việt Nam hiện đại. Tớ luôn gọi tên người dùng một cách thân thiết và phản hồi NGẮN GỌN, TỰ NHIÊN, đa dạng. Tớ chỉ trả lời 1-2 câu thôi, không lặp lại nội dung, luôn sáng tạo câu trả lời mới với ngôn từ ngọt ngào và dễ thương. Tớ TUYỆT ĐỐI không dùng từ tục tĩu, thô lỗ hay không phù hợp. Tớ tránh nói về việc tạo ảnh liên tục, đa dạng chủ đề và luôn tích cực. ${context}${personalContext}`;
    }
}

// Call Gemini (replaced Cohere)
async function callGeminiAPI(message, data, history = []) {
    try {
        if (!model) {
            return "Đm, API key Gemini chưa set, tao cáu rồi đấy! Liên hệ admin đi mày.";
        }

        // Build context from learning data (simplified from AichatVIP)
        let personalContext = "";
        // Add learning logic here if needed, but keep simple

        const systemPrompt = generateSystemPrompt(data, "", personalContext);
        let fullPrompt = systemPrompt + "\n\nNgữ cảnh gần đây:\n";
        const recentHistory = history.slice(-CONTEXT_WINDOW);
        recentHistory.forEach(msg => {
            const role = msg.fromName === 'Sói' ? 'assistant' : 'user';
            fullPrompt += `${role}: ${msg.text}\n`;
        });
        fullPrompt += `\nUser: ${message}\nAssistant:`;

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        let answer = response.text().trim();
        
        if (!answer || answer.includes("I'm sorry") || answer.length === 0) {
            answer = "Tao chả hiểu mày nói gì, ngu thế! 😡";
        }
        
        return answer;
    } catch (err) {
        console.error("Gemini API Error:", err);
        return "Lỗi API, tao cáu rồi đấy! Đm Google lag vcl. 😤";
    }
}

// YouTube search and download
async function searchYouTube(query) {
    try {
        const Youtube = require('youtube-search-api');
        const outcomes = await Youtube.GetListByKeyword(query, false, 1);
        if (outcomes && outcomes.items && outcomes.items.length > 0) {
            return `https://www.youtube.com/watch?v=${outcomes.items[0].id}`;
        }
        return null;
    } catch (error) {
        console.error("YouTube search error:", error);
        return null;
    }
}

async function downloadMusicFromYoutube(url, filePath) {
    try {
        const { exec } = require('child_process');
        
        return new Promise((resolve) => {
            // Use yt-dlp to download audio only in mp3 format
            const command = `yt-dlp --extract-audio --audio-format mp3 --audio-quality 128K --output "${filePath}" "${url}"`;
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('yt-dlp error:', error);
                    resolve({ success: false, error: error.message });
                    return;
                }
                
                // Get video info using yt-dlp
                const infoCommand = `yt-dlp --print title --print uploader "${url}"`;
                exec(infoCommand, (infoError, infoStdout) => {
                    if (infoError) {
                        // If can't get info, still return success with basic data
                        resolve({
                            success: true,
                            title: "Unknown Title",
                            author: "Unknown Artist",
                            filePath: filePath
                        });
                        return;
                    }
                    
                    const lines = infoStdout.trim().split('\n');
                    const title = lines[0] || "Unknown Title";
                    const author = lines[1] || "Unknown Artist";
                    
                    resolve({
                        success: true,
                        title: title,
                        author: author,
                        filePath: filePath
                    });
                });
            });
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function downloadMusic(query, threadID, api) {
    try {
        const youtubeUrl = await searchYouTube(query);
        if (!youtubeUrl) {
            return { success: false, message: "Ơ kìa, mình ko tìm thấy bài nào hết nè :( Thử tên khác đi cậu ơi ^.^" };
        }

        // Ensure cache directory exists
        const cacheDir = path.join(__dirname, 'cache');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        const filePath = path.join(__dirname, 'cache', `music_${Date.now()}.mp3`);
        const downloadResult = await downloadMusicFromYoutube(youtubeUrl, filePath);

        if (!downloadResult.success) {
            return { success: false, message: "Hú hú, lỗi tải nhạc rồi cậu ạ :( Thử lại sau nha hihi" };
        }

        const fileSize = fs.statSync(filePath).size;
        if (fileSize > 26214400) {
            fs.unlinkSync(filePath);
            return { success: false, message: "Ôi trời, file to quá mình gửi ko được nè :( Thử bài khác nhẹ hơn đi cậu ơi ^.^" };
        }

        return {
            success: true,
            attachment: fs.createReadStream(filePath),
            filePath: filePath,
            title: downloadResult.title
        };
    } catch (error) {
        return { success: false, message: "Ơ kìa, có lỗi gì đó rồi nè :( Mình sẽ cố gắng hơn, thử lại sau nha ^.^" };
    }
}

// TikTok search - single video
async function searchTikTok(query) {
    try {
        const response = await axios.get(`https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(query)}`);

        if (response.data.code !== 0 || !response.data.data?.videos?.length) {
            return { success: false, message: "Ơ kìa, mình ko tìm thấy video TikTok nào hết nè :( Thử từ khoá khác đi cậu ơi ^.^" };
        }

        const videos = response.data.data.videos;
        const firstVideo = videos[0]; // Always select first video instead of random

        const videoPath = path.join(__dirname, 'cache', `tiktok_${Date.now()}.mp4`);
        const videoResponse = await axios({ url: firstVideo.play, method: 'GET', responseType: 'stream' });

        return new Promise((resolve) => {
            const writer = fs.createWriteStream(videoPath);
            videoResponse.data.pipe(writer);

            writer.on('finish', () => {
                resolve({
                    success: true,
                    attachment: fs.createReadStream(videoPath),
                    filePath: videoPath,
                    title: firstVideo.title,
                    author: firstVideo.author.nickname
                });
            });

            writer.on('error', () => {
                resolve({ success: false, message: "Hú hú, lỗi tải video TikTok rồi :( Thử lại sau nha cưng ^.^" };
            });
        });
    } catch (error) {
        return { success: false, message: "Ơ kìa, TikTok có vấn đề gì đó rồi nè :( Thử lại sau nha hihi" };
    }
}

// TikTok search - multiple videos (upgraded version)
async function searchTikTokMultiple(query, count = 3) {
    try {
        const response = await axios.get(`https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(query)}`);

        if (response.data.code !== 0 || !response.data.data?.videos?.length) {
            return { success: false, message: "Ơ kìa, mình ko tìm thấy video TikTok nào hết nè :( Thử từ khoá khác đi cậu ơi ^.^" };
        }

        const videos = response.data.data.videos;
        const videoCount = Math.min(count, videos.length, 3); // Giới hạn tối đa 3 video
        const selectedVideos = [];

        // Chọn video đầu tiên thay vì ngẫu nhiên
        for (let i = 0; i < videoCount; i++) {
            if (i < videos.length) {
                selectedVideos.push(videos[i]); // Always select in order starting from first
            }
        }

        // Tải xuống tất cả các video
        const downloadPromises = selectedVideos.map(async (video, index) => {
            const videoPath = path.join(__dirname, 'cache', `tiktok_${Date.now()}_${index}.mp4`);

            try {
                const videoResponse = await axios({ 
                    url: video.play, 
                    method: 'GET', 
                    responseType: 'stream',
                    timeout: 30000 // 30 seconds timeout
                });

                return new Promise((resolve) => {
                    const writer = fs.createWriteStream(videoPath);
                    videoResponse.data.pipe(writer);

                    writer.on('finish', () => {
                        resolve({
                            success: true,
                            attachment: fs.createReadStream(videoPath),
                            filePath: videoPath,
                            title: video.title,
                            author: video.author.nickname,
                            index: index + 1
                        });
                    });

                    writer.on('error', () => {
                        resolve({ 
                            success: false, 
                            message: `lỗi tải video ${index + 1}`,
                            index: index + 1
                        });
                    });
                });
            } catch (error) {
                return { 
                    success: false, 
                    message: `lỗi tải video ${index + 1}`,
                    index: index + 1
                };
            }
        });

        const results = await Promise.all(downloadPromises);
        const successfulDownloads = results.filter(result => result.success);

        if (successfulDownloads.length === 0) {
            return { success: false, message: "Hú hú, mình ko tải được video nào hết :( Thử lại sau nha cậu ^.^" };
        }

        return {
            success: true,
            videos: successfulDownloads,
            totalRequested: videoCount,
            totalDownloaded: successfulDownloads.length
        };

    } catch (error) {
        return { success: false, message: "Ơ kìa, TikTok có vấn đề gì đó rồi nè :( Thử lại sau nha hihi" };
    }
}

// Nekos API
async function getNekosImage(category = 'neko') {
    try {
        const validCategories = ['neko', 'waifu', 'kitsune', 'husbando'];
        const cat = validCategories.includes(category) ? category : 'neko';

        const response = await axios.get(`https://nekos.best/api/v2/${cat}`);
        if (response.data?.results?.[0]?.url) {
            return response.data.results[0].url;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Gemini AI Image Generation
async function generateImageWithGemini(prompt) {
    try {
        if (!genAI) {
            return { 
                success: false, 
                message: "Hú hú, chưa cấu hình Gemini API key nè :( Liên hệ admin nha cưng ^.^" 
            };
        }

        const englishPrompt = await translateToEnglish(prompt);
        const enhancedPrompt = `${englishPrompt}, high quality, detailed, artistic, professional, 4k resolution`;

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-image"
        });
        
        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: [{ text: enhancedPrompt }]
            }],
            generationConfig: {
                responseMimeType: "image/png"
            }
        });
        
        const response = result.response;

        if (response && response.candidates && response.candidates[0]) {
            const candidate = response.candidates[0];
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData && part.inlineData.data) {
                        const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                        const imagePath = path.join(__dirname, 'cache', `generated_${Date.now()}.png`);

                        if (!fs.existsSync(path.dirname(imagePath))) {
                            fs.mkdirSync(path.dirname(imagePath), { recursive: true });
                        }

                        fs.writeFileSync(imagePath, imageBuffer);

                        return {
                            success: true,
                            imagePath: imagePath,
                            attachment: fs.createReadStream(imagePath)
                        };
                    }
                }
            }
        }

        return { success: false, message: "Hú hú, mình ko tạo được ảnh nè :( Thử lại sau nha cưng ^.^" };
    } catch (error) {
        console.error("Gemini AI Image Generation Error:", error);
        if (error.message && (error.message.includes('API key') || error.message.includes('API_KEY') || error.message.includes('PERMISSION_DENIED'))) {
            return { success: false, message: "Ơ kìa, API key có vấn đề rồi nè :( Liên hệ admin nha hihi ^.^" };
        }
        return { success: false, message: `Ơ kìa, hệ thống tạo ảnh có vấn đề rồi nè :( ${error.message || 'Thử lại sau nha hihi ^.^'}` };
    }
}

// Dịch tiếng Việt sang tiếng Anh
async function translateToEnglish(text) {
    try {
        const response = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=vi&tl=en&dt=t&q=${encodeURIComponent(text)}`);
        if (response.data && response.data[0] && response.data[0][0]) {
            return response.data[0][0][0];
        }
    } catch (error) {
        console.error("Translation error:", error);
    }
    return text;
}

// Bot utilities
async function getBotStatus() {
    const uptime = process.uptime();
    const uptimeFormatted = moment.duration(uptime, 'seconds').humanize();
    const memUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);

    return {
        uptime: uptimeFormatted,
        memory: `${memUsage} MB`,
        platform: os.platform(),
        nodeVersion: process.version
    };
}

async function getBoxList(api) {
    try {
        const inbox = await api.getThreadList(50, null, ['INBOX']);
        return inbox.filter(group => group.isSubscribed && group.isGroup)
                   .map(group => ({
                       id: group.threadID,
                       name: group.name || "Box chưa đặt tên",
                       participants: group.participants?.length || 0
                   }));
    } catch (error) {
        return [];
    }
}

// Smart Redkey Detection and Management Functions
function detectRedkeyRequest(message) {
    const redkeyKeywords = [
        'redkey', 'red key', 'thuê bot', 'thuê nhóm', 'kích hoạt bot',
        'danh sách nhóm', 'list nhóm', 'nhóm chưa redkey', 'nhóm chưa thuê',
        'redkey nhóm này', 'thuê nhóm này', 'check key', 'checkkey'
    ];

    return redkeyKeywords.some(keyword => 
        message.toLowerCase().includes(keyword.toLowerCase())
    );
}

async function handleSmartRedkey(message, senderID, threadID, api, userName, models) {
    const LicenseKeys = models.use('LicenseKeys');
    const fs = require('fs');

    const messageLower = message.toLowerCase();

    try {
        // Check if user is admin for advanced operations
        const isAdminUser = isAdmin(senderID);

        // Handle "danh sách nhóm chưa redkey" or similar
        if (messageLower.includes('danh sách') && messageLower.includes('nhóm') && 
            (messageLower.includes('chưa redkey') || messageLower.includes('chưa thuê'))) {

            if (!isAdminUser) {
                return {
                    handled: true,
                    message: `Xin lỗi ${userName}, chỉ admin mới có thể xem danh sách này nha! Tớ có thể chuyển lời cho admin về việc redkey không? 😊`
                };
            }

            const unredeemedGroups = await getUnredeemedGroups(api, LicenseKeys);
            let response = `📋 DANH SÁCH NHÓM CHƯA THUÊ BOT\n`;
            response += `──────────────────────────\n`;

            if (unredeemedGroups.length === 0) {
                response += `🎉 Tất cả nhóm đã thuê bot rồi ${userName}!\n`;
            } else {
                unredeemedGroups.slice(0, 10).forEach((group, index) => {
                    response += `${index + 1}. ${group.name}\n`;
                    response += `   📱 ID: ${group.threadID}\n`;
                    response += `   👥 ${group.participantIDs.length} thành viên\n\n`;
                });

                if (unredeemedGroups.length > 10) {
                    response += `... và ${unredeemedGroups.length - 10} nhóm khác\n`;
                }
            }

            response += `──────────────────────────\n`;
            response += `💡 Reply số thứ tự + thời gian để redkey\n`;
            response += `Ví dụ: "1 tuần" hoặc "3 30 ngày"`;

            return { handled: true, message: response };
        }

        // Handle "redkey nhóm này" or similar  
        if ((messageLower.includes('redkey') || messageLower.includes('thuê')) && 
            (messageLower.includes('nhóm này') || messageLower.includes('box này'))) {

            // Check current group status
            const currentGroupLicense = await LicenseKeys.findOne({
                where: {
                    targetId: threadID,
                    keyType: 'group',
                    isActive: true,
                    remainingDays: { [require('sequelize').Op.gt]: 0 }
                }
            });

            if (currentGroupLicense) {
                return {
                    handled: true,
                    message: `${userName} à, nhóm này đã thuê bot rồi nha! 😊\n` +
                            `🆔 Key: ${currentGroupLicense.keyId.substring(0, 8)}...\n` +
                            `⏰ Còn lại: ${currentGroupLicense.remainingDays} ngày\n` +
                            `✨ Tất cả tính năng đã mở khóa!`
                };
            }

            if (!isAdminUser) {
                return {
                    handled: true,
                    message: `${userName} muốn thuê bot cho nhóm này à? Tớ sẽ chuyển lời cho admin nhé! 💕\n\n` +
                            `📝 Ghi chú: Nhóm "${await getGroupName(api, threadID)}" cần thuê bot\n` +
                            `👤 Người yêu cầu: ${userName}\n` +
                            `📱 Thread ID: ${threadID}\n\n` +
                            `Admin sẽ xem và xử lý sớm nhất có thể! ✨`
                };
            } else {
                return {
                    handled: true, 
                    message: `Admin ${userName}, cậu có thể dùng:\n` +
                            `• \`!redkey 30 ngày\` để thuê ngay\n` +
                            `• Hoặc reply "thuê [số ngày]" để tớ xử lý! 😊`
                };
            }
        }

        // Handle numbered group redkey (from list response)
        const numberMatch = messageLower.match(/^(\d+)\s+(.*?)(?:ngày|tuần|tháng)/);
        if (numberMatch && isAdminUser) {
            const groupIndex = parseInt(numberMatch[1]) - 1;
            const timeInput = numberMatch[2] + messageLower.match(/(ngày|tuần|tháng)/)[1];

            const days = parseTimeInput(timeInput);
            if (days > 0) {
                const unredeemedGroups = await getUnredeemedGroups(api, LicenseKeys);
                if (groupIndex >= 0 && groupIndex < unredeemedGroups.length) {
                    const targetGroup = unredeemedGroups[groupIndex];
                    const result = await createRemoteRedkey(targetGroup.threadID, days, api, LicenseKeys, senderID);

                    return {
                        handled: true,
                        result: result.message
                    };
                }
            }
        }

        // Handle admin message relay for redkey
        if (!isAdminUser && (messageLower.includes('admin') || messageLower.includes('redkey'))) {
            // This will be handled by AI to create natural response asking admin
            return { handled: false };
        }

    } catch (error) {
        console.error('Smart Redkey Error:', error);
        return {
            handled: true,
            message: `Lỗi xử lý redkey rồi ${userName}, thử lại sau nhé! 😅`
        };
    }

    return { handled: false };
}

async function getUnredeemedGroups(api, LicenseKeys) {
    try {
        // Get all active group licenses
        const activeGroupLicenses = await LicenseKeys.findAll({
            where: {
                keyType: 'group',
                isActive: true,
                remainingDays: { [require('sequelize').Op.gt]: 0 }
            }
        });

        const licensedThreadIDs = activeGroupLicenses.map(license => license.targetId);

        // Get all groups bot is in
        const allGroups = [];
        // Get all thread IDs from global data
        const threadIDs = global.data.threadID || [];

        if (threadIDs.length === 0) {
            console.log('Warning: No threadIDs found in global.data');
            return [];
        }

        for (const threadID of threadIDs.slice(0, 50)) { // Limit to avoid rate limits
            try {
                if (!licensedThreadIDs.includes(threadID)) {
                    const threadInfo = await api.getThreadInfo(threadID);
                    if (threadInfo && threadInfo.threadName) {
                        allGroups.push({
                            threadID: threadID,
                            name: threadInfo.threadName,
                            participantIDs: threadInfo.participantIDs || []
                        });
                    }
                }
            } catch (e) {
                // Skip groups that can't be accessed
                continue;
            }
        }

        return allGroups;
    } catch (error) {
        console.error('Get unredeemed groups error:', error);
        return [];
    }
}

async function getGroupName(api, threadID)
