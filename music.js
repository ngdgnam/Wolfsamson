const ytdl = require("ytdl-core");
const fs = require("fs-extra");
const path = require("path");
const { VoiceReceiver } = require("@discordjs/voice"); // Nếu dùng voice, nhưng cho FB thì simulate queue

module.exports.config = {
    name: "music",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Phát nhạc YT (nâng cấp: queue, skip, volume, stream)",
    commandCategory: "Media",
    usages: "music [play <link> | queue | skip | volume <1-100> | stop]",
    cooldowns: 5,
    dependencies: {
        "ytdl-core": "",
        "fs-extra": ""
    }
};

const queuePath = path.join(__dirname, "music_queue.json"); // Lưu queue per thread

if (!fs.existsSync(queuePath)) fs.writeFileSync(queuePath, JSON.stringify({}, null, 2));

function loadQueue(threadID) {
    const queues = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    return queues[threadID] || { songs: [], current: 0, volume: 50 };
}

function saveQueue(threadID, queue) {
    const queues = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    queues[threadID] = queue;
    fs.writeFileSync(queuePath, JSON.stringify(queues, null, 2));
}

async function downloadSong(url, threadID) {
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title;
    const duration = info.videoDetails.lengthSeconds;
    const thumbnail = info.videoDetails.thumbnails[0].url;

    const audioPath = path.join(__dirname, "cache", `music-${threadID}-${Date.now()}.mp3`);
    const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
    await new Promise((resolve, reject) => {
        stream.pipe(fs.createWriteStream(audioPath))
            .on('finish', resolve)
            .on('error', reject);
    });

    return { title, duration, thumbnail, path: audioPath };
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const cmd = args[0]?.toLowerCase();
    const queue = loadQueue(threadID);

    switch (cmd) {
        case "play":
            const url = args[1];
            if (!url) return api.sendMessage("Link YT không hợp lệ!", threadID, messageID);
            const song = await downloadSong(url, threadID);
            queue.songs.push(song);
            if (queue.current === 0 || queue.songs[queue.current - 1].path === undefined) queue.current = queue.songs.length - 1;
            saveQueue(threadID, queue);

            let playMsg = `🎵 Đã thêm vào queue:\n${song.title} (${Math.floor(song.duration / 60)}:${song.duration % 60})\n`;
            playMsg += `📊 Queue: ${queue.songs.length} bài | Vị trí: ${queue.songs.length}\n`;
            playMsg += `🔊 Volume: ${queue.volume}%\n`;
            if (queue.songs.length === 1) {
                playMsg += "▶️ Bắt đầu phát... (Simulate stream - real bot cần voice lib)";
                // Simulate stream: Gửi file hiện tại
                api.sendMessage({
                    body: playMsg,
                    attachment: fs.createReadStream(song.path)
                }, threadID, () => fs.unlinkSync(song.path), messageID);
            } else {
                api.sendMessage(playMsg, threadID, messageID);
            }
            break;

        case "queue":
            if (queue.songs.length === 0) return api.sendMessage("Queue trống!", threadID, messageID);
            let qMsg = "🎶 QUEUE NHẠC:\n\n";
            queue.songs.forEach((song, i) => {
                qMsg += `${i + 1}. ${song.title} (${Math.floor(song.duration / 60)}:${song.duration % 60})\n`;
            });
            qMsg += `\n🔊 Volume: ${queue.volume}% | Đang phát: ${queue.songs[queue.current]?.title || "Không"}`;
            return api.sendMessage(qMsg, threadID, messageID);

        case "skip":
            if (queue.songs.length === 0) return api.sendMessage("Không có nhạc để skip!", threadID, messageID);
            const currentSong = queue.songs[queue.current];
            if (currentSong) fs.unlinkSync(currentSong.path);
            queue.current++;
            if (queue.current >= queue.songs.length) {
                queue.current = 0;
                return api.sendMessage("⏭️ Đã skip hết queue. Queue lặp lại.", threadID, messageID);
            }
            const nextSong = queue.songs[queue.current];
            const nextPath = nextSong.path; // Assume pre-downloaded or stream
            api.sendMessage({
                body: `⏭️ Đã skip "${currentSong.title}". Tiếp theo: "${nextSong.title}"`,
                attachment: fs.createReadStream(nextPath)
            }, threadID, () => fs.unlinkSync(nextPath), messageID);
            break;

        case "volume":
            const vol = parseInt(args[1]);
            if (isNaN(vol) || vol < 1 || vol > 100) return api.sendMessage("Volume 1-100!", threadID, messageID);
            queue.volume = vol;
            saveQueue(threadID, queue);
            return api.sendMessage(`🔊 Volume mới: ${vol}% (áp dụng cho stream)`, threadID, messageID);

        case "stop":
            queue.songs.forEach(song => fs.unlinkSync(song.path));
            queue.songs = [];
            queue.current = 0;
            saveQueue(threadID, queue);
            return api.sendMessage("⏹️ Đã dừng nhạc và xóa queue.", threadID, messageID);

        default:
            return api.sendMessage(
                `🎵 [ MUSIC PLAYER - YT STREAM ]\n\n` +
                `Lệnh:\n• music play <link YT> - Thêm vào queue\n• music queue - Xem queue\n• music skip - Bỏ bài hiện tại\n• music volume <1-100> - Set volume\n• music stop - Dừng & xóa queue\n\n` +
                `Tích hợp stream (real bot cần voice lib như discord.js voice).`,
                threadID, messageID
            );
    }
};

// Simulate next song on finish (optional, dùng setTimeout trong play nếu cần)
module.exports.handleEvent = async function({ api, event }) {
    // Có thể thêm event để auto next khi finish stream (nếu dùng voice lib)
};
