const fs = require('fs-extra');
const path = require('path');
const moment = require('moment-timezone');
const axios = require('axios');

module.exports.config = {
    name: "check",
    version: "2.0.0",
    hasPermssion: 0,
    credits: "NNam ( mod lại từ DungUwU && Nghĩa && Grok )",
    description: "Check tương tác ngày/tuần/toàn bộ & lịch sử tin nhắn chi tiết",
    commandCategory: "Thành Viên",
    usages: "[all/week/day/box/reset/lọc <số>/tn <user>]",
    cooldowns: 5,
    dependencies: {
        "fs-extra": "",
        "moment-timezone": "",
        "axios": ""
    }
};

const dataPath = __dirname + '/checktt/';
const historyPath = __dirname + '/data/LOAD_HISTORY_MESSAGES/';

if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });
if (!fs.existsSync(historyPath)) fs.mkdirSync(historyPath, { recursive: true });

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
                            // Reset day counts
                            updatedData.day.forEach(user => user.count = 0);
                            if (today === 1) {
                                // Reset week counts on Monday
                                updatedData.week.forEach(user => user.count = 0);
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
    
    const { threadID, senderID } = event;
    const today = moment.tz("Asia/Ho_Chi_Minh").day();
    const threadFile = path.join(dataPath, `${threadID}.json`);
    
    let threadData = { total: [], week: [], day: [], time: today, last: { time: today, day: [], week: [] } };
    
    if (fs.existsSync(threadFile)) {
        threadData = JSON.parse(fs.readFileSync(threadFile, 'utf8'));
    }
    
    // Initialize users if new thread
    if (!fs.existsSync(threadFile)) {
        const threadInfo = await Threads.getInfo(threadID);
        const userIDs = threadInfo.participantIDs || [];
        for (const user of userIDs) {
            if (!threadData.total.find(u => u.id === user)) threadData.total.push({ id: user, count: 0 });
            if (!threadData.week.find(u => u.id === user)) threadData.week.push({ id: user, count: 0 });
            if (!threadData.day.find(u => u.id === user)) threadData.day.push({ id: user, count: 0 });
            if (!threadData.last.day.find(u => u.id === user)) threadData.last.day.push({ id: user, count: 0 });
            if (!threadData.last.week.find(u => u.id === user)) threadData.last.week.push({ id: user, count: 0 });
        }
        fs.writeFileSync(threadFile, JSON.stringify(threadData, null, 4));
    }
    
    if (threadData.time !== today) {
        global.client.sending_top = true;
        setTimeout(() => global.client.sending_top = false, 300000);
    }
    
    // Update counts
    const totalIdx = threadData.total.findIndex(u => u.id === senderID);
    const weekIdx = threadData.week.findIndex(u => u.id === senderID);
    const dayIdx = threadData.day.findIndex(u => u.id === senderID);
    
    if (totalIdx === -1) {
        threadData.total.push({ id: senderID, count: 1 });
    } else {
        threadData.total[totalIdx].count++;
    }
    
    if (weekIdx === -1) {
        threadData.week.push({ id: senderID, count: 1 });
    } else {
        threadData.week[weekIdx].count++;
    }
    
    if (dayIdx === -1) {
        threadData.day.push({ id: senderID, count: 1 });
    } else {
        threadData.day[dayIdx].count++;
    }
    
    // Filter out left users (simplified, assume participantIDs available via event or cache)
    const threadInfo = await Threads.getInfo(threadID);
    const currentUsers = threadInfo.participantIDs.map(id => id.toString());
    ['total', 'week', 'day', 'last.day', 'last.week'].forEach(key => {
        const arr = key.includes('.') ? threadData.last[key.split('.')[1]] : threadData[key];
        if (arr) arr = arr.filter(u => currentUsers.includes(u.id.toString()));
    });
    
    fs.writeFileSync(threadFile, JSON.stringify(threadData, null, 4));
    
    // Handle history logging for tn feature
    const historyFolder = path.join(historyPath, threadID.toString());
    if (!fs.existsSync(historyFolder)) fs.mkdirSync(historyFolder, { recursive: true });
    const historyFile = path.join(historyFolder, `${senderID}.json`);
    
    let historyData = { messages: [] };
    if (fs.existsSync(historyFile)) {
        historyData = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }
    
    const messageData = {
        body: event.body || '',
        timestamp: event.timestamp,
        attachments: (event.attachments || []).map(att => ({ type: att.type, url: att.url || '' }))
    };
    
    historyData.messages.push(messageData);
    fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2));
};

module.exports.run = async function({ api, event, args, Users, Threads }) {
    const { threadID, messageID, senderID, mentions, messageReply } = event;
    const query = args[0] ? args[0].toLowerCase() : '';
    const threadFile = path.join(dataPath, `${threadID}.json`);
    
    if (!fs.existsSync(threadFile)) {
        return api.sendMessage("⚠️ Chưa có dữ liệu tương tác.", threadID, messageID);
    }
    
    const threadData = JSON.parse(fs.readFileSync(threadFile, 'utf8'));
    const threadInfo = await Threads.getInfo(threadID);
    
    if (query === 'box') {
        // Delegate to box.js if exists, simplified here
        return api.sendMessage(`Tên nhóm: ${threadInfo.threadName}\nThành viên: ${threadInfo.participantIDs.length}`, threadID);
    } else if (query === 'reset') {
        if (!threadInfo.adminIDs.some(admin => admin.id === senderID)) {
            return api.sendMessage("❎ Bạn không đủ quyền hạn.", threadID, messageID);
        }
        fs.unlinkSync(threadFile);
        // Also clear history if needed
        const historyFolder = path.join(historyPath, threadID.toString());
        if (fs.existsSync(historyFolder)) fs.rmSync(historyFolder, { recursive: true });
        return api.sendMessage("✅ Đã reset toàn bộ dữ liệu.", threadID, messageID);
    } else if (query === 'lọc') {
        if (!threadInfo.adminIDs.some(admin => admin.id === senderID) || !threadInfo.isGroup) {
            return api.sendMessage("❎ Không đủ quyền hoặc không phải nhóm.", threadID, messageID);
        }
        if (!args[1] || isNaN(args[1])) {
            return api.sendMessage("⚠️ Sử dụng: check lọc <số tin nhắn>", threadID, messageID);
        }
        const minCount = parseInt(args[1]);
        const kicked = [];
        for (const user of threadInfo.participantIDs) {
            if (user === api.getCurrentUserID()) continue;
            const userTotal = threadData.total.find(u => u.id === user)?.count || 0;
            if (userTotal <= minCount) {
                try {
                    await api.removeUserFromGroup(user, threadID);
                    kicked.push(user);
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return api.sendMessage(`✅ Đã kick ${kicked.length} thành viên có ≤ ${minCount} tin nhắn.`, threadID, messageID);
    } else if (query === 'tn') {
        // History viewer
        const targetID = messageReply ? messageReply.senderID : (mentions && Object.keys(mentions)[0]) ? Object.keys(mentions)[0] : senderID;
        const historyFolder = path.join(historyPath, threadID.toString());
        const historyFile = path.join(historyFolder, `${targetID}.json`);
        
        if (!fs.existsSync(historyFile)) {
            return api.sendMessage(`Không tìm thấy lịch sử cho user ${targetID}.`, threadID, messageID);
        }
        
        let data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        if (data.messages.length === 0) {
            return api.sendMessage("Không có tin nhắn nào.", threadID, messageID);
        }
        
        const pageSize = 20;
        const totalPages = Math.ceil(data.messages.length / pageSize);
        const page = parseInt(args[1]) || 1;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const reversed = [...data.messages].reverse().slice(start, end);
        
        const messagesList = reversed.map((msg, idx) => {
            const num = start + idx + 1;
            const attTypes = msg.attachments.map(att => att.type).join(', ');
            return `${num}. Nội dung: ${msg.body || 'Không có'}\nTime: ${_formatTime(msg.timestamp)}${msg.attachments.length > 0 ? `\nTệp: ${attTypes}` : ''}`;
        }).join('\n');
        
        const body = `Lịch sử tin nhắn của ${await Users.getNameUser(targetID) || 'User'} (Trang ${page}/${totalPages}):\n\n${messagesList}\n\nReply số trang hoặc "check <stt>" để xem chi tiết.`;
        
        return api.sendMessage(body, threadID, (err, info) => {
            if (err) return;
            global.client.handleReply.push({
                name: this.config.name,
                messageID: info.messageID,
                author: senderID,
                filePath: historyFile,
                currentPage: page,
                totalPages,
                messages: reversed // Full reversed for detail view
            });
        });
    }
    
    // Main interaction check
    let data = query === 'all' || query === '-a' ? threadData.total :
               query === 'week' || query === '-w' ? threadData.week :
               query === 'day' || query === '-d' ? threadData.day : threadData.total;
    
    let storage = data.map(item => ({
        ...item,
        name: await Users.getNameUser(item.id) || 'Facebook User'
    })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    
    const isListQuery = ['all', '-a', 'week', '-w', 'day', '-d'].includes(query);
    const targetID = messageReply ? messageReply.senderID : (mentions && Object.keys(mentions)[0]) ? Object.keys(mentions)[0] : senderID;
    
    let msg = '';
    if (!isListQuery && storage.findIndex(u => u.id === targetID) === -1) {
        return api.sendMessage(`${await Users.getNameUser(targetID) || 'User'} chưa có dữ liệu.`, threadID, messageID);
    }
    
    if (isListQuery || Object.keys(mentions).length > 1) {
        // List view
        const header = query === 'all' || query === '-a' ? '[ Check Tất Cả Tin Nhắn ]\n' :
                       query === 'week' || query === '-w' ? '[ Check Tin Nhắn Tuần ]\n' :
                       '[ Check Tin Nhắn Ngày ]\n';
        const body = storage.map((item, idx) => `${idx + 1}. ${item.name} - ${item.count.toLocaleString()} tin`).join('\n');
        const footer = `\n💬 Tổng: ${storage.reduce((sum, u) => sum + u.count, 0).toLocaleString()}`;
        msg = `${header}${body}${footer}`;
        
        if (query === 'all' || query === '-a') {
            return api.sendMessage(msg, threadID, (err, info) => {
                if (err) return;
                global.client.handleReply.push({
                    name: this.config.name,
                    messageID: info.messageID,
                    thread: threadID,
                    author: senderID,
                    storage
                });
            });
        } else {
            return api.sendMessage(msg, threadID, messageID);
        }
    } else {
        // Single user detail
        const user = storage.find(u => u.id === targetID);
        const userTotal = threadData.total.find(u => u.id === targetID)?.count || 0;
        const userWeek = threadData.week.find(u => u.id === targetID)?.count || 0;
        const userDay = threadData.day.find(u => u.id === targetID)?.count || 0;
        
        const rankTotal = storage.findIndex(u => u.id === targetID) + 1;
        const weekStorage = [...threadData.week].map(u => ({ ...u, name: '' })).sort((a, b) => b.count - a.count);
        const dayStorage = [...threadData.day].map(u => ({ ...u, name: '' })).sort((a, b) => b.count - a.count);
        const rankWeek = weekStorage.findIndex(u => u.id === targetID) + 1;
        const rankDay = dayStorage.findIndex(u => u.id === targetID) + 1;
        
        const lastDay = threadData.last.day.find(u => u.id === targetID)?.count || 0;
        const lastWeek = threadData.last.week.find(u => u.id === targetID)?.count || 0;
        const rateDay = lastDay > 0 ? ((userDay / lastDay) * 100).toFixed(2) : 0;
        const rateWeek = lastWeek > 0 ? ((userWeek / lastWeek) * 100).toFixed(2) : 0;
        
        const totalDay = threadData.day.reduce((sum, u) => sum + u.count, 0);
        const totalWeek = threadData.week.reduce((sum, u) => sum + u.count, 0);
        const totalAll = threadData.total.reduce((sum, u) => sum + u.count, 0);
        
        const permission = global.config.ADMINBOT?.includes(targetID) ? 'Admin Bot' :
                          global.config.NDH?.includes(targetID) ? 'Người Thuê Bot' :
                          threadInfo.adminIDs.some(a => a.id === targetID) ? 'Quản Trị Viên' : 'Thành Viên';
        
        const body = `[ ${threadInfo.threadName} ]\n\n` +
                     `👤 Tên: ${user.name}\n` +
                     `🎖️ Chức Vụ: ${permission}\n` +
                     `📝 Profile: https://www.facebook.com/profile.php?id=${targetID}\n` +
                     `──────────────────\n` +
                     `💬 Tin Ngày: ${userDay.toLocaleString()}\n` +
                     `📊 Tỷ Lệ Ngày: ${((userDay / totalDay) * 100).toFixed(2)}% (vs last: ${rateDay}%)\n` +
                     `🥇 Hạng Ngày: ${rankDay}\n` +
                     `──────────────────\n` +
                     `💬 Tin Tuần: ${userWeek.toLocaleString()}\n` +
                     `📊 Tỷ Lệ Tuần: ${((userWeek / totalWeek) * 100).toFixed(2)}% (vs last: ${rateWeek}%)\n` +
                     `🥈 Hạng Tuần: ${rankWeek}\n` +
                     `──────────────────\n` +
                     `💬 Tổng: ${userTotal.toLocaleString()}\n` +
                     `📊 Tỷ Lệ Tổng: ${((userTotal / totalAll) * 100).toFixed(2)}%\n` +
                     `🏆 Hạng Tổng: ${rankTotal}\n\n` +
                     `📌 Thả ❤️ để xem bảng xếp hạng tổng.`;
        
        return api.sendMessage(body, threadID, (err, info) => {
            if (err) return;
            global.client.handleReaction.push({
                name: this.config.name,
                messageID: info.messageID,
                sid: senderID
            });
        });
    }
};

module.exports.handleReply = async function({ api, event, handleReply, Users, Threads }) {
    const { messageID, author, thread, storage, filePath, currentPage, totalPages, messages } = handleReply;
    if (event.senderID !== author) return;
    
    const input = event.body.trim();
    const threadInfo = await Threads.getInfo(event.threadID);
    
    if (!threadInfo.adminIDs.some(admin => admin.id === event.senderID)) {
        return api.sendMessage("❎ Không đủ quyền.", event.threadID);
    }
    
    if (handleReply.tag === 'locmen') {
        // Kick handler
        const nums = input.split(/\s+/).filter(n => !isNaN(n)).map(n => parseInt(n));
        const kicked = [];
        let errors = 0;
        for (const num of nums) {
            if (num < 1 || num > storage.length) continue;
            const userID = storage[num - 1].id;
            try {
                await api.removeUserFromGroup(userID, event.threadID);
                kicked.push(`${num}. ${await Users.getNameUser(userID)}`);
            } catch (e) {
                errors++;
            }
        }
        return api.sendMessage(`✅ Kick thành công ${kicked.length} người.\n❎ Lỗi: ${errors}\n\n${kicked.join('\n')}`, event.threadID);
    } else {
        // History pagination/detail
        if (/^check\s+\d+$/.test(input)) {
            const idx = parseInt(input.split(' ')[1]) - 1;
            if (idx < 0 || idx >= messages.length) {
                return api.sendMessage(`Số thứ tự không hợp lệ (1-${messages.length}).`, event.threadID);
            }
            const msg = messages[idx];
            const attachments = [];
            const tempFiles = [];
            
            for (const att of msg.attachments) {
                if (!att.url) continue;
                const ext = att.type === 'photo' ? '.jpg' : att.type === 'video' ? '.mp4' : att.type === 'audio' ? '.mp3' : att.type === 'animated_image' ? '.gif' : '';
                if (!ext) continue;
                
                const fileName = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
                const tempPath = path.join(__dirname, fileName);
                tempFiles.push(tempPath);
                
                try {
                    const res = await axios({ method: 'GET', url: att.url, responseType: 'stream' });
                    await new Promise((res, rej) => {
                        const writer = fs.createWriteStream(tempPath);
                        res.data.pipe(writer);
                        writer.on('finish', () => res());
                        writer.on('error', rej);
                    });
                    attachments.push(fs.createReadStream(tempPath));
                } catch (e) {
                    console.error('Download error:', e);
                }
            }
            
            const sentMsg = msg.body || 'Không có nội dung';
            api.sendMessage({ body: sentMsg, attachment: attachments }, event.threadID, () => {
                tempFiles.forEach(f => fs.unlink(f, err => { if (err) console.error(err); }));
            });
            return;
        }
        
        const page = parseInt(input);
        if (isNaN(page) || page < 1 || page > totalPages) {
            return api.sendMessage(`Số trang không hợp lệ (1-${totalPages}).`, event.threadID);
        }
        
        const pageSize = 20;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const pageMessages = [...messages].slice(start, end); // messages is already reversed
        
        const messagesList = pageMessages.map((msg, idx) => {
            const num = start + idx + 1;
            const attTypes = msg.attachments.map(att => att.type).join(', ');
            return `${num}. Nội dung: ${msg.body || 'Không có'}\nTime: ${_formatTime(msg.timestamp)}${msg.attachments.length > 0 ? `\nTệp: ${attTypes}` : ''}`;
        }).join('\n');
        
        const body = `Lịch sử tin nhắn (Trang ${page}/${totalPages}):\n\n${messagesList}\n\nReply số trang hoặc "check <stt>" để xem chi tiết.`;
        
        await api.unsendMessage(messageID);
        return api.sendMessage(body, event.threadID, (err, info) => {
            if (!err) {
                handleReply.currentPage = page;
                handleReply.messageID = info.messageID;
            }
        });
    }
};

module.exports.handleReaction = function({ event, api, Users }) {
    if (event.reaction !== '❤️') return;
    const { messageID, sid } = handleReaction; // Assume handleReaction from push
    if (event.userID !== sid) return;
    
    api.unsendMessage(messageID);
    const threadFile = path.join(dataPath, `${event.threadID}.json`);
    if (!fs.existsSync(threadFile)) return;
    
    const data = JSON.parse(fs.readFileSync(threadFile, 'utf8'));
    const sorted = [...data.total].sort((a, b) => b.count - a.count);
    const list = sorted.map((u, i) => `${i + 1}. ${global.data.userName.get(u.id) || 'User'} - ${u.count.toLocaleString()} tin`).join('\n');
    const total = sorted.reduce((sum, u) => sum + u.count, 0).toLocaleString();
    const myRank = sorted.findIndex(u => u.id === event.userID) + 1;
    
    const body = `[ Tất Cả Tin Nhắn ]\n\n${list}\n\n💬 Tổng: ${total}\n📊 Hạng của bạn: ${myRank}\n\nReply STT (cách nhau khoảng trắng) để kick.\n${global.config.PREFIX}check lọc <số> | reset | box`;
    
    api.sendMessage(body, event.threadID, (err, info) => {
        if (!err) {
            global.client.handleReply.push({
                name: this.config.name,
                messageID: info.messageID,
                tag: 'locmen',
                thread: event.threadID,
                author: event.userID,
                storage: sorted
            });
        }
    });
};

function _formatTime(timestamp) {
    const d = new Date(parseInt(timestamp));
    return new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(d);
}
