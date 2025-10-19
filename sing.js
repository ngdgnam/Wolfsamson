const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const Youtube = require("youtube-search-api");

const SS_HEADERS = {
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  "x-requested-with": "XMLHttpRequest",
  "origin": "https://ssvid.app",
  "referer": "https://ssvid.app/vi",
  "user-agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36"
};

async function ssvidAnalyze(youtubeUrl) {
  const body = new URLSearchParams();
  body.set("query", youtubeUrl);
  body.set("cf_token", "");
  body.set("vt", "home");
  const res = await axios.post("https://ssvid.app/api/ajax/search?hl=vi", body.toString(), { headers: SS_HEADERS, timeout: 20000 });
  return res.data || {};
}

function pickMp3Token(analysis) {
  const mp3 = analysis?.links?.mp3?.mp3128;
  if (mp3?.k) return { k: mp3.k, vid: analysis.vid || "" };
  throw new Error("Không tìm thấy token MP3 128kbps (links.mp3.mp3128.k).");
}

function pickMp4Token(analysis) {
  const mp4 = analysis?.links?.mp4?.mp4_720p || analysis?.links?.mp4?.mp4_480p || analysis?.links?.mp4?.mp4_360p;
  if (mp4?.k) return { k: mp4.k, vid: analysis.vid || "" };
  throw new Error("Không tìm thấy token MP4 (links.mp4).");
}

async function ssvidConvertToMp3({ k, vid }) {
  const tries = [
    { k },
    { k, vid },
    { k, vid, ftype: "mp3", fquality: "128" },
    { k, v_id: vid, ftype: "mp3", fquality: "128" }
  ];
  for (const payload of tries) {
    const body = new URLSearchParams(payload).toString();
    try {
      const res = await axios.post("https://ssvid.app/api/ajax/convert?hl=vi", body, { headers: SS_HEADERS, timeout: 20000 });
      const d = res.data || {};
      const dlink = d.dlink || d.url || d.link || d?.result?.dlink || d?.result?.url;
      if (dlink && /^https?:\/\//i.test(dlink)) return { dlink, raw: d };
    } catch {}
  }
  throw new Error("Convert MP3 thất bại, không nhận được dlink.");
}

async function ssvidConvertToMp4({ k, vid }) {
  const tries = [
    { k },
    { k, vid },
    { k, vid, ftype: "mp4", fquality: "720" },
    { k, v_id: vid, ftype: "mp4", fquality: "720" }
  ];
  for (const payload of tries) {
    const body = new URLSearchParams(payload).toString();
    try {
      const res = await axios.post("https://ssvid.app/api/ajax/convert?hl=vi", body, { headers: SS_HEADERS, timeout: 20000 });
      const d = res.data || {};
      const dlink = d.dlink || d.url || d.link || d?.result?.dlink || d?.result?.url;
      if (dlink && /^https?:\/\//i.test(dlink)) return { dlink, raw: d };
    } catch {}
  }
  throw new Error("Convert MP4 thất bại, không nhận được dlink.");
}

async function downloadFromDlink(dlink, outPath) {
  const res = await axios.get(dlink, { responseType: "stream", timeout: 120000, maxRedirects: 5 });
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(outPath);
    res.data.pipe(ws);
    ws.on("finish", resolve);
    ws.on("error", reject);
  });
  return outPath;
}

function fmtHMS(sec) {
  const s = parseInt(sec || 0, 10);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return (h ? `${h}:` : "") + `${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
}

module.exports.config = {
  name: "sing",
  version: "4.1.0",
  hasPermssion: 0,
  credits: "D-Jukie, mod Nnam",
  description: "Tìm YouTube và tải MP3/MP4 (ssvid.app)",
  commandCategory: "Tìm kiếm",
  usages: "sing <từ khóa | link YouTube> [audio|video]",
  cooldowns: 0
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  if (!args || args.length === 0)
    return api.sendMessage("❌ Vui lòng nhập từ khóa hoặc link YouTube", threadID, messageID);

  const q = args.join(" ").trim();
  const mode = args[args.length - 1]?.toLowerCase() === "video" ? "video" : "audio";

  if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(q)) {
    const ext = mode === "video" ? "mp4" : "mp3";
    const cachePath = path.join(__dirname, "cache", `sing-${senderID}.${ext}`);
    if (fs.existsSync(cachePath)) try { fs.unlinkSync(cachePath); } catch {}

    const t0 = Date.now();
    try {
      const analysis = await ssvidAnalyze(q);
      let { k, vid } = mode === "video" ? pickMp4Token(analysis) : pickMp3Token(analysis);
      const convertFn = mode === "video" ? ssvidConvertToMp4 : ssvidConvertToMp3;
      const { dlink } = await convertFn({ k, vid });
      await downloadFromDlink(dlink, cachePath);

      const maxFileSize = mode === "video" ? 50 * 1024 * 1024 : 25 * 1024 * 1024; // 50MB for video, 25MB for audio
      const size = fs.statSync(cachePath).size;
      if (size > maxFileSize) {
        try { fs.unlinkSync(cachePath); } catch {}
        return api.sendMessage(`⚠️ File > ${maxFileSize / 1024 / 1024}MB, không thể gửi. Hãy chọn bài khác ngắn hơn.`, threadID, messageID);
      }

      const title = analysis.title || "Unknown";
      const author = analysis.a || "Unknown";
      const dur = fmtHMS(analysis.t);

      const mediaType = mode === "video" ? "🎥 Video" : "🎵 Audio";
      api.sendMessage({
        body: `${mediaType}: ${title}\n👤 ${author}\n⏱ ${dur}\n✅ Tải & gửi trong ${Math.floor((Date.now() - t0) / 1000)}s`,
        attachment: fs.createReadStream(cachePath)
      }, threadID, () => {
        try { fs.unlinkSync(cachePath); } catch {}
      });
    } catch (e) {
      try { fs.unlinkSync(cachePath); } catch {}
      api.sendMessage(`⚠️ Lỗi: ${e.message}`, threadID, messageID);
    }
    return;
  }

  try {
    const result = await Youtube.GetListByKeyword(q, false, 15);
    const items = (result?.items || []).filter(v => v?.type === "video").slice(0, 15);
    if (items.length === 0) return api.sendMessage("❌ Không tìm thấy video phù hợp.", threadID, messageID);

    let msg = "";
    const videos = [];
    let i = 0;
    for (const v of items) {
      i++;
      const id = v.id;
      const title = v.title || "No title";
      const channel = v.channelTitle || v.channel?.name || "Unknown";
      const lengthText = v.length?.simpleText || (v.lengthSeconds ? fmtHMS(Number(v.lengthSeconds)) : "N/A");
      videos.push({ id, title, channel, lengthText, url: `https://youtu.be/${id}` });
      msg += `${i}. ${title}\n⏰ ${lengthText}\n🌐 ${channel}\n\n`;
    }

    const body = `📝 Có ${videos.length} kết quả cho: "${q}"\n\n${msg}👉 Trả lời tin nhắn này bằng số thứ tự để tải ${mode} .`;
    api.sendMessage(body, threadID, (err, info) => {
      if (err) return;
      global.client.handleReply.push({
        name: module.exports.config.name,
        messageID: info.messageID,
        author: senderID,
        videos,
        mode
      });
    }, messageID);
  } catch (e) {
    return api.sendMessage(`⚠️ Lỗi search: ${e.message}`, threadID, messageID);
  }
};

module.exports.handleReply = async function ({ api, event, handleReply }) {
  const { threadID, messageID, senderID, body } = event;
  if (event.senderID !== handleReply.author)
    return api.sendMessage("⛔ Bạn không phải người yêu cầu lệnh này!", threadID, messageID);

  const idx = Number(body.trim());
  if (!Number.isInteger(idx) || idx < 1 || idx > handleReply.videos.length)
    return api.sendMessage(`Vui lòng nhập số từ 1 đến ${handleReply.videos.length}.`, threadID, messageID);

  try { api.unsendMessage(handleReply.messageID); } catch {}

  const v = handleReply.videos[idx - 1];
  const url = v.url;
  const mode = handleReply.mode || "audio";
  const ext = mode === "video" ? "mp4" : "mp3";
  const cachePath = path.join(__dirname, "cache", `sing-${senderID}.${ext}`);
  if (fs.existsSync(cachePath)) try { fs.unlinkSync(cachePath); } catch {}

  const t0 = Date.now();
  try {
    const analysis = await ssvidAnalyze(url);
    let { k, vid } = mode === "video" ? pickMp4Token(analysis) : pickMp3Token(analysis);
    const convertFn = mode === "video" ? ssvidConvertToMp4 : ssvidConvertToMp3;
    const { dlink } = await convertFn({ k, vid });
    await downloadFromDlink(dlink, cachePath);

    const maxFileSize = mode === "video" ? 50 * 1024 * 1024 : 25 * 1024 * 1024;
    const size = fs.statSync(cachePath).size;
    if (size > maxFileSize) {
      try { fs.unlinkSync(cachePath); } catch {}
      return api.sendMessage(`⚠️ File > ${maxFileSize / 1024 / 1024}MB, không thể gửi. Hãy chọn bài khác ngắn hơn.`, threadID, messageID);
    }

    const mediaType = mode === "video" ? "🎥 Video" : "🎵 Audio";
    api.sendMessage({
      body: `${mediaType}: ${v.title}\n🌐 ${v.channel}\n⏰ ${v.lengthText}\n✅ Tải & gửi trong ${Math.floor((Date.now() - t0) / 1000)}s`,
      attachment: fs.createReadStream(cachePath)
    }, threadID, () => {
      try { fs.unlinkSync(cachePath); } catch {}
    });
  } catch (e) {
    try { fs.unlinkSync(cachePath); } catch {}
    api.sendMessage(`⚠️ Lỗi: ${e.message}`, threadID, messageID);
  }
};
