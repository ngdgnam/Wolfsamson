const OpenAI = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const GoogleTTS = require("google-tts-api"); // npm i google-tts-api
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
  name: "ai-chat",
  version: "2.1.0",
  hasPermssion: 0,
  credits: "Nnam(integrate OpenAI/Gemini/TTS voice reply)",
  description: "Chat AI đa model + voice reply (TTS)",
  commandCategory: "AI",
  usages: "ai-chat <prompt> [voice [lang: en/vi] [speed: normal/slow]] | ai-chat fine-tune <user|ai> [model]",
  cooldowns: 10
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "sk-proj-your-key" });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "AIzaSy-your-gemini-key");

const fineTuneDataPath = path.join(__dirname, "ai_finetune_data.json");
if (!fs.existsSync(fineTuneDataPath)) fs.writeFileSync(fineTuneDataPath, JSON.stringify({}, null, 2));

function loadFineTuneData(userID) {
    const allData = JSON.parse(fs.readFileSync(fineTuneDataPath, 'utf8'));
    return allData[userID] || { prompts: [], model: "gpt-4o-mini" };
}

function saveFineTuneData(userID, data) {
    const allData = JSON.parse(fs.readFileSync(fineTuneDataPath, 'utf8'));
    allData[userID] = data;
    fs.writeFileSync(fineTuneDataPath, JSON.stringify(allData, null, 2));
}

async function chatWithOpenAI(prompt, model = "gpt-4o-mini") {
  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
    });
    return { success: true, text: response.choices[0].message.content, model };
  } catch (e) {
    console.error("[OPENAI] Lỗi:", e);
    return { success: false, error: e.message };
  }
}

async function chatWithGemini(prompt) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    return { success: true, text: result.response.text(), model: "gemini-2.0-flash" };
  } catch (e) {
    console.error("[GEMINI] Lỗi:", e);
    return { success: false, error: e.message };
  }
}

async function textToVoice(text, lang = "en", speed = "normal") {
  const audioPath = path.join(__dirname, "cache", `voice-${Date.now()}.mp3`);
  try {
    const url = GoogleTTS.save(text, audioPath, lang);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait download
    return fs.createReadStream(audioPath);
  } catch (e) {
    console.error("[TTS] Lỗi:", e);
    return null;
  }
}

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const cmd = args[0]?.toLowerCase();
  const prompt = args.slice(1, -2).join(" "); // Prompt trước voice args
  const voiceArg = args[args.length - 2]; // voice
  const lang = args[args.length - 1] === "slow" ? "slow" : "en"; // Lang/speed
  const speed = args[args.length - 1] === "slow" ? "slow" : "normal";
  const model = args[args.length - 3] || "gpt-4o-mini"; // Model nếu fine-tune

  if (!prompt) {
    return api.sendMessage(
      `🤖 [ AI-CHAT + VOICE ]\n\n` +
      `Sử dụng: ai-chat <prompt> [voice [lang: en/vi] [speed: normal/slow]]\n` +
      `Ví dụ: ai-chat write a haiku about ai voice vi slow\n` +
      `ai-chat fine-tune "user: hello | ai: hi" gpt-4o-mini\n\n` +
      `Set OPENAI_API_KEY & GOOGLE_API_KEY trong .env!`,
      threadID, messageID
    );
  }

  if (prompt.length > 200) return api.sendMessage("Prompt quá dài (>200 ký tự)!", threadID, messageID);

  try {
    if (cmd === "fine-tune") {
      // Simulate fine-tune (như trước)
      const userData = loadFineTuneData(senderID);
      userData.prompts.push({ user: prompt.split("|")[0], ai: prompt.split("|")[1] || "Default response" });
      userData.model = model;
      saveFineTuneData(senderID, userData);

      const trainingPrompt = userData.prompts.map(p => `User: ${p.user}\nAI: ${p.ai}`).join("\n");
      const response = await chatWithOpenAI("Summarize your training data.", userData.model);

      return api.sendMessage(
        `✅ Fine-tune simulate thành công!\n` +
        `📚 Data lưu: ${userData.prompts.length} pairs\n` +
        `📝 Model: ${userData.model}\n` +
        `💡 Summary: ${response.text.substring(0, 100)}...`,
        threadID, messageID
      );
    } else {
      // Normal chat
      const response = await chatWithOpenAI(prompt, model);
      if (!response.success) {
        const gemResponse = await chatWithGemini(prompt);
        if (!gemResponse.success) return api.sendMessage(`❌ Lỗi AI: ${response.error || gemResponse.error}`, threadID, messageID);
        response.text = gemResponse.text;
        response.model = gemResponse.model;
      }

      let msg = `🤖 AI Response (${response.model}):\n"${response.text}"\n\n💡 Prompt gốc: "${prompt}"`;

      if (voiceArg === "voice") {
        const ttsLang = lang === "vi" ? "vi" : "en";
        const audioStream = await textToVoice(response.text, ttsLang, speed);
        if (audioStream) {
          msg += "\n🔊 Voice reply (giọng " + ttsLang + ", tốc độ " + speed + "):";
          return api.sendMessage({
            body: msg,
            attachment: audioStream
          }, threadID, () => fs.unlink(audioStream.path, () => {}), messageID);
        } else {
          msg += "\n❌ Lỗi TTS, chỉ text.";
        }
      }

      return api.sendMessage(msg, threadID, messageID);
    }
  } catch (error) {
    console.error("[AI-CHAT] Lỗi:", error);
    return api.sendMessage(`❌ Lỗi AI: ${error.message}. Kiểm tra API key!`, threadID, messageID);
  }
};
