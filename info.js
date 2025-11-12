const axios = require("axios");
const fs = require("fs-extra");

module.exports.config = {
    name: "info",
    usePrefix: true,
    version: "2.2.0",
    hasPermssion: 0,
    credits: "Tiến & Cải tiến && Nnam mod",
    description: "Lấy thông tin người dùng Facebook (nâng cấp: error handling, full fields, post preview)",
    commandCategory: "Tiện ích",
    aliases: ["in4", "i"],
    usages: "[uid/link/@tag]",
    cooldowns: 5
};

module.exports.convert = function(timestamp) {
    try {
        return new Date(timestamp).toLocaleString('vi-VN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return 'Ngày không hợp lệ';
    }
};

module.exports.run = async function({ api, event, args, Currencies, Users }) {
    const { threadID, messageID, senderID } = event;
    const token = global.acc.token.EAAAAU; // Assume global token, thay bằng env nếu cần

    let id;
    if (Object.keys(event.mentions).length > 0) {
        id = Object.keys(event.mentions)[0].replace(/&mibextid=ZbWKwL/g, '');
    } else if (args[0]) {
        id = isNaN(args[0]) ? await global.utils.getUID(args[0]) : args[0];
    } else if (event.type === "message_reply") {
        id = event.messageReply.senderID;
    } else {
        id = senderID;
    }

    try {
        await api.sendMessage('🔄 Đang lấy thông tin...', threadID, messageID);

        const resp = await axios.get(`https://graph.facebook.com/${id}?fields=id,is_verified,cover.source,about,first_name,last_name,name,username,link,birthday,gender,hometown.name,relationship_status,significant_other{name,id},website,locale,created_time,posts{message,created_time,actions{link,name},privacy{description},shares{count},status_type},likes{name,category,created_time,id},work{employer{name,id}},family{name,id,relationship},education{school{name,type}}&access_token=${token}&limit=5`, {
            timeout: 10000
        });

        const userData = resp.data;
        if (userData.error) {
            return api.sendMessage(`❌ Lỗi: ${userData.error.message} (Code: ${userData.error.code}). UID không tồn tại hoặc private.`, threadID, messageID);
        }

        const { work, photos, likes: li, posts: ps, family: fd, education: ed } = userData;
        const lkos = li?.data ? li.data.slice(0, 5).map(l => `\n${l.name} (${l.category}) - Time: ${this.convert(l.created_time)} - Link: FB.com/${l.id}`).join('') : "Không có";
        const pst = ps?.data ? ps.data.slice(0, 5).map(p => `\n${this.convert(p.created_time)} - ${p.message || 'No text'} - Link: ${p.actions[0].link}`).join('') : "Không có";
        const fml = fd?.data ? fd.data.map(f => `\n${f.name} (${f.relationship}) - Link: FB.com/${f.id}`).join('') : "Không có";
        const wk = work ? work.map(w => `\n${w.employer.name} - Link: FB.com/${w.id}`).join('') : "Không có";
        const edc = ed ? ed.map(e => `\n${e.school.name} (${e.type})`).join('') : "Không có";

        const info = {
            name: userData.name,
            username: userData.username || "❎",
            link_profile: userData.link,
            bio: userData.about || "Không có tiểu sử",
            created_time: this.convert(userData.created_time),
            gender: userData.gender === 'male' ? 'Nam' : userData.gender === 'female' ? 'Nữ' : '❎',
            relationship_status: userData.relationship_status || "Không có",
            rela: userData.significant_other?.name || '',
            id_rela: userData.significant_other?.id,
            bday: userData.birthday || "Không công khai",
            follower: userData.subscribers?.summary?.total_count || "❎",
            is_verified: userData.is_verified ? "✔️ Đã xác minh" : "❌ Chưa xác minh",
            locale: userData.locale || "❎",
            hometown: userData.hometown?.name || "Không công khai",
            cover: userData.cover?.source || null,
            ban: global.data.userBanned.has(id) ? "Đang bị ban" : "Không bị ban",
            money: ((await Currencies.getData(id)) || {}).money || 0,
            web: userData.website || "không có",
            avatar: `https://graph.facebook.com/${id}/picture?width=1500&height=1500&access_token=${token}`
        };

        const infoMessage = ` ╭────────────⭓
│ Tên: ${info.name}
│ Biệt danh: ${info.username}
│ FB: ${info.link_profile}
│ Giới tính: ${info.gender}
│ Mối quan hệ: ${info.relationship_status} ${info.rela || ''}
${info.id_rela ? `│ ➣ Link: FB.com/${info.id_rela}` : ''}
│ Sinh nhật: ${info.bday}
│ Giới thiệu: ${info.bio}
│ Nơi sinh: ${info.hometown}
│ Làm việc tại: ${wk || "Không có"}
│ Web: ${info.web}
│ Số follow: ${info.follower.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
├────────────⭔
│ Thành viên gia đình: ${fml.replace(', ', '') || "Không có"}
│ Các trang đã like: ${lkos || "Không có"}
├────────────⭔
│ Kiểm tra cấm: ${info.ban}
│ Tiền hiện có: ${info.money.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
╰────────────⭓
📌 Thả cảm xúc 👍 để check bài đăng`;

        const attachments = [];
        if (info.cover) {
            try {
                const coverPhoto = await axios.get(info.cover, { responseType: 'stream' });
                attachments.push(coverPhoto.data);
            } catch (error) {
                console.error("[INFO] Lỗi ảnh bìa:", error);
            }
        }

        try {
            const avatarPhoto = await axios.get(info.avatar, { responseType: 'stream' });
            attachments.push(avatarPhoto.data);
        } catch (error) {
            console.error("[INFO] Lỗi avatar:", error);
        }

        api.sendMessage({ body: infoMessage, attachment: attachments }, event.threadID, (err, info) => {
            if (err) {
                console.error("[INFO] Lỗi gửi:", err);
                return api.sendMessage("Lỗi gửi thông tin (attachment fail).", event.threadID, event.messageID);
            }
            global.client.handleReaction.push({
                name: this.config.name,
                messageID: info.messageID,
                author: id
            });
        }, event.messageID);
    } catch (error) {
        console.error("[INFO] Lỗi API:", error);
        api.sendMessage(`❌ Tài khoản không tồn tại hoặc đã bị khóa! (Lỗi: ${error.message})`, event.threadID, event.messageID);
    }
};

module.exports.handleReaction = async function ({ api, event, handleReaction }) {
    if (event.reaction !== '👍') return;

    const id = handleReaction.author;
    const token = global.acc.token.EAAAAU;

    try {
        const resp = await axios.get(`https://graph.facebook.com/${id}?fields=posts{message,created_time,actions{link,name},privacy{description},shares{count},status_type}&access_token=${token}&limit=5`);
        const posts = resp.data.posts?.data || [];

        if (!posts || posts.length === 0) {
            return api.sendMessage('❎ Không có bài đăng nào!', event.threadID, event.messageID);
        }

        let p = '';
        posts.forEach((post, i) => {
            const { created_time: c_t, message: ms, actions, privacy, shares, status_type: s_t } = post;
            const sr = shares?.count || 0;
            const pv = privacy?.description || "Public";
            const a_l = actions[0]?.link?.replace('https://www.facebook.com', 'https://FB.com') || '';
            p += ` ╭─────────────⭓
⏰ Tạo lúc: ${this.convert(c_t)}
✏️ Trạng thái: ${pv}
🔀 Lượt chia sẻ: ${sr}
ℹ️ Loại trạng thái: ${s_t}
🔗 Link: ${a_l}
📝 Nội dung: ${ms || 'không có tiêu đề'}
╰─────────────⭓ `;
        });

        api.sendMessage(`${p}\n`, event.threadID, event.messageID);
    } catch (error) {
        console.error("[INFO] Lỗi lấy posts:", error);
        api.sendMessage('❌ Lỗi lấy bài đăng: ' + error.message, event.threadID, event.messageID);
    }
};
