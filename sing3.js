const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { createReadStream, unlinkSync } = require("fs-extra");

// --- TOOL DOWNLOAD SOUNDLOUD ---
async function scl_download(url) {
  const res = await axios.get('https://soundcloudmp3.org/id');
  const $ = cheerio.load(res.data);
  const _token = $('form#conversionForm > input[type=hidden]').attr('value');

  const conver = await axios.post(
    'https://soundcloudmp3.org/converter',
    new URLSearchParams({ _token, url }),
    { headers: { cookie: res.headers['set-cookie'], accept: 'UTF-8' } }
  );

  const $$ = cheerio.load(conver.data);

  return {
    title: $$('div.info.clearfix > p:nth-child(2)').text().replace('Title:', '').trim(),
    url: $$('a#download-btn').attr('href')
  };
}

// --- TÌM KIẾM SOUND CLOUD (Y CHANG GOIBOT) ---
async function searchSoundCloud(query) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0"
  };

  const response = await axios.get(https://m.soundcloud.com/search?q=${encodeURIComponent(query)}, { headers });
  const $ = cheerio.load(response.data);

  let results = [];
  $("div > ul > li > div").each((index, el) => {
    if (index < 😎 {
      const title = $(el).find("a").attr("aria-label")?.trim() || "";
      const url = "https://soundcloud.com" + ($(el).find("a").attr("href") || "").trim();
      results.push({ title, url });
    }
  });

  return results;
}

module.exports.config = {
  name: "sing",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Nnam && GPT",
  description: "Tìm kiếm và tải nhạc SoundCloud",
  commandCategory: "Music",
  usages: "[tên bài hát]",
  cooldowns: 2
};

module.exports.run = async ({ api, event, args }) => {
  const query = args.join(" ");
  if (!query) return api.sendMessage("Nhập tên bài hát muốn tìm.", event.threadID, event.messageID);

  const msg = await api.sendMessage("🔍 Đang tìm kiếm bài hát...", event.threadID);

  try {
    const results = await searchSoundCloud(query);

    if (results.length === 0)
      return api.sendMessage("❎ Không tìm thấy bài nào!", event.threadID, event.messageID);

    let list = "🎵 DANH SÁCH BÀI HÁT TÌM THẤY:\n\n";
    results.forEach((item, i) => {
      list += ${i + 1}. ${item.title}\n;
    });

    list += "\n📌 Reply số để tải bài hát.";

    api.sendMessage(list, event.threadID, (err, info) => {
      global.client.handleReply.push({
        type: "choose_song",
        name: "sing",
        author: event.senderID,
        messageID: info.messageID,
        results
      });
    }, msg.messageID);

  } catch (e) {
    console.log(e);
    api.sendMessage("❎ Lỗi tìm kiếm!", event.threadID, event.messageID);
  }
};

module.exports.handleReply = async ({ api, event, handleReply }) => {
  if (event.senderID != handleReply.author) return;

  const index = parseInt(event.body);
  if (isNaN(index) || index < 1 || index > handleReply.results.length)
    return api.sendMessage("❎ Số không hợp lệ!", event.threadID, event.messageID);

  const song = handleReply.results[index - 1];

  api.sendMessage🎶 Đang tải: ${song.title}`, event.threadID);

  try {
    const data = await scl_download(song.url);

    const stream = (await axios.get(data.url, { responseType: 'arraybuffer' })).data;
    const filePath = __dirname + /cache/${Date.now()}.mp3;

    fs.writeFileSync(filePath, Buffer.from(stream, 'binary'));

    api.sendMessage(
      { body: Gửi bạn bài: ${data.title}, attachment: createReadStream(filePath) },
      event.threadID,
      () => setTimeout(() => unlinkSync(filePath), 2 * 60 * 1000) // Xóa sau 2 phút
    );

  } catch (err) {
    console.log(err);
    api.sendMessage("❎ Lỗi tải nhạc!", event.threadID);
  }
};




