const axios = require('axios');
const fs = require("fs-extra");

module.exports.config = {
  name: "npm",
  version: "1.1.0",
  hasPermssion: 0,
  credits: "Nnam",
  description: "Tìm kiếm package NPM (nâng cấp: error handling, version info, keywords)",
  commandCategory: "Hệ Thống",
  usages: "npm <tên package>",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  var cc = args.join(" ");
  
  if (!cc) {
    return api.sendMessage(`❌ Vui lòng nhập tên package cần tìm!\nVí dụ: npm lodash`, event.threadID, event.messageID);
  }

  try {
    const res = await axios.get(`https://api.popcat.xyz/npm?q=${encodeURIComponent(cc)}`, { timeout: 10000 });
    const packageData = res.data;
    
    if (!packageData || packageData.error) {
      return api.sendMessage(`❌ Package "${cc}" không tồn tại hoặc lỗi API! Thử tên khác nhé.`, event.threadID, event.messageID);
    }

    const { name, version, description, author, keywords, downloads_this_year, repository, homepage } = packageData;
    const keyWords = keywords ? keywords.join(", ") : "Không có";
    const repoLink = repository?.url || homepage || `https://www.npmjs.com/package/${name}`;

    let msg = `💙━━『 𝗧𝗛𝗢̂𝗡𝗚 𝗧𝗜𝗡 𝗣𝗔𝗖𝗞𝗔𝗚𝗘 NPM 』━━💙\n\n`;
    msg += `📦 Tên: ${name}\n`;
    msg += `🔢 Phiên bản: ${version || "N/A"}\n`;
    msg += `📝 Mô tả: ${description || "Không có mô tả"}\n`;
    msg += `👤 Author: ${author?.name || author || "N/A"}\n`;
    msg += `🏷️ Keywords: ${keyWords}\n`;
    msg += `📥 Lượt tải năm nay: ${downloads_this_year || 0}\n`;
    msg += `🔗 Link: ${repoLink}\n\n`;
    msg += `💡 Gợi ý: npm install ${name} để cài!`;

    return api.sendMessage(msg, event.threadID, event.messageID);
  } catch (error) {
    console.error("[NPM] Lỗi API:", error.message);
    return api.sendMessage(`❌ Lỗi tìm package: ${error.message}. Thử lại sau!`, event.threadID, event.messageID);
  }
};
