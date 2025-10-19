const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "weather",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Dự báo thời tiết (nâng cấp: 5 ngày, cảnh báo, đa thành phố)",
    commandCategory: "Tiện ích",
    usages: "weather <thành phố> [VN/global]",
    cooldowns: 10, // Tránh spam API
    dependencies: {
        "axios": ""
    }
};

// API Key OpenWeatherMap (user cần thay bằng key miễn phí từ openweathermap.org)
const API_KEY = "YOUR_OPENWEATHER_API_KEY"; // Thay bằng key thực tế

const historyPath = path.path(__dirname, "weather_history.json");

function loadHistory(userID) {
    if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, JSON.stringify({}, null, 2));
    const allHist = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    allHist[userID] = allHist[userID] || [];
    return allHist;
}

function saveHistory(data) {
    fs.writeFileSync(historyPath, JSON.stringify(data, null, 2));
}

function addToHistory(userID, city, data) {
    const hist = loadHistory(userID);
    hist[userID].unshift({ city, data: { temp: data.main.temp, desc: data.weather[0].description }, time: new Date().toLocaleString('vi-VN') });
    hist[userID] = hist[userID].slice(0, 5); // Giữ 5 tra cứu gần nhất
    saveHistory(hist);
}

async function getWeather(city, country = "VN") {
    if (!API_KEY || API_KEY === "YOUR_OPENWEATHER_API_KEY") return "❌ Cần thiết lập API_KEY OpenWeatherMap!";
    try {
        // Current weather
        const currentRes = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city},${country}&appid=${API_KEY}&units=metric&lang=vi`);
        const current = currentRes.data;

        // 5-day forecast
        const forecastRes = await axios.get(`https://api.openweathermap.org/data/2.5/forecast?q=${city},${country}&appid=${API_KEY}&units=metric&lang=vi`);
        const forecast = forecastRes.data.list.slice(0, 24).filter((item, index) => index % 8 === 0); // 1 per day for 5 days

        return { current, forecast };
    } catch (e) {
        return null;
    }
}

function getWeatherIcon(desc) {
    const icons = {
        "trời trong": "☀️",
        "mây": "☁️",
        "mưa": "🌧️",
        "giông": "⛈️",
        "tuyết": "❄️",
        "sương mù": "🌫️"
    };
    return icons[desc.toLowerCase().includes ? Object.keys(icons).find(key => desc.includes(key)) : "🌤️"] || "🌤️";
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const city = args[0] || "Hanoi"; // Mặc định Hà Nội
    const country = args[1] || "VN";

    if (!city) return api.sendMessage("Sử dụng: weather <thành phố> [quốc gia]", threadID, messageID);

    const weatherData = await getWeather(city, country);
    if (!weatherData) return api.sendMessage(`❌ Không tìm thấy thời tiết cho "${city}"! Thử tên khác (e.g., Hanoi, Saigon).`, threadID, messageID);

    const { current, forecast } = weatherData;
    const temp = Math.round(current.main.temp);
    const feelsLike = Math.round(current.main.feels_like);
    const desc = current.weather[0].description;
    const icon = getWeatherIcon(desc);
    const humidity = current.main.humidity;
    const wind = current.wind.speed;

    // Cảnh báo
    let alert = "";
    if (current.weather[0].main === "Rain" && current.rain?.["1h"] > 5) alert = "⚠️ Cảnh báo: Mưa lớn sắp tới!";
    else if (current.weather[0].main === "Thunderstorm") alert = "⚠️ Cảnh báo: Có giông sét!";

    let msg = `🌤️ THỜI TIẾT ${city.toUpperCase()}\n\n`;
    msg += `${icon} Hiện tại: ${temp}°C (Cảm giác như: ${feelsLike}°C)\n`;
    msg += `💨 ${desc} | Độ ẩm: ${humidity}% | Gió: ${wind} m/s\n`;
    msg += `${alert}\n\n`;
    msg += `📅 DỰ BÁO 5 NGÀY:\n`;
    for (let i = 0; i < forecast.length; i++) {
        const day = forecast[i];
        const dayTemp = Math.round(day.main.temp);
        const dayIcon = getWeatherIcon(day.weather[0].description);
        const dayDesc = day.weather[0].description;
        const rainProb = day.pop ? `${Math.round(day.pop * 100)}% mưa` : "";
        msg += `Ngày ${i+1}: ${dayIcon} ${dayDesc} | ${dayTemp}°C ${rainProb}\n`;
    }

    addToHistory(senderID, city, { temp, desc });
    return api.sendMessage(msg, threadID, messageID);
};

// Thêm handleReply cho history nếu cần
module.exports.handleReply = async function({ api, event }) {
    const { threadID, messageID, senderID, body } = event;
    if (body.toLowerCase() === "history") {
        const hist = loadHistory(senderID);
        if (hist[senderID].length === 0) return api.sendMessage("Chưa tra cứu thời tiết nào!", threadID, messageID);
        let histMsg = "📜 LỊCH SỬ THỜI TIẾT (5 gần nhất):\n\n";
        for (let h of hist[senderID].slice(0, 5)) {
            histMsg += `• ${h.time}: ${h.city} - ${h.data.temp}°C, ${h.data.desc}\n`;
        }
        return api.sendMessage(histMsg, threadID, messageID);
    }
};
