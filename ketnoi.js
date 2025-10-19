const moment = require("moment-timezone");
const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");

module.exports.config = {
    name: "ketnoi",
    version: "1.4.0",
    hasPermssion: 0,
    credits: "Dũngkon - Fix & File by Copilot & Grok ( mod lại bởi Nnam )",
    description: "Kết nối 2 nhóm chat với nhau qua bot, hỗ trợ gửi file/ảnh/âm thanh/video/GIF, phân trang danh sách nhóm",
    commandCategory: "Tiện ích",
    usages: "ketnoi [ketthuc]",
    cooldowns: 10
};

const ketNoiData = new Map(); // Lưu trạng thái kết nối tạm thời

async function downloadAttachment(url, ext) {
    const fileName = `${Date.now()}_${Math.floor(Math.random()*9999)}.${ext}`;
    const filePath = path.join(__dirname, "cache", fileName);
    if (!fs.existsSync(path.join(__dirname, "cache"))) fs.mkdirSync(path.join(__dirname, "cache"));
    const res = await axios.get(url, { responseType: "arraybuffer" });
    await fs.writeFile(filePath, res.data);
    return filePath;
}

function renderGroupList(groupThreads, page = 1, totalPage = 1) {
    let msg = `🌐 Danh sách nhóm có thể kết nối (Trang ${page}/${totalPage}):\n`;
    const start = (page - 1) * 10;
    const end = Math.min(start + 10, groupThreads.length);
    for (let i = start; i < end; i++) {
        const g = groupThreads[i];
        msg += `${i - start + 1}. ${g.name || "Không tên"} (ID: ${g.threadID})\n`;
    }
    msg += "\nReply số để chọn nhóm muốn kết nối.\n";
    if (totalPage > 1) msg += "Reply 'trang +số' (ví dụ: trang 2) để chuyển trang.";
    return msg;
}

module.exports.run = async function({ api, event, args }) {
    const { threadID, senderID } = event;

    // Kết thúc kết nối nếu có lệnh ketnoi ketthuc
    if (args[0] && args[0].toLowerCase() === "ketthuc") {
        const data = ketNoiData.get(threadID);
        if (data && data.step === "connected" && data.pair) {
            ketNoiData.delete(threadID);
            ketNoiData.delete(data.pair);
            api.sendMessage("🔌 Kết nối giữa hai nhóm đã được kết thúc!", threadID);
            if (data.pair) {
                api.sendMessage("🔌 Kết nối giữa hai nhóm đã được kết thúc!", data.pair);
            }
        } else {
            api.sendMessage("❌ Nhóm này không có kết nối nào đang hoạt động!", threadID);
        }
        return;
    }

    // Lấy danh sách nhóm bot đang ở
    const allThreads = await api.getThreadList(50, null, ["INBOX"]);
    const groupThreads = allThreads.filter(t => t.isGroup && t.threadID !== threadID);

    if (groupThreads.length === 0)
        return api.sendMessage("❌ Bot không còn nhóm nào khác để kết nối!", threadID);

    const totalPage = Math.ceil(groupThreads.length / 10);
    const page = 1;

    ketNoiData.set(threadID, {
        step: "choose_group",
        groupThreads,
        requester: senderID,
        page,
        totalPage
    });

    const msg = renderGroupList(groupThreads, page, totalPage);

    return api.sendMessage(msg, threadID, (err, info) => {
        if (err) return console.error(err);
        ketNoiData.get(threadID).messageID = info.messageID;
        global.client.handleReply.push({
            name: this.config.name,
            messageID: info.messageID,
            author: senderID,
            type: "choose_group"
        });
    });
};

module.exports.handleReply = async function({ api, event, handleReply }) {
    const { threadID, senderID, body, messageID, attachments } = event;
    const data = ketNoiData.get(threadID);

    if (!data) return;

    // Bước chọn nhóm (phân trang)
    if (data.step === "choose_group") {
        if (senderID !== handleReply.author) return;
        const groupThreads = data.groupThreads;
        const totalPage = data.totalPage;
        let page = data.page;

        // Chuyển trang
        const trangMatch = body.toLowerCase().match(/^trang\s*(\d+)$/);
        if (trangMatch) {
            const newPage = parseInt(trangMatch[1]);
            if (isNaN(newPage) || newPage < 1 || newPage > totalPage)
                return api.sendMessage(`❌ Trang không hợp lệ!`, threadID, messageID);

            ketNoiData.set(threadID, {
                ...data,
                page: newPage
            });
            const msg = renderGroupList(groupThreads, newPage, totalPage);
            return api.sendMessage(msg, threadID, (err, info) => {
                if (err) return console.error(err);
                ketNoiData.get(threadID).messageID = info.messageID;
                global.client.handleReply.push({
                    name: module.exports.config.name,
                    messageID: info.messageID,
                    author: senderID,
                    type: "choose_group"
                });
            });
        }

        // Chọn nhóm trên trang hiện tại
        const num = parseInt(body);
        const start = (page - 1) * 10;
        const end = Math.min(start + 10, groupThreads.length);
        if (isNaN(num) || num < 1 || num > (end - start))
            return api.sendMessage("❌ Số không hợp lệ!", threadID, messageID);

        const targetGroup = groupThreads[start + num - 1];
        ketNoiData.set(targetGroup.threadID, {
            step: "wait_accept",
            fromThread: threadID,
            fromName: (await api.getThreadInfo(threadID)).threadName,
            requester: senderID
        });
        ketNoiData.set(threadID, {
            step: "wait_reply_accept",
            targetThread: targetGroup.threadID
        });

        api.sendMessage(
            `🔗 Nhóm "${targetGroup.name || "Không tên"}" đã được chọn.\nĐang gửi yêu cầu kết nối...`,
            threadID
        );

        return api.sendMessage(
            `🔔 Nhóm "${(await api.getThreadInfo(threadID)).threadName}" muốn kết nối trò chuyện qua bot!\nReply 'y' để đồng ý, 'n' để từ chối.`,
            targetGroup.threadID,
            (err, info) => {
                if (err) return console.error(err);
                ketNoiData.get(targetGroup.threadID).messageID = info.messageID;
                global.client.handleReply.push({
                    name: module.exports.config.name,
                    messageID: info.messageID,
                    author: null,
                    type: "wait_accept"
                });
            }
        );
    }

    // Bước chờ nhóm target đồng ý
    if (data.step === "wait_accept") {
        if (!["y", "n"].includes(body.toLowerCase())) return;
        const fromThread = data.fromThread;
        const fromName = data.fromName;
        if (body.toLowerCase() === "y") {
            ketNoiData.set(threadID, { step: "connected", pair: fromThread });
            ketNoiData.set(fromThread, { step: "connected", pair: threadID });

            api.sendMessage(
                `✅ Nhóm bạn đã đồng ý kết nối với nhóm "${fromName}".\nHãy reply tin nhắn này để gửi đến nhóm bên kia.`,
                threadID,
                (err, info) => {
                    if (err) return console.error(err);
                    ketNoiData.get(threadID).messageID = info.messageID;
                    global.client.handleReply.push({
                        name: module.exports.config.name,
                        messageID: info.messageID,
                        author: null,
                        type: "connected"
                    });
                }
            );
            api.sendMessage(
                `✅ Nhóm bạn yêu cầu đã đồng ý kết nối!\nHãy reply tin nhắn này để gửi đến nhóm bên kia.`,
                fromThread,
                (err, info) => {
                    if (err) return console.error(err);
                    ketNoiData.get(fromThread).messageID = info.messageID;
                    global.client.handleReply.push({
                        name: module.exports.config.name,
                        messageID: info.messageID,
                        author: null,
                        type: "connected"
                    });
                }
            );
        } else {
            ketNoiData.delete(threadID);
            ketNoiData.delete(fromThread);
            api.sendMessage("❌ Nhóm đã từ chối kết nối.", fromThread);
            api.sendMessage("❌ Đã từ chối kết nối.", threadID);
        }
        return;
    }

    // Đang kết nối, chuyển tiếp tin nhắn (chỉ gửi 1 lần, không gửi lại ở handleEvent)
    if (data.step === "connected" && data.pair) {
        if (event.messageReply && event.messageReply.messageID === data.messageID) {
            const info = await api.getThreadInfo(threadID);
            const senderName = (await api.getUserInfo(senderID))[senderID].name;
            const now = moment().tz("Asia/Ho_Chi_Minh").format("HH:mm:ss DD/MM/YYYY");
            let msg = `💬 TIN NHẮN KẾT NỐI 💬\n`;
            msg += `👥 Nhóm: ${info.threadName}\n👤 Người gửi: ${senderName}\n🕒 Thời gian: ${now}\n`;
            msg += `────────────────────\n${body || "[Media đính kèm]"}`;

            // Xử lý file đính kèm (hỗ trợ video và GIF đầy đủ)
            let files = [];
            if (attachments && attachments.length > 0) {
                for (const att of attachments) {
                    let ext = "dat";
                    let typeLabel = "";
                    if (att.type === "photo") {
                        ext = "jpg";
                        typeLabel = " [Ảnh]";
                    } else if (att.type === "video") {
                        ext = "mp4";
                        typeLabel = " [Video]";
                    } else if (att.type === "audio") {
                        ext = "mp3";
                        typeLabel = " [Âm thanh]";
                    } else if (att.type === "animated_image") {
                        ext = "gif";
                        typeLabel = " [GIF]";
                    } else if (att.type === "file" && att.name) {
                        ext = att.name.split(".").pop() || "dat";
                        typeLabel = ` [File: ${att.name}]`;
                    }
                    msg += typeLabel; // Thêm nhãn loại media vào tin nhắn

                    try {
                        const filePath = await downloadAttachment(att.url, ext);
                        files.push(fs.createReadStream(filePath));
                    } catch (e) {
                        console.error("[KETNOI] Lỗi tải attachment:", e);
                    }
                }
            }

            api.sendMessage({
                body: msg,
                attachment: files.length > 0 ? files : undefined
            }, data.pair, async (err, info2) => {
                if (err) {
                    console.error("[KETNOI] Lỗi gửi tin nhắn:", err);
                    return api.sendMessage("❌ Lỗi khi chuyển tiếp tin nhắn!", threadID);
                }
                ketNoiData.get(data.pair).messageID = info2.messageID;
                global.client.handleReply.push({
                    name: module.exports.config.name,
                    messageID: info2.messageID,
                    author: null,
                    type: "connected"
                });
                // Xóa file tạm
                if (files.length > 0) {
                    for (let i = 0; i < files.length; i++) {
                        try {
                            const filePath = files[i].path;
                            if (filePath && fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                            }
                        } catch (e) {
                            console.error("[KETNOI] Lỗi xóa file:", e);
                        }
                    }
                }
            }, messageID);
        }
    }
};

// Không cần handleEvent vì chỉ dùng reply để chuyển tiếp
