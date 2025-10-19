const fs = require("fs-extra");
const axios = require("axios");
const Jimp = require("jimp");
const FormData = require("form-data");
const path = require("path");

module.exports.config = {
  name: "stick",
  version: "2.1.0",
  hasPermssion: 0,
  credits: "Nnam & thangskibidi (improved by Grok)",
  description: "Tạo sticker chuẩn có/không viền, hỗ trợ tách nền",
  commandCategory: "Tiện ích",
  usages: "stick (gửi hoặc reply ảnh)",
  cooldowns: 5,
  dependencies: {
    "axios": "",
    "fs-extra": "",
    "jimp": "",
    "form-data": ""
  }
};

let cache = {};

module.exports.run = async ({ api, event }) => {
  const { threadID, messageID, messageReply, attachments, senderID } = event;

  let url = null;
  if (attachments && attachments[0]?.type === "photo") {
    url = attachments[0].url;
  } else if (messageReply?.attachments && messageReply.attachments[0]?.type === "photo") {
    url = messageReply.attachments[0].url;
  } else {
    return api.sendMessage("📌 Vui lòng gửi hoặc reply một ảnh để tạo sticker!", threadID, messageID);
  }

  cache[senderID] = { url };

  return api.sendMessage(
    "✨ [ CHỌN CHẾ ĐỘ STICKER ]\n\n" +
    "Reply tin nhắn này với:\n" +
    "• 'có' hoặc '1' : Có viền\n" +
    "• 'không' hoặc '2' : Không viền\n" +
    "• 'tách' hoặc '3' : Tách nền (không viền)",
    threadID,
    (err, info) => {
      if (err) return;
      cache[senderID].msgID = info.messageID;
    },
    messageID
  );
};

module.exports.handleReply = async ({ api, event }) => {
  const { threadID, messageID, senderID, body } = event;

  if (!cache[senderID]) return;

  const choice = body.toLowerCase().trim();
  const useRemoveBg = choice.includes("tách") || choice === "3";
  const addBorder = (choice.includes("có") || choice === "1") && !useRemoveBg; // Không viền nếu tách nền

  const { url } = cache[senderID];
  delete cache[senderID];

  const filePath = path.join(__dirname, `cache/sticker_${Date.now()}.png`);

  api.sendMessage("🛠️ Đang xử lý ảnh để tạo sticker...", threadID);

  try {
    let imageBuffer;
    const res = await axios.get(url, { responseType: "arraybuffer" });
    imageBuffer = Buffer.from(res.data);

    if (useRemoveBg) {
      const KeyApi = [
        "t4Jf1ju4zEpiWbKWXxoSANn4", "CTWSe4CZ5AjNQgR8nvXKMZBd", "PtwV35qUq557yQ7ZNX1vUXED",
        "wGXThT64dV6qz3C6AhHuKAHV", "82odzR95h1nRp97Qy7bSRV5M", "4F1jQ7ZkPbkQ6wEQryokqTmo",
        "sBssYDZ8qZZ4NraJhq7ySySR", "NuZtiQ53S2F5CnaiYy4faMek", "f8fujcR1G43C1RmaT4ZSXpwW"
      ];

      const form = new FormData();
      form.append("size", "auto");
      form.append("image_file", imageBuffer, {
        filename: "photo.png",
        contentType: "image/png"
      });

      const response = await axios.post("https://api.remove.bg/v1.0/removebg", form, {
        responseType: "arraybuffer",
        headers: {
          ...form.getHeaders(),
          "X-Api-Key": KeyApi[Math.floor(Math.random() * KeyApi.length)]
        }
      });

      if (response.status !== 200) throw new Error("Tách nền thất bại!");
      imageBuffer = response.data;
    }

    const image = await Jimp.read(imageBuffer);

    if (addBorder) {
      const borderSize = 512, innerSize = 480;
      const border = new Jimp(borderSize, borderSize, 0x000000FF); // Viền đen
      image.resize(innerSize, innerSize);
      border.composite(image, (borderSize - innerSize) / 2, (borderSize - innerSize) / 2);
      await border.writeAsync(filePath);
    } else {
      image.contain(512, 512, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE);
      if (useRemoveBg) {
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
          const red = this.bitmap.data[idx + 0];
          const green = this.bitmap.data[idx + 1];
          const blue = this.bitmap.data[idx + 2];
          const alpha = this.bitmap.data[idx + 3];
          if (red === 0 && green === 0 && blue === 0 && alpha === 255) { // Làm trong suốt nền đen sau tách
            this.bitmap.data[idx + 3] = 0;
          }
        });
      }
      await image.writeAsync(filePath);
    }

    const modeText = useRemoveBg ? "tách nền" : (addBorder ? "có viền" : "không viền");
    api.sendMessage({
      body: `✅ Đã tạo sticker ${modeText} thành công!`,
      attachment: fs.createReadStream(filePath)
    }, threadID, () => fs.unlink(filePath, () => {}), messageID);

  } catch (err) {
    console.error("[STICK] Lỗi xử lý:", err);
    api.sendMessage(`❌ Lỗi khi tạo sticker: ${err.message}`, threadID, messageID);
  }
};

module.exports.handleEvent = async ({ api, event }) => {
  const { senderID } = event;
  if (cache[senderID]) return module.exports.handleReply({ api, event });
};
