const OpenAI = require("openai");
const fs = require("fs-extra");
const path = require("path");
const moment = require("moment-timezone");

module.exports.config = {
  name: "ai-chat",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Nnam (based on OpenAI/Gemini code)",
  description: "Chat với AI (GPT-4o-mini), hỗ trợ simulate fine-tune",
  commandCategory: "AI",
  usages: "ai-chat <prompt> | ai-chat fine-tune <data> [model: gpt-4o-mini]",
  cooldowns: 10 // Tránh spam API
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-proj-your-key-here", // Dùng env var cho an toàn
});

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

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const cmd = args[0]?.toLowerCase();
  const prompt = args.slice(1).join(" ");
  const model = args[args.length - 1] || "gpt-4o-mini";

  if (!prompt) {
    return api.sendMessage(
      `🤖 [ AI-CHAT - GPT-4o-MINI ]\n\n` +
      `Sử dụng: ai-chat <prompt>\n` +
      `Ví dụ: ai-chat write a haiku about ai\n` +
      `ai-chat fine-tune "user: hello | ai: hi" gpt-4o-mini\n\n` +
      `⚠️ Giới hạn 100 token/prompt. Set OPENAI_API_KEY env var.`,
      threadID, messageID
    );
  }

  if (prompt.length > 200) return api.sendMessage("Prompt quá dài (>200 ký tự)!", threadID, messageID);

  try {
    if (cmd === "fine-tune") {
      // Simulate fine-tune: Lưu data như training file
      const userData = loadFineTuneData(senderID);
      userData.prompts.push({ user: prompt.split("|")[0], ai: prompt.split("|")[1] || "Default response" });
      userData.model = model;
      saveFineTuneData(senderID, userData);

      // "Train" by appending to system prompt
      const trainingPrompt = userData.prompts.map(p => `User: ${p.user}\nAI: ${p.ai}`).join("\n");
      const response = await openai.chat.completions.create({
        model: userData.model,
        messages: [
          { role: "system", content: `You are fine-tuned on: ${trainingPrompt}` },
          { role: "user", content: "Summarize your training data." }
        ],
      });

      return api.sendMessage(
        `✅ Fine-tune simulate thành công!\n` +
        `📚 Data lưu: ${userData.prompts.length} pairs\n` +
        `📝 Model: ${userData.model}\n` +
        `💡 Summary: ${response.choices[0].message.content.substring(0, 100)}...`,
        threadID, messageID
      );
    } else {
      // Normal chat
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: "user", content: prompt }
        ],
        max_tokens: 100, // Giới hạn để tiết kiệm
      });

      const aiResponse = response.choices[0].message.content;
      return api.sendMessage(
        `🤖 AI Response:\n"${aiResponse}"\n\n` +
        `📊 Model: ${model} | Tokens: ${response.usage.total_tokens}\n` +
        `💡 Prompt gốc: "${prompt}"`,
        threadID, messageID
      );
    }
  } catch (error) {
    console.error("[AI-CHAT] Lỗi:", error);
    return api.sendMessage(`❌ Lỗi AI: ${error.message}. Kiểm tra API key!`, threadID, messageID);
  }
};
