const fs = require('fs-extra');
const path = require('path');
const moment = require('moment-timezone');

module.exports.config = {
    name: "typett",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "Nnam x Grok",
    description: "Check tương tác theo loại tin nhắn (text/image/video/sticker/file/audio)",
    commandCategory: "group",
    usages: "[text/image/video/sticker/file/audio/all]",
    cooldowns: 5,
    dependencies: {
        "fs-extra": "",
        "moment-timezone": ""
    }
};

const dataPath = __dirname + '/typett/';
if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });

module.exports.onLoad = () => {
    setInterval(() => {
        const today = moment.tz("Asia/Ho_Chi_Minh").day();
        const files = fs.readdirSync(dataPath);
        files.forEach(file => {
            try {
                const fileData = JSON.parse(fs.readFileSync(path.join(dataPath, file)));
                if (fileData.time != today) {
                    setTimeout(() => {
                        const updatedData = JSON.parse(fs.readFileSync(path.join(dataPath, file)));
                        if (updatedData.time != today) {
                            updatedData.time = today;
                            // Reset daily counts for types
                            Object.keys(updatedData.types).forEach(type => {
                                updatedData.types[type].forEach(user => user.count = 0);
                            });
                            if (today === 1) {
                                // Reset weekly if needed, but for simplicity, keep total cumulative
                            }
                            fs.writeFileSync(path.join(dataPath, file), JSON.stringify(updatedData, null, 4));
                        }
                    }, 60000);
                }
            } catch (e) {
                fs.unlinkSync(path.join(dataPath, file));
            }
        });
    }, 60000);
};

module.exports.handleEvent = async function({ api, event, Threads }) {
    if (!event.isGroup || global.client.sending_top) return;
    
    const { threadID, senderID, body, attachments, type } = event;
    const today = moment.tz("Asia/Ho_Chi_Minh").day();
    const threadFile = path.join(dataPath, `${threadID}.json`);
    
    let threadData = {
        types: {
            text: [],
            image: [],
            video: [],
            audio: [],
            sticker: [],
            file: [],
            other: []
        },
        time: today
    };
    
    if (fs.existsSync(threadFile)) {
        threadData = JSON.parse(fs.readFileSync(threadFile, 'utf8'));
    }
    
    // Determine type
    let msgType = 'other';
    if (body && body.trim()) msgType = 'text';
    else if (attachments) {
        if (attachments.some(att => att.type === 'photo')) msgType = 'image';
        else if (attachments.some(att => att.type === 'video')) msgType = 'video';
        else if (attachments.some(att => att.type === 'audio')) msgType = 'audio';
        else if (attachments.some(att => att.type === 'animated_image')) msgType = 'sticker';
        else if (attachments.some(att => att.type === 'file')) msgType = 'file';
    }
    
    if (!threadData.types[msgType]) threadData.types[msgType] = [];
    
    const typeData = threadData.types[msgType];
    const userIdx = typeData.findIndex(u => u.id === senderID);
    
    if (userIdx === -1) {
        typeData.push({ id: senderID, count: 1 });
    } else {
        typeData[userIdx].count++;
    }
    
    // Also update total interactions if needed, but for this module, focus on types
    
    if (threadData.time !== today) {
        global.client.sending_top = true;
        setTimeout(() => global.client.sending_top = false, 300000);
    }
    
    fs.writeFileSync(threadFile, JSON.stringify(threadData, null, 4));
};

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID, mentions, messageReply } = event;
    const query = args[0] ? args[0].toLowerCase() : 'all';
    const threadFile = path.join(dataPath, `${threadID}.json`);
    
    if (!fs.existsSync(threadFile)) {
        return api.sendMessage("⚠️ Chưa có dữ liệu tương tác theo loại.", threadID, messageID);
    }
    
    const threadData = JSON.parse(fs.readFileSync(threadFile, 'utf8'));
    
    let targetType = query;
    if (!['text', 'image', 'video', 'audio', 'sticker', 'file', 'other', 'all'].includes(query)) {
        targetType = 'all';
    }
    
    let data;
    if (targetType === 'all') {
        // Aggregate all types
        data = [];
        const allUsers = new Set();
        Object.values(threadData.types).forEach(typeArr => {
            typeArr.forEach(user => allUsers.add(user.id));
        });
        for (const userID of allUsers) {
            let totalCount = 0;
            Object.values(threadData.types).forEach(typeArr => {
                const userCount = typeArr.find(u => u.id === userID)?.count || 0;
                totalCount += userCount;
            });
            data.push({ id: userID, count: totalCount });
        }
    } else {
        data = threadData.types[targetType] || [];
    }
    
    let storage = await Promise.all(data.map(async item => ({
        ...item,
        name: await Users.getNameUser(item.id) || 'Facebook User'
    })));
    
    storage.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    
    const isListQuery = ['all', 'text', 'image', 'video', 'audio', 'sticker', 'file', 'other'].includes(query);
    const targetID = messageReply ? messageReply.senderID : (mentions && Object.keys(mentions)[0]) ? Object.keys(mentions)[0] : senderID;
    
    let msg = '';
    if (!isListQuery && storage.findIndex(u => u.id === targetID) === -1) {
        return api.sendMessage(`${await Users.getNameUser(targetID) || 'User'} chưa có dữ liệu loại này.`, threadID, messageID);
    }
    
    const header = targetType === 'all' ? '[ Tương Tác Tổng Theo Loại ]\n' :
                   `[ Tương Tác ${targetType.toUpperCase()} ]\n`;
    
    if (isListQuery || Object.keys(mentions).length > 1) {
        // List view
        const body = storage.map((item, idx) => `${idx + 1}. ${item.name} - ${item.count.toLocaleString()} ${targetType === 'all' ? 'lần' : targetType}`).join('\n');
        const footer = `\n💬 Tổng: ${storage.reduce((sum, u) => sum + u.count, 0).toLocaleString()}`;
        msg = `${header}${body}${footer}`;
        
        return api.sendMessage(msg, threadID, messageID);
    } else {
        // Single user detail
        const user = storage.find(u => u.id === targetID);
        if (!user) return api.sendMessage("Không tìm thấy dữ liệu.", threadID, messageID);
        
        let detail = `👤 ${user.name}\n📊 ${targetType.toUpperCase()}: ${user.count.toLocaleString()}`;
        
        if (targetType === 'all') {
            detail += '\n\nChi tiết theo loại:\n';
            Object.entries(threadData.types).forEach(([type, arr]) => {
                const count = arr.find(u => u.id === targetID)?.count || 0;
                if (count > 0) detail += `${type}: ${count}\n`;
            });
        }
        
        msg = `${header}${detail}`;
        return api.sendMessage(msg, threadID, messageID);
    }
};
